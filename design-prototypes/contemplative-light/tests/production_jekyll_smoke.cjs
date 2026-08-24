"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

/**
 * Parse the explicit runtime inputs required by the production-site smoke test.
 *
 * @param {string[]} command_arguments - Command-line tokens after the script
 *   name. Accepted flags are `--url-root`, `--chrome`, and `--artifacts`; each
 *   flag must be followed by one non-empty value.
 * @returns {{urlRoot: string, chrome: string, artifacts: string}} Validated
 *   browser, server, and screenshot locations.
 * @throws {Error} If a flag-value pair is malformed or a required flag is absent.
 * @example
 * const options = _parse_arguments(process.argv.slice(2));
 */
function _parse_arguments(command_arguments) {
  // Collect strict flag-value pairs so machine-specific paths stay outside the test.
  const parsed_arguments = {};
  for (let argument_index = 0;
    argument_index < command_arguments.length;
    argument_index += 2) {
    const flag_name = command_arguments[argument_index];
    const flag_value = command_arguments[argument_index + 1];
    if (!flag_name || !flag_name.startsWith("--") || !flag_value) {
      throw new Error(`Malformed argument pair at index ${argument_index}.`);
    }
    parsed_arguments[flag_name.slice(2)] = flag_value;
  }

  // Fail before browser launch when any required environment input is missing.
  for (const required_name of ["url-root", "chrome", "artifacts"]) {
    if (!parsed_arguments[required_name]) {
      throw new Error(`Missing required --${required_name} argument.`);
    }
  }

  // Normalize the URL once so route concatenation never produces a double slash.
  return {
    urlRoot: parsed_arguments["url-root"].replace(/\/$/, ""),
    chrome: parsed_arguments.chrome,
    artifacts: parsed_arguments.artifacts,
  };
}

/**
 * Inspect one generated Jekyll page at one viewport and save visual evidence.
 *
 * @param {import("playwright").Browser} browser - Open Chromium browser owned
 *   by the caller. It must remain alive for the duration of this function.
 * @param {{urlRoot: string, artifacts: string}} options - Normalized local
 *   server root and writable screenshot directory.
 * @param {{name: string, route: string, requiredSelectors: string[]}} page_specification
 *   - Stable route name, generated URL path, and selectors that define the
 *   renderer contract for this page type.
 * @param {{name: string, width: number, height: number}} viewport - Screenshot
 *   label and positive CSS-pixel dimensions used for the isolated browser page.
 * @returns {Promise<object>} Measured layout, asset, navigation, and canvas state.
 * @throws {AssertionError} If the route, renderer contract, local resources,
 *   responsive layout, or contemplative effect surface is invalid.
 * @sideeffects Opens and closes a browser page, performs pointer input, and
 *   writes one PNG screenshot below `options.artifacts`.
 * @example
 * await _inspect_page(browser, options, notes_specification, desktop_viewport);
 */
