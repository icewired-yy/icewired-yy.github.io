---
layout: post
title: PaperReading - Compressive Light Transport Sensing
date: 2025-08-17 12:00:00
description: About Compressive Light Transport Sensing
tags: paper, rendering, relighting, en-blog
categories: paper-reading
---
# Introduction
## What is Compressive Sensing?

Before understanding compressive sensing, we first need to have a concept of compression itself. If a signal, when projected onto a space spanned by a certain set of bases, has a significant coefficient concentration effect (large coefficients are mainly distributed on a small number of bases, while the coefficients on the remaining bases are very small), then if we only keep those bases with significant coefficients and their coefficients, the reconstructed signal can still retain most of the information of the original signal. We call this space a compressible space, and this signal is compressible in certain specific spaces.

And we know that, according to the Nyquist sampling theorem, if we do not perform any transformation on the signal, our sampling frequency must be at least twice the frequency of the measured signal to fully recover the complete signal.

Compressive Sensing studies the following problem: can we project a signal into a specific compressible space, changing the objective to reconstructing a k-sparse compressed signal, thereby reconstructing the original signal with a number of samples significantly smaller than what is required by the Nyquist theorem?

> K-Sparse: Refers to a vector containing at most k non-zero elements.

# Underdetermined Linear Systems

For a linear equation such as this:
\begin{equation}
\boldsymbol{y} = \boldsymbol{A}\boldsymbol{x}
\end{equation}
where $$\boldsymbol{x}$$ is an n-dimensional **unknown signal to be solved for**, $$\boldsymbol{A}$$ is an $$m \times n$$ matrix, which is the **measurement matrix** used to measure the unknown signal $$\boldsymbol{x}$$, and the vector $$\boldsymbol{y}$$ is an m-dimensional column vector, which is the **observation result** after measurement. Generally, if we can ensure that $$m>n$$ and the rank of $$\boldsymbol{A}$$ is greater than or equal to $$n$$, then this unknown signal $$\boldsymbol{x}$$ can be solved for precisely. However, if $$m \ll n$$, then this equation is **underdetermined**, and its solution is not unique.

There are many existing algorithms for finding the sparse solution of underdetermined linear systems, such as Basis Pursuit.

## Let's look again at what **Compressive** means?

As mentioned, Compressive Sensing aims to find a sparse solution in an underdetermined linear system. The "compressive" nature is embedded in the sparsity of this solution. Why is that?

Any vector is essentially a discrete representation under a certain set of basis vectors, such as the common basis in three-dimensional space: $$(1, 0, 0), (0, 1, 0), (0, 0, 1)$$. **If our solution is sparse, it means that in a space spanned by $$n$$ basis vectors, the signal can be represented using only $$k$$ of them.** The remaining basis vectors are clearly negligible. We only need to retain these $$k$$ basis vectors to reconstruct the original signal with high fidelity, thus achieving **compression**.

# Applying Compressive Sensing to Light Transport

Consider a scene, for example:

{% include figure.liquid loading="eager" path="../assets/posts/image.png" class="img-fluid rounded z-depth-1" %}
**In this scene, every object, including the camera and the light source, is fixed.** We want to find a Light Transport function such that when our light source changes, we can solve for the scene under new lighting conditions. As you can see, this is a constrained Capture-Relighting problem.

Previous work has shown that this problem can be described by a linear equation:
\begin{equation}
\boldsymbol{C}=\boldsymbol{T}\boldsymbol{L}
\end{equation}
Here, $$\boldsymbol{C}$$ is a $$p \times m$$ matrix of observed results, where $$p$$ is the number of pixels and $$m$$ is the number of captures (observations). $$\boldsymbol{T}$$ is a $$p \times n$$ Light Transport matrix, where $$n$$ is the number of light source parameters. $$\boldsymbol{L}$$ is an $$n \times m$$ matrix describing the light sources.

This method of directly describing the rendering process with a linear equation has the following conventions:

