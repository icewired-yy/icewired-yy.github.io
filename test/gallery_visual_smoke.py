"""Browser smoke test for the generated Gallery and homepage synchronization.

The test targets a completed Jekyll `_site` served over HTTP. It supports both
the intentional empty archive and a populated fixture build, and uses the
system Chrome executable instead of downloading a browser.
"""

from __future__ import annotations

import argparse
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from playwright.sync_api import Browser, Page, Route, sync_playwright


VIEWPORTS = (
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "mobile", "width": 390, "height": 844},
)
HOME_SLOTS = {"photo-wide", "photo-tall", "photo-small", "photo-long"}


def _parse_arguments() -> argparse.Namespace:
    """Parse browser, server, output, and expected-content arguments.

    Returns:
        An ``argparse.Namespace`` containing a normalized URL root, an existing
        Chrome executable, a created artifact directory, and a non-negative
        expected Gallery count.

    Raises:
        SystemExit: If an argument is missing, the browser does not exist, or
            ``expected_count`` is negative.

    Side effects:
        Creates the artifact directory and missing parents.
    """
    # Collect explicit runtime paths so the smoke remains environment-independent.
    parser = argparse.ArgumentParser(
        description="Validate production Gallery rendering and homepage synchronization."
    )
    parser.add_argument("--url-root", required=True)
    parser.add_argument("--chrome", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--expected-count", type=int, default=0)
    parser.add_argument(
        "--site-root",
        type=Path,
        help="Optional generated _site directory served through Playwright routing.",
    )
    arguments = parser.parse_args()

    # Normalize and validate inputs before opening a browser process.
    arguments.url_root = arguments.url_root.rstrip("/")
    if not arguments.chrome.is_file():
        parser.error(f"Chrome executable does not exist: {arguments.chrome}")
    if arguments.expected_count < 0:
        parser.error("--expected-count must be non-negative")
    if arguments.site_root is not None:
        arguments.site_root = arguments.site_root.resolve()
        if not arguments.site_root.is_dir():
            parser.error(f"Generated site directory does not exist: {arguments.site_root}")
    arguments.artifacts.mkdir(parents=True, exist_ok=True)

    # Return one complete configuration object to the test runner.
    return arguments


def _attach_error_capture(page: Page) -> list[str]:
    """Attach console and uncaught-page error listeners.

    Args:
        page: Newly created Playwright page. It must be open; ``None`` is not
            accepted. Existing listeners are preserved.

    Returns:
        A mutable list that receives formatted error messages for the lifetime
        of ``page``.

    Side effects:
        Registers two Playwright event handlers on ``page``.
    """
    # Store both browser-console and uncaught JavaScript failures in one trace.
    errors: list[str] = []
    page.on("console", lambda message: _capture_console_error(message, errors))
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))

    # Return the live list so callers can assert after navigation settles.
    return errors


def _capture_console_error(message: Any, errors: list[str]) -> None:
    """Record actionable console errors while ignoring deliberate CDN stubs.

    Args:
        message: Playwright console message with ``type`` and ``text`` values.
        errors: Mutable error list owned by the current page.

    Returns:
        ``None``.

    Side effects:
        Appends one formatted error to ``errors`` unless the message is a known
        integrity/network consequence of deterministic third-party stubbing.
    """
    # Ignore non-errors and expected SRI failures for intentionally empty CDN bodies.
    if message.type != "error":
        return
    ignored_prefixes = (
        "Failed to find a valid digest in the 'integrity' attribute",
        "Failed to load resource: net::ERR_FAILED",
    )
    if message.text.startswith(ignored_prefixes):
        return

    # Preserve every authored or local runtime error for the viewport assertion.
    errors.append(f"console: {message.text}")


