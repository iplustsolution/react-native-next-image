#!/usr/bin/env bash
# Compiles and runs the assertions for ios/NextImageSecurity.swift.
#
# The security module imports only Foundation, so it runs without Xcode, a
# simulator or an app target. Anything that needs UIKit or Kingfisher is
# covered by the iOS build job instead.
set -euo pipefail

if ! command -v swiftc > /dev/null 2>&1; then
  echo "swiftc not found; skipping the iOS security tests." >&2
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

swiftc -O \
  -o "$OUT/next-image-security-tests" \
  "$ROOT/ios/NextImageSecurity.swift" \
  "$ROOT/tests/ios/NextImageSecurityTests.swift"

"$OUT/next-image-security-tests"
