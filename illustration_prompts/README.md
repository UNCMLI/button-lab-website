# Button Lab Website Illustration Prompts

These files provide one standalone AI-image-generation prompt for each research area on the Button Lab website. Generate each illustration separately, then use it as the hero or supporting image for the corresponding section in `research.html`.

## Shared visual system

Use these settings for every image to produce a coherent website set:

- Format: horizontal 16:9, 2400 x 1350 px or larger.
- Visual language: polished biomedical editorial illustration, flat-to-soft 2.5D vector rendering, precise anatomy, subtle depth, clean shapes, restrained texture.
- Background: warm off-white or very pale blue-gray, never black.
- Palette: deep UNC navy (#1B365D), Carolina blue (#7BAFD4), teal (#1F8A8A), muted coral/orange (#D97745) only for pathology or intervention, pale gold (#D9B45B) only for therapy/energy, soft green (#5F9E7B) only for recovery.
- Typography: do not ask the model to generate labels, numbers, citations, logos, equations, or paragraphs. Add labels later in SVG/HTML if needed.
- Composition: preserve quiet negative space in the upper-left or upper-right 25% of the canvas for future website text overlays.
- Anatomy: airway cross sections should show a lumen, mucus gel, ciliated epithelium, and periciliary layer when relevant. Avoid generic alveoli when the science concerns conducting airways.
- Tone: authoritative, mechanistic, translational, elegant. Not cartoonish, not a clinical stock-photo collage, not a photorealistic surgical image.

## Production note

The prompt files deliberately exclude labels and dense diagrams. AI image models are poor at text, and scientific labels should be added as a separate overlay after image generation. Each file lists "reference concepts" from Button Lab publications or current grants; use these to preserve the scientific logic, not to reproduce a specific paper figure pixel-for-pixel.

## Files

1. `01_cf_mucus_dysfunction.md`
2. `02_airway_surface_liquid_regulation.md`
3. `03_mucociliary_clearance_mechanics.md`
4. `04_pcd_ciliopathy_biology.md`
5. `05_mucus_plug_pathogenesis_clearance.md`
6. `06_therapeutic_approaches.md`
7. `07_dry_air_airway_health.md`
8. `08_computational_mathematical_models.md`
