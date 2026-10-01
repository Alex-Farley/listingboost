---
id: "001"
stage: spec
status: draft
intent: intent.md
policies_applied: []
---

# Spec: R10 brand settings and templates

## Summary

Give each organisation one Brand Settings page where owners edit, and members
view, agency identity, contact details, logo, colours, typography, a stored tone
preference and preferred templates. A campaign snapshots those settings when it
is created, so new graphics and copy use them consistently and approved assets
never change. Tone is stored only and is kept out of copy generation.

## Requirements

| ID | Requirement | Serves (intent section) |
|----|-------------|-------------------------|
| R1 | Every read and write of brand settings, logos and fonts uses the organisation scope from the signed-in session. Another organisation's settings or files are not found. | Constraints; Success measures |
| R2 | Owners can edit settings; members can view them but cannot change them. | In scope; Success measures |
| R3 | The profile holds agency name, contact phone, contact email, website, office address, primary and secondary colour, heading and body font, tone preference, logo and preferred templates. Every value is optional and an unset value is shown as unset. | In scope; Proposed outcome |
| R4 | Each field has explicit validation. An invalid save persists nothing and returns an error per field. | In scope (accessible management); Constraints |
| R5 | A logo is uploaded as a PNG, JPEG, WebP or SVG of at most 2 MiB. An SVG must pass a safety check and is converted to a PNG; only the PNG is kept. Logos are stored in private organisation-scoped R2. Replacing a logo keeps the earlier file, and an owner can restore any earlier logo while the organisation exists. | In scope; Constraints |
| R6 | An owner can upload a custom font in WOFF, WOFF2, TTF or OTF format of at most 2 MiB after confirming usage rights for that upload. Bundled presets are offered in body-text and heading groups and do not restrict uploads. Each bundled family ships with its licence notice. Removing a custom font hides it from selection and keeps the file; an organisation has at most 10 selectable custom fonts. | In scope; Constraints; Open questions |
| R7 | The tone preference is a short freeform value stored on the profile. It is not passed to the copywriter, not applied to copy and not recorded in generation parameters. | Problem; Out of scope; Constraints |
| R8 | A campaign captures brand settings and preferred templates when it is created. All generation and regeneration in that campaign uses the capture, not the live profile. | Proposed outcome; Constraints |
| R9 | New graphics use the captured colours, fonts and logo. Each template declares which agency and contact fields it shows, and unset fields are omitted. Copy uses captured agency and contact details only, under the existing copy-truth rules. | In scope; Constraints |
| R10 | Each graphic slot offers two layouts: the current one and one new alternative. An owner can choose a preferred template per graphic slot from that catalogue. A new campaign uses the preference and records the template id and version on each asset. An unavailable preference is reported and is never replaced silently. | In scope; Out of scope; Constraints |
| R11 | Changing settings or preferences never alters an approved asset version or its stored bytes. Regeneration creates a new version under the existing rules. | In scope; Constraints; Success measures |
| R12 | The settings journey works by keyboard and assistive technology, and at narrow widths. | Users affected; In scope |
| R13 | Saving colours that give poor contrast for text on graphics shows a warning. The save still succeeds. | Constraints (accessible design direction); owner decision 2026-10-01 |

## User journeys

1. **View.** A signed-in user opens **Brand Settings** from the sidebar
   (Master Spec §23). The page loads their organisation's values in five
   groups: Agency details, Contact details, Logo, Colours and typography,
   Tone and templates. Unset values read "Not set". A member sees the same
   values read-only, with a line saying only an owner can change them.
2. **Edit.** An owner changes fields and chooses Save. Errors appear beside the
   field with how to fix it, focus moves to the first error, and nothing typed
   is lost. A successful save is confirmed and says the change applies to new
   campaigns only. If the colours contrast poorly for text, the confirmation
   carries a warning and the values are still saved.
3. **Logo.** An owner uploads a logo and sees a preview. Uploading another makes
   it current. Earlier logos are listed under "Previous logos" with a Restore
   action each. A rejected file says why (type, size, unsafe SVG content). An SVG is
   converted to a PNG on upload, and the page says so.
