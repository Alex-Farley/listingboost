// Spike: decode HEIC in Chromium with libheif (WebAssembly), convert to JPEG with a canvas.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const dir = process.argv[2];
const bundle = readFileSync(`${dir}/js/node_modules/libheif-js/libheif-wasm/libheif-bundle.js`);
const files = ["autumn_1440x960.heic", "iphone-12mp.heic", "iphone-48mp.heic"];
const page_html = `<!doctype html><meta charset="utf-8"><script src="/libheif.js"></script>`;
const browser = await chromium.launch();
for (const csp of [null, "default-src 'self'", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'"]) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  await page.route("http://heic.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = csp ? { "Content-Security-Policy": csp } : {};
    if (path === "/") return route.fulfill({ body: page_html, contentType: "text/html", headers });
    if (path === "/libheif.js") return route.fulfill({ body: bundle, contentType: "text/javascript", headers });
    return route.fulfill({ body: readFileSync(`${dir}${path}`), contentType: "image/heic", headers });
  });
  await page.goto("http://heic.test/");
  console.log(`--- CSP: ${csp ?? "none"}`);
  for (const file of files) {
    const result = await page.evaluate(async (name) => {
      try {
        const bytes = new Uint8Array(await (await fetch(`/${name}`)).arrayBuffer());
        const t0 = performance.now();
        const lib = await libheif();
        const decoder = new lib.HeifDecoder();
        const image = decoder.decode(bytes)[0];
        const width = image.get_width(), height = image.get_height();
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        const imageData = ctx.createImageData(width, height);
        await new Promise((resolve, reject) => image.display(imageData, (out) => (out ? resolve(out) : reject(new Error("decode failed")))));
        const decodeMs = Math.round(performance.now() - t0);
        ctx.putImageData(imageData, 0, 0);
        const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
        return { name, width, height, decodeMs, totalMs: Math.round(performance.now() - t0), jpegBytes: jpeg.size, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6) };
      } catch (e) {
        return { name, error: String(e).slice(0, 200) };
      }
    }, file);
    console.log(JSON.stringify(result));
  }
  if (errors.length) console.log("console errors:", errors.slice(0, 2));
  await page.close();
}
await browser.close();
