import { describe, expect, test } from "bun:test";
import { graphicLayout, SvgTemplateRenderer, textOf, type BrandVoice, type RenderRequest } from "@listingboost/ai";
import type { PropertyFacts } from "@listingboost/domain";
import { validateImageUpload } from "@listingboost/storage";
import { DEFAULT_TEMPLATES } from "@listingboost/templates";
import { fixture } from "../support/fixtures";
import { renderAssetsFromDisk } from "../support/render-assets";

const brand: BrandVoice = {
  agencyName: "Orchard Estates",
  toneOfVoice: null,
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
