"""Browser regression for the generated contemplative production routes.

The smoke runs against a completed Jekyll ``_site`` served over HTTP. It keeps
third-party CDNs deterministic, exercises the shared navigation/effect shell at
desktop and mobile widths, and verifies that each route still exposes content
from its original Jekyll data source.
"""

from __future__ import annotations

import argparse
from datetime import date
import mimetypes
from pathlib import Path
import re
from typing import Any
from urllib.parse import unquote, urlparse

from playwright.sync_api import Browser, Page, Route, sync_playwright


VIEWPORTS = (
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "mobile", "width": 390, "height": 844},
)

ROUTES = (
    {
        "name": "home",
        "path": "/",
        "root": ".contemplative-home",
        "current": None,
        "font": "Times New Roman",
    },
    {
        "name": "research",
        "path": "/publications/",
        "root": ".research-page",
        "current": "/publications/",
        "font": "Times New Roman",
    },
    {
        "name": "projects",
        "path": "/projects/",
        "root": ".projects-page",
        "current": "/projects/",
        "font": "Times New Roman",
    },
    {
        "name": "news",
        "path": "/news/",
        "root": ".news-page",
        "current": "/news/",
        "font": "Times New Roman",
    },
    {
        "name": "notes",
        "path": "/blog/",
        "root": ".notes-index",
        "current": "/blog/",
        "font": "Libertinus Sans",
    },
    {
        "name": "gallery",
        "path": "/gallery/",
        "root": ".gallery-page",
        "current": "/gallery/",
        "font": "Times New Roman",
    },
    {
        "name": "cv",
        "path": "/cv/",
        "root": ".contemplative-cv",
        "current": "/cv/",
        "font": "Times New Roman",
    },
)

EXPECTED_NAVIGATION_HREFS = {
    "/publications/",
    "/projects/",
    "/news/",
    "/blog/",
    "/gallery/",
    "/cv/",
}
LIBERTINUS_ASSET_PATHS = {
    "/assets/fonts/libertinus-sans-regular.ttf",
    "/assets/fonts/libertinus-sans-bold.ttf",
    "/assets/fonts/libertinus-sans-italic.ttf",
}


