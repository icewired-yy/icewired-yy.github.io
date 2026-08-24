---
layout: default
title: Gallery
permalink: /gallery/
description: Photographs, small observations, and the life surrounding the work.
nav: true
nav_order: 4
contemplative_surface: true
gallery_surface: true
nav_key: gallery
---

{% assign gallery_published = site.gallery | where: 'published', true | sort: 'date' | reverse %}
<div class="gallery-page" data-gallery-count="{{ gallery_published.size }}">
  <header class="gallery-page__intro">
    <h1 class="gallery-page__title"><span>Gallery</span></h1>
    <p class="gallery-page__lede">
      A place for photographs, small observations, and the life surrounding the work.
    </p>
  </header>

  {% if gallery_published.size > 0 %}
    {% assign gallery_years = gallery_published | group_by_exp: 'item', "item.date | date: '%Y'" %}
    <div class="gallery-page__archive">
      {% for gallery_year in gallery_years %}
        <section class="gallery-year" aria-labelledby="gallery-year-{{ gallery_year.name }}">
          <div class="gallery-year__heading">
            <h2 id="gallery-year-{{ gallery_year.name }}">{{ gallery_year.name }}</h2>
            <p>{{ gallery_year.items.size }} {% if gallery_year.items.size == 1 %}photograph{% else %}photographs{% endif %}</p>
          </div>
          <div class="gallery-grid">
            {% for gallery_item in gallery_year.items %}
              {% if forloop.parentloop.first and forloop.first %}
                {% include gallery-card.liquid item=gallery_item loading='eager' fetchpriority='high' %}
              {% else %}
                {% include gallery-card.liquid item=gallery_item loading='lazy' %}
              {% endif %}
            {% endfor %}
          </div>
        </section>
      {% endfor %}
    </div>
  {% else %}
    <section class="gallery-empty" aria-labelledby="gallery-empty-title">
      <h2 id="gallery-empty-title">The archive is being assembled.</h2>
      <p>Reviewed photographs and their notes will appear here together.</p>
    </section>
  {% endif %}
</div>
