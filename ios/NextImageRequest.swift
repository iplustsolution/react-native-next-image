import CryptoKit
import Foundation
import ImageIO
import Kingfisher
import UIKit

/// Turns a JS `source` object into a Kingfisher source plus the options that
/// implement NextImage's caching rules.
///
/// Shared by the view, the placeholder and default source loads, and the
/// preload APIs so a preloaded image lands under the cache key the view will
/// later look up.
struct NextImageRequest {
    /// A TTL at or above this is treated as "never expires".
    private static let immutableTtlSeconds: Double = 60 * 60 * 24 * 365

    let uri: String?
    let cacheKey: String
    let headers: [String: String]
    let headerOrder: [String]
    let priority: String
    let cache: String
    let ttlSeconds: Double
    /// A `require()`d asset: a Metro url in development, a `file://` url in
    /// the app bundle in release. Trusted by construction, never validated.
    let bundled: Bool
    /// Set when the security policy refused the source; nothing is loaded.
    let blocked: (code: String, message: String)?

    init(source: [String: Any]?, config: NextImageConfig) {
        let rawUri = source?["uri"] as? String

        guard let source, let rawUri, !rawUri.isEmpty else {
            uri = nil
            cacheKey = ""
            headers = [:]
            headerOrder = []
            priority = "normal"
            cache = "immutable"
            ttlSeconds = 0
            bundled = false
            blocked = nil
            return
        }

        let cacheValue = NextImageRequest.readCache(source["cache"])
        let explicitKey = (source["cacheKey"] as? String).flatMap { $0.isEmpty ? nil : $0 }

        if (source["bundled"] as? Bool) == true {
            let trimmed = rawUri.trimmingCharacters(in: .whitespacesAndNewlines)
            uri = trimmed
            headers = [:]
            headerOrder = []
            priority = NextImageRequest.readPriority(source["priority"])
            cache = cacheValue
            ttlSeconds = NextImageRequest.readTtlSeconds(source["cacheDuration"], cache: cacheValue)
            cacheKey = explicitKey ?? trimmed
            bundled = true
            blocked = nil
            return
        }

        switch NextImageSecurity.validateUri(rawUri, config: config) {
        case let .blocked(code, message):
            uri = nil
            cacheKey = ""
            headers = [:]
            headerOrder = []
            priority = "normal"
            cache = "immutable"
            ttlSeconds = 0
            bundled = false
            blocked = (code, message)

        case let .allowed(allowedUri, _):
            let sanitized = NextImageSecurity.sanitizeHeaders(
                NextImageRequest.readHeaders(source["headers"]),
                config: config
            )

            uri = allowedUri
            headers = sanitized.headers
            headerOrder = sanitized.order
            priority = NextImageRequest.readPriority(source["priority"])
            cache = cacheValue
            ttlSeconds = NextImageRequest.readTtlSeconds(source["cacheDuration"], cache: cacheValue)
            cacheKey = explicitKey ?? NextImageRequest.defaultCacheKey(for: allowedUri)
            bundled = false
            blocked = nil
        }
    }

    /// The key an image is stored under when the source sets none. A `data:`
    /// uri is hashed: a two megabyte string is a poor dictionary key.
    static func defaultCacheKey(for uri: String) -> String {
        guard uri.count > 5, uri.prefix(5).lowercased() == "data:" else { return uri }
        let digest = SHA256.hash(data: Data(uri.utf8))
        return "data:" + digest.map { String(format: "%02x", $0) }.joined()
    }

    var isRemote: Bool {
        guard let uri else { return false }
        let lower = uri.lowercased()
        return lower.hasPrefix("http://") || lower.hasPrefix("https://")
    }

    /// True when the bytes are read locally rather than downloaded.
    var isLocal: Bool {
        guard let uri else { return false }
        let lower = uri.lowercased()
        return lower.hasPrefix("file:") || lower.hasPrefix("data:")
    }

