---
layout: default
title: Projects
permalink: /projects/
description: Selected graphics and software projects by Youyang Du.
nav: true
nav_order: 3
display_categories: [Rendering, fun]
contemplative_surface: true
site_surface: true
projects_surface: true
nav_key: projects
---

<div class="contemplative-page-main projects-page">
  <header class="page-intro">
    <h1 class="page-title section-title section-title-projects"><span>Projects</span></h1>
    <p class="page-lede">
      Systems built to make rendering ideas inspectable and everyday image work more direct.
      Projects remain separate from the publication record.
    </p>
  </header>

  <section class="page-collection projects-collection" aria-labelledby="selected-projects-title">
    <div class="section-heading collection-heading">
      <h2 id="selected-projects-title">Selected builds</h2>
      <p>Open implementations for learning, experimentation, and practical use.</p>
    </div>

    {% include contemplative-project-list.liquid categories=page.display_categories heading_level='h3' %}
  </section>
</div>
