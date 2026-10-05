## WebP property photos render as graphics with no photo (004)

**Intent:** work/004-webp-photos-blank-graphics/intent.md
**Spec:** work/004-webp-photos-blank-graphics/spec.md
**Plan:** work/004-webp-photos-blank-graphics/plan.md
**Verify:** work/004-webp-photos-blank-graphics/verify.md
**Review:** work/004-webp-photos-blank-graphics/review.md

### What changed
- WebP photos are refused at upload and on replacement: "WebP photos can't be used on social posts or stories. Upload a JPEG or PNG." Logos still accept WebP.
- A graphic made from a WebP photo stored before this fails with a plain reason instead of being produced without the photo.
- Stored WebP photos carry a notice on the Images tab; the picker offers JPEG and PNG.
- New tests prove the photo is actually drawn in every graphic template, for JPEG and PNG.

### How it was verified
```
$ scripts/sdlc verify   757 pass, 0 fail   sdlc verify: PASSED
$ bun run test:e2e      3 passed
```

### Manual checks for the reviewer
1. Images tab: add a `.webp` with a `.jpg`; the WebP is refused by name and the JPEG uploads.

### Risk
routine - narrows accepted photo formats and adds a guard in generation. Three existing tests changed because the behaviour changed (listed in verify.md). The test run is about 40 s longer.

> Agent-assisted: written with Claude Code (Claude Opus 5.5). A person reviews and merges; the agent cannot approve or merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
