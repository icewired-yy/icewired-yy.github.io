# Contemplative light prototype

This directory contains a standalone static visual prototype. It is intentionally
disconnected from the production Jekyll layouts, includes, Sass, data files, and
deployment workflow, so appearance work can be approved before any production
integration begins.

## Open it

Double-click `index.html`, or open it from a browser. All fonts and images used by
the prototype are copied into this directory, so the page does not need a build
step or a network connection to render its core design. Homepage preview links
open the corresponding local static pages.

## Scope

- The homepage is an overview: identity, recent research, projects, notes, and a
  life-photo preview. News is intentionally absent from the current navigation.
- The pointer effect is shared by the homepage and every active collection page.
  Its six-sword trail records the first sword's real guide path and lets every
  follower sample that same curve by arc length. Existing one-by-one wheel
  formation and fixed identity order remain intact.
- The root paint order is explicit: document content and its body-mounted image
  overlays stay below the pointer-transparent sword field, while navigation,
  footer chrome, and the skip link stay above it. Nested cards cannot escape
  the content stacking context.
- Supplied Chinese calligraphy appears as quiet deep-green decoration behind the
  corresponding English headings. `section-gongfa.png` is retained but unused.
- Research, Projects, Notes, and Gallery have matching standalone static pages.
  `news.html` is retained only as an unlinked source record for possible later use.
- Notes now demonstrates the migrated visual shell while all article links remain
  on the established `/blog/` routes. Markdown, LaTeX, bibliography, comments,
  and rendering continue to belong to the existing Jekyll pipeline.
- The gallery uses existing site images as clearly labeled undated layout studies.
  They should be replaced with verified personal photographs and metadata before
  production synchronization.

## Files

- `index.html`: semantic homepage overview.
- `research.html`, `projects.html`, `notes.html`, `gallery.html`: matching active
  static collection-page prototypes.
- `news.html`: retained, unlinked source page outside the active route matrix.
- `styles.css`: isolated design system and responsive layout.
- `script.js`: shared pointer-responsive light field, bamboo leaves, and persistent
  sword identities that continuously change between a six-sword curved trail and
  a slowly following wheel, with a reduced-motion fallback.
- `assets/`: local fonts and copies of the current image assets.
- `decision/`: direction-round metadata kept for design traceability.
- `tests/sword_effect_smoke.cjs`: headless-browser identity, spacing, curved-path,
  procession, extraction, scrolling, and reduced-motion checks.
- `tests/prototype_smoke.cjs`: HTTP and direct-file checks for all five active pages
  at desktop and mobile widths, including the shared effect contract, News absence,
  images, glyph styling, links, screenshots, browser errors, and horizontal overflow.
- `tests/layering_smoke.py`: production Notes and prototype desktop/mobile checks
  for `content < body overlay < effects < navigation < skip`, including an
  extreme nested overlay and fixed-footer semantics.
- `tests/quiet_http_server.py`: loopback-only static server used by the browser
  smoke test without noisy per-resource request logs.
