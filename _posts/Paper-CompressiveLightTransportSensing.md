---
layout: post
title: 论文解读 - Compressive Light Transport Sensing
date: 2025-08-18 16:40:16
description: About Compressive Light Transport Sensing
tags: paper, rendering, relighting
categories: paper-reading
---
# 论文解读-Compressive Light Transport Sensing

## 什么是Compressive Sensing？

对于这样一个线性方程
$$
\boldsymbol{y} = \boldsymbol{A}\boldsymbol{x},
$$
其中$\boldsymbol{x}$是n维的**待求解未知信号**，$\boldsymbol{A}$是一个$m \times n$的矩阵，是用于测量未知信号$\boldsymbol{x}$的**测量矩阵**，向量 $\boldsymbol{y}$是一个$m$维的列向量，是测量后的**观测结果**。一般来说，如果我们可以保证$m>n$且$\boldsymbol{A}$的秩大于等于$n$，那这个未知信号$\boldsymbol{x}$是可以精确地求解出来的。但是如果$m \ll n$，那么这个方程是**欠定的**，解不唯一。

Compressive Sensing（压缩感知）研究的是这样一个问题：对于这样的一个欠定的线性方程，如何找到满足某个稀疏度$k (k \ll n)$的解$\boldsymbol{x}$?

> K-Sparse （稀疏度为k）：是指向量中最多包含k个非0元素。

## 为什么是**Compressive**?

刚才提到，Compressive Sensing希望在欠定线性系统中寻找出一个稀疏解，而Compressive就蕴含在这个解的稀疏性上。为什么这么说呢？

因为，任何向量实际上都是在某一组基底下的离散表示，比如最常见的三维空间中的基底：$(1, 0, 0), (0, 1, 0), (0, 0, 1)$。**而如果我们的解是稀疏的，那么就意味着，在一个由$n$个基底构成的空间中，这个信号只需要用$k$个基底进行表示即可**。那么显然其余的基底都是可以忽略的，我们只需要保留这$k$个基底就能够高保真地重建出原始信号，因此实现了**压缩**。

## 将Compressive Sensing引入到Light Transport

在一个场景中，比如:

![alt text](../assets/posts/image.png)
**其中场景中的每一个物体，包括相机与光源，都是固定不动的**。我们希望找到一个Light Transport函数，使得当我们的光源发生变化时，我可以求解出新的光照下的场景。可以见到，这个问题是一个有限制的Capture-Relighting问题，

前人的工作已经证明了，这个问题可以用一个线性方程去描述：
$$
\boldsymbol{C}=\boldsymbol{T}\boldsymbol{L},
$$
其中$\boldsymbol{C}$是$p \times m$的观测结果矩阵，$p$是像素个数，$m$是拍摄（观测）次数，$\boldsymbol{T}$是$p \times n$的Light Transport矩阵，$n$是光源参数数量。$\boldsymbol{L}$是$n \times m$的描述光源的矩阵。

这种直接用线性方程描述渲染过程的方式有以下约定：

- **不需要建模相机参数，光源大小，物体之间的相对位置**。所有的信息都包含在了Light Transport Matrix之中（有点神经网络的感觉了）。
- **光源需要参数化描述**。比如，如果光源是m个点光源，那么光源的参数向量的维度就是$m$；如果是Constant的面光源，那么维度是$1$；如果是用贴图控制的面光源，那么维度就是贴图的像素数$p'$。

  