- **There is no need to model camera parameters, light source sizes, or the relative positions of objects.** All this information is implicitly contained within the Light Transport Matrix (somewhat like a neural network).
- **The light source needs to be parameterized.** For instance, if the source consists of m point lights, the dimension of the light parameter vector is $$m$$. For a constant, uniform area light, the dimension is $$1$$. For an area light controlled by a texture map, the dimension is the number of pixels in the texture, $$p'$$. Each value can represent radiance.

In this equation, each row vector of $$\boldsymbol{T}$$ is a Light Transport Function (or Reflectance Function) that we need to solve for. To solve for this matrix, suppose we have a complex light source with $$128 \times 128$$ resolution (like a textured area light). A single pixel would require solving for 16,384 coefficients, meaning we would need to capture 16,384 sets of results. This clearly involves a massive overhead and is unacceptable for practical applications.

Therefore, we want to introduce Compressive Sensing to the problem of solving for the Light Transport Function—to reduce the number of measurements and to solve for a sparse solution by transforming the function into a compressible basis. As you noted, previous research has indeed confirmed that **Reflectance Functions** are compressible in certain bases (like wavelets or spherical harmonics). This means we can approximate the original reflectance function with high accuracy using far fewer than $$n$$ coefficients.

## Transforming to the Haar Wavelet Space
The Haar wavelet is a very simple set of wavelet basis functions, composed only of the elements `0, -1, 1`, and the basis vectors are mutually orthogonal. Haar wavelets are also commonly used for image compression.

To leverage the sparsity of the reflectance function, we need to transform the solving process into our chosen basis space. Here, we'll use a general orthogonal basis $$\boldsymbol{B}$$ as an example (which is the Haar wavelet basis in the paper's implementation).

We start with the original light transport equation:
\begin{equation}
\boldsymbol{C} = \boldsymbol{T}\boldsymbol{L}
\end{equation}
Our goal is to solve for the sparse coefficient matrix $$\hat{\boldsymbol{T}}$$ in the basis $$\boldsymbol{B}$$, rather than the dense matrix $$\boldsymbol{T}$$. We'll adopt the convention that each column vector of $$\boldsymbol{B}$$ is a basis vector. We can insert an identity matrix $$\boldsymbol{I} = \boldsymbol{B}\boldsymbol{B}^T$$ into the equation:
\begin{equation}
\boldsymbol{C} = \boldsymbol{T}(\boldsymbol{B}\boldsymbol{B}^T)\boldsymbol{L} = (\boldsymbol{T}\boldsymbol{B})(\boldsymbol{B}^T\boldsymbol{L})
\end{equation}
We define the transport matrix in basis $$\boldsymbol{B}$$ as $$\hat{\boldsymbol{T}} = \boldsymbol{T}\boldsymbol{B}$$. Now, each row of $$\hat{\boldsymbol{T}}$$ is a sparse or compressible vector. The equation becomes:
\begin{equation}
\boldsymbol{C} = \hat{\boldsymbol{T}}(\boldsymbol{B}^T\boldsymbol{L})
\end{equation}
This form is not yet a standard CS equation. To construct a standard CS problem, we need to carefully design our **illumination pattern matrix** $$\boldsymbol{L}$$ to eliminate the extra $$\boldsymbol{B}^T$$ term. The paper proposes designing the illumination patterns as the product of the basis functions and a specially designed measurement matrix $$\boldsymbol{\Phi}$$:
\begin{equation}
\boldsymbol{L} = \boldsymbol{B}\boldsymbol{\Phi}
\end{equation}
Here, $$\boldsymbol{\Phi}$$ is an $$n \times m$$ matrix that meets the requirements of CS theory (which we will detail later). Substituting this carefully designed $$\boldsymbol{L}$$ gives:
\begin{equation}
\boldsymbol{C} = \hat{\boldsymbol{T}}(\boldsymbol{B}^T(\boldsymbol{B}\boldsymbol{\Phi}))
\end{equation}
Since $$\boldsymbol{B}$$ is an orthogonal basis, $$\boldsymbol{B}^T\boldsymbol{B} = \boldsymbol{I}$$, which greatly simplifies the equation to:
\begin{equation}
\boldsymbol{C} = \hat{\boldsymbol{T}}\boldsymbol{\Phi}
\end{equation}

