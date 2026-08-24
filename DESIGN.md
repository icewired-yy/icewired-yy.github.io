---
name: Youyang Du — Contemplative Light
description: A quiet bamboo-grove research practice in mist, pine, teal light, and restrained gold.
colors:
  mist: "#f4f6f3"
  mist-surface: "#e9eeea"
  mist-surface-strong: "#dfe7e2"
  pine-ink: "#151916"
  quiet-ink: "#526159"
  pine: "#314f43"
  glyph-pine: "#173d31"
  spectral: "#526f75"
  gold: "#c4a951"
  focus-teal: "#1f6e58"
  pine-rule: "rgb(49 79 67 / 0.2)"
  code-wash: "rgb(223 231 226 / 0.72)"
typography:
  display:
    fontFamily: '"Onest", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(4rem, 8.5vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Onest", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(2.25rem, 4vw, 4.25rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: '"Onest", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(1.65rem, 3vw, 2.75rem)"
    fontWeight: 500
    lineHeight: 1.16
    letterSpacing: "-0.028em"
  body:
    fontFamily: '"Onest", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(1rem, 0.95rem + 0.22vw, 1.12rem)"
    fontWeight: 400
    lineHeight: 1.78
    letterSpacing: "normal"
  label:
    fontFamily: '"Onest", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: 1.68
    letterSpacing: "normal"
rounded:
  focus: "0.2rem"
  control: "10px"
  surface: "12px"
  featured: "14px"
  pill: "999px"
spacing:
  gutter: "clamp(1.25rem, 4.2vw, 5.5rem)"
  section: "clamp(7rem, 12vw, 12rem)"
  compact-section: "clamp(5.5rem, 20vw, 8rem)"
  notes-mobile-gutter: "clamp(1.1rem, 5vw, 1.6rem)"
  target-floor: "2.75rem"
components:
  navigation:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.quiet-ink}"
    typography: "{typography.label}"
    padding: "0 {spacing.gutter}"
    height: "4.5rem"
  navigation-active:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.pine}"
    typography: "{typography.label}"
    height: "{spacing.target-floor}"
  calligraphic-heading:
    backgroundColor: "transparent"
    textColor: "{colors.pine}"
    typography: "{typography.display}"
  work-preview:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.pine-ink}"
    typography: "{typography.title}"
    padding: "clamp(1.24rem, 2.4vw, 1.8rem) 0"
  section-link:
    backgroundColor: "transparent"
    textColor: "{colors.pine}"
    typography: "{typography.label}"
    padding: "0.35rem 0"
  notes-featured-entry:
    backgroundColor: "{colors.mist-surface}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.featured}"
    padding: "clamp(2rem, 4vw, 4.5rem)"
  notes-reading-surface:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.pine-ink}"
    typography: "{typography.body}"
    width: "72ch"
  light-field-signature:
    backgroundColor: "transparent"
    width: "100%"
    height: "100%"
---

# Design System: Youyang Du — Contemplative Light

## Overview

**Creative North Star: "A Quiet Bamboo-Grove Research Practice"**

This system frames research as a personal practice carried by mist ground, pine ink, teal light, and restrained gold. It feels contemplative, restrained, spacious, natural, and academically legible: the practitioner is present, but the interface never slips into literal Zen or religious decoration.

Quiet space is the organizing material. Sparse first views establish Youyang's bilingual identity, research focus, and one portrait; research, projects, Notes, and life then unfold as focused routes rather than competing panels. Borderless lists, calligraphic raster ghosts, and the shared bamboo-sword light field give the work an authored world without weakening technical readability.

The system refuses newspaper, report, and dashboard density, generic technology styling, and ornamental religion. Interaction comes from spacing, focus, subtle expansion, and authored motion instead of card chrome.

**Key Characteristics:**

- Mist ground with pine ink, muted teal light, and rare gold.
- Generous vertical silence and borderless chronological or preview lists.
- Semantic English headings paired with validated calligraphic raster ghosts.
- A shared pointer-responsive light field with bamboo leaves and flying swords.
- Technical reading surfaces held to a 72ch measure and accessible 44px controls.

