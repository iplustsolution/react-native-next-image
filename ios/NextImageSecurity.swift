import Foundation

/// Runtime configuration, set from JS through `NextImage.configure(...)`.
///
/// Foundation only, with no UIKit or Kingfisher imports, so the same file is
/// compiled and asserted against by `tests/ios` on every CI run.
public struct NextImageConfig {
    public static let defaultDiskCacheBytes: UInt = 250 * 1024 * 1024
    public static let defaultMemoryCacheBytes: UInt = 0 // 0 means "let the OS decide"
    public static let defaultCacheDurationMinutes: Double = 10080
    public static let minDiskCacheBytes: UInt = 4 * 1024 * 1024
    public static let minMemoryCacheBytes: UInt = 1 * 1024 * 1024

    public var allowInsecureHttp = false
    public var allowDataUri = false
    public var allowFileUri = false
    /// `nil` means "no allow-list".
    public var allowedHosts: [String]?
    public var blockedHosts: [String] = []
    public var blockPrivateNetworks = true
    public var allowUriCredentials = false
    public var maxUriLength = 8192
    public var maxDataUriBytes = 2 * 1024 * 1024
    public var maxHeaderCount = 24
    public var maxHeaderNameLength = 128
    public var maxHeaderValueLength = 8192
    /// SPKI pins per host in `sha256/<base64>` form. Empty disables pinning.
    public var certificatePins: [String: [String]] = [:]
    public var memoryCacheBytes = NextImageConfig.defaultMemoryCacheBytes
    public var diskCacheBytes = NextImageConfig.defaultDiskCacheBytes
    public var requestTimeoutMs: Double = 30000
    /// When false, `cacheDuration` decides the lifetime, not the server.
    public var respectServerCacheHeaders = false

    public init() {}

    /// Changes to these fields require the downloader and cache to be rebuilt.
    public static func requiresLoaderRebuild(_ before: NextImageConfig, _ after: NextImageConfig) -> Bool {
        before.memoryCacheBytes != after.memoryCacheBytes
            || before.diskCacheBytes != after.diskCacheBytes
            || before.requestTimeoutMs != after.requestTimeoutMs
            || before.certificatePins != after.certificatePins
    }

    private static let pinPattern = "^sha256/[A-Za-z0-9+/]{43}=$"

    /// Applies a partial configuration coming from JS. Values of the wrong
    /// type, negative sizes and malformed pins are ignored rather than trusted.
    public mutating func apply(options: [String: Any]) {
        if let value = options["allowInsecureHttp"] as? Bool { allowInsecureHttp = value }
        if let value = options["allowDataUri"] as? Bool { allowDataUri = value }
        if let value = options["allowFileUri"] as? Bool { allowFileUri = value }
        if let value = options["blockPrivateNetworks"] as? Bool { blockPrivateNetworks = value }
        if let value = options["allowUriCredentials"] as? Bool { allowUriCredentials = value }
        if let value = options["respectServerCacheHeaders"] as? Bool {
            respectServerCacheHeaders = value
        }

        if options.keys.contains("allowedHosts") {
            allowedHosts = NextImageConfig.stringList(options["allowedHosts"])
        }
        if options.keys.contains("blockedHosts") {
            blockedHosts = NextImageConfig.stringList(options["blockedHosts"]) ?? []
        }

        if let value = NextImageConfig.positiveInt(options["maxUriLength"]) { maxUriLength = value }
        if let value = NextImageConfig.positiveInt(options["maxDataUriBytes"]) {
            maxDataUriBytes = value
        }
        if let value = NextImageConfig.positiveInt(options["maxHeaderCount"]) {
            maxHeaderCount = value
        }
        if let value = NextImageConfig.positiveInt(options["maxHeaderNameLength"]) {
            maxHeaderNameLength = value
        }
        if let value = NextImageConfig.positiveInt(options["maxHeaderValueLength"]) {
            maxHeaderValueLength = value
        }

        if let value = NextImageConfig.positiveDouble(options["memoryCacheBytes"]) {
            memoryCacheBytes = max(UInt(value), NextImageConfig.minMemoryCacheBytes)
        }
        if let value = NextImageConfig.positiveDouble(options["diskCacheBytes"]) {
            diskCacheBytes = max(UInt(value), NextImageConfig.minDiskCacheBytes)
        }
        if let value = NextImageConfig.positiveDouble(options["requestTimeoutMs"]) {
            requestTimeoutMs = min(max(value, 1000), 300_000)
        }

        if options.keys.contains("certificatePins") {
            certificatePins = NextImageConfig.parsePins(options["certificatePins"])
        }
    }

