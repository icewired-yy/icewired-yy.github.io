# frozen_string_literal: true

require "json"
require "minitest/autorun"
require "pathname"
require "tmpdir"
require "zlib"

require_relative "../bin/gallery"

# Exercises Gallery authoring and validation without external image libraries.
#
# Each test owns a temporary repository and writes tiny valid PNG fixtures, so
# the production checkout is never mutated and test outcomes are deterministic
# on Windows and Linux.
class GalleryPipelineTest < Minitest::Test
  # Confirms that a newly configured repository may have no photographs yet.
  #
  # @return [void]
  # @note Creates and removes a temporary directory.
  def test_empty_repository_is_valid
    # Validate both local and production modes against the intentional empty state.
    with_repository do |root|
      assert_empty GalleryPipeline.validate_repository(root: root)
      assert_empty GalleryPipeline.validate_repository(root: root, production: true)
    end
  end

  # Confirms `add` creates one basename-matched draft with measured dimensions.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_add_creates_safe_draft_pair
    # Create a reviewed source asset outside the managed Gallery directory.
    with_repository do |root|
      source = root.join("source.png")
      write_png(source, width: 64, height: 48)

      # Add the source and verify the generated image/record contract.
      created = GalleryPipeline.add_entry(
        source: source,
        date: "2026-08-24",
        slug: "quiet-evening",
        title: "Quiet evening",
        variant: "wide",
        root: root
      )
      assert created.fetch(:image).file?
      assert created.fetch(:record).file?
      record = created.fetch(:record).read(encoding: "UTF-8")
      assert_includes record, "width: 64"
      assert_includes record, "height: 48"
      assert_includes record, "published: false"
      assert_empty GalleryPipeline.validate_repository(root: root)
      assert GalleryPipeline.validate_repository(root: root, production: true).any? { |issue| issue.include?("drafts cannot") }
    end
  end

  # Confirms four reviewed records populate each homepage slot exactly once.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_four_published_home_slots_are_valid
    # Build a complete homepage composition from four independent records.
    with_repository do |root|
      GalleryPipeline::HOME_SLOTS.each_with_index do |slot, index|
        write_gallery_entry(root, date: "2026-08-#{format('%02d', 20 + index)}", slug: "study-#{index + 1}", home_slot: slot)
      end

      # Both local and public deployment checks must accept the complete set.
      assert_empty GalleryPipeline.validate_repository(root: root)
      assert_empty GalleryPipeline.validate_repository(root: root, production: true)
    end
  end

  # Confirms incomplete or duplicate homepage assignments fail as one unit.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_homepage_slots_are_unique_and_complete
    # Assign the same slot twice to exercise duplicate and missing-slot errors.
    with_repository do |root|
      write_gallery_entry(root, date: "2026-08-20", slug: "first-study", home_slot: "wide")
      write_gallery_entry(root, date: "2026-08-21", slug: "second-study", home_slot: "wide")
      issues = GalleryPipeline.validate_repository(root: root)

      # Report both the collision and the incomplete four-slot composition.
      assert issues.any? { |issue| issue.include?("assigned to multiple") }
      assert issues.any? { |issue| issue.include?("homepage preview must provide each slot") }
    end
  end

  # Confirms metadata-bearing image containers cannot enter the public archive.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_private_png_metadata_is_rejected
    # Pair a valid record with a PNG text chunk that could contain private data.
    with_repository do |root|
      write_gallery_entry(root, date: "2026-08-20", slug: "metadata-study", metadata_text: "GPS=24.0,54.0", published: false)
      issues = GalleryPipeline.validate_repository(root: root)

      # The diagnostic must name the exact unsafe container chunk.
      assert issues.any? { |issue| issue.include?("remove private metadata") && issue.include?("PNG tEXt") }
    end
  end

  # Confirms publication requires visible text and an explicit privacy decision.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_published_record_requires_alt_caption_and_privacy_review
    # Create a public-marked record with deliberately incomplete editorial data.
    with_repository do |root|
      write_gallery_entry(
        root,
        date: "2026-08-20",
        slug: "unfinished-study",
        alt: "",
        caption: "<!-- still private -->",
        privacy_reviewed: false
      )
      issues = GalleryPipeline.validate_repository(root: root)

      # Surface each actionable publication defect in the same pass.
      assert issues.any? { |issue| issue.include?("alt cannot be empty") }
      assert issues.any? { |issue| issue.include?("privacy_reviewed must be true") }
      assert issues.any? { |issue| issue.include?("require a Markdown caption") }
    end
  end

  # Confirms orphaned assets and authored dimension drift cannot be deployed.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_orphan_and_dimension_mismatch_are_reported
    # Create one paired record with bad width and one unpaired image.
    with_repository do |root|
      write_gallery_entry(root, date: "2026-08-20", slug: "measured-study", authored_width: 65, published: false)
      orphan = root.join("assets/img/gallery/2026/2026-08-21-orphan.png")
      write_png(orphan, width: 64, height: 48)
      issues = GalleryPipeline.validate_repository(root: root)

      # Preserve both provenance and layout-stability diagnostics.
      assert issues.any? { |issue| issue.include?("width 65 does not match image width 64") }
      assert issues.any? { |issue| issue.include?("image has no companion") }
    end
  end

  # Confirms no file can hide in the publicly copied Gallery asset directory.
  #
  # @return [void]
  # @note Writes only inside a temporary repository.
  def test_unsupported_and_noncanonical_assets_are_rejected
    # Add two unpaired files that the earlier extension-only scan could miss.
    with_repository do |root|
      asset_directory = root.join("assets/img/gallery/2026")
      FileUtils.mkdir_p(asset_directory)
      asset_directory.join("private.heic").binwrite("not-a-public-gallery-image")
      write_png(asset_directory.join("uppercase.JPG"), width: 64, height: 48)
      issues = GalleryPipeline.validate_repository(root: root, production: true)

      # Both files must fail before Jekyll can copy the directory publicly.
      assert issues.any? { |issue| issue.include?("private.heic") && issue.include?("unsupported Gallery asset") }
      assert issues.any? { |issue| issue.include?("uppercase.JPG") && issue.include?("lowercase") }
    end
  end

  # Confirms authored identity and encoded image type cannot disagree.
  #
  # @return [void]
  # @note Writes and renames fixtures only inside a temporary repository.
  def test_basename_and_encoded_format_contracts_are_enforced
    # Preserve PNG bytes under a JPG suffix and add a noncanonical record slug.
    with_repository do |root|
      mismatched = write_gallery_entry(root, date: "2026-08-20", slug: "format-study", published: false)
      mismatched_image = mismatched.fetch(:image).sub_ext(".jpg")
      FileUtils.mv(mismatched.fetch(:image), mismatched_image)
      mismatched_record = mismatched.fetch(:record)
      mismatched_record.write(
        mismatched_record.read(encoding: "UTF-8").gsub("format-study.png", "format-study.jpg"),
        mode: "w",
        encoding: "UTF-8"
      )
      write_gallery_entry(root, date: "2026-08-21", slug: "Bad_Slug", published: false)
      issues = GalleryPipeline.validate_repository(root: root)

      # Report MIME-risking bytes and the hand-authored filename separately.
      assert issues.any? { |issue| issue.include?("extension .jpg does not match its encoded png format") }
      assert issues.any? { |issue| issue.include?("basename must use YYYY-MM-DD-lowercase-kebab-slug") }
    end
  end

  # Confirms authored front-matter scalars cannot break Gallery HTML contexts.
  #
  # @return [void]
  # @note Reads production Liquid includes without mutating the repository.
  def test_gallery_templates_escape_authored_scalars
    # Read the two rendering boundaries that receive Gallery metadata.
    gallery_card = GalleryPipeline::DEFAULT_ROOT.join("_includes/gallery-card.liquid").read(encoding: "UTF-8")
    figure = GalleryPipeline::DEFAULT_ROOT.join("_includes/figure.liquid").read(encoding: "UTF-8")

    # Keep Markdown body rendering deliberate while escaping every scalar sink.
    %w[location title credit source_url].each do |field|
      assert_includes gallery_card, "gallery_item.#{field} | escape"
    end
    assert_includes figure, "include.figure_class | escape"
    assert_includes figure, "include.class | escape"
    assert_includes figure, "include.alt | escape"
    assert_includes figure, "include.title | escape"
  end

  private

  # Provides a minimal isolated repository to a test block.
  #
  # @yieldparam root [Pathname] temporary repository root with Gallery dirs.
  # @return [void]
  # @note Creates and recursively removes a temporary directory.
  def with_repository
    # Build only the directories the production workflow is allowed to scan.
    Dir.mktmpdir("gallery-pipeline-") do |directory|
      root = Pathname.new(directory)
      FileUtils.mkdir_p(root.join("_gallery"))
      FileUtils.mkdir_p(root.join("assets/img/gallery"))

      # Yield ownership for one test and let Dir.mktmpdir guarantee cleanup.
      yield root
    end
  end

  # Writes one paired Gallery fixture with a complete front-matter contract.
  #
  # @param root [Pathname] temporary repository root.
  # @param date [String] exact ISO capture date.
  # @param slug [String] basename suffix.
  # @param home_slot [String, nil] optional homepage position.
  # @param published [Boolean] public collection state.
  # @param alt [String] authored alternative text.
  # @param caption [String] Markdown body.
  # @param privacy_reviewed [Boolean] explicit visual privacy decision.
  # @param metadata_text [String, nil] optional unsafe PNG text fixture.
  # @param authored_width [Integer] width written to front matter.
  # @return [Hash<Symbol, Pathname>] created image and record paths.
  # @note Writes a PNG and Markdown record inside the temporary repository.
  def write_gallery_entry(
    root,
    date:,
    slug:,
    home_slot: nil,
    published: true,
    alt: "A quiet geometric colour study",
    caption: "A short public observation.",
    privacy_reviewed: true,
    metadata_text: nil,
    authored_width: 64
  )
    # Derive the production basename and paired paths from the supplied date.
    capture_date = Date.iso8601(date)
    basename = "#{date}-#{slug}"
    image_path = root.join("assets/img/gallery", capture_date.year.to_s, "#{basename}.png")
    record_path = root.join("_gallery", "#{basename}.md")
    write_png(image_path, width: 64, height: 48, metadata_text: metadata_text)

    # Write JSON-quoted strings so the fixture remains valid strict YAML.
    home_slot_value = home_slot ? JSON.generate(home_slot) : ""
    record_path.write(
      <<~MARKDOWN,
        ---
        title: #{JSON.generate(slug.split('-').map(&:capitalize).join(' '))}
        date: "#{date}"
        image: #{JSON.generate("/assets/img/gallery/#{capture_date.year}/#{basename}.png")}
        alt: #{JSON.generate(alt)}
        width: #{authored_width}
        height: 48
        location: "Test studio"
        rights: self
        credit: "Youyang Du"
        source_url: ""
        variant: standard
        home_slot: #{home_slot_value}
        privacy_reviewed: #{privacy_reviewed}
        published: #{published}
        ---

        #{caption}
      MARKDOWN
      mode: "w",
      encoding: "UTF-8"
    )

    # Return both paths for tests that need additional targeted corruption.
    { image: image_path, record: record_path }
  end

  # Writes a small structurally valid RGBA PNG with optional text metadata.
  #
  # @param path [Pathname] destination path.
  # @param width [Integer] positive encoded width.
  # @param height [Integer] positive encoded height.
  # @param metadata_text [String, nil] optional text stored in a `tEXt` chunk.
  # @return [void]
  # @note Creates parent directories and writes a binary fixture.
  def write_png(path, width:, height:, metadata_text: nil)
    # Build deterministic green RGBA scanlines and the required PNG chunks.
    FileUtils.mkdir_p(path.dirname)
    pixel = [47, 96, 76, 255].pack("C4")
    scanline = "\x00".b + (pixel * width)
    image_data = Zlib.deflate(scanline * height)
    chunks = [png_chunk("IHDR", [width, height, 8, 6, 0, 0, 0].pack("NNC5"))]
    chunks << png_chunk("tEXt", "Comment\x00#{metadata_text}".b) if metadata_text
    chunks << png_chunk("IDAT", image_data)
    chunks << png_chunk("IEND", "".b)

    # Persist a standards-compliant container for the binary parser.
    path.binwrite("\x89PNG\r\n\x1A\n".b + chunks.join)
  end

  # Encodes one PNG chunk including its CRC.
  #
  # @param type [String] four-byte ASCII PNG chunk type.
  # @param data [String] binary chunk payload, which may be empty.
  # @return [String] complete length/type/data/CRC binary chunk.
  # @note Pure binary formatting with no I/O.
  def png_chunk(type, data)
    # Compute CRC over type and data as required by the PNG container format.
    type_bytes = type.b
    [data.bytesize].pack("N") + type_bytes + data + [Zlib.crc32(type_bytes + data)].pack("N")
  end
end
