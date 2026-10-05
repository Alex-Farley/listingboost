# Spike 008: HEIC conversion (throwaway, never merge)

Findings: `work/008-heic-conversion/spike.md`. Test images are not committed (one is under Nokia's
HEIF licence, two are 5 MB and 23 MB); `make.py` regenerates the synthetic ones.

- `make.py`: synthetic 12 MP and 48 MP HEIC (`pipx run --spec pillow-heif python make.py`).
- `bench.mjs`: decode with libheif-js 1.23.5 in Bun (`bun add libheif-js@1.23.5` in a scratch folder).
- `browser.mjs`: decode and convert to JPEG in Chromium, with three content security policies.
