import { describe, expect, it, beforeEach } from '@jest/globals';

import {
  configureSecurity,
  getSecurityConfig,
  hostMatches,
  isPrivateHost,
  isSensitiveHeader,
  parseUri,
  redactHeaders,
  redactUri,
  resetSecurityConfig,
  sanitizeHeaders,
  validateCertificatePins,
  validateUri,
} from '../security';

const codeFor = (uri: string): string | null => {
  const result = validateUri(uri);
  return result.ok ? null : result.code;
};

beforeEach(() => {
  resetSecurityConfig();
});

describe('validateUri', () => {
  it('allows https', () => {
    expect(codeFor('https://images.example.com/a.jpg?v=2')).toBeNull();
  });

  it('blocks plain http unless opted in', () => {
    expect(codeFor('http://images.example.com/a.jpg')).toBe('INSECURE_SCHEME');

    configureSecurity({ allowInsecureHttp: true, blockPrivateNetworks: false });
    expect(codeFor('http://images.example.com/a.jpg')).toBeNull();
  });

  it('blocks schemes that are not image sources', () => {
    // eslint-disable-next-line no-script-url -- the point is that it is refused
    expect(codeFor('javascript:alert(1)')).toBe('SCHEME_NOT_ALLOWED');
    expect(codeFor('ftp://example.com/a.jpg')).toBe('SCHEME_NOT_ALLOWED');
  });

  it('blocks data and file urls unless opted in', () => {
    expect(codeFor('data:image/png;base64,AAAA')).toBe('DATA_URI_NOT_ALLOWED');
    expect(codeFor('file:///tmp/a.jpg')).toBe('FILE_URI_NOT_ALLOWED');

    configureSecurity({ allowDataUri: true, allowFileUri: true });
    expect(codeFor('data:image/png;base64,AAAA')).toBeNull();
    expect(codeFor('file:///tmp/a.jpg')).toBeNull();
  });

  it('caps the size of a data url', () => {
    configureSecurity({ allowDataUri: true, maxDataUriBytes: 10 });
    expect(codeFor(`data:image/png;base64,${'A'.repeat(200)}`)).toBe(
      'DATA_URI_TOO_LARGE'
    );
  });

  it('allows bundled asset schemes without a host', () => {
    expect(codeFor('asset:/images/logo.png')).toBeNull();
  });

  it('blocks credentials embedded in the url', () => {
    expect(codeFor('https://user:secret@example.com/a.jpg')).toBe(
      'URI_CREDENTIALS'
    );

    configureSecurity({ allowUriCredentials: true });
    expect(codeFor('https://user:secret@example.com/a.jpg')).toBeNull();
  });

  it('blocks control characters that could split a request', () => {
    expect(codeFor('https://example.com/a.jpg\r\nX-Injected: 1')).toBe(
      'CONTROL_CHARACTERS'
    );
  });

  it('blocks empty, oversized and malformed urls', () => {
    expect(codeFor('')).toBe('EMPTY_URI');
    expect(codeFor('   ')).toBe('EMPTY_URI');
    expect(codeFor('not-a-uri')).toBe('MALFORMED_URI');
    expect(codeFor('https:///a.jpg')).toBe('HOST_MISSING');

    configureSecurity({ maxUriLength: 20 });
    expect(codeFor(`https://example.com/${'a'.repeat(40)}.jpg`)).toBe(
      'URI_TOO_LONG'
    );
  });

  it('blocks private, loopback and cloud metadata hosts', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.169.254',
      '[::1]',
      'metadata.google.internal',
    ]) {
      expect(codeFor(`https://${host}/a.jpg`)).toBe('PRIVATE_HOST_BLOCKED');
    }
  });

  it('honours the host allow list and block list', () => {
    configureSecurity({ allowedHosts: ['*.cdn.example.com'] });
    expect(codeFor('https://img.cdn.example.com/a.jpg')).toBeNull();
    expect(codeFor('https://cdn.example.com/a.jpg')).toBeNull();
    expect(codeFor('https://evil.example.com/a.jpg')).toBe('HOST_NOT_ALLOWED');

    configureSecurity({
      allowedHosts: ['*.example.com'],
      blockedHosts: ['tracker.example.com'],
    });
    expect(codeFor('https://tracker.example.com/a.jpg')).toBe('HOST_BLOCKED');
  });

  it('returns the trimmed uri on success', () => {
    const result = validateUri('  https://example.com/a.jpg  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.uri).toBe('https://example.com/a.jpg');
    }
  });
});

describe('parseUri', () => {
  it('splits the authority into its parts', () => {
    const parsed = parseUri(
      'https://user@Images.Example.com:8443/a/b.jpg?x=1#f'
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.scheme).toBe('https');
    expect(parsed?.userinfo).toBe('user');
    expect(parsed?.host).toBe('images.example.com');
    expect(parsed?.port).toBe(8443);
    expect(parsed?.path).toBe('/a/b.jpg');
    expect(parsed?.query).toBe('x=1');
    expect(parsed?.fragment).toBe('f');
  });

  it('keeps ipv6 hosts bracketed', () => {
    expect(parseUri('https://[2001:db8::1]:443/a.jpg')?.host).toBe(
      '[2001:db8::1]'
    );
  });

  it('rejects an invalid port', () => {
    expect(parseUri('https://example.com:99999/a.jpg')).toBeNull();
    expect(parseUri('https://example.com:abc/a.jpg')).toBeNull();
  });
});

