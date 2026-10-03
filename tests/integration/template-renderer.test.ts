import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { graphicLayout, RenderBrandAssetProcessor, SvgTemplateRenderer, textOf, type BrandVoice, type RenderRequest } from "@listingboost/ai";
import type { PropertyFacts } from "@listingboost/domain";
import { validateImageUpload } from "@listingboost/storage";
import { DEFAULT_TEMPLATES, newestTemplate } from "@listingboost/templates";
import { fixture, fontFixtures, solidPng } from "../support/fixtures";
import { renderAssetsFromDisk } from "../support/render-assets";

const brand: BrandVoice = {
  agencyName: "Orchard Estates",
  officeAddress: null,
  contactPhone: "01582 000000",
  contactEmail: null,
  website: null,
  primaryColour: "#2a3b5c",
  secondaryColour: null,
  headingFont: null,
  bodyFont: null,
  logo: null,
};

const facts: PropertyFacts = {
  title: "12 Orchard Way, Harpenden",
  addressLine1: "12 Orchard Way",
  addressLine2: null,
  town: "Harpenden",
  county: null,
  postcode: "AL5 2AB",
  propertyType: "semi_detached",
  bedrooms: 3,
  bathrooms: 2,
  receptionRooms: null,
  floorArea: null,
  price: { amount: 650000, qualifier: "guide_price" },
  tenure: null,
  parking: null,
  garden: null,
  keyFeatures: [],
  description: "",
};
const unknownFacts: PropertyFacts = { ...facts, bedrooms: null, bathrooms: null, price: null };

const graphics = DEFAULT_TEMPLATES.filter((t) => t.capability === "template_render");
const request = (templateId: string, overrides: Partial<RenderRequest> = {}): RenderRequest => {
  const t = graphics.find((g) => g.id === templateId)!;
  return {
    template: { id: t.id, version: t.version, config: t.config },
    photo: { bytes: fixture("photo-800x600.jpg"), contentType: "image/jpeg" },
    facts,
    brand,
    texts: { headline: "3 bedroom semi-detached house in Harpenden", cta: "Call Orchard Estates on 01582 000000 to arrange a viewing." },
    ...overrides,
  };
};

describe("R7b graphic layout uses only recorded information", () => {
  test("headline, key facts, CTA and agency come from copy, facts and brand", () => {
    const text = textOf(graphicLayout(request("social-square")));
    expect(text).toContain("3 bedroom semi-detached house in Harpenden");
    expect(text).toContain("3 bedrooms · 2 bathrooms");
    expect(text).toContain("Guide price £650,000");
    expect(text).toContain("Call Orchard Estates on 01582 000000 to arrange a viewing.");
    expect(text).toContain("Orchard Estates");
  });

  test("unknown facts never appear", () => {
    const text = textOf(graphicLayout(request("story", { facts: unknownFacts, texts: { headline: null, cta: null } }))).toLowerCase();
    for (const word of ["bedroom", "bathroom", "£", "price"]) expect(text).not.toContain(word);
  });

  test("without copy it falls back to the recorded title, and omits the CTA", () => {
    const text = textOf(graphicLayout(request("social-portrait", { texts: { headline: null, cta: null } })));
    expect(text).toContain("12 Orchard Way, Harpenden");
    expect(text).not.toContain("viewing");
  });

  test("brand colour is used when set, with the template fallback otherwise", () => {
    expect(JSON.stringify(graphicLayout(request("social-square")))).toContain("#2a3b5c");
    expect(JSON.stringify(graphicLayout(request("social-square", { brand: { ...brand, primaryColour: null } })))).toContain("#1d2433");
  });

  test("the photograph is embedded unaltered as the image layer", () => {
    const layout = JSON.stringify(graphicLayout(request("social-square")));
    expect(layout).toContain(`data:image/jpeg;base64,${Buffer.from(fixture("photo-800x600.jpg")).toString("base64").slice(0, 40)}`);
  });
});

