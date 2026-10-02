import { MAX_LOGO_BYTES } from "./logo-validation";

/**
 * Safety check for SVG logo uploads (DECISIONS D-020). Workers have no DOM, so
 * this is a small strict reader of its own. It never repairs a file: anything
 * it does not recognise is rejected, and an accepted SVG is only ever
 * rasterised to PNG, never stored or served.
 */
export class UnsafeSvgError extends Error {
  constructor(readonly reason: string) {
    super(`This SVG can't be used: ${reason}. Export it as a plain SVG, or upload a PNG instead.`);
    this.name = "UnsafeSvgError";
  }
}

const MAX_ELEMENTS = 20_000;
const MAX_DEPTH = 64;

const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc", "style",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern",
  "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode", "feColorMatrix", "feFlood", "feComposite", "feBlend", "feDropShadow",
]);

/** Elements named in rejections so the owner knows what to remove. */
const NAMED_REJECTIONS: Record<string, string> = {
  script: "it contains a script",
  foreignobject: "it contains a foreignObject element",
  image: "it contains an embedded image",
  feimage: "it contains an embedded image",
  a: "it contains a link",
  animate: "it contains animation",
  animatemotion: "it contains animation",
  animatetransform: "it contains animation",
  set: "it contains animation",
};

const ALLOWED_ATTRIBUTE_PREFIXES = new Set(["xlink", "xml", "xmlns"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/;
const PREDEFINED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const fail = (reason: string): never => {
  throw new UnsafeSvgError(reason);
};

/** Resolves character references; any entity other than the five XML ones is rejected. */
function decodeEntities(text: string): string {
  return text.replace(/&([^;&\s<]*);?/g, (whole, body: string) => {
    if (!whole.endsWith(";")) return fail("it is not well-formed");
    if (body.startsWith("#")) {
      const code = /^#x[0-9a-fA-F]{1,6}$/.test(body) ? parseInt(body.slice(2), 16) : /^#[0-9]{1,7}$/.test(body) ? parseInt(body.slice(1), 10) : NaN;
      if (!Number.isInteger(code) || code > 0x10ffff) return fail("it is not well-formed");
      return String.fromCodePoint(code);
    }
    const predefined = PREDEFINED_ENTITIES[body];
    return predefined ?? fail("it uses an entity");
  });
}

/** `url(...)` may only point inside the file; nothing may load from elsewhere. */
function checkReferences(value: string, where: string): void {
  // Whitespace and control characters can be used to disguise a scheme.
  // eslint-disable-next-line no-control-regex
  const compact = value.replace(/[\u0000- ]+/g, "").toLowerCase();
  if (/(?:javascript|vbscript|data|https?|file|ftp):/.test(compact) || compact.includes("//")) fail(`it refers to an external resource in ${where}`);
  for (const match of compact.matchAll(/url\(([^)]*)\)?/g)) {
    const target = match[1]!.replace(/^['"]|['"]$/g, "");
    if (!target.startsWith("#")) fail(`it refers to an external resource in ${where}`);
  }
  if (compact.includes("@import") || compact.includes("expression(")) fail(`it refers to an external resource in ${where}`);
}

function checkCss(css: string): void {
  if (css.includes("\\")) fail("its style rules use escapes");
  if (css.includes("<")) fail("its style rules contain markup");
  checkReferences(css, "a style rule");
}

function checkAttribute(element: string, name: string, rawValue: string): string | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) fail("it contains an event attribute");
  const [prefix, local] = name.includes(":") ? (name.split(":") as [string, string]) : [null, name];
  if (prefix !== null && !ALLOWED_ATTRIBUTE_PREFIXES.has(prefix)) fail(`the attribute ${name} is not allowed`);
  const value = decodeEntities(rawValue);
  if (lower === "href" || (prefix === "xlink" && local.toLowerCase() === "href")) {
    const target = value.trim();
    if (!/^#[A-Za-z_][\w.:-]*$/.test(target)) fail("it refers to an external resource in a link");
    return element === "use" ? target.slice(1) : null;
  }
  if (lower === "style") checkCss(value);
  else if (prefix !== "xmlns" && lower !== "xmlns") checkReferences(value, `the attribute ${name}`);
  return null;
}

/** Throws UnsafeSvgError unless the bytes are a plain, self-contained SVG drawing. */
export function checkSvgSafety(bytes: Uint8Array): void {
  if (bytes.length === 0) fail("the file is empty");
  if (bytes.length > MAX_LOGO_BYTES) fail("logos must be 2 MB or smaller");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return fail("it is not UTF-8 text");
  }

  type Open = { name: string; id: string | null };
  const stack: Open[] = [];
  const idsContainingUse = new Set<string>();
  const useTargets: string[] = [];
  let elements = 0;
  let rootClosed = false;
  let sawRoot = false;
  let i = 0;
  const malformed = () => fail("it is not well-formed");

  const checkText = (chunk: string) => {
    if (stack.length === 0) {
      if (chunk.trim() !== "") malformed();
      return;
    }
    if (stack[stack.length - 1]!.name === "style") checkCss(decodeEntities(chunk));
    else decodeEntities(chunk);
  };

  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      checkText(text.slice(i));
      break;
    }
    checkText(text.slice(i, lt));

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end === -1) malformed();
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end === -1) malformed();
      if (stack[stack.length - 1]?.name !== "style") fail("it contains a CDATA section outside a style element");
      checkCss(text.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (text.startsWith("<!", lt)) fail(/^<!doctype/i.test(text.slice(lt, lt + 9)) ? "it contains a DOCTYPE" : "it contains a declaration");
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      if (end === -1) malformed();
      const isXmlDeclaration = /^<\?xml\s/.test(text.slice(lt, lt + 6)) && text.slice(0, lt).trim() === "" && !sawRoot;
      if (!isXmlDeclaration) fail("it contains a processing instruction");
      i = end + 2;
      continue;
    }

    // Find the end of the tag, respecting quoted attribute values.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < text.length) {
      const ch = text[j]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      else if (ch === "<") malformed();
      j++;
    }
    if (j >= text.length) malformed();
    const tag = text.slice(lt + 1, j);
    i = j + 1;

    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) malformed();
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    const selfClosing = tag.endsWith("/");
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const nameMatch = body.match(/^([^\s]+)/);
    const name = nameMatch ? nameMatch[1]! : malformed();
    if (!NAME.test(name)) malformed();
    if (rootClosed) malformed();

    if (stack.length === 0) {
      if (name !== "svg") fail("its root element is not svg");
      sawRoot = true;
    }
    const named = NAMED_REJECTIONS[name.toLowerCase()];
    if (named) fail(named);
    if (!ALLOWED_ELEMENTS.has(name)) fail(`the element ${name} is not allowed`);
    if (++elements > MAX_ELEMENTS || stack.length >= MAX_DEPTH) fail("it is too complex");

    let id: string | null = null;
    let rest = body.slice(name.length);
    const seen = new Set<string>();
    while (rest.trim() !== "") {
      const attr = rest.match(/^\s+([^\s=<>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!attr) malformed();
      const [whole, attrName, dq, sq] = attr as unknown as [string, string, string | undefined, string | undefined];
      if (!NAME.test(attrName) || seen.has(attrName)) malformed();
      seen.add(attrName);
      const rawValue = dq ?? sq ?? "";
      if (rawValue.includes("<")) malformed();
      const useTarget = checkAttribute(name, attrName, rawValue);
      if (useTarget !== null) useTargets.push(useTarget);
      if (attrName === "id") id = decodeEntities(rawValue);
      rest = rest.slice(whole.length);
    }

    if (name === "use") {
      // A re-used element that itself re-uses others can multiply without limit.
      for (const ancestor of stack) if (ancestor.id) idsContainingUse.add(ancestor.id);
      if (id) idsContainingUse.add(id);
    }
    if (!selfClosing) stack.push({ name, id });
    else if (stack.length === 0) rootClosed = true;
  }

  if (!sawRoot || stack.length !== 0) malformed();
  if (useTargets.some((target) => idsContainingUse.has(target))) fail("it has nested re-use of elements");
}
