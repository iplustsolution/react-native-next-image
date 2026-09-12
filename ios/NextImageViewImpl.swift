import Kingfisher
import UIKit

/// The native image view.
///
/// Loading rules, in order:
///  1. Props arrive one at a time, so nothing loads until `commitProps()` is
///     called at the end of the update. One prop update is one request.
///  2. Memory and disk are read first. A cached image appears without a network
///     connection even while the image is far outside the viewport.
///  3. `deferNetwork` (set by the JS `prefetchThreshold` tracker) restricts a
///     request to the caches. A miss is silent, because a deferred image that
///     is not cached yet has not failed.
///  4. Corner radius, circle cropping and tinting are view level, so changing
///     them never re-decodes or re-downloads the image.
///  5. `placeholder` and `defaultSource` are sources like any other: same
///     policy, same cache, and bundled assets work in release builds.
@objc(NextImageViewImpl)
public final class NextImageViewImpl: UIImageView {
    // MARK: Events

    @objc public var onNextImageLoadStart: ((NSDictionary) -> Void)?
    @objc public var onNextImageProgress: ((NSDictionary) -> Void)?
    @objc public var onNextImageLoad: ((NSDictionary) -> Void)?
    @objc public var onNextImageError: ((NSDictionary) -> Void)?
    @objc public var onNextImageLoadEnd: ((NSDictionary) -> Void)?

    // MARK: Props

    /// `{ uri, headers: [{ name, value }], priority, cache, cacheDuration, cacheKey, bundled }`.
    /// One dictionary rather than seven props, so the Fabric component view
    /// and the legacy view manager hand over exactly the same shape.
    @objc public var source: NSDictionary? { didSet { propsDirty = true } }
    @objc public var defaultSource: NSDictionary? { didSet { propsDirty = true } }
    @objc public var placeholderSource: NSDictionary? { didSet { propsDirty = true } }
    @objc public var resizeMode: String = "cover" { didSet { propsDirty = true } }
    @objc public var transition: String = "none" { didSet { propsDirty = true } }
    @objc public var transitionDuration: Double = 300
    @objc public var borderRadiusValue: CGFloat = 0 { didSet { propsDirty = true } }
    @objc public var isCircle: Bool = false { didSet { propsDirty = true } }
    @objc public var downsample: Bool = true { didSet { propsDirty = true } }
    @objc public var grayscale: Bool = false { didSet { propsDirty = true } }
    @objc public var blurRadiusValue: CGFloat = 0 { didSet { propsDirty = true } }
    @objc public var tintColorValue: UIColor? { didSet { propsDirty = true } }
    @objc public var deferNetwork: Bool = false { didSet { propsDirty = true } }
    @objc public var retryCount: Int = 2
    @objc public var retryDelay: Double = 1000

    // MARK: State

    private var propsDirty = false
    private var task: DownloadTask?
    private var secondaryTask: DownloadTask?
    private var loadedSignature: String?
    private var pendingSignature: String?
    private var mainImageLoaded = false
    private var requestStartedAt = Date()
    private var lastLayoutSize: CGSize = .zero
    /// Identifies the latest `loadImage` call. Kingfisher reports a cancelled
    /// task asynchronously, by which time a newer task may own `task` and
    /// `pendingSignature`; the stale completion must not touch them.
    private var loadToken = 0

    public override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        contentMode = .scaleAspectFill
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        applyCornerRadius()

        guard downsample, bounds.size != lastLayoutSize, bounds.size != .zero else { return }
        let previousSize = lastLayoutSize
        lastLayoutSize = bounds.size

