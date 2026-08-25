"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

/**
 * Parse explicit browser-smoke inputs from command-line flag pairs.
 *
 * @param {string[]} command_arguments - Tokens after the Node executable and
 *   script path. Accepted required flags are `--url-root`, `--chrome`, and
 *   `--artifacts`; each must have one non-empty value.
 * @returns {{urlRoot: string, chrome: string, artifacts: string}} Validated
 *   paths and HTTP root for the render-fixture run.
 * @throws {Error} If a pair is malformed or a required flag is missing.
 * @example
 * const options = _parse_arguments(process.argv.slice(2));
 */
function _parse_arguments(command_arguments) {
  // Collect flag-value pairs without assuming a machine-specific runtime path.
  const parsed_arguments = {};
  for (let argument_index = 0;
    argument_index < command_arguments.length;
    argument_index += 2) {
    const flag_name = command_arguments[argument_index];
    const flag_value = command_arguments[argument_index + 1];
    if (!flag_name?.startsWith("--") || !flag_value) {
      throw new Error(`Malformed argument pair at index ${argument_index}.`);
    }
    parsed_arguments[flag_name.slice(2)] = flag_value;
  }

  // Fail before file writes or browser launch when an environment input is absent.
  for (const required_name of ["url-root", "chrome", "artifacts"]) {
    if (!parsed_arguments[required_name]) {
      throw new Error(`Missing required --${required_name} argument.`);
    }
  }
  return {
    urlRoot: parsed_arguments["url-root"].replace(/\/$/, ""),
    chrome: parsed_arguments.chrome,
    artifacts: parsed_arguments.artifacts,
  };
}

/**
 * Build the shared production-shaped shell around one static render fixture.
 *
 * @param {string} page_title - Non-empty title used in the fixture document's
 *   `<title>`. The supplied test titles contain no HTML and must be trusted.
 * @param {string} rendered_content - Static HTML shaped exactly like the output
 *   of the corresponding Liquid layout. Empty content is technically accepted
 *   but produces an invalid fixture for this smoke suite.
 * @param {boolean} content_owns_main - `true` when `rendered_content` already
 *   contains Distill's `#main-content`; `false` wraps standard content in the
 *   default layout's main container.
 * @returns {string} Complete standalone HTML that loads the current formal
 *   Notes CSS, sword asset, and effects JavaScript from repository `/assets/`.
 * @throws {Error} This helper does not throw intentionally; callers own the
 *   trusted fixture strings.
 * @example
 * const html = _build_fixture_document("Notes", markup, false);
 */
function _build_fixture_document(page_title, rendered_content, content_owns_main) {
  // Match the default and Distill shell distinction without evaluating Liquid.
  const content_shell = content_owns_main
    ? rendered_content
    : `<main id="main-content" class="container mt-5 contemplative-notes-main" role="main">${rendered_content}</main>`;

  /*
   * Provide only the minimal layout primitives normally supplied by compiled
   * al-folio/Distill CSS. The stylesheet under test remains the real current
   * `/assets/css/contemplative-notes.css`; this fixture CSS is explicitly marked
   * and never represents a production build.
   */
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${page_title} · Jekyll render fixture</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'></svg>">
    <link rel="stylesheet" href="/assets/css/contemplative-notes.css">
    <style data-render-fixture-only>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; }
      .container { width: 100%; margin-inline: auto; }
      footer { padding: 2rem var(--notes-gutter); }
      .pagination { display: flex; gap: 0.4rem; padding-left: 0; list-style: none; }
      d-title, d-byline, d-article, d-contents, d-appendix,
      d-footnote-list, d-citation-list, d-bibliography { display: block; }
      .notes-distill-article { width: min(100%, 94rem); margin-inline: auto; }
      .notes-distill-article d-title,
      .notes-distill-article d-byline,
      .notes-distill-article d-article,
      .notes-distill-article d-appendix { width: min(calc(100% - 2 * var(--notes-gutter)), 68ch); margin-inline: auto; }
      .notes-distill-article d-byline { display: flex; flex-wrap: wrap; gap: 0.75rem; }
      .render-fixture-wide-content { display: inline-block; width: 76rem; }
    </style>
  </head>
  <body class="fixed-top-nav sticky-bottom-footer contemplative-notes-surface">
    <!-- Static render fixture only: this is not a Ruby/Jekyll production build. -->
    <a class="notes-skip-link" href="#main-content">Skip to content</a>
    <canvas id="light-field" class="notes-light-field" aria-hidden="true"></canvas>
    <img id="sword-asset" src="/assets/img/bamboo-cloud-sword.png" alt="" decoding="async" hidden>
    <script defer src="/assets/js/contemplative-effects.js"></script>
    <header class="notes-site-header">
      <nav id="navbar" class="notes-navbar" aria-label="Primary navigation">
        <div class="notes-navbar-inner">
          <a class="notes-site-mark" href="#main-content" aria-label="Return to the fixture content">YD<span aria-hidden="true">.</span></a>
          <div class="notes-site-nav">
            <a href="/publications/">Research</a>
            <a href="/projects/">Projects</a>
            <a href="/news/">News</a>
            <a href="/blog/" aria-current="page">Notes</a>
            <a href="/gallery/">Gallery</a>
            <a href="/cv/">CV</a>
          </div>
        </div>
      </nav>
    </header>
    ${content_shell}
    <footer><small>Static CSS render fixture — not generated by Jekyll.</small></footer>
  </body>
