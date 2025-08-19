---
layout: post
title: PaperReading - Compressive Light Transport Sensing
date: 2025-08-17 12:00:00
description: About Compressive Light Transport Sensing
tags: paper, rendering, relighting, cn-blog
categories: paper-reading
---
# 论文解读-Compressive Light Transport Sensing

## 什么是Compressive Sensing？

对于这样一个线性方程
\begin{equation}
\boldsymbol{y} = \boldsymbol{A}\boldsymbol{x}
\end{equation}
其中$$\boldsymbol{x}$$是n维的**待求解未知信号**，$$\boldsymbol{A}$$是一个$$m \times n$$的矩阵，是用于测量未知信号$$\boldsymbol{x}$$的**测量矩阵**，向量 $$\boldsymbol{y}$$是一个$$m$$维的列向量，是测量后的**观测结果**。一般来说，如果我们可以保证$$m>n$$且$$\boldsymbol{A}$$的秩大于等于$$n$$，那这个未知信号$$\boldsymbol{x}$$是可以精确地求解出来的。但是如果$$m \ll n$$，那么这个方程是**欠定的**，解不唯一。

Compressive Sensing（压缩感知）研究的是这样一个问题：对于这样的一个欠定的线性方程，如何找到满足某个稀疏度$$k (k \ll n)$$的解$$\boldsymbol{x}$$?

> K-Sparse （稀疏度为k）：是指向量中最多包含k个非0元素。

## 为什么是**Compressive**?

刚才提到，Compressive Sensing希望在欠定线性系统中寻找出一个稀疏解，而Compressive就蕴含在这个解的稀疏性上。为什么这么说呢？

因为，任何向量实际上都是在某一组基底下的离散表示，比如最常见的三维空间中的基底：$$(1, 0, 0), (0, 1, 0), (0, 0, 1)$$。**而如果我们的解是稀疏的，那么就意味着，在一个由$$n$$个基底构成的空间中，这个信号只需要用$$k$$个基底进行表示即可**。那么显然其余的基底都是可以忽略的，我们只需要保留这$$k$$个基底就能够高保真地重建出原始信号，因此实现了**压缩**。

## 将Compressive Sensing引入到Light Transport

在一个场景中，比如:

![alt text](../assets/posts/image.png)
**其中场景中的每一个物体，包括相机与光源，都是固定不动的**。我们希望找到一个Light Transport函数，使得当我们的光源发生变化时，我可以求解出新的光照下的场景。可以见到，这个问题是一个有限制的Capture-Relighting问题。

前人的工作已经证明了，这个问题可以用一个线性方程去描述：
\begin{equation}
\boldsymbol{C}=\boldsymbol{T}\boldsymbol{L}
\end{equation}
其中$$\boldsymbol{C}$$是$$p \times m$$的观测结果矩阵，$$p$$是像素个数，$$m$$是拍摄（观测）次数，$$\boldsymbol{T}$$是$$p \times n$$的Light Transport矩阵，$$n$$是光源参数数量。$$\boldsymbol{L}$$是$$n \times m$$的描述光源的矩阵。

这种直接用线性方程描述渲染过程的方式有以下约定：

- **不需要建模相机参数，光源大小，物体之间的相对位置**。所有这些信息都隐含在Light Transport Matrix之中（有点神经网络的感觉）。
- **光源需要参数化描述**。比如，如果光源是m个点光源，那么光源的参数向量的维度就是$$m$$；如果是Constant的面光源，那么维度是$$1$$；如果是用贴图控制的面光源，那么维度就是贴图的像素数$$p'$$。每一个值可以是Radiance。

在这个方程中，$$\boldsymbol{T}$$中的每一个行向量都是我们要求解的Light Transport Function，或者也可以是Reflectance Function。如果现在我们要求解这个矩阵，假设我们有$$128 \times 128$$的复杂光源（比如贴图面光源），此时一个像素中需要求解的系数就有16384个，因此我们要采集16384组拍摄结果，然后进行逐个求解。这显然有着很大的开销，在实际应用中是不可接受的。

因此，我们希望将Compressive Sensing引入Light Transport Function求解上——减少测量次数，并且将Light Transport Function变换到某些可压缩的基底下求解出稀疏解。正如你所提及的，前人的研究确实已经证明了：**Reflectance Function**在一些基底下（比如小波、球谐函数等），其系数向量具有可压缩性。这意味着我们可以用远少于$$n$$个的系数来高精度地近似原始的反射函数。

