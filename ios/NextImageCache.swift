import CryptoKit
import Foundation
import Kingfisher

/// Holds the active configuration. Reads happen on the main thread for every
/// image load and writes only from `NextImage.configure`, so a plain lock is
/// enough and avoids a queue hop per image.
@objc(NextImageConfigStore)
public final class NextImageConfigStore: NSObject {
    @objc public static let shared = NextImageConfigStore()

    private let lock = NSLock()
    private var value = NextImageConfig()

    public var current: NextImageConfig {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    /// - Returns: true when the change requires the cache or downloader to be reconfigured.
    @objc(applyWithOptions:)
    public func apply(options: [String: Any]) -> Bool {
        lock.lock()
        let before = value
        value.apply(options: options)
        let after = value
        lock.unlock()
        return NextImageConfig.requiresLoaderRebuild(before, after)
    }

    /// 0 keeps the current value for a tier.
    @objc(updateCacheLimitsWithMemoryBytes:diskBytes:)
    public func updateCacheLimits(memoryBytes: UInt, diskBytes: UInt) {
        lock.lock()
        if memoryBytes > 0 {
            value.memoryCacheBytes = max(memoryBytes, NextImageConfig.minMemoryCacheBytes)
        }
        if diskBytes > 0 {
            value.diskCacheBytes = max(diskBytes, NextImageConfig.minDiskCacheBytes)
        }
        lock.unlock()
    }

    public func pins(forHost host: String) -> [String] {
        for (pattern, pins) in current.certificatePins
            where NextImageSecurity.hostMatches(host, pattern: pattern)
        {
            return pins
        }
        return []
    }

    public func hasAnyPins() -> Bool {
        !current.certificatePins.isEmpty
    }

    /// Test helper.
    public func reset() {
        lock.lock()
        value = NextImageConfig()
        lock.unlock()
    }
}

/// Owns the Kingfisher cache and downloader configuration, plus the cache
/// queries behind the JS cache APIs.
@objc(NextImageEngine)
public final class NextImageEngine: NSObject {
    @objc public static let shared = NextImageEngine()

    /// `authenticationChallengeResponder` is weak, so the responder lives here.
    private var pinningResponder: NextImagePinningResponder?
    /// Prefetchers are held until they finish so they are not deallocated mid-flight.
    private var activePrefetchers: [UUID: ImagePrefetcher] = [:]
    private let prefetcherLock = NSLock()
    /// Processor identifiers used per cache key. Kingfisher stores a processed
    /// variant under `key@identifier` and cannot enumerate them, so they are
    /// remembered here for `removeFromCache`.
    private var processedVariants: [String: Set<String>] = [:]
    private let variantLock = NSLock()

    override public init() {
        super.init()
        configure()
    }

    /// Applies the current configuration to Kingfisher's shared cache and downloader.
    @objc public func configure() {
        let config = NextImageConfigStore.shared.current
        let cache = ImageCache.default
        let downloader = ImageDownloader.default

        if config.memoryCacheBytes > 0 {
            cache.memoryStorage.config.totalCostLimit = Int(config.memoryCacheBytes)
        }
        cache.diskStorage.config.sizeLimit = config.diskCacheBytes
        // Per-request expiration overrides this; it is the fallback for a
        // request that does not set one.
        cache.diskStorage.config.expiration = .days(7)

        downloader.downloadTimeout = config.requestTimeoutMs / 1000.0

        if NextImageConfigStore.shared.hasAnyPins() {
            let responder = NextImagePinningResponder()
            pinningResponder = responder
            downloader.authenticationChallengeResponder = responder
        } else if pinningResponder != nil {
            pinningResponder = nil
            downloader.authenticationChallengeResponder = nil
        }
    }

    /// Records that `identifier` was used to render `key`, so the variant can
    /// be dropped together with the original.
    func rememberProcessor(_ identifier: String, forKey key: String) {
        guard !identifier.isEmpty else { return }
        variantLock.lock()
        processedVariants[key, default: []].insert(identifier)
        variantLock.unlock()
    }

    private func takeVariants(forKey key: String) -> Set<String> {
        variantLock.lock()
        defer { variantLock.unlock() }
        return processedVariants.removeValue(forKey: key) ?? []
    }

    @objc public func clearMemoryCache() {
        ImageCache.default.clearMemoryCache()
    }