</html>`;
}

/**
 * Create the Notes index fixture using the production Liquid output topology.
 *
 * @returns {string} Rendered HTML fragment with index header, featured note,
 *   dynamic-list-shaped entries, topic metadata, and pagination controls.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * const markup = _build_notes_index_markup();
 */
function _build_notes_index_markup() {
  // Mirror `_pages/blog.md` after Liquid has expanded representative post data.
  return `<div class="post contemplative-notes notes-index">
    <header class="notes-index-header">
      <h1 class="notes-index-title"><span>Notes</span></h1>
      <p class="notes-index-description"><strong>Realm of Reverie</strong><span aria-hidden="true"> — </span>A realm where imagination blossoms and wisdom is sought.</p>
    </header>
    <section class="notes-featured" aria-labelledby="featured-notes-title">
      <div class="notes-section-heading">
        <h2 id="featured-notes-title">Pinned</h2>
        <p>Long-form notes that anchor the current line of inquiry.</p>
      </div>
      <div class="notes-featured-list">
        <article class="notes-featured-entry">
          <h3><a href="#main-content">NDF and Microfacet Model</a></h3>
          <p>A geometric derivation of the normal distribution function and microfacet BRDF.</p>
          <div class="notes-entry-meta"><span>19 min read</span><span aria-hidden="true">·</span><a href="#main-content">2025</a></div>
        </article>
      </div>
    </section>
    <section class="notes-collection" aria-labelledby="all-notes-title">
      <div class="notes-section-heading">
        <h2 id="all-notes-title">All notes</h2>
        <p>Derivations, paper readings, and observations in reverse chronological order.</p>
      </div>
      <ol class="notes-index-list">
        <li>
          <article class="notes-index-entry">
            <time datetime="2025-10-02T12:00:00+00:00">02 Oct 2025</time>
            <div class="notes-entry-copy">
              <h3><a href="#main-content">Paper Reading — Compressive Rendering Sensing</a></h3>
              <p class="notes-entry-summary">A rendering-oriented walk through sparse reconstruction.</p>
              <div class="notes-entry-meta"><span>12 min read</span></div>
              <div class="notes-entry-topics" aria-label="Note topics"><a href="#main-content">2025</a><a href="#main-content">#rendering</a></div>
            </div>
          </article>
        </li>
        <li>
          <article class="notes-index-entry">
            <time datetime="2025-08-17T12:00:00+00:00">17 Aug 2025</time>
            <div class="notes-entry-copy">
              <h3><a href="#main-content">Compressive Light Transport Sensing</a></h3>
              <p class="notes-entry-summary">Notes on the sensing matrix, sparsity, and transport recovery.</p>
              <div class="notes-entry-meta"><span>9 min read</span></div>
              <div class="notes-entry-topics" aria-label="Note topics"><a href="#main-content">2025</a><a href="#main-content">#paper</a></div>
            </div>
          </article>
        </li>
      </ol>
    </section>
    <nav aria-label="Blog pages"><ul class="pagination"><li class="page-item active"><a class="page-link" href="#main-content" aria-current="page">1</a></li><li class="page-item"><a class="page-link" href="#main-content">2</a></li></ul></nav>
  </div>`;
}

/**
 * Create a representative ordinary Kramdown post after Liquid rendering.
 *
 * @returns {string} Production-shaped standard article markup with breadcrumb,
 *   metadata, Markdown content, a deliberately wide MathJax node, and a wide
 *   technical table used to verify local scrolling.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * const markup = _build_standard_article_markup();
 */
function _build_standard_article_markup() {
  // Preserve the exact key wrappers and IDs emitted by `_layouts/post.liquid`.
  return `<div class="post contemplative-notes notes-article notes-standard-article">
    <header class="post-header">
      <nav class="notes-breadcrumb" aria-label="Breadcrumb"><a href="#main-content">Notes</a><span aria-hidden="true">/</span><span>2025</span></nav>
      <h1 class="post-title">Paper Reading — Compressive Rendering Sensing</h1>
      <p class="post-meta">Created in October 02, 2025</p>
      <p class="post-tags"><a href="#main-content">2025</a><span aria-hidden="true">·</span><a href="#main-content">#rendering</a></p>
    </header>
    <article class="post-content">
      <div id="markdown-content">
        <p>A conventional renderer evaluates every pixel before a later compression stage discards much of that information. These notes preserve the existing Markdown and equation rendering path while presenting it within the contemplative shell.</p>
        <h2>Building the linear relationship</h2>
        <p>The measurement process is expressed as a sparse linear system. The following intentionally wide rendered formula must scroll inside the reading column rather than widen the document.</p>
        <mjx-container class="MathJax" jax="CHTML" display="true" data-test-wide-formula><span class="render-fixture-wide-content">y = S Fᴴ G⁻¹ F Ψ⁻¹ x̂ᵦ + λ‖x̂ᵦ‖₁, with all transport operators and reconstruction constraints retained across the complete derivation.</span></mjx-container>
        <h2>Symbols</h2>
        <table data-test-wide-table>
          <thead><tr><th>Symbol</th><th>Measurement operator</th><th>Transform basis</th><th>Inverse filter</th><th>Regularizer</th><th>Domain</th></tr></thead>
          <tbody><tr><td>x̂ᵦ</td><td>S with sparse pixel observations</td><td>Ψ inverse wavelet transform</td><td>Fᴴ G⁻¹ F Wiener approximation</td><td>λ positive stability coefficient</td><td>full-resolution light transport image</td></tr></tbody>
        </table>
        <blockquote>The content renderer remains authoritative; the new CSS only changes presentation.</blockquote>
        <pre><code>const measurement = sampling * inverse_filter * inverse_wavelet;</code></pre>
      </div>
    </article>
    <section class="notes-related" aria-labelledby="related-notes-title"><h2 id="related-notes-title">Related notes</h2><a href="#main-content">Compressive Light Transport Sensing</a></section>
  </div>`;
}

/**
 * Create a representative Distill article using its production custom elements.
 *
 * @returns {string} Complete `#main-content` fragment with Distill title,
 *   byline, contents, article, appendix, citations, bibliography, and wide
 *   formula/table nodes for responsive overflow assertions.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * const markup = _build_distill_article_markup();
 */
