/** The Emscripten module for Google's woff2 decoder. See scripts/build-woff2-decoder.ts. */
export type Woff2Module = {
  /** Returns the decoded SFNT bytes, or `false` when the input is not a valid WOFF2 font. */
  decompress(bytes: Uint8Array): ArrayLike<number> | false;
};

export function createWoff2Module(wasm: WebAssembly.Module | ArrayBuffer): Promise<Woff2Module>;
