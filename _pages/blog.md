---
layout: default
permalink: /blog/
title: Notes
nav: true
nav_order: 1
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 5
  sort_field: date
  sort_reverse: true
  trail:
    before: 1 # The number of links before the current page
    after: 3 # The number of links after the current page
---

<div class="post contemplative-notes notes-index">
  {% assign blog_name_size = site.blog_name | size %}
  {% assign blog_description_size = site.blog_description | size %}

  <header class="notes-index-header">
    <h1 class="notes-index-title"><span>Notes</span></h1>
    {% if blog_name_size > 0 or blog_description_size > 0 %}
      <p class="notes-index-description">
        {% if blog_name_size > 0 %}<strong>{{ site.blog_name }}</strong>{% endif %}
        {% if blog_name_size > 0 and blog_description_size > 0 %}<span aria-hidden="true"> — </span>{% endif %}
        {% if blog_description_size > 0 %}{{ site.blog_description }}{% endif %}
      </p>
    {% endif %}
  </header>

  {% assign featured_posts = site.posts | where: "featured", "true" %}
  {% if featured_posts.size > 0 %}
    <section class="notes-featured" aria-labelledby="featured-notes-title">
      <div class="notes-section-heading">
        <h2 id="featured-notes-title">Pinned</h2>
        <p>Long-form notes that anchor the current line of inquiry.</p>
      </div>

      <div class="notes-featured-list">
        {% for post in featured_posts %}
          {% if post.external_source == blank %}
            {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
          {% else %}
            {% assign read_time = post.feed_content | strip_html | number_of_words | divided_by: 180 | plus: 1 %}
          {% endif %}
          {% assign year = post.date | date: "%Y" %}

          <article class="notes-featured-entry">
            <h3>
              {% if post.redirect == blank %}
                <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
              {% elsif post.redirect contains '://' %}
                <a href="{{ post.redirect }}" target="_blank" rel="external nofollow noopener">{{ post.title }}</a>
              {% else %}
                <a href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
              {% endif %}
            </h3>
            {% if post.description %}<p>{{ post.description }}</p>{% endif %}
            <div class="notes-entry-meta">
              <span>{{ read_time }} min read</span>
              <span aria-hidden="true">·</span>
              <a href="{{ year | prepend: '/blog/' | prepend: site.baseurl }}">{{ year }}</a>
            </div>
          </article>
        {% endfor %}
      </div>
    </section>
  {% endif %}

  <section class="notes-collection" aria-labelledby="all-notes-title">
    <div class="notes-section-heading">
      <h2 id="all-notes-title">All notes</h2>
      <p>Derivations, paper readings, and observations in reverse chronological order.</p>
    </div>

    <ol class="notes-index-list">
      {% if page.pagination.enabled %}
        {% assign postlist = paginator.posts %}
      {% else %}
        {% assign postlist = site.posts %}
      {% endif %}

      {% for post in postlist %}
        {% if post.external_source == blank %}
          {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
        {% else %}
          {% assign read_time = post.feed_content | strip_html | number_of_words | divided_by: 180 | plus: 1 %}
        {% endif %}
        {% assign year = post.date | date: "%Y" %}
        {% assign tags = post.tags | join: "" %}
        {% assign categories = post.categories | join: "" %}

        <li>
          <article class="notes-index-entry{% if post.thumbnail %} notes-index-entry-with-image{% endif %}">
            <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%d %b %Y' }}</time>

            <div class="notes-entry-copy">
              <h3>
                {% if post.redirect == blank %}
                  <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
                {% elsif post.redirect contains '://' %}
                  <a href="{{ post.redirect }}" target="_blank" rel="external nofollow noopener">{{ post.title }}</a>
                {% else %}
                  <a href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
                {% endif %}
              </h3>
              {% if post.description %}<p class="notes-entry-summary">{{ post.description }}</p>{% endif %}

              <div class="notes-entry-meta">
                <span>{{ read_time }} min read</span>
                {% if post.external_source %}
                  <span aria-hidden="true">·</span>
                  <span>{{ post.external_source }}</span>
                {% endif %}
              </div>

              <div class="notes-entry-topics" aria-label="Note topics">
                <a href="{{ year | prepend: '/blog/' | prepend: site.baseurl }}">{{ year }}</a>
                {% if tags != "" %}
                  {% for tag in post.tags %}
                    <a href="{{ tag | slugify | prepend: '/blog/tag/' | prepend: site.baseurl }}">#{{ tag }}</a>
                  {% endfor %}
                {% endif %}
                {% if categories != "" %}
                  {% for category in post.categories %}
                    <a href="{{ category | slugify | prepend: '/blog/category/' | prepend: site.baseurl }}">{{ category }}</a>
                  {% endfor %}
                {% endif %}
              </div>
            </div>

            {% if post.thumbnail %}
              <figure class="notes-entry-image">
                <img
                  src="{{ post.thumbnail | relative_url }}"
                  alt="{{ post.title | escape }}"
                  width="320"
                  height="200"
                  loading="lazy"
                >
              </figure>
            {% endif %}
          </article>
        </li>
      {% endfor %}
    </ol>
  </section>

  {% if page.pagination.enabled %}
    {% include pagination.liquid %}
  {% endif %}
</div>