def _install_static_site_route(page: Page, url_root: str, site_root: Path | None) -> None:
    """Install deterministic generated-site and third-party request routing.

    Args:
        page: Open Playwright page receiving the route handlers.
        url_root: Synthetic or real HTTP origin used for navigation. It must
            have a scheme and host and must not end in a slash.
        site_root: Optional generated Jekyll directory. When ``None``, matching
            local requests continue to a real HTTP server; otherwise files are
            fulfilled directly from this directory.

    Returns:
        ``None``.

    Raises:
        ValueError: If a local URL resolves outside ``site_root``. The handler
            converts missing files into HTTP 404 rather than raising.

    Side effects:
        Adds an initialization script and a catch-all request route to ``page``.
    """
    # Supply the minimal jQuery surface used by inline legacy layout scripts.
    page.add_init_script(
        """
        (() => {
          const stub = () => stub;
          stub.outerHeight = () => 0;
          stub.scrollTop = () => 0;
          stub.height = () => document.documentElement.scrollHeight;
          stub.width = () => document.documentElement.scrollWidth;
          stub.hasClass = () => false;
          stub.ready = () => stub;
          stub.fn = { jquery: '3.6.0' };
          for (const method of ['css', 'attr', 'on', 'collapse', 'remove']) stub[method] = () => stub;
          window.$ = stub;
          window.jQuery = stub;
        })();
        """
    )

    # Keep generated resources real while neutralizing unavailable third-party CDNs.
    local_origin = urlparse(url_root)
    legacy_script_paths = {
        "/assets/js/bootstrap.bundle.min.js",
        "/assets/js/common.js",
        "/assets/js/jupyter_new_tab.js",
        "/assets/js/masonry.js",
        "/assets/js/no_defer.js",
        "/assets/js/zoom.js",
    }

    def route_request(route: Route) -> None:
        """Fulfill one browser request from generated files or safe stubs.

        Args:
            route: Playwright route whose request has not yet been handled.

        Returns:
            ``None``.

        Raises:
            ValueError: If a local request attempts to escape ``site_root``.

        Side effects:
            Continues, fulfills, or aborts exactly one browser request.
        """
        # Classify the request by origin before touching local filesystem paths.
        request = route.request
        parsed = urlparse(request.url)
        is_local = parsed.scheme == local_origin.scheme and parsed.netloc == local_origin.netloc
        if not is_local:
            if request.resource_type == "script":
                route.fulfill(status=200, content_type="application/javascript", body="void 0;")
            elif request.resource_type == "stylesheet":
                route.fulfill(status=200, content_type="text/css", body="")
            else:
                route.abort()
            return

        # Continue local requests when the caller supplied a real server.
        if site_root is None:
            route.continue_()
            return

        # Neutralize only legacy local scripts that depend on full jQuery plugins.
        pathname = unquote(parsed.path)
        if pathname in legacy_script_paths:
            route.fulfill(status=200, content_type="application/javascript", body="void 0;")
            return

        # Resolve directory routes to index.html and enforce root containment.
        relative_request = pathname.lstrip("/")
        if not relative_request or pathname.endswith("/"):
            relative_request = f"{relative_request}index.html"
        file_path = (site_root / relative_request).resolve()
        if not file_path.is_relative_to(site_root):
            raise ValueError(f"Request escaped generated site root: {pathname}")
        if not file_path.is_file():
            route.fulfill(status=404, content_type="text/plain", body="Not found")
            return

        # Serve exact generated bytes with a browser-appropriate content type.
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        route.fulfill(status=200, content_type=content_type, body=file_path.read_bytes())

    # Intercept before navigation so the first document follows the same policy.
    page.route("**/*", route_request)