Now, let's consider the case for a single pixel $$i$$, which corresponds to the $$i$$-th row of the matrices:
$$
\boldsymbol{c}_{i,.} = \hat{\boldsymbol{t}}_{i,.}\boldsymbol{\Phi}
$$
By transposing this row vector equation, we get:
$$
\boldsymbol{c}_{i,.}^T = \boldsymbol{\Phi}^T \hat{\boldsymbol{t}}_{i,.}^T
$$
This equation perfectly matches the standard CS form $$\boldsymbol{y} = \boldsymbol{A}\boldsymbol{x}$$ that we introduced at the beginning. Here, $$\boldsymbol{y} = \boldsymbol{c}_{i,.}^T$$ represents our $$m$$ observations for pixel $$i$$, $$\boldsymbol{A} = \boldsymbol{\Phi}^T$$ is the measurement matrix, and $$\boldsymbol{x} = \hat{\boldsymbol{t}}_{i,.}^T$$ is precisely the sparse wavelet coefficient vector for pixel $$i$$ that we want to solve for.

Through this transformation, we have successfully converted the problem of solving for light transport into a standard compressive sensing problem that can be solved independently for each pixel.

# How to Solve for the Coefficients?
## The Importance of the Measurement Matrix

Through the derivation above, we have successfully formulated a compressive sensing problem for each pixel: $$\boldsymbol{c}_{i,.}^T = \boldsymbol{\Phi}^T \hat{\boldsymbol{t}}_{i,.}^T$$. The question now is, how should we choose the measurement matrix $$\boldsymbol{\Phi}$$ (or its transpose $$\boldsymbol{A} = \boldsymbol{\Phi}^T$$) to ensure that we can stably and accurately recover the sparse signal $$\boldsymbol{x}$$ from the underdetermined observations $$\boldsymbol{y}$$?

### The Restricted Isometry Property (RIP)

Clearly, the measurement matrix $$\boldsymbol{A}$$ cannot be chosen arbitrarily. It must possess a special structure to ensure that different sparse signals are mapped to sufficiently different measurement results, thus avoiding ambiguity during the solution process. This core condition is known as the **Restricted Isometry Property (RIP)**.

The mathematical definition of RIP is as follows: A matrix $$\boldsymbol{A}$$ is said to satisfy the k-RIP if there exists a small constant $$\delta_k \in (0, 1)$$ such that for **any k-sparse** vector $$\boldsymbol{x}$$, the following inequality holds:
\begin{equation}
(1-\delta_k)\|\boldsymbol{x}\|_2^2 \le \|\boldsymbol{A}\boldsymbol{x}\|_2^2 \le (1+\delta_k)\|\boldsymbol{x}\|_2^2
\end{equation}
The intuitive meaning of this property is that the matrix $$\boldsymbol{A}$$, when applied to any sparse vector, acts approximately as an **isometry**. That is, it nearly preserves the Euclidean length (i.e., energy) of sparse signals. It doesn't "squash" two different sparse signals together, nor does it excessively stretch them. It is this property that guarantees the stability and uniqueness of recovering $$\boldsymbol{x}$$ from the measurements $$\boldsymbol{y}$$.

### Mutual Coherence

While RIP is the "gold standard" for guaranteeing signal recovery, it has a major practical drawback: verifying whether a given matrix satisfies RIP is an NP-hard problem. This makes it unsuitable as a practical criterion for matrix design.