function _build_distill_article_markup() {
  // Mirror `_layouts/distill.liquid` without executing its vendor transforms.
  return `<div id="main-content" class="post distill contemplative-notes notes-article notes-distill-article" role="main">
    <d-title><h1>NDF and Microfacet Model</h1><p>A geometric derivation of normal distributions and the general microfacet formulation.</p></d-title>
    <d-byline><span>By Youyang Du</span><span>11 Nov 2025</span></d-byline>
    <d-article>
      <d-contents><nav class="l-text figcaption"><h3>Contents</h3><div><a href="#preliminary">Preliminary</a></div><div><a href="#normal-distribution">Normal Distribution Function</a></div></nav></d-contents>
      <h2 id="preliminary">Preliminary</h2>
      <p>The pixel footprint aggregates complex microsurface geometry into one observable radiance value. Distill's semantic topology and bibliography hooks remain intact underneath the new visual surface.</p>
      <h2 id="normal-distribution">Normal Distribution Function</h2>
      <div class="katex-display" data-test-wide-formula><span class="render-fixture-wide-content">D(ω) = ∫𝓜 δω(ωₘ(pₘ)) dpₘ, subject to ∫Ω D(ω)⟨ω,ωg⟩ dω = Ag and the complete projected-area normalization constraint.</span></div>
      <table data-test-wide-table>
        <thead><tr><th>Symbol</th><th>Microsurface meaning</th><th>Geometric meaning</th><th>Measure</th><th>Normalization condition</th><th>Rendering use</th></tr></thead>
        <tbody><tr><td>D(ω)</td><td>area density of normals in a differential solid angle</td><td>projected footprint statistics</td><td>square metres per steradian</td><td>projected integral equals geometric area</td><td>microfacet BRDF evaluation</td></tr></tbody>
      </table>
      <p>A citation remains represented by Distill's native element <d-cite key="walter2007microfacet">[1]</d-cite>.</p>
    </d-article>
    <d-appendix><d-footnote-list></d-footnote-list><d-citation-list></d-citation-list></d-appendix>
    <d-bibliography src="/assets/bibliography/ndf_microfacet.bib"></d-bibliography>
  </div>`;
}