def _assert_gallery_page(page: Page, expected_count: int) -> set[str]:
    """Validate the archive DOM, image contract, ordering, and root layers.

    Args:
        page: Playwright page already navigated to generated ``/gallery/`` and
            settled at ``networkidle``.
        expected_count: Exact number of published Gallery records expected in
            the build. Zero exercises the designed empty state.

    Returns:
        A set of absolute image source URLs rendered by archive cards.

    Raises:
        AssertionError: If collection counts, semantics, image attributes,
            chronological order, overflow, or stacking contracts differ.

    Side effects:
        Reads computed DOM state but does not alter persistent page content.
    """
    # Confirm the server rendered the exact collection count into source and DOM.
    gallery_root = page.locator(".gallery-page")
    assert gallery_root.get_attribute("data-gallery-count") == str(expected_count)
    cards = page.locator(".gallery-card")
    assert cards.count() == expected_count

    # Exercise either the deliberate empty state or every published image contract.
    if expected_count == 0:
        assert page.locator(".gallery-empty").count() == 1
        image_sources: set[str] = set()
    else:
        assert page.locator(".gallery-empty").count() == 0
        assert page.locator(".gallery-card figure").count() == 0, "Gallery cards must not nest figures"
        images = page.locator(".gallery-card img")
        image_sources = set()
        for index in range(images.count()):
            image = images.nth(index)
            assert image.get_attribute("alt")
            assert int(image.get_attribute("width") or "0") > 0
            assert int(image.get_attribute("height") or "0") > 0
            image_sources.add(
                image.evaluate(
                    "element => new URL(element.getAttribute('src'), document.baseURI).href"
                )
            )
        assert images.first.get_attribute("loading") == "eager"
        assert images.first.get_attribute("fetchpriority") == "high"
        for index in range(1, images.count()):
            assert images.nth(index).get_attribute("loading") == "lazy"

    # Preserve chronological semantics and the shared effects-layer contract.
    years = page.locator(".gallery-year > .gallery-year__heading h2").all_text_contents()
    assert years == sorted(years, reverse=True)
    layers: dict[str, Any] = page.evaluate(
        """
        () => {
          const numericZ = selector => Number.parseInt(getComputedStyle(document.querySelector(selector)).zIndex, 10);
          return {
            header: numericZ('.notes-site-header'),
            canvas: numericZ('#light-field'),
            content: numericZ('.contemplative-notes-main'),
            canvasPointerEvents: getComputedStyle(document.querySelector('#light-field')).pointerEvents,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          };
        }
        """
    )
    assert layers["header"] > layers["canvas"] > layers["content"]
    assert layers["canvasPointerEvents"] == "none"
    assert layers["documentWidth"] == layers["viewportWidth"]

    # Return archive identities for the homepage single-source comparison.
    return image_sources


def _assert_homepage(page: Page, expected_count: int, gallery_sources: set[str]) -> None:
    """Validate that homepage preview identities come from the Gallery source.

    Args:
        page: Playwright page already navigated to generated ``/`` and settled
            at ``networkidle``.
        expected_count: Number of published Gallery records in the build.
            The fixture contract expects four slots only when this value is at
            least four; the empty archive expects no preview.
        gallery_sources: Absolute image URLs collected from the Gallery page.

    Returns:
        ``None``.

    Raises:
        AssertionError: If an empty collection leaks a preview, a populated
            fixture lacks slots, identities differ, or the page overflows.

    Side effects:
        Reads DOM state without mutation.
    """
    # Require all four visual slots together; never render a sparse composition.
    preview = page.locator(".gallery-home-preview")
    if expected_count == 0:
        assert preview.count() == 0
    else:
        assert preview.count() == 1
        figures = preview.locator(".photo-rhythm > figure")
        assert figures.count() == 4
        classes = {
            (figures.nth(index).get_attribute("class") or "").strip()
            for index in range(figures.count())
        }
        assert classes == HOME_SLOTS
        home_sources = {
            figures.nth(index)
            .locator("img")
            .evaluate("element => new URL(element.getAttribute('src'), document.baseURI).href")
            for index in range(figures.count())
        }
        assert home_sources.issubset(gallery_sources), (home_sources, gallery_sources)

    # Ensure the optional section cannot force the legacy homepage wider.
    widths = page.evaluate(
        "() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth })"
    )
    assert widths["document"] == widths["viewport"]