Fortunately, we can satisfy RIP indirectly by using a more easily computable metric: **Mutual Coherence**, denoted by $$\mu$$. Previous research has established that an upper bound for the RIP constant $$\delta_k$$ can be expressed in terms of the mutual coherence $$\mu$$ and the sparsity $$k$$:
\begin{equation}
\delta_k \le (k-1)\mu
\end{equation}
This inequality tells us that if we can design a matrix with a very low mutual coherence $$\mu$$, and the signal's sparsity $$k$$ is not too large, we can guarantee that its RIP constant $$\delta_k$$ will also be small. This makes mutual coherence a practical and sufficient substitute for RIP.

The definition of mutual coherence is as follows: For a matrix $$\boldsymbol{A}$$ with all its columns $$a_j$$ normalized, its mutual coherence $$\mu(\boldsymbol{A})$$ is defined as the maximum absolute value of the inner product between any two distinct columns.
\begin{equation}
\mu(\boldsymbol{A}) = \max_{i \neq j} |\langle a_i, a_j \rangle| = \max_{i \neq j} |a_i^T a_j|
\end{equation}
It measures the "worst-case" similarity between the columns of the matrix. A low value of $$\mu$$ means all column vectors are nearly orthogonal, which is exactly what we desire.

### Random Matrices are the Answer

Our objective becomes clear: we need to find a measurement matrix $$\boldsymbol{A}$$ that is both full-rank (to provide sufficient measurement information) and has the lowest possible mutual coherence $$\mu$$.

A surprising but highly effective answer is: **randomization**. Random matrices, such as Gaussian or Bernoulli random matrices, satisfy both of these requirements with a very high probability.

-   **Gaussian Random Matrix**: Each entry in the matrix is independently drawn from a standard Gaussian distribution.
-   **Bernoulli Random Matrix**: Each entry in the matrix is randomly assigned a value of +1 or -1 with equal probability.

> **Why do Random Matrices Work?**
>
> 1.  **Full Rank Property**: In a high-dimensional space, it is almost impossible for a random vector to lie exactly in the subspace spanned by several other random vectors. Therefore, an $$m \times n$$ ($$m < n$$) random matrix will have linearly independent rows (or columns) with extremely high probability, thus ensuring its rank is $$m$$.
> 2.  **Low Mutual Coherence**: This stems from the phenomenon of measure concentration in high dimensions. In a high-dimensional space, any two randomly generated unit vectors are, with very high probability, nearly orthogonal. Their inner product (i.e., coherence) is highly concentrated around its expected value of 0, and the probability of it being far from 0 decreases exponentially with the dimension. Consequently, a matrix composed of random vectors will have very low coherence between any two of its columns.

In the practical application of the paper ***Compressive Light Transport Sensing***, the authors ultimately choose a **binary, Bernoulli-like** illumination pattern. This decision is primarily based on several practical engineering considerations:

-   **Convenience of Numerical Implementation**: Binary patterns (e.g., light on/off) are very easy to implement on physical devices like monitors or projectors. Using a Gaussian matrix would require mapping floating-point values to the limited RGB levels of a display, a quantization process that would introduce errors.
-   **No Need for Precise Gamma Correction**: By using only the maximum and minimum intensity values, the system is insensitive to the non-linear response (Gamma curve) of the display device, which removes a potential source of calibration error.
-   **Signal-to-Noise Ratio (SNR) Considerations**: The paper specifically designs a "binary segregated ensemble" pattern. This pattern is crafted to maximize the dynamic range during measurement, thereby improving the SNR in a way that is difficult to achieve with standard Gaussian patterns.

# Spatial Coherency

So far, we have established and solved an independent compressive sensing problem for each pixel. While this "brute-force per-pixel" approach is theoretically sound, it overlooks a crucial piece of prior information: **the reflectance functions of adjacent pixels in an image are typically highly correlated**. For instance, within an area of uniform material, the reflective behavior of neighboring pixels is nearly identical. Solving for them in complete isolation can cause small measurement noises to introduce unnatural variations in the reconstructed adjacent reflectance functions, leading to visible noise or artifacts in the final rendered image.

