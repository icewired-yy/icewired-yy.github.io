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
  - name: Microfacet BRDF
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

**We need to understand the NDF well before we get into the following content, this is the base of the microfacet theory.** Here are some deduction related to NDF:

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

The reason why we introduce the microfacet theory is to calculate the aggregated outgoing radiance from the microsurface covered by the pixel's footprint. Thus, we need to first figure out two magnitudes: the view-dependent projected area and the formulation of the outgoing radiance.

### View-dependent Projected Area

This projected area measures the area of the microsurface that we can observe from one given view direction. To analyze the formulation, we can assume that every differential area $\mathrm{d}p_m$ has a projection factor $W_m(p_m, \omega_o)$ toward the given view direction $\omega_o$. Thus, the projected area can be formulated as:

$$
A_{proj}(\omega_o) = \int_{\mathcal{M}} W_m(p_m, \omega_o)\mathrm{d}p_m
$$

Due to the intrinsic of the microfacet assumption, the view-dependent projected area is always $<\omega_g, \omega_o>$, leading to:

$$
\int_{\mathcal{M}} W_m(p_m, \omega_o)\mathrm{d}p_m = <\omega_g, \omega_o> = \cos\theta_o
$$

<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="../assets/posts/ndf_microfacet/view-dependent projected area.png" class="img-fluid rounded z-depth-1" zoomable=true %}
    </div>
</div>
<div class="caption">
    How the microsurface projected to the given view direction.
</div>

### Outgoing Radiance

Obviously, observer can only receive the outgoing radiance from the view-dependent projected area, that is, the visible part of the microsurface. To formulate this, we could guess that every point $p_m$ on the microsurface should have an outgoing radiance $L_m(p_m, \omega_o)$ that may contribute to the final aggregated outgonig radiance $L(\omega_o)$, and the contribution weight is the view-dependent projected area of $p_m$. Since this weight is not guaranteed to be normalized, so the final formulation is:

$$
L(\omega_o) = \frac{\int_{\mathcal{M}} W_m(p_m, \omega_o) L(p_m, \omega_o) \mathrm{d} p_m }{\int_{\mathcal{M}} W_m(p_m, \omega_o) \mathrm{d} p_m}
$$

Maybe you have thought about how to convert this spatial integral into a statistical integral as before. However, we have not analyzed the components of $W_m(p_m, \omega_o)$ so far, which we will discuss in the next subsection.

### Geometric Masking

Obviously, we can notice that there are many place on the microsurface whose outgoing radiance will be occluded (or masked) be another part of the microsurface. Like the visibility term, we also need to use a term called masking function $G(p_m, \omega_o)$ to indicate whether the outgoing radiance will not be occluded. After we define this masking function, the projection factor $W_m(p_m, \omega_o)$ can be represented by:

$$
W_m(p_m, \omega_o) = G(p_m, \omega_o) <\omega_m(p_m), \omega_o>.
$$

And we can immediately get the following spatial integral equations:

\begin{equation}
\label{eq: Spatial Projected Area}
\int_{\mathcal{M}} G(p_m, \omega_o) <\omega_m(p_m), \omega_o>\mathrm{d}p_m = \cos\theta_o
\end{equation}

\begin{equation}
\label{eq: Spatial Outgoing Radiance}
L(\omega_o) = \frac{\int_{\mathcal{M}} G(p_m, \omega_o) <\omega_m(p_m), \omega_o> L(p_m, \omega_o) \mathrm{d} p_m }{\int_{\mathcal{M}} G(p_m, \omega_o) <\omega_m(p_m), \omega_o> \mathrm{d} p_m}
\end{equation}

Conventionally, we need to have a statistical version of the masking function. Different from the normal distribution function, the statistical masking function $G(\omega, \omega_o)$ is defined as the visible ratio of the  microsurface area whose normal is pointing toward $\omega$, leading to:

$$
G(\omega, \omega_o) = \frac{\int_{\mathcal{M}}\delta_{\omega}(\omega_m(p_m)) G(p_m, \omega_o)\mathrm{d}p_m}{\int_{\mathcal{M}}\delta_{\omega}(\omega_m(p_m))\mathrm{d}p_m}
$$

Then, the equation \eqref{eq: Spatial Projected Area} has them statistical version:

\begin{equation}
\label{eq: Statistical Projected Area}
\int_{\Omega} G(\omega, \omega_o) <\omega, \omega_o> D(\omega) \mathrm{d}\omega = \cos\theta_o
\end{equation}

This is also a restriction of the masking function.

<aside>
  {% include figure.liquid loading="eager" path="../assets/posts/ndf_microfacet/Masking function from Heitz.png" class="img-fluid rounded z-depth-1" zoomable=true %}
  <p>
    The illustration of the summary of the aforementioned concept, which is borrowed from E. Heitz, _Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs_
  </p>
</aside>

---

## Microfacet BRDF

TODO