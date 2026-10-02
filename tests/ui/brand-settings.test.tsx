import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SqlDatabase } from "@listingboost/database";
import { cleanup, fireEvent, screen, signInAndOpen, waitFor, within } from "./harness";
import { createTestApp, signUp, signUpMember, type TestApp } from "../support/app";
import { fontFixtures, solidPng } from "../support/fixtures";

afterEach(cleanup);

let app: TestApp;
let owner: Awaited<ReturnType<typeof signUp>>;

beforeEach(async () => {
  app = createTestApp();
  owner = await signUp(app, { agencyName: "Orchard Estates" });
});

const open = (who: { email: string; password: string } = owner, target: TestApp = app) => signInAndOpen(target, who, "/app/brand");
const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: RegExp | string, value: string) => fireEvent.change(field(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save brand settings" }));
const status = () => screen.getByRole("status", { name: "Brand settings updates" });
const describedText = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
function chooseFile(label: RegExp | string, file: File) {
  const input = field(label);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}
const apiSave = (settings: Record<string, unknown>) =>
  app.request("/api/brand-settings", { method: "PUT", cookie: owner.cookie, body: JSON.stringify({ preferredTemplates: {}, ...settings }) });
const stored = () => app.db.raw.query("SELECT * FROM brand_settings WHERE organisation_id = ?").get(owner.organisation.id) as Record<string, string | null>;

describe("AT-22 Brand Settings page: viewing and saving", () => {
  test("is reached from the sidebar and shows the five groups", async () => {
    const ui = await signInAndOpen(app, owner, "/app/listings");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Brand Settings" }));
    await waitFor(() => expect(ui.router.state.location.pathname).toBe("/app/brand"));
    expect(await screen.findByRole("heading", { level: 1, name: "Brand Settings" })).toBeTruthy();
    for (const group of ["Agency details", "Contact details", "Logo", "Colours and typography", "Tone and templates"]) {
      expect(screen.getByRole("group", { name: group })).toBeTruthy();
    }
    expect(screen.getByText(/apply to new campaigns/i)).toBeTruthy();
  });

  test("unset values read as not set; nothing is shown as if it were configured (AC6)", async () => {
    await open();
    expect((await screen.findByLabelText("Agency name") as HTMLInputElement).value).toBe("Orchard Estates");
    for (const label of ["Phone", "Email", "Website", "Office address", "Primary colour", "Secondary colour", "Tone preference"]) {
      expect(field(label).value).toBe("");
      expect(describedText(field(label))).toMatch(/Not set/);
    }
    expect(describedText(field("Agency name"))).not.toMatch(/Not set/);
    expect((field("Heading font") as unknown as HTMLSelectElement).value).toBe("");
    expect(within(screen.getByRole("group", { name: "Logo" })).getByText(/No logo set/)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /logo/i })).toBeNull();
  });

  test("an owner saves values, is told what the change affects, and sees them on return (AC5)", async () => {
    await open();
    await screen.findByLabelText("Agency name");
    type("Agency name", "Orchard & Co");
    type("Phone", "01582 760000");
    type("Email", "hello@orchard.test");
    type("Website", "https://orchard.test");
    type("Office address", "1 High Street\nHarpenden");
    type("Primary colour", "#1d2433");
    type("Tone preference", "Warm and plain-spoken");
    fireEvent.change(field("Heading font"), { target: { value: "preset:montserrat" } });
    fireEvent.change(field("Story"), { target: { value: "story-full" } });
    save();
    await waitFor(() => expect(status().textContent).toMatch(/Brand settings saved/));
    expect(status().textContent).toMatch(/new campaigns/);
    expect(stored()).toMatchObject({ agency_name: "Orchard & Co", contact_phone: "01582 760000", primary_colour: "#1d2433", heading_font: "preset:montserrat", tone_of_voice: "Warm and plain-spoken" });
    expect(JSON.parse(stored().preferred_templates_json!)).toEqual({ "story:primary": "story-full" });

    cleanup();
    await open();
    expect((await screen.findByLabelText("Agency name") as HTMLInputElement).value).toBe("Orchard & Co");
    expect(field("Office address").value).toBe("1 High Street\nHarpenden");
    expect(field("Heading font").value).toBe("preset:montserrat");
    expect(field("Story").value).toBe("story-full");
    expect(describedText(field("Phone"))).not.toMatch(/Not set/);
  });

  test("the tone field says it is saved for later and does not change copy today", async () => {
    await open();
    expect(describedText(await screen.findByLabelText("Tone preference"))).toMatch(/saved for future use.*does not change/i);
  });

  test("fonts are grouped by use, with uploads in their own group (AC17)", async () => {
    const form = new FormData();
    form.append("file", new File([fontFixtures.ttf()], "Brand Sans.ttf"));
    form.append("rightsConfirmed", "true");
    await app.request("/api/brand-settings/fonts", { method: "POST", cookie: owner.cookie, body: form });
    await open();
    for (const label of ["Heading font", "Body font"]) {
      const select = (await screen.findByLabelText(label)) as unknown as HTMLSelectElement;
      const groups = [...select.querySelectorAll("optgroup")];
      expect(groups.map((g) => g.label)).toEqual(["Headings", "Body text", "Your fonts"]);
      expect([...groups[0]!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Playfair Display", "Cormorant Garamond", "DM Serif Display", "Montserrat"]);
      expect([...groups[1]!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Inter", "Source Sans 3", "Lato", "Open Sans"]);
      expect([...groups[2]!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Brand Sans"]);
    }
  });

  test("each graphic offers its two layouts", async () => {
    await open();
    for (const label of ["Social post (square)", "Social post (portrait)", "Story"]) {
      const select = (await screen.findByLabelText(label)) as unknown as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual(["No preference (Brand panel)", "Brand panel", "Full photo"]);
    }
  });

  test("a saved template preference that is no longer available is explained and another is asked for (AC29)", async () => {
    app.db.raw.run("UPDATE brand_settings SET preferred_templates_json = ? WHERE organisation_id = ?", [JSON.stringify({ "social:square": "social-square-2019" }), owner.organisation.id]);
    await open();
    const select = await screen.findByLabelText("Social post (square)");
    expect(describedText(select)).toMatch(/no longer available.*[Cc]hoose another/);
    expect((select as unknown as HTMLSelectElement).value).toBe("");
    expect(describedText(field("Story"))).not.toMatch(/no longer available/);
  });
});

describe("AT-22 Brand Settings page: errors, warnings and announcements", () => {
  test("errors are tied to their fields, focus moves to the first one, and typed values are kept (AC33)", async () => {
    await open();
    await screen.findByLabelText("Agency name");
    type("Agency name", "Orchard & Co");
    type("Email", "not-an-email");
    type("Primary colour", "blue");
    type("Tone preference", "Warm");
    save();
    await waitFor(() => expect(field("Email").getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(field("Email"))).toMatch(/Enter an email address/);
    expect(field("Primary colour").getAttribute("aria-invalid")).toBe("true");
    expect(describedText(field("Primary colour"))).toMatch(/#RRGGBB/);
    expect(field("Tone preference").getAttribute("aria-invalid")).toBe("false");
    // Errors are announced.
    expect(screen.getAllByRole("alert").some((a) => /check the highlighted fields/i.test(a.textContent ?? ""))).toBe(true);
    // Focus is on the first field with an error, in page order.
    await waitFor(() => expect(document.activeElement).toBe(field("Email")));
    // Nothing typed is lost, and nothing was saved.
    expect(field("Agency name").value).toBe("Orchard & Co");
    expect(field("Email").value).toBe("not-an-email");
    expect(field("Tone preference").value).toBe("Warm");
    expect(stored().agency_name).toBe("Orchard Estates");

    type("Email", "hello@orchard.test");
    type("Primary colour", "#1d2433");
    save();
    await waitFor(() => expect(status().textContent).toMatch(/Brand settings saved/));
    expect(field("Email").getAttribute("aria-invalid")).toBe("false");
    expect(stored()).toMatchObject({ agency_name: "Orchard & Co", contact_email: "hello@orchard.test" });
  });

  test("every control has a programmatic label (AC33)", async () => {
    await open();
    await screen.findByLabelText("Agency name");
    const page = screen.getByRole("main");
    for (const control of page.querySelectorAll<HTMLElement>("input, select, textarea")) {
      const labelled = control.getAttribute("aria-label") || (control.id && page.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent);
      expect(Boolean(labelled)).toBe(true);
    }
    for (const button of within(page).getAllByRole("button")) expect((button.getAttribute("aria-label") ?? button.textContent ?? "").trim()).not.toBe("");
  });

  test("when saving fails the error is announced and typed values stay in the form (AC8)", async () => {
    const failing: SqlDatabase = {
      prepare: (sql) => {
        if (/brand_settings/.test(sql) && /^\s*(INSERT|UPDATE)/i.test(sql)) throw new Error("D1 unavailable");
        return app.db.prepare(sql);
      },
      batch: (statements) => app.db.batch(statements),
    };
    await open(owner, createTestApp({ db: failing }));
    await screen.findByLabelText("Agency name");
    type("Agency name", "Orchard & Co");
    type("Phone", "01582 760000");
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not be saved|went wrong/i);
    expect(alert.textContent).toMatch(/try again/i);
    expect(field("Agency name").value).toBe("Orchard & Co");
    expect(field("Phone").value).toBe("01582 760000");
    expect(status().textContent).not.toMatch(/saved/i);
  });

  test("poor colour contrast is saved with a warning; a readable colour clears it (AC37, AC38)", async () => {
    await open();
    await screen.findByLabelText("Agency name");
    type("Primary colour", "#f6f1e8");
    save();
    await waitFor(() => expect(status().textContent).toMatch(/Brand settings saved/));
    expect(stored().primary_colour).toBe("#f6f1e8");
    expect(describedText(field("Primary colour"))).toMatch(/hard to read/);
    expect(status().textContent).toMatch(/hard to read/);
    expect(field("Primary colour").getAttribute("aria-invalid")).toBe("false");

    type("Primary colour", "#1d2433");
    save();
    await waitFor(() => expect(describedText(field("Primary colour"))).not.toMatch(/hard to read/));
  });
});

describe("AT-22 Brand Settings page: logo", () => {
  const logoGroup = () => screen.getByRole("group", { name: "Logo" });
  const png = (name: string, size = 64, rgb: [number, number, number] = [10, 20, 30]) => new File([solidPng(size, size, rgb)], name, { type: "image/png" });

  test("uploading shows a preview and is announced; a second upload lists the first as previous (AC9, AC12, AC34)", async () => {
    await open();
    await screen.findByLabelText("Upload a logo");
    expect(describedText(field("Upload a logo"))).toMatch(/PNG, JPEG, WebP or SVG.*2 MB/);
    chooseFile("Upload a logo", png("first.png"));
    const preview = (await within(logoGroup()).findByRole("img", { name: "Current logo" })) as HTMLImageElement;
    expect(preview.getAttribute("src")).toMatch(/^\/api\/files\/logo\//);
    await waitFor(() => expect(status().textContent).toMatch(/Logo uploaded/));
    expect(within(logoGroup()).queryByText(/Previous logos/)).toBeNull();

    app.clock.offsetMs += 60_000;
    chooseFile("Upload a logo", png("second.png", 96, [200, 0, 0]));
    await within(logoGroup()).findByText(/Previous logos/);
    expect(within(logoGroup()).getAllByRole("button", { name: /^Restore logo/ })).toHaveLength(1);
    expect(app.db.raw.query("SELECT COUNT(*) AS n FROM brand_logos").get()).toEqual({ n: 2 });
  });

  test("restoring a previous logo makes it current again and is announced (AC13, AC34)", async () => {
    await open();
    await screen.findByLabelText("Upload a logo");
    chooseFile("Upload a logo", png("first.png"));
    await within(logoGroup()).findByRole("img", { name: "Current logo" });
    const firstId = (app.db.raw.query("SELECT logo_id FROM brand_settings WHERE organisation_id = ?").get(owner.organisation.id) as { logo_id: string }).logo_id;
    app.clock.offsetMs += 60_000;
    chooseFile("Upload a logo", png("second.png", 96, [200, 0, 0]));
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: /^Restore logo/ }));
    await waitFor(() => expect(status().textContent).toMatch(/Logo restored/));
    expect((app.db.raw.query("SELECT logo_id FROM brand_settings WHERE organisation_id = ?").get(owner.organisation.id) as { logo_id: string }).logo_id).toBe(firstId);
    expect(within(logoGroup()).getAllByRole("button", { name: /^Restore logo/ })).toHaveLength(1);
    expect(app.db.raw.query("SELECT COUNT(*) AS n FROM brand_logos").get()).toEqual({ n: 2 });
  });

  test("a rejected logo shows the reason next to the upload and keeps the current logo (AC10, AC11)", async () => {
    await open();
    await screen.findByLabelText("Upload a logo");
    chooseFile("Upload a logo", new File([`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`], "logo.svg", { type: "image/svg+xml" }));
    await waitFor(() => expect(describedText(field("Upload a logo"))).toMatch(/contains a script/));
    expect(field("Upload a logo").getAttribute("aria-invalid")).toBe("true");
    expect(within(logoGroup()).getByText(/No logo set/)).toBeTruthy();
  });

  test("an SVG logo is converted, and the page says so (AC11a)", async () => {
    await open();
    await screen.findByLabelText("Upload a logo");
    expect(describedText(field("Upload a logo"))).toMatch(/SVG and WebP logos are converted to PNG/);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#1d2433"/></svg>`;
    chooseFile("Upload a logo", new File([svg], "logo.svg", { type: "image/svg+xml" }));
    await within(logoGroup()).findByRole("img", { name: "Current logo" });
    await waitFor(() => expect(status().textContent).toMatch(/converted to PNG/));
  });
});

describe("AT-22 Brand Settings page: your fonts", () => {
  // The font lists have a "Your fonts" option group; the upload area has its own name so the two are not confused.
  const fontsGroup = () => screen.getByRole("group", { name: "Fonts you have uploaded" });
  const fontFile = (name = "Brand Sans.ttf") => new File([fontFixtures.ttf()], name);

  test("a font cannot be uploaded until the rights statement is ticked (AC15)", async () => {
    await open();
    await screen.findByLabelText("Font file");
    chooseFile("Font file", fontFile());
    fireEvent.click(screen.getByRole("button", { name: "Upload font" }));
    const checkbox = field(/I have the right to use this font/);
    await waitFor(() => expect(checkbox.getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(checkbox)).toMatch(/Confirm that you have the right/);
    expect(app.db.raw.query("SELECT COUNT(*) AS n FROM brand_fonts").get()).toEqual({ n: 0 });
  });

  test("an uploaded font is listed, announced and can be chosen; the tick is asked for again next time (AC14, AC34)", async () => {
    await open();
    await screen.findByLabelText("Font file");
    expect(describedText(field("Font file"))).toMatch(/WOFF, WOFF2, TTF or OTF.*2 MB/);
    chooseFile("Font file", fontFile());
    fireEvent.click(field(/I have the right to use this font/));
    fireEvent.click(screen.getByRole("button", { name: "Upload font" }));
    await waitFor(() => expect(status().textContent).toMatch(/Font uploaded/));
    expect(within(fontsGroup()).getByText("Brand Sans")).toBeTruthy();
    const option = [...(field("Heading font") as unknown as HTMLSelectElement).options].find((o) => o.textContent === "Brand Sans")!;
    expect(option.value).toMatch(/^custom:/);
    expect((field(/I have the right to use this font/) as HTMLInputElement).checked).toBe(false);
  });

  test("a rejected font shows the reason (AC16, AC14b)", async () => {
    await open();
    await screen.findByLabelText("Font file");
    chooseFile("Font file", new File([new TextEncoder().encode("%PDF-1.7 not a font at all")], "font.ttf"));
    fireEvent.click(field(/I have the right to use this font/));
    fireEvent.click(screen.getByRole("button", { name: "Upload font" }));
    await waitFor(() => expect(describedText(field("Font file"))).toMatch(/WOFF, WOFF2, TTF or OTF/));
    expect(field("Font file").getAttribute("aria-invalid")).toBe("true");
  });

  test("removing a font takes it out of the list and says existing campaigns keep it (AC18a)", async () => {
    await open();
    await screen.findByLabelText("Font file");
    chooseFile("Font file", fontFile());
    fireEvent.click(field(/I have the right to use this font/));
    fireEvent.click(screen.getByRole("button", { name: "Upload font" }));
    fireEvent.click(await within(fontsGroup()).findByRole("button", { name: "Remove Brand Sans" }));
    await waitFor(() => expect(status().textContent).toMatch(/Font removed.*campaigns that already use it/i));
    expect(within(fontsGroup()).queryByText("Brand Sans")).toBeNull();
    expect((app.db.raw.query("SELECT removed_at FROM brand_fonts").get() as { removed_at: string | null }).removed_at).not.toBeNull();
  });
});

describe("AT-22 Brand Settings page: members (AC3, AC36)", () => {
  test("a member sees the values read-only, with the reason, and no way to change anything", async () => {
    await apiSave({ agencyName: "Orchard & Co", contactPhone: "01582 760000", primaryColour: "#1d2433", headingFont: "preset:montserrat" });
    const logoForm = new FormData();
    logoForm.append("file", new File([solidPng(64, 64)], "logo.png", { type: "image/png" }));
    await app.request("/api/brand-settings/logo", { method: "POST", cookie: owner.cookie, body: logoForm });
    app.clock.offsetMs += 60_000;
    await app.request("/api/brand-settings/logo", { method: "POST", cookie: owner.cookie, body: logoForm });
    const member = await signUpMember(app, owner);

    await open(member);
    expect(await screen.findByText(/Only an owner of your organisation can change brand settings/)).toBeTruthy();
    const page = screen.getByRole("main");
    // Values are plain text a screen reader can read, each with its name.
    for (const [term, value] of [
      ["Agency name", "Orchard & Co"],
      ["Phone", "01582 760000"],
      ["Email", "Not set"],
      ["Primary colour", "#1d2433"],
      ["Heading font", "Montserrat"],
      ["Body font", "Not set"],
      ["Tone preference", "Not set"],
      ["Story", "No preference (Brand panel)"],
    ] as const) {
      const dt = within(page).getAllByText(term).find((n) => n.tagName === "DT")!;
      expect(dt.nextElementSibling?.tagName).toBe("DD");
      expect(dt.nextElementSibling?.textContent).toBe(value);
    }
    expect(within(page).getByRole("img", { name: "Current logo" })).toBeTruthy();
    // No edit, upload or restore action is offered.
    expect(page.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(within(page).queryAllByRole("button")).toHaveLength(0);
    expect(within(page).queryByText(/Previous logos/)).toBeNull();
  });
});

describe("AT-22 an unavailable preferred template is explained on the campaign (AC28)", () => {
  test("the asset says why it was not made and what to do; other assets are unaffected", async () => {
    const { createProperty, uploadPhoto } = await import("../support/app");
    app.db.raw.run("UPDATE brand_settings SET preferred_templates_json = ? WHERE organisation_id = ?", [JSON.stringify({ "social:square": "social-square-2019" }), owner.organisation.id]);
    const propertyId = await createProperty(app, owner.cookie, { title: "Template House" });
    await uploadPhoto(app, owner.cookie, propertyId);
    const created = await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: owner.cookie, body: "{}" });
    expect(created.status).toBe(201);

    await signInAndOpen(app, owner, `/app/listings/${propertyId}/social`);
    const square = await screen.findByRole("article", { name: "Social post 1:1" });
    expect(within(square).getByText(/preferred template for this asset is no longer available/i)).toBeTruthy();
    expect(within(square).getByText(/Brand Settings/)).toBeTruthy();
    const portrait = screen.getByRole("article", { name: "Social post 4:5" });
    expect(within(portrait).queryByText(/no longer available/i)).toBeNull();
  });
});
