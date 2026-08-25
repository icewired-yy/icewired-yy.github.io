# frozen_string_literal: true

require "minitest/autorun"
require "pathname"
require "set"
require "yaml"

# Protects the formal contemplative-site migration at its source boundaries.
#
# These tests intentionally inspect Liquid, Markdown front matter, and committed
# assets rather than reimplementing Jekyll. They catch accidental replacement of
# collection-driven content with prototype copy while leaving rendered layout,
# motion, and responsive behaviour to the browser smoke suite.
class ContemplativeSiteSourceContractTest < Minitest::Test
  REPOSITORY_ROOT = Pathname.new(__dir__).parent.freeze
  FORMAL_SURFACE_PAGES = %w[about publications projects news cv].freeze
  SECTION_ASSETS = %w[
    section-shentong.png
    section-gubao.png
    section-chuanyin.png
    section-xinde.png
    section-hongchen.png
  ].freeze
  RESEARCH_TITLES = [
    "Facial Microscopic Structures Synthesis from a Single Unconstrained Image",
    "Diffusion-Guided Relighting for Single-Image SVBRDF Estimation"
  ].freeze
  PROJECT_TITLES = ["Bidirectional Path Tracing in Nori"].freeze

  # Confirms the homepage is a presentation layer over existing site data.
  #
  # @return [void]
  # @note Reads the homepage layout, profile asset, and statically named Liquid includes.
  def test_homepage_uses_dynamic_identity_and_collection_hooks
    # Expand the production homepage surface so delegated includes remain visible.
    about_front_matter = front_matter("_pages/about.md")
    assert_equal "contemplative-home", about_front_matter.fetch("layout")
    homepage_source = expanded_layout_source(about_front_matter.fetch("layout"))

    # Fail before Jekyll cache busting if the authored portrait path drifts.
    profile_image = about_front_matter.fetch("profile").fetch("image")
    profile_path = REPOSITORY_ROOT.join("assets", "img", profile_image)
    assert profile_path.file?, "Homepage portrait does not exist: #{profile_path.relative_path_from(REPOSITORY_ROOT)}"

    # Preserve authored identity, profile, contact, and every collection boundary.
    %w[page.profile.image site.email site.github_username].each do |hook|
      assert_includes homepage_source, hook
    end
    assert_match(/(?:page\.hero_name|site\.first_name)/, homepage_source)
    assert_match(/(?:page\.hero_name_zh|site\.last_name)/, homepage_source)
    assert_match(/\{%\s*bibliography\b[^%]*selected\s*=\s*true[^%]*--template\s+bib-contemplative[^%]*%\}/m, homepage_source)
    assert_includes homepage_source, "site.projects"
    assert_includes homepage_source, "site.posts"
    assert_includes homepage_source, "site.news"
    assert_includes homepage_source, "site.gallery"
    assert_match(/include\s+contemplative-news-list\.liquid/, homepage_source)
    assert_match(/include\s+gallery-preview\.liquid/, homepage_source)

    # Keep the temporary caption treatment scoped to the homepage surface.
    site_styles = source("assets/css/contemplative-site.css")
    assert_match(/\.contemplative-home\s+\.section-heading\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*gap:\s*0;/m, site_styles)
    assert_match(/\.contemplative-home\s+\.section-heading\s*>\s*p\s*\{[^}]*display:\s*none;/m, site_styles)

    # Reject prototype-only placeholders and copied content records in templates.
    refute_includes homepage_source.downcase, "images.unsplash.com"
    (RESEARCH_TITLES + PROJECT_TITLES).each do |title|
      refute_includes homepage_source, title
    end
  end

  # Confirms News is public while both views remain collection-driven.
  #
  # @return [void]
  # @note Reads News/home front matter, the shared list include, and navigation.
  def test_news_page_and_home_preview_use_the_news_collection
    # Require both public entry points to opt into the formal contemplative shell.
    news_front_matter = front_matter("_pages/news.md")
    assert_equal "/news/", news_front_matter.fetch("permalink")
    refute_equal false, news_front_matter["published"]
    assert_equal true, news_front_matter.fetch("contemplative_surface")
    assert_equal true, news_front_matter.fetch("site_surface")
    assert_equal "news", news_front_matter.fetch("nav_key")
    assert_equal true, front_matter("_pages/about.md").fetch("news")

    # Keep one shared presentation include over the original collection and limit.
    homepage_source = expanded_layout_source(front_matter("_pages/about.md").fetch("layout"))
    news_page_source = expanded_page_source("_pages/news.md")
    [homepage_source, news_page_source].each do |surface_source|
      assert_includes surface_source, "site.news"
      assert_match(/include\s+contemplative-news-list\.liquid/, surface_source)
    end
    news_list = source("_includes/contemplative-news-list.liquid")
    assert_match(/site\.news[^%\n]*\|\s*(?:sort:\s*["']date["'][^%\n]*\|\s*)?reverse/, news_list)
    assert_includes news_list, "site.announcements.limit"
    %w[date content url].each do |property|
      assert_match(/\b[a-zA-Z_][\w-]*\.#{property}\b/, news_list)
    end

    # Lock the requested reading and focus order from Notes through Gallery.
    homepage_layout = source("_layouts/contemplative-home.liquid")
    homepage_positions = [
      'class="home-section home-research"',
      'class="home-section home-projects"',
      'class="home-section home-notes"',
      'class="home-section home-news',
      "{% include gallery-preview.liquid %}"
    ].map { |marker| homepage_layout.index(marker) }
    refute_includes homepage_positions, nil
    assert_equal homepage_positions.sort, homepage_positions

    # Keep the same information order in the shared primary navigation.
    header_source = source("_includes/header.liquid")
    navigation_positions = %w[/publications/ /projects/ /blog/ /news/ /gallery/ /cv/].map do |route|
      header_source.index("'#{route}' | relative_url")
    end
    refute_includes navigation_positions, nil
    assert_equal navigation_positions.sort, navigation_positions
  end

  # Confirms Research remains generated by Jekyll Scholar with a custom view.
  #
  # @return [void]
  # @note Reads the Research page and its bibliography item layout only.
  def test_research_page_preserves_jekyll_scholar_data_loading
    # Require the public route to invoke Scholar instead of hand-authored entries.
    research_page = source("_pages/publications.md")
    assert_match(/\{%\s*bibliography\b[^%]*--template\s+bib-contemplative[^%]*%\}/m, research_page)
    RESEARCH_TITLES.each { |title| refute_includes research_page, title }

    # Require the custom item view to expose scholarly metadata and real links.
    bibliography_layout = source("_layouts/bib-contemplative.liquid")
    assert_includes bibliography_layout, "entry.title"
    assert_match(/entry\.(?:author|author_array)/, bibliography_layout)
    assert_includes bibliography_layout, "entry.preview"
    assert_includes bibliography_layout, "entry.abstract"
    assert_match(/entry\.(?:website|url|doi)/, bibliography_layout)
  end

  # Confirms Projects are collection-driven and private categories stay hidden.
  #
  # @return [void]
  # @note Expands only includes referenced by the formal Projects page.
  def test_projects_page_filters_the_projects_collection
    # Retain the established public category allowlist in front matter.
    project_front_matter = front_matter("_pages/projects.md")
    assert_equal %w[Rendering fun], project_front_matter.fetch("display_categories")
    project_source = expanded_page_source("_pages/projects.md")

    # Enforce stable ordering plus either allowlist or explicit private filtering.
    assert_includes project_source, "site.projects"
    assert_match(/sort:\s*[\"']importance[\"']/, project_source)
    filtering_contract = project_source.include?("display_categories") && project_source.match?(/where:\s*[\"']category[\"']/)
    filtering_contract ||= project_source.match?(/(?:category\s*!=|unless\s+[^%]*category\s*==)\s*[\"']private[\"']/)
    assert filtering_contract, "Projects must filter by the public category allowlist or explicitly exclude private entries"
    PROJECT_TITLES.each { |title| refute_includes project_source, title }
  end

  # Confirms the homepage Notes preview follows the newest post URLs.
  #
  # @return [void]
  # @note Reads the homepage layout and its statically named Liquid includes.
  def test_homepage_notes_preview_uses_recent_posts_and_real_routes
    # Resolve the same homepage surface used by Jekyll.
    homepage_layout = front_matter("_pages/about.md").fetch("layout")
    homepage_source = expanded_layout_source(homepage_layout)

    # Require a bounded latest-post loop and route generation from each record.
    assert_includes homepage_source, "site.posts"
    bounded_loop = homepage_source.match?(
      /(?:limit:\s*(?:\d+|page\.notes_preview_limit|site\.latest_posts\.limit)|slice:\s*0\s*,\s*(?:\d+|page\.notes_preview_limit))/
    )
    bounded_loop ||= homepage_source.include?("include.limit | default:") &&
      homepage_source.match?(/\w+_count\s*<\s*\w+_limit/)
    assert bounded_loop, "Notes preview must enforce its configured maximum"
    assert_match(/post\.url\s*\|\s*relative_url/, homepage_source)
    assert_includes homepage_source, "'/blog/' | relative_url"
  end

  # Confirms Gallery archive and homepage preview share the managed collection.
  #
  # @return [void]
  # @note Reads Gallery page/configuration and the homepage preview include.
  def test_gallery_remains_a_single_dynamic_pipeline
    # Keep the collection metadata-only and render only reviewed public records.
    configuration = YAML.safe_load(source("_config.yml"), aliases: true)
    assert_equal false, configuration.dig("collections", "gallery", "output")
    gallery_page = source("_pages/gallery.md")
    gallery_preview = source("_includes/gallery-preview.liquid")
    [gallery_page, gallery_preview].each do |gallery_source|
      assert_includes gallery_source, "site.gallery"
      assert_match(/where:\s*[\"']published[\"']\s*,\s*true/, gallery_source)
    end

    # Render the homepage composition atomically from all four reviewed slots.
    %w[wide tall small long].each do |slot|
      assert_match(/where:\s*[\"']home_slot[\"']\s*,\s*[\"']#{slot}[\"']/, gallery_preview)
    end
    assert_match(/include\s+figure\.liquid[^%]*(?:gallery_home_|\.image)/, gallery_preview)
  end

  # Confirms CV restyling does not replace either supported data backend.
  #
  # @return [void]
  # @note Reads the CV page and layout without loading remote resume data.
  def test_cv_keeps_both_al_folio_data_paths
    # Keep the existing route and data-rendering layout selected in front matter.
    cv_front_matter = front_matter("_pages/cv.md")
    assert_equal "/cv/", cv_front_matter.fetch("permalink")
    assert_equal "cv", cv_front_matter.fetch("layout")
    cv_layout = source("_layouts/cv.liquid")

    # Never publish the theme's demonstration PDF as a real curriculum vitae.
    cv_pdf = cv_front_matter["cv_pdf"]
    if cv_pdf
      refute_equal "example_pdf.pdf", cv_pdf
      assert_path_exists "assets/pdf/#{cv_pdf}"
    end

    # Preserve local CV YAML and JSON Resume as equivalent content sources.
    assert_includes cv_layout, "site.data.cv"
    assert_includes cv_layout, "site.data.resume"
    assert_match(/for\s+entry\s+in\s+site\.data\.cv/, cv_layout)
    assert_match(/for\s+data\s+in\s+site\.data\.resume/, cv_layout)
  end

  # Confirms every formal route opts into one shared contemplative application shell.
  #
  # @return [void]
  # @note Reads page front matter, shared head/default/header, and stylesheet files.
  def test_formal_surfaces_share_flags_styles_navigation_and_layers
    # Require explicit shell flags on routes that are not inferred from /blog/.
    FORMAL_SURFACE_PAGES.each do |page_name|
      metadata = front_matter("_pages/#{page_name}.md")
      assert_equal true, metadata.fetch("contemplative_surface"), "#{page_name} must enable the shared effects shell"
      assert_equal true, metadata.fetch("site_surface"), "#{page_name} must enable the formal site stylesheet"
    end

    # Wire the site-specific body scope and stylesheet through shared layouts.
    assert_path_exists "assets/css/contemplative-site.css"
    default_layout = source("_layouts/default.liquid")
    assert_includes default_layout, "page.site_surface"
    assert_includes default_layout, "contemplative-site-surface"
    head = source("_includes/head.liquid")
    assert_includes head, "page.site_surface"
    assert_includes head, "/assets/css/contemplative-site.css"

    # Keep one fixed navigation with an explicit current state for every route.
    header = source("_includes/header.liquid")
    %w[publications projects news blog gallery cv].each do |route|
      assert_includes header, "'/#{route}/' | relative_url"
    end
    assert_operator header.scan('aria-current="page"').size, :>=, 6

    # Preserve the pointer-transparent light field and its single image asset.
    effects = source("_includes/contemplative-effects.liquid")
    assert_includes effects, 'id="light-field"'
    assert_includes effects, "/assets/img/bamboo-cloud-sword.png"
    assert_includes effects, "/assets/js/contemplative-effects.js"
    assert_path_exists "assets/img/bamboo-cloud-sword.png"
    assert_path_exists "assets/js/contemplative-effects.js"

    # Keep legacy utility chrome legible and large enough on the formal mist surface.
    notes_styles = source("assets/css/contemplative-notes.css")
    assert_match(/#back-to-top\s*\{[^}]*width:\s*2\.75rem[^}]*height:\s*2\.75rem/m, notes_styles)
    assert_match(/footer \.container\s*\{[^}]*color:\s*var\(--notes-muted\)\s*!important/m, notes_styles)
  end

  # Confirms the two requested Latin faces and the existing CJK fallback chain.
  #
  # @return [void]
  # @note Reads production CSS and verifies the three self-hosted Notes assets.
  def test_formal_and_notes_surfaces_use_the_requested_font_stacks
    # Keep formal non-Notes pages on system Times New Roman with CJK fallbacks.
    site_styles = source("assets/css/contemplative-site.css")
    assert_match(
      /(?:--[\w-]*font|font-family):\s*["']Times New Roman["'][^;]*["']Noto Sans CJK SC["'][^;]*["']Microsoft YaHei["']/,
      site_styles
    )

    # Require all authored Notes prose to select the local Libertinus family.
    notes_styles = source("assets/css/contemplative-notes.css")
    assert_match(
      /--notes-font:\s*["']Libertinus Sans["'][^;]*["']Noto Sans CJK SC["'][^;]*["']Microsoft YaHei["']/,
      notes_styles
    )
    refute_match(/--notes-font:\s*["']Onest["']/, notes_styles)
    assert_includes notes_styles, "--notes-reading-width: 68ch;"
    assert_includes notes_styles, "font-synthesis: weight;"

    # Pin regular, bold, and italic declarations to their committed local files.
    font_variants = {
      "regular" => ["normal", "400"],
      "bold" => ["normal", "700"],
      "italic" => ["italic", "400"]
    }
    font_variants.each do |variant, (style, weight)|
      asset_name = "libertinus-sans-#{variant}.ttf"
      assert_path_exists "assets/fonts/#{asset_name}"
      assert_match(
        /@font-face\s*\{(?=[^}]*font-family:\s*["']Libertinus Sans["'])(?=[^}]*font-style:\s*#{style})(?=[^}]*font-weight:\s*#{weight})(?=[^}]*font-display:\s*swap)[^}]*#{Regexp.escape(asset_name)}[^}]*\}/m,
        notes_styles
      )
    end
    assert_path_exists "assets/fonts/OFL-Libertinus.txt"
    assert_empty REPOSITORY_ROOT.glob("assets/fonts/times*.ttf"), "licensed Windows Times files must not be redistributed"

    # Gallery owns a separate scoped stylesheet but follows the same formal face.
    gallery_styles = source("assets/css/contemplative-gallery.css")
    assert_match(
      /(?:--[\w-]*font|font-family):\s*["']Times New Roman["'][^;]*["']Noto Sans CJK SC["'][^;]*["']Microsoft YaHei["']/,
      gallery_styles
    )
  end

  # Confirms production pages reference every approved section illustration.
  #
  # @return [void]
  # @note Reads formal page/layout/include source and verifies committed assets.
  def test_approved_section_assets_are_promoted_out_of_the_prototype
    # Collect only production Liquid/Markdown surfaces, excluding design prototypes.
    production_source = (REPOSITORY_ROOT.glob("_layouts/*.liquid") +
      REPOSITORY_ROOT.glob("_includes/*.liquid") +
      REPOSITORY_ROOT.glob("_pages/*.md") +
      REPOSITORY_ROOT.glob("assets/css/contemplative-*.css")).map { |path| path.read(encoding: "UTF-8") }.join("\n")

    # Require each calligraphic section asset to exist and be reachable by a page.
    SECTION_ASSETS.each do |asset_name|
      assert_path_exists "assets/img/#{asset_name}"
      assert_includes production_source, asset_name
    end
    assert_path_exists "assets/img/me.jpg"
    assert_path_exists "assets/img/publication_preview/SIG25-face.jpg"
    assert_path_exists "assets/img/publication_preview/SigAsia25-DiffusionRelighting.png"
    assert_path_exists "assets/img/ajax_under_water.png"
  end

  # Confirms blog routes, reading time, citations, MathJax, and Distill survive.
  #
  # @return [void]
  # @note Reads only configuration and the two existing post layouts.
  def test_note_and_distill_rendering_invariants_remain_intact
    # Freeze the established public permalink used by every existing note URL.
    configuration = YAML.safe_load(source("_config.yml"), aliases: true)
    assert_equal "/blog/:year/:title/", configuration.fetch("permalink")
    assert_equal true, configuration.fetch("enable_math")

    # Preserve standard Markdown post content, read time, and citation rendering.
    post_layout = source("_layouts/post.liquid")
    assert_includes post_layout, "layout: default"
    assert_includes post_layout, "page.url | slice: 0, 6"
    assert_includes post_layout, "'/blog/'"
    assert_includes post_layout, "number_of_words"
    assert_includes post_layout, "{{ content }}"
    assert_includes post_layout, "{% include citation.liquid %}"
    assert_match(/\{%\s*bibliography\s+--cited_in_order\s*%\}/, post_layout)

    # Preserve Distill's custom elements, metadata, bibliography, and JS runtime.
    distill_layout = source("_layouts/distill.liquid")
    %w[d-front-matter d-title d-article d-appendix d-bibliography].each do |element|
      assert_includes distill_layout, "<#{element}"
    end
    assert_includes distill_layout, "{{ content }}"
    assert_includes distill_layout, "number_of_words"
    assert_includes distill_layout, "{% include contemplative-effects.liquid %}"
    %w[template.v2.js transforms.v2.js overrides.js].each do |script_name|
      assert_includes distill_layout, script_name
    end
  end

  private

  # Reads one UTF-8 repository file by a root-relative path.
  #
  # @param relative_path [String] non-empty path inside the repository root.
  # @return [String] exact UTF-8 file contents.
  # @raise [Errno::ENOENT] if the requested path does not exist.
  # @note Performs one filesystem read and never mutates the file.
  def source(relative_path)
    # Resolve through Pathname so every assertion reports the production path.
    REPOSITORY_ROOT.join(relative_path).read(encoding: "UTF-8")
  end

  # Parses the first YAML front-matter document from a repository file.
  #
  # @param relative_path [String] path to a UTF-8 Markdown or Liquid document.
  # @return [Hash] parsed front-matter mapping with string keys.
  # @raise [Minitest::Assertion] if the file has no delimited front matter.
  # @raise [Psych::SyntaxError] if the front matter is invalid YAML.
  # @note Reads the target file but performs no writes.
  def front_matter(relative_path)
    # Isolate only the opening YAML block so Liquid body syntax is never parsed.
    contents = source(relative_path)
    match = contents.match(/\A---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|\z)/m)
    refute_nil match, "#{relative_path} must begin with YAML front matter"

    # Parse aliases consistently with Jekyll's configuration loader.
    YAML.safe_load(match[1], aliases: true) || {}
  end

  # Recursively expands statically named includes from a Liquid source file.
  #
  # @param path [Pathname] existing repository file to read.
  # @param visited [Set<String>] canonical paths already expanded; callers may
  #   omit it. Repeated and cyclic includes are emitted only once.
  # @return [String] source text followed by all resolvable include contents.
  # @note Reads files under `_includes`; dynamic include names are ignored.
  def expand_liquid_source(path, visited = Set.new)
    # Stop recursive or duplicate expansion at the canonical repository path.
    canonical_path = path.cleanpath.to_s
    return "" if visited.include?(canonical_path)

    visited.add(canonical_path)
    contents = path.read(encoding: "UTF-8")

    # Follow only literal include names because Liquid expressions are runtime data.
    included_source = contents.scan(/\{%\s*include\s+([A-Za-z0-9_.\/-]+)/).filter_map do |match|
      include_path = REPOSITORY_ROOT.join("_includes", match.first)
      expand_liquid_source(include_path, visited) if include_path.file?
    end

    # Keep source boundaries visible in assertion diagnostics.
    ([contents] + included_source).join("\n")
  end

  # Expands a named Liquid layout and every static include it references.
  #
  # @param layout_name [String] layout basename without `.liquid`; it must not
  #   be empty and must name an existing file under `_layouts`.
  # @return [String] recursively expanded layout source.
  # @raise [Errno::ENOENT] if the named layout does not exist.
  # @note Reads the layout and reachable includes without mutation.
  def expanded_layout_source(layout_name)
    # Resolve the front-matter layout name into Jekyll's conventional path.
    expand_liquid_source(REPOSITORY_ROOT.join("_layouts", "#{layout_name}.liquid"))
  end

  # Expands a page body together with every static include it references.
  #
  # @param relative_path [String] repository-relative page path.
  # @return [String] recursively expanded page and include source.
  # @raise [Errno::ENOENT] if the page does not exist.
  # @note Reads the page and reachable includes without mutation.
  def expanded_page_source(relative_path)
    # Start expansion from the requested formal Markdown page.
    expand_liquid_source(REPOSITORY_ROOT.join(relative_path))
  end

  # Asserts that a production asset or source file exists as a regular file.
  #
  # @param relative_path [String] non-empty path relative to the repository.
  # @return [void]
  # @raise [Minitest::Assertion] if the path does not identify a regular file.
  # @note Performs one filesystem metadata lookup.
  def assert_path_exists(relative_path)
    # Report the root-relative contract path on failure.
    assert REPOSITORY_ROOT.join(relative_path).file?, "Expected production file #{relative_path}"
  end
end
