"""Browser smoke tests for the isolated contemplative-light prototype."""

from __future__ import annotations

import argparse
import json
from functools import partial
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from playwright.sync_api import ConsoleMessage, Error, Page, sync_playwright


def _record_console_message(message: ConsoleMessage, errors: list[str]) -> None:
    """Record browser console errors while ignoring normal informational output.

    Args:
        message: Playwright console message emitted by the page. All standard
            message types are accepted; only messages whose type is ``error``
            are appended.
        errors: Mutable list that owns accumulated failure strings for the
            current test page. It must not be ``None``; an empty list is valid.

    Returns:
        ``None``. The function mutates ``errors`` only when an error-level
        console message is observed.

    Raises:
        No exceptions intentionally. Playwright may raise if the remote browser
        closes while message text is being read.

    Side Effects:
        Appends a human-readable console error to ``errors``.

    Example:
        ``page.on("console", partial(_record_console_message, errors=[]))``
    """
    # Keep the signal focused on errors that would affect a static preview.
    if message.type == "error":
        errors.append(f"console: {message.text}")


def _record_page_error(error: Error, errors: list[str]) -> None:
    """Record an uncaught JavaScript page error for later assertion.

    Args:
        error: Playwright error object emitted by the ``pageerror`` event.
        errors: Mutable list that owns accumulated failure strings. It must not
            be ``None``; an empty list is valid.

    Returns:
        ``None``. The function appends one formatted entry to ``errors``.

    Raises:
        No exceptions intentionally. String conversion uses Playwright's error
        representation and may fail only if the browser connection is lost.

    Side Effects:
        Mutates the supplied ``errors`` list.

    Example:
        ``page.on("pageerror", partial(_record_page_error, errors=[]))``
    """
    # Preserve the uncaught error text so the final assertion is actionable.
    errors.append(f"pageerror: {error}")


def _assert_images_loaded(page: Page, label: str) -> int:
    """Assert that every image in a loaded page has non-zero intrinsic width.

    Args:
        page: Active Playwright page whose DOM has completed loading. It must
            remain open for the duration of the evaluation.
        label: Short non-empty context label used in assertion messages, such
            as ``"desktop-http"`` or ``"mobile-http"``.

    Returns:
        Number of image elements inspected after each image has been scrolled
        into view to trigger native lazy loading. Zero is allowed by the helper,
        but this prototype's caller separately expects a page with images.

    Raises:
        AssertionError: If one or more images are incomplete or have a natural
            width of zero.
        playwright.sync_api.Error: If the page closes during DOM evaluation.

    Side Effects:
        Scrolls each image into view to trigger native lazy loading, waits for
        pending decodes, and executes read-only JavaScript in the target page.

    Example:
        ``image_count = _assert_images_loaded(page, "desktop-http")``
    """
    # Trigger every native lazy-loaded image before judging its network state.
    image_locator = page.locator("img")
    image_count = image_locator.count()
    for image_index in range(image_count):
        image_locator.nth(image_index).scroll_into_view_if_needed()
    page.wait_for_function(
        "() => [...document.images].every((image) => image.complete)",
        timeout=10_000,
    )
    page.wait_for_timeout(80)

    # Collect only failing source URLs to keep the assertion concise.
    image_state: dict[str, Any] = page.evaluate(
        """() => {
          const images = [...document.images];
          return {
            count: images.length,
            failed: images
              .filter((image) => !image.complete || image.naturalWidth === 0)
              .map((image) => image.getAttribute('src') || '<missing src>'),
          };
        }"""
    )

    # Fail with the exact assets that did not resolve.
    assert not image_state["failed"], f"{label}: failed images {image_state['failed']}"
    return int(image_state["count"])


