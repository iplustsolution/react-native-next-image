/**
 * URL and header hardening for NextImage.
 *
 * Everything in this module is dependency free and synchronous so that the
 * same rules can be mirrored in Kotlin (`NextImageSecurity.kt`) and Swift
 * (`NextImageSecurity.swift`). The JS layer is the first line of defence: a
 * request that fails validation here never reaches the native image loader.
 */

export type SecurityErrorCode =
  | 'EMPTY_URI'
  | 'URI_TOO_LONG'
  | 'MALFORMED_URI'
  | 'SCHEME_NOT_ALLOWED'
  | 'INSECURE_SCHEME'
  | 'DATA_URI_NOT_ALLOWED'
  | 'DATA_URI_TOO_LARGE'
  | 'FILE_URI_NOT_ALLOWED'
  | 'URI_CREDENTIALS'
  | 'HOST_MISSING'
  | 'HOST_NOT_ALLOWED'
  | 'HOST_BLOCKED'
  | 'PRIVATE_HOST_BLOCKED'
  | 'CONTROL_CHARACTERS';

export type HeaderRejectionCode =
  | 'INVALID_NAME'
  | 'INVALID_VALUE'
  | 'FORBIDDEN_HEADER'
  | 'NAME_TOO_LONG'
  | 'VALUE_TOO_LONG'
  | 'TOO_MANY_HEADERS';

export type SecurityConfig = {
  /** Allow plain `http://` sources. Off by default: tokens must not travel in clear text. */
  allowInsecureHttp: boolean;
  /** Allow inline `data:` sources. */
  allowDataUri: boolean;
  /** Allow `file://` sources. */
  allowFileUri: boolean;
  /** When set, only these hosts may be loaded. `null` means "no allow-list". */
  allowedHosts: readonly string[] | null;
  /** Hosts that are always rejected, even when they match `allowedHosts`. */
  blockedHosts: readonly string[];
  /** Reject loopback, link-local, private-range and cloud-metadata hosts. */
  blockPrivateNetworks: boolean;
  /** Reject `https://user:password@host/...` style URLs. */
  allowUriCredentials: boolean;
  /** Hard cap on the length of a source URI. */
  maxUriLength: number;
  /** Hard cap on the decoded byte length of a `data:` URI. */
  maxDataUriBytes: number;
  /** Hard cap on the number of custom request headers. */
  maxHeaderCount: number;
  maxHeaderNameLength: number;
  maxHeaderValueLength: number;
  /**
   * SPKI pins per host, in OkHttp/`openssl` format:
   * `{ 'images.example.com': ['sha256/AAAAAAAA...='] }`.
   * A host with pins configured fails closed when no pin matches.
   */
  certificatePins: Readonly<Record<string, readonly string[]>>;
};

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  allowInsecureHttp: false,
  allowDataUri: false,
  allowFileUri: false,
  allowedHosts: null,
  blockedHosts: [],
  blockPrivateNetworks: true,
  allowUriCredentials: false,
  maxUriLength: 8192,
  maxDataUriBytes: 2 * 1024 * 1024,
  maxHeaderCount: 24,
  maxHeaderNameLength: 128,
  maxHeaderValueLength: 8192,
  certificatePins: {},
};

/**
 * Headers an image request must never set: they either let a caller rewrite
 * the request line, smuggle a second request, or break connection framing.
 */
const FORBIDDEN_HEADERS: readonly string[] = [
  'connection',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
];

/** Header values that are logged as `***` instead of verbatim. */
const SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
];

let config: SecurityConfig = { ...DEFAULT_SECURITY_CONFIG };

export function configureSecurity(next: Partial<SecurityConfig>): void {
  config = { ...config, ...next };
}

export function getSecurityConfig(): SecurityConfig {
  return { ...config };
}

/** Test helper: restore the shipped defaults. */
export function resetSecurityConfig(): void {
  config = { ...DEFAULT_SECURITY_CONFIG };
}

export type ParsedUri = {
  scheme: string;
  userinfo: string | null;
  host: string | null;
  port: number | null;
  path: string;
  query: string | null;
  fragment: string | null;
};

