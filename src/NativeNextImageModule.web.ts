/**
 * Web build shim.
 *
 * `TurboModuleRegistry` does not exist in react-native-web, so the real spec
 * cannot be bundled for web. `NextImage` treats a missing module as "no native
 * cache control available" and every cache API resolves to a no-op.
 */
export default null;
