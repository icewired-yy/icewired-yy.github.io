"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

/**
 * Parse explicit prototype-test inputs from the command line.
 *
 * @param {string[]} command_arguments - Argument tokens after the Node
 *   executable and script path. Accepted flags are `--url`, `--index`,
 *   `--chrome`, and `--artifacts`; every flag requires a non-empty value.
 * @returns {{url: string, index: string, chrome: string, artifacts: string}}
 *   Validated raw values for the test runner.
 * @throws {Error} If a required flag is absent or has no following value.
 * @example
 * const options = _parse_arguments(process.argv.slice(2));
 */
function _parse_arguments(command_arguments) {
  // Collect flag-value pairs without guessing any machine-specific paths.
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

  // Require every environment-dependent input before launching a browser.
  for (const required_name of ["url", "index", "chrome", "artifacts"]) {
    if (!parsed_arguments[required_name]) {
      throw new Error(`Missing required --${required_name} argument.`);
    }
  }
  return parsed_arguments;
}

/**
 * Record one error-level browser console message.
 *
 * @param {string[]} errors - Mutable error accumulator owned by the test run.
 *   It must be an array; empty arrays are valid.
 * @param {import("playwright").ConsoleMessage} message - Console message
 *   emitted by the active page.
 * @returns {void} No value is returned.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * page.on("console", _record_console_message.bind(null, errors));
 * @sideEffects Appends one string to `errors` for error-level messages.
 */
function _record_console_message(errors, message) {
  // Keep the report focused on errors that can break the static prototype.
  if (message.type() === "error") {
    errors.push(`console: ${message.text()}`);
  }
}

/**
 * Record one uncaught page error.
 *
 * @param {string[]} errors - Mutable error accumulator owned by the test run.
 * @param {Error} page_error - Uncaught browser-side error supplied by
 *   Playwright.
 * @returns {void} No value is returned.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * page.on("pageerror", _record_page_error.bind(null, errors));
 * @sideEffects Appends a formatted error to `errors`.
 */
function _record_page_error(errors, page_error) {
  // Preserve the original error text so regressions remain actionable.
  errors.push(`pageerror: ${page_error.message || String(page_error)}`);
}

/**
 * Attach console and uncaught-error capture to one page.
 *
 * @param {import("playwright").Page} page - Newly created Playwright page.
 * @param {string[]} errors - Shared mutable error accumulator.
 * @returns {void} No value is returned.
 * @throws {Error} If Playwright rejects listener registration on a closed page.
 * @example
 * _configure_error_capture(page, browser_errors);
 * @sideEffects Registers two persistent event listeners on `page`.
 */
function _configure_error_capture(page, errors) {
  // Bind the shared accumulator while leaving Playwright's message argument open.
  page.on("console", _record_console_message.bind(null, errors));
  page.on("pageerror", _record_page_error.bind(null, errors));
}

/**
 * Trigger lazy images and assert that every image resolves.
 *
 * @param {import("playwright").Page} page - Loaded page whose images should be
 *   checked. The page must remain open throughout the asynchronous operation.
 * @param {string} label - Non-empty context label for assertion messages.
 * @returns {Promise<number>} Number of inspected image elements; zero is valid
 *   for text-only pages.
 * @throws {AssertionError} If any image is incomplete or has zero natural width.
 * @example
 * const count = await _assert_images_loaded(page, "home-desktop");
 * @sideEffects Scrolls images into view and executes read-only page JavaScript.
 */
