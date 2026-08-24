# Gallery authoring workflow

The Gallery is generated from one Markdown record per photograph. The same
record drives both `/gallery/` and the four-image homepage preview, so image
paths and captions are never duplicated in page templates.

## 1. Prepare a public image

Keep camera originals outside this public repository. Export a web-ready JPG,
JPEG, or PNG that meets these machine-checkable requirements:

- longest edge no larger than 2400 px;
- file size no larger than 2 MiB;
- no EXIF, GPS, XMP, IPTC, PNG text chunks, or embedded comments.

The repository tool verifies the container type, dimensions, byte size, paired
record, and supported metadata blocks. It deliberately does not alter the
photograph.

Before importing, manually confirm that orientation is baked into the pixels,
colour is suitable for the web (normally sRGB), and the visible scene contains
no private screens, documents, addresses, real-time location clues, or people
who have not agreed to publication. The `privacy_reviewed` field records this
human review; software cannot infer it from the pixels.

## 2. Create the paired draft

From the repository root, run:

```powershell
& 'C:\Ruby32-x64\bin\ruby.exe' bin/gallery.rb add `
  'C:\path\to\masdar-evening.jpg' `
  --date 2026-08-24 `
  --slug masdar-evening `
  --title 'Masdar evening' `
  --variant wide
```

This creates a paired identity:

```text
assets/img/gallery/2026/2026-08-24-masdar-evening.jpg
_gallery/2026-08-24-masdar-evening.md
```

The generated Markdown is intentionally a draft:

```yaml
---
title: "Masdar evening"
date: "2026-08-24"
image: "/assets/img/gallery/2026/2026-08-24-masdar-evening.jpg"
alt: "Evening light falling across a quiet walkway in Masdar City"
width: 2000
height: 1333
location: "Masdar City, Abu Dhabi"
rights: self
credit: "Youyang Du"
source_url: ""
variant: wide
home_slot:
privacy_reviewed: false
published: false
---

Leaving the lab after the heat, the light had become unexpectedly quiet.
```

The Markdown body is the public caption or longer story. `alt` describes what
is visible; it should not repeat the title or caption.

## 3. Choose layout and homepage placement

`variant` controls only the chronological Gallery grid:

- `standard`: ordinary landscape or square study;
- `wide`: a wider visual pause across the grid;
- `tall`: a portrait-oriented study.

`home_slot` is optional. The homepage composition is published only when all
four unique slots exist:

```text
wide, tall, small, long
```

This preserves the approved artistic arrangement instead of placing four
arbitrary recent aspect ratios into it. Changing a homepage photograph means
moving its slot to the replacement record in the same commit.

## 4. Review and publish

After writing the caption and alt text, review the rendered crop and privacy,
then set:

```yaml
privacy_reviewed: true
published: true
```

Run the same check used by Jekyll and GitHub Actions:

```powershell
& 'C:\Ruby32-x64\bin\ruby.exe' bin/gallery.rb check
```

Production builds run `check --production`, which rejects every draft. A draft
is safe only while it remains local: committing its image to this public GitHub
repository makes the bytes public even if `published` is false.

Commit each Markdown/image pair together. Pushing the commit triggers the
existing Jekyll deployment; `/gallery/` and the homepage preview then update
from the same `site.gallery` collection automatically.

## Field contract

- Required on every record: `title`, `date`, `image`, `alt`, numeric `width` and
  `height`, `rights`, `variant`, Boolean `privacy_reviewed`, and Boolean
  `published`.
- Required before publication: non-empty title, alt text, Markdown caption, and
  `privacy_reviewed: true`.
- `rights` is `self` or `licensed`. Licensed work also requires `credit` and an
  HTTP(S) `source_url`.
- `variant` is `standard`, `wide`, or `tall`.
- `home_slot` is blank or one of `wide`, `tall`, `small`, or `long`.
- Unknown fields fail validation so misspellings cannot silently change output.