    /// The Kingfisher source. Urls download; `file:` and `data:` uris go
    /// through a data provider, because Kingfisher's downloader accepts only
    /// HTTP responses.
    var kingfisherSource: Source? {
        guard let uri else { return nil }
        let lower = uri.lowercased()

        if lower.hasPrefix("data:") {
            guard let data = NextImageDataUri.decode(uri) else { return nil }
            return .provider(RawImageDataProvider(data: data, cacheKey: cacheKey))
        }

        guard let url = NextImageRequest.url(from: uri) else { return nil }
        if url.isFileURL {
            return .provider(LocalFileImageDataProvider(fileURL: url, cacheKey: cacheKey))
        }
        guard isRemote else { return nil }
        return .network(KF.ImageResource(downloadURL: url, cacheKey: cacheKey))
    }

    /// `URL(string:)` refuses unencoded characters that servers accept and
    /// React Native's own image encodes on the way through, so a second attempt
    /// is made with the same encoding.
    private static func url(from uri: String) -> URL? {
        if let url = URL(string: uri) { return url }
        var allowed = CharacterSet.urlQueryAllowed
        allowed.insert(charactersIn: "#%")
        return uri.addingPercentEncoding(withAllowedCharacters: allowed).flatMap { URL(string: $0) }
    }

    /// Everything that decides the request identity and the rendered bitmap.
    /// While this is unchanged the view keeps what it is already showing.
    var signature: String {
        [
            cacheKey,
            uri ?? "",
            cache,
            String(ttlSeconds),
            priority,
            headerOrder.map { "\($0)=\(headers[$0] ?? "")" }.joined(separator: "&"),
            bundled ? "bundled" : "",
        ].joined(separator: "|")
    }

    struct Built {
        let options: KingfisherOptionsInfo
        /// Identifier of the processor chain, when there is one. Processed
        /// variants live under `cacheKey@identifier` in the memory cache.
        let processorIdentifier: String?
    }

    /// - Parameters:
    ///   - deferNetwork: restrict the request to the caches, with no connection.
    ///   - targetSize: view size in points, used for downsampling.
    ///   - fill: the image has to cover the whole target (`cover`, `stretch`)
    ///     rather than fit inside it (`contain`, `center`).
    ///   - processors: image processors to chain after downsampling.
    func build(
        deferNetwork: Bool,
        targetSize: CGSize?,
        fill: Bool = true,
        processors: [any ImageProcessor]
    ) -> Built {
        var options: KingfisherOptionsInfo = []

        if !headers.isEmpty, isRemote {
            let requestHeaders = headers
            options.append(.requestModifier(AnyModifier { request in
                var modified = request
                for (name, value) in requestHeaders {
                    modified.setValue(value, forHTTPHeaderField: name)
                }
                return modified
            }))
        }

        // The expiration is NextImage's decision, not the server's, which is
        // what makes a url download once and render from disk afterwards.
        let diskExpiration: StorageExpiration
        if ttlSeconds <= 0 {
            diskExpiration = .days(14)
        } else if ttlSeconds >= NextImageRequest.immutableTtlSeconds {
            diskExpiration = .never
        } else {
            diskExpiration = .seconds(ttlSeconds)
        }
        options.append(.diskCacheExpiration(diskExpiration))
        // `cacheDuration` means what it says: reading an entry does not renew it.
        options.append(.diskCacheAccessExtendingExpiration(.none))

        if ttlSeconds > 0 {
            // Memory is for what is on screen now; the disk keeps the TTL.
            options.append(.memoryCacheExpiration(.seconds(min(ttlSeconds, 300))))
        }

        switch cache {
        case "cacheOnly":
            options.append(.onlyFromCache)
        case "reload":
            options.append(.forceRefresh)
        default:
            break
        }

        // A deferred image may still render from cache; it just may not open a
        // connection. This is how `prefetchThreshold` avoids network work for
        // images that are far from the viewport.
        if deferNetwork, cache != "reload" {
            options.append(.onlyFromCache)
        }

        options.append(.downloadPriority(NextImageEngine.downloadPriority(for: priority)))
        options.append(.redirectHandler(NextImageRedirectHandler.shared))
        options.append(.backgroundDecode)

        var chain = processors
        if let targetSize, targetSize.width > 0, targetSize.height > 0 {
            let scale = UIScreen.main.scale
            let pixelSize = CGSize(
                width: targetSize.width * scale,
                height: targetSize.height * scale
            )
            chain.insert(NextImageDownsamplingProcessor(size: pixelSize, fill: fill), at: 0)
        }
        let combined = NextImageRequest.combine(chain)
        if let combined {
            options.append(.processor(combined))
        }

        if isLocal {
            // The bytes are already on disk; copying them into the cache would
            // only double the storage. The decoded image still lives in memory.
            options.append(.cacheMemoryOnly)
        } else {
            // The downloaded bytes are kept under the plain cache key next to
            // any processed variant, so a changed processor or view size is
            // rebuilt from them instead of downloaded again. (Kingfisher cannot
            // combine this with `.cacheMemoryOnly`: its cache callback state
            // machine asserts when the memory store completes first.)
            options.append(.cacheOriginalImage)
        }

        return Built(options: options, processorIdentifier: combined?.identifier)
    }