async function _assert_images_loaded(page, label) {
  // Trigger native lazy loading before inspecting intrinsic dimensions.
  const image_locator = page.locator("img");
  const image_count = await image_locator.count();
  for (let image_index = 0; image_index < image_count; image_index += 1) {
    await image_locator.nth(image_index).scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(
    () => [...document.images].every((image) => image.complete),
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(80);

  // Collect only failing source values to keep failures concise.
  const image_state = await page.evaluate(() => ({
    count: document.images.length,
    failed: [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute("src") || "<missing src>"),
  }));
  assert.deepEqual(image_state.failed, [], `${label}: failed images ${image_state.failed}`);
  return image_state.count;
}

/**
 * Assert that the document does not exceed its layout viewport width.
 *
 * @param {import("playwright").Page} page - Loaded page at the viewport under
 *   test.
 * @param {string} label - Non-empty context label for assertion messages.
 * @returns {Promise<{viewport_width: number, document_width: number}>}
 *   Measured widths in CSS pixels.
 * @throws {AssertionError} If layout exceeds the viewport by more than one
 *   rounding pixel.
 * @example
 * const widths = await _assert_no_horizontal_overflow(page, "gallery-mobile");
 * @sideEffects Executes read-only browser JavaScript.
 */
async function _assert_no_horizontal_overflow(page, label) {
  // Compare the widest document box with the current layout viewport.
  const metrics = await page.evaluate(() => ({
    viewport_width: window.innerWidth,
    document_width: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  assert(
    metrics.document_width <= metrics.viewport_width + 1,
    `${label}: horizontal overflow ${JSON.stringify(metrics)}`,
  );
  return metrics;
}

/**
 * Assert that one active page owns the shared ambient-effect DOM contract.
 *
 * @param {import("playwright").Page} page - Loaded active prototype page. Its
 *   deferred script must have completed initialization before the timeout.
 * @param {string} label - Non-empty route and viewport label used in failures.
 * @returns {Promise<{canvas_width: number, canvas_height: number}>} Initialized
 *   canvas bitmap dimensions in device pixels.
 * @throws {AssertionError} If the canvas, sword asset, deferred script, or
 *   accessibility attributes are missing or duplicated.
 * @example
 * const effect = await _assert_effect_contract(page, "notes-mobile-http");
 * @sideEffects Waits for the page's deferred effect initializer and executes
 *   read-only browser JavaScript.
 */
async function _assert_effect_contract(page, label) {
  // Wait for the shared script to allocate a non-empty viewport canvas.
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#light-field");
    return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
  });

  // Read the complete structural and accessibility contract in one browser pass.
  const effect_state = await page.evaluate(() => {
    const canvases = document.querySelectorAll("#light-field");
    const sword_assets = document.querySelectorAll("#sword-asset");
    const scripts = document.querySelectorAll("script[src='script.js']");
    const canvas = canvases[0];
    const sword_asset = sword_assets[0];
    const script = scripts[0];
    return {
      canvas_count: canvases.length,
      sword_asset_count: sword_assets.length,
      script_count: scripts.length,
      canvas_aria_hidden: canvas?.getAttribute("aria-hidden") || "",
      sword_aria_hidden: sword_asset?.getAttribute("aria-hidden") || "",
      sword_alt: sword_asset?.getAttribute("alt"),
      script_deferred: script?.hasAttribute("defer") || false,
      canvas_width: canvas?.width || 0,
      canvas_height: canvas?.height || 0,
    };
  });

  // Enforce one reusable, decorative, non-blocking effect instance per page.
  assert.equal(effect_state.canvas_count, 1, `${label}: expected one light-field canvas`);
  assert.equal(effect_state.sword_asset_count, 1, `${label}: expected one sword asset`);
  assert.equal(effect_state.script_count, 1, `${label}: expected one effect script`);
  assert.equal(effect_state.canvas_aria_hidden, "true", `${label}: canvas must be decorative`);
  assert.equal(effect_state.sword_aria_hidden, "true", `${label}: sword asset must be decorative`);
  assert.equal(effect_state.sword_alt, "", `${label}: decorative sword alt must be empty`);
  assert.equal(effect_state.script_deferred, true, `${label}: effect script must be deferred`);
  return {
    canvas_width: effect_state.canvas_width,
    canvas_height: effect_state.canvas_height,
  };
}

/**
 * Assert that News is absent and every local hash link resolves on an active page.
 *
 * @param {import("playwright").Page} page - Loaded homepage or active subpage.
 * @param {string} label - Non-empty route and viewport label used in failures.
 * @returns {Promise<{hash_link_count: number, scroll_target: string|null}>}
 *   Hash-link diagnostics; `scroll_target` is `null` on collection pages.
 * @throws {AssertionError} If a News section/link remains, a hash target is
 *   missing, or the homepage invitation does not lead to Research.
 * @example
 * await _assert_news_hidden(page, "home-desktop-http");
 * @sideEffects Executes read-only browser JavaScript.
 */
async function _assert_news_hidden(page, label) {
  // Collect News surfaces and validate every same-document anchor by ID.
  const news_state = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a[href]")];
    const news_links = anchors.filter((anchor) => {
      const href = anchor.getAttribute("href") || "";
      return href === "#news" || href === "news.html" || href.endsWith("/news.html");
    });
    const hash_links = anchors.filter((anchor) => (anchor.getAttribute("href") || "").startsWith("#"));
    const missing_hash_targets = hash_links
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href) => href && href !== "#")
      .filter((href) => !document.getElementById(decodeURIComponent(href.slice(1))));
    return {
      news_section_count: document.querySelectorAll("#news").length,
      news_link_count: news_links.length,
      hash_link_count: hash_links.length,
      missing_hash_targets,
      scroll_target: document.querySelector(".scroll-invitation")?.getAttribute("href") || null,
    };
  });

  // Require a clean active information architecture with no dormant News entry.
  assert.equal(news_state.news_section_count, 0, `${label}: News section must be absent`);
  assert.equal(news_state.news_link_count, 0, `${label}: News links must be absent`);
  assert.deepEqual(news_state.missing_hash_targets, [], `${label}: broken hash links`);
  if (news_state.scroll_target !== null) {
    assert.equal(news_state.scroll_target, "#research", `${label}: invitation must lead to Research`);
  }
  return {
    hash_link_count: news_state.hash_link_count,
    scroll_target: news_state.scroll_target,
  };
}