/**
 * Write all static render fixtures beneath the requested artifact directory.
 *
 * @param {string} artifact_root - Absolute or cwd-relative writable artifact
 *   directory. It is created recursively when absent; existing unrelated
 *   artifacts are preserved.
 * @returns {{fixtureDirectory: string, fixtureFiles: Map<string, string>}}
 *   Absolute fixture directory and route-name-to-filename mapping.
 * @throws {Error} If directories or fixture HTML files cannot be written.
 * @example
 * const fixtures = _write_render_fixtures("test-artifacts");
 * @sideEffects Creates or overwrites three HTML render fixtures only beneath
 *   `formal-notes-fixtures` in the supplied artifact root.
 */
function _write_render_fixtures(artifact_root) {
  // Keep generated HTML clearly separated from screenshots and production files.
  const fixture_directory = path.resolve(artifact_root, "formal-notes-fixtures");
  fs.mkdirSync(fixture_directory, { recursive: true });
  const fixture_documents = new Map([
    ["index", _build_fixture_document("Notes", _build_notes_index_markup(), false)],
    ["standard", _build_fixture_document("Ordinary Note", _build_standard_article_markup(), false)],
    ["distill", _build_fixture_document("Distill Note", _build_distill_article_markup(), true)],
  ]);
  const fixture_files = new Map();

  // Materialize deterministic fixtures for browser loading and later inspection.
  for (const [fixture_name, fixture_document] of fixture_documents) {
    const fixture_filename = `${fixture_name}.html`;
    fs.writeFileSync(path.join(fixture_directory, fixture_filename), fixture_document, "utf8");
    fixture_files.set(fixture_name, fixture_filename);
  }
  return { fixtureDirectory: fixture_directory, fixtureFiles: fixture_files };
}

/**
 * Attach browser console, page-error, and failed-response capture to one page.
 *
 * @param {import("playwright").Page} page - Open Playwright page that will load
 *   exactly one render fixture.
 * @param {string[]} browser_errors - Mutable error accumulator shared by the
 *   complete smoke run. Empty arrays are valid.
 * @param {string} label - Non-empty fixture and viewport label prefixed to all
 *   recorded messages.
 * @returns {void} No value is returned.
 * @throws {Error} If listener registration is attempted on a closed page.
 * @example
 * _configure_error_capture(page, errors, "index-mobile");
 * @sideEffects Registers persistent Playwright event listeners and appends to
 *   `browser_errors` if the page emits an error or HTTP failure.
 */
function _configure_error_capture(page, browser_errors, label) {
  // Capture runtime exceptions and explicit error-level console diagnostics.
  page.on("pageerror", (page_error) => {
    browser_errors.push(`${label} pageerror: ${page_error.message || String(page_error)}`);
  });
  page.on("console", (console_message) => {
    if (console_message.type() === "error") {
      browser_errors.push(`${label} console: ${console_message.text()}`);
    }
  });

  // Treat missing fixture assets as failures even when the browser stays quiet.
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browser_errors.push(`${label} response ${response.status()}: ${response.url()}`);
    }
  });
}

/**
 * Assert that a fixture document fits within its current layout viewport.
 *
 * @param {import("playwright").Page} page - Loaded fixture page at a fixed
 *   viewport. The page must still be open.
 * @param {string} label - Non-empty fixture/viewport label used in failures.
 * @returns {Promise<{viewportWidth: number, documentWidth: number}>} Measured
 *   CSS-pixel widths for evidence output.
 * @throws {AssertionError} If the document exceeds the viewport by more than
 *   one rounding pixel.
 * @example
 * await _assert_no_horizontal_overflow(page, "standard-mobile");
 * @sideEffects Executes read-only JavaScript in the fixture page.
 */
async function _assert_no_horizontal_overflow(page, label) {
  // Compare the widest document box against the active layout viewport.
  const width_state = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  assert(
    width_state.documentWidth <= width_state.viewportWidth + 1,
    `${label}: horizontal overflow ${JSON.stringify(width_state)}`,
  );
  return width_state;
}

