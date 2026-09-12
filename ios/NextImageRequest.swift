import Foundation
import Kingfisher
import UIKit

/// Turns a JS `source` object into a Kingfisher resource plus the options that
/// implement NextImage's caching rules.
///
/// Shared by the view and by the preload APIs so a preloaded image lands under
/// the cache key the view will later look up.
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
            blocked = (code, message)

        case let .allowed(allowedUri, _):
            let sanitized = NextImageSecurity.sanitizeHeaders(
                NextImageRequest.readHeaders(source["headers"]),
                config: config
            )
            let cacheValue = NextImageRequest.readCache(source["cache"])

            uri = allowedUri
            headers = sanitized.headers
            headerOrder = sanitized.order
            priority = NextImageRequest.readPriority(source["priority"])
            cache = cacheValue
            ttlSeconds = NextImageRequest.readTtlSeconds(source["cacheDuration"], cache: cacheValue)
            if let key = source["cacheKey"] as? String, !key.isEmpty {
                cacheKey = key
            } else {
                cacheKey = allowedUri
            }
            blocked = nil
        }
    }

    /// Qualified as `KF.ImageResource` because SwiftUI also defines `ImageResource`.
    var resource: KF.ImageResource? {
        guard let uri, let url = URL(string: uri) else { return nil }
        return KF.ImageResource(downloadURL: url, cacheKey: cacheKey)
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
        ].joined(separator: "|")
    }

    /// - Parameters:
    ///   - deferNetwork: restrict the request to the caches, with no connection.
    ///   - targetSize: view size in points, used for downsampling.
    ///   - processors: image processors to chain after downsampling.
    func options(
        deferNetwork: Bool,
        targetSize: CGSize?,
        processors: [any ImageProcessor]
    ) -> KingfisherOptionsInfo {
        var options: KingfisherOptionsInfo = []

        if !headers.isEmpty {
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
            diskExpiration = .days(7)
        } else if ttlSeconds >= NextImageRequest.immutableTtlSeconds {
            diskExpiration = .never
        } else {
            diskExpiration = .seconds(ttlSeconds)
        }
        options.append(.diskCacheExpiration(diskExpiration))
        // `cacheDuration` means what it says: reading an entry does not renew it.
        options.append(.diskCacheAccessExtendingExpiration(.none))

        if ttlSeconds > 0 {
            options.append(.memoryCacheExpiration(.seconds(min(ttlSeconds, 3600))))
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
        // Keep the unprocessed bytes so changing a processor does not re-download.
        options.append(.cacheOriginalImage)
        options.append(.backgroundDecode)

        var chain = processors
        if let targetSize, targetSize.width > 0, targetSize.height > 0 {
            let scale = UIScreen.main.scale
            let pixelSize = CGSize(
                width: targetSize.width * scale,
                height: targetSize.height * scale
            )
            chain.insert(DownsamplingImageProcessor(size: pixelSize), at: 0)
        }
        if let combined = NextImageRequest.combine(chain) {
            options.append(.processor(combined))
        }

        return options
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