## A Coarse-to-Fine Reconstruction Strategy

To address this issue and leverage the spatial coherency between pixels to regularize the solution process and improve quality, the paper proposes a **coarse-to-fine** hierarchical reconstruction algorithm. The core idea is that instead of directly solving at the original resolution, we start with a very coarse, low-resolution version of the image to robustly estimate an approximate solution for the reflectance functions. Then, we progressively increase the resolution, using the coarser but more robust solution from the previous level as an initial guess to guide the solution at the current, finer level.

This multi-resolution structure can be naturally obtained from our chosen **Haar wavelet basis**. The wavelet transform is inherently a multi-resolution analysis tool. After performing a multi-level wavelet decomposition on an image, we get a series of sub-band images at different frequencies. The low-frequency component is essentially a downsampled and blurred version of the original image at different scales. This naturally provides the image pyramid needed for our coarse-to-fine strategy.

## Solving for the Difference Signal

The key to the hierarchical algorithm is how to effectively use the solution from the previous level to guide the solution at the next. Let's assume we have obtained the sparse coefficients for the reflectance function, $$\hat{\boldsymbol{t}}_{init}$$, from level $$l-1$$ (a coarser level). When we move to level $$l$$ (a finer level), it is reasonable to believe that the true solution for this level, $$\hat{\boldsymbol{t}}$$, will not be very different from the initial guess, $$\hat{\boldsymbol{t}}_{init}$$, inherited from the level above.

Therefore, instead of directly solving for the large and complex $$\hat{\boldsymbol{t}}$$, we can shift our perspective and solve for the **difference signal**, $$\boldsymbol{d}$$, between them:
\begin{equation}
\hat{\boldsymbol{t}} = \hat{\boldsymbol{t}}_{init} + \boldsymbol{d}
\end{equation}
Since $$\hat{\boldsymbol{t}}_{init}$$ is already a good approximation, we can expect the difference signal $$\boldsymbol{d}$$ to be **even sparser** than the original signal $$\hat{\boldsymbol{t}}$$ itself. In the compressive sensing framework, solving for a sparser signal is generally more robust and accurate.

We can substitute this idea into our familiar CS equation, $$\boldsymbol{y} = \boldsymbol{A}\hat{\boldsymbol{t}}$$ (where $$\boldsymbol{y}$$ is the observation and $$\boldsymbol{A}$$ is the measurement matrix):
\begin{equation}
\boldsymbol{y} = \boldsymbol{A}(\hat{\boldsymbol{t}}\_{init} + \boldsymbol{d})  = \boldsymbol{A} \hat{\boldsymbol{t}}\_{init} + \boldsymbol{A}\boldsymbol{d}
\end{equation}

By moving the known terms to the left side, we formulate a new compressive sensing problem:
\begin{equation}
\boldsymbol{y} - \boldsymbol{A}\hat{\boldsymbol{t}}_{init} = \boldsymbol{A}\boldsymbol{d}
\end{equation}
In this new problem, the unknown we need to solve for is the sparse difference signal $$\boldsymbol{d}$$, and our new "measurement" becomes the **residual**, $$(\boldsymbol{y} - \boldsymbol{A}\hat{\boldsymbol{t}}_{init})$$. After solving for $$\boldsymbol{d}$$, we can update our solution at the current level with a simple addition: $$\hat{\boldsymbol{t}} = \hat{\boldsymbol{t}}_{init} + \boldsymbol{d}$$.

The entire algorithm starts at the top of the pyramid (the coarsest level) and iteratively performs this "solve for difference and update" process until it reaches the bottom level at the original resolution. In this manner, spatial coherency is implicitly passed down and reinforced through the levels, resulting in a reconstructed reflectance field that is spatially smoother and more continuous, significantly outperforming the independent per-pixel approach.

# Final Optimization - Separating High and Low-Frequency Information

