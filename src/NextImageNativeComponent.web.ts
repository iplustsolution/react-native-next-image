/**
 * Web build shim.
 *
 * The native module deep-imports `codegenNativeComponent`, which only exists
 * in React Native, so bundling the real file for web fails at resolve time.
 * There is no native view on web: `NextImage` detects that and renders the
 * platform image instead, which lets the browser cache do the caching.
 */
export default null;
