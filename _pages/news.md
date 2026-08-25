---
layout: default
title: News
permalink: /news/
description: Recent academic and personal milestones from Youyang Du.
nav: false
published: true
contemplative_surface: true
site_surface: true
news_surface: true
nav_key: news
---

<div class="contemplative-page-main news-page" data-news-count="{{ site.news | size }}">
  <header class="page-intro" aria-labelledby="news-page-title">
    <h1 class="page-title section-title section-title-news" id="news-page-title"><span>News</span></h1>
    <p class="page-lede">A chronological record of recent research, study, and personal milestones.</p>
  </header>

  <section class="page-collection news-collection" aria-labelledby="news-archive-heading">
    <div class="collection-heading">
      <h2 id="news-archive-heading">All updates</h2>
    </div>
    {% include contemplative-news-list.liquid %}
  </section>
</div>
