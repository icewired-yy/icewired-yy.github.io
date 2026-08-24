"""Cross-route browser regression for the contemplative stacking contract.

The production Notes renderers and isolated static prototype share one visual
rule: document content paints below the pointer-transparent sword field, while
navigation and the skip link remain above both. Production image overlays stay
between document content and the effect. The test injects extreme nested and
body-mounted probes to prove cards and library overlays cannot cover navigation
or the authored pointer effect.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright


ROUTE_SPECIFICATIONS = (
    {
        "name": "notes-index",
        "route": "/blog/",
        "navigation_root": ".notes-site-header",
        "navigation_surface": ".notes-navbar",
        "navigation_marker": ".notes-site-mark",
        "effect_layer": ".notes-light-field",
        "content_root": ".contemplative-notes-main",
        "fixed_navigation": True,
        "production": True,
        "capture": False,
    },
    {
        "name": "notes-standard",
        "route": "/blog/2025/EN-paper-reading-compressive-rendering/",
        "navigation_root": ".notes-site-header",
        "navigation_surface": ".notes-navbar",
        "navigation_marker": ".notes-site-mark",
        "effect_layer": ".notes-light-field",
        "content_root": ".contemplative-notes-main",
        "fixed_navigation": True,
        "production": True,
        "capture": True,
    },
    {
        "name": "notes-distill",
        "route": "/blog/2025/EN-NDF-and-Microfacet-Theory/",
        "navigation_root": ".notes-site-header",
        "navigation_surface": ".notes-navbar",
        "navigation_marker": ".notes-site-mark",
        "effect_layer": ".notes-light-field",
        "content_root": ".notes-distill-article",
        "fixed_navigation": True,
        "production": True,
        "capture": True,
    },
    *(
        {
            "name": f"prototype-{page_name}",
            "route": (
                "/design-prototypes/contemplative-light/index.html"
                if page_name == "home"
                else f"/design-prototypes/contemplative-light/{page_name}.html"
            ),
            "navigation_root": ".site-header",
            "navigation_surface": ".site-header",
            "navigation_marker": ".site-mark",
            "effect_layer": ".light-field",
            "content_root": "main",
            "fixed_navigation": False,
            "production": False,
            "capture": page_name == "gallery",
        }
        for page_name in ("home", "research", "projects", "notes", "gallery")
    ),
)

VIEWPORTS = (
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "mobile", "width": 390, "height": 844},
)


def _parse_arguments() -> argparse.Namespace:
    """Parse the local origin, Chrome executable, and artifact directory.

    Returns:
        A namespace whose ``url_root`` has no trailing slash, whose ``chrome``
        points to an existing executable, and whose ``artifacts`` directory
        exists and is writable by the current process.

    Raises:
        SystemExit: If required arguments are absent or Chrome does not exist.

    Side effects:
        Creates the artifact directory and any missing parents.
    """
    # Define explicit machine-dependent inputs instead of embedding local paths.
    parser = argparse.ArgumentParser(
        description="Validate content, sword-effect, and navigation paint order."
    )
    parser.add_argument("--url-root", required=True)
    parser.add_argument("--chrome", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    arguments = parser.parse_args()

    # Normalize and validate inputs before a browser process is allocated.
    arguments.url_root = arguments.url_root.rstrip("/")
    if not arguments.chrome.is_file():
        parser.error(f"Chrome executable does not exist: {arguments.chrome}")
    arguments.artifacts.mkdir(parents=True, exist_ok=True)

    # Return one validated configuration object for the complete test matrix.
    return arguments


def _inspect_route(
    browser: Browser,
    url_root: str,
    artifacts: Path,
    route_specification: dict[str, Any],
    viewport: dict[str, Any],
) -> dict[str, Any]:
    """Validate one route's complete root-level stacking contract.

    Args:
        browser: Live Playwright Chromium instance owned by the caller.
        url_root: Local HTTP origin without a trailing slash.
        artifacts: Writable screenshot directory.
        route_specification: Mapping with route identity, selectors for the
            navigation, effect, and content roots, fixed-navigation and
            production booleans, and a screenshot boolean. All selector values
            must match exactly one element on the generated page.
        viewport: Mapping with a stable name and positive integer CSS-pixel
            ``width`` and ``height`` values.

    Returns:
        A JSON-serializable mapping of z-indices, hit-testing results, geometry,
        and optional screenshot location.

    Raises:
        AssertionError: If the page violates ``content < overlay < effects <
            navigation``, the canvas intercepts input, navigation loses hit
            testing to a nested component, the production footer loses its
            fixed positioning, or the document overflows horizontally.
        playwright.sync_api.TimeoutError: If navigation or required selectors
            do not become available within thirty seconds.

    Side effects:
        Opens and closes a page, aborts remote HTTPS requests, scrolls fixed-nav
        routes, injects and removes temporary nested and body probes, moves the
        pointer, and optionally writes one viewport screenshot.
    """
    # Create an isolated route visit and keep remote dependencies out of the test.
    page: Page = browser.new_page(
        viewport={"width": viewport["width"], "height": viewport["height"]}
    )
    page.route("https://**", lambda route: route.abort())
    page.goto(
        f"{url_root}{route_specification['route']}",
        wait_until="networkidle",
        timeout=30_000,
    )
    for selector_name in (
        "navigation_root",
        "navigation_surface",
        "navigation_marker",
        "effect_layer",
        "content_root",
    ):
        page.locator(route_specification[selector_name]).wait_for(state="attached")

    # Put real article content beneath fixed production navigation before probing.
    if route_specification["fixed_navigation"]:
        page.evaluate(
            "window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight - innerHeight))"
        )
        page.wait_for_timeout(120)

    # Inject maximum-z components that must remain in their assigned root layers.
    measurements = page.evaluate(
        r"""(selectors) => {
          const navigationRoot = document.querySelector(selectors.navigationRoot);
          const navigationSurface = document.querySelector(selectors.navigationSurface);
          const navigationMarker = document.querySelector(selectors.navigationMarker);
          const effectLayer = document.querySelector(selectors.effectLayer);
          const contentRoot = document.querySelector(selectors.contentRoot);
          const contentRect = contentRoot.getBoundingClientRect();
          const navigationRect = navigationSurface.getBoundingClientRect();
          const markerRect = navigationMarker.getBoundingClientRect();
          const probe = document.createElement('div');
          probe.dataset.layeringProbe = 'true';
          Object.assign(probe.style, {
            position: 'absolute',
            top: `${-contentRect.top}px`,
            left: `${-contentRect.left}px`,
            width: `${innerWidth}px`,
            height: `${innerHeight}px`,
            background: 'rgb(255 0 128)',
            pointerEvents: 'auto',
            zIndex: '2147483647',
          });
          contentRoot.append(probe);

          let bodyOverlayProbe = null;
          let openedImageProbe = null;
          if (selectors.production) {
            bodyOverlayProbe = document.createElement('div');
            bodyOverlayProbe.className = 'medium-zoom-overlay';
            bodyOverlayProbe.dataset.layeringBodyOverlayProbe = 'true';
            Object.assign(bodyOverlayProbe.style, {
              position: 'fixed',
              inset: '0',
              display: 'block',
              opacity: '1',
              background: 'rgb(0 160 255)',
              pointerEvents: 'auto',
              zIndex: '999',
            });
            document.body.append(bodyOverlayProbe);

            openedImageProbe = document.createElement('div');
            openedImageProbe.className = 'medium-zoom-image--opened';
            openedImageProbe.style.zIndex = '999';
            document.body.append(openedImageProbe);
          }

          const markerX = markerRect.left + markerRect.width / 2;
          const markerY = markerRect.top + markerRect.height / 2;
          const markerTopElement = document.elementFromPoint(markerX, markerY);
          const effectTestX = Math.min(innerWidth - 24, Math.max(24, innerWidth * 0.5));
          const effectTestY = Math.min(
            innerHeight - 24,
            Math.max(navigationRect.bottom + 32, innerHeight * 0.35)
          );
          const contentTopElement = document.elementFromPoint(effectTestX, effectTestY);
          const originalInlinePointerEvents = effectLayer.style.pointerEvents;
          effectLayer.style.pointerEvents = 'auto';
          const effectTopElement = document.elementFromPoint(effectTestX, effectTestY);
          effectLayer.style.pointerEvents = originalInlinePointerEvents;
          const restoredTopElement = document.elementFromPoint(effectTestX, effectTestY);
          const effectRect = effectLayer.getBoundingClientRect();
          const footer = selectors.production
            ? document.querySelector('.contemplative-notes-surface footer')
            : null;
          const backToTop = selectors.production
            ? document.querySelector('#back-to-top')
            : null;
          const result = {
            navigationZ: Number.parseInt(getComputedStyle(navigationRoot).zIndex, 10),
            navigationSurfaceZ: getComputedStyle(navigationSurface).zIndex,
            effectZ: Number.parseInt(getComputedStyle(effectLayer).zIndex, 10),
            contentZ: Number.parseInt(getComputedStyle(contentRoot).zIndex, 10),
            contentOverlayZ: bodyOverlayProbe
              ? Number.parseInt(getComputedStyle(bodyOverlayProbe).zIndex, 10)
              : null,
            openedImageZ: openedImageProbe
              ? Number.parseInt(getComputedStyle(openedImageProbe).zIndex, 10)
              : null,
            footerPosition: footer ? getComputedStyle(footer).position : null,
            footerZ: footer
              ? Number.parseInt(getComputedStyle(footer).zIndex, 10)
              : null,
            backToTopZ: backToTop
              ? Number.parseInt(getComputedStyle(backToTop).zIndex, 10)
              : null,
            effectPointerEvents: getComputedStyle(effectLayer).pointerEvents,
            effectPosition: getComputedStyle(effectLayer).position,
            effectWidth: effectRect.width,
            effectHeight: effectRect.height,
            viewportWidth: document.documentElement.clientWidth,
            viewportHeight: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            markerTopElement: markerTopElement?.tagName || null,
            navigationOwnsMarker: Boolean(
              markerTopElement && navigationRoot.contains(markerTopElement)
            ),
            contentOwnsEffectPoint: selectors.production
              ? contentTopElement === bodyOverlayProbe
              : contentTopElement === probe,
            effectOwnsEffectPoint: effectTopElement === effectLayer,
            restoredContentOwnsEffectPoint: selectors.production
              ? restoredTopElement === bodyOverlayProbe
              : restoredTopElement === probe,
          };
          openedImageProbe?.remove();
          bodyOverlayProbe?.remove();
          probe.remove();
          return result;
        }""",
        {
            "navigationRoot": route_specification["navigation_root"],
            "navigationSurface": route_specification["navigation_surface"],
            "navigationMarker": route_specification["navigation_marker"],
            "effectLayer": route_specification["effect_layer"],
            "contentRoot": route_specification["content_root"],
            "production": route_specification["production"],
        },
    )

    # Enforce the shared paint order and input-safety invariants numerically.
    assert measurements["contentZ"] < measurements["effectZ"], measurements
    if route_specification["production"]:
        assert measurements["contentZ"] < measurements["contentOverlayZ"], measurements
        assert measurements["contentOverlayZ"] < measurements["effectZ"], measurements
        assert measurements["openedImageZ"] == measurements["contentOverlayZ"], measurements
        assert measurements["footerPosition"] == "fixed", measurements
        assert measurements["footerZ"] == measurements["navigationZ"], measurements
        assert measurements["backToTopZ"] == measurements["navigationZ"], measurements
    assert measurements["effectZ"] < measurements["navigationZ"], measurements
    assert measurements["effectPointerEvents"] == "none", measurements
    assert measurements["effectPosition"] == "fixed", measurements
    assert abs(measurements["effectWidth"] - measurements["viewportWidth"]) <= 0.5, measurements
    assert abs(measurements["effectHeight"] - measurements["viewportHeight"]) <= 0.5, measurements
    assert measurements["navigationOwnsMarker"], measurements
    assert measurements["contentOwnsEffectPoint"], measurements
    assert measurements["effectOwnsEffectPoint"], measurements
    assert measurements["restoredContentOwnsEffectPoint"], measurements
    assert measurements["documentWidth"] == measurements["viewportWidth"], measurements

    # Capture representative real pages with the pointer effect active after probing.
    screenshot_path: Path | None = None
    if route_specification["capture"]:
        page.mouse.move(viewport["width"] * 0.35, viewport["height"] * 0.55)
        page.mouse.move(viewport["width"] * 0.62, viewport["height"] * 0.45, steps=8)
        page.wait_for_timeout(180)
        screenshot_path = artifacts / (
            f"layering-{route_specification['name']}-{viewport['name']}.png"
        )
        page.screenshot(path=str(screenshot_path), full_page=False)
    page.close()

    # Attach route identity and optional evidence path to the measurement record.
    measurements.update(
        {
            "page": route_specification["name"],
            "viewport": viewport["name"],
            "screenshot": str(screenshot_path) if screenshot_path else None,
        }
    )
    return measurements


def main() -> None:
    """Run the cross-route desktop/mobile layering matrix and print JSON.

    Returns:
        ``None``. Successful measurements are emitted to standard output.

    Raises:
        AssertionError: If any route or viewport violates the stacking contract.
        Playwright errors: If Chrome cannot launch or a route cannot load.

    Side effects:
        Launches system Chrome headlessly, visits sixteen local route/viewport
        combinations, writes six screenshots, and prints one JSON report.
    """
    # Parse all machine inputs before starting the shared browser session.
    arguments = _parse_arguments()
    results: list[dict[str, Any]] = []

    # Exercise every active prototype and both production article renderers.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(arguments.chrome),
            headless=True,
        )
        for route_specification in ROUTE_SPECIFICATIONS:
            for viewport in VIEWPORTS:
                results.append(
                    _inspect_route(
                        browser,
                        arguments.url_root,
                        arguments.artifacts,
                        route_specification,
                        viewport,
                    )
                )
        browser.close()

    # Emit concise machine-readable evidence for CI logs and handoff.
    print(json.dumps({"status": "passed", "results": results}, indent=2))


if __name__ == "__main__":
    main()
