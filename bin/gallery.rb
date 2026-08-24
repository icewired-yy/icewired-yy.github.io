# frozen_string_literal: true

require "date"
require "fileutils"
require "json"
require "optparse"
require "pathname"
require "uri"
require "yaml"

# Provides the authoring and validation contract for the site's Gallery.
#
# Gallery entries intentionally require a Markdown record as well as an image.
# This prevents an unrelated or private image from becoming public merely
# because it was copied into the repository. The module has no non-standard
# dependencies, so the same checks run on Windows, in local Jekyll builds, and
# in GitHub Actions.
module GalleryPipeline
  # Repository root inferred from this script's location. It is immutable for
  # normal CLI use; tests may pass a different root to public methods.
  DEFAULT_ROOT = Pathname.new(__dir__).parent.freeze
  # Directory containing one Markdown record per photograph.
  COLLECTION_DIRECTORY = "_gallery"
  # Public directory containing only reviewed web-ready photographs.
  IMAGE_DIRECTORY = "assets/img/gallery"
  # Maximum accepted published-image size in bytes (2 MiB).
  MAX_IMAGE_BYTES = 2 * 1024 * 1024
  # Maximum accepted image dimension in pixels on either axis.
  MAX_IMAGE_EDGE = 2400
  # Image formats whose dimensions and metadata can be validated without tools.
  SUPPORTED_EXTENSIONS = %w[.jpg .jpeg .png].freeze
  # Gallery variants supported by the chronological archive grid.
  VARIANTS = %w[standard wide tall].freeze
  # The four deliberate positions in the approved homepage photo composition.
  HOME_SLOTS = %w[wide tall small long].freeze
  # Canonical lowercase slug accepted by the authoring command.
  SLUG_PATTERN = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/
  # Canonical record/image basename combining an ISO date and author slug.
  RECORD_BASENAME_PATTERN = /\A\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\z/
  # Rights states understood by the validator.
  RIGHTS = %w[self licensed].freeze
  # Authored front-matter keys. Unknown keys fail fast to catch misspellings.
  ALLOWED_KEYS = %w[
    title date image alt width height location credit source_url rights
    published privacy_reviewed variant home_slot
  ].freeze
  # Fields that every record must declare, including unfinished drafts.
  REQUIRED_KEYS = %w[
    title date image alt width height rights published privacy_reviewed variant
  ].freeze
  # JPEG start-of-frame markers that contain the encoded image dimensions.
  JPEG_START_OF_FRAME_MARKERS = [
    0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
    0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF
  ].freeze
  # PNG chunks that can carry EXIF, XMP, comments, or other private text.
  PNG_PRIVATE_METADATA_CHUNKS = %w[eXIf tEXt zTXt iTXt].freeze

  module_function

  # Validates every Gallery record and every published-image asset.
  #
  # @param root [Pathname, String] repository root containing `_gallery` and
  #   `assets/img/gallery`; it must not be nil.
  # @param production [Boolean] when true, draft records fail because their
  #   image bytes would otherwise be copied into the public deployment.
  # @return [Array<String>] human-readable validation errors; an empty array
  #   means the repository satisfies the complete Gallery contract.
  # @raise [SystemCallError] if a discovered file cannot be read.
  # @note Reads repository files but never mutates them.
  def validate_repository(root: DEFAULT_ROOT, production: false)
    # Resolve all discovery paths before reading authored records.
    repository_root = Pathname.new(root).expand_path
    collection_root = repository_root.join(COLLECTION_DIRECTORY)
    image_root = repository_root.join(IMAGE_DIRECTORY)
    record_paths = collection_root.glob("**/*.md").reject { |path| path.basename.to_s.start_with?("_") }.sort
    image_paths = image_root.glob("**/*").select { |path| path.file? || path.symlink? }.sort
    issues = []
    referenced_images = {}
    published_home_slots = Hash.new { |hash, key| hash[key] = [] }

    # Validate each Markdown record directly so malformed drafts cannot evade
    # checks by being filtered out by Jekyll's `published: false` behavior.
    record_paths.each do |record_path|
      entry, record_issues = load_entry(record_path, repository_root)
      issues.concat(record_issues)
      next unless entry

      entry_issues, image_reference = validate_entry(entry, repository_root)
      issues.concat(entry_issues)
      if production && entry.fetch(:data)["published"] == false
        issues << "#{relative_path(record_path, repository_root)}: drafts cannot be included in a production deployment"
      end
      if image_reference
        referenced_images[image_reference] ||= []
        referenced_images[image_reference] << relative_path(record_path, repository_root)
      end
      next unless entry.fetch(:data)["published"] == true

      home_slot = normalized_optional_string(entry.fetch(:data)["home_slot"])
      published_home_slots[home_slot] << relative_path(record_path, repository_root) if home_slot
    end

    # Reject duplicate references and unpaired image assets after all records
    # have been collected, so diagnostics name every conflicting source.
    referenced_images.each do |image_reference, records|
      next if records.length == 1

      issues << "#{image_reference}: referenced by multiple Gallery records: #{records.join(', ')}"
    end
    image_paths.each do |image_path|
      relative_image = relative_path(image_path, repository_root)
      if path_contains_symlink?(image_path, image_root)
        issues << "#{relative_image}: Gallery assets must be regular files, not symbolic links"
        next
      end
      unless SUPPORTED_EXTENSIONS.include?(image_path.extname)
        issues << "#{relative_image}: unsupported Gallery asset; use lowercase .jpg, .jpeg, or .png"
        next
      end
      issues << "#{relative_image}: image has no companion _gallery Markdown record" unless referenced_images.key?(relative_image)
    end

    # Preserve the approved four-slot homepage composition as an all-or-none
    # editorial unit, while allowing a Gallery with no homepage preview yet.
    published_home_slots.each do |slot, records|
      issues << "home_slot #{slot.inspect}: assigned to multiple published records: #{records.join(', ')}" if records.length > 1
    end
    unless published_home_slots.empty?
      missing_slots = HOME_SLOTS - published_home_slots.keys
      issues << "homepage preview must provide each slot exactly once; missing: #{missing_slots.join(', ')}" unless missing_slots.empty?
    end

    # Return stable ordering so local and CI output are directly comparable.
    issues.sort
  end

  # Adds one reviewed web image and creates its draft Gallery record.
  #
  # @param source [Pathname, String] existing JPG, JPEG, or PNG outside or
  #   inside the repository; it must already be resized and metadata-free.
  # @param date [String] exact capture date in ISO `YYYY-MM-DD` form.
  # @param slug [String] lowercase ASCII words separated by single hyphens.
  # @param title [String, nil] initial human-readable title; when nil, the slug
  #   is converted into title case.
  # @param variant [String] one of `standard`, `wide`, or `tall`.
  # @param home_slot [String, nil] optional homepage slot; accepted values are
  #   `wide`, `tall`, `small`, and `long`.
  # @param root [Pathname, String] repository root to mutate.
  # @return [Hash<Symbol, Pathname>] paths created under `:image` and `:record`.
  # @raise [ArgumentError] for an invalid source, date, slug, variant, slot, or
  #   repository that already violates the Gallery contract.
  # @raise [SystemCallError] when copying or writing fails.
  # @note Creates directories, copies the image, and writes a draft Markdown
  #   record. It never overwrites an existing file and rolls back a copied image
  #   if writing the record fails.
  def add_entry(source:, date:, slug:, title: nil, variant: "standard", home_slot: nil, root: DEFAULT_ROOT)
    # Refuse to add onto a broken repository because that would obscure which
    # operation introduced a duplicate, orphan, or unsafe asset.
    repository_root = Pathname.new(root).expand_path
    existing_issues = validate_repository(root: repository_root)
    raise ArgumentError, "Gallery validation already fails:\n- #{existing_issues.join("\n- ")}" unless existing_issues.empty?

    # Normalize and validate author input before creating any directories.
    capture_date = parse_iso_date(date)
    raise ArgumentError, "date must use exact YYYY-MM-DD format" unless capture_date
    raise ArgumentError, "slug must contain lowercase ASCII words separated by hyphens" unless slug.to_s.match?(SLUG_PATTERN)
    raise ArgumentError, "variant must be one of: #{VARIANTS.join(', ')}" unless VARIANTS.include?(variant)
    if home_slot && !HOME_SLOTS.include?(home_slot)
      raise ArgumentError, "home-slot must be one of: #{HOME_SLOTS.join(', ')}"
    end

    # Inspect the source as an actual image and enforce the same publication
    # limits used by repository-wide validation.
    source_path = Pathname.new(source).expand_path
    raise ArgumentError, "source image does not exist: #{source_path}" unless source_path.file?
    extension = source_path.extname.downcase
    raise ArgumentError, "source must be JPG, JPEG, or PNG" unless SUPPORTED_EXTENSIONS.include?(extension)
    image_info = inspect_image(source_path)
    unless image_format_matches_extension?(image_info, extension)
      raise ArgumentError, "source extension #{extension} does not match its encoded #{image_info.fetch(:format)} format"
    end
    policy_issues = validate_image_policy(image_info, source_path.to_s)
    raise ArgumentError, policy_issues.join("\n") unless policy_issues.empty?

    # Derive paired destination paths from one canonical date-and-slug identity.
    canonical_extension = extension == ".jpeg" ? ".jpg" : extension
    basename = "#{capture_date.iso8601}-#{slug}"
    image_path = repository_root.join(IMAGE_DIRECTORY, capture_date.year.to_s, "#{basename}#{canonical_extension}")
    record_path = repository_root.join(COLLECTION_DIRECTORY, "#{basename}.md")
    raise ArgumentError, "destination image already exists: #{image_path}" if image_path.exist?
    raise ArgumentError, "destination record already exists: #{record_path}" if record_path.exist?

    # Build a deliberately unpublished record so alt text, caption, privacy,
    # and homepage placement must be reviewed before the image can appear.
    display_title = normalized_optional_string(title) || slug.split("-").map(&:capitalize).join(" ")
    public_image_path = "/#{relative_path(image_path, repository_root)}"
    record_content = build_draft_record(
      title: display_title,
      date: capture_date,
      image: public_image_path,
      width: image_info.fetch(:width),
      height: image_info.fetch(:height),
      variant: variant,
      home_slot: home_slot
    )

    # Create the pair atomically enough for authoring: a failed Markdown write
    # removes the copied image instead of leaving a validator-blocking orphan.
    FileUtils.mkdir_p(image_path.dirname)
    FileUtils.mkdir_p(record_path.dirname)
    FileUtils.cp(source_path, image_path)
    begin
      record_path.write(record_content, mode: "w", encoding: "UTF-8")
    rescue StandardError
      image_path.delete if image_path.exist?
      raise
    end

    # Return both paths so callers can report exactly what must be edited.
    { image: image_path, record: record_path }
  end

  # Executes the human-facing `add` and `check` commands.
  #
  # @param argv [Array<String>] command-line arguments excluding the Ruby
  #   executable and script name; the array is duplicated before parsing.
  # @param root [Pathname, String] repository root used by both commands.
  # @param out [IO] destination for success and help output.
  # @param err [IO] destination for validation and usage errors.
  # @return [Integer] process-style status code: zero for success, two for
  #   invalid author input, and one for repository validation failures.
  # @note The `add` command mutates the repository through `add_entry`; `check`
  #   is read-only.
  def run_cli(argv, root: DEFAULT_ROOT, out: $stdout, err: $stderr)
    # Select the command without mutating the caller's argument array.
    arguments = argv.dup
    command = arguments.shift

    # Validate or scaffold according to the explicit author command.
    case command
    when "check"
      production = false
      parser = OptionParser.new do |option_parser|
        option_parser.banner = "Usage: ruby bin/gallery.rb check [--production]"
        option_parser.on("--production", "Reject drafts before public deployment") { production = true }
      end
      begin
        parser.parse!(arguments)
        raise OptionParser::InvalidArgument, "unexpected arguments: #{arguments.join(' ')}" unless arguments.empty?
      rescue OptionParser::ParseError => error
        err.puts "Gallery check failed: #{error.message}"
        err.puts parser
        return 2
      end
      issues = validate_repository(root: root, production: production)
      if issues.empty?
        out.puts "Gallery check passed."
        return 0
      end
      err.puts "Gallery check failed with #{issues.length} issue#{issues.length == 1 ? '' : 's'}:"
      issues.each { |issue| err.puts "- #{issue}" }
      1
    when "add"
      run_add_command(arguments, root: root, out: out, err: err)
    else
      err.puts "Usage: ruby bin/gallery.rb <check|add>"
      2
    end
  end

  # Parses and executes the `add` subcommand.
  #
  # @param arguments [Array<String>] source path followed by supported options.
  # @param root [Pathname, String] repository root to mutate.
  # @param out [IO] destination for the created-path summary.
  # @param err [IO] destination for parser and validation errors.
  # @return [Integer] zero when both files are created, otherwise two.
  # @note Mutates the repository only after OptionParser and source validation
  #   have completed successfully.
  def run_add_command(arguments, root:, out:, err:)
    # Parse named metadata while keeping the source image as one positional arg.
    options = { variant: "standard" }
    parser = OptionParser.new do |option_parser|
      option_parser.banner = "Usage: ruby bin/gallery.rb add SOURCE --date YYYY-MM-DD --slug SLUG [options]"
      option_parser.on("--date DATE", "Exact capture date") { |value| options[:date] = value }
      option_parser.on("--slug SLUG", "Lowercase hyphenated identity") { |value| options[:slug] = value }
      option_parser.on("--title TITLE", "Initial display title") { |value| options[:title] = value }
      option_parser.on("--variant VARIANT", VARIANTS, "Archive layout variant") { |value| options[:variant] = value }
      option_parser.on("--home-slot SLOT", HOME_SLOTS, "Optional homepage slot") { |value| options[:home_slot] = value }
    end
    parser.parse!(arguments)
    source = arguments.shift
    raise OptionParser::MissingArgument, "SOURCE" unless source
    raise OptionParser::InvalidArgument, "unexpected arguments: #{arguments.join(' ')}" unless arguments.empty?
    raise OptionParser::MissingArgument, "--date" unless options[:date]
    raise OptionParser::MissingArgument, "--slug" unless options[:slug]

    # Create the paired files only after every required option is present.
    created = add_entry(source: source, root: root, **options)
    out.puts "Created Gallery draft:"
    out.puts "- image: #{relative_path(created.fetch(:image), Pathname.new(root).expand_path)}"
    out.puts "- record: #{relative_path(created.fetch(:record), Pathname.new(root).expand_path)}"
    out.puts "Edit the record, set privacy_reviewed and published to true, then run `ruby bin/gallery.rb check`."
    0
  rescue OptionParser::ParseError, ArgumentError => error
    # Keep author errors concise and include the canonical command form.
    err.puts "Gallery add failed: #{error.message}"
    err.puts parser
    2
  end

  # Loads one Markdown record and its YAML front matter.
  #
  # @param path [Pathname] Gallery Markdown path to read.
  # @param repository_root [Pathname] root used to format relative diagnostics.
  # @return [Array<(Hash, Array<String>)>] entry hash plus parsing issues; entry
  #   is nil when front matter cannot be parsed safely.
  # @raise [SystemCallError] if the record cannot be read.
  # @note Performs file I/O without mutation.
  def load_entry(path, repository_root)
    # Split strict top-of-file front matter from the optional Markdown caption.
    content = path.read(encoding: "UTF-8")
    match = content.match(/\A---\s*\r?\n(.*?)\r?\n---\s*\r?\n?(.*)\z/m)
    relative_record = relative_path(path, repository_root)
    return [nil, ["#{relative_record}: missing complete YAML front matter"]] unless match

    # Parse only basic YAML values plus dates; aliases and arbitrary classes are
    # forbidden because this data is authored content, not executable config.
    raw_data = YAML.safe_load(match[1], permitted_classes: [Date, Time], aliases: false)
    unless raw_data.is_a?(Hash)
      return [nil, ["#{relative_record}: front matter must be a mapping"]]
    end
    data = raw_data.to_h { |key, value| [key.to_s, value] }

    # Return the canonical entry representation consumed by later checks.
    [{ path: path, relative_path: relative_record, data: data, body: match[2].to_s }, []]
  rescue Psych::Exception => error
    # Surface YAML line/shape failures as deterministic repository diagnostics.
    [nil, ["#{relative_path(path, repository_root)}: invalid YAML front matter (#{error.message.lines.first.to_s.strip})"]]
  end

  # Validates the schema, content, path identity, and image for one record.
  #
  # @param entry [Hash] object returned by `load_entry`.
  # @param repository_root [Pathname] root containing the referenced asset.
  # @return [Array<(Array<String>, String, nil)>] entry issues and the normalized
  #   relative image reference, or nil when the path cannot be normalized.
  # @raise [SystemCallError] if the referenced image exists but cannot be read.
  # @note Reads image bytes but never mutates the record or asset.
  def validate_entry(entry, repository_root)
    # Check the closed front-matter schema before interpreting individual values.
    data = entry.fetch(:data)
    record_name = entry.fetch(:relative_path)
    issues = []
    unknown_keys = data.keys - ALLOWED_KEYS
    missing_keys = REQUIRED_KEYS - data.keys
    issues << "#{record_name}: unknown fields: #{unknown_keys.sort.join(', ')}" unless unknown_keys.empty?
    issues << "#{record_name}: missing fields: #{missing_keys.sort.join(', ')}" unless missing_keys.empty?

    # Validate core types and bounded editorial enums.
    validate_string_field(data, "title", record_name, issues, maximum: 120, allow_empty: data["published"] != true)
    validate_string_field(data, "alt", record_name, issues, maximum: 300, allow_empty: data["published"] != true)
    %w[location credit source_url].each do |field|
      validate_string_field(data, field, record_name, issues, maximum: 240, allow_empty: true, optional: true)
    end
    issues << "#{record_name}: published must be true or false" unless [true, false].include?(data["published"])
    issues << "#{record_name}: privacy_reviewed must be true or false" unless [true, false].include?(data["privacy_reviewed"])
    issues << "#{record_name}: variant must be one of: #{VARIANTS.join(', ')}" unless VARIANTS.include?(data["variant"])
    home_slot = normalized_optional_string(data["home_slot"])
    issues << "#{record_name}: home_slot must be blank or one of: #{HOME_SLOTS.join(', ')}" if home_slot && !HOME_SLOTS.include?(home_slot)
    issues << "#{record_name}: rights must be one of: #{RIGHTS.join(', ')}" unless RIGHTS.include?(data["rights"])
    %w[width height].each do |field|
      issues << "#{record_name}: #{field} must be a positive integer" unless data[field].is_a?(Integer) && data[field].positive?
    end

    # Validate publication-only content, ownership, and privacy assertions.
    if data["published"] == true
      issues << "#{record_name}: privacy_reviewed must be true before publication" unless data["privacy_reviewed"] == true
      visible_caption = entry.fetch(:body).gsub(/<!--.*?-->/m, "").strip
      issues << "#{record_name}: published records require a Markdown caption" if visible_caption.empty?
      if data["rights"] == "licensed"
        issues << "#{record_name}: licensed photographs require credit" unless normalized_optional_string(data["credit"])
        source_url = normalized_optional_string(data["source_url"])
        issues << "#{record_name}: licensed photographs require an http(s) source_url" unless valid_http_url?(source_url)
      end
    end

    # Normalize and validate the date/path identity before opening the image.
    capture_date = parse_iso_date(data["date"])
    issues << "#{record_name}: date must use exact YYYY-MM-DD format" unless capture_date
    image_reference = normalize_image_reference(data["image"], record_name, issues)
    return [issues, nil] unless image_reference

    image_path = repository_root.join(image_reference)
    record_stem = entry.fetch(:path).basename(".md").to_s
    image_stem = image_path.basename.sub_ext("").to_s
    unless record_stem.match?(RECORD_BASENAME_PATTERN)
      issues << "#{record_name}: basename must use YYYY-MM-DD-lowercase-kebab-slug"
    end
    issues << "#{record_name}: image basename must match record basename" unless image_stem == record_stem
    if capture_date
      expected_prefix = "#{capture_date.iso8601}-"
      issues << "#{record_name}: record basename must begin with #{expected_prefix}" unless record_stem.start_with?(expected_prefix)
      expected_year_directory = repository_root.join(IMAGE_DIRECTORY, capture_date.year.to_s)
      issues << "#{record_name}: image must be stored under #{IMAGE_DIRECTORY}/#{capture_date.year}" unless image_path.dirname == expected_year_directory
    end
    if path_contains_symlink?(image_path, repository_root.join(IMAGE_DIRECTORY))
      issues << "#{record_name}: referenced image cannot be a symbolic link"
      return [issues, image_reference]
    end
    unless image_path.file?
      issues << "#{record_name}: referenced image does not exist: #{image_reference}"
      return [issues, image_reference]
    end

    # Compare authored dimensions against actual bytes and reject unsafe assets.
    begin
      image_info = inspect_image(image_path)
      unless image_format_matches_extension?(image_info, image_path.extname)
        issues << "#{record_name}: image extension #{image_path.extname} does not match its encoded #{image_info.fetch(:format)} format"
      end
      issues.concat(validate_image_policy(image_info, image_reference))
      if data["width"].is_a?(Integer) && data["width"] != image_info.fetch(:width)
        issues << "#{record_name}: width #{data['width']} does not match image width #{image_info.fetch(:width)}"
      end
      if data["height"].is_a?(Integer) && data["height"] != image_info.fetch(:height)
        issues << "#{record_name}: height #{data['height']} does not match image height #{image_info.fetch(:height)}"
      end
    rescue ArgumentError => error
      issues << "#{record_name}: #{error.message}"
    end

    # Return the reference even when its contents fail, enabling duplicate and
    # orphan diagnostics to remain complete in the same validation pass.
    [issues, image_reference]
  end

  # Reads image dimensions and detects metadata-bearing container sections.
  #
  # @param path [Pathname, String] existing JPG, JPEG, or PNG to inspect.
  # @return [Hash] keys are `:format`, `:width`, `:height`, `:bytes`, and
  #   `:private_metadata`, whose value is an array of detected container labels.
  # @raise [ArgumentError] if the file signature, structure, or dimensions are
  #   unsupported or malformed.
  # @raise [SystemCallError] if the file cannot be read.
  # @note Reads the complete image into memory; the contract caps files at 2 MiB.
  def inspect_image(path)
    # Dispatch by binary signature instead of trusting the filename extension.
    image_path = Pathname.new(path)
    bytes = image_path.binread
    if bytes.start_with?("\x89PNG\r\n\x1A\n".b)
      dimensions, metadata = inspect_png(bytes)
      format = :png
    elsif bytes.start_with?("\xFF\xD8".b)
      dimensions, metadata = inspect_jpeg(bytes)
      format = :jpeg
    else
      raise ArgumentError, "image is not a supported JPG, JPEG, or PNG"
    end

    # Return one immutable-style value object for all later policy checks.
    {
      format: format,
      width: dimensions.fetch(:width),
      height: dimensions.fetch(:height),
      bytes: bytes.bytesize,
      private_metadata: metadata.uniq.sort
    }
  end

  # Inspects a PNG container for dimensions and private metadata chunks.
  #
  # @param bytes [String] complete binary PNG beginning with the standard
  #   eight-byte signature.
  # @return [Array<(Hash, Array<String>)>] dimensions and detected chunk names.
  # @raise [ArgumentError] if IHDR is missing or a chunk exceeds file bounds.
  # @note Performs no I/O and does not decode pixel data.
  def inspect_png(bytes)
    # Walk length-prefixed chunks to find IHDR and metadata-bearing sections.
    offset = 8
    dimensions = nil
    private_metadata = []
    while offset + 12 <= bytes.bytesize
      length = bytes.byteslice(offset, 4).unpack1("N")
      chunk_type = bytes.byteslice(offset + 4, 4)
      chunk_end = offset + 12 + length
      raise ArgumentError, "PNG contains a truncated #{chunk_type.inspect} chunk" if chunk_end > bytes.bytesize
      chunk_data = bytes.byteslice(offset + 8, length)
      if chunk_type == "IHDR"
        raise ArgumentError, "PNG IHDR is malformed" unless length == 13
        width, height = chunk_data.byteslice(0, 8).unpack("NN")
        dimensions = { width: width, height: height }
      end
      private_metadata << "PNG #{chunk_type}" if PNG_PRIVATE_METADATA_CHUNKS.include?(chunk_type)
      offset = chunk_end
      break if chunk_type == "IEND"
    end

    # Reject files without real positive dimensions.
    unless dimensions && dimensions.fetch(:width).positive? && dimensions.fetch(:height).positive?
      raise ArgumentError, "PNG has no valid IHDR dimensions"
    end
    [dimensions, private_metadata]
  end

  # Inspects a JPEG container for dimensions and private APP/comment segments.
  #
  # @param bytes [String] complete binary JPEG beginning with SOI.
  # @return [Array<(Hash, Array<String>)>] dimensions and detected segment labels.
  # @raise [ArgumentError] if no supported SOF dimensions exist or a segment is
  #   truncated.
  # @note Performs no I/O and does not entropy-decode scan data.
  def inspect_jpeg(bytes)
    # Walk marker segments until the first supported start-of-frame marker.
    offset = 2
    dimensions = nil
    private_metadata = []
    while offset < bytes.bytesize
      offset += 1 while offset < bytes.bytesize && bytes.getbyte(offset) != 0xFF
      break if offset >= bytes.bytesize
      offset += 1 while offset < bytes.bytesize && bytes.getbyte(offset) == 0xFF
      break if offset >= bytes.bytesize
      marker = bytes.getbyte(offset)
      offset += 1
      next if marker == 0x00 || marker == 0x01 || (0xD0..0xD9).cover?(marker)
      raise ArgumentError, "JPEG contains a truncated marker" if offset + 2 > bytes.bytesize

      segment_length = bytes.byteslice(offset, 2).unpack1("n")
      raise ArgumentError, "JPEG marker length is invalid" if segment_length < 2
      segment_end = offset + segment_length
      raise ArgumentError, "JPEG contains a truncated marker segment" if segment_end > bytes.bytesize
      segment_data = bytes.byteslice(offset + 2, segment_length - 2)
      if JPEG_START_OF_FRAME_MARKERS.include?(marker)
        raise ArgumentError, "JPEG start-of-frame segment is malformed" if segment_data.bytesize < 5
        height, width = segment_data.byteslice(1, 4).unpack("nn")
        dimensions ||= { width: width, height: height }
      end
      private_metadata << "JPEG APP1 (EXIF/XMP)" if marker == 0xE1
      private_metadata << "JPEG APP13 (IPTC)" if marker == 0xED
      private_metadata << "JPEG COM" if marker == 0xFE
      offset = segment_end
      break if marker == 0xDA
    end

    # Reject JPEG variants whose dimensions cannot be established safely.
    unless dimensions && dimensions.fetch(:width).positive? && dimensions.fetch(:height).positive?
      raise ArgumentError, "JPEG has no supported start-of-frame dimensions"
    end
    [dimensions, private_metadata]
  end

  # Applies publication size, dimension, and privacy limits to inspected bytes.
  #
  # @param image_info [Hash] result returned by `inspect_image`.
  # @param label [String] path or author-facing label used in diagnostics.
  # @return [Array<String>] policy errors; empty means the asset is web-ready.
  # @note Pure validation with no I/O or mutation.
  def validate_image_policy(image_info, label)
    # Check bounded transfer and decode dimensions before metadata details.
    issues = []
    if image_info.fetch(:bytes) > MAX_IMAGE_BYTES
      issues << "#{label}: image exceeds #{MAX_IMAGE_BYTES / 1024 / 1024} MiB"
    end
    if [image_info.fetch(:width), image_info.fetch(:height)].max > MAX_IMAGE_EDGE
      issues << "#{label}: longest edge exceeds #{MAX_IMAGE_EDGE}px"
    end

    # Reject containers capable of leaking GPS, author, device, or comments.
    metadata = image_info.fetch(:private_metadata)
    issues << "#{label}: remove private metadata before publishing (#{metadata.join(', ')})" unless metadata.empty?
    issues
  end

  # Tests whether an encoded image format matches its filename extension.
  #
  # @param image_info [Hash] result returned by `inspect_image`; its `:format`
  #   value must be `:jpeg` or `:png`.
  # @param extension [String] lowercase filename extension including the dot.
  # @return [Boolean] true for JPG/JPEG bytes with `.jpg`/`.jpeg`, or PNG
  #   bytes with `.png`; false for every mismatch.
  # @note Pure validation with no file I/O.
  def image_format_matches_extension?(image_info, extension)
    # Map both accepted JPEG suffixes to the one encoded format identifier.
    expected_format = extension == ".png" ? :png : :jpeg
    image_info.fetch(:format) == expected_format
  end

  # Builds the canonical unpublished Markdown record created by `add`.
  #
  # @param title [String] non-empty initial display title.
  # @param date [Date] exact capture date.
  # @param image [String] root-relative public image path.
  # @param width [Integer] positive encoded width in pixels.
  # @param height [Integer] positive encoded height in pixels.
  # @param variant [String] approved archive variant.
  # @param home_slot [String, nil] optional approved homepage slot.
  # @return [String] UTF-8 Markdown containing complete draft front matter.
  # @note Pure formatting; it performs no file I/O.
  def build_draft_record(title:, date:, image:, width:, height:, variant:, home_slot:)
    # Encode author strings as JSON, which is valid YAML and avoids quote bugs.
    home_slot_value = home_slot ? JSON.generate(home_slot) : ""

    # Keep publication and privacy opt-in visibly adjacent in the template.
    <<~MARKDOWN
      ---
      title: #{JSON.generate(title)}
      date: "#{date.iso8601}"
      image: #{JSON.generate(image)}
      alt: ""
      width: #{width}
      height: #{height}
      location: ""
      rights: self
      credit: "Youyang Du"
      source_url: ""
      variant: #{variant}
      home_slot: #{home_slot_value}
      privacy_reviewed: false
      published: false
      ---

      <!-- Replace this comment with the photograph's public caption or story. -->
    MARKDOWN
  end

  # Validates a scalar string field and appends diagnostics in place.
  #
  # @param data [Hash] parsed front matter.
  # @param field [String] field name to inspect.
  # @param record_name [String] relative record path for diagnostics.
  # @param issues [Array<String>] mutable diagnostic collection.
  # @param maximum [Integer] maximum accepted character count.
  # @param allow_empty [Boolean] whether an empty string is valid.
  # @param optional [Boolean] whether a missing key is valid.
  # @return [void]
  # @note Mutates only the supplied `issues` array.
  def validate_string_field(data, field, record_name, issues, maximum:, allow_empty:, optional: false)
    # Ignore truly optional omissions before enforcing scalar string shape.
    return if optional && !data.key?(field)
    value = data[field]
    unless value.is_a?(String)
      issues << "#{record_name}: #{field} must be a string"
      return
    end

    # Enforce meaningful publication text and bounded metadata lengths.
    issues << "#{record_name}: #{field} cannot be empty when published" if !allow_empty && value.strip.empty?
    issues << "#{record_name}: #{field} must be at most #{maximum} characters" if value.length > maximum
  end

  # Converts a YAML date value into an exact calendar date.
  #
  # @param value [Date, String, Object] parsed YAML value.
  # @return [Date, nil] exact date, or nil when the source is not `YYYY-MM-DD`.
  # @note Pure conversion with no I/O.
  def parse_iso_date(value)
    # Preserve safe-loaded Date values while requiring exact strings otherwise.
    return value if value.is_a?(Date) && !value.is_a?(DateTime)
    return nil unless value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}\z/)

    # Reject impossible dates instead of allowing Date.parse normalization.
    Date.iso8601(value)
  rescue Date::Error
    nil
  end

  # Normalizes and confines a public image path to the Gallery asset directory.
  #
  # @param value [Object] front-matter image value.
  # @param record_name [String] relative record path for diagnostics.
  # @param issues [Array<String>] mutable diagnostic collection.
  # @return [String, nil] canonical forward-slash repository-relative path.
  # @note Mutates only the supplied `issues` array.
  def normalize_image_reference(value, record_name, issues)
    # Require a root-relative string before cleaning path segments.
    unless value.is_a?(String) && value.start_with?("/")
      issues << "#{record_name}: image must be a root-relative string under /#{IMAGE_DIRECTORY}/"
      return nil
    end
    candidate = Pathname.new(value.delete_prefix("/")).cleanpath.to_s.tr("\\", "/")
    extension = File.extname(candidate)
    unless candidate.start_with?("#{IMAGE_DIRECTORY}/") && SUPPORTED_EXTENSIONS.include?(extension)
      issues << "#{record_name}: image must use lowercase .jpg, .jpeg, or .png under /#{IMAGE_DIRECTORY}/"
      return nil
    end

    # Reject path traversal that cleanpath would otherwise silently normalize.
    if value.include?("..") || candidate.start_with?("../")
      issues << "#{record_name}: image path cannot contain parent traversal"
      return nil
    end
    candidate
  end

  # Detects symbolic links in a path from the file up to an expected boundary.
  #
  # @param path [Pathname, String] candidate file or directory path.
  # @param boundary [Pathname, String] inclusive ancestor that terminates the
  #   scan; paths outside this boundary are treated as unsafe.
  # @return [Boolean] true when any component is a symbolic link or the path is
  #   not contained by `boundary`; false for a regular in-boundary path.
  # @note Reads filesystem metadata without following or mutating links.
  def path_contains_symlink?(path, boundary)
    # Walk upward from the lexical expanded path so each authored component is
    # inspected before a filesystem resolver could hide a redirection.
    current_path = Pathname.new(path).expand_path
    boundary_path = Pathname.new(boundary).expand_path
    loop do
      return true if current_path.symlink?
      return false if current_path == boundary_path

      parent_path = current_path.parent
      return true if parent_path == current_path

      current_path = parent_path
    end
  end

  # Tests whether a value is an absolute HTTP or HTTPS URL.
  #
  # @param value [String, nil] optional source URL.
  # @return [Boolean] true only for a parseable URL with a non-empty host.
  # @note Pure validation with no network access.
  def valid_http_url?(value)
    # Parse only non-empty strings and constrain the public-link schemes.
    return false unless value.is_a?(String) && !value.empty?
    uri = URI.parse(value)
    %w[http https].include?(uri.scheme) && !uri.host.to_s.empty?
  rescue URI::InvalidURIError
    false
  end

  # Converts a scalar string into its trimmed optional representation.
  #
  # @param value [Object] candidate value.
  # @return [String, nil] trimmed non-empty string, otherwise nil.
  # @note Pure normalization with no I/O.
  def normalized_optional_string(value)
    # Treat non-string and whitespace-only values as absent.
    return nil unless value.is_a?(String)
    normalized = value.strip
    normalized.empty? ? nil : normalized
  end

  # Produces a stable forward-slash path relative to the repository root.
  #
  # @param path [Pathname, String] path inside `root`.
  # @param root [Pathname, String] enclosing repository root.
  # @return [String] relative path using `/` separators on every platform.
  # @raise [ArgumentError] if `path` is not contained by `root`.
  # @note Pure path formatting with no file I/O.
  def relative_path(path, root)
    # Use Pathname containment semantics, then normalize Windows separators.
    Pathname.new(path).expand_path.relative_path_from(Pathname.new(root).expand_path).to_s.tr("\\", "/")
  end
end

# Execute the CLI only for direct invocation; Jekyll and tests require the
# module without triggering a process exit.
exit GalleryPipeline.run_cli(ARGV) if $PROGRAM_NAME == __FILE__