    func options(
        deferNetwork: Bool,
        targetSize: CGSize?,
        processors: [any ImageProcessor]
    ) -> KingfisherOptionsInfo {
        build(deferNetwork: deferNetwork, targetSize: targetSize, processors: processors).options
    }

    private static func combine(_ processors: [any ImageProcessor]) -> (any ImageProcessor)? {
        guard var result = processors.first else { return nil }
        for processor in processors.dropFirst() {
            result = result |> processor
        }
        return result
    }

    private static func readHeaders(_ value: Any?) -> [(name: String, value: String)] {
        // The JS layer sends `[{ name, value }]`; a plain dictionary is
        // accepted too for native callers.
        if let array = value as? [[String: Any]] {
            return array.compactMap { entry in
                guard let name = entry["name"] as? String,
                      let headerValue = entry["value"] as? String
                else {
                    return nil
                }
                return (name, headerValue)
            }
        }
        if let map = value as? [String: String] {
            return map.map { ($0.key, $0.value) }
        }
        return []
    }

    private static func readPriority(_ value: Any?) -> String {
        switch value as? String {
        case "low": return "low"
        case "high": return "high"
        default: return "normal"
        }
    }

    private static func readCache(_ value: Any?) -> String {
        switch value as? String {
        case "web": return "web"
        case "cacheOnly": return "cacheOnly"
        case "reload": return "reload"
        default: return "immutable"
        }
    }

    private static func readTtlSeconds(_ value: Any?, cache: String) -> Double {
        if cache == "web" { return 0 }
        let minutes = (value as? NSNumber)?.doubleValue
            ?? NextImageConfig.defaultCacheDurationMinutes
        if minutes <= 0 { return 0 }
        return max(minutes * 60, 1)
    }
}

/// Decodes an image at the size the view needs instead of its full size.
///
/// Kingfisher's `DownsamplingImageProcessor` bounds the longest side of the
/// image by the longest side of the target. That suits `contain`, but for
/// `cover` a photo whose aspect ratio differs from the view's comes out short
/// on the other axis and is then scaled up on screen, which looks soft: a
/// 4:3 photo in a 300x300 pixel view is decoded at 300x225 and stretched to
/// 400x300. This processor reads the pixel size first and decodes just large
/// enough to cover (`fill`) or fit the target, never larger than the original.
struct NextImageDownsamplingProcessor: ImageProcessor {
    /// Target size in pixels.
    let size: CGSize
    let fill: Bool
    let identifier: String

