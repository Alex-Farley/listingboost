# App Detail scaffold contract

This is a working scaffold, not a finished product. Preserve the shipped
App Detail layout and adapt its copy, fields, model, examples, and metadata in
place. The browser/server FNF bridge, host approval, uploads, and personal
history are already real; keep those boundaries intact.

## Read before editing

1. Read `src/layouts/AGENTS.md` before changing the screen structure.
2. Read `src/components/AGENTS.md` before composing UI or media interactions.
3. Read `packages/fnf/ai/AGENTS.md` and `packages/fnf-react/ai/AGENTS.md` before
   changing generation, upload, profile, cost, polling, or history behavior.
4. Read `packages/quanta/ai/AGENTS.md` for component APIs. Never patch the
   vendored packages to work around an app-level issue.

## Live boundaries that must remain

- `src/lib/fnf.browser.ts` is browser-safe and calls validated server functions.
- `src/lib/fnf.functions.ts` is the serialization boundary.
- `src/lib/fnf.server.ts` alone constructs the Workflow Platform adapter for
  `https://fnf.internal`; never expose internal URLs or credentials to the browser.
- `src/lib/generation-approval.ts` calls the host-injected
  `window.hf.requestGeneration(jobSetType, params)`. Never add `window.confirm`,
  a native dialog, or a second security modal.
- Keep the app publicly viewable under the `guest` scope. Do not gate the root
  on authentication. A guest Generate click navigates through
  `/__auth/login?return=<current path>`; authenticated Generate reaches
  `requestGeneration(...)` for approval before the backend submit.
- `AssetLibraryModal` live mode always receives `items`, `onUpload`, `onSelect`,
  and `pagination`. Submit `AssetSelection.ref`, never its preview `src`.
- History comes only from the scoped jobs feed. Uploaded media belongs in the
  Uploads tab and must never be inserted into History.
- All FNF query keys, run controllers, and cache writes retain the current
  user/workspace `scopeKey`. The identity query is the focus-refetch gate.

## Adaptation definition of done

- Replace Animal App copy, presets, prompt construction, model/settings, and
  metadata with the user's product.
- Build `src/landing-content.ts` from the same product brief as the generator.
  It must contain exactly three visual steps, exactly three honest feature
  cards, at least one showcase item, and one final CTA. Keep the live generator
  hero as the page's app preview; do not add a second fake app mockup.
- Keep the enforced Preset-style step previews: step 1 is a product-specific
  `instruction` UI, step 2 is the real primary `action`, and step 3 is `result`
  media. Never use three cover images or screenshots as the step previews.
  Generate dedicated owned media for the result and every showcase item under
  `public/assets/landing/`. Never reuse the marketplace cover, hero preview,
  another section's asset, or duplicate the same file under a new name.
  `check:adapted` verifies paths, repeated references, and duplicate file
  contents. Content may describe only capabilities the adapted app actually
  implements; never invent testimonials, customer logos, adoption numbers, or
  performance claims.
- Replace every product-representing `/presets/*` image with user-supplied or
  newly generated owned media at the displayed aspect ratio, then remove
  `public/presets/`.
- Keep real upload, approval, submit, cost, polling, success, terminal
  failure, retry, history pagination, download, and empty states.
- Do not add timeout-based fake generations, fabricated history, placeholder
  hosts, stock hotlinks, CSS/emoji mock artwork, `any`, or type suppressions.
- Run `bun run check:adapted`, `bun test`, `bun run typecheck`, `bun run lint`,
  and `bun run build`. `check:adapted` intentionally fails until the scaffold's
  product copy/assets have actually been replaced.

## Asset policy

Use user-provided assets first. Otherwise generate bespoke product media with
the available image-generation tool and save it under a meaningful
`public/assets/...` path. If no suitable input or generation tool is available,
state the missing requirement instead of inventing stand-ins.

Comments should explain a security boundary, cache invariant, or integration
contract. Do not narrate obvious JSX.
