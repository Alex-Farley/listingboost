# App layout — adapt the shipped code in place

<!-- shared:header:begin — keep identical across all templates (scripts/check-agents-sync.sh) -->

A `type: "app"` product must look and feel like a Higgsfield product. This
template ships ONE ready-made layout screen as REAL CODE, already wired as the
home page (`src/routes/index.tsx`). **Adapt it in place** — swap its inputs,
copy, media, and wiring for the product you are building; never rebuild the
screen from scratch, fork a new top-level structure, or swap layouts. Build a
custom shell only when the user asks for something the layout cannot cover.

**Adapt in place does NOT mean ship the demo.** The layout is only the UI
shell, filled with placeholder data and stub flows. The deliverable is the
USER'S product: replace the demo data and flows with complete, working
business logic — the app's actual features, state, generation wiring, and
persistence — so it does what the user asked end-to-end and serves them as
well as you can. A template that merely renders is not done.

Everything shared lives in **`../components/AGENTS.md`** — the mandatory
component contract (asset library, generation tiles, feeds, progressive
disclosure), the design invariants (dark theme, no app header, container
width, buttons, icons), and copy-paste wiring. Read it before editing. Backend
wiring (submit, poll, uploads): `app/packages/fnf-react/ai/AGENTS.md`.
<!-- shared:header:end -->

## The layout

| Layout         | File                                               | When to use                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App detail** | `src/layouts/app-detail.tsx` (`AppDetailTemplate`) | A single app's public landing page: a centered `max-w-7xl` scroll page with a two-column generator hero (`UploadField` inputs on the left, a large live result on the right, costed Generate), a "how it works" explainer, and personal generation history. Use it for a marketing/detail page around one tool, not a full workspace. |

## App-detail-specific rules

- `/` is both the working simple app and its public landing. Keep the live
  generator `Hero` first, then a two-tab segmented surface: **How it works**
  renders the shared `LandingSections`, and **My generations** renders the
  personal `UserGenerations` history. Populate landing sections only through
  `src/landing-content.ts`; do not hand-build one-off marketing sections in this
  layout or move the generator to a second route.
- The mandatory landing sequence is three visual steps, three feature cards, a
  large image/video showcase, and one final CTA. The shared renderer owns their
  responsive layout and visual treatment.
- **Hero right pane = a REAL EXAMPLE of what THIS app generates.** The
  generator hero's right column (`Hero` in `src/layouts/app-detail.tsx` — the
  `idle` preview, `HERO_PREVIEW`) MUST always show a representative example of
  this app's OWN output. Never leave a generic cover, stock photo, or
  unrelated placeholder there. Swap `HERO_PREVIEW` for media matching the
  tool's real output. Keep the hero preview frame a narrower `1:1` square in
  idle, generating, and result states, with media using `object-cover` — the
  landing page must preview the payoff without letting the image dominate the
  input pane. Finished results always come from the live FNF run; never add a
  static result asset.
- The layout is prewired to the real FNF provider: scoped cost, host approval,
  fire-and-forget submit/live polling, multipart upload, durable media refs, cache updates,
  virtualized asset paging, and personal History. Adapt the one-model registry
  and typed input for the requested product; never replace these flows with a
  timer, fabricated history, or `window.confirm`. Upload records stay in the
  asset library and are never appended to History.
- **Hero left pane has a fixed content budget.** It contains only: one title
  line, one subtitle line, the app's primary input tile row, an optional
  `Settings` disclosure, and one full-width costed `Generate` CTA—in that order.
  Title and subtitle must each stay on one truncated line. Never add an eyebrow,
  badges, extra descriptions, tabs, secondary CTAs, status blocks, or unrelated
  controls to this pane; secondary settings live only behind `Settings`.
- **Settings disclosure must not move the hero.** On desktop the hero keeps a
  fixed taller height; the left pane is a `min-h-0` flex column, the Generate
  button stays pinned inside its bottom edge, and the entire content area above
  it—title, inputs, disclosure, and expanded settings—is one scroll viewport
  moving underneath the CTA. A transparent→secondary background gradient sits
  behind the CTA so scrolling content fades below the button; the button and its
  shadow must never protrude outside the card. Opening or closing settings must
  never resize the card, shift the preview, or move the CTA.
- **Hero inputs = large-field row → up to 2 inline compact settings → overflow
  behind "Settings".** The input column composes top-to-bottom in this fixed
  order through `HeroInputLayout` in `app-detail.tsx`—do not hand-code field
  widths or setting placement. The large-field row is ONE of four variants —
  never more than 3 large fields across:
  1. **1 large field** full width (single `UploadField` / cover `MediaCard`).
  2. **2 large fields** in a row.
  3. **3 large fields** in a row.
  4. **1 full-width large field** + BELOW it a row of up to 2 compact settings.

  "Large fields" are upload-size tiles (`UploadField` / cover `MediaCard`);
  "compact settings" are small `SettingTrigger` rows opening a `Select` (or an
  `AssetLibraryModal` when the setting is an asset). The inline
  compact-settings row is **ONLY allowed in variant 4** — with 2–3 large
  fields across, every compact setting goes behind the disclosure instead.

  Any compact setting that isn't one of the (variant-4-only) inline two
  collapses behind a **"Settings" disclosure** — a full-width
  left-aligned, borderless `ghost Button size="xs"` with no resting background,
  a LEADING `SlidersHorizontal` icon, and a trailing chevron that rotates when
  expanded. The costed Generate CTA is the
  full-width (`w-full`) last row. Omit the Settings button entirely when there
  are no hidden settings.

## Responsive contract

- Preserve the desktop two-column hero at `lg` and above. Below `lg`, stack the
  input pane above the preview, center the square preview, and cap it at
  `560px` so it does not dominate tablet layouts.
- At widths below `480px`, stack large input tiles and expanded setting
  controls in one column. At `480px` and above, the existing multi-column field
  variants may share a row. Never allow a field, label, or control to create
  horizontal page overflow.
- Keep the mobile History panel usable within the available dynamic viewport.
  It may grow up to the desktop `640px` height, but it must retain a practical
  minimum height for the virtualized feed.
- Responsive work is presentation-only unless the product request explicitly
  changes behavior. Do not alter approval, upload, submit, polling, cache,
  retry, history, or durable-reference logic to solve a layout problem.
- Before finishing a layout change, inspect the collapsed and expanded
  Settings states at `320px`, `390px`, `768px`, `1024px`, and a desktop width.
  Check for horizontal overflow, clipped controls, an inaccessible Generate
  action, and a preview that exceeds its container.