    private static func stringList(_ value: Any?) -> [String]? {
        guard let list = value as? [Any] else { return nil }
        return list.compactMap { $0 as? String }.filter { !$0.isEmpty }
    }

    private static func positiveInt(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber else { return nil }
        let int = number.intValue
        return int > 0 ? int : nil
    }

    private static func positiveDouble(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber else { return nil }
        let double = number.doubleValue
        return double > 0 ? double : nil
    }

    private static func parsePins(_ value: Any?) -> [String: [String]] {
        guard let map = value as? [String: Any] else { return [:] }
        var result: [String: [String]] = [:]
        for (host, pins) in map {
            guard let list = pins as? [Any] else { continue }
            let valid = list
                .compactMap { $0 as? String }
                .filter { NextImageSecurity.matches($0, pattern: pinPattern) }
            if !valid.isEmpty {
                result[host] = valid
            }
        }
        return result
    }
}

public struct NextImageParsedUri {
    public let scheme: String
    public let userInfo: String?
    public let host: String?
    public let port: Int?
    public let path: String
    public let query: String?
}

public enum NextImageUriResult {
    case allowed(uri: String, parsed: NextImageParsedUri)
    case blocked(code: String, message: String)
}

/// URL and header hardening, mirroring `src/security.ts` and
/// `NextImageSecurity.kt`. The JS layer validates first; this is the second
/// line of defence for anything reaching native directly.
public enum NextImageSecurity {
    private static let forbiddenHeaders: Set<String> = [
        "connection", "content-length", "expect", "host", "keep-alive",
        "proxy-authorization", "proxy-connection", "te", "trailer",
        "transfer-encoding", "upgrade", "via",
    ]

    private static let localSchemes: Set<String> = ["asset", "ph", "assets-library"]

    private static let uriPattern =
        "^([a-zA-Z][a-zA-Z0-9+.-]*):(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?$"
    private static let headerNamePattern = "^[!#$%&'*+\\-.^_`|~0-9A-Za-z]+$"
    private static let ipv4Pattern = "^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$"

    static func matches(_ value: String, pattern: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(value.startIndex..., in: value)
        return regex.firstMatch(in: value, options: [], range: range) != nil
    }