## 转换到Haar小波空间
Haar小波是一组非常简单的小波基底，其只由`0,-1,1`三个元素组成，并且基底之间两两正交。Haar小波也常用于图像的压缩。

为了利用反射函数的稀疏性，我们需要将求解过程转换到我们选定的基底空间下，这里我们以一个通用的正交基$$\boldsymbol{B}$$为例（在论文的实现中即为Haar小波基）。

我们从原始的光照传输方程出发：
\begin{equation}
\boldsymbol{C} = \boldsymbol{T}\boldsymbol{L}
\end{equation}
我们的目标是求解在基$$\boldsymbol{B}$$下的稀疏系数矩阵$$\hat{\boldsymbol{T}}$$，而不是直接求解稠密的$$\boldsymbol{T}$$。我们约定，$$\boldsymbol{B}$$中的每一个列向量是基底的基向量。我们可以向方程中插入一个单位矩阵$$\boldsymbol{I} = \boldsymbol{B}\boldsymbol{B}^T$$:
\begin{equation}
\boldsymbol{C} = \boldsymbol{T}(\boldsymbol{B}\boldsymbol{B}^T)\boldsymbol{L} = (\boldsymbol{T}\boldsymbol{B})(\boldsymbol{B}^T\boldsymbol{L})
\end{equation}
我们定义在基$$\boldsymbol{B}$$下的传输矩阵为$$\hat{\boldsymbol{T}} = \boldsymbol{T}\boldsymbol{B}$$。现在，$$\hat{\boldsymbol{T}}$$的每一行都是一个稀疏或可压缩的向量。方程变为：
\begin{equation}
\boldsymbol{C} = \hat{\boldsymbol{T}}(\boldsymbol{B}^T\boldsymbol{L})
\end{equation}
这个形式还不是标准的压缩感知方程。为了构建标准的压缩感知问题，我们需要精心设计我们的**光照模式矩阵**$$\boldsymbol{L}$$，从而消除额外的$$\boldsymbol{B}^T$$。论文提出，将光照模式设计为基函数与一个特殊设计的测量矩阵$$\boldsymbol{\Phi}$$的乘积：
\begin{equation}
\boldsymbol{L} = \boldsymbol{B}\boldsymbol{\Phi}
\end{equation}
这里的$$\boldsymbol{\Phi}$$是一个$$n \times m$$的矩阵，它符合压缩感知理论的要求（后面会详细描述）。将这个精心设计的$$\boldsymbol{L}$$代入，我们得到：
\begin{equation}
\boldsymbol{C} = \hat{\boldsymbol{T}}(\boldsymbol{B}^T(\boldsymbol{B}\boldsymbol{\Phi}))
\end{equation}
由于$$\boldsymbol{B}$$是正交基，$$\boldsymbol{B}^T\boldsymbol{B} = \boldsymbol{I}$$，因此方程被极大地简化了：
\begin{equation}
\boldsymbol{C} = \hat{\boldsymbol{T}}\boldsymbol{\Phi}
\end{equation}

现在，我们来考察单个像素$$i$$的情况，也就是矩阵的第$$i$$行：
$$
\boldsymbol{c}_{i,.} = \hat{\boldsymbol{t}}_{i,.}\boldsymbol{\Phi}
$$
将这个行向量方程进行转置，我们得到：
$$
\boldsymbol{c}_{i,.}^T = \boldsymbol{\Phi}^T \hat{\boldsymbol{t}}_{i,.}^T
$$
这个方程完美地匹配了我们最初介绍的压缩感知标准形式$$\boldsymbol{y} = \boldsymbol{A}\boldsymbol{x}$$。其中，$$\boldsymbol{y} = \boldsymbol{c}_{i,.}^T$$是我们对像素$$i$$的$$m$$次观测结果，$$\boldsymbol{A} = \boldsymbol{\Phi}^T$$是测量矩阵，而$$\boldsymbol{x} = \hat{\boldsymbol{t}}_{i,.}^T$$正是我们希望求解的、像素$$i$$的稀疏小波系数。

通过这样的转换，我们成功地将求解光照传输的问题，转化为了一个可以对每个像素独立进行的标准压缩感知问题。