/**
 * Assert that production-sized navigation controls remain at least 44px square.
 *
 * @param {import("playwright").Page} page - Loaded fixture page containing the
 *   formal Notes site mark and navigation links.
 * @param {string} label - Non-empty fixture/viewport label used in failures.
 * @returns {Promise<Array<{label: string, width: number, height: number}>>}
 *   Measured target boxes for the evidence report.
 * @throws {AssertionError} If any target dimension is less than 44 CSS pixels.
 * @example
 * const targets = await _assert_minimum_targets(page, "index-mobile");
 * @sideEffects Executes read-only DOM measurement in the fixture page.
 */
async function _assert_minimum_targets(page, label) {
  // Measure the same controls protected by the CSS source contract.
  const target_states = await page.locator(".notes-site-mark, .notes-site-nav a").evaluateAll((targets) => (
    targets.map((target) => {
      const bounds = target.getBoundingClientRect();
      return {
        label: target.textContent.trim(),
        width: bounds.width,
        height: bounds.height,
      };
    })
  ));

  // Enforce the WCAG-oriented 44px physical CSS target in both dimensions.
  for (const target_state of target_states) {
    assert(target_state.width >= 44, `${label}: narrow target ${JSON.stringify(target_state)}`);
    assert(target_state.height >= 44, `${label}: short target ${JSON.stringify(target_state)}`);
  }
  return target_states;
}

/**
 * Require each Notes renderer to use and fetch the local Libertinus family.
 *
 * @param {import("playwright").Page} page - Loaded fixture page whose Notes CSS
 *   and local font assets are served from the current generated site.
 * @param {string} label - Non-empty fixture/viewport label used in failures.
 * @param {string} content_selector - Selector for visible English prose whose
 *   computed family must begin with Libertinus Sans.
 * @returns {Promise<{fontFamily: string, loadCounts: number[], resources: string[]}>}
 *   Computed stack, matched FontFace counts, and local font request paths.
 * @throws {AssertionError} If priority, CJK fallbacks, variants, or requests fail.
 * @example
 * const state = await _assert_notes_font(page, "standard-mobile", "#markdown-content p");
 * @sideEffects Loads regular, bold, and italic local faces through FontFaceSet.
 */