def _assert_no_horizontal_overflow(page: Page, label: str) -> dict[str, int]:
    """Assert that the document fits inside the current viewport width.

    Args:
        page: Active Playwright page configured at the viewport under test.
        label: Short non-empty context label included in assertion failures.

    Returns:
        Dictionary with integer ``viewport_width`` and ``document_width``
        measurements in CSS pixels.

    Raises:
        AssertionError: If the document is wider than the viewport by more than
            one CSS pixel.
        playwright.sync_api.Error: If browser-side measurement cannot complete.

    Side Effects:
        Executes read-only JavaScript in the page.

    Example:
        ``metrics = _assert_no_horizontal_overflow(page, "mobile-http")``
    """
    # Measure the layout viewport and widest document box after all assets load.
    metrics: dict[str, int] = page.evaluate(
        """() => ({
          viewport_width: window.innerWidth,
          document_width: Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ),
        })"""
    )

    # Allow one pixel for browser rounding at fractional device scales.
    assert metrics["document_width"] <= metrics["viewport_width"] + 1, (
        f"{label}: horizontal overflow {metrics}"
    )
    return metrics


def _assert_effect_contract(page: Page, label: str) -> dict[str, int]:
    """Assert that one active page owns the shared ambient-effect DOM contract.

    Args:
        page: Loaded active prototype page. Its deferred script must be allowed
            to initialize before the helper's default Playwright timeout.
        label: Non-empty route and viewport label used in assertion failures.

    Returns:
        A dictionary containing the initialized canvas bitmap ``width`` and
        ``height`` in device pixels. Both values are strictly positive.

    Raises:
        AssertionError: If the canvas, sword asset, deferred script, or their
            decorative accessibility attributes are missing or duplicated.
        playwright.sync_api.TimeoutError: If canvas initialization never finishes.

    Side Effects:
        Waits for the deferred effect initializer and executes read-only browser
        JavaScript.

    Example:
        ``effect = _assert_effect_contract(page, "notes-mobile-http")``
    """
    # Wait until the shared script allocates a non-empty viewport canvas.
    page.wait_for_function(
        """() => {
          const canvas = document.querySelector('#light-field');
          return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
        }"""
    )

    # Read the complete structural and accessibility contract in one browser pass.
    effect_state: dict[str, Any] = page.evaluate(
        """() => {
          const canvases = document.querySelectorAll('#light-field');
          const swordAssets = document.querySelectorAll('#sword-asset');
          const scripts = document.querySelectorAll("script[src='script.js']");
          const canvas = canvases[0];
          const swordAsset = swordAssets[0];
          const script = scripts[0];
          return {
            canvas_count: canvases.length,
            sword_asset_count: swordAssets.length,
            script_count: scripts.length,
            canvas_aria_hidden: canvas?.getAttribute('aria-hidden') || '',
            sword_aria_hidden: swordAsset?.getAttribute('aria-hidden') || '',
            sword_alt: swordAsset?.getAttribute('alt'),
            script_deferred: script?.hasAttribute('defer') || false,
            canvas_width: canvas?.width || 0,
            canvas_height: canvas?.height || 0,
          };
        }"""
    )

    # Enforce one reusable, decorative, non-blocking effect instance per page.
    assert effect_state["canvas_count"] == 1, f"{label}: expected one light-field canvas"
    assert effect_state["sword_asset_count"] == 1, f"{label}: expected one sword asset"
    assert effect_state["script_count"] == 1, f"{label}: expected one effect script"
    assert effect_state["canvas_aria_hidden"] == "true", f"{label}: canvas must be decorative"
    assert effect_state["sword_aria_hidden"] == "true", f"{label}: sword must be decorative"
    assert effect_state["sword_alt"] == "", f"{label}: decorative sword alt must be empty"
    assert effect_state["script_deferred"], f"{label}: effect script must be deferred"
    return {
        "canvas_width": effect_state["canvas_width"],
        "canvas_height": effect_state["canvas_height"],
    }


