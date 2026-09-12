package com.nextimage

/**
 * URL and header hardening, mirroring `src/security.ts`.
 *
 * This file deliberately has no Android or React Native imports so it can be
 * exercised by plain JVM unit tests. The JS layer validates first; this is the
 * second line of defence for anything that reaches native through a preload,
 * a stale bundle, or a direct native caller.
 */
object NextImageSecurity {

  /** Headers that would let a caller rewrite the request line or break framing. */
  private val FORBIDDEN_HEADERS = setOf(
    "connection",
    "content-length",
    "expect",
    "host",
    "keep-alive",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "via",
  )

  /**
   * Schemes Coil loads without a network connection. `require()`d assets do
   * not come through here: the JS layer marks them as bundled and the request
   * factory resolves them directly.
   */
  private val LOCAL_SCHEMES = setOf(
    "android.resource",
    "content",
  )

  private val HEADER_NAME_REGEX = Regex("^[!#$%&'*+\\-.^_`|~0-9A-Za-z]+$")
  private val IPV4_REGEX = Regex("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$")
  private val URI_REGEX =
    Regex("^([a-zA-Z][a-zA-Z0-9+.\\-]*):(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?$")

  data class ParsedUri(
    val scheme: String,
    val userInfo: String?,
    val host: String?,
    val port: Int?,
    val path: String,
    val query: String?,
  )

  sealed class UriResult {
    data class Allowed(val uri: String, val parsed: ParsedUri) : UriResult()
    data class Blocked(val code: String, val message: String) : UriResult()
  }

  fun parseUri(uri: String): ParsedUri? {
    val match = URI_REGEX.matchEntire(uri) ?: return null
    val scheme = match.groupValues[1].lowercase()
    val hasAuthority = match.groups[2] != null
    var userInfo: String? = null
    var host: String? = null
    var port: Int? = null

    if (hasAuthority) {
      var rest = match.groupValues[3]
      val at = rest.lastIndexOf('@')
      if (at != -1) {
        userInfo = rest.substring(0, at)
        rest = rest.substring(at + 1)
      }

      if (rest.startsWith("[")) {
        val close = rest.indexOf(']')
        if (close == -1) return null
        host = rest.substring(0, close + 1).lowercase()
        rest = rest.substring(close + 1)
        if (rest.isNotEmpty() && !rest.startsWith(":")) return null
      } else {
        val colon = rest.indexOf(':')
        host = (if (colon == -1) rest else rest.substring(0, colon)).lowercase()
        rest = if (colon == -1) "" else rest.substring(colon)
      }

      if (rest.startsWith(":")) {
        val digits = rest.substring(1)
        if (digits.isNotEmpty()) {
          val parsedPort = digits.toIntOrNull() ?: return null
          if (parsedPort < 1 || parsedPort > 65535) return null
          port = parsedPort
        }
      }

      if (host.isEmpty()) host = null
    }

    return ParsedUri(
      scheme = scheme,
      userInfo = userInfo,
      host = host,
      port = port,
      path = match.groupValues[4],
      query = match.groups[6]?.value,
    )
  }

  /** Supports `example.com`, `.example.com` and `*.example.com`. */
  fun hostMatches(host: String, pattern: String): Boolean {
    val normalizedHost = host.lowercase().trim('[', ']')
    var normalizedPattern = pattern.lowercase().trim()
    if (normalizedPattern.isEmpty()) return false
    if (normalizedPattern == "*") return true
    if (normalizedPattern.startsWith("*.")) {
      normalizedPattern = normalizedPattern.substring(1)
    }
    if (normalizedPattern.startsWith(".")) {
      val bare = normalizedPattern.substring(1)
      return normalizedHost == bare || normalizedHost.endsWith(normalizedPattern)
    }
    return normalizedHost == normalizedPattern
  }

  /** Loopback, link-local, private-range, CGNAT and cloud metadata hosts. */
  fun isPrivateHost(host: String): Boolean {
    val normalized = host.lowercase().trim('[', ']').trimEnd('.')

    if (normalized == "localhost" ||
      normalized.endsWith(".localhost") ||
      normalized.endsWith(".local") ||
      normalized.endsWith(".internal")
    ) {
      return true
    }

    val ipv4 = IPV4_REGEX.matchEntire(normalized)
    if (ipv4 != null) {
      val octets = (1..4).map { ipv4.groupValues[it].toInt() }
      if (octets.any { it > 255 }) return true
      val a = octets[0]
      val b = octets[1]
      return when {
        a == 0 || a == 10 || a == 127 -> true
        a == 169 && b == 254 -> true
        a == 172 && b in 16..31 -> true
        a == 192 && b == 168 -> true
        a == 100 && b in 64..127 -> true
        a >= 224 -> true
        else -> false
      }
    }

    if (normalized.contains(':')) {
      if (normalized == "::" || normalized == "::1") return true
      if (normalized.startsWith("::ffff:")) {
        return isPrivateHost(normalized.removePrefix("::ffff:"))
      }
      if (Regex("^f[cd][0-9a-f]{0,2}:").containsMatchIn(normalized)) return true
      if (Regex("^fe[89ab][0-9a-f]?:").containsMatchIn(normalized)) return true
    }

    return false
  }

