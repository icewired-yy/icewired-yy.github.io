"""Browser smoke test for the production Notes navigation and reading metadata.

This test intentionally targets the generated Jekyll site rather than a render
fixture. It uses the system Chrome executable supplied by the caller and never
downloads a Playwright-managed browser.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright


PAGE_SPECIFICATIONS = (
    {
        "name": "standard",
        "route": "/blog/2025/EN-paper-reading-compressive-rendering/",
        "reading_time": "Estimated reading time: 9 min",
        "content_selector": "#markdown-content",
    },
    {
        "name": "distill",
        "route": "/blog/2025/EN-NDF-and-Microfacet-Theory/",
        "reading_time": "Estimated reading time: 17 min",
        "content_selector": "d-article",
    },
)

VIEWPORTS = (
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "mobile", "width": 390, "height": 844},
)


def _parse_arguments() -> argparse.Namespace:
    """Parse and validate the browser smoke test command line.

    Returns:
        An ``argparse.Namespace`` with ``url_root``, ``chrome``, and
        ``artifacts`` values. ``url_root`` has no trailing slash, ``chrome`` is
        an existing executable, and ``artifacts`` is an existing directory.

    Raises:
        SystemExit: If a required argument is missing, the Chrome executable
            does not exist, or argument parsing otherwise fails.

    Side effects:
        Creates the artifact directory, including missing parent directories.
    """
    # Collect explicit runtime paths so the test remains machine-independent.
    parser = argparse.ArgumentParser(
        description="Validate generated Notes navigation and reading metadata."
    )
    parser.add_argument("--url-root", required=True)
    parser.add_argument("--chrome", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    arguments = parser.parse_args()

    # Normalize and validate filesystem inputs before launching a browser.
    arguments.url_root = arguments.url_root.rstrip("/")
    if not arguments.chrome.is_file():
        parser.error(f"Chrome executable does not exist: {arguments.chrome}")
    arguments.artifacts.mkdir(parents=True, exist_ok=True)

    # Return one validated configuration object to the browser runner.
    return arguments


def _parse_css_alpha(background_color: str) -> float:
    """Extract the alpha channel from a computed CSS RGB color.

    Args:
        background_color: Computed CSS color in ``rgb(...)`` or ``rgba(...)``
            syntax. Empty strings and other color syntaxes are invalid.

    Returns:
        The floating-point alpha channel in the inclusive range ``0`` to ``1``.
        Opaque ``rgb(...)`` colors return ``1``.

    Raises:
        AssertionError: If the value is not a computed RGB color or its alpha
            channel falls outside the valid range.
    """
    # Match the browser's legacy comma-separated computed color serialization.
    color_match = re.fullmatch(
        r"rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*"
        r"\d+(?:\.\d+)?(?:\s*,\s*(\d*\.?\d+))?\s*\)",
        background_color,
    )
    assert color_match, f"Unexpected computed navigation color: {background_color}"

    # Treat an omitted alpha component as the opaque default and validate it.
    alpha = float(color_match.group(1) or "1")
    assert 0 <= alpha <= 1, f"Invalid navigation alpha: {alpha}"
    return alpha


def _inspect_page(
    browser: Browser,
    url_root: str,
    artifacts: Path,
    page_specification: dict[str, Any],
    viewport: dict[str, Any],
) -> dict[str, Any]:
    """Inspect one generated note at one viewport and save visual evidence.

    Args:
        browser: Live Playwright Chromium browser owned by the caller.
        url_root: Non-empty local HTTP origin without a trailing slash.
        artifacts: Writable directory for viewport PNG evidence.
        page_specification: Mapping containing a stable ``name``, a local
            ``route``, the exact expected ``reading_time`` text, and the first
            article ``content_selector``. Values must be non-empty strings.
        viewport: Mapping containing a stable ``name`` and positive integer
            ``width`` and ``height`` values in CSS pixels.

    Returns:
        A JSON-serializable measurement mapping for the inspected page.

    Raises:
        AssertionError: If reading metadata, navigation translucency, the
            unified rem scale, DOM order, or responsive width contract fails.
        playwright.sync_api.TimeoutError: If the generated page does not reach
            network idle or a required selector does not appear in time.

    Side effects:
        Opens and closes a browser page, scrolls it, aborts external HTTPS
        requests, and writes one PNG screenshot under ``artifacts``.
    """
    # Open an isolated viewport and keep remote CDN traffic out of the local test.
    page: Page = browser.new_page(
        viewport={"width": viewport["width"], "height": viewport["height"]}
    )
    page.route("https://**", lambda route: route.abort())

    # Load the real generated route and wait for Distill's runtime styles.
    page.goto(
        f"{url_root}{page_specification['route']}",
        wait_until="networkidle",
        timeout=30_000,
    )
    page.locator(".notes-navbar").wait_for(state="visible")
    page.locator(".notes-reading-time").wait_for(state="visible")

    # Measure the rendered contract after both ordinary and Distill styles settle.
    measurements = page.evaluate(
        r"""({ expectedText, contentSelector }) => {
          const navigation = document.querySelector('.notes-navbar');
          const readingTime = document.querySelector('.notes-reading-time');
          const content = document.querySelector(contentSelector);
          const navigationStyle = getComputedStyle(navigation);
          const readableMetadata = readingTime.cloneNode(true);
          readableMetadata.querySelectorAll('[aria-hidden="true"]').forEach(
            (decorativeNode) => decorativeNode.remove()
          );
          const readingText = readableMetadata.textContent.replace(/\s+/g, ' ').trim();
          return {
            backgroundColor: navigationStyle.backgroundColor,
            backdropFilter:
              navigationStyle.backdropFilter || navigationStyle.webkitBackdropFilter,
            navigationHeight: navigation.getBoundingClientRect().height,
            rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
            bodyFontSize: parseFloat(getComputedStyle(document.body).fontSize),
            readingText,
            readingVisible:
              readingTime.getBoundingClientRect().height > 0 &&
              readingTime.getBoundingClientRect().width > 0,
            readingBeforeContent: Boolean(
              readingTime.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            textMatches: readingText === expectedText,
          };
        }""",
        {
            "expectedText": page_specification["reading_time"],
            "contentSelector": page_specification["content_selector"],
        },
    )

    # Assert the requested appearance, placement, and responsive invariants.
    navigation_alpha = _parse_css_alpha(measurements["backgroundColor"])
    assert 0 < navigation_alpha < 1, measurements
    assert "blur(18px)" in measurements["backdropFilter"], measurements
    assert abs(measurements["navigationHeight"] - 72) <= 0.5, measurements
    assert measurements["rootFontSize"] == 16, measurements
    assert measurements["bodyFontSize"] == 16, measurements
    assert measurements["readingVisible"], measurements
    assert measurements["readingBeforeContent"], measurements
    assert measurements["textMatches"], measurements
    assert measurements["documentWidth"] == measurements["viewportWidth"], measurements

    # Scroll content beneath the fixed translucent navigation and capture evidence.
    page.evaluate("window.scrollTo(0, Math.min(520, document.body.scrollHeight / 4))")
    page.wait_for_timeout(250)
    screenshot_path = artifacts / (
        f"notes-refinement-{page_specification['name']}-{viewport['name']}.png"
    )
    page.screenshot(path=str(screenshot_path), full_page=False)
    page.close()

    # Include test identity and normalized alpha in the machine-readable report.
    measurements.update(
        {
            "page": page_specification["name"],
            "viewport": viewport["name"],
            "navigationAlpha": navigation_alpha,
            "screenshot": str(screenshot_path),
        }
    )
    return measurements


def main() -> None:
    """Run the complete Notes refinement smoke matrix and print JSON results.

    Returns:
        ``None``. Successful measurements are emitted to standard output.

    Raises:
        AssertionError: If any page or viewport violates the requested UI
            contract. Playwright launch and navigation errors are propagated.

    Side effects:
        Launches system Chrome headlessly, performs four local page visits,
        writes four screenshots, and prints a JSON report.
    """
    # Parse all runtime inputs before allocating the browser process.
    arguments = _parse_arguments()
    results: list[dict[str, Any]] = []

    # Inspect both renderers at desktop and mobile widths in one browser session.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(arguments.chrome),
            headless=True,
        )
        for page_specification in PAGE_SPECIFICATIONS:
            for viewport in VIEWPORTS:
                results.append(
                    _inspect_page(
                        browser,
                        arguments.url_root,
                        arguments.artifacts,
                        page_specification,
                        viewport,
                    )
                )
        browser.close()

    # Emit one compact record suitable for CI logs and human review.
    print(json.dumps({"status": "passed", "results": results}, indent=2))


if __name__ == "__main__":
    main()