def _load_lazy_images(page: Page, selector: str) -> None:
    """Bring matching images through the viewport and wait for decode state.

    Args:
        page: Open Playwright page with its document already settled.
        selector: CSS selector matching zero or more ``img`` elements. Empty
            strings are invalid caller input and will surface as Playwright
            selector errors.

    Returns:
        ``None``.

    Raises:
        PlaywrightError: If scrolling or selector evaluation fails.

    Side effects:
        Scrolls the document through each lazy image, waits briefly for browser
        scheduling, then returns to the top before screenshots are captured.
    """
    # Visit each lazy image in DOM order so the browser issues its local request.
    images = page.locator(selector)
    for index in range(images.count()):
        images.nth(index).scroll_into_view_if_needed()
        page.wait_for_timeout(35)

    # Wait until every requested image has either decoded or exposed a failure.
    page.wait_for_function(
        "selector => Array.from(document.querySelectorAll(selector)).every(image => image.complete)",
        arg=selector,
    )
    page.evaluate("window.scrollTo(0, 0)")


def _run_viewport(browser: Browser, arguments: argparse.Namespace, viewport: dict[str, int | str]) -> None:
    """Run Gallery and homepage assertions at one viewport.

    Args:
        browser: Open Playwright Chromium browser.
        arguments: Validated arguments returned by ``_parse_arguments``.
        viewport: Mapping with string ``name`` and positive integer ``width``
            and ``height`` values.

    Returns:
        ``None``.

    Raises:
        AssertionError: If either route or browser console violates a contract.

    Side effects:
        Opens two pages, performs HTTP requests, writes two screenshots, and
        closes the pages before returning.
    """
    # Test the chronological archive first and retain its rendered identities.
    gallery_page = browser.new_page(
        viewport={"width": int(viewport["width"]), "height": int(viewport["height"])}
    )
    _install_static_site_route(gallery_page, arguments.url_root, arguments.site_root)
    gallery_errors = _attach_error_capture(gallery_page)
    gallery_page.goto(f"{arguments.url_root}/gallery/", wait_until="networkidle")
    gallery_sources = _assert_gallery_page(gallery_page, arguments.expected_count)
    _load_lazy_images(gallery_page, ".gallery-card img")
    gallery_page.screenshot(
        path=arguments.artifacts / f"gallery-sync-{viewport['name']}-archive.png",
        full_page=True,
    )
    assert gallery_errors == [], gallery_errors
    gallery_page.close()

    # Test the homepage preview against the same image identities.
    home_page = browser.new_page(
        viewport={"width": int(viewport["width"]), "height": int(viewport["height"])}
    )
    _install_static_site_route(home_page, arguments.url_root, arguments.site_root)
    home_errors = _attach_error_capture(home_page)
    home_page.goto(f"{arguments.url_root}/", wait_until="networkidle")
    _assert_homepage(home_page, arguments.expected_count, gallery_sources)
    _load_lazy_images(home_page, ".gallery-home-preview img")
    home_page.screenshot(
        path=arguments.artifacts / f"gallery-sync-{viewport['name']}-home.png",
        full_page=True,
    )
    assert home_errors == [], home_errors
    home_page.close()


def main() -> None:
    """Launch Chrome and execute the bounded desktop/mobile Gallery smoke.

    Returns:
        ``None``. Successful completion is communicated by process exit zero.

    Raises:
        AssertionError: If any rendering, synchronization, responsive, layer,
            or browser-error assertion fails.

    Side effects:
        Starts one headless Chrome process and writes four screenshots.
    """
    # Validate command-line state before allocating the browser process.
    arguments = _parse_arguments()

    # Run the two required viewport classes in one bounded browser session.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(arguments.chrome),
            headless=True,
        )
        try:
            for viewport in VIEWPORTS:
                _run_viewport(browser, arguments, viewport)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
