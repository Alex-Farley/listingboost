import { describe, expect, test } from "bun:test";
import { checkSvgSafety, UnsafeSvgError } from "@listingboost/storage";

const bytes = (svg: string) => new TextEncoder().encode(svg);
const wrap = (inner: string, rootAttrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"${rootAttrs}>${inner}</svg>`;
const reasonFor = (svg: string | Uint8Array): string => {
  try {
    checkSvgSafety(typeof svg === "string" ? bytes(svg) : svg);
  } catch (error) {
    if (error instanceof UnsafeSvgError) return error.reason;
    throw error;
  }
  return "accepted";
};

describe("AT-22 SVG logo safety: accepted", () => {
  test("plain shapes, text, gradients, clip paths and internal references", () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported logo -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="80" viewBox="0 0 200 80">
  <title>Orchard &amp; Co</title>
  <defs>
    <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#1d2433"/><stop offset="1" stop-color="#4a5a7a"/></linearGradient>
    <clipPath id="c"><rect width="200" height="80" rx="8"/></clipPath>
    <path id="leaf" d="M0 0 L10 10 Z"/>
  </defs>
  <g clip-path="url(#c)">
    <rect width="200" height="80" fill="url(#g)"/>
    <circle cx="40" cy="40" r="20" style="fill:#fff;opacity:.9"/>
    <use xlink:href="#leaf" x="20"/>
    <use href="#leaf" x="40"/>
    <text x="70" y="48" font-size="24" fill="#fff">Orchard &#38; Co</text>
  </g>
</svg>`;
    expect(reasonFor(svg)).toBe("accepted");
  });

  test("a style element that only sets presentation, including in CDATA", () => {
    expect(reasonFor(wrap(`<style>.a{fill:#1d2433;stroke:none}.b{fill:url(#g)}</style><rect class="a" width="10" height="10"/>`))).toBe("accepted");
    expect(reasonFor(wrap(`<style type="text/css"><![CDATA[ .st0{fill:#FFFFFF;} ]]></style><path class="st0" d="M0 0h10v10z"/>`))).toBe("accepted");
  });

  test("a byte-order mark and leading whitespace", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes(`\n${wrap("<rect width='1' height='1'/>")}`)]);
    expect(reasonFor(withBom)).toBe("accepted");
  });
});

describe("AT-22 SVG logo safety: rejected (AC11)", () => {
  const cases: Array<[name: string, svg: string, reason: RegExp]> = [
    ["a script element", wrap(`<script>alert(1)</script>`), /script/i],
    ["a script element in different case", wrap(`<SCRIPT>alert(1)</SCRIPT>`), /script/i],
    ["an event attribute", wrap(`<rect width="1" height="1" onclick="alert(1)"/>`), /event/i],
    ["an event attribute on the root", wrap("", ` onload="alert(1)"`), /event/i],
    ["an event attribute in different case", wrap(`<rect width="1" height="1" OnLoad="x()"/>`), /event/i],
    ["foreignObject", wrap(`<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>`), /foreignObject/],
    ["an external href", wrap(`<use href="https://evil.test/a.svg#x"/>`), /external/i],
    ["an external xlink:href", wrap(`<use xlink:href="//evil.test/a.svg#x"/>`), /external/i],
    ["a javascript: link", wrap(`<a href="javascript:alert(1)"><rect width="1" height="1"/></a>`), /link|external/i],
    ["a javascript: href hidden with character references", wrap(`<use href="&#106;avascript:alert(1)"/>`), /external/i],
    ["an external url() in an attribute", wrap(`<rect width="1" height="1" fill="url(https://evil.test/p.svg#g)"/>`), /external/i],
    ["an external url() in a style attribute", wrap(`<rect width="1" height="1" style="fill:url('http://evil.test/x')"/>`), /external/i],
    ["an external url() in a style element", wrap(`<style>.a{fill:url(http://evil.test/x)}</style>`), /external/i],
    ["an @import in a style element", wrap(`<style>@import "http://evil.test/x.css";</style>`), /external/i],
    ["a CSS escape in a style element", wrap(`<style>.a{fill:u\\72l(http://evil.test/x)}</style>`), /style/i],
    ["an embedded image", wrap(`<image href="data:image/png;base64,AAAA" width="1" height="1"/>`), /image/i],
    ["an embedded image by xlink", wrap(`<image xlink:href="photo.png" width="1" height="1"/>`), /image/i],
    ["a filter that loads an image", wrap(`<filter id="f"><feImage href="x.png"/></filter>`), /image/i],
    ["a DOCTYPE", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${wrap("")}`, /DOCTYPE/],
    ["an entity declaration", `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${wrap("<text>&xxe;</text>")}`, /DOCTYPE|entit/i],
    ["an undeclared entity", wrap(`<text>&xxe;</text>`), /entit/i],
    ["an entity in an attribute", wrap(`<rect width="&big;" height="1"/>`), /entit/i],
    ["a processing instruction", `<?xml version="1.0"?><?xml-stylesheet href="evil.css"?>${wrap("")}`, /processing instruction/i],
    ["animation", wrap(`<rect width="1" height="1"><animate attributeName="href" to="javascript:alert(1)"/></rect>`), /animat/i],
    ["an iframe", wrap(`<iframe src="https://evil.test"/>`), /iframe|not allowed/i],
    ["an element from another namespace", wrap(`<sodipodi:namedview id="x"/>`), /not allowed/i],
    ["an unknown element", wrap(`<blink>hi</blink>`), /not allowed/i],
    ["CDATA outside a style element", wrap(`<text><![CDATA[<script>alert(1)</script>]]></text>`), /CDATA/],
    ["a root that is not svg", `<html xmlns="http://www.w3.org/1999/xhtml"><svg/></html>`, /svg/i],
    ["markup that is not well formed", `<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="1" height="1"></svg>`, /well.formed/i],
    ["an unquoted attribute", `<svg xmlns="http://www.w3.org/2000/svg" width=10></svg>`, /well.formed/i],
    ["content after the root element", `${wrap("")}<script>alert(1)</script>`, /well.formed|script/i],
    ["re-use nested inside re-used content", wrap(`<defs><g id="a"><use href="#b"/><use href="#b"/></g><g id="b"><use href="#c"/></g><path id="c" d="M0 0"/></defs><use href="#a"/>`), /nested/i],
  ];
  for (const [name, svg, reason] of cases) {
    test(`rejects ${name}`, () => {
      expect(reasonFor(svg)).toMatch(reason);
    });
  }

  test("rejects bytes that are not UTF-8 text", () => {
    expect(reasonFor(new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x73, 0x00]))).toMatch(/UTF-8/);
  });

  test("rejects an empty file and a file over 2 MiB", () => {
    expect(reasonFor(new Uint8Array(0))).toMatch(/empty/i);
    expect(reasonFor(wrap(`<!--${"x".repeat(2 * 1024 * 1024)}-->`))).toMatch(/2 MB/);
  });

  test("rejects excessive nesting and too many elements", () => {
    expect(reasonFor(wrap("<g>".repeat(200) + "</g>".repeat(200)))).toMatch(/complex/i);
    expect(reasonFor(wrap(`<rect width="1" height="1"/>`.repeat(20_001)))).toMatch(/complex/i);
  });

  test("every rejection tells the owner what to do instead", () => {
    try {
      checkSvgSafety(bytes(wrap(`<script>alert(1)</script>`)));
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeSvgError);
      expect((error as UnsafeSvgError).message).toMatch(/plain SVG|PNG/);
    }
  });
});