4. **Fonts.** An owner picks a heading font and a body font from presets grouped
   by use, or uploads a font. The upload asks them to confirm they have the
   right to use the font; without that confirmation the upload is refused.
   Uploaded fonts appear in a "Your fonts" group for either role. Removing an
   uploaded font takes it out of the list; campaigns that already use it are
   unaffected.
5. **Tone.** An owner enters a short tone preference. Help text states that it
   is saved for future use and does not change generated copy today.
6. **Templates.** For each graphic slot (square post, portrait post, story) an
   owner picks one of two layouts. If a saved preference
   is no longer available, the page says so and asks for another choice.
7. **Campaign.** A user creates a campaign. Its graphics and copy use the
   settings as they were at creation. If a preferred template is unavailable,
   that asset is reported as unavailable with the reason, and other assets
   proceed.
8. **Later change.** An owner changes the brand after assets were approved.
   Approved versions stay byte-for-byte the same. Regenerating inside the older
   campaign still uses that campaign's captured branding; the new branding
   appears in campaigns created afterwards. Copying an old campaign to apply
   new branding is a separate work item.

## Design decisions

| Decision | Alternatives considered | Why this one | Decision record |
|----------|-------------------------|--------------|-----------------|
| Keep the existing organisation-scoped `brand_settings` row as the live profile. No organisation id appears in any settings URL; scope comes from the session. | Per-user or per-property settings; organisation id in the path. | One brand per organisation is the existing model, and omitting the id removes a cross-tenant parameter to defend. | Existing architecture. |
| A member's write is refused as forbidden (403) with a plain message; another organisation's logo or font id is not found (404). | 404 for both. | The member belongs to the organisation and can see the settings, so "not found" would be untrue. Cross-tenant stays 404 per the tenancy rule. | Existing tenancy rule. |
| Capture a brand snapshot on the campaign at creation: agency and contact fields, colours, font references, logo reference and preferred-template choices. Tone is not captured. | Read the live profile at each job (today's behaviour); capture when each job starts. | The intent requires consistent branding for queued work. Leaving tone out keeps it away from generation entirely. | Proposed D-021. |
| Regeneration inside a campaign uses that campaign's snapshot. | Regeneration picks up the live profile. | Follows from "campaigns capture settings at creation"; mixing brandings inside one campaign would break consistency. This means a rebrand shows only in new campaigns. | Proposed D-021. |
| Campaigns that exist before this change are given a snapshot of their organisation's settings as of the migration. | Leave them reading the live profile. | One code path for all campaigns, and their output stays what it would be today. | Proposed D-021. |
| Remove `toneOfVoice` from the copy request and from recorded generation parameters. | Keep passing it and rely on the adapter ignoring it (today's behaviour). | The intent says tone is not sent to the copywriter. A later provider would otherwise receive it without a decision. | D-017; OD-2 stays open. |
| Manual-edit copy warnings treat the campaign snapshot's agency and contact strings as allowed brand text. | Use the live profile. | Consistent with what generation in that campaign used. | Existing D-016/D-017 behaviour, re-pointed. |
| Logos get their own upload policy, separate from property photos: 2 MiB, PNG/JPEG/WebP/SVG, no 400 px minimum. Raster files reuse the existing container-integrity checks. | Reuse the photo policy (rejects SVG, requires 400 px). | Logos are small and often vector. D-009's SVG rejection continues to apply to property photos. | Proposed D-020 (amends D-009 for logos only). |
| SVG logos are checked against a strict allowlist and rejected, not rewritten, if they contain scripts, event attributes, `foreignObject`, external or non-fragment references, embedded images, a DOCTYPE or entities. An SVG that passes is rasterised to a PNG at upload with the existing in-Worker rasteriser, 2048 px on its longer side. Only the PNG is stored and served; the SVG is discarded. | Rewrite unsafe SVGs into safe ones; store the checked SVG and serve it with sandboxing headers. | No SVG ever reaches a browser, so safety does not rest on the allowlist and headers alone. Rejecting is simpler to prove correct than rewriting. The logo no longer scales beyond the stored size, which exceeds any template's logo area. Owner decision 2026-10-01. | Proposed D-020. |
| Logo history is a per-organisation list of logo records; the profile points at the current one. Restore re-points it and uploads nothing. | Store only the current logo; copy the file on restore. | The intent requires replaced logos to stay available, and snapshots can keep referring to the exact file they captured. | Proposed D-020. |
| Graphic templates gain a new version that draws the logo, uses the captured fonts and declares its brand fields. Version 1 stays as it is. | Edit version 1 in place. | Templates are versioned and a template change must not alter earlier output (Master Spec §21). | Existing template rule. |
| Add one alternative layout template for each graphic slot (square post, portrait post, story). Its design is the "Full photo" layout below. | Ship the preference mechanism with one design per slot; a framed-photo layout. | A picker with one option is not a choice, and a photo-led layout is the clearest contrast with the current brand-led one. Owner decision 2026-10-01. | No new record. |
| Removing a custom font hides it from selection and keeps the file while the organisation exists. At most 10 selectable custom fonts per organisation. | Delete the file when no campaign refers to it. | Matches how replaced logos are kept, and older campaigns can always regenerate. Owner decision 2026-10-01. | Proposed D-022. |
| Preset font files are loaded from storage, not built into the Worker bundle. The two families already bundled stay as the template fallback. | Bundle all eight families. | The Worker bundle is already about 1.4 MB gzip. Owner decision 2026-10-01. | Proposed D-022. |
| A save checks the contrast between the colours and the text drawn on them against WCAG AA for large text (3:1) and returns a warning, not an error. | Renderer picks a light or dark text colour automatically; do nothing. | The owner stays in control of their brand colours and is told the consequence. Owner decision 2026-10-01. | No new record. |
| A preference is stored as one template id per graphic slot. The newest version of that template is resolved when the campaign is created and recorded on the asset. | Store id and version; offer a choice during campaign creation. | The owner chooses a design, not a revision, and campaign creation keeps no extra decision. | No new record. |
| An unavailable preferred template yields an asset reported as `unavailable` with the reason, using the existing honest-capability reporting. | Fall back to the default template; fail the whole campaign. | The intent forbids silent substitution, and one missing design should not block the rest of the pack. | D-012. |
| A WOFF2 upload is converted to its TTF or OTF form at upload and only the converted file is stored. The decoder is Google's woff2 as a precompiled WebAssembly module with no runtime code generation, about 100 KB gzip. A font whose decoded size exceeds 8 MiB is rejected. Variable fonts are rejected in every format because the renderer cannot draw them. | Decode at each render; drop WOFF2; ship a hand-patched third-party loader. | The renderer reads only TTF, OTF and WOFF, and Workers cannot compile WebAssembly from bytes or build functions from strings. Spike 002 showed this route decodes byte-identically to the reference and that decoded fonts are 2 to 3 times the upload size. | Proposed D-022. |
| A custom font file serves one role at its own weight; no synthetic bold. Font uploads are validated by size, extension, signature and a successful test render. The rights confirmation is recorded with who confirmed and when. | Require a family of weights per upload; trust the extension. | Keeps the upload to one decision, and a test render is the only proof the renderer can use the file. | Proposed D-022. |
| No paid provider and no credentials. | Add a text provider to apply tone. | Out of scope; OD-1 and OD-2 remain owner decisions. | `docs/DECISIONS.md` OD-1/OD-2. |

D-020 to D-022 will be added to `docs/DECISIONS.md` when this spec is approved;
D-022 includes the WOFF2 conversion shown feasible by spike 002.

Only owners exist in the product today, because sign-up creates an owner and
there is no invitation flow. The member view is still specified and tested with
a seeded member; inviting members is not part of this work.

### Field validation

| Field | Rule |
|-------|------|
| Agency name | Optional, trimmed, up to 100 characters, single line. |
| Contact phone | Optional, up to 30 characters: digits, spaces, `+`, `(`, `)`, `-`. |
| Contact email | Optional, valid address format, up to 254 characters. |
| Website | Optional, `http` or `https` URL, up to 200 characters. |
| Office address | Optional, up to 300 characters, up to 4 lines. |
| Primary / secondary colour | Optional, `#RRGGBB`. |
| Heading / body font | Optional; a preset id or one of the organisation's uploaded fonts. |
| Tone preference | Optional, trimmed, up to 200 characters, single line, no control characters. Empty clears it. |
| Preferred template | Optional per slot; must be a catalogue template for that slot's asset type and aspect ratio. |

### Alternative layout: "Full photo"

Approved by the owner on 2026-10-01. It uses the same content as the current
layout, so it adds no copy slots or data.

| Element | Treatment |
|---------|-----------|
| Photo | Fills the whole canvas, cropped to fit as today. |
| Text area | A dark gradient over the bottom third, fading to nothing upwards, with white text. The owner accepted the gradient as a design overlay, like the crop; it is not an edit to the property photo. |
| Headline | Heading font, up to two lines. |
| Facts | Bedrooms/bathrooms and price on one line beneath, in the body font; each shown only when recorded. |
| Brand colour | Accent only: a short bar above the headline and the background of the call-to-action label. |
| Logo | Top-left on a small white rounded badge. With no logo, the agency name appears bottom-right as text; with neither, nothing is shown. |
| Story (9:16) | Same layout, with logo and text kept out of the top and bottom 250 px. |

### Font presets

The owner approved this list on 2026-10-01, subject to the licence check. All are believed to be under the SIL Open Font License 1.1. Each licence must be
confirmed from the upstream licence file before the family is added, and that
file ships in the repository beside the font.

| Use | Families |
|-----|----------|
| Headings | Playfair Display (already bundled), Cormorant Garamond, DM Serif Display, Montserrat |
| Body text | Inter (already bundled), Source Sans 3, Lato, Open Sans |

## Cognitive load (only if users see or do anything different; see sdlc-ux-review)

The service carries the complexity: it captures branding per campaign, decides
which brand fields each template shows, checks uploads, and keeps old logos.
The owner only states what the brand is.

| Theme / law | Decision | Alternative rejected |
|-------------|----------|----------------------|
| Effort | One organisation-level page, reached from the sidebar. Restore is one action per previous logo. | Re-entering agency details per campaign; re-uploading an old logo. |
| Decisions | Every field is optional with a stated default. Presets come in two short groups by use. No template choice is asked during campaign creation. | Required brand fields before a first campaign; one long font list. |
| Memory | Saved values are shown on return. Help text sits beside the field it explains: the tone note, the font rights statement, "applies to new campaigns". | Explaining these rules on a separate help page. |
| Attention and grouping | Five labelled groups, one primary Save action. File uploads act immediately and say so, separately from Save. | A single undivided form; upload buttons that look like Save. |
| Familiarity | Existing ListingBoost form controls, error pattern and "Not recorded"-style empty values. A native colour input alongside a hex text field. | A custom colour picker or a separate settings interaction model. |
| Progress and endings | Loading, saved and failed states are announced. Save confirms what will and will not change. Upload shows progress and the resulting preview. | A silent save; implying existing assets were updated. |
| Forgiveness | Errors keep entered values and say how to fix them. A replaced logo can be restored. Members see why fields are read-only. | Clearing the form on failure; disabled controls with no explanation. |

## Data

| Data item | Personal? | Classification | Stored where | Retention | Shared with |
|-----------|-----------|----------------|--------------|-----------|-------------|
| Agency name, office address, phone, email, website | Possibly; a sole trader's or named person's contact details identify an individual. | Confidential organisation profile; may be personal data. | `brand_settings` row in D1; copied into each campaign's snapshot. | While the organisation exists. | Members of that organisation; the in-Worker copywriter and renderer. Appears in generated assets the organisation chooses to publish. |
| Logo files, current and previous | May identify a person or business. | Confidential business asset. | Private organisation-scoped R2 as PNG, JPEG or WebP, with a record per file in D1. An uploaded SVG is not kept. | While the organisation exists, including replaced logos. | Members of that organisation through signed URLs; the in-Worker renderer. |
| Custom font files | No. | Confidential; third-party licensed material. | Private organisation-scoped R2, with a record per file in D1. A WOFF2 upload is kept only in converted form. | While the organisation exists, including fonts removed from selection. | The in-Worker renderer only. Font files are not served for download. |
| Font rights confirmation: user id and time | Yes; links a user to an action. | Internal audit data. | D1, on the font record and in the audit log. | While the organisation exists. | Members of that organisation. |
| Colours, font choices, preferred templates | No. | Confidential organisation configuration. | `brand_settings` row; campaign snapshot. | While the organisation exists. | Members of that organisation; the in-Worker renderer. |
| Tone preference | Normally no; free text could contain personal data. | Confidential organisation configuration. | `brand_settings` row only. Not in snapshots or generation parameters. | While the organisation exists. | Members of that organisation. No provider. |

Do not log contact values, tone text, logo bytes or font bytes. Settings saves,
logo uploads and restores, and font uploads are written to the existing audit
log by action and actor, without the values. Nothing is sent to an external
provider. There is no organisation-deletion flow today. The owner accepted
retention while the organisation exists on 2026-10-01; a future deletion flow
must delete these R2 objects along with the rows.

## Acceptance criteria

| ID | Requirement | Given | When | Then |
|----|-------------|-------|------|------|
| AC1 | R1 | Organisations A and B each have saved settings. | A user of A loads Brand Settings. | Only A's values are returned. |
| AC2 | R1 | A user of B knows the id of one of A's logos or fonts. | They request, restore or select it. | The response is the standard not-found, and A's data is unchanged. |
| AC3 | R2 | A member of organisation A is signed in. | They load Brand Settings. | They see A's values read-only and a statement that only an owner can change them. |
| AC4 | R2 | A member of organisation A is signed in. | They submit a settings change, a logo, a logo restore or a font. | The request is refused as forbidden and nothing changes. |
| AC5 | R2, R3 | An owner submits valid values for every field. | They save and reload. | The reloaded page shows the saved values. |
| AC6 | R3 | An organisation has only its agency name set. | A user views the page. | Every other field reads as not set; no default is shown as if it were configured. |
| AC7 | R4 | An owner enters an invalid value in each field in turn (see Field validation). | They save. | The response names the field and the fix, and the stored profile is unchanged. |
| AC8 | R4 | An owner submits a valid edit and persistence fails. | The save returns an error. | A recoverable error is shown and the entered values remain in the form. |
| AC9 | R5 | An owner has no logo. | They upload a valid PNG, JPEG or WebP of at most 2 MiB. | It becomes the current logo and a preview is shown. |
| AC10 | R5 | An owner selects a file over 2 MiB, of another type, with a mismatched signature, or a corrupt image. | They upload it. | It is rejected with the reason and the current logo is unchanged. |
| AC11 | R5 | An SVG contains a script, an event attribute, `foreignObject`, an external reference, an embedded image, a DOCTYPE or an entity. | An owner uploads it. | It is rejected as unsafe, and nothing is stored. |
| AC11a | R5 | An owner selects a safe SVG of at most 2 MiB. | They upload it. | A PNG made from it becomes the current logo, the SVG is not stored, and no response ever serves SVG content. |
| AC12 | R5 | An owner has a current logo. | They upload a second logo. | The second is current and the first is listed under previous logos, with its file still stored. |
| AC13 | R5 | An owner has a previous logo. | They restore it. | It becomes current, the logo it replaced becomes a previous logo, and no file is deleted. |
| AC14 | R6 | An owner selects a valid WOFF, WOFF2, TTF or OTF file of at most 2 MiB and confirms usage rights. | They upload it. | The font is stored, selectable for heading or body, and the confirmation is recorded with the user and time. |
| AC14a | R6 | An owner uploads a valid WOFF2 font and selects it. | A new campaign's graphic is rendered. | The graphic uses that font, and the stored file is the converted TTF or OTF, not the WOFF2. |
| AC14b | R6 | An owner selects a variable font in any accepted format. | They upload it. | It is rejected with a message that variable fonts are not supported and a static font file is needed. |
| AC14c | R6 | An owner selects a WOFF2 file that is corrupt, or whose decoded size exceeds 8 MiB. | They upload it. | It is rejected with the reason and nothing is stored. |
| AC15 | R6 | An owner selects a valid font file but does not confirm usage rights. | They upload it. | The upload is refused with an explanation and nothing is stored. |
| AC16 | R6 | An owner selects a font over 2 MiB, of another format, or one the renderer cannot load. | They upload it. | It is rejected with the reason. |
| AC17 | R6 | The preset list is shown. | A user opens the font choices. | Presets appear under Headings and Body text, uploaded fonts appear in their own group, and an uploaded font can be chosen for either role. |
| AC18 | R6 | The repository bundles preset font families. | The licence check runs. | Every bundled family has its licence notice file beside it. |
| AC18a | R6 | An owner has an uploaded font that a campaign snapshot uses. | They remove it. | It no longer appears in the font choices, its file is still stored, and regenerating in that campaign still uses it. |
| AC18b | R6 | An organisation has 10 selectable custom fonts. | An owner uploads another. | The upload is refused with an explanation that one must be removed first. |
| AC19 | R7 | An owner saves a tone preference. | A campaign's copy is generated. | The copy is identical to copy generated with no tone set, and the tone text appears in neither the copy request nor the recorded generation parameters. |
| AC20 | R8 | A campaign was created and its jobs are still queued. | An owner changes colours, logo, fonts and contact details, then the jobs run. | The output uses the values from when the campaign was created. |
| AC21 | R8 | A campaign existed before this change was deployed. | The migration runs and an asset in it is regenerated. | The campaign has a snapshot of its organisation's settings as of the migration, and the new version uses it. |
| AC22 | R9 | A logo, colours and fonts are saved. | A new campaign's graphic is rendered. | The image shows the logo in the template's logo position and uses the saved colours and fonts. |
| AC23 | R9 | No logo, colours or fonts are saved. | A new campaign's graphic is rendered. | The template's fallback colours and fonts are used, and there is no logo and no empty logo space or broken image. |
| AC24 | R9 | A template declares the agency and contact fields it shows, and some of those are unset. | A graphic is rendered. | Only the declared, set fields appear; undeclared fields do not appear and unset fields leave no placeholder. |
| AC25 | R9 | Agency and contact details are saved. | New copy is generated. | Copy uses only those details and recorded facts, and passes the copy-truth check with no unsupported property claim. |
| AC26 | R10 | An owner has chosen a preferred template for a graphic slot. | A new campaign is created. | That slot's asset records the preferred template's id and its newest version. |
| AC26a | R10 | The catalogue is seeded. | An owner opens the template choice for each graphic slot. | Two layouts are offered for the square post, the portrait post and the story. |
| AC26b | R9, R10 | A campaign uses the Full photo layout, with a logo and brand colour saved. | A graphic is rendered. | The photo fills the canvas, the headline and recorded facts appear in white over the lower gradient, the logo is top-left, and all text comes from reviewed copy, recorded facts and brand details. |
| AC26c | R9, R10 | A campaign uses the Full photo layout for a story. | The story is rendered. | No logo or text falls within the top or bottom 250 px. |
| AC27 | R10 | No preference is set for a slot. | A new campaign is created. | The slot uses the catalogue default and records its id and version. |
| AC28 | R10 | A saved preference refers to a template that is no longer available. | A new campaign is created. | That asset is reported as unavailable with the reason, no other template is used for it, and the other assets proceed. |
| AC29 | R10 | A saved preference is no longer available. | An owner opens Brand Settings. | The page says the preference is unavailable and asks for another choice. |
| AC30 | R10 | An owner submits a preferred template that does not match the slot's asset type and aspect ratio. | They save. | The save is rejected with a field error. |
| AC31 | R11 | An asset version is approved. | Settings, logo, fonts or preferences change. | The approved version's record and stored bytes are identical to before. |
| AC32 | R11 | An asset version is approved and settings have changed. | The asset is regenerated. | A new version is created under the existing rules and the approved version is untouched. |
| AC33 | R12 | A keyboard or screen-reader user makes an invalid entry. | They submit, then correct it. | Every control has a programmatic label, each error is associated with its field and announced, focus moves to the first error, and entered values are kept. |
| AC34 | R12 | A screen-reader user saves, uploads or restores. | The action completes or fails. | The outcome is announced without moving focus unexpectedly. |
| AC35 | R12 | The page is viewed at 390 px and at desktop width. | A user views, edits and saves. | All fields, errors, previews and actions are visible and operable with no horizontal page scrolling. |
| AC36 | R2, R12 | A member views the page. | They move through it by keyboard. | Read-only fields are readable by assistive technology and no edit, upload or restore action is offered. |
| AC37 | R13 | An owner enters colours whose contrast for text on graphics is below 3:1. | They save. | The values are saved and a warning explains that text may be hard to read. |
| AC38 | R13 | An owner enters colours whose contrast is 3:1 or better. | They save. | No contrast warning is shown. |



## Service levels (if this adds or changes a user journey that matters)

No change. Editing settings uses the existing authenticated application.
Rendering with a logo and custom fonts must stay within the existing
generation retry and error handling.

## Flagged concerns

No `policy-*` skills are installed in this repository. The tenancy,
property-truth and versioning rules from the repository docs are applied above.
Resolutions were given by the product owner on 2026-10-01.

| Policy | Conflict | Options | Owner | Resolution |
|--------|----------|---------|-------|------------|
| Feasibility (D-018) | The intent requires WOFF2 uploads. satori's documentation lists TTF, OTF and WOFF as supported and says WOFF2 is not. Decoding WOFF2 in the Worker needs a WebAssembly decoder, which must be precompiled like the existing wasm modules. This has not been tried in this repository. | (a) Spike WOFF2 decoding in workerd before the plan. (b) Convert at upload with no spike. (c) Drop WOFF2 from the intent. | Product owner with engineering | Resolved: (a). Spike 002 passed on local workerd (`work/002-woff2-worker-decode/spike.md`, branch `spike/002-woff2-worker-decode`). WOFF2 is converted once at upload. |
| Product decision | There was one template per graphic slot, so a preference had nothing to choose between. | (a) Add one alternative layout per slot. (b) Ship the mechanism only. | Product owner | Resolved: (a), using the "Full photo" layout above. |
| Security (D-009) | D-009 rejects SVG uploads; the intent accepts SVG logos after sanitisation. | (a) Store the checked SVG. (b) Rasterise to PNG and store only the PNG. | Product owner with engineering | Resolved: (b). |
| Data handling | The intent did not set retention for custom fonts. | (a) Hide on removal, keep the file. (b) Delete only when unused. | Product owner | Resolved: (a), with a cap of 10 selectable custom fonts. |
| Licensing | Each bundled family's redistribution terms must be checked. | (a) All eight, served from storage, each subject to AC18. (b) A shorter list. | Product owner with engineering | Resolved: (a). A family whose licence does not check out is left out. |
| Data protection | Contact details and tone text may be personal data, and there is no organisation-deletion flow. | Accept retention while the organisation exists; or add deletion now. | Product owner / privacy owner | Resolved: accepted for now. Deletion is a requirement on the future deletion flow. |

## Open questions

- Resolved: the WOFF2 spike passed. Its timings are from a development
  machine; decode time is to be confirmed on the first preview deploy.
- Resolved: existing campaigns keep their captured branding, including on
  regeneration. Copying an old campaign so the copy takes the current branding
  will be captured as a separate work item.
- Resolved: with tone excluded, copy uses agency name and contact details only,
  as the copywriter does today. Stated to the owner on 2026-10-01 as an
  assumption, with no objection raised.