## Colors

The palette stays close to pale natural paper and deep plant ink, using teal as optical atmosphere and gold as a rare signal.

### Primary

- **Pine** (colors.pine): Leads identity, major headings, links, and authored line work.
- **Focus Teal** (colors.focus-teal): Supplies the high-contrast visible focus outline and interactive hover emphasis.

### Secondary

- **Spectral Teal** (colors.spectral): Labels dates, metadata, mathematical marks, and light-transport atmosphere without competing with body copy.

### Tertiary

- **Restrained Gold** (colors.gold): Marks the site-point punctuation, current-route underline, reading progress, and sparse atmospheric glints.

### Neutral

- **Mist Ground** (colors.mist): The continuous page field.
- **Mist Surface** (colors.mist-surface): A quiet tonal distinction for the Notes band and selected reading surfaces.
- **Strong Mist Surface** (colors.mist-surface-strong): Selection, active pagination, media placeholders, and technical inset surfaces.
- **Pine Ink** (colors.pine-ink): Primary readable text.
- **Quiet Ink** (colors.quiet-ink): Supporting prose and metadata.
- **Glyph Pine** (colors.glyph-pine): The darker source tone for calligraphy and atmospheric rendering.
- **Pine Rule** (colors.pine-rule): Hairline separators without boxed containers.
- **Code Wash** (colors.code-wash): Technical code background inside the reading surface.

**The Rare Gold Rule.** Gold marks signature punctuation, active-route underlines, reading progress, and very small atmospheric accents; it never becomes a broad fill.

**The One Mist Rule.** The page stays on the mist family; use tonal shifts between background, surface, and strong surface instead of bright card colors.

## Typography

**Display Font:** Onest, with Noto Sans CJK SC and Microsoft YaHei fallbacks.

**Body Font:** Onest, with Noto Sans CJK SC and Microsoft YaHei fallbacks.

**Character:** One low-contrast sans family carries both identity and technical prose. Large titles gain character from compact tracking and scale, while the CJK fallback preserves the bilingual name and calligraphic relationship without introducing a decorative display face. The homepage prototype loads the variable builds as Onest Variable and Noto Sans SC Variable; production Notes uses the locally shipped Onest face.

### Hierarchy

- **Display** (400, clamp(4rem, 8.5vw, 6rem), 0.92, -0.04em): Notes and collection page titles; always capped at 6rem.
- **Headline** (400, clamp(2.25rem, 4vw, 4.25rem), 1, -0.035em): Major section headings below the first view.
- **Title** (500, clamp(1.65rem, 3vw, 2.75rem), 1.16, -0.028em): Article and list-entry titles.
- **Body** (400, clamp(1rem, 0.95rem + 0.22vw, 1.12rem), 1.78): Long-form technical reading within a 72ch measure.
- **Label** (500, 0.9rem, 1.68): Navigation and compact interface labels; metadata may tighten and space letters only in its implemented date/topic contexts.

**The Six-Rem Ceiling Rule.** Page and Notes display titles cap at 6rem and use -0.04em tracking; never inflate them beyond the authored scale.

**The No-Kicker Rule.** Do not add active page kickers above major titles; semantic titles and spatial rhythm carry hierarchy.

## Layout

The shared site frame is fluid up to 94rem with a horizontal gutter of clamp(1.25rem, 4.2vw, 5.5rem). Homepage sections breathe with clamp(7rem, 12vw, 12rem) above and below, while the compact homepage reduces that cadence to clamp(5.5rem, 20vw, 8rem). Notes narrows its index to 80rem, its primary lists to 76rem, and technical prose to 72ch.

The first viewport keeps minimal navigation above a three-column identity composition: bilingual name and research focus at left, deliberate open space through the middle, and one portrait at right. At 980px the hero becomes two columns; at 700px it becomes a single stacked route with the introduction and scroll invitation removed. Work previews remain linear rather than becoming cards, and hover/focus expansion collapses to a compact, nonessential-detail-free row on small or coarse-pointer presentations.