        if previousSize == .zero {
            // First real layout: a request that has not resolved yet can now
            // size its decode to the view. An identical in-flight request is
            // recognised and left alone.
            if !mainImageLoaded {
                propsDirty = true
                commitProps()
            }
        } else if mainImageLoaded, hasGrown(beyond: bounds.size) {
            // Only a view that grew needs a new decode; a shrunken view can
            // keep displaying the larger bitmap it already has.
            propsDirty = true
            commitProps()
        }
    }

    private func hasGrown(beyond size: CGSize) -> Bool {
        guard let image else { return true }
        let scale = UIScreen.main.scale
        return image.size.width * image.scale < size.width * scale - 1
            || image.size.height * image.scale < size.height * scale - 1
    }

    /// Decode sizes are bucketed so that a one point layout change does not
    /// invalidate the rendered image.
    private func decodeSizeKey() -> String {
        guard downsample, bounds.size != .zero else { return "orig" }
        let bucket: (CGFloat) -> Int = { Int((($0 / 32).rounded(.up)) * 32) }
        return "\(bucket(bounds.width))x\(bucket(bounds.height))"
    }

    /// Called once per update transaction, after every prop has been set.
    @objc public func commitProps() {
        guard propsDirty else { return }
        propsDirty = false

        applyContentMode()
        applyCornerRadius()
        tintColor = tintColorValue

        let request = NextImageRequest(
            source: source as? [String: Any],
            config: NextImageConfigStore.shared.current
        )

        if let blocked = request.blocked {
            cancelRequests()
            loadedSignature = nil
            mainImageLoaded = false
            showDefaultSource()
            // The uri is redacted: an error payload must not carry a signed
            // query string or a token.
            let rawUri = source?["uri"] as? String
            let described = rawUri.map { "\(blocked.message) (\(NextImageSecurity.redactUri($0)))" }
                ?? blocked.message
            emitError(message: described, code: blocked.code, status: 0)
            onNextImageLoadEnd?([:])
            return
        }

        guard request.uri != nil else {
            cancelRequests()
            loadedSignature = nil
            mainImageLoaded = false
            showDefaultSource()
            return
        }

        guard let kingfisherSource = request.kingfisherSource else {
            // A uri that passed the policy but cannot be turned into a request:
            // an undecodable `data:` payload or an unparseable url.
            cancelRequests()
            loadedSignature = nil
            mainImageLoaded = false
            showDefaultSource()
            emitError(message: "Image source uri could not be loaded.", code: "DECODE", status: 0)
            onNextImageLoadEnd?([:])
            return
        }

        // Before the first layout the decode size is unknown. Loading now and
        // again after layout would cost a cancelled request and a second
        // onLoadStart, so the load waits for `layoutSubviews`, which commits.
        if downsample, bounds.size == .zero, !mainImageLoaded {
            propsDirty = true
            return
        }

        let signature = "\(request.signature)|\(renderSignature())"
        let pendingKey = "\(signature)|defer=\(deferNetwork)"

        if signature == loadedSignature, mainImageLoaded {
            return
        }
        if pendingKey == pendingSignature, task != nil {
            return
        }

        loadImage(
            request: request,
            kingfisherSource: kingfisherSource,
            signature: signature,
            pendingKey: pendingKey
        )
    }

    /// Not named `load`: `NSObject` already has a static `load()`.
    private func loadImage(
        request: NextImageRequest,
        kingfisherSource: Source,
        signature: String,
        pendingKey: String
    ) {
        cancelRequests()
        pendingSignature = pendingKey
        requestStartedAt = Date()
        loadToken += 1
        let token = loadToken

        if !mainImageLoaded {
            showPlaceholder(for: request)
        }

        var processors: [any ImageProcessor] = []
        if grayscale {
            processors.append(BlackWhiteProcessor())
        }
        if blurRadiusValue > 0 {
            processors.append(BlurImageProcessor(blurRadius: blurRadiusValue))
        }

        let built = request.build(
            deferNetwork: deferNetwork,
            targetSize: downsample && bounds.size != .zero ? bounds.size : nil,
            processors: processors
        )
        var options = built.options
        if let identifier = built.processorIdentifier {
            NextImageEngine.shared.rememberProcessor(identifier, forKey: request.cacheKey)
        }

        if tintColorValue != nil {
            options.append(.imageModifier(RenderingModeImageModifier(renderingMode: .alwaysTemplate)))
        }
        if transition == "fade", transitionDuration > 0 {
            options.append(.transition(.fade(transitionDuration / 1000.0)))
        }
        if retryCount > 0 {
            options.append(.retryStrategy(NextImageRetryStrategy(
                maxRetryCount: retryCount,
                initialDelay: max(retryDelay, 0) / 1000.0
            )))
        }
        if image != nil {
            options.append(.keepCurrentImageWhileLoading)
        }

        // Kingfisher reports `.none` when it rebuilds a processed variant from
        // the original on disk, which would read as a download. Where the
        // original lives right now is what decides the reported cache type.
        let originalCacheType = request.isLocal
            ? CacheType.none
            : ImageCache.default.imageCachedType(forKey: request.cacheKey)

        onNextImageLoadStart?([:])

        task = kf.setImage(
            with: kingfisherSource,
            placeholder: nil,
            options: options,
            progressBlock: { [weak self] received, total in
                self?.onNextImageProgress?([
                    "loaded": Int(received),
                    "total": Int(max(total, 0)),
                ])
            },
            completionHandler: { [weak self] result in
                guard let self, token == self.loadToken else { return }
                self.task = nil
                self.pendingSignature = nil

                switch result {
                case let .success(value):
                    self.loadedSignature = signature
                    self.mainImageLoaded = true
                    self.secondaryTask?.cancel()
                    self.secondaryTask = nil
                    self.applyCustomTransition()
                    self.onNextImageLoad?([
                        "width": value.image.size.width,
                        "height": value.image.size.height,
                        "cacheType": NextImageViewImpl.cacheTypeName(
                            value.cacheType,
                            request: request,
                            originalCacheType: originalCacheType
                        ),
                        "elapsed": Int(Date().timeIntervalSince(self.requestStartedAt) * 1000),
                    ])
                    self.onNextImageLoadEnd?([:])

                case let .failure(error):
                    // A deferred request that missed the cache has not failed.
                    if self.deferNetwork, error.isCacheMiss {
                        return
                    }
                    // A request replaced by a newer one reports through that one.
                    if error.isTaskCancelled || error.isSuperseded {
                        return
                    }
                    // Kingfisher has already exhausted `retryCount` attempts.
                    let status = error.httpStatusCode
                    // The previous image, if any, is not what the caller asked for any more.
                    self.loadedSignature = nil
                    self.mainImageLoaded = false
                    self.showDefaultSource()
                    self.emitError(
                        message: NextImageViewImpl.errorMessage(for: error),
                        code: NextImageViewImpl.errorCode(for: error),
                        status: status,
                        // A transient failure is worth retrying by hand; a 4xx or a cache miss is not.
                        retryable: !(400 ... 499).contains(status) && !error.isCacheMiss
                    )
                    self.onNextImageLoadEnd?([:])
                }
            }
        )
    }

    /// The placeholder is a separate request so it can come from cache without
    /// blocking the real image, and it is dropped as soon as the real image lands.
    private func showPlaceholder(for request: NextImageRequest) {
        secondaryTask?.cancel()
        secondaryTask = nil
        let placeholder = NextImageRequest(
            source: placeholderSource as? [String: Any],
            config: NextImageConfigStore.shared.current
        )
        guard placeholder.uri != nil, placeholder.uri != request.uri,
              let kingfisherSource = placeholder.kingfisherSource
        else {
            return
        }
        secondaryTask = retrieveSecondary(placeholder, kingfisherSource)
    }

    private func showDefaultSource() {
        secondaryTask?.cancel()
        secondaryTask = nil
        let fallback = NextImageRequest(
            source: defaultSource as? [String: Any],
            config: NextImageConfigStore.shared.current
        )
        guard fallback.uri != nil, let kingfisherSource = fallback.kingfisherSource else {
            if !mainImageLoaded {
                image = nil
            }
            return
        }
        secondaryTask = retrieveSecondary(fallback, kingfisherSource)
    }

    /// A placeholder or default image: sized to the view, never deferred, and
    /// shown only while no real image is on screen.
    private func retrieveSecondary(_ request: NextImageRequest, _ source: Source) -> DownloadTask? {
        let built = request.build(
            deferNetwork: false,
            targetSize: downsample && bounds.size != .zero ? bounds.size : nil,
            processors: []
        )
        if let identifier = built.processorIdentifier {
            NextImageEngine.shared.rememberProcessor(identifier, forKey: request.cacheKey)
        }
        return KingfisherManager.shared.retrieveImage(with: source, options: built.options) { [weak self] result in
            guard case let .success(value) = result else { return }
            DispatchQueue.main.async {
                guard let self, !self.mainImageLoaded else { return }
                self.image = value.image
            }
        }
    }

    private func applyContentMode() {
        switch resizeMode {
        case "contain": contentMode = .scaleAspectFit
        case "stretch": contentMode = .scaleToFill
        case "center": contentMode = .center
        default: contentMode = .scaleAspectFill
        }
    }

    private func applyCornerRadius() {
        if isCircle {
            layer.cornerRadius = min(bounds.width, bounds.height) / 2
        } else {
            layer.cornerRadius = max(borderRadiusValue, 0)
        }
        layer.masksToBounds = true
    }

    private func applyCustomTransition() {
        let duration = transitionDuration / 1000.0
        guard duration > 0 else { return }

        switch transition {
        case "slide":
            transform = CGAffineTransform(translationX: 0, y: 50)
            UIView.animate(withDuration: duration) { self.transform = .identity }
        case "scale":
            transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
            UIView.animate(withDuration: duration) { self.transform = .identity }
        case "gravity":
            transform = CGAffineTransform(translationX: 0, y: -bounds.height / 2)
            UIView.animate(
                withDuration: duration,
                delay: 0,
                usingSpringWithDamping: 0.6,
                initialSpringVelocity: 0.5,
                options: [],
                animations: { self.transform = .identity }
            )
        default:
            break
        }
    }

    /// View level rendering choices that require a new decode.
    private func renderSignature() -> String {
        [
            resizeMode,
            decodeSizeKey(),
            String(describing: downsample),
            String(describing: grayscale),
            String(format: "%.1f", blurRadiusValue),
            tintColorValue == nil ? "notint" : "tint",
        ].joined(separator: ",")
    }

    private func emitError(
        message: String,
        code: String,
        status: Int,
        retryable: Bool = false
    ) {
        onNextImageError?([
            "error": message,
            "code": code,
            "status": status,
            "retryable": retryable,
        ])
    }

    private func cancelRequests() {
        task?.cancel()
        task = nil
        secondaryTask?.cancel()
        secondaryTask = nil
        pendingSignature = nil
    }

    /// Called when the host view is dropped or recycled.
    @objc public func cleanup() {
        cancelRequests()
        kf.cancelDownloadTask()
        image = nil
        loadedSignature = nil
        mainImageLoaded = false
        lastLayoutSize = .zero
        source = nil
        placeholderSource = nil
        defaultSource = nil
        propsDirty = false
    }

    /// The legacy architecture calls this after a prop update; the Fabric
    /// component view calls `commitProps()` directly.
    @objc public func didSetProps(_ changedProps: [String]) {
        commitProps()
    }

    private static func cacheTypeName(
        _ cacheType: CacheType,
        request: NextImageRequest,
        originalCacheType: CacheType
    ) -> String {
        switch cacheType {
        case .memory: return "memory"
        case .disk: return "disk"
        case .none:
            // `.none` covers three cases: a real download, a processed variant
            // rebuilt from the cached original, and a local file or data uri.
            if request.cache == "reload" { return "network" }
            if request.isLocal { return "disk" }
            switch originalCacheType {
            case .memory: return "memory"
            case .disk: return "disk"
            default: return "network"
            }
        @unknown default: return "unknown"
        }
    }

    /// Kingfisher's descriptions dump the whole `NSHTTPURLResponse`; the
    /// Android side reports "HTTP 404", so this does the same.
    private static func errorMessage(for error: KingfisherError) -> String {
        if let status = error.httpStatusCodeOrNil {
            return "HTTP \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))"
        }
        if error.isCacheMiss {
            return "Image is not in the cache."
        }
        return error.localizedDescription
    }

    private static func errorCode(for error: KingfisherError) -> String {
        if let status = error.httpStatusCodeOrNil {
            return status >= 500 ? "HTTP_SERVER" : "HTTP_CLIENT"
        }
        if error.isCacheMiss { return "CACHE_MISS" }
        switch error {
        case .requestError, .responseError: return "NETWORK"
        case .processorError, .imageSettingError: return "DECODE"
        default: return "UNKNOWN"
        }
    }
}