async function _assert_notes_font(page, label, content_selector) {
  // Force all three authored variants so an unused broken file cannot pass silently.
  const font_state = await page.evaluate(async (selector) => {
    const load_results = await Promise.all([
      document.fonts.load('400 16px "Libertinus Sans"', "Regular typography probe"),
      document.fonts.load('700 16px "Libertinus Sans"', "Bold typography probe"),
      document.fonts.load('italic 400 16px "Libertinus Sans"', "Italic typography probe"),
    ]);
    await document.fonts.ready;

    // Read the declared family and exact same-origin font resources after loading.
    const content = document.querySelector(selector);
    return {
      fontFamily: getComputedStyle(content).fontFamily,
      loadCounts: load_results.map((faces) => faces.length),
      resources: performance.getEntriesByType("resource")
        .map((entry) => new URL(entry.name).pathname)
        .filter((pathname) => pathname.startsWith("/assets/fonts/")),
    };
  }, content_selector);

  // Enforce the Latin priority and retain the established CJK fallback chain.
  const first_family = font_state.fontFamily.split(",", 1)[0].trim().replace(/^['"]|['"]$/g, "");
  assert.equal(first_family, "Libertinus Sans", `${label}: ${font_state.fontFamily}`);
  assert(font_state.fontFamily.includes("Noto Sans CJK SC"), `${label}: missing Noto CJK fallback`);
  assert(font_state.fontFamily.includes("Microsoft YaHei"), `${label}: missing YaHei fallback`);
  assert.deepEqual(font_state.loadCounts, [1, 1, 1], `${label}: incomplete FontFace matches`);

  // Require every requested file while ensuring the former Onest face is unused.
  for (const required_path of [
    "/assets/fonts/libertinus-sans-regular.ttf",
    "/assets/fonts/libertinus-sans-bold.ttf",
    "/assets/fonts/libertinus-sans-italic.ttf",
  ]) {
    assert(font_state.resources.includes(required_path), `${label}: missing font request ${required_path}`);
  }
  assert(!font_state.resources.some((resource) => /onest/i.test(resource)), `${label}: Onest was requested`);
  return font_state;
}

/**
 * Activate and inspect the formal bamboo-leaf and flying-sword canvas runtime.
 *
 * @param {import("playwright").Page} page - Loaded fixture page with the formal
 *   classic effects script evaluated in the main world.
 * @param {string} label - Non-empty fixture/viewport label used in failures.
 * @param {boolean} require_complete_wheel - When `true`, wait for all sixteen
 *   ordered swords to form an orbit; when `false`, only require active motion
 *   while still checking sixteen persistent entities and six trail identities.
 * @returns {Promise<object>} Serializable canvas dimensions, active mode, sword
 *   counts, visible count, path count, and CSS opacity.
 * @throws {AssertionError|Error} If canvas initialization, pointer activation,
 *   16/6 identity state, or optional complete wheel formation fails.
 * @example
 * const state = await _assert_effect_active(page, "distill-desktop", true);
 * @sideEffects Moves the real browser pointer and waits for animation frames.
 */
async function _assert_effect_active(page, label, require_complete_wheel) {
  // Wait for the deferred formal script to size its full-viewport bitmap.
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#light-field");
    return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
  });

  // Move through open viewport space so velocity and leaf spawning become active.
  const viewport_size = page.viewportSize();
  const pointer_start = { x: Math.min(90, viewport_size.width * 0.22), y: 150 };
  const pointer_end = {
    x: Math.max(120, Math.min(viewport_size.width - 70, viewport_size.width * 0.68)),
    y: Math.min(viewport_size.height - 110, viewport_size.height * 0.46),
  };
  await page.mouse.move(pointer_start.x, pointer_start.y);
  await page.mouse.move(pointer_end.x, pointer_end.y, { steps: 14 });
  await page.waitForTimeout(240);

  // Optionally let the authored one-by-one sequence reach its complete 16-sword wheel.
  if (require_complete_wheel) {
    await page.waitForFunction(
      () => sword_mode === "orbiting"
        && sword_entities.filter((sword_entity) => sword_entity.opacity > 0.12).length === 16,
      undefined,
      { timeout: 7_000 },
    );
  }

  // Read the global lexical state in one classic-script evaluation for coherence.
  const effect_state = await page.evaluate(`(() => {
    const canvas = document.querySelector("#light-field");
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasOpacity: Number(getComputedStyle(canvas).opacity),
      mode: sword_mode,
      swordCount: sword_entities.length,
      trailCount: sword_trail_entity_indices.length,
      visibleSwordCount: sword_entities.filter((sword_entity) => sword_entity.opacity > 0.12).length,
      leafCount: bamboo_leaves.length,
      animationFrameActive: light_field_animation_frame !== 0,
    };
  })()`);

  // Prove every formal route runs the approved 16-wheel/6-trail engine.
  assert(effect_state.canvasWidth > 0 && effect_state.canvasHeight > 0, `${label}: empty canvas`);
  assert(effect_state.canvasOpacity > 0, `${label}: invisible canvas`);
  assert.notEqual(effect_state.mode, "dormant", `${label}: pointer did not activate sword state`);
  assert.equal(effect_state.swordCount, 16, `${label}: persistent sword count`);
  assert.equal(effect_state.trailCount, 6, `${label}: trail identity count`);
  assert(effect_state.animationFrameActive, `${label}: canvas renderer is not active`);
  if (require_complete_wheel) {
    assert.equal(effect_state.mode, "orbiting", `${label}: wheel did not complete`);
    assert.equal(effect_state.visibleSwordCount, 16, `${label}: not all wheel swords are visible`);
  }
  return effect_state;
}

/**
 * Assert that a deliberately wide technical element scrolls locally.
 *
 * @param {import("playwright").Page} page - Loaded standard or Distill article
 *   fixture containing the requested technical element.
 * @param {string} selector - Non-empty CSS selector resolving exactly one wide
 *   formula or table container.
 * @param {string} label - Non-empty context label used in assertion failures.
 * @returns {Promise<{clientWidth: number, scrollWidth: number, overflowX: string}>}
 *   Computed local scrolling state.
 * @throws {AssertionError} If the element is missing, not wider internally than
 *   its viewport, or does not compute to horizontal auto/scroll overflow.
 * @example
 * await _assert_local_horizontal_scroll(page, "[data-test-wide-table]", "table");
 * @sideEffects Executes read-only DOM and computed-style inspection.
 */