def _assert_news_hidden(page: Page, label: str) -> dict[str, Any]:
    """Assert that News is absent and every local hash link resolves.

    Args:
        page: Loaded homepage or one of the four active collection pages.
        label: Non-empty route and viewport label used in assertion failures.

    Returns:
        A dictionary with ``hash_link_count`` and ``scroll_target`` diagnostics.
        ``scroll_target`` is ``None`` on collection pages.

    Raises:
        AssertionError: If a News section or link remains, a same-document hash
            target is missing, or the homepage invitation does not lead to Research.
        playwright.sync_api.Error: If browser-side DOM inspection fails.

    Side Effects:
        Executes read-only browser JavaScript.

    Example:
        ``_assert_news_hidden(page, "home-desktop-http")``
    """
    # Collect News surfaces and validate every same-document anchor by ID.
    news_state: dict[str, Any] = page.evaluate(
        """() => {
          const anchors = [...document.querySelectorAll('a[href]')];
          const newsLinks = anchors.filter((anchor) => {
            const href = anchor.getAttribute('href') || '';
            return href === '#news' || href === 'news.html' || href.endsWith('/news.html');
          });
          const hashLinks = anchors.filter((anchor) =>
            (anchor.getAttribute('href') || '').startsWith('#')
          );
          const missingHashTargets = hashLinks
            .map((anchor) => anchor.getAttribute('href'))
            .filter((href) => href && href !== '#')
            .filter((href) => !document.getElementById(decodeURIComponent(href.slice(1))));
          return {
            news_section_count: document.querySelectorAll('#news').length,
            news_link_count: newsLinks.length,
            hash_link_count: hashLinks.length,
            missing_hash_targets: missingHashTargets,
            scroll_target: document.querySelector('.scroll-invitation')?.getAttribute('href') || null,
          };
        }"""
    )

    # Require a clean active information architecture with no dormant News entry.
    assert news_state["news_section_count"] == 0, f"{label}: News section must be absent"
    assert news_state["news_link_count"] == 0, f"{label}: News links must be absent"
    assert news_state["missing_hash_targets"] == [], f"{label}: broken hash links"
    if news_state["scroll_target"] is not None:
        assert news_state["scroll_target"] == "#research", (
            f"{label}: invitation must lead to Research"
        )
    return {
        "hash_link_count": news_state["hash_link_count"],
        "scroll_target": news_state["scroll_target"],
    }


def _assert_calligraphy_headings(
    page: Page,
    selectors: list[str],
    label: str,
) -> list[dict[str, str]]:
    """Assert that semantic headings render their assigned green glyph masks.

    Args:
        page: Active Playwright page after its stylesheet has loaded. It must
            remain open while computed styles are inspected.
        selectors: Non-empty list of CSS selectors, each resolving to exactly
            one heading that owns a decorative ``::before`` glyph.
        label: Short non-empty context label included in assertion failures.

    Returns:
        A list of computed-style dictionaries. Each dictionary contains the
        selector, background image, ink token, filter, and opacity observed for
        one heading glyph.

    Raises:
        AssertionError: If a selector is missing, has no glyph image, omits the
            deep-green recoloring token/filter, or renders outside the quiet
            opacity range of ``0.10`` through ``0.24``.
        playwright.sync_api.Error: If browser-side style inspection fails.

    Side Effects:
        Executes read-only JavaScript in the target page.

    Example:
        ``_assert_calligraphy_headings(page, [".section-title-notes"], "home")``
    """
    # Read the pseudo-element styles without depending on browser screenshots.
    heading_states: list[dict[str, str]] = page.evaluate(
        """(headingSelectors) => headingSelectors.map((selector) => {
          const heading = document.querySelector(selector);
          if (!heading) {
            return { selector, missing: 'true' };
          }
          const style = getComputedStyle(heading, '::before');
          return {
            selector,
            missing: 'false',
            image: style.backgroundImage,
            ink: style.getPropertyValue('--glyph-ink').trim(),
            filter: style.filter,
            opacity: style.opacity,
          };
        })""",
        selectors,
    )

    # Enforce both the correct asset mechanism and the intentionally quiet ink.
    for heading_state in heading_states:
        assert heading_state["missing"] == "false", (
            f"{label}: missing glyph heading {heading_state['selector']}"
        )
        assert heading_state["image"] not in {"", "none"}, (
            f"{label}: missing glyph image {heading_state}"
        )
        assert heading_state["ink"].lower() == "#173d31", (
            f"{label}: unexpected glyph ink token {heading_state}"
        )
        assert heading_state["filter"] not in {"", "none"}, (
            f"{label}: glyph is not recolored {heading_state}"
        )
        glyph_opacity = float(heading_state["opacity"])
        assert 0.10 <= glyph_opacity <= 0.24, (
            f"{label}: glyph opacity outside quiet range {heading_state}"
        )

    # Return diagnostics so the JSON report records exactly what was checked.
    return heading_states