extension KingfisherError {
    /// True when the image simply was not in the cache, which is the expected
    /// outcome of a cache-only request rather than a failure.
    var isCacheMiss: Bool {
        if case let .cacheError(reason) = self {
            if case .imageNotExisting = reason { return true }
        }
        return false
    }

    /// Kingfisher's way of saying a newer `setImage` call took over the view.
    var isSuperseded: Bool {
        if case let .imageSettingError(reason) = self {
            if case .notCurrentSourceTask = reason { return true }
        }
        return false
    }

    var httpStatusCodeOrNil: Int? {
        if case let .responseError(reason) = self,
           case let .invalidHTTPStatusCode(response) = reason
        {
            return response.statusCode
        }
        return nil
    }

    var httpStatusCode: Int { httpStatusCodeOrNil ?? 0 }
}

/// Exponential backoff, matching the Android side.
///
/// Kingfisher's own `DelayRetryStrategy` only offers a constant or linear
/// interval, and it retries any response error including a 4xx. A request the
/// server rejected will not start succeeding, so those stop immediately.
struct NextImageRetryStrategy: RetryStrategy {
    let maxRetryCount: Int
    /// Delay before the first retry, in seconds. It doubles per attempt.
    let initialDelay: TimeInterval
    /// No single wait is longer than this, however many attempts have failed.
    static let maximumDelay: TimeInterval = 60

    func retry(
        context: RetryContext,
        retryHandler: @escaping @Sendable (RetryDecision) -> Void
    ) {
        guard context.retriedCount < maxRetryCount else {
            retryHandler(.stop)
            return
        }
        guard !context.error.isTaskCancelled else {
            retryHandler(.stop)
            return
        }
        if let status = context.error.httpStatusCodeOrNil, (400 ... 499).contains(status) {
            retryHandler(.stop)
            return
        }
        // Anything that is not a response error is a cache miss or a decode
        // failure, and retrying those cannot help either.
        guard case KingfisherError.responseError = context.error else {
            retryHandler(.stop)
            return
        }

        let delay = min(
            initialDelay * pow(2, Double(context.retriedCount)),
            NextImageRetryStrategy.maximumDelay
        )
        if delay <= 0 {
            retryHandler(.retry(userInfo: nil))
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                retryHandler(.retry(userInfo: nil))
            }
        }
    }
}