async function _inspect_page(browser, options, page_specification, viewport) {
  // Create an isolated page and provide a minimal jQuery surface for CDN-independent testing.
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    const jquery_stub = () => jquery_stub;
    jquery_stub.outerHeight = () => 0;
    jquery_stub.scrollTop = () => 0;
    jquery_stub.height = () => document.documentElement.scrollHeight;
    jquery_stub.width = () => document.documentElement.scrollWidth;
    jquery_stub.hasClass = () => false;
    jquery_stub.ready = () => jquery_stub;
    jquery_stub.fn = { jquery: "3.6.0" };
    for (const chain_method of ["css", "attr", "on", "collapse", "remove"]) {
      jquery_stub[chain_method] = () => jquery_stub;
    }
    window.$ = jquery_stub;
    window.jQuery = jquery_stub;
  });

  // Keep every generated local resource real while neutralizing unreliable third-party CDNs.
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().startsWith(options.urlRoot)) {
      const local_pathname = new URL(request.url()).pathname;
      const jquery_dependent_legacy_scripts = new Set([
        "/assets/js/bootstrap.bundle.min.js",
        "/assets/js/common.js",
        "/assets/js/jupyter_new_tab.js",
        "/assets/js/masonry.js",
        "/assets/js/no_defer.js",
        "/assets/js/zoom.js",
      ]);
      if (jquery_dependent_legacy_scripts.has(local_pathname)) {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "void 0;",
        });
        return;
      }
      await route.continue();
      return;
    }
    if (request.resourceType() === "script") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "void 0;",
      });
      return;
    }
    if (request.resourceType() === "stylesheet") {
      await route.fulfill({ status: 200, contentType: "text/css", body: "" });
      return;
    }
    await route.abort();
  });

  // Collect runtime and response failures after the deterministic resource policy is active.
  const page_errors = [];
  const local_response_errors = [];
  page.on("pageerror", (error) => page_errors.push(error.stack || error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(options.urlRoot) && response.status() >= 400) {
      local_response_errors.push(`${response.status()} ${response.url()}`);
    }
  });

  // Load the generated route and wait for deferred local effects to initialize.
  const response = await page.goto(`${options.urlRoot}${page_specification.route}`, {
    waitUntil: "commit",
    timeout: 45_000,
  });
  assert.ok(response, `${page_specification.name}: navigation produced no response.`);
  assert.equal(response.status(), 200, `${page_specification.name}: expected HTTP 200.`);
  await page.waitForSelector(page_specification.requiredSelectors[0], {
    state: "attached",
    timeout: 30_000,
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#light-field");
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  }, null, { timeout: 15_000 });
  await page.mouse.move(viewport.width * 0.38, viewport.height * 0.42);
  await page.waitForTimeout(450);

  // Assert the renderer-specific DOM before measuring the shared contemplative shell.
  for (const required_selector of page_specification.requiredSelectors) {
    assert.equal(
      await page.locator(required_selector).count() > 0,
      true,
      `${page_specification.name}: missing ${required_selector}.`,
    );
  }
  const page_state = await page.evaluate(() => {
    const canvas = document.querySelector("#light-field");
    const canvas_rect = canvas.getBoundingClientRect();
    return {
      body_class: document.body.className,
      client_width: document.documentElement.clientWidth,
      document_width: document.documentElement.scrollWidth,
      canvas_width: canvas_rect.width,
      canvas_height: canvas_rect.height,
      canvas_bitmap_length: canvas.toDataURL("image/png").length,
      has_notes_css: Boolean(document.querySelector(
        'link[href*="/assets/css/contemplative-notes.css"]',
      )),
      has_effect_script: Boolean(document.querySelector(
        'script[src*="/assets/js/contemplative-effects.js"]',
      )),
      internal_blog_link_count: document.querySelectorAll('a[href^="/blog/"]').length,
      external_production_blog_link_count: document.querySelectorAll(
        'a[href^="https://icewired-yy.github.io/blog/"]',
      ).length,
    };
  });

  // Enforce the shared responsive and effect contract on the real Jekyll output.
  assert.match(
    page_state.body_class,
    /contemplative-notes-surface/,
    `${page_specification.name}: missing contemplative body scope.`,
  );
  assert.equal(page_state.has_notes_css, true, `${page_specification.name}: Notes CSS missing.`);
  assert.equal(page_state.has_effect_script, true, `${page_specification.name}: effect script missing.`);
  assert.equal(
    page_state.document_width,
    page_state.client_width,
    `${page_specification.name}: page has horizontal viewport overflow.`,
  );
  assert.ok(
    page_state.canvas_width >= viewport.width - 1
      && page_state.canvas_height >= viewport.height - 1,
    `${page_specification.name}: canvas does not cover the viewport.`,
  );
  assert.ok(
    page_state.canvas_bitmap_length > 1_000,
    `${page_specification.name}: canvas did not render a meaningful bitmap.`,
  );
  assert.deepEqual(page_errors, [], `${page_specification.name}: browser page errors detected.`);
  assert.deepEqual(
    local_response_errors,
    [],
    `${page_specification.name}: local resource failures detected.`,
  );

  // Persist a full-page screenshot and release the isolated browser page.
  const screenshot_path = path.join(
    options.artifacts,
    `production-${page_specification.name}-${viewport.name}.png`,
  );
  await page.screenshot({ path: screenshot_path, fullPage: true });
  await page.close();
  return page_state;
}