// scheme ":" [ "//" authority ] path [ "?" query ] [ "#" fragment ]
const URI_PATTERN =
  /^([a-zA-Z][a-zA-Z0-9+.-]*):(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * A deliberately strict URI parser. React Native ships an incomplete `URL`
 * polyfill that does not expose a reliable `hostname`, so the parsing that
 * security decisions depend on is done here instead.
 */
export function parseUri(uri: string): ParsedUri | null {
  const match = URI_PATTERN.exec(uri);
  if (!match) {
    return null;
  }

  const scheme = (match[1] ?? '').toLowerCase();
  const authority = match[3];
  let userinfo: string | null = null;
  let host: string | null = null;
  let port: number | null = null;

  if (authority !== undefined) {
    let rest = authority;
    const at = rest.lastIndexOf('@');
    if (at !== -1) {
      userinfo = rest.slice(0, at);
      rest = rest.slice(at + 1);
    }

    if (rest.startsWith('[')) {
      const close = rest.indexOf(']');
      if (close === -1) {
        return null;
      }
      host = rest.slice(0, close + 1).toLowerCase();
      rest = rest.slice(close + 1);
      if (rest.length > 0 && !rest.startsWith(':')) {
        return null;
      }
    } else {
      const colon = rest.indexOf(':');
      host = (colon === -1 ? rest : rest.slice(0, colon)).toLowerCase();
      rest = colon === -1 ? '' : rest.slice(colon);
    }

    if (rest.startsWith(':')) {
      const digits = rest.slice(1);
      if (digits.length > 0) {
        if (!/^\d{1,5}$/.test(digits)) {
          return null;
        }
        port = Number(digits);
        if (port < 1 || port > 65535) {
          return null;
        }
      }
    }

    if (host.length === 0) {
      host = null;
    }
  }

  return {
    scheme,
    userinfo,
    host,
    port,
    path: match[4] ?? '',
    query: match[6] ?? null,
    fragment: match[8] ?? null,
  };
}

/** `example.com`, `.example.com` and `*.example.com` patterns. */
export function hostMatches(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/^\[|\]$/g, '');
  let normalizedPattern = pattern.toLowerCase().trim();

  if (normalizedPattern.length === 0) {
    return false;
  }
  if (normalizedPattern === '*') {
    return true;
  }
  if (normalizedPattern.startsWith('*.')) {
    normalizedPattern = normalizedPattern.slice(1);
  }
  if (normalizedPattern.startsWith('.')) {
    const bare = normalizedPattern.slice(1);
    return (
      normalizedHost === bare || normalizedHost.endsWith(normalizedPattern)
    );
  }
  return normalizedHost === normalizedPattern;
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Hosts that resolve inside the device or the surrounding network. Loading
 * them from a remote-controlled URL turns the app into an SSRF proxy.
 */
export function isPrivateHost(host: string): boolean {
  const normalized = host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }

  const ipv4 = IPV4_PATTERN.exec(normalized);
  if (ipv4) {
    const octets = [ipv4[1], ipv4[2], ipv4[3], ipv4[4]].map((part) =>
      Number(part)
    );
    if (octets.some((part) => part > 255)) {
      return true; // Not a valid address; fail closed.
    }
    const a = octets[0] as number;
    const b = octets[1] as number;
    if (a === 0 || a === 10 || a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true; // Link-local, including the 169.254.169.254 metadata host.
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true; // Carrier-grade NAT.
    }
    if (a >= 224) {
      return true; // Multicast and reserved.
    }
    return false;
  }

  if (normalized.includes(':')) {
    if (normalized === '::' || normalized === '::1') {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      return isPrivateHost(normalized.slice('::ffff:'.length));
    }
    // fc00::/7 (unique local) and fe80::/10 (link local).
    if (/^f[cd][0-9a-f]{0,2}:/.test(normalized)) {
      return true;
    }
    if (/^fe[89ab][0-9a-f]?:/.test(normalized)) {
      return true;
    }
  }

  return false;
}

export type UriValidation =
  | { ok: true; uri: string; parsed: ParsedUri }
  | { ok: false; code: SecurityErrorCode; message: string };

function reject(code: SecurityErrorCode, message: string): UriValidation {
  return { ok: false, code, message };
}