  fun validateUri(rawUri: String?, config: NextImageConfig): UriResult {
    if (rawUri.isNullOrBlank()) {
      return UriResult.Blocked("EMPTY_URI", "Image source uri must not be empty.")
    }

    val uri = rawUri.trim()
    if (uri.length > config.maxUriLength) {
      return UriResult.Blocked(
        "URI_TOO_LONG",
        "Image source uri exceeds ${config.maxUriLength} characters.",
      )
    }
    if (uri.any { it.code < 0x20 || it.code == 0x7f }) {
      return UriResult.Blocked(
        "CONTROL_CHARACTERS",
        "Image source uri contains control characters.",
      )
    }

    val parsed = parseUri(uri)
      ?: return UriResult.Blocked("MALFORMED_URI", "Image source uri is malformed.")

    when (parsed.scheme) {
      "https" -> Unit
      "http" -> if (!config.allowInsecureHttp) {
        return UriResult.Blocked(
          "INSECURE_SCHEME",
          "Plain http:// sources are blocked by the NextImage security policy.",
        )
      }
      "data" -> return when {
        !config.allowDataUri ->
          UriResult.Blocked("DATA_URI_NOT_ALLOWED", "data: sources are blocked.")
        estimateDataUriBytes(uri) > config.maxDataUriBytes ->
          UriResult.Blocked(
            "DATA_URI_TOO_LARGE",
            "data: source exceeds ${config.maxDataUriBytes} bytes.",
          )
        else -> UriResult.Allowed(uri, parsed)
      }
      "file" -> return if (config.allowFileUri) {
        UriResult.Allowed(uri, parsed)
      } else {
        UriResult.Blocked("FILE_URI_NOT_ALLOWED", "file: sources are blocked.")
      }
      else -> return if (LOCAL_SCHEMES.contains(parsed.scheme)) {
        UriResult.Allowed(uri, parsed)
      } else {
        UriResult.Blocked(
          "SCHEME_NOT_ALLOWED",
          "Unsupported uri scheme \"${parsed.scheme}\".",
        )
      }
    }

    if (parsed.userInfo != null && !config.allowUriCredentials) {
      return UriResult.Blocked(
        "URI_CREDENTIALS",
        "Image source uri must not embed credentials.",
      )
    }

    val host = parsed.host
      ?: return UriResult.Blocked("HOST_MISSING", "Image source uri has no host.")

    if (config.blockedHosts.any { hostMatches(host, it) }) {
      return UriResult.Blocked("HOST_BLOCKED", "Host \"$host\" is blocked.")
    }
    val allowed = config.allowedHosts
    if (allowed != null && !allowed.any { hostMatches(host, it) }) {
      return UriResult.Blocked("HOST_NOT_ALLOWED", "Host \"$host\" is not allow-listed.")
    }
    if (config.blockPrivateNetworks && isPrivateHost(host)) {
      return UriResult.Blocked(
        "PRIVATE_HOST_BLOCKED",
        "Host \"$host\" resolves to a private or loopback address.",
      )
    }

    return UriResult.Allowed(uri, parsed)
  }

  data class SanitizedHeaders(
    val headers: Map<String, String>,
    val rejected: List<String>,
  )

  /**
   * Remove headers that could split the request or that the HTTP client owns.
   * Values keep their order; duplicates resolve to the last value seen.
   */
  fun sanitizeHeaders(
    headers: List<Pair<String, String>>,
    config: NextImageConfig,
  ): SanitizedHeaders {
    val accepted = LinkedHashMap<String, String>()
    val rejected = mutableListOf<String>()

    for ((name, value) in headers) {
      if (accepted.size >= config.maxHeaderCount) {
        rejected.add(name)
        continue
      }
      if (name.length > config.maxHeaderNameLength ||
        !HEADER_NAME_REGEX.matches(name) ||
        FORBIDDEN_HEADERS.contains(name.lowercase())
      ) {
        rejected.add(name)
        continue
      }
      if (value.length > config.maxHeaderValueLength || !isValidHeaderValue(value)) {
        rejected.add(name)
        continue
      }
      accepted[name] = value
    }

    return SanitizedHeaders(accepted, rejected)
  }

  /** Decoded length of a data uri, without decoding it. */
  private fun estimateDataUriBytes(uri: String): Long {
    val comma = uri.indexOf(',')
    if (comma == -1) return uri.length.toLong()
    val meta = uri.substring(0, comma)
    val payload = uri.substring(comma + 1)
    if (!meta.endsWith(";base64", ignoreCase = true)) return payload.length.toLong()
    val padding = when {
      payload.endsWith("==") -> 2
      payload.endsWith("=") -> 1
      else -> 0
    }
    return (payload.length * 3L / 4L - padding).coerceAtLeast(0L)
  }

  private fun isValidHeaderValue(value: String): Boolean = value.all { char ->
    val code = char.code
    char == '\t' || (code in 0x20..0x7e) || (code in 0xa0..0xff)
  }

  /** Credential-free, query-free rendering of a uri, safe for logs and events. */
  fun redactUri(uri: String): String {
    val parsed = parseUri(uri) ?: return "<invalid-uri>"
    if (parsed.scheme == "data") return "data:<redacted>"
    val port = parsed.port?.let { ":$it" } ?: ""
    val query = if (parsed.query == null) "" else "?<redacted>"
    return "${parsed.scheme}://${parsed.host ?: ""}$port${parsed.path}$query"
  }
}
