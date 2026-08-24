"use strict";

const assert = require("node:assert/strict");
const child_process = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repository_root = path.resolve(__dirname, "../../..");
const liquid_contract_files = Object.freeze([
  "_pages/blog.md",
  "_layouts/post.liquid",
  "_layouts/distill.liquid",
  "_layouts/archive-year.liquid",
  "_layouts/archive-tag.liquid",
  "_layouts/archive-category.liquid",
  "_layouts/default.liquid",
  "_includes/head.liquid",
  "_includes/header.liquid",
  "_includes/related_posts.liquid",
  "_includes/contemplative-effects.liquid",
]);

/**
 * Read one UTF-8 repository source file by its root-relative path.
 *
 * @param {string} relative_path - Non-empty path relative to the repository
 *   root. Both tracked and untracked migration files are accepted. The caller
 *   must not pass an absolute path or a path outside the repository.
 * @returns {string} The complete UTF-8 file contents, including front matter
 *   and Liquid syntax.
 * @throws {Error} If the path does not exist, cannot be read, or is not a file.
 * @example
 * const blog_source = _read_source("_pages/blog.md");
 * @sideEffects Reads one file from the local worktree without modifying it.
 */
function _read_source(relative_path) {
  // Resolve against the authoritative repository rather than the shell cwd.
  const absolute_path = path.join(repository_root, relative_path);

  // Read the full source so contracts can span front matter and template body.
  return fs.readFileSync(absolute_path, "utf8");
}

/**
 * Require every literal contract fragment to appear in one source string.
 *
 * @param {string} source_text - Complete source text to inspect. Empty text is
 *   accepted but fails whenever `required_fragments` is non-empty.
 * @param {readonly string[]} required_fragments - Literal non-empty fragments
 *   that must all occur at least once. An empty array is valid and passes.
 * @param {string} label - Non-empty human-readable file or feature label used
 *   in assertion diagnostics.
 * @returns {void} No value is returned when every fragment is present.
 * @throws {AssertionError} If any required fragment is absent.
 * @example
 * _assert_contains_all(source, ["permalink: /blog/"], "Notes index");
 */
function _assert_contains_all(source_text, required_fragments, label) {
  // Check fragments independently so a failure names the exact lost contract.
  for (const required_fragment of required_fragments) {
    assert(
      source_text.includes(required_fragment),
      `${label}: missing contract fragment ${JSON.stringify(required_fragment)}`,
    );
  }
}

/**
 * Require every regular-expression contract to match one source string.
 *
 * @param {string} source_text - Complete source text to inspect. Empty text is
 *   allowed but cannot satisfy non-empty patterns.
 * @param {readonly RegExp[]} required_patterns - Regular expressions defining
 *   whitespace-tolerant or structural source contracts. Patterns must not use
 *   mutable `g` or `y` state.
 * @param {string} label - Non-empty human-readable feature label included in
 *   assertion failures.
 * @returns {void} No value is returned when every pattern matches.
 * @throws {AssertionError} If any required pattern does not match.
 * @example
 * _assert_matches_all(source, [/published:\s*false/], "hidden News");
 */
function _assert_matches_all(source_text, required_patterns, label) {
  // Evaluate each independent invariant and preserve its pattern in failures.
  for (const required_pattern of required_patterns) {
    assert(
      required_pattern.test(source_text),
      `${label}: missing pattern ${required_pattern}`,
    );
  }
}

/**
 * Validate delimiter counts and nested block balance for one Liquid template.
 *
 * @param {string} source_text - Complete UTF-8 Liquid, Markdown, or HTML source
 *   containing zero or more `{% ... %}` and `{{ ... }}` constructs.
 * @param {string} label - Non-empty root-relative filename used in failures.
 * @returns {{statement_count: number, output_count: number}} Counts of balanced
 *   Liquid statement and output openings found in the source.
 * @throws {AssertionError} If delimiters are unmatched, a closing block has no
 *   opener, a closing tag has the wrong type, or an opener is never closed.
 * @example
 * const counts = _assert_liquid_balance("{% if x %}{{ x }}{% endif %}", "fixture");
 */