Up to this point, we have applied the sparse recovery of the reflectance function uniformly across all Haar wavelet basis functions. However, based on prior knowledge, we understand that an object's Reflectance Function is typically composed of a smooth, low-frequency component (like diffuse reflection) and sparse, high-frequency details (like specular highlights). The low-frequency part is almost always present and thus its coefficients in the wavelet domain are not sparse, whereas the high-frequency details are the truly sparse component.

This observation inspires a potential optimization strategy: we can split the acquisition process into two parts.
1.  For the low-frequency information, which contributes most of the energy but is not sparse, we can bypass compressive sensing and use a more direct and precise "full sampling" method to solve for its corresponding wavelet coefficients.
2.  For the genuinely sparse high-frequency details, we continue to use the compressive sensing approach for efficient capture.

This hybrid strategy can lead to more robust reconstruction results. To achieve the precise recovery of the low-frequency components, we can introduce **Hadamard Patterns**. A Hadamard matrix is a square matrix consisting of +1 and -1, whose rows (and columns) are mutually orthogonal. Illuminating and measuring with a full set of Hadamard patterns is equivalent to performing a complete Fourier-like transform on the signal, from which the original signal can be perfectly and accurately recovered.

In low-dimensional cases (e.g., when we only care about the first few dozen low-frequency wavelet coefficients), using Hadamard patterns is more advantageous than using Bernoulli random matrices. This is because a complete Hadamard matrix is **guaranteed** to be full-rank and orthogonal, whereas a random matrix can only guarantee these properties with **very high probability**. For the critical low-frequency part of the signal that forms its backbone, this deterministic guarantee is crucial.

# Extra Bonus

In our previous discussion, "mutual coherence" was used to measure the similarity between the column vectors within a single measurement matrix. In fact, this concept can be generalized to describe the degree of **incoherence between two different bases**.

This leads to a profound observation known as the **Generalized Uncertainty Principle**: A signal cannot be sparse in two mutually incoherent bases **simultaneously**.

The most classic example of this principle is the duality between the time and frequency domains:
-   A **Dirac Delta Function** is perfectly sparse in the time domain (the standard basis), as it has a non-zero value at only a single point in time.
-   However, its Fourier transform is a complex exponential with constant magnitude across the entire frequency domain (the Fourier basis), meaning its energy is uniformly spread across all frequencies, making it perfectly **dense**.

Conversely, a single-frequency sine wave is sparse in the frequency domain but extends infinitely in the time domain, appearing dense. This phenomenon of "energy spreading" intuitively explains the uncertainty principle: the more "certain" (sparse) a signal is in one domain, the more "uncertain" (dense) it must be in another incoherent domain.

This relationship is not just a qualitative observation; it has a rigorous mathematical proof, similar to the **Heisenberg Uncertainty Principle** in physics. This theory states that it is impossible to simultaneously know both the position and the momentum of a particle, with the uncertainty in a particle's position expressed as:
\begin{equation}
\Delta x \Delta p \ge \frac{h}{4\pi}.
\end{equation}
In the field of signal processing, a more generalized uncertainty principle has been proven. For any given signal, if its sparsity in basis $$\Phi$$ is $$||\boldsymbol{\alpha}||_0 = A$$ and its sparsity in basis $$\Psi$$ is $$||\boldsymbol{\beta}||_0 = B$$, they must satisfy the following inequality:
\begin{equation}
\sqrt{A \cdot B} \ge \frac{1}{M}
\end{equation}
or a slightly weaker but more commonly used form:
\begin{equation}
A + B \ge \frac{2}{M}
\end{equation}
Here, $$M$$ is the mutual coherence between the two bases $$\Phi$$ and $$\Psi$$, defined as $$M = \sup_ {i,j} |\langle \phi_i, \psi_j \rangle|$$. This inequality precisely quantifies our observation: if two bases are highly incoherent (meaning M is very small), then $$1/M$$ will be very large. This forces at least one of A or B to be large, confirming that a signal cannot be sparse in both bases simultaneously.