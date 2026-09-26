declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

// More specific than bun-types' "*.woff" (string path), so TypeScript prefers it.
declare module "@fontsource/*.woff" {
  const data: ArrayBuffer;
  export default data;
}