/**
 * Verify that the static prototype now enters the locally served Notes route.
 *
 * @param {import("playwright").Browser} browser - Open Chromium browser used
 *   to perform the navigation contract check.
 * @param {{urlRoot: string}} options - Normalized HTTP root for the generated site.
 * @returns {Promise<void>} Resolves after the prototype link reaches the local
 *   Distill note and its contemplative shell is present.
 * @throws {AssertionError} If the prototype still targets the production host
 *   or if navigation fails to enter the local `/blog/` route.
 * @sideeffects Opens and closes one browser page and clicks the first Notes item.
 * @example
 * await _verify_prototype_notes_navigation(browser, options);
 */
async function _verify_prototype_notes_navigation(browser, options) {
  // Open the generated copy of the prototype using HTTP rather than file URLs.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    `${options.urlRoot}/design-prototypes/contemplative-light/index.html`,
    { waitUntil: "domcontentloaded", timeout: 45_000 },
  );

  // Confirm the authored href is same-origin before following it.
  const first_note_link = page.locator(
    'a[href="/blog/2025/EN-NDF-and-Microfacet-Theory/"]',
  ).first();
  assert.equal(await first_note_link.count(), 1, "Prototype Notes link is not root-relative.");
  await first_note_link.click();
  await page.waitForURL(`${options.urlRoot}/blog/2025/EN-NDF-and-Microfacet-Theory/`, {
    timeout: 30_000,
  });
  assert.equal(
    await page.locator("body.contemplative-notes-surface d-article").count(),
    1,
    "Prototype Notes link did not reach the local Distill article.",
  );

  // Release the navigation-check page after the local route is proven.
  await page.close();
}

/**
 * Run the complete generated-site browser contract for desktop and mobile.
 *
 * @returns {Promise<void>} Resolves after all routes, viewports, screenshots,
 *   and the prototype-to-Notes navigation contract pass.
 * @throws {Error|AssertionError} Propagates browser launch, navigation, and
 *   assertion failures to the process entrypoint.
 * @sideeffects Launches Chromium, creates the artifact directory, and writes
 *   six full-page screenshots.
 * @example
 * _run().catch((error) => { throw error; });
 */
async function _run() {
  // Resolve explicit runtime inputs and create the evidence directory.
  const options = _parse_arguments(process.argv.slice(2));
  fs.mkdirSync(options.artifacts, { recursive: true });

  // Define the three production renderers and two responsive viewports under test.
  const page_specifications = [
    {
      name: "notes-index",
      route: "/blog/",
      requiredSelectors: [".notes-index", ".notes-index-title", ".notes-index-entry"],
    },
    {
      name: "standard-note",
      route: "/blog/2025/EN-paper-reading-compressive-rendering/",
      requiredSelectors: [".notes-standard-article", "#markdown-content", "#MathJax-script"],
    },
    {
      name: "distill-note",
      route: "/blog/2025/EN-NDF-and-Microfacet-Theory/",
      requiredSelectors: [
        ".notes-distill-article",
        "d-title",
        "d-article",
        "d-cite",
        "d-bibliography",
      ],
    },
  ];
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ];

  // Inspect every route/viewport pair, then prove the original prototype link flow.
  const browser = await chromium.launch({ executablePath: options.chrome, headless: true });
  try {
    for (const page_specification of page_specifications) {
      for (const viewport of viewports) {
        await _inspect_page(browser, options, page_specification, viewport);
      }
    }
    await _verify_prototype_notes_navigation(browser, options);
  } finally {
    await browser.close();
  }
}

// Expose a non-zero process exit code with the complete assertion stack on failure.
_run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