describe('hostMatches', () => {
  it('supports exact, dotted and wildcard patterns', () => {
    expect(hostMatches('a.example.com', '*')).toBe(true);
    expect(hostMatches('a.example.com', '.example.com')).toBe(true);
    expect(hostMatches('example.com', '*.example.com')).toBe(true);
    expect(hostMatches('Example.COM', 'example.com')).toBe(true);
  });

  it('does not fall for suffix confusion', () => {
    expect(hostMatches('evil-example.com', '*.example.com')).toBe(false);
    expect(hostMatches('example.com.evil.test', 'example.com')).toBe(false);
    expect(hostMatches('a.example.com', '')).toBe(false);
  });
});

describe('isPrivateHost', () => {
  it('recognises reserved ranges', () => {
    expect(isPrivateHost('10.0.0.1')).toBe(true);
    expect(isPrivateHost('172.31.255.255')).toBe(true);
    expect(isPrivateHost('100.64.0.1')).toBe(true);
    expect(isPrivateHost('239.255.255.250')).toBe(true);
    expect(isPrivateHost('fe80::1')).toBe(true);
    expect(isPrivateHost('fd00::1')).toBe(true);
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
  });

  it('leaves public addresses alone', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(isPrivateHost('172.32.0.1')).toBe(false);
    expect(isPrivateHost('2001:db8::1')).toBe(false);
    expect(isPrivateHost('images.example.com')).toBe(false);
  });
});

describe('sanitizeHeaders', () => {
  it('drops headers that could split or smuggle a request', () => {
    const { headers, rejected } = sanitizeHeaders({
      'Authorization': 'Bearer token',
      'X-Bad': 'value\r\nX-Injected: 1',
      'Bad Name': 'value',
      'Host': 'evil.example.com',
      'Content-Length': '0',
      'X-Ok': 'fine',
    });

    expect(headers).toEqual({
      'Authorization': 'Bearer token',
      'X-Ok': 'fine',
    });
    expect(rejected.map((entry) => [entry.name, entry.code])).toEqual([
      ['X-Bad', 'INVALID_VALUE'],
      ['Bad Name', 'INVALID_NAME'],
      ['Host', 'FORBIDDEN_HEADER'],
      ['Content-Length', 'FORBIDDEN_HEADER'],
    ]);
  });

  it('skips null and undefined values without rejecting them', () => {
    const { headers, rejected } = sanitizeHeaders({
      'X-A': null,
      'X-B': undefined,
      'X-C': 'value',
    });
    expect(headers).toEqual({ 'X-C': 'value' });
    expect(rejected).toHaveLength(0);
  });

  it('caps the header count and lengths', () => {
    configureSecurity({ maxHeaderCount: 3 });
    const many = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`X-H${index}`, 'v'])
    );
    const capped = sanitizeHeaders(many);
    expect(Object.keys(capped.headers)).toHaveLength(3);
    expect(capped.rejected).toHaveLength(7);
    expect(capped.rejected[0]?.code).toBe('TOO_MANY_HEADERS');

    resetSecurityConfig();
    configureSecurity({ maxHeaderNameLength: 4, maxHeaderValueLength: 4 });
    const lengths = sanitizeHeaders({ 'X-Long-Name': 'v', 'X-Ok': 'toolong' });
    expect(lengths.headers).toEqual({});
    expect(lengths.rejected.map((entry) => entry.code)).toEqual([
      'NAME_TOO_LONG',
      'VALUE_TOO_LONG',
    ]);
  });

  it('handles a missing header object', () => {
    expect(sanitizeHeaders(undefined).headers).toEqual({});
    expect(sanitizeHeaders(null).headers).toEqual({});
  });
});

describe('redaction', () => {
  it('hides secret header values', () => {
    expect(
      redactHeaders({ Authorization: 'Bearer token', Accept: 'image/webp' })
    ).toEqual({ Authorization: '***', Accept: 'image/webp' });
  });

  it('hides credentials and query strings in urls', () => {
    expect(redactUri('https://user:pw@example.com/a.jpg?token=secret')).toBe(
      'https://example.com/a.jpg?<redacted>'
    );
    expect(redactUri('data:image/png;base64,AAAA')).toBe('data:<redacted>');
    expect(redactUri('::::')).toBe('<invalid-uri>');
  });

  it('knows which headers are sensitive', () => {
    expect(isSensitiveHeader('AUTHORIZATION')).toBe(true);
    expect(isSensitiveHeader('Accept')).toBe(false);
  });
});

describe('validateCertificatePins', () => {
  const goodPin = `sha256/${'A'.repeat(43)}=`;

  it('accepts well formed spki pins', () => {
    expect(() =>
      validateCertificatePins({ 'a.example.com': [goodPin] })
    ).not.toThrow();
  });

  it('rejects malformed pins loudly rather than weakening tls', () => {
    expect(() =>
      validateCertificatePins({ 'a.example.com': ['sha256/short'] })
    ).toThrow(/not a valid sha256/);
    expect(() => validateCertificatePins({ 'a.example.com': [] })).toThrow(
      /at least one pin/
    );
  });
});

describe('configureSecurity', () => {
  it('merges into the active config and can be reset', () => {
    configureSecurity({ allowInsecureHttp: true });
    expect(getSecurityConfig().allowInsecureHttp).toBe(true);
    expect(getSecurityConfig().blockPrivateNetworks).toBe(true);

    resetSecurityConfig();
    expect(getSecurityConfig().allowInsecureHttp).toBe(false);
  });
});