def _parse_arguments() -> argparse.Namespace:
    """Parse and validate the local server, browser, and artifact arguments.

    Returns:
        Namespace with a normalized ``url_root``, an existing Chrome path, and
        a writable artifact directory.

    Raises:
        SystemExit: If a required argument is missing or Chrome does not exist.

    Side effects:
        Creates the artifact directory and missing parents.
    """
    # Collect machine-specific paths explicitly so CI and Windows can share the test.
    parser = argparse.ArgumentParser(
        description="Validate the generated contemplative production site."
    )
    parser.add_argument("--url-root", required=True)
    parser.add_argument("--chrome", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--site-root", type=Path, required=True)
    arguments = parser.parse_args()

    # Normalize all paths before a browser process is allocated.
    arguments.url_root = arguments.url_root.rstrip("/")
    if not arguments.chrome.is_file():
        parser.error(f"Chrome executable does not exist: {arguments.chrome}")
    arguments.site_root = arguments.site_root.resolve()
    if not arguments.site_root.is_dir():
        parser.error(f"Generated site directory does not exist: {arguments.site_root}")
    arguments.artifacts.mkdir(parents=True, exist_ok=True)

    # Return one complete runtime configuration to the test runner.
    return arguments


def _read_front_matter_text(source_path: Path) -> str:
    """Read and isolate one UTF-8 Markdown document's YAML front matter.

    Args:
        source_path: Existing Markdown path whose first document is delimited by
            ``---`` lines. The path must not be ``None``.

    Returns:
        Front-matter text without either delimiter.

    Raises:
        AssertionError: If the file does not begin with delimited front matter.
        OSError: If the file cannot be read.

    Side effects:
        Reads one repository file without modifying it.
    """
    # Isolate metadata so body text can never satisfy configuration patterns.
    source_text = source_path.read_text(encoding="utf-8")
    front_matter_match = re.match(r"\A---\s*\r?\n(.*?)\r?\n---", source_text, re.DOTALL)
    assert front_matter_match is not None, f"{source_path}: missing front matter"
    return front_matter_match.group(1)


def _load_news_contract(site_root: Path) -> dict[str, Any]:
    """Derive the rendered News counts and order from repository source data.

    Args:
        site_root: Existing generated ``_site`` directory whose parent is the
            repository root. The path must not be ``None``.

    Returns:
        Mapping containing all public News dates in descending ISO order and
        the homepage prefix selected by ``announcements.limit``.

    Raises:
        AssertionError: If configuration, News front matter, or a date is
            missing or malformed.

    Side effects:
        Reads ``_config.yml`` and ``_news/*.md`` without modifying them.
    """
    # Read the homepage limit from the bounded announcements configuration block.
    repository_root = site_root.parent
    configuration_path = repository_root / "_config.yml"
    configuration_lines = configuration_path.read_text(encoding="utf-8").splitlines()
    announcement_limit: int | None = None
    inside_announcements = False
    for configuration_line in configuration_lines:
        if configuration_line.strip() == "announcements:":
            inside_announcements = True
            continue
        if inside_announcements and configuration_line and not configuration_line[0].isspace():
            break
        if inside_announcements:
            limit_match = re.match(r"^\s+limit:\s*(\d+)\b", configuration_line)
            if limit_match:
                announcement_limit = int(limit_match.group(1))
                break
    assert announcement_limit is not None and announcement_limit >= 0, (
        "_config.yml must define a non-negative announcements.limit"
    )

    # Parse only public collection records and normalize their dates like Jekyll.
    news_dates: list[str] = []
    for news_path in sorted((repository_root / "_news").glob("*.md")):
        front_matter_text = _read_front_matter_text(news_path)
        if re.search(r"^published:\s*false\b", front_matter_text, re.MULTILINE | re.IGNORECASE):
            continue
        date_match = re.search(
            r"^date:\s*(\d{4})-(\d{1,2})-(\d{1,2})\b",
            front_matter_text,
            re.MULTILINE,
        )
        assert date_match is not None, f"{news_path}: missing YYYY-M-D date"
        year, month, day = (int(component) for component in date_match.groups())
        news_dates.append(date(year, month, day).isoformat())

    # Mirror the production newest-first archive and bounded homepage preview.
    news_dates.sort(reverse=True)
    assert news_dates, "_news must contain at least one public record"
    return {
        "archive_dates": news_dates,
        "home_dates": news_dates[:announcement_limit],
        "home_limit": announcement_limit,
    }


def _load_notes_contract(site_root: Path) -> dict[str, int]:
    """Derive Notes index and homepage counts from source front matter.

    Args:
        site_root: Existing generated ``_site`` directory whose parent is the
            repository root. The path must not be ``None``.

    Returns:
        Mapping containing the public Post count, first paginator-page count,
        and bounded homepage-preview count.

    Raises:
        AssertionError: If either required positive integer limit is absent or
            malformed, or if no public Post exists.

    Side effects:
        Reads ``_posts/*.md``, ``_pages/blog.md``, and ``_pages/about.md``
        without modifying them.
    """
    # Count only records Jekyll is allowed to publish from the Posts collection.
    repository_root = site_root.parent
    public_post_count = 0
    for post_path in sorted((repository_root / "_posts").glob("*.md")):
        front_matter_text = _read_front_matter_text(post_path)
        if not re.search(
            r"^published:\s*false\b",
            front_matter_text,
            re.MULTILINE | re.IGNORECASE,
        ):
            public_post_count += 1
    assert public_post_count > 0, "_posts must contain at least one public Post"

    # Read the first-page paginator bound from the Notes page's nested metadata.
    blog_front_matter = _read_front_matter_text(repository_root / "_pages" / "blog.md")
    pagination_match = re.search(
        r"^pagination:\s*\r?\n(?P<body>(?:^[ \t]+.*(?:\r?\n|$))*)",
        blog_front_matter,
        re.MULTILINE,
    )
    assert pagination_match is not None, "_pages/blog.md: missing pagination block"
    per_page_match = re.search(
        r"^\s+per_page:\s*(\d+)\b",
        pagination_match.group("body"),
        re.MULTILINE,
    )
    assert per_page_match is not None, "_pages/blog.md: missing pagination.per_page"
    posts_per_page = int(per_page_match.group(1))
    assert posts_per_page > 0, "pagination.per_page must be positive"

    # Read the independent homepage Notes preview limit from About front matter.
    about_front_matter = _read_front_matter_text(repository_root / "_pages" / "about.md")
    preview_match = re.search(
        r"^notes_preview_limit:\s*(\d+)\b",
        about_front_matter,
        re.MULTILINE,
    )
    assert preview_match is not None, "_pages/about.md: missing notes_preview_limit"
    preview_limit = int(preview_match.group(1))
    assert preview_limit > 0, "notes_preview_limit must be positive"

    # Mirror the paginator and homepage bounds without freezing content volume.
    return {
        "public_post_count": public_post_count,
        "index_count": min(public_post_count, posts_per_page),
        "home_count": min(public_post_count, preview_limit),
    }


def _capture_console_error(message: Any, errors: list[str]) -> None:
    """Append actionable browser-console errors to the current route trace.

    Args:
        message: Playwright console message. Only ``error`` messages are read.
        errors: Mutable list owned by the current page visit.

    Returns:
        ``None``.

    Side effects:
        Appends one formatted message unless it is an expected SRI consequence
        of replacing a remote CDN response with a deterministic empty body.
    """
    # Ignore informational console traffic and known integrity warnings from stubs.
    if message.type != "error":
        return
    ignored_prefixes = (
        "Failed to find a valid digest in the 'integrity' attribute",
        "Failed to load resource: net::ERR_FAILED",
    )
    if message.text.startswith(ignored_prefixes):
        return

    # Preserve authored/local errors verbatim for the route assertion.
    errors.append(f"console: {message.text}")


def _capture_local_response(
    response: Any,
    url_root: str,
    errors: list[str],
    font_responses: list[dict[str, Any]],
) -> None:
    """Capture failed local responses and successful local font requests.

    Args:
        response: Playwright response emitted by the inspected page.
        url_root: Non-empty local origin without a trailing slash.
        errors: Mutable route-owned error list; local HTTP failures are appended.
        font_responses: Mutable list receiving local ``/assets/fonts/`` paths
            and their integer HTTP statuses.

    Returns:
        ``None``.

    Side effects:
        Appends diagnostics to one or both mutable lists without changing the
        response or browser page.
    """
    # Ignore deterministic remote stubs while retaining every local failure.
    parsed_response = urlparse(response.url)
    parsed_root = urlparse(url_root)
    is_local = (
        parsed_response.scheme == parsed_root.scheme
        and parsed_response.netloc == parsed_root.netloc
    )
    if not is_local:
        return
    if response.status >= 400:
        errors.append(f"response {response.status}: {response.url}")

    # Record only font assets so typography assertions stay independent of icons.
    if parsed_response.path.startswith("/assets/fonts/"):
        font_responses.append(
            {"path": parsed_response.path, "status": response.status}
        )


def _install_deterministic_routes(page: Page, url_root: str, site_root: Path) -> None:
    """Keep local production assets real while neutralizing remote dependencies.

    Args:
        page: Open Playwright page that has not navigated yet.
        url_root: Local HTTP origin without a trailing slash.
        site_root: Existing generated Jekyll directory. Requests are resolved
            beneath this directory and may not escape it.

    Returns:
        ``None``.

    Side effects:
        Installs a minimal jQuery-compatible initialization stub and a catch-all
        request handler. Generated files are fulfilled directly, selected
        legacy scripts are replaced with ``void 0``, and remote scripts/styles
        receive empty successful responses.
    """
    # Supply only the jQuery methods used by generated inline al-folio scripts.
    page.add_init_script(
        """
        (() => {
          const stub = () => stub;
          stub.outerHeight = () => 72;
          stub.scrollTop = () => window.scrollY;
          stub.height = () => document.documentElement.scrollHeight;
          stub.width = () => document.documentElement.scrollWidth;
          stub.hasClass = () => false;
          stub.ready = callback => { if (callback) callback(); return stub; };
          stub.fn = { jquery: '3.6.0' };
          for (const method of ['css', 'attr', 'on', 'collapse', 'remove']) stub[method] = () => stub;
          window.$ = stub;
          window.jQuery = stub;
        })();
        """
    )

    # Classify each request by origin and retain authored CSS/effect JavaScript.
    local_origin = urlparse(url_root)
    legacy_script_paths = {
        "/assets/js/bootstrap.bundle.min.js",
        "/assets/js/common.js",
        "/assets/js/copy_code.js",
        "/assets/js/jupyter_new_tab.js",
        "/assets/js/masonry.js",
        "/assets/js/no_defer.js",
        "/assets/js/zoom.js",
    }

    def route_request(route: Route) -> None:
        """Resolve one request according to the deterministic browser policy.

        Args:
            route: Unhandled Playwright route for the current page.

        Returns:
            ``None``.

        Side effects:
            Continues or fulfills exactly one browser request.
        """
        # Serve every generated local resource directly from the completed build.
        request = route.request
        parsed = urlparse(request.url)
        is_local = parsed.scheme == local_origin.scheme and parsed.netloc == local_origin.netloc
        if is_local:
            if parsed.path in legacy_script_paths:
                route.fulfill(status=200, content_type="application/javascript", body="void 0;")
                return

            relative_request = unquote(parsed.path).lstrip("/")
            if not relative_request or parsed.path.endswith("/"):
                relative_request = f"{relative_request}index.html"
            file_path = (site_root / relative_request).resolve()
            if not file_path.is_relative_to(site_root):
                route.fulfill(status=403, content_type="text/plain", body="Forbidden")
                return
            if not file_path.is_file():
                route.fulfill(status=404, content_type="text/plain", body="Not found")
                return

            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            route.fulfill(status=200, content_type=content_type, body=file_path.read_bytes())
            return

        # Fulfill remote executable resources without making the test network-dependent.
        if request.resource_type == "script":
            route.fulfill(status=200, content_type="application/javascript", body="void 0;")
        elif request.resource_type == "stylesheet":
            route.fulfill(status=200, content_type="text/css", body="")
        else:
            route.fulfill(status=204, body="")

    # Intercept before the first navigation so all pages share the same policy.
    page.route("**/*", route_request)


def _assert_shared_surface(
    page: Page,
    route_specification: dict[str, Any],
    viewport_name: str,
    font_responses: list[dict[str, Any]],
) -> dict[str, Any]:
    """Validate navigation, canvas, input safety, overflow, and active-route state.

    Args:
        page: Settled production page containing the requested route root.
        route_specification: Mapping with ``root``, requested primary ``font``,
            and optional ``current`` href.
        viewport_name: Either ``desktop`` or ``mobile`` for overflow assertions.
        font_responses: Local font response records collected since navigation.

    Returns:
        Mapping of computed geometry and layer values used in the final report.

    Raises:
        AssertionError: If shell structure, fixed-navigation translucency,
            44-pixel controls, footer contrast, root paint order, canvas sizing,
            or overflow fails.

    Side effects:
        Moves the pointer once, loads requested font variants, temporarily
        scrolls the mobile navigation, and reads DOM/computed styles.
    """
    # Activate the effect before measuring its responsive canvas allocation.
    page.mouse.move(page.viewport_size["width"] * 0.58, page.viewport_size["height"] * 0.42)
    page.wait_for_timeout(160)

    # Force every self-hosted Notes face to load so missing style files cannot hide.
    font_load_counts: list[int] = []
    if route_specification["font"] == "Libertinus Sans":
        font_load_counts = page.evaluate(
            r"""async () => {
              const probes = [
                ['400 16px "Libertinus Sans"', 'Regular typography probe'],
                ['700 16px "Libertinus Sans"', 'Bold typography probe'],
                ['italic 400 16px "Libertinus Sans"', 'Italic typography probe'],
              ];
              const loadedFaces = await Promise.all(
                probes.map(([font, text]) => document.fonts.load(font, text))
              );
              await document.fonts.ready;
              return loadedFaces.map(faces => faces.length);
            }"""
        )
    else:
        page.evaluate("document.fonts.ready")

    # Read all shared contract values in one browser round trip.
    measurements: dict[str, Any] = page.evaluate(
        r"""(route) => {
          const header = document.querySelector('.notes-site-header');
          const navbar = document.querySelector('.notes-navbar');
          const canvas = document.querySelector('#light-field');
          const content = document.querySelector('.contemplative-notes-main');
          const footer = document.querySelector('footer');
          const footerText = footer?.querySelector('.container');
          const backToTop = document.querySelector('#back-to-top');
          const navigationLinks = [...document.querySelectorAll('.notes-site-nav a')];
          const currentLinks = navigationLinks.filter(link => link.getAttribute('aria-current') === 'page');
          const navigation = document.querySelector('.notes-site-nav');
          const navigationBounds = navigation.getBoundingClientRect();
          const firstLinkBounds = navigationLinks[0].getBoundingClientRect();
          navigation.scrollLeft = navigation.scrollWidth;
          const lastLinkBoundsAfterScroll = navigationLinks.at(-1).getBoundingClientRect();
          const maximumNavigationScroll = navigation.scrollLeft;
          navigation.scrollLeft = 0;
          const navbarColor = getComputedStyle(navbar).backgroundColor;
          const alphaMatch = navbarColor.match(/[\d.]+/g) || [];
          const relativeLuminance = value => {
            const channels = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            const linear = channels.map(channel => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
          };
          const footerForeground = getComputedStyle(footerText).color;
          const footerBackground = getComputedStyle(footer).backgroundColor;
          const foregroundLuminance = relativeLuminance(footerForeground);
          const backgroundLuminance = relativeLuminance(footerBackground);
          return {
            bodyClasses: document.body.className,
            navCount: navigationLinks.length,
            navHrefs: navigationLinks.map(link => link.getAttribute('href')),
            currentHrefs: currentLinks.map(link => link.getAttribute('href')),
            minimumNavHeight: Math.min(...navigationLinks.map(link => link.getBoundingClientRect().height)),
            minimumNavWidth: Math.min(...navigationLinks.map(link => link.getBoundingClientRect().width)),
            navClientWidth: navigation.clientWidth,
            navScrollWidth: navigation.scrollWidth,
            navOverflowX: getComputedStyle(navigation).overflowX,
            firstLinkInitiallyVisible:
              firstLinkBounds.left >= navigationBounds.left - 1 &&
              firstLinkBounds.right <= navigationBounds.right + 1,
            lastLinkVisibleAfterScroll:
              lastLinkBoundsAfterScroll.left >= navigationBounds.left - 1 &&
              lastLinkBoundsAfterScroll.right <= navigationBounds.right + 1,
            maximumNavigationScroll,
            navbarPosition: getComputedStyle(navbar).position,
            navbarAlpha: alphaMatch.length > 3 ? Number(alphaMatch[3]) : 1,
            navbarBackdrop: getComputedStyle(navbar).backdropFilter,
            headerZ: Number.parseInt(getComputedStyle(header).zIndex, 10),
            canvasZ: Number.parseInt(getComputedStyle(canvas).zIndex, 10),
            contentZ: Number.parseInt(getComputedStyle(content).zIndex, 10),
            canvasPointerEvents: getComputedStyle(canvas).pointerEvents,
            canvasWidth: canvas.getBoundingClientRect().width,
            canvasHeight: canvas.getBoundingClientRect().height,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            rootCount: document.querySelectorAll(route.root).length,
            fontFamily: getComputedStyle(document.querySelector(route.root)).fontFamily,
            footerContrast: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
              / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
            backToTopWidth: backToTop ? Number.parseFloat(getComputedStyle(backToTop).width) : 0,
            backToTopHeight: backToTop ? Number.parseFloat(getComputedStyle(backToTop).height) : 0,
          };
        }""",
        route_specification,
    )

    # Enforce the root stacking order and responsive surface geometry.
    assert "contemplative-notes-surface" in measurements["bodyClasses"], measurements
    assert measurements["rootCount"] == 1, measurements
    assert measurements["navCount"] == 6, measurements
    assert set(measurements["navHrefs"]) == EXPECTED_NAVIGATION_HREFS, measurements
    expected_current = route_specification["current"]
    assert measurements["currentHrefs"] == ([] if expected_current is None else [expected_current])
    assert measurements["minimumNavHeight"] >= 44, measurements
    assert measurements["minimumNavWidth"] >= 44, measurements
    assert measurements["firstLinkInitiallyVisible"], measurements
    if viewport_name == "desktop":
        assert measurements["navScrollWidth"] <= measurements["navClientWidth"] + 1, measurements
    else:
        assert measurements["navOverflowX"] in {"auto", "scroll"}, measurements
        if measurements["navScrollWidth"] > measurements["navClientWidth"] + 1:
            assert measurements["maximumNavigationScroll"] > 0, measurements
        else:
            assert measurements["maximumNavigationScroll"] <= 1, measurements
        assert measurements["lastLinkVisibleAfterScroll"], measurements
    assert measurements["navbarPosition"] == "fixed", measurements
    assert 0 < measurements["navbarAlpha"] < 1, measurements
    assert measurements["navbarBackdrop"] != "none", measurements
    assert measurements["headerZ"] > measurements["canvasZ"] > measurements["contentZ"], measurements
    assert measurements["canvasPointerEvents"] == "none", measurements
    assert abs(measurements["canvasWidth"] - measurements["viewportWidth"]) <= 0.5, measurements
    assert abs(measurements["canvasHeight"] - measurements["viewportHeight"]) <= 0.5, measurements
    assert measurements["documentWidth"] == measurements["viewportWidth"], measurements
    assert measurements["footerContrast"] >= 4.5, measurements
    assert measurements["backToTopWidth"] >= 44, measurements
    assert measurements["backToTopHeight"] >= 44, measurements

    # Verify declared family priority, CJK fallback continuity, and local faces.
    first_font_family = measurements["fontFamily"].split(",", 1)[0].strip(" \"'")
    assert first_font_family == route_specification["font"], measurements
    assert "Noto Sans CJK SC" in measurements["fontFamily"], measurements
    assert "Microsoft YaHei" in measurements["fontFamily"], measurements
    normalized_font_responses = {
        response["path"]: response["status"] for response in font_responses
    }
    assert all("onest" not in path.lower() for path in normalized_font_responses), (
        normalized_font_responses
    )
    if route_specification["font"] == "Libertinus Sans":
        assert font_load_counts == [1, 1, 1], font_load_counts
        assert LIBERTINUS_ASSET_PATHS <= normalized_font_responses.keys(), (
            normalized_font_responses
        )
        assert all(
            normalized_font_responses[path] == 200
            for path in LIBERTINUS_ASSET_PATHS
        ), normalized_font_responses
    else:
        assert not any(
            "libertinus-sans" in path.lower() for path in normalized_font_responses
        ), normalized_font_responses

    # Return the trace so the caller can print concise evidence.
    return measurements


def _assert_route_content(
    page: Page,
    route_name: str,
    viewport_name: str,
    news_contract: dict[str, Any],
    notes_contract: dict[str, int],
) -> None:
    """Validate the dynamic records and route-specific approved composition.

    Args:
        page: Settled page that has passed the shared shell assertion.
        route_name: One of ``home``, ``research``, ``projects``, ``notes``,
            ``news``, ``gallery``, or ``cv``.
        viewport_name: ``desktop`` or ``mobile``; desktop additionally exercises
            the authored hover expansion.
        news_contract: Source-derived descending archive/home News date lists.
        notes_contract: Source-derived public Post and bounded preview counts.

    Returns:
        ``None``.

    Raises:
        AssertionError: If expected dynamic record counts, routes, image-side
            balance, empty-state behavior, or hover expansion differs.

    Side effects:
        On desktop home, hovers the first Research row and waits for its
        transition. No persistent page state is changed.
    """
    # Validate the identity and collection previews composed on the homepage.
    if route_name == "home":
        assert page.locator(".home-hero__portrait img").count() == 1
        assert page.locator(".publication-entry").count() == 2
        assert page.locator(".project-entry").count() == 1
        assert page.locator(".article-entry").count() == notes_contract["home_count"]
        assert page.locator(".gallery-home-preview").count() == 0
        assert page.locator(".article-entry a[href*='/blog/']").count() == notes_contract[
            "home_count"
        ]
        assert page.locator(".article-entry", has_text="论文解读").count() == 0
        home_news_dates = page.locator(
            ".home-news .news-entry time[datetime]"
        ).evaluate_all("elements => elements.map(element => element.dateTime.slice(0, 10))")
        assert home_news_dates == news_contract["home_dates"], (
            home_news_dates,
            news_contract,
        )
        assert page.locator(".home-news .news-entry").count() == len(
            news_contract["home_dates"]
        )
        assert page.locator(".home-news a[href='/news/']").count() == 1

        # Confirm Research stays image-left and Projects image-right at desktop width.
        if viewport_name == "desktop":
            research_order = page.locator(".home-research .work-item").first.evaluate(
                "element => ({ image: element.querySelector('.work-image').getBoundingClientRect().x, copy: element.querySelector('.work-content').getBoundingClientRect().x })"
            )
            project_order = page.locator(".home-projects .work-item").first.evaluate(
                "element => ({ image: element.querySelector('.work-image').getBoundingClientRect().x, copy: element.querySelector('.work-content').getBoundingClientRect().x })"
            )
            assert research_order["image"] < research_order["copy"], research_order
            assert project_order["image"] > project_order["copy"], project_order

            # Exercise the approved compact-to-focused Research transition.
            first_research = page.locator(".home-research .work-item").first
            before_height = first_research.bounding_box()["height"]
            first_research.hover()
            page.wait_for_timeout(850)
            after_height = first_research.bounding_box()["height"]
            detail_opacity = float(first_research.locator(".work-detail").evaluate("element => getComputedStyle(element).opacity"))
            assert after_height > before_height + 40, (before_height, after_height)
            assert detail_opacity > 0.9, detail_opacity
        return

    # News retains every public collection record in strict newest-first order.
    if route_name == "news":
        archive_news_dates = page.locator(
            ".news-page .news-entry time[datetime]"
        ).evaluate_all("elements => elements.map(element => element.dateTime.slice(0, 10))")
        assert archive_news_dates == news_contract["archive_dates"], (
            archive_news_dates,
            news_contract,
        )
        assert page.locator(".news-page .news-entry").count() == len(
            news_contract["archive_dates"]
        )
        return

    # Require every Research record to come from the two-entry bibliography.
    if route_name == "research":
        assert page.locator(".publication-entry").count() == 2
        assert page.locator(".publication-entry .work-detail").count() == 2
        assert page.locator(".publication-entry a[href*='face_micro_detail_synthesis']").count() >= 1
        return

    # Keep private FaYE out while preserving the public BDPT project.
    if route_name == "projects":
        assert page.locator(".project-entry").count() == 1
        assert page.locator(".project-entry a[href*='BDPT-Nori']").count() >= 1
        assert page.locator(".projects-page", has_text="FaYE-image").count() == 0
        return

    # Notes retain paginator output and internal production routes.
    if route_name == "notes":
        assert page.locator(".notes-index-entry").count() == notes_contract["index_count"]
        assert page.locator(
            ".notes-reading-time, .notes-entry-meta"
        ).count() >= notes_contract["index_count"]
        return

    # The reviewed collection is intentionally empty until the authoring flow is used.
    if route_name == "gallery":
        assert page.locator(".gallery-page").get_attribute("data-gallery-count") == "0"
        assert page.locator(".gallery-empty").count() == 1
        return

    # JSON Resume remains the current CV authority and renders four non-empty groups.
    if route_name == "cv":
        assert page.locator(".contemplative-cv").get_attribute("data-cv-source") == "resume"
        assert page.locator(".cv-section").count() == 4
        assert page.locator(".page-intro__action").count() == 0


def _inspect_route(
    browser: Browser,
    arguments: argparse.Namespace,
    route_specification: dict[str, Any],
    viewport: dict[str, Any],
    news_contract: dict[str, Any],
    notes_contract: dict[str, int],
) -> dict[str, Any]:
    """Open, validate, screenshot, and close one route/viewport combination.

    Args:
        browser: Live Chromium browser owned by the top-level runner.
        arguments: Validated CLI namespace from :func:`_parse_arguments`.
        route_specification: Route name, URL path, root selector, current href,
            and requested primary font family.
        viewport: Positive CSS-pixel width/height plus a stable artifact name.
        news_contract: Source-derived expected News dates for both public views.
        notes_contract: Source-derived expected Notes index and preview counts.

    Returns:
        Mapping of shared layer and geometry measurements.

    Raises:
        AssertionError: If navigation returns a non-200 response, browser errors
            occur, or any shared/route assertion fails.
        playwright.sync_api.TimeoutError: If the document or required root does
            not settle within thirty seconds.

    Side effects:
        Opens and closes a Playwright page, installs request interception,
        navigates, moves/possibly hovers the pointer, and writes viewport and
        optional homepage-section screenshots below ``arguments.artifacts``.
    """
    # Allocate an isolated page and attach deterministic routing/error capture.
    page = browser.new_page(viewport={"width": viewport["width"], "height": viewport["height"]})
    errors: list[str] = []
    font_responses: list[dict[str, Any]] = []
    page.on("console", lambda message: _capture_console_error(message, errors))
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.on(
        "response",
        lambda response: _capture_local_response(
            response,
            arguments.url_root,
            errors,
            font_responses,
        ),
    )
    _install_deterministic_routes(page, arguments.url_root, arguments.site_root)

    # Navigate to the generated route and wait for the dynamic shell to settle.
    response = page.goto(
        f"{arguments.url_root}{route_specification['path']}",
        wait_until="commit",
        timeout=30_000,
    )
    assert response is not None and response.status == 200, response.status if response else None
    page.locator(route_specification["root"]).wait_for(state="attached")
    page.locator("#light-field").wait_for(state="attached")
    page.wait_for_timeout(180)

    # Validate shared and route-specific behavior before capturing evidence.
    measurements = _assert_shared_surface(
        page,
        route_specification,
        viewport["name"],
        font_responses,
    )
    _assert_route_content(
        page,
        route_specification["name"],
        viewport["name"],
        news_contract,
        notes_contract,
    )
    assert errors == [], errors

    # Preserve focused desktop homepage sections before resetting the evidence viewport.
    if route_specification["name"] == "home" and viewport["name"] == "desktop":
        for section_name, selector in (
            ("research", ".home-research"),
            ("news", ".home-news"),
            ("projects", ".home-projects"),
            ("notes", ".home-notes"),
        ):
            section = page.locator(selector)
            section.scroll_into_view_if_needed()
            page.wait_for_timeout(80)
            page.screenshot(
                path=str(arguments.artifacts / f"site-home-{section_name}-desktop.png"),
                full_page=False,
            )

    # Reset interaction-driven scroll so each route screenshot documents its true entry state.
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(120)

    # Capture the entry viewport after all assertions and evidence-only section captures.
    artifact_path = arguments.artifacts / f"site-{route_specification['name']}-{viewport['name']}.png"
    page.screenshot(path=str(artifact_path), full_page=False)
    page.close()

    # Return a compact trace for the command-line report.
    measurements["route"] = route_specification["name"]
    measurements["viewport"] = viewport["name"]
    measurements["artifact"] = str(artifact_path)
    return measurements


def main() -> int:
    """Run the complete seven-route, two-viewport production browser matrix.

    Returns:
        Process status ``0`` after all fourteen visits pass. Any assertion or
        Playwright error propagates and produces a non-zero process status.

    Side effects:
        Reads News and Notes source/configuration, launches system Chrome,
        performs fourteen local HTTP visits, writes screenshots, and prints one
        concise evidence line per visit.
    """
    # Parse machine paths and derive expected dynamic News/Notes output once.
    arguments = _parse_arguments()
    news_contract = _load_news_contract(arguments.site_root)
    notes_contract = _load_notes_contract(arguments.site_root)
    results: list[dict[str, Any]] = []

    # Allocate one shared browser process for the complete responsive matrix.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(arguments.chrome),
            headless=True,
        )

        # Visit every formal route at both approved responsive checkpoints.
        for viewport in VIEWPORTS:
            for route_specification in ROUTES:
                results.append(
                    _inspect_route(
                        browser,
                        arguments,
                        route_specification,
                        viewport,
                        news_contract,
                        notes_contract,
                    )
                )
        browser.close()

    # Print stable, human-scannable evidence only after the entire matrix passes.
    for result in results:
        print(
            f"{result['route']}:{result['viewport']} "
            f"width={result['documentWidth']}/{result['viewportWidth']} "
            f"layers={result['contentZ']}<{result['canvasZ']}<{result['headerZ']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