describe("R7b rendering", () => {
  const renderer = new SvgTemplateRenderer(renderAssetsFromDisk());

  for (const [id, width, height] of [
    ["social-square", 1080, 1080],
    ["social-portrait", 1080, 1350],
    ["story", 1080, 1920],
  ] as const) {
    test(`${id} renders a valid ${width}x${height} PNG`, async () => {
      const output = await renderer.render(request(id));
      expect(output.contentType).toBe("image/png");
      expect({ width: output.width, height: output.height }).toEqual({ width, height });
      expect(validateImageUpload({ bytes: output.bytes, filename: "x.png", declaredType: "image/png" })).toEqual({
        contentType: "image/png",
        width,
        height,
      });
      expect(output.bytes.length).toBeGreaterThan(50_000);
    }, 30_000);
  }

  test("renders PNG and WebP source photos too", async () => {
    for (const [file, type] of [
      ["photo-800x600.png", "image/png"],
      ["photo-800x600.webp", "image/webp"],
    ] as const) {
      const output = await renderer.render(request("social-square", { photo: { bytes: fixture(file), contentType: type } }));
      expect(output.width).toBe(1080);
    }
  }, 30_000);

  test("identifies itself as a non-AI renderer", () => {
    expect(renderer.info).toEqual({ provider: "listingboost-render", model: "satori-resvg-1", promptVersion: "layout-v1" });
  });
});

// ── Work item 001: brand panel v2 and the Full photo layout ───────────────────────────────

type LayoutNode = ReturnType<typeof graphicLayout>;
const walk = (node: LayoutNode | string, visit: (n: LayoutNode) => void): void => {
  if (typeof node === "string") return;
  visit(node);
  const children = node.props.children;
  if (children === undefined) return;
  for (const child of Array.isArray(children) ? children : [children]) walk(child as LayoutNode | string, visit);
};
const nodes = (layout: LayoutNode, type?: string) => {
  const found: LayoutNode[] = [];
  walk(layout, (n) => {
    if (!type || n.type === type) found.push(n);
  });
  return found;
};
const styleOf = (n: LayoutNode) => (n.props.style ?? {}) as Record<string, unknown>;
const nodeWithText = (layout: LayoutNode, text: string) => nodes(layout).find((n) => n.props.children === text)!;
const srcOf = (n: LayoutNode) => String((n.props as { src?: string }).src ?? "");

const logoBytes = solidPng(300, 100, [200, 30, 30]);
const logo = { bytes: logoBytes, contentType: "image/png", width: 300, height: 100 };
const logoSrc = `data:image/png;base64,${Buffer.from(logoBytes).toString("base64")}`;
const arrayBuffer = (bytes: Uint8Array<ArrayBuffer>) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const customFont = { regular: arrayBuffer(fontFixtures.ttf()), bold: null };

const catalogueRequest = (templateId: string, overrides: Partial<RenderRequest> = {}): RenderRequest => {
  const t = newestTemplate(templateId)!;
  return {
    template: { id: t.id, version: t.version, config: t.config },
    photo: { bytes: fixture("photo-800x600.jpg"), contentType: "image/jpeg" },
    facts,
    brand,
    texts: { headline: "3 bedroom semi-detached house in Harpenden", cta: "Call 01582 000000 to arrange a viewing." },
    ...overrides,
  };
};
const fullBrand: BrandVoice = {
  ...brand,
  contactEmail: "hello@orchard.test",
  website: "https://orchard.test",
  officeAddress: "1 High Street, Harpenden",
  logo,
  headingFont: customFont,
  bodyFont: customFont,
};

describe("AT-22 version 1 graphics are unchanged", () => {
  test("a version 1 template ignores logo and fonts, exactly as before", () => {
    const before = JSON.stringify(graphicLayout(request("social-square")));
    const after = JSON.stringify(graphicLayout(request("social-square", { brand: { ...fullBrand, primaryColour: brand.primaryColour } })));
    expect(after).toBe(before);
    expect(after).not.toContain(logoSrc);
    expect(after).not.toContain("Brand Heading");
  });
});