function _assert_liquid_balance(source_text, label) {
  // Prove raw opening and closing delimiters are paired before nesting checks.
  const statement_openings = source_text.match(/\{%/g) || [];
  const statement_closings = source_text.match(/%\}/g) || [];
  const output_openings = source_text.match(/\{\{/g) || [];
  const output_closings = source_text.match(/\}\}/g) || [];
  assert.equal(
    statement_openings.length,
    statement_closings.length,
    `${label}: unbalanced Liquid statement delimiters`,
  );
  assert.equal(
    output_openings.length,
    output_closings.length,
    `${label}: unbalanced Liquid output delimiters`,
  );

  // Walk block tags in source order and enforce proper nested closure.
  const block_stack = [];
  const block_openers = new Set(["if", "unless", "for", "case", "capture", "comment", "raw", "tablerow"]);
  const statement_pattern = /\{%-?\s*([A-Za-z_]+)[\s\S]*?-?%\}/g;
  let statement_match = statement_pattern.exec(source_text);
  while (statement_match !== null) {
    const tag_name = statement_match[1];
    if (block_openers.has(tag_name)) {
      block_stack.push(tag_name);
    } else if (tag_name.startsWith("end")) {
      const expected_opener = tag_name.slice(3);
      const actual_opener = block_stack.pop();
      assert.equal(
        actual_opener,
        expected_opener,
        `${label}: ${tag_name} closed ${actual_opener || "no open block"}`,
      );
    }
    statement_match = statement_pattern.exec(source_text);
  }
  assert.deepEqual(block_stack, [], `${label}: unclosed Liquid blocks ${block_stack.join(", ")}`);

  // Return compact diagnostics for the success report.
  return {
    statement_count: statement_openings.length,
    output_count: output_openings.length,
  };
}

/**
 * Read Git porcelain state for protected content and renderer inputs.
 *
 * @param {readonly string[]} protected_paths - Non-empty repository-relative
 *   pathspecs whose tracked and untracked state must be reported. Directories
 *   and individual files are accepted; paths outside the repository are not.
 * @returns {string[]} Non-empty porcelain lines. An empty array means every
 *   protected path matches the checked-in worktree state.
 * @throws {Error} If Git cannot inspect the repository or returns non-zero.
 * @example
 * const changes = _read_git_changes(["_posts", "_config.yml"]);
 * @sideEffects Spawns one read-only local Git process.
 */
function _read_git_changes(protected_paths) {
  // Ask Git to include untracked files so new content cannot evade the guard.
  const git_result = child_process.spawnSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "--", ...protected_paths],
    {
      cwd: repository_root,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  // Surface command failures before interpreting stdout as protection evidence.
  if (git_result.status !== 0) {
    throw new Error(`Git protection check failed: ${git_result.stderr || git_result.error}`);
  }

  // Normalize platform line endings and omit the final empty line.
  return git_result.stdout
    .split(/\r?\n/)
    .filter((status_line) => status_line.length > 0);
}

/**
 * Execute the complete source-level Notes migration contract.
 *
 * @returns {void} No value is returned after all source contracts pass; a JSON
 *   evidence summary is written to stdout.
 * @throws {Error|AssertionError} If routing, dynamic Liquid, article topology,
 *   Distill dependencies, archives, hidden News, effects, CSS, protected files,
 *   or Liquid balance diverge from the migration requirements.
 * @example
 * _main();
 * @sideEffects Reads repository files, spawns read-only Git, and writes one
 *   concise JSON report to stdout. No worktree file is modified.
 */