function estimateDataUriBytes(uri: string): number {
  const comma = uri.indexOf(',');
  if (comma === -1) {
    return uri.length;
  }
  const meta = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  if (/;base64$/i.test(meta)) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  return payload.length;
}

/**
 * Validate a remote or local image URI against the active security config.
 * Returns the trimmed URI on success so callers can pass it straight to native.
 */
export function validateUri(rawUri: string): UriValidation {
  if (typeof rawUri !== 'string') {
    return reject('EMPTY_URI', 'Image source uri must be a string.');
  }

  const uri = rawUri.trim();
  if (uri.length === 0) {
    return reject('EMPTY_URI', 'Image source uri must not be empty.');
  }
  if (uri.length > config.maxUriLength) {
    return reject(
      'URI_TOO_LONG',
      `Image source uri exceeds ${config.maxUriLength} characters.`
    );
  }
  if (CONTROL_CHARACTERS.test(uri)) {
    return reject(
      'CONTROL_CHARACTERS',
      'Image source uri contains control characters.'
    );
  }

  const parsed = parseUri(uri);
  if (!parsed) {
    // The uri itself is not echoed: an unparseable string cannot be redacted,
    // and it may still contain a token.
    return reject('MALFORMED_URI', 'Image source uri is malformed.');
  }

  switch (parsed.scheme) {
    case 'https':
      break;
    case 'http':
      if (!config.allowInsecureHttp) {
        return reject(
          'INSECURE_SCHEME',
          'Plain http:// sources are blocked. Call NextImage.configure({ allowInsecureHttp: true }) to opt in.'
        );
      }
      break;
    case 'data':
      if (!config.allowDataUri) {
        return reject(
          'DATA_URI_NOT_ALLOWED',
          'data: sources are blocked. Call NextImage.configure({ allowDataUri: true }) to opt in.'
        );
      }
      if (estimateDataUriBytes(uri) > config.maxDataUriBytes) {
        return reject(
          'DATA_URI_TOO_LARGE',
          `data: source exceeds ${config.maxDataUriBytes} bytes.`
        );
      }
      return { ok: true, uri, parsed };
    case 'file':
      if (!config.allowFileUri) {
        return reject(
          'FILE_URI_NOT_ALLOWED',
          'file: sources are blocked. Call NextImage.configure({ allowFileUri: true }) to opt in.'
        );
      }
      return { ok: true, uri, parsed };
    // Android resource and content provider uris never touch the network.
    // `require()`d assets do not come through here at all: NextImage resolves
    // them itself and marks them as bundled.
    case 'android.resource':
    case 'content':
      return { ok: true, uri, parsed };
    default:
      return reject(
        'SCHEME_NOT_ALLOWED',
        `Unsupported uri scheme "${parsed.scheme}".`
      );
  }

  if (parsed.userinfo !== null && !config.allowUriCredentials) {
    return reject(
      'URI_CREDENTIALS',
      'Image source uri must not embed credentials.'
    );
  }
  if (!parsed.host) {
    return reject('HOST_MISSING', 'Image source uri has no host.');
  }

  const host = parsed.host;
  if (config.blockedHosts.some((pattern) => hostMatches(host, pattern))) {
    return reject('HOST_BLOCKED', `Host "${host}" is blocked.`);
  }
  if (
    config.allowedHosts !== null &&
    !config.allowedHosts.some((pattern) => hostMatches(host, pattern))
  ) {
    return reject('HOST_NOT_ALLOWED', `Host "${host}" is not allow-listed.`);
  }
  if (config.blockPrivateNetworks && isPrivateHost(host)) {
    return reject(
      'PRIVATE_HOST_BLOCKED',
      `Host "${host}" resolves to a private or loopback address.`
    );
  }

  return { ok: true, uri, parsed };
}

// RFC 7230 token characters.
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Horizontal tab plus printable ASCII and Latin-1; no CR, LF, NUL or DEL.
const HEADER_VALUE_PATTERN = /^[\t\u0020-\u007e\u00a0-\u00ff]*$/;

export type HeaderRejection = {
  name: string;
  code: HeaderRejectionCode;
  message: string;
};