def _assert_centered_calligraphy(page: Page, label: str) -> dict[str, float]:
    """Assert that the centered-title modifier removes horizontal glyph offset.

    Args:
        page: Loaded page whose shared stylesheet and calligraphy asset are
            available.
        label: Non-empty viewport label used in assertion failures.

    Returns:
        A dictionary containing foreground and glyph centers plus their absolute
        horizontal ``delta``, all measured in CSS pixels.

    Raises:
        AssertionError: If the two centers differ by more than one CSS pixel.
        playwright.sync_api.Error: If DOM fixture creation or measurement fails.

    Side Effects:
        Temporarily appends one hidden semantic heading fixture, measures it,
        and removes it before returning.

    Example:
        ``_assert_centered_calligraphy(page, "home-mobile-http")``
    """
    # Measure the reusable modifier without making the hidden News route active.
    alignment: dict[str, float] = page.evaluate(
        """() => {
          const fixture = document.createElement('h2');
          fixture.className = 'section-title section-title-notes section-title-centered';
          fixture.style.cssText =
            'position:fixed;left:0;top:-2000px;margin:0;font-size:64px;visibility:hidden';
          const foreground = document.createElement('span');
          foreground.textContent = 'Notes';
          fixture.append(foreground);
          document.body.append(fixture);

          const fixtureRect = fixture.getBoundingClientRect();
          const foregroundRect = foreground.getBoundingClientRect();
          const glyphStyle = getComputedStyle(fixture, '::before');
          const glyphWidth = Number.parseFloat(glyphStyle.width);
          const glyphLeft = Number.parseFloat(glyphStyle.left);
          const transform = new DOMMatrixReadOnly(glyphStyle.transform);
          const foregroundCenter = foregroundRect.left + foregroundRect.width / 2;
          const glyphCenter = fixtureRect.left + glyphLeft + transform.m41 + glyphWidth / 2;
          fixture.remove();
          return {
            foreground_center: foregroundCenter,
            glyph_center: glyphCenter,
            delta: Math.abs(foregroundCenter - glyphCenter),
          };
        }"""
    )

    # Allow one pixel for fractional font and transform rounding.
    assert alignment["delta"] <= 1, f"{label}: centered glyph offset {alignment['delta']}"
    return alignment


def _configure_page_error_capture(page: Page, errors: list[str]) -> None:
    """Attach console and uncaught-error collectors to one Playwright page.

    Args:
        page: Newly created Playwright page. It must remain open while its
            registered callbacks may fire.
        errors: Mutable list receiving formatted error strings. It must not be
            ``None``; an empty list is the normal starting state.

    Returns:
        ``None``. The page receives two persistent event listeners.

    Raises:
        playwright.sync_api.Error: If listeners cannot be registered because
            the page or browser is already closed.

    Side Effects:
        Registers callbacks on ``page`` and mutates ``errors`` when events fire.

    Example:
        ``_configure_page_error_capture(page, console_errors)``
    """
    # Register named, documented callbacks through partial argument binding.
    page.on("console", partial(_record_console_message, errors=errors))
    page.on("pageerror", partial(_record_page_error, errors=errors))


