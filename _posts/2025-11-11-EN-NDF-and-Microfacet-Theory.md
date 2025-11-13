---
layout: distill
title: NDF and Microfacet Model
description: To show what is NDF and how to derive the general formulate of Microfacet Model
tags: rendering, basic theory
giscus_comments: true
date: 2025-11-11
featured: true
# mermaid:
#   enabled: true
#   zoomable: true
# code_diff: true
# map: true
# chart:
#   chartjs: true
#   echarts: true
#   vega_lite: true
# tikzjax: true
# typograms: true

bibliography: 2018-12-22-distill.bib

# Optionally, you can add a table of contents to your post.
# NOTES:
#   - make sure that TOC names match the actual section names
#     for hyperlinks within the post to work correctly.
#   - we may want to automate TOC generation in the future using
#     jekyll-toc plugin (https://github.com/toshimaru/jekyll-toc).
toc:
  - name: Preliminary
    # if a section has subsections, you can add them as follows:
    # subsections:
    #   - name: Example Child Subsection 1
    #   - name: Example Child Subsection 2
  - name: Micro-surface & Macro-surface
  - name: Normal Distribution Function
---

# Preliminary

The target of writing this post is to record my understanding of microfacet theory. It will be updated whenever my understanding is refined. I will try to derive the microfacet model in a friendly way for all the readers that want to get familiar with this theory as well. It is greatly appreciated if one can figure out the mistake in this post and show in the comment below. Also, any discussion on this topic is welcome.

# Micro-surface & Macro-surface

Before get deeper into the microfacet theory, we need to answer why we need this theory. The reason is easy to realize. Let's look at the figure below:

<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="../assets/ndf_microfacet/macrosurface_microsurface.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    The observer receives the light from a pixel, whose footprint covers a large area of surface with complex microstructure.
</div>

We called the area of the object surface that covered by one pixel the `footprint`. As illustrated in the figure, there are many complex microstructures within that footprint, we call them `microsurface`. Due to these microstructures, the appearance of this area should be highly spatial-varying. However, since **one pixel can only return one RGB**, we need to summarize the appearance of these microstructures with only one RGB value. Obviously, we need to derive the statistical properities of the microsurface from its spatial properities. Once we have its statistical properites, we can assume that the area within the footprint is flat, which can use only one normal vector to describe it. called `macrosurface`. This assumed macrosurface needs a complex microfacet theory that summarizes the appearance into one value from its statistical properties. That's why we need the microfacet model.

# Normal Distribution Function

One important information we need to use to describe the microsurface's appearance, is the summarization of the normal on the microsurface. We can use a function called `Normal Distribution Function (NDF)` to describe it. One need to distinguish it from the `Probability Density Function (PDF)` of normal, which describe the probability of normal from a randomly sampled point on the microsurface.