    private static func captures(_ value: String, pattern: String) -> [String?]? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(value.startIndex..., in: value)
        guard let match = regex.firstMatch(in: value, options: [], range: range),
              match.range == range
        else {
            return nil
        }
        return (0 ..< match.numberOfRanges).map { index in
            let matchRange = match.range(at: index)
            guard matchRange.location != NSNotFound,
                  let swiftRange = Range(matchRange, in: value)
            else {
                return nil
            }
            return String(value[swiftRange])
        }
    }

    /// A strict URI parser. `URL` and `URLComponents` are lenient about hosts
    /// and credentials in ways that would let a blocked host through.
    public static func parseUri(_ uri: String) -> NextImageParsedUri? {
        guard let groups = captures(uri, pattern: uriPattern) else { return nil }

        let scheme = (groups[1] ?? "").lowercased()
        var userInfo: String?
        var host: String?
        var port: Int?

        if let authority = groups[3] {
            var rest = authority
            if let at = rest.lastIndex(of: "@") {
                userInfo = String(rest[rest.startIndex ..< at])
                rest = String(rest[rest.index(after: at)...])
            }

            if rest.hasPrefix("[") {
                guard let close = rest.firstIndex(of: "]") else { return nil }
                host = String(rest[rest.startIndex ... close]).lowercased()
                rest = String(rest[rest.index(after: close)...])
                if !rest.isEmpty, !rest.hasPrefix(":") { return nil }
            } else if let colon = rest.firstIndex(of: ":") {
                host = String(rest[rest.startIndex ..< colon]).lowercased()
                rest = String(rest[colon...])
            } else {
                host = rest.lowercased()
                rest = ""
            }

            if rest.hasPrefix(":") {
                let digits = String(rest.dropFirst())
                if !digits.isEmpty {
                    guard let parsedPort = Int(digits), parsedPort >= 1, parsedPort <= 65535 else {
                        return nil
                    }
                    port = parsedPort
                }
            }

            if host?.isEmpty == true { host = nil }
        }

        return NextImageParsedUri(
            scheme: scheme,
            userInfo: userInfo,
            host: host,
            port: port,
            path: groups[4] ?? "",
            query: groups[6]
        )
    }

    /// Supports `example.com`, `.example.com` and `*.example.com`.
    public static func hostMatches(_ host: String, pattern: String) -> Bool {
        let normalizedHost = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        var normalizedPattern = pattern.lowercased().trimmingCharacters(in: .whitespaces)

        if normalizedPattern.isEmpty { return false }
        if normalizedPattern == "*" { return true }
        if normalizedPattern.hasPrefix("*.") {
            normalizedPattern = String(normalizedPattern.dropFirst())
        }
        if normalizedPattern.hasPrefix(".") {
            let bare = String(normalizedPattern.dropFirst())
            return normalizedHost == bare || normalizedHost.hasSuffix(normalizedPattern)
        }
        return normalizedHost == normalizedPattern
    }

    /// Loopback, link-local, private-range, CGNAT and cloud metadata hosts.
    public static func isPrivateHost(_ host: String) -> Bool {
        var normalized = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        while normalized.hasSuffix(".") { normalized = String(normalized.dropLast()) }

        if normalized == "localhost"
            || normalized.hasSuffix(".localhost")
            || normalized.hasSuffix(".local")
            || normalized.hasSuffix(".internal")
        {
            return true
        }

        if let groups = captures(normalized, pattern: ipv4Pattern) {
            let octets = (1 ... 4).compactMap { groups[$0].flatMap(Int.init) }
            guard octets.count == 4 else { return true }
            if octets.contains(where: { $0 > 255 }) { return true }
            let a = octets[0]
            let b = octets[1]
            if a == 0 || a == 10 || a == 127 { return true }
            if a == 169, b == 254 { return true }
            if a == 172, (16 ... 31).contains(b) { return true }
            if a == 192, b == 168 { return true }
            if a == 100, (64 ... 127).contains(b) { return true }
            if a >= 224 { return true }
            return false
        }

        if normalized.contains(":") {
            if normalized == "::" || normalized == "::1" { return true }
            if normalized.hasPrefix("::ffff:") {
                return isPrivateHost(String(normalized.dropFirst("::ffff:".count)))
            }
            if matches(normalized, pattern: "^f[cd][0-9a-f]{0,2}:") { return true }
            if matches(normalized, pattern: "^fe[89ab][0-9a-f]?:") { return true }
        }

        return false
    }

    public static func validateUri(_ rawUri: String?, config: NextImageConfig) -> NextImageUriResult {
        guard let rawUri else {
            return .blocked(code: "EMPTY_URI", message: "Image source uri must not be empty.")
        }
        let uri = rawUri.trimmingCharacters(in: .whitespacesAndNewlines)
        if uri.isEmpty {
            return .blocked(code: "EMPTY_URI", message: "Image source uri must not be empty.")
        }
        if uri.count > config.maxUriLength {
            return .blocked(
                code: "URI_TOO_LONG",
                message: "Image source uri exceeds \(config.maxUriLength) characters."
            )
        }
        if uri.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) {
            return .blocked(
                code: "CONTROL_CHARACTERS",
                message: "Image source uri contains control characters."
            )
        }

        guard let parsed = parseUri(uri) else {
            return .blocked(code: "MALFORMED_URI", message: "Image source uri is malformed.")
        }

        switch parsed.scheme {
        case "https":
            break
        case "http":
            if !config.allowInsecureHttp {
                return .blocked(
                    code: "INSECURE_SCHEME",
                    message: "Plain http:// sources are blocked by the NextImage security policy."
                )
            }
        case "data":
            if !config.allowDataUri {
                return .blocked(code: "DATA_URI_NOT_ALLOWED", message: "data: sources are blocked.")
            }
            if estimateDataUriBytes(uri) > config.maxDataUriBytes {
                return .blocked(
                    code: "DATA_URI_TOO_LARGE",
                    message: "data: source exceeds \(config.maxDataUriBytes) bytes."
                )
            }
            return .allowed(uri: uri, parsed: parsed)
        case "file":
            return config.allowFileUri
                ? .allowed(uri: uri, parsed: parsed)
                : .blocked(code: "FILE_URI_NOT_ALLOWED", message: "file: sources are blocked.")
        default:
            return localSchemes.contains(parsed.scheme)
                ? .allowed(uri: uri, parsed: parsed)
                : .blocked(
                    code: "SCHEME_NOT_ALLOWED",
                    message: "Unsupported uri scheme \"\(parsed.scheme)\"."
                )
        }

        if parsed.userInfo != nil, !config.allowUriCredentials {
            return .blocked(
                code: "URI_CREDENTIALS",
                message: "Image source uri must not embed credentials."
            )
        }
        guard let host = parsed.host else {
            return .blocked(code: "HOST_MISSING", message: "Image source uri has no host.")
        }
        if config.blockedHosts.contains(where: { hostMatches(host, pattern: $0) }) {
            return .blocked(code: "HOST_BLOCKED", message: "Host \"\(host)\" is blocked.")
        }
        if let allowed = config.allowedHosts,
           !allowed.contains(where: { hostMatches(host, pattern: $0) })
        {
            return .blocked(code: "HOST_NOT_ALLOWED", message: "Host \"\(host)\" is not allow-listed.")
        }
        if config.blockPrivateNetworks, isPrivateHost(host) {
            return .blocked(
                code: "PRIVATE_HOST_BLOCKED",
                message: "Host \"\(host)\" resolves to a private or loopback address."
            )
        }

        return .allowed(uri: uri, parsed: parsed)
    }

    /// Removes headers that could split the request or that URLSession owns.
    public static func sanitizeHeaders(
        _ headers: [(name: String, value: String)],
        config: NextImageConfig
    ) -> (headers: [String: String], order: [String], rejected: [String]) {
        var accepted: [String: String] = [:]
        var order: [String] = []
        var rejected: [String] = []

        for header in headers {
            if accepted.count >= config.maxHeaderCount {
                rejected.append(header.name)
                continue
            }
            if header.name.count > config.maxHeaderNameLength
                || !matches(header.name, pattern: headerNamePattern)
                || forbiddenHeaders.contains(header.name.lowercased())
            {
                rejected.append(header.name)
                continue
            }
            if header.value.count > config.maxHeaderValueLength
                || !isValidHeaderValue(header.value)
            {
                rejected.append(header.name)
                continue
            }
            if accepted.updateValue(header.value, forKey: header.name) == nil {
                order.append(header.name)
            }
        }

        return (accepted, order, rejected)
    }

    /// Decoded length of a data uri, without decoding it.
    private static func estimateDataUriBytes(_ uri: String) -> Int {
        guard let comma = uri.firstIndex(of: ",") else { return uri.count }
        let meta = String(uri[uri.startIndex ..< comma])
        let payload = String(uri[uri.index(after: comma)...])
        guard meta.lowercased().hasSuffix(";base64") else { return payload.count }
        let padding = payload.hasSuffix("==") ? 2 : (payload.hasSuffix("=") ? 1 : 0)
        return max(0, payload.count * 3 / 4 - padding)
    }

    private static func isValidHeaderValue(_ value: String) -> Bool {
        value.unicodeScalars.allSatisfy { scalar in
            scalar == "\t" || (scalar.value >= 0x20 && scalar.value <= 0x7E)
                || (scalar.value >= 0xA0 && scalar.value <= 0xFF)
        }
    }

    /// Credential-free, query-free rendering of a uri, safe for logs and events.
    public static func redactUri(_ uri: String) -> String {
        guard let parsed = parseUri(uri) else { return "<invalid-uri>" }
        if parsed.scheme == "data" { return "data:<redacted>" }
        let port = parsed.port.map { ":\($0)" } ?? ""
        let query = parsed.query == nil ? "" : "?<redacted>"
        return "\(parsed.scheme)://\(parsed.host ?? "")\(port)\(parsed.path)\(query)"
    }
}
