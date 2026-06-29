# Design QA

## Scope

- Surface: `app/poster.html`
- Reference: user-provided basketball poster images, especially lock-screen style red typography and grayscale background treatment.
- Local URL: `http://localhost:4174/poster.html`

## Checks

- Desktop viewport `1280x720`: passed.
- Mobile viewport `390x844`: passed.
- Image loading: 18 poster images loaded from `app/assets/poster/new-set/`.
- Subject isolation: transparent subject PNGs generated in `app/assets/poster/subjects/centered-new-set/` and used for the color foreground layer.
- Background preservation: each slide still uses the original source photo as the grayscale full-screen background.
- Console errors: none observed.
- Horizontal overflow: none observed on desktop or mobile.
- Carousel controls: Next button advances and keeps controls inside the viewport.
- Active thumbnail state: exactly one active thumbnail after transition.

## Notes

- Photoshop MCP rejected direct local image access with `FORBIDDEN`, so the shipped page uses local browser-safe layering: grayscale full-screen background plus color subject layer with a soft mask.
- Local segmentation used `rembg` with `u2net_human_seg`.
- The foreground is no longer a soft same-image mask; it is a real transparent PNG subject layer.

final result: passed
