import Foundation

/// Assertions for `ios/NextImageSecurity.swift`.
///
/// The security module imports nothing but Foundation, so it is compiled and
/// run directly by `scripts/test-ios-security.sh` on every CI run. That keeps
/// the URL and header policy under test without an Xcode test target, and
/// keeps it honest against the Kotlin and TypeScript copies of the same rules.
@main
struct NextImageSecurityTests {
    private static var checks = 0
    private static var failures: [String] = []

    static func main() {
        testAllowsHttps()
        testBlocksInsecureHttp()
        testBlocksUnknownSchemes()
        testBlocksDataAndFileUnlessOptedIn()
        testBlocksCredentials()
        testBlocksControlCharacters()
        testBlocksEmptyAndMalformed()
        testBlocksPrivateHosts()
        testAllowsPublicHosts()
        testHostAllowAndBlockLists()
        testParsesAuthority()
        testHostPatterns()
        testSanitizesHeaders()
        testCapsHeaderCount()
        testCapsHeaderLengths()
        testRedactsUris()
        testCapsDataUriSize()
        testConfigParsing()
        testCertificatePinParsing()
        testLoaderRebuildDetection()

        if failures.isEmpty {
            print("ok - \(checks) checks passed")
            exit(0)
        }
        print("FAILED - \(failures.count) of \(checks) checks failed")
        for failure in failures {
            print("  - \(failure)")
        }
        exit(1)
    }

    // MARK: Harness

    private static func check(_ condition: Bool, _ message: String) {
        checks += 1
        if !condition {
            failures.append(message)
        }
    }

