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
        SDImageCache.shared.clearDisk(onCompletion: completion)
    }
}

@objc(NextImageViewImpl)
public class NextImageViewImpl: UIImageView {
    private var currentOperation: SDWebImageOperation?

    @objc public var onNextImageLoadStart: ((NSDictionary) -> Void)?
    @objc public var onNextImageProgress: ((NSDictionary) -> Void)?
    @objc public var onNextImageLoad: ((NSDictionary) -> Void)?
    @objc public var onNextImageError: ((NSDictionary) -> Void)?
    @objc public var onNextImageLoadEnd: ((NSDictionary) -> Void)?

    @objc public var source: [String: Any]? {
        didSet { reloadImage() }
    }

    @objc public var defaultSource: String? {
        didSet { reloadImage() }
    }

    @objc public var resizeMode: String = "cover" {
        didSet {
            updateContentMode()
            reloadImage()
        }
    }

    @objc public var blurRadius: CGFloat = 0 {
        didSet { reloadImage() }
    }

    @objc public var transition: String = "none" {
        didSet { reloadImage() }
    }

    @objc public var transitionDuration: CGFloat = 0.3

    @objc public var borderRadius: CGFloat = 0 {
        didSet {
            layer.cornerRadius = borderRadius
            layer.masksToBounds = borderRadius > 0
        }
    }

    @objc public var isCircle: Bool = false {
        didSet { setNeedsLayout() }
    }

    @objc public var grayscale: Bool = false {
        didSet { reloadImage() }
    }

    @objc public var placeholder: String? {
        didSet { reloadImage() }
    }

    @objc public var downsample: Bool = true {
        didSet { reloadImage() }
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
        case "contain": contentMode = .scaleAspectFit
        case "stretch": contentMode = .scaleToFill
        case "center": contentMode = .center
        default: contentMode = .scaleAspectFill
        }
    }

    private func reloadImage() {
        currentOperation?.cancel()
        onNextImageLoadStart?([:])

        guard let source = source, let uri = source["uri"] as? String, let url = URL(string: uri) else {
            if let defaultSource = defaultSource, let defaultUrl = URL(string: defaultSource) {
                sd_setImage(with: defaultUrl)
            } else {
                self.image = nil
            }
            onNextImageLoadEnd?([:])
            return
        }

        var options: SDWebImageOptions = [.retryFailed, .continueInBackground]
        var context: [SDWebImageContextOption: Any] = [:]

        // Headers
        if let headers = source["headers"] as? [[String: String]] {
            var headerDict: [String: String] = [:]
            for header in headers {
                if let name = header["name"], let value = header["value"] {
                    headerDict[name] = value
                }
            }
            context[.downloadRequestModifier] = SDWebImageDownloaderRequestModifier(headers: headerDict)
        }

        // Priority
        if let priority = source["priority"] as? String {
            switch priority {
            case "low": options.insert(.lowPriority)
            case "high": options.insert(.highPriority)
            default: break
            }
        }

        // Cache control
        let cacheMode = source["cache"] as? String ?? "web"
        if cacheMode == "cacheOnly" {
            let manager = SDWebImageManager.shared
            let key = manager.cacheKey(for: url)
            if let cached = SDImageCache.shared.imageFromCache(forKey: key) {
                applyResult(cached, error: nil)
            } else {
                let map = NSMutableDictionary()
                map["error"] = "Image not found in cache"
                onNextImageError?(map)
                onNextImageLoadEnd?([:])
            }
            return
        } else if cacheMode == "immutable" {
            // Don't revalidate against the server once cached.
            options.insert(.avoidDecodeImage)
        } else {
            // "web": respect standard HTTP caching (SDWebImage/URLSession default).
        }

        // Transition
        if transition == "fade" {
            // Handled post-load via applyCustomTransition(); SDWebImage's own
            // .imageWithFadeAnimation only covers memory-cache misses.
        }

        currentOperation = sd_setImage(
            with: url,
            placeholderImage: nil,
            options: options,
            context: context,
            progress: { [weak self] receivedSize, expectedSize, _ in
                guard let self = self, expectedSize > 0 else { return }
                let map = NSMutableDictionary()
                map["loaded"] = receivedSize
                map["total"] = expectedSize
                self.onNextImageProgress?(map)
            },
            completed: { [weak self] image, error, _, _ in
                guard let self = self else { return }
                if let image = image {
                    self.applyResult(image, error: nil)
                } else {
                    if let defaultSource = self.defaultSource, let defaultUrl = URL(string: defaultSource) {
                        self.sd_setImage(with: defaultUrl)
                    }
                    let map = NSMutableDictionary()
                    map["error"] = error?.localizedDescription ?? "Failed to load image"
                    self.onNextImageError?(map)
                    self.onNextImageLoadEnd?([:])
                }
            }
        )
    }

    /// Applies grayscale/blur post-processing (Core Image), tint, transition
    /// and fires the load-success events. Runs the filter work off-thread.
    private func applyResult(_ rawImage: UIImage, error: Error?) {
        let needsFilter = grayscale || blurRadius > 0
        if !needsFilter {
            finishApplying(rawImage)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let filtered = Self.applyCoreImageFilters(
                to: rawImage,
                grayscale: self.grayscale,
                blurRadius: self.blurRadius
            )
            DispatchQueue.main.async {
                self.finishApplying(filtered ?? rawImage)
            }
        }
    }

    private func finishApplying(_ image: UIImage) {
        if let tint = tintColorProp {
            self.image = image.withRenderingMode(.alwaysTemplate)
            self.tintColor = tint
        } else {
            self.image = image
        }
        applyCustomTransition()

        let map = NSMutableDictionary()
        map["width"] = image.size.width
        map["height"] = image.size.height
        onNextImageLoad?(map)
        onNextImageLoadEnd?([:])
    }

    private static func applyCoreImageFilters(to image: UIImage, grayscale: Bool, blurRadius: CGFloat) -> UIImage? {
        guard var ciImage = CIImage(image: image) else { return nil }
        let context = CIContext()

        if grayscale {
            guard let filter = CIFilter(name: "CIColorControls") else { return nil }
            filter.setValue(ciImage, forKey: kCIInputImageKey)
            filter.setValue(0.0, forKey: kCIInputSaturationKey)
            guard let output = filter.outputImage else { return nil }
            ciImage = output
        }

        if blurRadius > 0 {
            guard let filter = CIFilter(name: "CIGaussianBlur") else { return nil }
            filter.setValue(ciImage, forKey: kCIInputImageKey)
            filter.setValue(blurRadius, forKey: kCIInputRadiusKey)
            guard let output = filter.outputImage?.cropped(to: ciImage.extent) else { return nil }
            ciImage = output
        }

        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else { return nil }
        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }

    private func applyCustomTransition() {
        let duration = TimeInterval(transitionDuration / 1000.0)
        switch transition {
        case "fade":
            self.alpha = 0
            UIView.animate(withDuration: duration) { self.alpha = 1 }
        case "slide":
            self.transform = CGAffineTransform(translationX: 0, y: 50)
            UIView.animate(withDuration: duration) { self.transform = .identity }
        case "scale":
            self.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
            UIView.animate(withDuration: duration) { self.transform = .identity }
        case "gravity":
            self.transform = CGAffineTransform(translationX: 0, y: -frame.size.height / 2)
            UIView.animate(withDuration: duration, delay: 0, usingSpringWithDamping: 0.6,
                            initialSpringVelocity: 0.5, options: [], animations: {
                self.transform = .identity
            })
        default:
            break
        }
    }
}