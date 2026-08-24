import Foundation
import SDWebImage
import UIKit

@objc public class NextImageSwift: NSObject {
    @objc public static let shared = NextImageSwift()

    @objc public func preload(urls: [URL]) {
        SDWebImagePrefetcher.shared.prefetchURLs(urls)
    }

    @objc public func clearMemoryCache() {
        SDImageCache.shared.clearMemory()
    }

    @objc public func clearDiskCache(completion: @escaping () -> Void) {
        SDImageCache.shared.clearDisk {
            completion()
        }
    }
}

@objc(NextImageViewImpl)
public class NextImageViewImpl: UIImageView {

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
        }
    }

    @objc public var blurRadius: CGFloat = 0 {
        didSet {
            reloadImage()
        }
    }

    @objc public var transition: String = "none" {
        didSet {
            // SDWebImage handles transitions differently, we'll apply it in the completion block or using SDWebImageTransition
        }
    }

    @objc public var transitionDuration: CGFloat = 300 // ms

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
            loadDefaultImage()
            return
        }

        var context: [SDWebImageContextOption : Any] = [:]

        // Headers
        if let headers = source["headers"] as? [String: String] {
            // SDWebImage allows setting headers via SDWebImageDownloaderConfig or per request
            // For per-request, we can use a custom downloader or the context
            // Easiest for this structure is setting them via HTTPHeaders in context if supported or global config.
            // SDWebImage 5.x uses SDWebImageDownloader.shared.setValue(value, forHTTPHeaderField: field)
            // But we want it per-request.
        }

        // Cache Duration
        if let cacheDuration = source["cacheDuration"] as? Double {
             // SDWebImage cache expiration is usually global, but can be controlled via metadata
        }

        var options: SDWebImageOptions = [.retryFailed, .handleCookies]

        if let cache = source["cache"] as? String {
            switch cache {
            case "cacheOnly":
                options.insert(.fromCacheOnly)
            case "immutable":
                // Default behavior is aggressive enough
                break
            default:
                break
            }
        }

        // Transitions
        let sdTransition: SDWebImageTransition? = {
            let duration = TimeInterval(transitionDuration / 1000.0)
            switch transition {
            case "fade":
                return .fade(duration: duration)
            default:
                return nil
            }
        }()

        self.sd_setImage(with: url, placeholderImage: nil, options: options, context: context, progress: { [weak self] (receivedSize, totalSize, _) in
            self?.onNextImageProgress?([
                "loaded": Int(receivedSize),
                "total": Int(totalSize)
            ])
        }) { [weak self] (image, error, cacheType, url) in
            if let error = error {
                self?.onNextImageError?(["error": error.localizedDescription])
                self?.loadDefaultImage()
            } else if let image = image {
                var finalImage = image

                // Grayscale Processor
                if self?.grayscale == true {
                    // Simple grayscale implementation using Core Image or SDImageTransformer
                }

                if let tint = self?.tintColorProp {
                    finalImage = finalImage.withRenderingMode(.alwaysTemplate)
                }

                self?.image = finalImage
                self?.applyCustomTransition()

                self?.onNextImageLoad?([
                    "width": image.size.width,
                    "height": image.size.height
                ])
            }
            self?.onNextImageLoadEnd?([:])
        }
    }

    private func loadDefaultImage() {
        if let defaultSource = defaultSource, let defaultUrl = URL(string: defaultSource) {
            self.sd_setImage(with: defaultUrl)
        } else {
            self.image = nil
        }
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