function _main() {
  /*
   * Lock the dynamic Notes index to its production route and Jekyll pagination.
   * These fragments deliberately prove the page consumes posts and paginator
   * output instead of hard-coding the static prototype collection.
   */
  const blog_source = _read_source("_pages/blog.md");
  _assert_contains_all(blog_source, [
    "permalink: /blog/",
    "title: Notes",
    "pagination:",
    "enabled: true",
    "collection: posts",
    "permalink: /page/:num/",
    "per_page: 5",
    "site.posts | where: \"featured\", \"true\"",
    "{% assign postlist = paginator.posts %}",
    "{% assign postlist = site.posts %}",
    "{% for post in postlist %}",
    "{{ post.title }}",
    "{{ post.url | relative_url }}",
    "{% include pagination.liquid %}",
  ], "production Notes index");

  /*
   * Prove ordinary Kramdown posts retain their semantic wrapper and every
   * content, LaTeX-adjacent, bibliography, related-post, and comment hook.
   */
  const post_layout_source = _read_source("_layouts/post.liquid");
  _assert_contains_all(post_layout_source, [
    "url_beginning == '/blog/'",
    "contemplative-notes notes-article notes-standard-article",
    "<nav class=\"notes-breadcrumb\"",
    "<h1 class=\"post-title\">{{ page.title }}</h1>",
    "{% assign read_time = content | number_of_words | divided_by: 180 | plus: 1 %}",
    "Estimated reading time: {{ read_time }} min",
    "<article class=\"post-content\">",
    "<div id=\"markdown-content\">",
    "{{ content }}",
    "{% toc %}",
    "{% include citation.liquid %}",
    "{% bibliography --cited_in_order %}",
    "{% include related_posts.liquid %}",
    "{% include disqus.liquid %}",
    "{% include giscus.liquid %}",
  ], "ordinary post layout");

  /*
   * Preserve Distill's complete runtime and custom-element topology while the
   * new visual shell is conditionally applied only to `/blog/**` articles.
   */
  const distill_layout_source = _read_source("_layouts/distill.liquid");
  _assert_contains_all(distill_layout_source, [
    "{% include head.liquid %}",
    "{% include scripts/jquery.liquid %}",
    "{% include scripts/mathjax.liquid %}",
    "/assets/js/distillpub/template.v2.js",
    "/assets/js/distillpub/transforms.v2.js",
    "/assets/js/distillpub/overrides.js",
    "{% include contemplative-effects.liquid %}",
    "contemplative-notes notes-article notes-distill-article",
    "{% assign read_time = content | number_of_words | divided_by: 180 | plus: 1 %}",
    "<d-front-matter>",
    "<d-title>",
    "<p class=\"notes-reading-time\">Estimated reading time: {{ read_time }} min</p>",
    "<d-byline></d-byline>",
    "<d-article>",
    "<d-contents>",
    "{{ content }}",
    "<d-appendix>",
    "<d-footnote-list></d-footnote-list>",
    "<d-citation-list></d-citation-list>",
    "<d-bibliography src=",
    "{% include scripts/bootstrap.liquid %}",
    "{% include scripts/analytics.liquid %}",
    "{% include scripts/progressBar.liquid %}",
    "{% include scripts/back_to_top.liquid %}",
    "{% include scripts/search.liquid %}",
  ], "Distill post layout");

  // Require every archive route to continue iterating real Jekyll archive posts.
  for (const archive_path of [
    "_layouts/archive-year.liquid",
    "_layouts/archive-tag.liquid",
    "_layouts/archive-category.liquid",
  ]) {
    const archive_source = _read_source(archive_path);
    _assert_contains_all(archive_source, [
      "contemplative-notes notes-archive",
      "{% for post in page.posts %}",
      "{{ post.date | date_to_xmlschema }}",
      "{{ post.url | relative_url }}",
      "{{ post.title }}",
      "{% endfor %}",
    ], archive_path);
  }

  // Lock all three production-level News entry points to their hidden state.
  const news_page_source = _read_source("_pages/news.md");
  const about_page_source = _read_source("_pages/about.md");
  const header_source = _read_source("_includes/header.liquid");
  _assert_matches_all(news_page_source, [/permalink:\s*\/news\//, /published:\s*false/], "hidden News page");
  _assert_matches_all(about_page_source, [/^news:\s*false\b/m], "hidden homepage News section");
  const contemplative_header_branch = header_source.split("{% else %}")[0];
  assert(!/news/i.test(contemplative_header_branch), "Notes navigation must not expose News");

  /*
   * Prove the formal pages own one conditional ambient-effects include and
   * that its shipped renderer is byte-identical to the approved prototype.
   */
  const effects_include_source = _read_source("_includes/contemplative-effects.liquid");
  const default_layout_source = _read_source("_layouts/default.liquid");
  const head_source = _read_source("_includes/head.liquid");
  _assert_contains_all(effects_include_source, [
    "page.url contains '/blog/' or page.permalink contains '/blog/'",
    "<canvas id=\"light-field\" class=\"notes-light-field\" aria-hidden=\"true\"></canvas>",
    "id=\"sword-asset\"",
    "/assets/img/bamboo-cloud-sword.png",
    "/assets/js/contemplative-effects.js",
  ], "formal ambient-effects include");
  _assert_contains_all(default_layout_source, [
    "contemplative-notes-surface",
    "{% include contemplative-effects.liquid %}",
    "id=\"main-content\" class=\"container mt-5 contemplative-notes-main\" role=\"main\"",
  ], "default Notes shell");
  _assert_contains_all(head_source, [
    "page.url contains '/blog/' or page.permalink contains '/blog/'",
    "/assets/css/contemplative-notes.css",
  ], "route-scoped Notes stylesheet");
  for (const required_asset of [
    "assets/css/contemplative-notes.css",
    "assets/fonts/onest-latin-wght-normal.woff2",
    "assets/img/bamboo-cloud-sword.png",
    "assets/img/section-xinde.png",
    "assets/js/contemplative-effects.js",
  ]) {
    assert(fs.statSync(path.join(repository_root, required_asset)).isFile(), `${required_asset}: missing formal asset`);
  }
  const formal_effect_bytes = fs.readFileSync(path.join(repository_root, "assets/js/contemplative-effects.js"));
  const prototype_effect_bytes = fs.readFileSync(path.join(repository_root, "design-prototypes/contemplative-light/script.js"));
  assert(formal_effect_bytes.equals(prototype_effect_bytes), "formal effect JS must exactly match the approved prototype");
  const formal_effect_source = formal_effect_bytes.toString("utf8");
  _assert_contains_all(formal_effect_source, [
    "const maximum_sword_wheel_count = 16;",
    "const maximum_sword_trail_count = 6;",
    "Array.from({ length: maximum_sword_wheel_count }",
    "{ length: maximum_sword_trail_count }",
  ], "formal 16/6 sword renderer");

  /*
   * Enforce route scoping, readable line length, safe technical overflow, and
   * WCAG-sized controls directly against the CSS shipped to production Notes.
   */
  const notes_css_source = _read_source("assets/css/contemplative-notes.css");
  _assert_contains_all(notes_css_source, [
    "html {\n  font-size: 16px !important;\n}",
    "body.contemplative-notes-surface {",
    "--notes-reading-width: 72ch;",
    "--notes-layer-content: 1;",
    "--notes-layer-content-overlay: 5;",
    "--notes-layer-effects: 10;",
    "--notes-layer-navigation: 20;",
    "--notes-layer-skip: 100;",
    "background: rgb(233 238 234 / 0.88);",
    "backdrop-filter: saturate(112%) blur(18px);",
    "z-index: var(--notes-layer-effects);",
    "z-index: var(--notes-layer-content);",
    "z-index: var(--notes-layer-content-overlay) !important;",
    "z-index: var(--notes-layer-navigation);",
    "body.contemplative-notes-surface .medium-zoom-overlay,",
    "body.contemplative-notes-surface .medium-zoom-image--opened",
    "body.contemplative-notes-surface #back-to-top",
    ".notes-standard-article .post-meta .notes-reading-time",
    ".notes-distill-article d-title .notes-reading-time",
    ".notes-standard-article mjx-container[display=\"true\"]",
    ".notes-distill-article d-article mjx-container[display=\"true\"]",
    ".notes-distill-article d-article .katex-display",
    ".notes-standard-article #markdown-content table",
    ".notes-distill-article d-article table",
    "overflow-x: auto;",
  ], "Notes technical typography CSS");
  _assert_matches_all(notes_css_source, [
    /\.notes-site-mark\s*\{[\s\S]*?min-width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;/,
    /\.notes-site-nav a\s*\{[\s\S]*?min-width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;/,
    /\.contemplative-notes-surface \.pagination \.page-link\s*\{[\s\S]*?min-width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;/,
    /\.notes-standard-article mjx-container\[display="true"\]\s*\{[\s\S]*?overflow-x:\s*auto;/,
    /\.notes-distill-article d-article mjx-container\[display="true"\],[\s\S]*?\.katex-display\s*\{[\s\S]*?overflow-x:\s*auto;/,
  ], "Notes accessibility and overflow CSS");
  assert(!/(^|\})\s*(body|a|h[1-6])\s*\{/m.test(notes_css_source), "Notes CSS must not introduce unscoped body or content rules");

  // Guard the existing content, site configuration, and Distill vendor runtime.
  const protected_changes = _read_git_changes(["_posts", "_config.yml", "assets/js/distillpub"]);
  assert.deepEqual(
    protected_changes,
    [],
    `content/config/Distill vendor files must remain untouched: ${protected_changes.join(", ")}`,
  );

  // Validate every migrated Liquid surface as the final syntax-level gate.
  const liquid_counts = {};
  for (const liquid_path of liquid_contract_files) {
    liquid_counts[liquid_path] = _assert_liquid_balance(_read_source(liquid_path), liquid_path);
  }

  // Emit concise machine-readable evidence for parent orchestration and CI logs.
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    route: "/blog/",
    pagination: true,
    ordinary_post: true,
    distill_post: true,
    archives: 3,
    news_hidden: true,
    swords: { wheel: 16, trail: 6, prototype_match: true },
    protected_changes,
    liquid_counts,
  }, null, 2)}\n`);
}

_main();
