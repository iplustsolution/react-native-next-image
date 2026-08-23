import Foundation
import Kingfisher
import UIKit

@objc public class NextImageSwift: NSObject {
    @objc public static let shared = NextImageSwift()

    @objc public func preload(urls: [URL]) {
        let prefetcher = ImagePrefetcher(urls: urls)
        prefetcher.start()
    }

    @objc public func clearMemoryCache() {
        ImageCache.default.clearMemoryCache()
    }

    @objc public func clearDiskCache(completion: @escaping () -> Void) {
        ImageCache.default.clearDiskCache {
            completion()
        }
    }
}

@objc(NextImageViewImpl)
public class NextImageViewImpl: UIImageView {
    private var currentTask: DownloadTask?

    @objc public var onNextImageLoadStart: ((NSDictionary) -> Void)?
    @objc public var onNextImageProgress: ((NSDictionary) -> Void)?
    @objc public var onNextImageLoad: ((NSDictionary) -> Void)?
    @objc public var onNextImageError: ((NSDictionary) -> Void)?
    @objc public var onNextImageLoadEnd: ((NSDictionary) -> Void)?

    @objc public var source: [String: Any]? {
        didSet {
            reloadImage()
        }
    }

    @objc public var defaultSource: String? {
        didSet {
            reloadImage()
        }
    }

    @objc public var resizeMode: String = "cover" {
        didSet {
            updateContentMode()
            reloadImage()
        }
    }

    @objc public var blurRadius: CGFloat = 0 {
        didSet {
            reloadImage()
        }
    }

    @objc public var transition: String = "none" {
        didSet {
            reloadImage()
        }
    }

    @objc public var transitionDuration: CGFloat = 0.3

    @objc public var borderRadius: CGFloat = 0 {
        didSet {
            layer.cornerRadius = borderRadius
            layer.masksToBounds = borderRadius > 0
        }
    }

    @objc public var isCircle: Bool = false {
        didSet {
            setNeedsLayout()
        }
    }

    @objc public var grayscale: Bool = false {
        didSet {
            reloadImage()
        }
    }

    @objc public var placeholder: String? {
        didSet {
            reloadImage()
        }
    }

    @objc public var downsample: Bool = true {
        didSet {
            reloadImage()
        }
    }

    @objc public var tintColorProp: UIColor? {
        didSet {
            if let tint = tintColorProp {
                self.tintColor = tint
                self.image = self.image?.withRenderingMode(.alwaysTemplate)
            } else {
                self.image = self.image?.withRenderingMode(.alwaysOriginal)
            }
        }
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        if isCircle {
            layer.cornerRadius = frame.size.width / 2
            layer.masksToBounds = true
        }
    }

    private func updateContentMode() {
        switch resizeMode {
        case "contain":
            contentMode = .scaleAspectFit
        case "stretch":
            contentMode = .scaleToFill
        case "center":
            contentMode = .center
        default:
            contentMode = .scaleAspectFill
        }
    }

    private func reloadImage() {
        onNextImageLoadStart?([:])

        guard let source = source, let uri = source["uri"] as? String, let url = URL(string: uri) else {
            if let defaultSource = defaultSource, let defaultUrl = URL(string: defaultSource) {
                kf.setImage(with: defaultUrl)
                onNextImageLoadEnd?([:])
            } else {
                kf.setImage(with: nil)
                onNextImageLoadEnd?([:])
            }
            return
        }

        var options: KingfisherOptionsInfo = []

        // Headers
        if let headers = source["headers"] as? [[String: String]] {
            let modifier = AnyModifier { request in
                var r = request
                for header in headers {
                    if let name = header["name"], let value = header["value"] {
                        r.setValue(value, forHTTPHeaderField: name)
                    }
                }
                return r
            }
            options.append(.requestModifier(modifier))
        }

        // Cache Duration
        let cacheDuration = source["cacheDuration"] as? Double ?? 10080.0
        options.append(.expiration(.seconds(cacheDuration * 60)))

        // Downsampling
        if downsample {
            let size = self.bounds.size
            if size.width > 0 && size.height > 0 {
                options.append(.downsampling(size: size))
            }
        }

        // Caching
        if let cache = source["cache"] as? String {
            switch cache {
            case "cacheOnly":
                options.append(.onlyFromCache)
            case "immutable":
                options.append(.cacheSerializer(DefaultCacheSerializer.default))
            default:
                break
            }
        }

        // Priority
        if let priority = source["priority"] as? String {
            switch priority {
            case "low":
                options.append(.downloadPriority(URLSessionTask.lowPriority))
            case "high":
                options.append(.downloadPriority(URLSessionTask.highPriority))
            default:
                options.append(.downloadPriority(URLSessionTask.defaultPriority))
            }
        }

        // Transitions
        if transition == "fade" {
            options.append(.transition(.fade(TimeInterval(transitionDuration / 1000.0))))
        }

        // Processors
        var processors: [ImageProcessor] = []
        if grayscale {
            processors.append(ColorControlsProcessor(brightness: 0, contrast: 1, saturation: 0, inputEV: 0))
        }
        if blurRadius > 0 {
            processors.append(BlurImageProcessor(blurRadius: blurRadius))
        }

        if !processors.isEmpty {
            let combined = processors.dropFirst().reduce(processors.first!) { $0.append(another: $1) }
            options.append(.processor(combined))
        }

        currentTask = kf.setImage(
            with: url,
            placeholder: nil,
            options: options,
            progressBlock: { [weak self] (receivedSize, totalSize) in
                self?.onNextImageProgress?([
                    "loaded": Int(receivedSize),
                    "total": Int(totalSize)
                ])
            },
            completionHandler: { [weak self] result in
                switch result {
                case .success(let value):
                    if let tint = self?.tintColorProp {
                        self?.image = value.image.withRenderingMode(.alwaysTemplate)
                    }
                    self?.applyCustomTransition()
                    self?.onNextImageLoad?([
                        "width": value.image.size.width,
                        "height": value.image.size.height
                    ])
                    self?.onNextImageLoadEnd?([:])
                case .failure(let error):
                    if let defaultSource = self?.defaultSource, let defaultUrl = URL(string: defaultSource) {
                        self?.kf.setImage(with: defaultUrl)
                    }
                    self?.onNextImageError?(["error": error.localizedDescription])
                    self?.onNextImageLoadEnd?([:])
                }
            }
        )
    }

    private func applyCustomTransition() {
        let duration = TimeInterval(transitionDuration / 1000.0)
        switch transition {
        case "slide":
            self.transform = CGAffineTransform(translationX: 0, y: 50)
            UIView.animate(withDuration: duration) {
                self.transform = .identity
            }
        case "scale":
            self.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
            UIView.animate(withDuration: duration) {
                self.transform = .identity
            }
        case "gravity":
            self.transform = CGAffineTransform(translationX: 0, y: -frame.size.height / 2)
            UIView.animate(withDuration: duration, delay: 0, usingSpringWithDamping: 0.6, initialSpringVelocity: 0.5, options: [], animations: {
                self.transform = .identity
            }, completion: nil)
        default:
            break
        }
    }
}