describe("AT-22 brand panel (version 2) layout", () => {
  for (const id of ["social-square", "social-portrait", "story"]) {
    test(`${id}: draws the logo in the template's position and uses the captured fonts (AC22)`, () => {
      const req = catalogueRequest(id, { brand: fullBrand });
      const config = req.template.config as { canvas: { width: number; height: number }; logo: { maxWidthRatio: number; maxHeightRatio: number } };
      const layout = graphicLayout(req);
      const images = nodes(layout, "img");
      expect(images).toHaveLength(2);
      const logoNode = images.find((n) => srcOf(n) === logoSrc)!;
      expect(logoNode).toBeDefined();
      // Scaled to fit the template's logo box without distortion.
      const { width, height } = logoNode.props as unknown as { width: number; height: number };
      expect(width / height).toBeCloseTo(3, 1);
      expect(width).toBeLessThanOrEqual(config.canvas.width * config.logo.maxWidthRatio + 1);
      expect(height).toBeLessThanOrEqual(config.canvas.height * config.logo.maxHeightRatio + 1);

      expect(styleOf(nodeWithText(layout, "3 bedroom semi-detached house in Harpenden")).fontFamily).toBe("Brand Heading");
      expect(styleOf(layout).fontFamily).toBe("Brand Body");
      expect(JSON.stringify(layout)).toContain("#2a3b5c");
      // The logo stands in for the agency name; it is not shown twice.
      expect(textOf(layout)).not.toContain("Orchard Estates");
    });
  }

  test("with no logo, colours or fonts: fallback colours and fonts, the agency name as text, and no logo space (AC23)", () => {
    const layout = graphicLayout(catalogueRequest("social-square", { brand: { ...brand, primaryColour: null } }));
    expect(nodes(layout, "img")).toHaveLength(1);
    expect(JSON.stringify(layout)).toContain("#1d2433");
    expect(styleOf(nodeWithText(layout, "3 bedroom semi-detached house in Harpenden")).fontFamily).toBe("Playfair Display");
    expect(styleOf(layout).fontFamily).toBe("Inter");
    expect(textOf(layout)).toContain("Orchard Estates");
    // Nothing is laid out with no content: no empty box where a logo would go.
    for (const n of nodes(layout, "div")) {
      const children = n.props.children;
      expect(children === undefined || (Array.isArray(children) && children.length === 0) || children === "").toBe(false);
    }
  });

  test("with neither a logo nor an agency name, nothing stands in for them", () => {
    const layout = graphicLayout(catalogueRequest("social-square", { brand: { ...brand, agencyName: null } }));
    expect(nodes(layout, "img")).toHaveLength(1);
    expect(textOf(layout)).not.toContain("Orchard");
  });

  test("only the brand fields a template declares are shown, and only when set (AC24)", () => {
    const base = newestTemplate("social-square")!;
    const withFields = (brandFields: string[], b: BrandVoice) =>
      textOf(graphicLayout(catalogueRequest("social-square", { template: { id: base.id, version: base.version, config: { ...base.config, brandFields } }, brand: b })));

    // The shipped template declares the agency name only: contact details are saved but not drawn.
    const shipped = textOf(graphicLayout(catalogueRequest("social-square", { brand: { ...fullBrand, logo: null } })));
    expect(shipped).toContain("Orchard Estates");
    for (const hidden of ["hello@orchard.test", "https://orchard.test", "1 High Street"]) expect(shipped).not.toContain(hidden);

    // A template that declares more shows exactly those that are set.
    const declared = withFields(["agencyName", "contactPhone", "website", "contactEmail"], { ...fullBrand, logo: null, contactEmail: null });
    expect(declared).toContain("Orchard Estates");
    expect(declared).toContain("01582 000000");
    expect(declared).toContain("https://orchard.test");
    expect(declared).not.toContain("1 High Street");
    expect(declared).not.toContain("hello@orchard.test");
    expect(declared).not.toMatch(/null|undefined/);

    // A template that declares none shows none, whatever is saved.
    const none = withFields([], { ...fullBrand, logo: null });
    for (const hidden of ["Orchard Estates", "hello@orchard.test", "https://orchard.test", "1 High Street"]) expect(none).not.toContain(hidden);
  });

  test("unknown facts still never appear", () => {
    const text = textOf(graphicLayout(catalogueRequest("story", { facts: unknownFacts, texts: { headline: null, cta: null }, brand: fullBrand }))).toLowerCase();
    for (const word of ["bedroom", "bathroom", "£", "price"]) expect(text).not.toContain(word);
  });
});

