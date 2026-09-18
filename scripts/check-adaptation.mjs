#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const findings = [];

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

function reportMatches(files, pattern, message) {
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) findings.push(`${relative(ROOT, file)}:${index + 1} — ${message}`);
      });
  }
}

const productFiles = [
  ...sourceFiles(join(ROOT, "src", "layouts")),
  ...sourceFiles(join(ROOT, "src", "routes")),
];
const landingPath = join(ROOT, "src", "landing-content.ts");
if (existsSync(landingPath)) productFiles.push(landingPath);

if (!existsSync(landingPath)) {
  findings.push("src/landing-content.ts — generated landing content is required");
} else {
  const landingSource = readFileSync(landingPath, "utf8");
  for (const section of ["hero", "preview", "steps", "features", "showcase", "finalCta"]) {
    if (!new RegExp(`\\b${section}\\s*:`).test(landingSource)) {
      findings.push(`src/landing-content.ts — missing required ${section} section`);
    }
  }

  let landingContent;
  try {
    ({ landingContent } = await import(pathToFileURL(landingPath).href));
  } catch (error) {
    findings.push(
      `src/landing-content.ts — cannot load generated landing content: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (landingContent != null) {
    const media = [
      landingContent.preview.kind === "media" ? landingContent.preview.media : undefined,
      landingContent.steps.items[2]?.preview.media,
      ...landingContent.showcase.items.map((item) => item.media),
      landingContent.finalCta.backgroundMedia,
    ].filter(Boolean);
    const landingAssets = [];

    for (const item of media) {
      const asset = item.src;
      if (!asset.startsWith("/assets/landing/")) {
        findings.push(
          `src/landing-content.ts — generate dedicated landing media under /assets/landing/: ${asset}`,
        );
        continue;
      }
      const assetPath = join(ROOT, "public", asset.slice(1));
      if (!existsSync(assetPath)) {
        findings.push(`src/landing-content.ts — landing asset does not exist: ${asset}`);
        continue;
      }
      landingAssets.push({ asset, path: assetPath });
    }

    if (landingAssets.length < 2) {
      findings.push(
        "src/landing-content.ts — generate separate owned media for the result preview and showcase",
      );
    }

    const sourcePaths = new Set();
    const contentHashes = new Map();
    for (const { asset, path } of landingAssets) {
      if (sourcePaths.has(asset)) {
        findings.push(`src/landing-content.ts — do not reuse landing media: ${asset}`);
      }
      sourcePaths.add(asset);

      const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
      const existing = contentHashes.get(hash);
      if (existing != null && existing !== asset) {
        findings.push(
          `src/landing-content.ts — ${asset} duplicates ${existing}; generate distinct section media`,
        );
      } else {
        contentHashes.set(hash, asset);
      }
    }
  }
}

reportMatches(
  productFiles,
  /\bTEMPLATE_DEMO\b|\bdemo(?:=\{true\}|\s)/,
  "remove explicit template demo mode and provide real data",
);
reportMatches(
  productFiles,
  /PLACEHOLDER ASSETS|["']\/presets\//,
  "replace shipped demo media with product-specific generated assets",
);
reportMatches(
  productFiles,
  /(?:picsum\.photos|placehold\.co|via\.placeholder|images\.unsplash\.com)/i,
  "replace remote placeholder or stock media with owned/generated assets",
);
reportMatches(
  productFiles,
  /\bsetTimeout\s*\(|\bMath\.random\s*\(/,
  "replace simulated product behavior with the real flow",
);

const demoAssetDir = join(ROOT, "public", "presets");
if (existsSync(demoAssetDir)) {
  for (const entry of readdirSync(demoAssetDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      findings.push(
        `${relative(ROOT, join(demoAssetDir, entry.name))} — remove shipped demo media`,
      );
    }
  }
}

if (findings.length > 0) {
  console.error("App Detail scaffold adaptation is incomplete:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  console.error("\nReplace the product demo content, then rerun bun run check:adapted.");
  process.exit(1);
}

console.log("App Detail scaffold adaptation check passed.");