async function _assert_local_horizontal_scroll(page, selector, label) {
  // Read the scroll box after fonts and layout have settled.
  const scroll_state = await page.locator(selector).evaluate((scroll_container) => ({
    clientWidth: scroll_container.clientWidth,
    scrollWidth: scroll_container.scrollWidth,
    overflowX: getComputedStyle(scroll_container).overflowX,
  }));

  // Require genuine local overflow rather than a merely declared unused rule.
  assert(scroll_state.scrollWidth > scroll_state.clientWidth + 20, `${label}: fixture is not genuinely wide`);
  assert(["auto", "scroll"].includes(scroll_state.overflowX), `${label}: local overflow is ${scroll_state.overflowX}`);
  return scroll_state;
}

/**
 * Exercise one render fixture at one viewport and capture visual evidence.
 *
 * @param {import("playwright").Browser} browser - Open Chromium browser shared
 *   by the smoke run.
 * @param {object} fixture_case - Immutable route case with `name`, `filename`,
 *   `contentSelector`, `fontSelector`, and boolean `technicalContent` members.
 * @param {object} viewport_case - Immutable viewport case with `name`, positive
 *   integer `width`, and positive integer `height` members.
 * @param {string} fixture_url - Absolute HTTP URL to the generated fixture.
 * @param {string} artifact_root - Writable screenshot output directory.
 * @param {string[]} browser_errors - Shared mutable browser-error accumulator.
 * @param {boolean} require_complete_wheel - Whether this case must reach the
 *   complete sixteen-sword orbit before capture.
 * @returns {Promise<object>} Evidence containing widths, targets, effect state,
 *   optional technical scroll boxes, and screenshot path.
 * @throws {Error|AssertionError} If navigation, structure, responsive layout,
 *   accessibility targets, effects, local scrolling, or screenshot capture fail.
 * @example
 * const evidence = await _exercise_fixture(browser, route, viewport, url, root, errors, false);
 * @sideEffects Opens and closes one browser context, moves its pointer, and
 *   writes one full-page PNG screenshot.
 */
