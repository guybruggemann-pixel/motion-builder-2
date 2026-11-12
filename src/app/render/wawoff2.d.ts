declare module "wawoff2/decompress" {
  /** WOFF2 → TTF (Google's woff2 decoder, compiled to WebAssembly). */
  const decompress: (woff2: Uint8Array) => Promise<Uint8Array>;
  export default decompress;
}