/**
 * Assert that semantic headings own visible, deep-green decorative glyphs.
 *
 * @param {import("playwright").Page} page - Loaded page with computed styles.
 * @param {string[]} selectors - Non-empty selectors for headings whose
 *   `::before` pseudo-elements should render calligraphy.
 * @param {string} label - Non-empty context label for assertion messages.
 * @returns {Promise<object[]>} Computed glyph style snapshots.
 * @throws {AssertionError} If a heading, image, ink token, filter, or quiet
 *   opacity is missing.
 * @example
 * await _assert_calligraphy_headings(page, [".section-title-notes"], "home");
 * @sideEffects Executes read-only browser JavaScript.
 */
async function _assert_calligraphy_headings(page, selectors, label) {
  // Read pseudo-element styles without relying only on visual screenshots.
  const heading_states = await page.evaluate((heading_selectors) => (
    heading_selectors.map((selector) => {
      const heading = document.querySelector(selector);
      if (!heading) {
        return { selector, missing: true };
      }
      const style = getComputedStyle(heading, "::before");
      return {
        selector,
        missing: false,
        image: style.backgroundImage,
        ink: style.getPropertyValue("--glyph-ink").trim(),
        filter: style.filter,
        opacity: Number(style.opacity),
      };
    })
  ), selectors);

  // Enforce the file-compatible image and approved quiet recoloring contract.
  for (const heading_state of heading_states) {
    assert.equal(heading_state.missing, false, `${label}: missing ${heading_state.selector}`);
    assert.notEqual(heading_state.image, "none", `${label}: missing glyph image`);
    assert.equal(heading_state.ink.toLowerCase(), "#173d31", `${label}: wrong glyph ink`);
    assert.notEqual(heading_state.filter, "none", `${label}: missing glyph recoloring`);
    assert(
      heading_state.opacity >= 0.1 && heading_state.opacity <= 0.24,
      `${label}: glyph opacity outside quiet range ${heading_state.opacity}`,
    );
  }
  return heading_states;
}

/**
 * Assert that the generic centered-title modifier removes horizontal glyph offset.
 *
 * @param {import("playwright").Page} page - Loaded page whose stylesheet and
 *   local calligraphy asset are available.
 * @param {string} label - Non-empty viewport label used in assertion messages.
 * @returns {Promise<{foreground_center: number, glyph_center: number, delta: number}>}
 *   CSS-pixel centers and their absolute horizontal difference.
 * @throws {AssertionError} If the injected semantic fixture's foreground and
 *   pseudo-element centers differ by more than one CSS pixel.
 * @example
 * await _assert_centered_calligraphy(page, "home-mobile-http");
 * @sideEffects Temporarily appends one hidden heading fixture, measures it, and
 *   removes it before returning.
 */
