---
layout: default
permalink: /publications/
title: Research
description: Research on recovering, representing, and rendering fine-scale appearance.
nav: true
nav_order: 2
contemplative_surface: true
site_surface: true
research_surface: true
nav_key: research
---

<div class="contemplative-page-main research-page">
  <header class="page-intro site-width">
    <h1 class="page-title section-title section-title-research"><span>Research</span></h1>
    <p class="page-lede">
      Recent work on recovering, representing, and rendering fine-scale appearance.
      The publication record stays concise while each entry leads to its complete materials.
    </p>
  </header>

  <section class="section site-width page-collection research-collection" aria-labelledby="published-work-title">
    <div class="section-heading collection-heading">
      <h2 id="published-work-title">Published work</h2>
      <p>Conference papers in reverse chronological order, generated directly from the bibliography.</p>
    </div>

    <div class="collection-list work-list research-list" aria-label="Research publications">
      {% bibliography --group_by none --template bib-contemplative %}
    </div>
  </section>
</div>
