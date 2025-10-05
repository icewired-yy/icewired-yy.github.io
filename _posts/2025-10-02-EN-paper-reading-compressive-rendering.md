---
layout: post
title: PaperReading - Compressive Rendering Sensing
date: 2025-10-02 12:00:00
description: About Compressive Rendering Sensing
tags: paper, rendering, en-blog, compressive-sensing
categories: paper-reading
---
## Compressive Sensing in Rendering: Beyond Light Field Reconstruction

In our previous [blog post](https://icewired-yy.github.io/blog/2025/EN-paper-reading-compressive-light-transport-sensing/), we explored the fundamental principles of Compressive Sensing (CS) and its pioneering application in Light Transport reconstruction. To further demonstrate the flexibility and broad potential of CS theory, this post shifts our focus to its application in another core area of computer graphics: image rendering.

The work, titled "Compressive Rendering: A Rendering Application of Compressed Sensing," is motivated by a profound observation of the traditional rendering pipeline. A conventional rendering process typically invests immense computational resources to render every single pixel in an image, creating a complete picture, which is then compressed using formats like JPEG or JPEG2000 for storage and transmission. This process is essentially "build completely, then discard redundancy." The authors astutely point out that this is clearly a roundabout approach. A natural question arises: can we skip the intermediate steps and directly capture the crucial information of an image during the rendering phase, thus avoiding the waste of precious computation time on redundant information that will eventually be discarded?

So, how can we apply the concepts of Compressive Sensing to the rendering process?

## Building the Linear Relationship

Before diving into the specific methodology, a crucial prerequisite must be emphasized: **If you want to apply Compressive Sensing theory to a new problem, the first and most critical step is to mathematically formulate that problem as a linear system.**

The authors propose a clear linear model for this. Assume our target image $$x$$ has a total of $$n$$ pixels, but we only render $$k$$ of them (where $$k < n$$) via ray tracing, using these results as our observation vector $$y$$. This sampling process can be expressed with a linear system:

\begin{equation}
y = Sx
\end{equation}

Here, $$S$$ is a $$k \times n$$ sampling matrix, with only one "1" in each row, designed to "select" the pixels we actually rendered from the full image $$x$$. Our goal is to recover the unknown full image $$x$$ from the known $$y$$ and $$S$$.

According to CS theory, directly solving this underdetermined system is impossible. However, if we can find a basis in which the signal $$x$$ is sparse, the problem becomes solvable. For natural images, the Wavelet Basis is an excellent choice, as it can represent image information very sparsely.

Thus, we can introduce the wavelet transform matrix $$\Psi$$, allowing the image $$x$$ to be represented by the inverse transform of its wavelet coefficients $$\hat{x}$$, i.e., $$x = \Psi^{-1}\hat{x}$$. Substituting this into our linear system, we get:

\begin{equation}
y = S\Psi^{-1}\hat{x}
\end{equation}

This equation establishes a linear relationship between our actual measurements $$y$$ and the sparse wavelet coefficients $$\hat{x}$$ we aim to solve for. By letting the measurement matrix $$A = S\Psi^{-1}$$, the problem is transformed into the standard form of Compressive Sensing: find the sparsest solution $$\hat{x}$$ to $$y=A\hat{x}$$.

However, we have momentarily overlooked another critical condition for CS theory to hold: **the incoherence between the measurement basis and the sparsity basis.**

## Incoherence and the Invertible Gaussian Filter

Once the linear system is established, the next core challenge is to ensure the measurement matrix $$A$$ satisfies the requirements of CS, specifically that its constituent measurement basis (point sampling) and sparsity basis (wavelets) have sufficiently low coherence.

The bad news is that, in our application, the point sampling basis and the wavelet basis are highly coherent. Directly applying the model above would result in a reconstruction riddled with artifacts.

To solve this thorny issue, the authors devised a highly innovative solution. Through experimental observation, they found that if the original image is subjected to a Gaussian blur, the coherence between the point sampling basis and the wavelet basis of the *blurred* image decreases significantly as the degree of blur increases.

This inspired the authors' core idea: instead of directly reconstructing the original sharp image $$x$$, we reconstruct a blurred version $$x_b$$. Once the blurred image is successfully reconstructed, we then sharpen it back to our desired clear image $$x$$ using an "invertible" Gaussian filter operation.

While this idea is clever, it introduces a new trade-off: a stronger blur leads to lower coherence and better CS reconstruction, but the subsequent sharpening (inverse Gaussian filtering) process is more likely to amplify noise, degrading the final image quality. Therefore, the degree of Gaussian blur becomes a critical hyperparameter that needs to be carefully chosen.

Based on this, the Compressive Sensing formulation is revised as follows:

1.  We assume the sharp image $$x$$ and the blurred image $$x_b$$ are related by an invertible Gaussian filter $$\Phi$$: $$x = \Phi^{-1}x_b$$.
2.  Substitute this relationship into the initial sampling equation $$y=Sx$$ to get $$y = S\Phi^{-1}x_b$$.
3.  Next, we assume the blurred image $$x_b$$ is sparse in the wavelet domain, i.e., $$x_b = \Psi^{-1}\hat{x}_b$$.
4.  Finally, we arrive at the new linear system:

\begin{equation}
y = S\Phi^{-1}\Psi^{-1}\hat{x}_b
\end{equation}

In this new framework, the measurement matrix becomes $$A = S\Phi^{-1}\Psi^{-1}$$, and the sparse vector we need to solve for is the wavelet coefficients of the blurred image, $$\hat{x}_b$$.

In the actual implementation, the authors also introduced two key optimizations:

1. **Frequency Domain Computation**: To speed up calculations, the Gaussian convolution and its inverse are performed via matrix multiplication in the Fourier domain. The filter $$\Phi$$ can be represented as $$\mathcal{F}^{H}G\mathcal{F}$$, where $$\mathcal{F}$$ is the Fourier transform and $$G$$ is a diagonal matrix containing Gaussian function values. The final form of the measurement matrix is thus $$A = S\mathcal{F}^{H}G^{-1}\mathcal{F}\Psi^{-1}$$. Once we solve for $$\hat{x}_b$$, the final image is recovered via $$x=\mathcal{F}^{H}G^{-1}\mathcal{F}\Psi^{-1}\hat{x}_b$$.

2. **Wiener Filter**: 
   A core part of the implementation is how to compute the "invertible" Gaussian filter, which is the sharpening operation $$\Phi^{-1}$$. A naive approach of simply dividing each frequency component by the corresponding Gaussian function value in the frequency domain (i.e., multiplying by $$G^{-1}$$with diagonal elements of$$1/G_{i,i}$$) runs into a serious problem. 
   The issue is that the values of a Gaussian function are very close to zero in high-frequency regions. When a number (especially a signal that may contain noise) is divided by a number that is almost zero, the result becomes enormous. This process would dramatically amplify any pre-existing high-frequency noise in the image, resulting in a completely unusable, noisy reconstruction.
   To solve this, the authors employed a more robust and intelligent method: **using a Wiener filter to approximate the inverse operation of the Gaussian filter**. The formula for the Wiener filter is:
   \begin{equation} G_{i,i}^{-1} = \frac{G_{i,i}}{G_{i,i}^2 + \lambda} \end{equation}
   Here, $$\lambda$$ is a small positive constant that acts as a regularization parameter. The brilliance of this formula lies in its adaptive nature:

   - **For low and mid-frequency components**: The value of the Gaussian function $$G_{i,i}$$is relatively large, so$$G_{i,i}^2$$is much larger than$$\lambda$$. In this case, the denominator is approximately $$G_{i,i}^2$$, and the whole expression approximates $$G_{i,i}/G_{i,i}^2 = 1/G_{i,i}$$. The effect is nearly identical to a direct inversion, accurately restoring the signal.
   - **For high-frequency components**: The value of $$G_{i,i}$$is very small, close to zero. Here, the$$\lambda$$ term in the denominator becomes dominant. It prevents the denominator from becoming too small, thereby averting a numerical "explosion". This effectively suppresses the disproportionate amplification of high-frequency noise.

   Therefore, by incorporating the Wiener filter, the authors implemented a robust "inverse Gaussian convolution" operation that can effectively sharpen the image while avoiding noise interference.

## Summary and Thoughts

Through this elegant design, the method successfully applies Compressive Sensing to accelerate rendering. Experimental results show that the framework's reconstruction quality significantly surpasses traditional interpolation or inpainting algorithms, especially in preserving edges and details in the image. At the same time, the time spent on the reconstruction step is only a small fraction (about 2%) of the total rendering time, proving its efficiency.

Of course, the method has its limitations. For instance, it cannot recover isolated, single high-frequency pixel spikes (unless that pixel happens to be sampled), and its performance is inferior to simple interpolation at very low sampling rates (below 5%). Additionally, the algorithm is quite sensitive to the parameters of the Gaussian filter, which requires careful tuning.

From my personal perspective, this work opens up an interesting direction. The $$k$$ sample points used in the paper are currently selected randomly based on a Poisson-disk distribution, which provides a spatially uniform sampling pattern. A natural extension to consider is: could we combine this method with Importance Sampling? For example, by using a quick preprocessing step or information from a previous frame, we could predict which regions of the image are more complex or contain more detail. By placing more samples in these "important" areas, we might achieve the same or even better reconstruction quality with fewer total samples, further enhancing the efficiency of compressive rendering.