async function _assert_centered_calligraphy(page, label) {
  // Measure the reusable modifier without making the hidden News route active.
  const alignment = await page.evaluate(() => {
    const fixture = document.createElement("h2");
    fixture.className = "section-title section-title-notes section-title-centered";
    fixture.style.cssText = "position:fixed;left:0;top:-2000px;margin:0;font-size:64px;visibility:hidden";
    const foreground = document.createElement("span");
    foreground.textContent = "Notes";
    fixture.append(foreground);
    document.body.append(fixture);

    const fixture_rect = fixture.getBoundingClientRect();
    const foreground_rect = foreground.getBoundingClientRect();
    const glyph_style = getComputedStyle(fixture, "::before");
    const glyph_width = Number.parseFloat(glyph_style.width);
    const glyph_left = Number.parseFloat(glyph_style.left);
    const transform = new DOMMatrixReadOnly(glyph_style.transform);
    const foreground_center = foreground_rect.left + foreground_rect.width / 2;
    const glyph_center = fixture_rect.left + glyph_left + transform.m41 + glyph_width / 2;
    fixture.remove();
    return {
      foreground_center,
      glyph_center,
      delta: Math.abs(foreground_center - glyph_center),
    };
  });

  // Allow one pixel for fractional font and transform rounding.
  assert(alignment.delta <= 1, `${label}: centered glyph offset ${alignment.delta}`);
  return alignment;
}

/**
 * Run desktop, mobile, reduced-motion, HTTP, and direct-file prototype checks.
 *
 * @returns {Promise<void>} Resolves after all assertions and screenshots pass.
 * @throws {Error|AssertionError} If browser launch, navigation, resources,
 *   semantics, responsive layout, calligraphy, or console checks fail.
 * @example
 * await _main();
 * @sideEffects Launches Chrome, reads local pages, and writes PNG screenshots.
 */