Notes uses its own content-first thresholds. Two-column section headings and imaged entries simplify at 900px; at 640px the gutter becomes clamp(1.1rem, 5vw, 1.6rem), navigation scrolls horizontally, and index/archive records become one column. Additional label tightening occurs at 360px, while the homepage navigation has its narrowest redistribution at 340px.

Every navigation and pagination control maintains a 2.75rem (44px) minimum target in each dimension. Technical tables, displayed mathematics, code, and media may scroll horizontally inside the 72ch reading route instead of forcing the page wider.

**The Quiet Sequence Rule.** Keep the first viewport sparse, then let research, projects, Notes, and life unfold vertically; do not compress them into a dashboard grid.

## Elevation & Depth

The system is flat and tonal by default. Depth comes from pale surface shifts, two very low-energy radial fields, image masks, translucent canvas strokes, and the occasional gold line. Only the fixed translucent Notes navigation and footer use soft ambient shadows with backdrop blur; they float just enough to preserve reading orientation and never become glossy panels.

### Shadow Vocabulary

- **Navigation Ambient:** A diffuse downward pine shadow at five-percent alpha beneath the translucent fixed Notes navigation.
- **Footer Ambient:** A still quieter upward pine shadow at 3.5-percent alpha above the fixed or sticky Notes footer.

**The Flat-by-Default Rule.** Surfaces are tonal and borderless at rest; ambient shadow belongs only to fixed translucent navigation and footer layers.

## Shapes

Primary homepage lists, work previews, navigation, and section links stay square and borderless, using whitespace and one-pixel pine-tinted separators instead of boxes. Notes introduces gently rounded 14px featured entries, 12px media/code/table-of-contents surfaces, and 10px pagination controls. The 0.2rem focus rounding follows the focus outline rather than changing component silhouette; 999px rounding belongs only to scrollbar thumbs.

Image geometry remains rectilinear and cropping-led: research media changes from 16:12 to 16:10 during authored expansion, the portrait dissolves through a directional mask, and irregular life imagery is composed by grid span rather than decorative frames.

**The Rare-Rounding Rule.** Keep primary lists and work previews square and borderless; reserve 10–14px rounding for Notes controls, media, code, and featured reading surfaces.

## Components

### Navigation

Quiet, compact, and always subordinate to identity or reading.

- **Shape:** Borderless links inside a 4.5rem Notes bar or an absolute homepage header; each link keeps the 44px target floor.
- **Color:** Quiet Ink at rest, Pine on hover/focus, and Pine plus a restrained Gold underline for the current route.
- **Behavior:** Homepage navigation wraps only at its narrowest breakpoint; Notes navigation becomes a horizontally scrollable strip at 640px. Visible focus uses the Focus Teal outline.

### Calligraphic Heading

Semantic English remains crisp in front while one authored raster glyph appears as a quiet spatial ghost behind it.

- **Form:** Page and Notes titles cap at 6rem with -0.04em tracking; section ghosts use approximately 0.16–0.18 opacity and a consistent rightward offset.
- **Accessibility:** Ghosts are noninteractive and hidden in forced-colors and print. The English heading remains the accessible text.
- **Assets:** Use the validated raster source for the matching concept; all 26 of 26 supplied raster assets have confirmed provenance.

### Work Preview

A restrained borderless row becomes a focused research route through expansion rather than card elevation.

- **Rest:** Compact image-and-copy columns, desaturated media, hairline separators, and no persistent detail block.
- **Hover / Focus:** Over 720ms, the media column and whitespace expand, the image restores saturation and scales by 1.018, the title grows, and details reveal; siblings recede to 0.52 opacity.
- **Fallback:** Focus-within mirrors hover. Small screens and coarse pointers preserve the compact row and hide nonessential detail so all primary links remain available.

### Section Link