export type SanitizedHeaders = {
  headers: Record<string, string>;
  rejected: HeaderRejection[];
};

/**
 * Drop anything that could be used for request splitting or header smuggling.
 * Bad headers are removed rather than escaped, and the request continues with
 * the remaining valid headers.
 */
export function sanitizeHeaders(
  headers: Record<string, unknown> | null | undefined
): SanitizedHeaders {
  const result: Record<string, string> = {};
  const rejected: HeaderRejection[] = [];

  if (!headers || typeof headers !== 'object') {
    return { headers: result, rejected };
  }

  for (const name of Object.keys(headers)) {
    const rawValue = headers[name];
    if (rawValue === null || rawValue === undefined) {
      continue;
    }
    if (Object.keys(result).length >= config.maxHeaderCount) {
      rejected.push({
        name,
        code: 'TOO_MANY_HEADERS',
        message: `At most ${config.maxHeaderCount} headers are allowed.`,
      });
      continue;
    }
    if (name.length > config.maxHeaderNameLength) {
      rejected.push({
        name,
        code: 'NAME_TOO_LONG',
        message: `Header name exceeds ${config.maxHeaderNameLength} characters.`,
      });
      continue;
    }
    if (!HEADER_NAME_PATTERN.test(name)) {
      rejected.push({
        name,
        code: 'INVALID_NAME',
        message: 'Header name contains characters outside the HTTP token set.',
      });
      continue;
    }
    if (FORBIDDEN_HEADERS.includes(name.toLowerCase())) {
      rejected.push({
        name,
        code: 'FORBIDDEN_HEADER',
        message: `Header "${name}" is managed by the HTTP client and cannot be overridden.`,
      });
      continue;
    }

    const value = typeof rawValue === 'string' ? rawValue : String(rawValue);
    if (value.length > config.maxHeaderValueLength) {
      rejected.push({
        name,
        code: 'VALUE_TOO_LONG',
        message: `Header value exceeds ${config.maxHeaderValueLength} characters.`,
      });
      continue;
    }
    if (!HEADER_VALUE_PATTERN.test(value)) {
      rejected.push({
        name,
        code: 'INVALID_VALUE',
        message:
          'Header value contains control characters (possible request splitting).',
      });
      continue;
    }

    result[name] = value;
  }

  return { headers: result, rejected };
}

/** Replace secret header values with `***` before they reach a log or an event. */
export function redactHeaders(
  headers: Record<string, string> | null | undefined
): Record<string, string> {
  const safe: Record<string, string> = {};
  if (!headers) {
    return safe;
  }
  for (const name of Object.keys(headers)) {
    safe[name] = SENSITIVE_HEADERS.includes(name.toLowerCase())
      ? '***'
      : (headers[name] as string);
  }
  return safe;
}

/** Strip query strings and credentials so a URI can be shown in an error. */
export function redactUri(uri: string): string {
  const parsed = parseUri(uri);
  if (!parsed) {
    return '<invalid-uri>';
  }
  if (parsed.scheme === 'data') {
    return 'data:<redacted>';
  }
  const host = parsed.host ?? '';
  const port = parsed.port === null ? '' : `:${parsed.port}`;
  const query = parsed.query === null ? '' : '?<redacted>';
  return `${parsed.scheme}://${host}${port}${parsed.path}${query}`;
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.includes(name.toLowerCase());
}

/** Pins are `sha256/` + base64 of a 32 byte SHA-256 digest. */
const PIN_PATTERN = /^sha256\/[A-Za-z0-9+/]{43}=$/;

export function validateCertificatePins(
  pins: Readonly<Record<string, readonly string[]>>
): void {
  for (const host of Object.keys(pins)) {
    const hostPins = pins[host];
    if (!hostPins || hostPins.length === 0) {
      throw new Error(
        `NextImage: certificatePins["${host}"] must list at least one pin.`
      );
    }
    for (const pin of hostPins) {
      if (!PIN_PATTERN.test(pin)) {
        throw new Error(
          `NextImage: certificate pin "${pin}" for "${host}" is not a valid sha256/<base64> SPKI pin.`
        );
      }
    }
  }
}