def _parse_arguments() -> argparse.Namespace:
    """Parse command-line paths and URLs required by the smoke test.

    Returns:
        An ``argparse.Namespace`` containing ``url``, ``index``, ``chrome``, and
        ``artifacts`` values. Paths are returned as user-provided strings and
        resolved by ``main``.

    Raises:
        SystemExit: If any required option is missing or malformed, following
            normal ``argparse`` behavior.

    Side Effects:
        Reads ``sys.argv`` and may write argparse usage text to standard error.

    Example:
        ``arguments = _parse_arguments()``
    """
    # Declare the four explicit inputs so the test never guesses local paths.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="HTTP URL of the served prototype.")
    parser.add_argument("--index", required=True, help="Absolute or relative index.html path.")
    parser.add_argument("--chrome", required=True, help="Chrome or Edge executable path.")
    parser.add_argument("--artifacts", required=True, help="Directory for screenshots.")

    # Return argparse's validated namespace to the main test chain.
    return parser.parse_args()


def main() -> int:
    """Run desktop, mobile, narrow, reduced-motion, focus, and file checks.

    Returns:
        Process status ``0`` when every assertion passes. Test failures raise an
        exception and therefore return a non-zero status through Python.

    Raises:
        AssertionError: If content, focus behavior, responsive width, resource
            loading, or browser error checks fail.
        FileNotFoundError: If the supplied HTML or browser executable is absent.
        playwright.sync_api.Error: If Chromium cannot launch or navigate.

    Side Effects:
        Launches a headless browser, reads the local HTTP server and ``file://``
        page, writes PNG screenshots, and prints one JSON summary to stdout.

    Example:
        ``raise SystemExit(main())``
    """
    # Resolve caller inputs and establish a clean artifact directory.
    arguments = _parse_arguments()
    index_path = Path(arguments.index).resolve(strict=True)
    chrome_path = Path(arguments.chrome).resolve(strict=True)
    artifact_path = Path(arguments.artifacts).resolve()
    artifact_path.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {}
    browser_errors: list[str] = []
    subpages = {
        "research.html": ("Research · Youyang Du", "Research"),
        "projects.html": ("Projects · Youyang Du", "Projects"),
        "notes.html": ("Notes · Youyang Du", "Notes"),
        "gallery.html": ("Gallery · Youyang Du", "Gallery"),
    }
    homepage_glyph_selectors = [
        ".section-title-research",
        ".section-title-projects",
        ".section-title-notes",
        ".section-title-life",
    ]

    # Launch the installed browser through the isolated Python Playwright package.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=str(chrome_path), headless=True)

        # Validate the primary desktop HTTP experience and keyboard entry point.
        desktop_context = browser.new_context(viewport={"width": 1440, "height": 900})
        desktop_page = desktop_context.new_page()
        _configure_page_error_capture(desktop_page, browser_errors)
        desktop_page.goto(arguments.url, wait_until="networkidle")
        assert desktop_page.title() == "Youyang Du · Homepage prototype"
        assert desktop_page.get_by_role("heading", name="Youyang Du 杜悠扬").is_visible()
        assert desktop_page.locator("main section").count() == 5
        assert desktop_page.get_by_role("heading", name="Notes", exact=True).count() == 1
        assert desktop_page.locator("a[href='research.html']").count() == 1
        assert desktop_page.locator("a[href='projects.html']").count() == 1
        assert desktop_page.locator("a[href='notes.html']").count() == 1
        assert desktop_page.locator("a[href='gallery.html']").count() == 1
        desktop_page.keyboard.press("Tab")
        assert desktop_page.evaluate("document.activeElement.classList.contains('skip-link')")
        desktop_page.evaluate("document.activeElement.blur()")
        results["desktop_images"] = _assert_images_loaded(desktop_page, "desktop-http")
        results["desktop_width"] = _assert_no_horizontal_overflow(desktop_page, "desktop-http")
        results["desktop_effect"] = _assert_effect_contract(desktop_page, "desktop-http")
        results["desktop_news_hidden"] = _assert_news_hidden(desktop_page, "desktop-http")
        results["homepage_glyphs"] = _assert_calligraphy_headings(
            desktop_page,
            homepage_glyph_selectors,
            "desktop-http",
        )
        results["desktop_centered_glyph"] = _assert_centered_calligraphy(
            desktop_page,
            "desktop-http",
        )
        assert not desktop_page.evaluate(
            "performance.getEntriesByType('resource').some((entry) => "
            "entry.name.includes('section-gongfa.png'))"
        )
        desktop_page.locator("#top").scroll_into_view_if_needed()
        desktop_page.screenshot(path=str(artifact_path / "desktop-hero.png"), full_page=False)
        desktop_page.locator("#research").scroll_into_view_if_needed()
        desktop_page.screenshot(path=str(artifact_path / "desktop-research.png"), full_page=False)

        # Check every static collection page in the same desktop context.
        results["desktop_subpages"] = {}
        for page_name, (expected_title, expected_heading) in subpages.items():
            page_url = urljoin(arguments.url, page_name)
            desktop_page.goto(page_url, wait_until="networkidle")
            assert desktop_page.title() == expected_title
            assert desktop_page.get_by_role("heading", name=expected_heading, exact=True).is_visible()
            assert desktop_page.locator("nav [aria-current='page']").count() == 1
            page_result = {
                "images": _assert_images_loaded(desktop_page, f"{page_name}-desktop-http"),
                "width": _assert_no_horizontal_overflow(
                    desktop_page,
                    f"{page_name}-desktop-http",
                ),
                "effect": _assert_effect_contract(
                    desktop_page,
                    f"{page_name}-desktop-http",
                ),
                "news_hidden": _assert_news_hidden(
                    desktop_page,
                    f"{page_name}-desktop-http",
                ),
                "glyphs": _assert_calligraphy_headings(
                    desktop_page,
                    [".page-title"],
                    f"{page_name}-desktop-http",
                ),
            }
            results["desktop_subpages"][page_name] = page_result
            desktop_page.locator(".page-intro").scroll_into_view_if_needed()
            desktop_page.screenshot(
                path=str(artifact_path / f"desktop-{Path(page_name).stem}-intro.png"),
                full_page=False,
            )

        # Capture the most visual collection layouts below their page intros.
        desktop_page.goto(urljoin(arguments.url, "gallery.html"), wait_until="networkidle")
        desktop_page.locator(".gallery-grid").scroll_into_view_if_needed()
        desktop_page.screenshot(path=str(artifact_path / "desktop-gallery-grid.png"), full_page=False)
        desktop_context.close()

        # Validate the compact mobile composition and reduced-motion fallback.
        mobile_context = browser.new_context(viewport={"width": 390, "height": 844})
        mobile_page = mobile_context.new_page()
        _configure_page_error_capture(mobile_page, browser_errors)
        mobile_page.emulate_media(reduced_motion="reduce")
        mobile_page.goto(arguments.url, wait_until="networkidle")
        assert mobile_page.get_by_role("navigation", name="Homepage sections").is_visible()
        assert mobile_page.locator("#light-field").is_visible()
        results["mobile_images"] = _assert_images_loaded(mobile_page, "mobile-http")
        results["mobile_width"] = _assert_no_horizontal_overflow(mobile_page, "mobile-http")
        results["mobile_effect"] = _assert_effect_contract(mobile_page, "mobile-http")
        results["mobile_news_hidden"] = _assert_news_hidden(mobile_page, "mobile-http")
        results["mobile_glyphs"] = _assert_calligraphy_headings(
            mobile_page,
            homepage_glyph_selectors,
            "mobile-http",
        )
        results["mobile_centered_glyph"] = _assert_centered_calligraphy(
            mobile_page,
            "mobile-http",
        )
        mobile_page.locator("#top").scroll_into_view_if_needed()
        mobile_page.screenshot(path=str(artifact_path / "mobile-hero.png"), full_page=False)
        mobile_page.locator("#life").scroll_into_view_if_needed()
        mobile_page.screenshot(path=str(artifact_path / "mobile-life.png"), full_page=False)

        # Exercise every collection layout at the compact breakpoint.
        results["mobile_subpages"] = {}
        for page_name, (_, expected_heading) in subpages.items():
            mobile_page.goto(urljoin(arguments.url, page_name), wait_until="networkidle")
            assert mobile_page.get_by_role("heading", name=expected_heading, exact=True).is_visible()
            page_result = {
                "images": _assert_images_loaded(mobile_page, f"{page_name}-mobile-http"),
                "width": _assert_no_horizontal_overflow(
                    mobile_page,
                    f"{page_name}-mobile-http",
                ),
                "effect": _assert_effect_contract(
                    mobile_page,
                    f"{page_name}-mobile-http",
                ),
                "news_hidden": _assert_news_hidden(
                    mobile_page,
                    f"{page_name}-mobile-http",
                ),
            }
            results["mobile_subpages"][page_name] = page_result
        mobile_page.goto(urljoin(arguments.url, "gallery.html"), wait_until="networkidle")
        mobile_page.locator(".gallery-grid").scroll_into_view_if_needed()
        mobile_page.screenshot(path=str(artifact_path / "mobile-gallery-grid.png"), full_page=False)
        mobile_context.close()

        # Stress every active route at the narrowest supported 320-pixel viewport.
        narrow_context = browser.new_context(viewport={"width": 320, "height": 760})
        narrow_page = narrow_context.new_page()
        _configure_page_error_capture(narrow_page, browser_errors)
        results["narrow_routes"] = {}
        for page_name in ["index.html", *subpages.keys()]:
            narrow_page.goto(urljoin(arguments.url, page_name), wait_until="networkidle")
            route_label = f"{page_name}-narrow-http"
            results["narrow_routes"][page_name] = {
                "width": _assert_no_horizontal_overflow(narrow_page, route_label),
                "effect": _assert_effect_contract(narrow_page, route_label),
                "news_hidden": _assert_news_hidden(narrow_page, route_label),
            }
        narrow_page.goto(urljoin(arguments.url, "research.html"), wait_until="networkidle")
        narrow_page.locator(".page-intro").scroll_into_view_if_needed()
        narrow_page.screenshot(
            path=str(artifact_path / "narrow-research-intro.png"),
            full_page=False,
        )
        narrow_context.close()

        # Confirm the same artifact works when opened directly without a server.
        file_context = browser.new_context(viewport={"width": 1280, "height": 800})
        file_page = file_context.new_page()
        _configure_page_error_capture(file_page, browser_errors)
        file_page.goto(index_path.as_uri(), wait_until="load")
        assert file_page.get_by_role("heading", name="Research").count() == 1
        results["file_images"] = _assert_images_loaded(file_page, "desktop-file")
        results["file_width"] = _assert_no_horizontal_overflow(file_page, "desktop-file")
        results["file_effect"] = _assert_effect_contract(file_page, "desktop-file")
        results["file_news_hidden"] = _assert_news_hidden(file_page, "desktop-file")

        # Verify relative assets and navigation for all pages without an HTTP server.
        results["file_subpages"] = {}
        for page_name, (_, expected_heading) in subpages.items():
            page_path = index_path.with_name(page_name).resolve(strict=True)
            file_page.goto(page_path.as_uri(), wait_until="load")
            assert file_page.get_by_role("heading", name=expected_heading, exact=True).is_visible()
            results["file_subpages"][page_name] = {
                "images": _assert_images_loaded(file_page, f"{page_name}-file"),
                "width": _assert_no_horizontal_overflow(file_page, f"{page_name}-file"),
                "effect": _assert_effect_contract(file_page, f"{page_name}-file"),
                "news_hidden": _assert_news_hidden(file_page, f"{page_name}-file"),
            }
        file_context.close()

        # Close the process only after all contexts have flushed their errors.
        browser.close()

    # Treat any console or uncaught JavaScript error as a failed prototype build.
    assert not browser_errors, f"Browser errors: {browser_errors}"
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