    private static func checkEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String) {
        checks += 1
        if actual != expected {
            failures.append("\(message): expected \(expected), got \(actual)")
        }
    }

    private static var defaults: NextImageConfig { NextImageConfig() }

    private static func blockedCode(
        _ uri: String,
        _ config: NextImageConfig? = nil
    ) -> String? {
        switch NextImageSecurity.validateUri(uri, config: config ?? defaults) {
        case let .blocked(code, _): return code
        case .allowed: return nil
        }
    }

    // MARK: Uri policy

    private static func testAllowsHttps() {
        checkEqual(blockedCode("https://images.example.com/a.jpg?v=2"), nil, "https allowed")
    }

    private static func testBlocksInsecureHttp() {
        checkEqual(
            blockedCode("http://images.example.com/a.jpg"),
            "INSECURE_SCHEME",
            "http blocked by default"
        )
        var opted = defaults
        opted.allowInsecureHttp = true
        opted.blockPrivateNetworks = false
        checkEqual(
            blockedCode("http://images.example.com/a.jpg", opted),
            nil,
            "http allowed when opted in"
        )
    }

    private static func testBlocksUnknownSchemes() {
        checkEqual(blockedCode("javascript:alert(1)"), "SCHEME_NOT_ALLOWED", "javascript blocked")
        checkEqual(blockedCode("ftp://example.com/a.jpg"), "SCHEME_NOT_ALLOWED", "ftp blocked")
    }

    private static func testBlocksDataAndFileUnlessOptedIn() {
        checkEqual(
            blockedCode("data:image/png;base64,AAAA"),
            "DATA_URI_NOT_ALLOWED",
            "data blocked by default"
        )
        checkEqual(blockedCode("file:///tmp/a.jpg"), "FILE_URI_NOT_ALLOWED", "file blocked by default")

        var withData = defaults
        withData.allowDataUri = true
        checkEqual(
            blockedCode("data:image/png;base64,AAAA", withData),
            nil,
            "data allowed when opted in"
        )

        var withFile = defaults
        withFile.allowFileUri = true
        checkEqual(blockedCode("file:///tmp/a.jpg", withFile), nil, "file allowed when opted in")
    }

    private static func testBlocksCredentials() {
        checkEqual(
            blockedCode("https://user:secret@example.com/a.jpg"),
            "URI_CREDENTIALS",
            "credentials blocked"
        )
        var opted = defaults
        opted.allowUriCredentials = true
        checkEqual(
            blockedCode("https://user:secret@example.com/a.jpg", opted),
            nil,
            "credentials allowed when opted in"
        )
    }

    private static func testBlocksControlCharacters() {
        checkEqual(
            blockedCode("https://example.com/a.jpg\r\nX-Injected: 1"),
            "CONTROL_CHARACTERS",
            "crlf in uri blocked"
        )
    }

    private static func testBlocksEmptyAndMalformed() {
        checkEqual(blockedCode(""), "EMPTY_URI", "empty blocked")
        checkEqual(blockedCode("   "), "EMPTY_URI", "blank blocked")
        checkEqual(blockedCode("not-a-uri"), "MALFORMED_URI", "no scheme blocked")
        checkEqual(blockedCode("https:///a.jpg"), "HOST_MISSING", "missing host blocked")
    }

    private static func testBlocksPrivateHosts() {
        for host in [
            "localhost",
            "127.0.0.1",
            "10.1.2.3",
            "192.168.1.1",
            "172.16.0.1",
            "169.254.169.254",
            "[::1]",
            "metadata.google.internal",
        ] {
            checkEqual(
                blockedCode("https://\(host)/a.jpg"),
                "PRIVATE_HOST_BLOCKED",
                "private host blocked: \(host)"
            )
        }
    }

    private static func testAllowsPublicHosts() {
        check(!NextImageSecurity.isPrivateHost("8.8.8.8"), "8.8.8.8 is public")
        check(!NextImageSecurity.isPrivateHost("172.32.0.1"), "172.32.0.1 is public")
        check(!NextImageSecurity.isPrivateHost("example.com"), "example.com is public")
        check(NextImageSecurity.isPrivateHost("172.31.255.255"), "172.31.255.255 is private")
    }

    private static func testHostAllowAndBlockLists() {
        var allowOnly = defaults
        allowOnly.allowedHosts = ["*.cdn.example.com"]
        checkEqual(blockedCode("https://img.cdn.example.com/a.jpg", allowOnly), nil, "subdomain allowed")
        checkEqual(blockedCode("https://cdn.example.com/a.jpg", allowOnly), nil, "apex allowed")
        checkEqual(
            blockedCode("https://evil.example.com/a.jpg", allowOnly),
            "HOST_NOT_ALLOWED",
            "host outside allow list blocked"
        )

        var both = defaults
        both.allowedHosts = ["*.example.com"]
        both.blockedHosts = ["tracker.example.com"]
        checkEqual(
            blockedCode("https://tracker.example.com/a.jpg", both),
            "HOST_BLOCKED",
            "block list wins over allow list"
        )
    }

    private static func testParsesAuthority() {
        guard let parsed = NextImageSecurity
            .parseUri("https://user@Images.Example.com:8443/a/b.jpg?x=1#f")
        else {
            check(false, "authority parsed")
            return
        }
        checkEqual(parsed.scheme, "https", "scheme parsed")
        checkEqual(parsed.userInfo, "user", "user info parsed")
        checkEqual(parsed.host, "images.example.com", "host lowercased")
        checkEqual(parsed.port, 8443, "port parsed")
        checkEqual(parsed.path, "/a/b.jpg", "path parsed")
        checkEqual(parsed.query, "x=1", "query parsed")
    }

    private static func testHostPatterns() {
        check(NextImageSecurity.hostMatches("a.example.com", pattern: "*"), "wildcard matches all")
        check(
            NextImageSecurity.hostMatches("a.example.com", pattern: ".example.com"),
            "leading dot matches subdomain"
        )
        check(
            !NextImageSecurity.hostMatches("evil-example.com", pattern: "*.example.com"),
            "suffix confusion rejected"
        )
        check(
            NextImageSecurity.hostMatches("Example.COM", pattern: "example.com"),
            "case insensitive exact match"
        )
    }

    // MARK: Headers

    private static func testSanitizesHeaders() {
        let result = NextImageSecurity.sanitizeHeaders(
            [
                ("Authorization", "Bearer token"),
                ("X-Bad", "value\r\nX-Injected: 1"),
                ("Bad Name", "value"),
                ("Host", "evil.example.com"),
                ("Content-Length", "0"),
                ("X-Ok", "fine"),
            ],
            config: defaults
        )

        checkEqual(result.headers.count, 2, "two headers survive")
        checkEqual(result.headers["Authorization"], "Bearer token", "authorization kept")
        checkEqual(result.headers["X-Ok"], "fine", "valid header kept")
        checkEqual(
            result.rejected,
            ["X-Bad", "Bad Name", "Host", "Content-Length"],
            "unsafe headers rejected in order"
        )
    }

    private static func testCapsHeaderCount() {
        var config = defaults
        config.maxHeaderCount = 5
        let many = (1 ... 30).map { (name: "X-H\($0)", value: "v\($0)") }
        let result = NextImageSecurity.sanitizeHeaders(many, config: config)
        checkEqual(result.headers.count, 5, "header count capped")
        checkEqual(result.rejected.count, 25, "excess headers rejected")
    }

    private static func testCapsHeaderLengths() {
        var config = defaults
        config.maxHeaderNameLength = 8
        config.maxHeaderValueLength = 4
        let result = NextImageSecurity.sanitizeHeaders(
            [("X-Very-Long-Name", "v"), ("X-Ok", "toolong")],
            config: config
        )
        check(result.headers.isEmpty, "oversized headers dropped")
        checkEqual(result.rejected.count, 2, "both oversized headers reported")
    }

    private static func testRedactsUris() {
        checkEqual(
            NextImageSecurity.redactUri("https://user:pw@example.com/a.jpg?token=secret"),
            "https://example.com/a.jpg?<redacted>",
            "credentials and query redacted"
        )
        checkEqual(
            NextImageSecurity.redactUri("data:image/png;base64,AAAA"),
            "data:<redacted>",
            "data uri redacted"
        )
        checkEqual(NextImageSecurity.redactUri("::::"), "<invalid-uri>", "invalid uri redacted")
    }

    private static func testCapsDataUriSize() {
        var config = defaults
        config.allowDataUri = true
        config.maxDataUriBytes = 10
        checkEqual(
            blockedCode("data:image/png;base64," + String(repeating: "A", count: 200), config),
            "DATA_URI_TOO_LARGE",
            "oversized data uri blocked"
        )
        checkEqual(
            blockedCode("data:image/png;base64,AAAA", config),
            nil,
            "small data uri allowed"
        )
    }

    // MARK: Config

    private static func testConfigParsing() {
        var config = NextImageConfig()
        check(!config.allowInsecureHttp, "http off by default")
        check(config.blockPrivateNetworks, "private networks blocked by default")
        check(!config.respectServerCacheHeaders, "cache duration owns expiry by default")

        config.apply(options: [
            "allowInsecureHttp": true,
            "blockPrivateNetworks": false,
            "allowedHosts": ["a.example.com", "", "b.example.com"],
            "memoryCacheBytes": 64.0 * 1024 * 1024,
            "diskCacheBytes": 512.0 * 1024 * 1024,
            "requestTimeoutMs": 15000.0,
            "maxHeaderCount": 8.0,
            "maxDataUriBytes": 4096.0,
        ])

        check(config.allowInsecureHttp, "http opt in applied")
        check(!config.blockPrivateNetworks, "private network opt out applied")
        checkEqual(config.allowedHosts ?? [], ["a.example.com", "b.example.com"], "blank hosts dropped")
        checkEqual(config.memoryCacheBytes, 64 * 1024 * 1024, "memory limit applied")
        checkEqual(config.diskCacheBytes, 512 * 1024 * 1024, "disk limit applied")
        checkEqual(config.requestTimeoutMs, 15000, "timeout applied")
        checkEqual(config.maxHeaderCount, 8, "header count applied")
        checkEqual(config.maxDataUriBytes, 4096, "data uri cap applied")

        var clamped = NextImageConfig()
        clamped.apply(options: [
            "memoryCacheBytes": 1.0,
            "diskCacheBytes": 1.0,
            "requestTimeoutMs": 1.0,
        ])
        checkEqual(clamped.memoryCacheBytes, NextImageConfig.minMemoryCacheBytes, "memory clamped")
        checkEqual(clamped.diskCacheBytes, NextImageConfig.minDiskCacheBytes, "disk clamped")
        checkEqual(clamped.requestTimeoutMs, 1000, "timeout clamped")

        var ignored = NextImageConfig()
        ignored.apply(options: [
            "memoryCacheBytes": -5.0,
            "maxHeaderCount": "eight",
            "allowInsecureHttp": "yes",
        ])
        checkEqual(ignored.memoryCacheBytes, 0, "negative size ignored")
        checkEqual(ignored.maxHeaderCount, 24, "non numeric ignored")
        check(!ignored.allowInsecureHttp, "non boolean ignored")
    }

    private static func testCertificatePinParsing() {
        let goodPin = "sha256/" + String(repeating: "A", count: 43) + "="
        var config = NextImageConfig()
        config.apply(options: [
            "certificatePins": [
                "a.example.com": [goodPin, "sha256/tooshort"],
                "b.example.com": ["not-a-pin"],
                "c.example.com": [String](),
            ],
        ])

        // A malformed pin must never count as a pin, and a host left with none is dropped.
        checkEqual(config.certificatePins.count, 1, "only the valid host is pinned")
        checkEqual(config.certificatePins["a.example.com"] ?? [], [goodPin], "malformed pin dropped")
    }

    private static func testLoaderRebuildDetection() {
        let base = NextImageConfig()

        var disk = base
        disk.diskCacheBytes = 1_000_000
        check(
            NextImageConfig.requiresLoaderRebuild(base, disk),
            "disk size change rebuilds the loader"
        )

        var timeout = base
        timeout.requestTimeoutMs = 5000
        check(
            NextImageConfig.requiresLoaderRebuild(base, timeout),
            "timeout change rebuilds the loader"
        )

        var hosts = base
        hosts.blockedHosts = ["x.example.com"]
        check(
            !NextImageConfig.requiresLoaderRebuild(base, hosts),
            "host list change does not rebuild the loader"
        )
    }
}
