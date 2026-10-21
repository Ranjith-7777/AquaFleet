# Landing assets

## vessel.webp / vessel.png

Top-down research vessel used as the hero image of the unauthenticated
AquaFleet landing/login screen.

**Provenance**

> Derived from the AquaFleet target concept reference supplied for this
> project; extracted and visually cleaned for use as an independent
> landing-page asset.

It is not a licensed stock photograph and carries no external photographic
provenance. It must not be described as one.

**Preparation**

- Source: `docs/landing-design/references/01-aquafleet-target-concept.png`
- The vessel-and-wake region was extracted from the reference.
- The reference's baked-in HUD artefacts (scan wedge, `SEA TEMP` readout,
  `SCAN` fragment) were removed; the affected top-right water area was
  repaired with mirrored clean water from the opposite side of the hull.
- Edges were alpha-feathered so the asset composites into the page's own
  ocean layer rather than sitting on a visible rectangle.
- Tone was cooled/deepened slightly to match the landing palette.
- The image was rotated -2.0 deg so the hull reads upright (the source
  photograph sits about 2 deg clockwise of vertical). The rotation is baked
  in; no CSS transform is applied to the vessel.

**Files**

| File | Size | Notes |
| --- | --- | --- |
| `vessel.webp` | 750 x 1642 | Primary. Referenced from `auth.js` via `<picture>`. |
| `vessel.png` | 750 x 1642 | Fallback for browsers without WebP. Same pixels. |

Both files are at the master's native resolution — no upscaling. The
largest rendered size is approx. 473 CSS px wide (1920x1080), so the asset
is served at roughly 1.6x there and 1:1 or better at every smaller
breakpoint. The master (`vessel-v3.png`) lives with the design prototype.
