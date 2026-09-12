/**
 * Every remote URL the demo uses. picsum.photos redirects to
 * fastly.picsum.photos, which exercises the redirect path as well.
 */

export const GALLERY_IDS: readonly number[] = [
  1015, 1018, 1025, 1035, 1043, 1050, 1062, 1074, 1080, 1084,
];

export function idUri(id: number): string {
  return `https://picsum.photos/id/${id}/600/400`;
}

/** Any seed is valid, which makes it easy to mint a uri nothing else has loaded. */
export function seedUri(seed: string): string {
  return `https://picsum.photos/seed/next-image-${seed}/600/400`;
}

/** A few hundred KB: slow enough to show placeholders and progress. */
export function largeUri(id: number): string {
  return `https://picsum.photos/id/${id}/2000/1333`;
}

export const GALLERY_URIS: readonly string[] = [
  ...GALLERY_IDS.map(idUri),
  ...Array.from({ length: 30 }, (_, n) => seedUri(String(n + 1))),
];

export const LARGE_IMAGE_URI = largeUri(1015);
export const SAMPLE_URI = idUri(1025);

export const NOT_FOUND_URI = 'https://picsum.photos/id/999999/600/400';
export const UNREACHABLE_URI =
  'https://this-host-does-not-exist.invalid/image.jpg';
export const INSECURE_URI = 'http://picsum.photos/id/1015/600/400';
export const PRIVATE_HOST_URI = 'https://10.0.0.1/secret.jpg';
export const FTP_URI = 'ftp://example.com/a.jpg';

/** Slow (5-10 s) but echoes nothing sensitive; good for a headers demo. */
export const HTTPBIN_JPEG_URI = 'https://httpbin.org/image/jpeg';
export const INDIGO_PNG_URI = 'https://dummyimage.com/600x400/6366f1/fff.png';

export const SIGNED_CACHE_KEY = 'signed-demo';

/** Simulates a signed URL: the query string differs on every call. */
export function signedUri(): string {
  return `https://picsum.photos/seed/signed/600/400?token=${Date.now()}`;
}