async function _main() {
  // Resolve caller inputs and define the complete static-page contract.
  const arguments_map = _parse_arguments(process.argv.slice(2));
  const index_path = path.resolve(arguments_map.index);
  const chrome_path = path.resolve(arguments_map.chrome);
  const artifact_path = path.resolve(arguments_map.artifacts);
  const subpages = new Map([
    ["research.html", ["Research · Youyang Du", "Research"]],
    ["projects.html", ["Projects · Youyang Du", "Projects"]],
    ["notes.html", ["Notes · Youyang Du", "Notes"]],
    ["gallery.html", ["Gallery · Youyang Du", "Gallery"]],
  ]);
  const homepage_glyph_selectors = [
    ".section-title-research",
    ".section-title-projects",
    ".section-title-notes",
    ".section-title-life",
  ];
  const subpage_content_counts = new Map([
    ["research.html", [".publication-entry", 2]],
    ["projects.html", [".project-entry", 2]],
    ["notes.html", [".language-links a", 5]],
    ["gallery.html", [".gallery-card", 12]],
  ]);
  const results = {};
  const browser_errors = [];
  require("node:fs").mkdirSync(artifact_path, { recursive: true });

  // Launch the bundled browser automation against the installed Chrome binary.
  const browser = await chromium.launch({ executablePath: chrome_path, headless: true });
  try {
    /*
     * Validate the desktop homepage and every desktop collection page.
     * Screenshots intentionally cover the hero, research, page intros, and
     * gallery body so visual review sees both shell and dense content.
     */
    const desktop_context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktop_page = await desktop_context.newPage();
    _configure_error_capture(desktop_page, browser_errors);
    await desktop_page.goto(arguments_map.url, { waitUntil: "load" });
    assert.equal(await desktop_page.title(), "Youyang Du · Homepage prototype");
    assert(await desktop_page.getByRole("heading", { name: "Youyang Du 杜悠扬" }).isVisible());
    assert.equal(await desktop_page.locator("main section").count(), 5);
    assert.equal(await desktop_page.getByRole("heading", { name: "Notes", exact: true }).count(), 1);
    for (const local_target of subpages.keys()) {
      assert.equal(await desktop_page.locator(`a[href='${local_target}']`).count(), 1);
    }
    await desktop_page.keyboard.press("Tab");
    assert(await desktop_page.evaluate(() => document.activeElement?.classList.contains("skip-link")));
    await desktop_page.evaluate(() => document.activeElement?.blur());
    results.desktop_images = await _assert_images_loaded(desktop_page, "home-desktop-http");
    results.desktop_width = await _assert_no_horizontal_overflow(desktop_page, "home-desktop-http");
    results.desktop_effect = await _assert_effect_contract(desktop_page, "home-desktop-http");
    results.desktop_news_hidden = await _assert_news_hidden(desktop_page, "home-desktop-http");
    results.homepage_glyphs = await _assert_calligraphy_headings(
      desktop_page,
      homepage_glyph_selectors,
      "home-desktop-http",
    );
    results.desktop_centered_glyph = await _assert_centered_calligraphy(
      desktop_page,
      "home-desktop-http",
    );
    assert.equal(await desktop_page.evaluate(() => (
      performance.getEntriesByType("resource")
        .some((entry) => entry.name.includes("section-gongfa.png"))
    )), false);
    await desktop_page.locator("#top").scrollIntoViewIfNeeded();
    await desktop_page.screenshot({ path: path.join(artifact_path, "desktop-hero.png") });
    await desktop_page.locator("#research").scrollIntoViewIfNeeded();
    await desktop_page.screenshot({ path: path.join(artifact_path, "desktop-research.png") });

    // Verify each static route's semantics, local resources, glyph, and width.
    results.desktop_subpages = {};
    for (const [page_name, [expected_title, expected_heading]] of subpages) {
      await desktop_page.goto(new URL(page_name, arguments_map.url).href, { waitUntil: "load" });
      assert.equal(await desktop_page.title(), expected_title);
      assert(await desktop_page.getByRole("heading", { name: expected_heading, exact: true }).isVisible());
      assert.equal(await desktop_page.locator("nav [aria-current='page']").count(), 1);
      const [content_selector, expected_content_count] = subpage_content_counts.get(page_name);
      assert.equal(
        await desktop_page.locator(content_selector).count(),
        expected_content_count,
        `${page_name}: unexpected content count for ${content_selector}`,
      );
      results.desktop_subpages[page_name] = {
        images: await _assert_images_loaded(desktop_page, `${page_name}-desktop-http`),
        width: await _assert_no_horizontal_overflow(desktop_page, `${page_name}-desktop-http`),
        effect: await _assert_effect_contract(desktop_page, `${page_name}-desktop-http`),
        news_hidden: await _assert_news_hidden(desktop_page, `${page_name}-desktop-http`),
        glyphs: await _assert_calligraphy_headings(
          desktop_page,
          [".page-title"],
          `${page_name}-desktop-http`,
        ),
      };
      await desktop_page.locator(".page-intro").scrollIntoViewIfNeeded();
      await desktop_page.screenshot({
        path: path.join(artifact_path, `desktop-${path.parse(page_name).name}-intro.png`),
      });
      await desktop_page.locator(".page-collection").scrollIntoViewIfNeeded();
      await desktop_page.screenshot({
        path: path.join(artifact_path, `desktop-${path.parse(page_name).name}-collection.png`),
      });
    }
    await desktop_page.goto(new URL("gallery.html", arguments_map.url).href, { waitUntil: "load" });
    await desktop_page.locator(".gallery-grid").scrollIntoViewIfNeeded();
    await desktop_page.screenshot({ path: path.join(artifact_path, "desktop-gallery-grid.png") });
    await desktop_context.close();

    /* Validate compact layouts under reduced motion, including every subpage. */
    const mobile_context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobile_page = await mobile_context.newPage();
    _configure_error_capture(mobile_page, browser_errors);
    await mobile_page.emulateMedia({ reducedMotion: "reduce" });
    await mobile_page.goto(arguments_map.url, { waitUntil: "load" });
    assert(await mobile_page.getByRole("navigation", { name: "Homepage sections" }).isVisible());
    assert(await mobile_page.locator("#light-field").isVisible());
    results.mobile_images = await _assert_images_loaded(mobile_page, "home-mobile-http");
    results.mobile_width = await _assert_no_horizontal_overflow(mobile_page, "home-mobile-http");
    results.mobile_effect = await _assert_effect_contract(mobile_page, "home-mobile-http");
    results.mobile_news_hidden = await _assert_news_hidden(mobile_page, "home-mobile-http");
    results.mobile_glyphs = await _assert_calligraphy_headings(
      mobile_page,
      homepage_glyph_selectors,
      "home-mobile-http",
    );
    results.mobile_centered_glyph = await _assert_centered_calligraphy(
      mobile_page,
      "home-mobile-http",
    );
    await mobile_page.locator("#top").scrollIntoViewIfNeeded();
    await mobile_page.screenshot({ path: path.join(artifact_path, "mobile-hero.png") });
    await mobile_page.locator("#life").scrollIntoViewIfNeeded();
    await mobile_page.screenshot({ path: path.join(artifact_path, "mobile-life.png") });

    // Reuse one mobile page to keep browser cost bounded while visiting all routes.
    results.mobile_subpages = {};
    for (const [page_name, [, expected_heading]] of subpages) {
      await mobile_page.goto(new URL(page_name, arguments_map.url).href, { waitUntil: "load" });
      assert(await mobile_page.getByRole("heading", { name: expected_heading, exact: true }).isVisible());
      results.mobile_subpages[page_name] = {
        images: await _assert_images_loaded(mobile_page, `${page_name}-mobile-http`),
        width: await _assert_no_horizontal_overflow(mobile_page, `${page_name}-mobile-http`),
        effect: await _assert_effect_contract(mobile_page, `${page_name}-mobile-http`),
        news_hidden: await _assert_news_hidden(mobile_page, `${page_name}-mobile-http`),
      };
    }
    await mobile_page.goto(new URL("research.html", arguments_map.url).href, { waitUntil: "load" });
    await mobile_page.locator(".page-intro").scrollIntoViewIfNeeded();
    await mobile_page.screenshot({ path: path.join(artifact_path, "mobile-research-intro.png") });
    await mobile_page.goto(new URL("gallery.html", arguments_map.url).href, { waitUntil: "load" });
    await mobile_page.locator(".gallery-grid").scrollIntoViewIfNeeded();
    await mobile_page.screenshot({ path: path.join(artifact_path, "mobile-gallery-grid.png") });
    await mobile_context.close();

    /* Stress the wrapping page navigation at a narrow but supported viewport. */
    const narrow_context = await browser.newContext({ viewport: { width: 320, height: 760 } });
    const narrow_page = await narrow_context.newPage();
    _configure_error_capture(narrow_page, browser_errors);
    results.narrow_widths = {};
    for (const page_name of ["index.html", ...subpages.keys()]) {
      await narrow_page.goto(new URL(page_name, arguments_map.url).href, { waitUntil: "load" });
      const route_label = `${page_name}-narrow-http`;
      results.narrow_widths[page_name] = {
        width: await _assert_no_horizontal_overflow(narrow_page, route_label),
        effect: await _assert_effect_contract(narrow_page, route_label),
        news_hidden: await _assert_news_hidden(narrow_page, route_label),
      };
    }
    await narrow_page.goto(new URL("research.html", arguments_map.url).href, { waitUntil: "load" });
    await narrow_page.locator(".page-intro").scrollIntoViewIfNeeded();
    await narrow_page.screenshot({ path: path.join(artifact_path, "narrow-research-intro.png") });
    await narrow_context.close();

    /* Verify all relative assets again through direct file URLs. */
    const file_context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const file_page = await file_context.newPage();
    _configure_error_capture(file_page, browser_errors);
    await file_page.goto(pathToFileURL(index_path).href, { waitUntil: "load" });
    assert.equal(await file_page.getByRole("heading", { name: "Research", exact: true }).count(), 1);
    results.file_images = await _assert_images_loaded(file_page, "home-file");
    results.file_width = await _assert_no_horizontal_overflow(file_page, "home-file");
    results.file_effect = await _assert_effect_contract(file_page, "home-file");
    results.file_news_hidden = await _assert_news_hidden(file_page, "home-file");
    results.file_subpages = {};
    for (const [page_name, [, expected_heading]] of subpages) {
      const page_path = path.join(path.dirname(index_path), page_name);
      await file_page.goto(pathToFileURL(page_path).href, { waitUntil: "load" });
      assert(await file_page.getByRole("heading", { name: expected_heading, exact: true }).isVisible());
      results.file_subpages[page_name] = {
        images: await _assert_images_loaded(file_page, `${page_name}-file`),
        width: await _assert_no_horizontal_overflow(file_page, `${page_name}-file`),
        effect: await _assert_effect_contract(file_page, `${page_name}-file`),
        news_hidden: await _assert_news_hidden(file_page, `${page_name}-file`),
      };
    }
    await file_context.close();
  } finally {
    // Close Chrome even when an assertion fails so no background process remains.
    await browser.close();
  }

  // Surface any asynchronous browser failure after all contexts have flushed.
  assert.deepEqual(browser_errors, [], `Browser errors: ${browser_errors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

_main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