    @objc(clearDiskCacheWithCompletion:)
    public func clearDiskCache(completion: @escaping @Sendable () -> Void) {
        ImageCache.default.clearDiskCache(completion: completion)
        // Memory is not cleared here, but a variant list only matters for a
        // targeted removal, and anything left in memory expires on its own.
    }

    /// The key a view would look up for this uri, matching `NextImageRequest`.
    static func cacheKey(uri: String, cacheKey: String) -> String {
        cacheKey.isEmpty ? NextImageRequest.defaultCacheKey(for: uri) : cacheKey
    }

    @objc(isCachedWithUri:cacheKey:)
    public func isCached(uri: String, cacheKey: String) -> Bool {
        ImageCache.default.isCached(forKey: NextImageEngine.cacheKey(uri: uri, cacheKey: cacheKey))
    }

    /// Removes the original bytes and every processed variant rendered from them.
    @objc(removeFromCacheWithUri:cacheKey:completion:)
    public func removeFromCache(
        uri: String,
        cacheKey: String,
        completion: @escaping @Sendable (Bool) -> Void
    ) {
        let key = NextImageEngine.cacheKey(uri: uri, cacheKey: cacheKey)
        let cache = ImageCache.default
        let variants = takeVariants(forKey: key)

        var existed = cache.isCached(forKey: key)
        let group = DispatchGroup()
        for identifier in variants {
            if cache.isCached(forKey: key, processorIdentifier: identifier) {
                existed = true
            }
            group.enter()
            cache.removeImage(forKey: key, processorIdentifier: identifier) { group.leave() }
        }
        group.enter()
        cache.removeImage(forKey: key) { group.leave() }

        let removed = existed
        group.notify(queue: .global(qos: .utility)) {
            completion(removed)
        }
    }

    @objc(diskCacheSizeWithCompletion:)
    public func diskCacheSize(completion: @escaping @Sendable (Double) -> Void) {
        ImageCache.default.calculateDiskStorageSize { result in
            switch result {
            case let .success(size):
                completion(Double(size))
            case .failure:
                completion(0)
            }
        }
    }

    @objc public func memoryCacheSize() -> Double {
        Double(ImageCache.default.memoryStorage.totalCacheCost())
    }

    /// Warms the cache from a list of urls. Blocked sources are skipped, and
    /// `completion` receives the number of images on disk once the batch is done.
    @objc(prefetchWithUris:priority:completion:)
    public func prefetch(
        uris: [String],
        priority: String,
        completion: @escaping @Sendable (Int) -> Void
    ) {
        let config = NextImageConfigStore.shared.current
        var urls: [URL] = []

        for uri in uris {
            guard case let .allowed(allowedUri, _) = NextImageSecurity.validateUri(uri, config: config),
                  let url = URL(string: allowedUri)
            else {
                continue
            }
            urls.append(url)
        }

        guard !urls.isEmpty else {
            completion(0)
            return
        }

        // Same lifetime a view gives a plain `{ uri }` source, so a prefetched
        // entry is not treated as expired before the view's would be.
        let options: KingfisherOptionsInfo = [
            .downloadPriority(NextImageEngine.downloadPriority(for: priority)),
            .diskCacheExpiration(.never),
            .diskCacheAccessExtendingExpiration(.none),
            .redirectHandler(NextImageRedirectHandler.shared),
            .backgroundDecode,
        ]
        run { done in
            ImagePrefetcher(urls: urls, options: options, completionHandler: { skipped, _, completed in
                // Skipped means "already cached", which is just as good.
                completion(skipped.count + completed.count)
                done()
            })
        }
    }

    /// Warms the cache from full source objects, including headers and TTL, so
    /// a preloaded image lands under the key the view will look up.
    @objc(preloadWithSources:)
    public func preload(sources: [[String: Any]]) {
        let config = NextImageConfigStore.shared.current

        for source in sources {
            let request = NextImageRequest(source: source, config: config)
            guard let kingfisherSource = request.kingfisherSource else { continue }
            let options = request.options(deferNetwork: false, targetSize: nil, processors: [])
            run { done in
                ImagePrefetcher(
                    sources: [kingfisherSource],
                    options: options,
                    completionHandler: { _, _, _ in done() }
                )
            }
        }
    }