async function _exercise_fixture(
  browser,
  fixture_case,
  viewport_case,
  fixture_url,
  artifact_root,
  browser_errors,
  require_complete_wheel,
) {
  // Isolate media, viewport, and console state for this exact evidence case.
  const browser_context = await browser.newContext({
    viewport: { width: viewport_case.width, height: viewport_case.height },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const page = await browser_context.newPage();
  const label = `${fixture_case.name}-${viewport_case.name}`;
  _configure_error_capture(page, browser_errors, label);

  try {
    // Load the static fixture and prove its production-shaped landmark exists.
    await page.goto(fixture_url, { waitUntil: "load" });
    await page.locator(fixture_case.contentSelector).waitFor({ state: "visible" });
    assert.equal(await page.locator("#light-field").count(), 1, `${label}: duplicate/missing canvas`);
    assert.equal(await page.locator("#sword-asset").count(), 1, `${label}: duplicate/missing sword asset`);
    assert.equal(await page.locator("script[src='/assets/js/contemplative-effects.js']").count(), 1, `${label}: wrong formal script`);
    assert.equal(await page.locator(".notes-site-nav a").count(), 6, `${label}: navigation must contain six items`);
    assert.equal(await page.locator(".notes-site-nav a[href='/news/']").count(), 1, `${label}: News link missing`);
    assert.equal(await page.locator(".notes-site-nav a[aria-current='page']").count(), 1, `${label}: invalid current-link count`);
    assert.equal(
      await page.locator(".notes-site-nav a[aria-current='page']").getAttribute("href"),
      "/blog/",
      `${label}: Notes must remain current on every Notes renderer`,
    );

    // Measure the formal CSS variables and responsive interaction contract.
    const reading_width_token = await page.evaluate(() => (
      getComputedStyle(document.body).getPropertyValue("--notes-reading-width").trim()
    ));
    assert.equal(reading_width_token, "68ch", `${label}: reading-width token changed`);
    const width_state = await _assert_no_horizontal_overflow(page, label);
    const target_states = await _assert_minimum_targets(page, label);
    const font_state = await _assert_notes_font(page, label, fixture_case.fontSelector);
    const effect_state = await _assert_effect_active(page, label, require_complete_wheel);

    // Exercise formula and table overflow only on article fixtures that own them.
    const technical_state = {};
    if (fixture_case.technicalContent) {
      technical_state.formula = await _assert_local_horizontal_scroll(
        page,
        "[data-test-wide-formula]",
        `${label} wide formula`,
      );
      technical_state.table = await _assert_local_horizontal_scroll(
        page,
        "[data-test-wide-table]",
        `${label} wide table`,
      );
      await _assert_no_horizontal_overflow(page, `${label} after technical scroll measurement`);
    }

    // Capture the complete page after the canvas has visibly activated.
    const screenshot_path = path.resolve(
      artifact_root,
      `formal-notes-${fixture_case.name}-${viewport_case.name}.png`,
    );
    await page.screenshot({ path: screenshot_path, fullPage: true });
    return {
      readingWidthToken: reading_width_token,
      widthState: width_state,
      targetStates: target_states,
      fontState: font_state,
      effectState: effect_state,
      technicalState: technical_state,
      screenshotPath: screenshot_path,
    };
  } finally {
    // Always release page resources so assertion failures do not leak Chromium.
    await browser_context.close();
  }
}

/**
 * Run desktop and mobile browser smoke checks over three production-shaped fixtures.
 *
 * @returns {Promise<void>} Resolves after all six responsive cases, one complete
 *   sixteen-sword wheel, screenshots, and browser-error assertions pass.
 * @throws {Error|AssertionError} If fixture generation, browser launch, layout,
 *   runtime effects, technical overflow, or error capture fails.
 * @example
 * await _main();
 * @sideEffects Generates three clearly labelled static HTML fixtures and six
 *   PNG screenshots in `test-artifacts`, launches headless Chrome, moves the
 *   pointer, and writes a JSON evidence report. It never invokes Ruby/Jekyll.
 */
async function _main() {
  // Resolve inputs and generate explicitly non-production render fixtures.
  const arguments_map = _parse_arguments(process.argv.slice(2));
  const artifact_root = path.resolve(arguments_map.artifacts);
  fs.mkdirSync(artifact_root, { recursive: true });
  const fixture_output = _write_render_fixtures(artifact_root);
  const fixture_url_prefix = (
    "/design-prototypes/contemplative-light/test-artifacts/formal-notes-fixtures"
  );
  const fixture_cases = [
    {
      name: "index",
      filename: fixture_output.fixtureFiles.get("index"),
      contentSelector: ".notes-index",
      fontSelector: ".notes-index-description",
      technicalContent: false,
    },
    {
      name: "standard",
      filename: fixture_output.fixtureFiles.get("standard"),
      contentSelector: ".notes-standard-article",
      fontSelector: ".notes-standard-article #markdown-content p",
      technicalContent: true,
    },
    {
      name: "distill",
      filename: fixture_output.fixtureFiles.get("distill"),
      contentSelector: ".notes-distill-article",
      fontSelector: ".notes-distill-article d-article p",
      technicalContent: true,
    },
  ];
  const viewport_cases = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const browser_errors = [];
  const evidence = {};

  // Launch the user-provided Chrome binary through the bundled Playwright runtime.
  const browser = await chromium.launch({
    executablePath: path.resolve(arguments_map.chrome),
    headless: true,
  });
  try {
    /*
     * Cover index, ordinary post, and Distill post at both required viewports.
     * The Distill desktop case waits for the authored one-by-one sequence so a
     * real complete sixteen-sword wheel is proven and captured at runtime.
     */
    for (const fixture_case of fixture_cases) {
      for (const viewport_case of viewport_cases) {
        const fixture_url = `${arguments_map.urlRoot}${fixture_url_prefix}/${fixture_case.filename}`;
        const evidence_key = `${fixture_case.name}-${viewport_case.name}`;
        const require_complete_wheel = evidence_key === "distill-desktop";
        evidence[evidence_key] = await _exercise_fixture(
          browser,
          fixture_case,
          viewport_case,
          fixture_url,
          artifact_root,
          browser_errors,
          require_complete_wheel,
        );
      }
    }
  } finally {
    // Close Chromium even when a route assertion fails.
    await browser.close();
  }

  // Treat every console, page, or failed-resource error as a migration failure.
  assert.deepEqual(browser_errors, [], `browser errors: ${browser_errors.join("; ")}`);

  // Report evidence while explicitly distinguishing fixtures from a Jekyll build.
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    renderFixture: true,
    productionJekyllBuild: false,
    note: "Static render fixtures exercise current formal CSS and production-shaped article DOM; Ruby/Jekyll was not invoked.",
    fixtureDirectory: fixture_output.fixtureDirectory,
    cases: evidence,
    browserErrors: browser_errors,
  }, null, 2)}\n`);
}

_main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