describe("AT-22 Full photo layout", () => {
  const canvases = { "social-square-full": [1080, 1080], "social-portrait-full": [1080, 1350], "story-full": [1080, 1920] } as const;

  for (const [id, [width, height]] of Object.entries(canvases)) {
    test(`${id}: the photo fills the canvas, white text sits over the lower gradient, the logo is top-left (AC26b)`, () => {
      const layout = graphicLayout(catalogueRequest(id, { brand: fullBrand }));
      const images = nodes(layout, "img");
      const photo = images.find((n) => srcOf(n).startsWith("data:image/jpeg"))!;
      expect(photo.props).toMatchObject({ width, height });
      expect(styleOf(photo)).toMatchObject({ position: "absolute", top: 0, left: 0, objectFit: "cover" });
      expect(srcOf(photo)).toContain(Buffer.from(fixture("photo-800x600.jpg")).toString("base64").slice(0, 40));

      const gradient = nodes(layout, "div").find((n) => String(styleOf(n).backgroundImage ?? "").includes("linear-gradient"))!;
      expect(gradient).toBeDefined();
      expect(styleOf(gradient)).toMatchObject({ position: "absolute", bottom: 0, left: 0 });
      expect(Number(styleOf(gradient).height)).toBeGreaterThanOrEqual(Math.floor(height / 3));

      const headline = nodeWithText(layout, "3 bedroom semi-detached house in Harpenden");
      expect(styleOf(headline).fontFamily).toBe("Brand Heading");
      const textBlock = nodes(layout, "div").find((n) => styleOf(n).position === "absolute" && styleOf(n).color === "#ffffff")!;
      expect(textBlock).toBeDefined();
      expect(textOf(textBlock)).toContain("3 bedroom semi-detached house in Harpenden");
      // Facts are on one line beneath the headline.
      expect(textOf(textBlock)).toContain("3 bedrooms · 2 bathrooms · Guide price £650,000");

      const logoNode = images.find((n) => srcOf(n) === logoSrc)!;
      const badge = nodes(layout, "div").find((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]).includes(logoNode))!;
      expect(styleOf(badge)).toMatchObject({ position: "absolute", backgroundColor: "#ffffff" });
      expect(Number(styleOf(badge).left)).toBeLessThan(width / 4);
      expect(Number(styleOf(badge).top)).toBeLessThan(height / 3);
      expect(Number(styleOf(badge).borderRadius)).toBeGreaterThan(0);

      // Brand colour is an accent: a bar above the headline and the call-to-action label, not a panel.
      const coloured = nodes(layout, "div").filter((n) => styleOf(n).backgroundColor === "#2a3b5c");
      expect(coloured.length).toBe(2);
      expect(textOf(coloured.find((n) => textOf(n) !== "")!)).toBe("Call 01582 000000 to arrange a viewing.");
      expect(styleOf(layout).backgroundColor).not.toBe("#2a3b5c");
    });
  }

  test("every word comes from reviewed copy, recorded facts or brand details (AC26b)", () => {
    const text = textOf(graphicLayout(catalogueRequest("social-square-full", { brand: { ...fullBrand, logo: null } })));
    expect(text.split("\n").sort()).toEqual(
      ["3 bedroom semi-detached house in Harpenden", "3 bedrooms · 2 bathrooms · Guide price £650,000", "Call 01582 000000 to arrange a viewing.", "Orchard Estates"].sort(),
    );
  });

  test("with no logo the agency name appears bottom-right; with neither, nothing does", () => {
    const named = graphicLayout(catalogueRequest("social-square-full", { brand: { ...fullBrand, logo: null } }));
    expect(nodes(named, "img")).toHaveLength(1);
    const name = nodes(named, "div").find((n) => n.props.children === "Orchard Estates")!;
    expect(styleOf(name)).toMatchObject({ position: "absolute" });
    expect(Number(styleOf(name).right)).toBeGreaterThan(0);
    expect(Number(styleOf(name).bottom)).toBeGreaterThan(0);

    const bare = graphicLayout(catalogueRequest("social-square-full", { brand: { ...fullBrand, logo: null, agencyName: null } }));
    expect(textOf(bare)).not.toContain("Orchard");
    expect(nodes(bare, "img")).toHaveLength(1);
  });

  test("without a call to action or facts there is no empty label or line", () => {
    const layout = graphicLayout(catalogueRequest("social-square-full", { facts: unknownFacts, texts: { headline: null, cta: null }, brand: fullBrand }));
    expect(textOf(layout).split("\n")).toEqual(["12 Orchard Way, Harpenden"]);
    // Only the accent bar carries the brand colour.
    expect(nodes(layout, "div").filter((n) => styleOf(n).backgroundColor === "#2a3b5c")).toHaveLength(1);
  });

  test("a story keeps the logo and all text out of the top and bottom 250 px (AC26c)", () => {
    for (const b of [fullBrand, { ...fullBrand, logo: null }]) {
      const layout = graphicLayout(catalogueRequest("story-full", { brand: b }));
      const positioned = nodes(layout).filter((n) => styleOf(n).position === "absolute" && n.type === "div" && !String(styleOf(n).backgroundImage ?? "").includes("gradient"));
      expect(positioned.length).toBeGreaterThanOrEqual(2);
      for (const n of positioned) {
        const s = styleOf(n);
        if (s.top !== undefined) expect(Number(s.top)).toBeGreaterThanOrEqual(250);
        if (s.bottom !== undefined) expect(Number(s.bottom)).toBeGreaterThanOrEqual(250);
        expect(s.top !== undefined || s.bottom !== undefined).toBe(true);
      }
      // Everything that carries text or the logo is inside one of those positioned boxes.
      const inside = new Set<LayoutNode>();
      for (const p of positioned) walk(p, (n) => inside.add(n));
      for (const n of nodes(layout)) {
        const isLogo = n.type === "img" && srcOf(n) === logoSrc;
        if (typeof n.props.children === "string" || isLogo) expect(inside.has(n)).toBe(true);
      }
    }
    // The square post has no such band.
    const square = graphicLayout(catalogueRequest("social-square-full", { brand: fullBrand }));
    const badge = nodes(square, "div").find((n) => styleOf(n).backgroundColor === "#ffffff")!;
    expect(Number(styleOf(badge).top)).toBeLessThan(250);
  });
});