    /// Keeps the prefetcher alive for the duration of the work and releases it
    /// when Kingfisher reports the batch finished. `make` receives the
    /// callback to invoke from whichever completion handler shape it uses.
    private func run(_ make: (@escaping @Sendable () -> Void) -> ImagePrefetcher) {
        let token = UUID()
        let prefetcher = make { [weak self] in
            guard let self else { return }
            self.prefetcherLock.lock()
            self.activePrefetchers.removeValue(forKey: token)
            self.prefetcherLock.unlock()
        }

        prefetcherLock.lock()
        activePrefetchers[token] = prefetcher
        prefetcherLock.unlock()
        prefetcher.start()
    }

    static func downloadPriority(for priority: String) -> Float {
        switch priority {
        case "low": return 0.25
        case "high": return 1.0
        default: return URLSessionTask.defaultPriority
        }
    }
}

/// Certificate pinning.
///
/// Pins are SPKI SHA-256 digests in the same `sha256/<base64>` format OkHttp
/// and `openssl` use, so one pin string is valid on both platforms. A host with
/// pins configured fails closed: if the chain does not match, the connection is
/// refused rather than falling back to system trust alone.
enum NextImageCertificatePinning {
    /// ASN.1 SubjectPublicKeyInfo prefixes. `SecKeyCopyExternalRepresentation`
    /// returns the bare key, while the digest is defined over the full SPKI
    /// structure, so the matching header has to be prepended.
    private static let rsa2048Header: [UInt8] = [
        0x30, 0x82, 0x01, 0x22, 0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86, 0x48, 0x86,
        0xF7, 0x0D, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0F, 0x00,
    ]
    private static let rsa4096Header: [UInt8] = [
        0x30, 0x82, 0x02, 0x22, 0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86, 0x48, 0x86,
        0xF7, 0x0D, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0F, 0x00,
    ]
    private static let ecDsaSecp256r1Header: [UInt8] = [
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02,
        0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03,
        0x42, 0x00,
    ]
    private static let ecDsaSecp384r1Header: [UInt8] = [
        0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02,
        0x01, 0x06, 0x05, 0x2B, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00,
    ]

    static func header(keyType: String, keySizeInBits: Int) -> [UInt8]? {
        if keyType == (kSecAttrKeyTypeRSA as String) {
            switch keySizeInBits {
            case 2048: return rsa2048Header
            case 4096: return rsa4096Header
            default: return nil
            }
        }
        if keyType == (kSecAttrKeyTypeECSECPrimeRandom as String) {
            switch keySizeInBits {
            case 256: return ecDsaSecp256r1Header
            case 384: return ecDsaSecp384r1Header
            default: return nil
            }
        }
        return nil
    }

    static func spkiPin(for certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate),
              let keyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
              let attributes = SecKeyCopyAttributes(publicKey) as? [String: Any],
              let keyType = attributes[kSecAttrKeyType as String] as? String,
              let keySize = attributes[kSecAttrKeySizeInBits as String] as? Int,
              let prefix = header(keyType: keyType, keySizeInBits: keySize)
        else {
            return nil
        }

        var spki = Data(prefix)
        spki.append(keyData)
        return "sha256/" + Data(SHA256.hash(data: spki)).base64EncodedString()
    }

    /// True when any certificate in the chain matches any configured pin.
    static func chainMatches(trust: SecTrust, pins: [String]) -> Bool {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate] else {
            return false
        }
        for certificate in chain {
            if let pin = spkiPin(for: certificate), pins.contains(pin) {
                return true
            }
        }
        return false
    }
}

final class NextImagePinningResponder: NSObject, AuthenticationChallengeResponsible {
    func downloader(
        _ downloader: ImageDownloader,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        evaluate(challenge)
    }

    func downloader(
        _ downloader: ImageDownloader,
        task: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        evaluate(challenge)
    }

    private func evaluate(
        _ challenge: URLAuthenticationChallenge
    ) -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust
        else {
            return (.performDefaultHandling, nil)
        }

        let pins = NextImageConfigStore.shared.pins(forHost: challenge.protectionSpace.host)
        if pins.isEmpty {
            return (.performDefaultHandling, nil)
        }

        // System trust first: pinning adds a constraint, it never replaces
        // expiry, hostname and chain validation.
        guard SecTrustEvaluateWithError(trust, nil) else {
            return (.cancelAuthenticationChallenge, nil)
        }
        guard NextImageCertificatePinning.chainMatches(trust: trust, pins: pins) else {
            return (.cancelAuthenticationChallenge, nil)
        }
        return (.useCredential, URLCredential(trust: trust))
    }
}