A text route with one authored 16px SVG arrow, not a button-shaped control.

- **Shape:** Inline text over a single Pine-tinted bottom rule with 0.35rem vertical padding.
- **Hover / Focus:** Text deepens to Pine Ink, the rule resolves to Pine, and the arrow moves 0.18rem right and 0.18rem up over 420ms.
- **Icon:** Preserve the inline path M4 12 12 4M6 4h6v6 with round line joins; do not replace it with an icon-library glyph.

### Notes Featured Entry

A rare tonal reading invitation, softly rounded without becoming a dashboard card.

- **Surface:** Mist Surface blended with transparency and one low-energy Gold radial glow.
- **Shape:** 14px radius and clamp(2rem, 4vw, 4.5rem) padding, reduced to 2rem 1.5rem at 640px.
- **Content:** A large compact title, supporting description, and tabular read-time/year metadata; the title link carries the interaction.

### Notes Reading Surface

Technically capable, spacious, and subordinate to comprehension.

- **Measure:** 72ch maximum for metadata and article content; body text uses the 1.78 reading line-height.
- **Technical Content:** Code, tables, displayed mathematics, figures, Distill elements, citations, and bibliography remain in their native rendering pipelines. Overflow is handled locally and code or contents surfaces use 12px rounding.
- **Rhythm:** Headings gain strong top margins and compact tracking; body paragraphs and lists use a consistent 1.45rem lower rhythm.

### Light-Field Signature

One shared, fixed, pointer-transparent canvas ties active homepage and Notes routes together without taking over interaction. Its root layer sits above document content so authored swords and leaves remain visible across images, cards, and technical insets, while navigation, footer chrome, and the skip link remain above the canvas.

- **Atmosphere:** Two low-alpha teal interference lobes and a spectral focus share the effects layer at 0.62 canvas opacity. The stacking contract is content (1), body-mounted content overlays (5), effects (10), navigation/footer chrome (20), and skip link (100).
- **Authored Motion:** Fine-pointer movement may emit at most 9 bamboo leaves and lead a 6-sword trail; rest forms a 16-sword wheel, and renewed travel peels the same six identities back into the trail.
- **Resilience:** Canvas resolution caps at 1.5 device pixels per CSS pixel. Touch deactivates hover-specific effects. Reduced motion recenters a static field, removes leaves and swords, and stops continuous animation; missing canvas support leaves the site fully usable.

**The Authored-Signature Rule.** Use the shared active-page canvas with at most 16 wheel swords, 6 trail swords, and 9 bamboo leaves; stop sword and leaf motion for reduced-motion visitors.

**The Raster-Provenance Rule.** Treat all 26 of 26 validated raster assets as authored source material; do not redraw calligraphic ghosts or substitute generated approximations.

## Do's and Don'ts

### Do:

- **Do** preserve the mist, pine, teal, and gold hierarchy and spend gold only on rare signatures.
- **Do** keep technical article text within 72ch with 1.78 line-height and allow code, tables, equations, and media to scroll or expand safely.
- **Do** keep every navigation or pagination target at least 2.75rem (44px) in both dimensions.
- **Do** use semantic English headings in front of the validated raster calligraphy, and hide the raster layer in forced-colors and print.
- **Do** pair hover expansion with focus-within and provide a stable compact or coarse-pointer presentation.
- **Do** keep the single active-page light-field canvas pointer-transparent, above content surfaces, and below navigation, footer, and utility chrome.

### Don't:

- **Don't** turn the homepage into a newspaper, annual report, publication catalog, or dashboard.
- **Don't** add generic technology gradients, card grids, glowing controls, or literal Zen or religious motifs.
- **Don't** add page kickers, exceed the 6rem title cap, or loosen the -0.04em display tracking.
- **Don't** replace the authored 16-sword and 6-trail behavior, the 26 validated raster assets, or the inline SVG arrow with generic icon-library approximations.
- **Don't** make essential content depend on hover, canvas support, fine-pointer input, or motion.
