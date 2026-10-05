import libheif from "libheif-js/wasm-bundle.js";
import { readFileSync } from "node:fs";
const file = process.argv[2];
const input = readFileSync(file);
const t0 = performance.now();
const decoder = new libheif.HeifDecoder();
const images = decoder.decode(input);
const image = images[0];
const width = image.get_width(), height = image.get_height();
const pixels = await new Promise((resolve, reject) => {
  const data = new Uint8ClampedArray(width * height * 4);
  image.display({ data, width, height }, (out) => (out ? resolve(out.data) : reject(new Error("decode failed"))));
});
const ms = Math.round(performance.now() - t0);
let nonzero = 0; for (let i = 0; i < pixels.length; i += 4097) if (pixels[i]) nonzero++;
console.log(JSON.stringify({ file: file.split("/").pop(), width, height, images: images.length, decodeMs: ms, rssMB: Math.round(process.memoryUsage().rss / 1e6), sampleNonzero: nonzero > 0 }));