    init(size: CGSize, fill: Bool) {
        self.size = size
        self.fill = fill
        identifier = "com.nextimage.DownsamplingImageProcessor(\(size),\(fill ? "fill" : "fit"))"
    }

    func process(item: ImageProcessItem, options: KingfisherParsedOptionsInfo) -> KFCrossPlatformImage? {
        switch item {
        case let .image(image):
            // An original already decoded from the cache. Encoding it back to
            // PNG only to decode it again cost a full redraw and a PNG encode
            // for every new size, so it is scaled directly instead.
            return resize(image, scale: options.scaleFactor)
        case let .data(data):
            return downsample(data, scale: options.scaleFactor)
        }
    }

    private func downsample(_ data: Data, scale: CGFloat) -> KFCrossPlatformImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }
        let maxPixelSize = NextImageDownsamplingProcessor.maxPixelSize(
            imageSize: NextImageDownsamplingProcessor.orientedPixelSize(of: source),
            target: size,
            fill: fill
        )
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage, scale: scale, orientation: .up)
    }

    private func resize(_ image: UIImage, scale: CGFloat) -> KFCrossPlatformImage? {
        guard let cgImage = image.cgImage else {
            guard let data = image.kf.data(format: .unknown) else { return nil }
            return downsample(data, scale: scale)
        }
        let pixelSize = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let longest = max(pixelSize.width, pixelSize.height)
        let target = NextImageDownsamplingProcessor.maxPixelSize(imageSize: pixelSize, target: size, fill: fill)
        guard longest > 0, target < longest else {
            return UIImage(cgImage: cgImage, scale: scale, orientation: image.imageOrientation)
        }
        let ratio = target / longest
        let output = CGSize(
            width: max((pixelSize.width * ratio).rounded(), 1),
            height: max((pixelSize.height * ratio).rounded(), 1)
        )
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: output, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: output))
        }
        guard let resized = rendered.cgImage else { return nil }
        return UIImage(cgImage: resized, scale: scale, orientation: .up)
    }

    /// The pixel size as displayed, after the EXIF orientation is applied.
    private static func orientedPixelSize(of source: CGImageSource) -> CGSize? {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width > 0, height > 0
        else {
            return nil
        }
        let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        // 5 to 8 are the orientations rotated by 90 degrees.
        return (5 ... 8).contains(orientation)
            ? CGSize(width: height, height: width)
            : CGSize(width: width, height: height)
    }

    /// The longest side to decode at, so the result covers or fits `target`.
    static func maxPixelSize(imageSize: CGSize?, target: CGSize, fill: Bool) -> CGFloat {
        let fallback = max(target.width, target.height)
        guard let imageSize, imageSize.width > 0, imageSize.height > 0,
              target.width > 0, target.height > 0
        else {
            return fallback
        }
        let widthRatio = target.width / imageSize.width
        let heightRatio = target.height / imageSize.height
        let ratio = min(fill ? max(widthRatio, heightRatio) : min(widthRatio, heightRatio), 1)
        return max((max(imageSize.width, imageSize.height) * ratio).rounded(.up), 1)
    }
}

/// Refuses a redirect that would move an https request onto cleartext, which
/// would put the caller's `Authorization` header on the wire in the clear.
///
/// This mirrors OkHttp's `followSslRedirects(false)` on Android, and like it,
/// the downgrade is permitted only when the app has opted into plain http.
struct NextImageRedirectHandler: ImageDownloadRedirectHandler {
    static let shared = NextImageRedirectHandler()

    func handleHTTPRedirection(
        for task: SessionDataTask,
        response: HTTPURLResponse,
        newRequest: URLRequest
    ) async -> URLRequest? {
        guard let fromScheme = response.url?.scheme?.lowercased(),
              let toScheme = newRequest.url?.scheme?.lowercased()
        else {
            return nil
        }
        if fromScheme == "https", toScheme != "https",
           !NextImageConfigStore.shared.current.allowInsecureHttp
        {
            return nil
        }
        return newRequest
    }
}
