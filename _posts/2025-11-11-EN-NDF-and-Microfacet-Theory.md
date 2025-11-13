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
  - name: Masking Funtion
---

## Preliminary

The target of writing this post is to record my understanding of microfacet theory. It will be updated whenever my understanding is refined. I will try to derive the microfacet model in a friendly way for all the readers that want to get familiar with this theory as well. It is greatly appreciated if one can figure out the mistake in this post and show in the comment below. Also, any discussion on this topic is welcome.

---

## Micro-surface & Macro-surface

| Symbol            | Definition                            |
| ------            | ----------                            |
| $\mathcal{M}$     | The surface area of microsurface      |
| $\mathcal{G}$     | The surface area of geometric surface |
| $p_m$             | The point on the microsurface $\mathcal{M}$ |
| $p_g$             | The point on the geometric surface $\mathcal{G}$ |
| $\omega_g$        | The normal of the geometric surface   |
| $<\cdot, \cdot>$  | The absolute inner product of two vectors |

Before get deeper into the microfacet theory, we need to answer why we need this theory. The reason is easy to realize. Let's look at the figure below:

<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="../assets/posts/ndf_microfacet/macrosurface_microsurface.png" class="img-fluid rounded z-depth-1" zoomable=true %}
    </div>
</div>
<div class="caption">
    The observer receives the light from a pixel, whose footprint covers a large area of surface with complex microstructure.
</div>

We called the area of the object surface that covered by one pixel the `footprint`. As illustrated in the figure, there are many complex microstructures within that footprint, we call them `microsurface`. Due to these microstructures, the appearance of this area should be highly spatial-varying. However, since **one pixel can only return one RGB**, we need to summarize the appearance of these microstructures with only one RGB value. Obviously, we need to derive the statistical (or aggregated) properities of the microsurface from its spatial properities. Once we have its statistical properites, we can assume that the area within the footprint is flat, which can use only one normal vector to describe it. called `macrosurface` or `geometric surface`. This assumed macrosurface needs a complex microfacet theory that summarizes the appearance into one value from its statistical properties. That's why we need the microfacet model.

<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="../assets/posts/ndf_microfacet/geo-micro.png" class="img-fluid rounded z-depth-1" zoomable=true %}
    </div>
</div>
<div class="caption">
    The bijecction between microsurface and geometric surface.
</div>

The classical microfacet theory has a basic assumption, that is there need to be a bijection between microsurface $\mathcal{M}$ and geometric surface $\mathcal{G}$. One, and only one point $p_m$ on the $\mathcal{M}$ can be projected to the $\mathcal{G}$ along the geometric normal $\omega_g$, leading to:

\begin{equation}
\label{eq: Relationship between micro and geo}
\int_{\mathcal{M}} <\omega_m(p_m), \omega_g> \mathrm{d} p_m = \int_{\mathcal{G}} \mathrm{d} p_g = A_g,
\end{equation}

where $A_g$ is the area of geometric surface. One can make $A_g = 1m^2$ without loss of generality. This term will always be cancelled out in the following derivation.

---

## Normal Distribution Function

| Symbol            | Definition                            |
| ------            | ----------                            |
| $\Omega$          | The positive hemisphere space         |
| $D(\omega)$       | The normal distribution function      |
| $\delta_{\omega^{\prime}}(\omega)$  | The dirac delta function, $+\infty$ if $\omega = \omega^{\prime}$ and 0 otherwise, normalized in the integral |
| $\omega_i$        | The incident direction                |
| $\omega_o$        | The outgoing direction                |
| $\omega_m$        | The normal of one point on the \mathcal{M} |


One important information we need to use to describe the microsurface's geometric appearance, is the summary of the normal on the microsurface. We can use a function called `Normal Distribution Function (NDF)` to describe it. One need to distinguish it from the `Probability Density Function (PDF)` of normal, which describe the probability of normal of a uniformly random-sampled point on the microsurface. The definition of the NDF is:

\begin{equation}
\label{eq: def of NDF}
D(\omega) = \int_{\mathcal{M}} \delta_{\omega}(\omega_m(p_m)) \mathrm{d} p_m.
\end{equation}

It describes the total area of the microsurface that their normal pointing at direction $\omega$. Thus, the unit of $D(\omega)$ is `$\frac{m^2}{sr}$`. Why we need to define the NDF? The reason is that, **NDF is a bridge to connect two different spaces**: one is the spatial space, that is, the microsurface space $\mathcal{M}$, and another is the statistical space, that is, the positive hemisphere space $\Omega$. An informal understanding from the relationship of unit is that, $D(\omega)\mathrm{d}\omega$ ($\frac{m^2}{sr} \cdot sr$) indicates all the differential area $\mathrm{d}p_m$ ($m^2$) whose normal pointing toward $\omega$. A more precise description of this relationship is that, given a subset $\Omega^{\prime}$ from the $\Omega$, we can have a corresponding subset $\mathcal{M}^{\prime}$ from $\mathcal{M}$ that $\mathcal{M}^{\prime}$ contains all the points on the microsurface whose normal inside the $\Omega^{\prime}$, and we have:

$$
\int_{\Omega^{\prime}} D(\omega) \mathrm{d} \omega = \int_{\mathcal{M}^{\prime}} \mathrm{d}p_m
$$

<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="../assets/posts/ndf_microfacet/relationship_ndf.png" class="img-fluid rounded z-depth-1" zoomable=true %}
    </div>
</div>
<div class="caption">
    The relationship between the statistical integral via NDF and the sptial integral to sum the specific area.
</div>

**We need to understand the NDF well before we get into the following content, this is the base of the microfacet theory.** 

Here are some deduction related to NDF:

**_Statistical area counting_**. The counting of the microsurface area can be converted from spatial integral to statistical integral via NDF, leading to:

$$
\int_{\Omega} D(\omega) <\omega, \omega_g> \mathrm{d} \omega = \int_{\mathcal{M}} <\omega_m(p_m), \omega_g> \mathrm{d} p_m = \int_{\mathcal{G}} \mathrm{d} p_g = A_g \left(= 1m^2\right)
$$

**_Relationship between NDF and normal PDF_**. The unit of PDF of normal $p(\omega)$ is $\frac{1}{sr}$, so it is obviously that:

$$
p(\omega) = \frac{D(\omega)}{\int_{\Omega} D(\omega) \mathrm{d} \omega},
$$

where the denominator is the total area of microsurface.

---

## Masking Function

Why we introduce the microfacet theory is to calculate the aggregated outgoing radiance from the microsurface covered by the pixel's footprint. Thus, we need to first figure out two magnitudes: the view-dependent projected area and the formulation of the outgoing radiance.