describe("AT-22 rendering with brand files", () => {
  const renderer = new SvgTemplateRenderer(renderAssetsFromDisk());
  const processor = new RenderBrandAssetProcessor(renderAssetsFromDisk());
  const valid = (bytes: Uint8Array, width: number, height: number) =>
    expect(validateImageUpload({ bytes, filename: "x.png", declaredType: "image/png" })).toEqual({ contentType: "image/png", width, height });

  for (const [id, width, height] of [
    ["social-square", 1080, 1080],
    ["story", 1080, 1920],
    ["social-square-full", 1080, 1080],
    ["social-portrait-full", 1080, 1350],
    ["story-full", 1080, 1920],
  ] as const) {
    test(`${id} renders a valid ${width}x${height} PNG with a logo and custom fonts (AC22)`, async () => {
      const output = await renderer.render(catalogueRequest(id, { brand: fullBrand }));
      valid(output.bytes, width, height);
      expect(output.bytes.length).toBeGreaterThan(50_000);
      // The logo is really drawn: the same graphic without it is a different image.
      const withoutLogo = await renderer.render(catalogueRequest(id, { brand: { ...fullBrand, logo: null, agencyName: null } }));
      const blankLogo = await renderer.render(catalogueRequest(id, { brand: { ...fullBrand, logo: { ...logo, bytes: solidPng(300, 100, [255, 255, 255]) }, agencyName: null } }));
      expect(Buffer.compare(output.bytes, withoutLogo.bytes)).not.toBe(0);
      expect(Buffer.compare(output.bytes, blankLogo.bytes)).not.toBe(0);
      if (process.env.LB_SAVE_RENDERS) await Bun.write(`${process.env.LB_SAVE_RENDERS}/${id}.png`, output.bytes);
    }, 30_000);
  }

  test("a custom TTF, an OTF, a WOFF and a font decoded from WOFF2 each change what is drawn (AC14a, AC22)", async () => {
    const plain = (await renderer.render(catalogueRequest("social-square"))).bytes;
    const decoded = await processor.decodeWoff2(fontFixtures.otfWoff2());
    const fonts: Array<[string, ArrayBuffer]> = [
      ["ttf", arrayBuffer(fontFixtures.ttf())],
      ["otf", arrayBuffer(fontFixtures.otf())],
      ["woff", arrayBuffer(fontFixtures.otfWoff())],
      ["decoded woff2", decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer],
    ];
    const rendered: Uint8Array[] = [];
    for (const [, data] of fonts) {
      // Heading only: Inter (the TTF fixture) is also the bundled body font, so the heading is where a change shows.
      const output = await renderer.render(catalogueRequest("social-square", { brand: { ...brand, headingFont: { regular: data, bold: null } } }));
      valid(output.bytes, 1080, 1080);
      expect(Buffer.compare(output.bytes, plain)).not.toBe(0);
      rendered.push(output.bytes);
    }
    // The OTF, its WOFF and its decoded WOFF2 are the same typeface, so they draw identically.
    expect(Buffer.compare(rendered[1]!, rendered[2]!)).toBe(0);
    expect(Buffer.compare(rendered[1]!, rendered[3]!)).toBe(0);
    expect(Buffer.compare(rendered[0]!, rendered[1]!)).not.toBe(0);
  }, 60_000);

  test("a preset with a bold file uses it for bold text", async () => {
    const lato = (weight: string) => {
      const b = readFileSync(join(import.meta.dir, `../../apps/web/client/public/fonts/lato/lato-${weight}.woff`));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    };
    const withBold = await renderer.render(catalogueRequest("social-square", { brand: { ...brand, bodyFont: { regular: lato("regular"), bold: lato("bold") } } }));
    const withoutBold = await renderer.render(catalogueRequest("social-square", { brand: { ...brand, bodyFont: { regular: lato("regular"), bold: null } } }));
    expect(Buffer.compare(withBold.bytes, withoutBold.bytes)).not.toBe(0);
  }, 60_000);

  test("a JPEG logo and a logo converted from WebP are both really drawn", async () => {
    const none = (await renderer.render(catalogueRequest("social-square-full", { brand: { ...brand, agencyName: null } }))).bytes;
    const converted = await processor.webpToPng(fixture("photo-800x600.webp"));
    expect(converted).toMatchObject({ contentType: "image/png", width: 800, height: 600 });
    for (const logoInput of [
      { bytes: fixture("photo-800x600.jpg"), contentType: "image/jpeg", width: 800, height: 600 },
      { bytes: converted.bytes, contentType: "image/png", width: 800, height: 600 },
    ]) {
      const output = await renderer.render(catalogueRequest("social-square-full", { brand: { ...brand, agencyName: null, logo: logoInput } }));
      valid(output.bytes, 1080, 1080);
      expect(Buffer.compare(output.bytes, none)).not.toBe(0);
    }
  }, 60_000);

  test("WebP converts to a PNG with the same pixels whether it was lossy or lossless, and a corrupt file is refused", async () => {
    const lossless = await processor.webpToPng(fixture("photo-800x600-lossless.webp"));
    expect(lossless).toMatchObject({ contentType: "image/png", width: 800, height: 600 });
    valid(lossless.bytes, 800, 600);
    await processor.probeImage({ ...lossless });
    // Truncation is caught earlier, by the upload's structural check; here the image data itself is scrambled.
    const broken = fixture("photo-800x600.webp");
    for (let i = 40; i < broken.length; i++) broken[i] = (broken[i]! * 31 + i) & 0xff;
    await expect(processor.webpToPng(broken)).rejects.toThrow(/damaged/);
    // A good file still converts afterwards.
    expect((await processor.webpToPng(fixture("photo-800x600.webp"))).width).toBe(800);
  }, 60_000);
});
