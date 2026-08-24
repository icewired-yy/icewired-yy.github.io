# frozen_string_literal: true

require_relative "../bin/gallery"

# Validate source records before Jekyll filters unpublished collection entries.
# Production builds additionally reject drafts because every asset copied to a
# public repository remains addressable even when no page links to it.
Jekyll::Hooks.register :site, :after_init do |site|
  production = ENV.fetch("JEKYLL_ENV", "development") == "production"
  issues = GalleryPipeline.validate_repository(root: site.source, production: production)
  next if issues.empty?

  details = issues.map { |issue| "  - #{issue}" }.join("\n")
  raise Jekyll::Errors::FatalException, "Gallery validation failed:\n#{details}"
end
