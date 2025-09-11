---
layout: post
title: 论文解读 - 光线传输的压缩感知 （Compressive Light Transport Sensing）
date: 2025-08-17 12:00:00
description: About Compressive Light Transport Sensing
tags: paper, rendering, relighting, cn-blog
categories: paper-reading
---
# 引言
## 什么是压缩感知？

在了解压缩感知之前，我们需要先对压缩本身有一个概念。如果一个信号，对于某一组基所展成的空间，其投影信号具有明显的系数集中效应（大系数主要分布在一小部分基上，而其余基上的系数很小），这个时候，如果我们只保留那些具有显著系数的基和其系数，那么重建的信号仍然能保留绝大部分原始信号的信息。我们称这个空间是可压缩空间，这个信号在某些特定空间内可压缩。

而我们知道，如果我们不对信号做任何变换，根据奈奎斯特采样定理，我们的采样频率至少要是被测信号频率的两倍，才能恢复完整的信号。

Compressive Sensing（压缩感知）研究的是这样一个问题：我们能不能把信号投影到某一个特定的可压缩空间下，将目标变成重建出稀疏度为k的已压缩信号，从而以显著小于奈奎斯特采样要求的采样数重建出原始信号？

> K-Sparse （稀疏度为k）：是指向量中最多包含k个非0元素。

# 欠定线性系统

对于这样一个线性方程
\begin{equation}
\boldsymbol{y} = \boldsymbol{A}\boldsymbol{x}
\end{equation}
其中$$\boldsymbol{x}$$是n维的**待求解未知信号**，$$\boldsymbol{A}$$是一个$$m \times n$$的矩阵，是用于测量未知信号$$\boldsymbol{x}$$的**测量矩阵**，向量 $$\boldsymbol{y}$$是一个$$m$$维的列向量，是测量后的**观测结果**。一般来说，如果我们可以保证$$m>n$$且$$\boldsymbol{A}$$的秩大于等于$$n$$，那这个未知信号$$\boldsymbol{x}$$是可以精确地求解出来的。但是如果$$m \ll n$$，那么这个方程是**欠定的**，解不唯一。

求解欠定线性系统的稀疏解有许多现存的算法，如基追踪(Basis Pursuit)。

## 再来看看什么是**Compressive**?

刚才提到，Compressive Sensing希望在欠定线性系统中寻找出一个稀疏解，而Compressive就蕴含在这个解的稀疏性上。为什么这么说呢？

因为，任何向量实际上都是在某一组基底下的离散表示，比如最常见的三维空间中的基底：$$(1, 0, 0), (0, 1, 0), (0, 0, 1)$$。**而如果我们的解是稀疏的，那么就意味着，在一个由$$n$$个基底构成的空间中，这个信号只需要用$$k$$个基底进行表示即可**。那么显然其余的基底都是可以忽略的，我们只需要保留这$$k$$个基底就能够高保真地重建出原始信号，因此实现了**压缩**。

# 将Compressive Sensing引入到Light Transport

在一个场景中，比如:

{% include figure.liquid loading="eager" path="../assets/posts/image.png" class="img-fluid rounded z-depth-1" %}
**其中场景中的每一个物体，包括相机与光源，都是固定不动的**。我们希望找到一个Light Transport函数，使得当我们的光源发生变化时，我可以求解出新的光照下的场景。可以见到，这个问题是一个有限制的Capture-Relighting问题。

前人的工作已经证明了，这个问题可以用一个线性方程去描述：
\begin{equation}
\boldsymbol{C}=\boldsymbol{T}\boldsymbol{L}
\end{equation}
其中$$\boldsymbol{C}$$是$$p \times m$$的观测结果矩阵，$$p$$是像素个数，$$m$$是拍摄（观测）次数，$$\boldsymbol{T}$$是$$p \times n$$的Light Transport矩阵，$$n$$是光源参数数量。$$\boldsymbol{L}$$是$$n \times m$$的描述光源的矩阵。

这种直接用线性方程描述渲染过程的方式有以下约定：

- **不需要建模相机参数，光源大小，物体之间的相对位置**。所有这些信息都隐含在Light Transport Matrix之中（有点神经网络的感觉）。
- **光源需要参数化描述**。比如，如果光源是m个点光源，那么光源的参数向量的维度就是$$m$$；如果是恒定均匀的面光源，那么维度是$$1$$；如果是用贴图控制的面光源，那么维度就是贴图的像素数$$p'$$。每一个值可以是辐射度。

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

# 如何求解系数解？
## 重点在于测量矩阵

通过上述推导，我们成功地为每个像素建立了一个压缩感知问题：$$\boldsymbol{c}_{i,.}^T = \boldsymbol{\Phi}^T \hat{\boldsymbol{t}}_{i,.}^T$$。现在的问题是，我们应该如何选择测量矩阵$$\boldsymbol{\Phi}$$（或者说它的转置$$\boldsymbol{A} = \boldsymbol{\Phi}^T$$）来保证我们能够稳定、准确地从欠定的观测值$$\boldsymbol{y}$$中恢复出稀疏信号$$\boldsymbol{x}$$？

### 受限等距性质 (Restricted Isometry Property, RIP)

显然，测量矩阵$$\boldsymbol{A}$$并不是可以随意选择的。它必须具备某种特殊的结构，以确保不同的稀疏信号能够被映射到足够不同的测量结果上，从而避免在求解时产生混淆。这个核心条件被称为**受限等距性质 (Restricted Isometry Property, RIP)**。

RIP的数学定义如下：对于一个矩阵$$\boldsymbol{A}$$，如果存在一个很小的常数$$\delta_k \in (0, 1)$$，使得对于**任意k-稀疏**的向量$$\boldsymbol{x}$$，都满足以下不等式，那么我们就说这个矩阵满足k-RIP条件。
\begin{equation}
(1-\delta_k)\|\boldsymbol{x}\|_2^2 \le \|\boldsymbol{A}\boldsymbol{x}\|_2^2 \le (1+\delta_k)\|\boldsymbol{x}\|_2^2
\end{equation}
这个性质的直观意义是，矩阵$$\boldsymbol{A}$$在作用于所有稀疏向量时，其行为近似于一个**等距变换**。也就是说，它能够近似地保持稀疏信号的欧几里得长度（即能量），不会把两个不同的稀疏信号“压扁”到一起，也不会过度拉伸它们。正是这种性质，保证了从测量值$$\boldsymbol{y}$$恢复$$\boldsymbol{x}$$的过程是稳定和唯一的。

### 互相关性 (Mutual Coherence)

虽然RIP是保证信号恢复的“黄金标准”，但它有一个巨大的实践障碍：要验证一个给定的矩阵是否满足RIP是一个NP难问题。这使得它无法被用作一个实用的矩阵设计准则。

幸运的是，我们可以通过一个更容易计算的指标来间接满足RIP，这个指标就是**互相关性 (Mutual Coherence)**，用$$\mu$$表示。前人的研究已经证明，RIP常数$$\delta_k$$的一个上界可以由互相关性$$\mu$$和稀疏度$$k$$来表示：
\begin{equation}
\delta_k \le (k-1)\mu
\end{equation}
这个不等式告诉我们，只要我们能设计一个具有很低互相关性$$\mu$$的矩阵，并且信号的稀疏度$$k$$不是太大，我们就能保证其RIP常数$$\delta_k$$也会很小。这使得互相关性成为了RIP的一个实用且充分的替代条件。

互相关性的定义如下：对于一个所有列向量$$a_j$$都经过归一化的矩阵$$\boldsymbol{A}$$，其互相关性$$\mu(\boldsymbol{A})$$被定义为任意两个不同列向量之间内积绝对值的最大值。
\begin{equation}
\mu(\boldsymbol{A}) = \max_{i \neq j} |\langle a_i, a_j \rangle| = \max_{i \neq j} |a_i^T a_j|
\end{equation}
它衡量了矩阵列向量之间的“最坏情况”下的相似度。一个低$$\mu$$值意味着所有列向量都近似正交，这正是我们所期望的。

### 随机矩阵是答案

我们的目标变得清晰了：我们需要找到一个测量矩阵$$\boldsymbol{A}$$，它既要保证列满秩（以提供足够的测量信息），又要使其互相关性$$\mu$$尽可能地低。

一个看似出人意料但却极为有效的答案是：**随机化**。随机矩阵，例如高斯随机矩阵或伯努利随机矩阵，能够以极高的概率同时满足这两个要求。

-   **高斯随机矩阵**：矩阵中的每一个元素都独立地从标准高斯分布中随机抽取。
-   **伯努利随机矩阵**：矩阵中的每一个元素以等概率随机地取值为+1或-1。

> **为什么随机矩阵有效？**
>
> 1.  **满秩性**：在一个高维空间中，一个随机向量几乎不可能精确地落在由其他几个随机向量张成的子空间中。因此，一个$$m \times n$$（$$m < n$$）的随机矩阵，其行（或列）向量线性无关的概率是极高的，从而保证了其秩为$$m$$。
> 2.  **低互相关性**：这源于高维空间中的测度集中现象。在高维空间中，任意两个随机生成的单位向量都以极高的概率近似正交。它们的内积（即相关性）会高度集中在期望值0附近，其值偏离0的概率会随着维度的增加而指数级下降。因此，一个由随机向量构成的矩阵，其任意两列之间的相关性都会非常低。

在***Compressive Light Transport Sensing***这篇论文的实际应用中，作者最终选择了一种**二值的、类伯努利矩阵**的照明模式。这主要是出于以下几个实际工程的考量：

-   **数值实现的便利性**：二值模式（例如开关灯）非常容易在物理设备（如显示器或投影仪）上实现。如果使用高斯矩阵，需要将浮点数值映射到显示器有限的RGB灰度级上，这个量化过程会引入误差。
-   **无需精确的Gamma校正**：由于只使用最大和最小强度值，系统对显示设备的非线性响应（Gamma曲线）不敏感，减少了一个潜在的校准误差源。
-   **信噪比（SNR）考量**：论文中特别设计了一种“二值分离集成(binary segregated ensemble)”模式，这种模式可以最大化测量过程中的动态范围，从而提升信噪比，这是标准高斯模式难以做到的。

# 空间相关性

至此，我们已经为每个像素建立并解决了一个独立的压缩感知问题。这种“暴力”的逐像素（Brute-force per-pixel）求解方法虽然在理论上是可行的，但它忽略了一个非常重要的先验信息：**图像中相邻像素的反射函数通常是高度相关的**。例如，在一块均匀材质的区域，相邻像素的反射行为几乎是完全相同的。如果完全独立地求解它们，微小的测量噪声就可能导致重建出的相邻反射函数出现不应有的跳变，从而在最终的渲染结果中产生可见的噪点或伪影。

## 从粗到精的求解策略

为了解决这个问题，并利用像素间的空间相关性来正则化求解过程、提升结果质量，论文提出了一种**从粗到精（Coarse-to-Fine）**的层级化重建算法。其核心思想是，我们不直接在原始分辨率上求解，而是先从图像的一个极度粗糙的、低分辨率的版本开始，稳健地估计出一个大致的反射函数解。然后，我们逐级提升分辨率，在每一级都利用上一级更粗糙但更稳健的解作为初始猜测，来引导当前级别的求解。

这种多分辨率的结构可以非常自然地从我们选择的**Haar小波基**中获得。小波变换本身就是一个多分辨率分析工具。对一张图片进行多级小波变换后，我们会得到一系列不同频率的子带图像，其中的低频分量，就是原始图像在不同尺度下的降采样、模糊化的版本。这天然地为我们提供了从粗到精的图像金字塔。

## 求解差分信号

层级化算法的关键在于，如何有效地利用上一级的解来指导下一级的求解。假设我们已经得到了第$$l-1$$层（一个较粗糙的层级）的反射函数稀疏系数$$\hat{\boldsymbol{t}}_{init}$$。当我们进入第$$l$$层（一个更精细的层级）时，我们有理由相信，这一层的真实解$$\hat{\boldsymbol{t}}$$与从上一层继承来的初始猜测$$\hat{\boldsymbol{t}}_{init}$$不会相差太远。

因此，与其直接求解庞大且复杂的$$\hat{\boldsymbol{t}}$$，我们可以改变思路，去求解它们之间的**差分信号**$$\boldsymbol{d}$$，即：
\begin{equation}
\hat{\boldsymbol{t}} = \hat{\boldsymbol{t}}_{init} + \boldsymbol{d}
\end{equation}
由于$$\hat{\boldsymbol{t}}_{init}$$已经是一个不错的近似，我们可以预期差分信号$$\boldsymbol{d}$$会比原始信号$$\hat{\boldsymbol{t}}$$本身**更加稀疏**。求解一个更稀疏的信号在压缩感知框架下通常会更稳健、更精确。

我们将这个思想代入我们熟悉的压缩感知方程$$\boldsymbol{y} = \boldsymbol{A}\hat{\boldsymbol{t}}$$中（这里$$\boldsymbol{y}$$是观测值，$$\boldsymbol{A}$$是测量矩阵）：
\begin{equation}
\boldsymbol{y} = \boldsymbol{A}(\hat{\boldsymbol{t}}\_{init} + \boldsymbol{d})  = \boldsymbol{A} \hat{\boldsymbol{t}}\_{init} + \boldsymbol{A}\boldsymbol{d}
\end{equation}

将已知项移到等式左边，我们得到一个新的压缩感知问题：
\begin{equation}
\boldsymbol{y} - \boldsymbol{A}\hat{\boldsymbol{t}}_{init} = \boldsymbol{A}\boldsymbol{d}
\end{equation}
在这个新的问题中，我们要求解的未知量是稀疏的差分信号$$\boldsymbol{d}$$，而我们的“测量值”变成了**残差（residual）**$$(\boldsymbol{y} - \boldsymbol{A}\hat{\boldsymbol{t}}_{init})$$。求解出$$\boldsymbol{d}$$后，我们就可以通过简单的加法$$\hat{\boldsymbol{t}} = \hat{\boldsymbol{t}}_{init} + \boldsymbol{d}$$来更新我们在当前层的解。

整个算法从金字塔的最顶端（最粗糙的层级）开始，迭代地执行这个“求解差分并更新”的过程，直到抵达最底部的原始分辨率层。通过这种方式，空间相关性被隐式地逐层传递和加强，最终重建出的反射函数场在空间上会更加平滑和连续，显著优于独立的逐像素求解方法。

# 最后一步优化 - 分离高频与低频信息

到目前为止，我们都将反射函数的稀疏求解一视同仁地应用在所有哈尔小波基底上。但根据先验知识，我们知道一个物体的反射函数（Reflectance Function）通常是由平滑的低频部分（如漫反射）和稀疏的高频细节（如高光）组成的。低频部分几乎总是存在的，因此它在小波域的系数并不稀疏，而高频细节才是真正稀疏的部分。

这个观察启发了一种潜在的优化策略：我们可以将求解过程一分为二。
1.  对于贡献了主要能量、但并不稀疏的低频信息，我们不使用压缩感知，而是采用一种更直接、更精确的“全采样”方式来求解其对应的小波系数。
2.  对于真正稀疏的高频细节，我们继续使用压缩感知的方法来高效地捕捉。

这种混合策略可以带来更稳健的重建结果。为了实现对低频部分的精确求解，我们可以引入**哈达玛图案（Hadamard Patterns）**。哈达玛矩阵是由+1和-1构成的方阵，其所有行（和列）相互正交。使用一整套哈达玛图案进行照明和测量，等价于对信号进行了一次完整的傅里叶变换，从中可以无损地、精确地反解出原始信号。

在维度较低的情况下（例如我们只关心最前面几个或几十个低频小波系数），使用哈达玛图案相比于伯努利随机矩阵更具优势。因为一个完整的哈达玛矩阵能够**确保**是满秩且正交的，而随机矩阵只能**以极高的概率**保证这些性质。对于构成信号主体、不容有失的低频部分，这种确定性的保证是至关重要的。

# Extra Bonus

在之前的讨论中，“互相关性”被用来衡量单个测量矩阵内部各列向量之间的相似性。实际上，这个概念也可以被推广，用来描述**两个不同基底之间的不相关程度**。

这里引出一个非常深刻的观察，被称为**广义不确定性原理**：一个信号，无法在两个互不相关的基底中**同时**保持稀疏。

这个原理最经典的例子是时间和频率域的对偶关系：
-   一个**狄拉克函数**（Dirac Delta Function），在时域（标准基）下是极致稀疏的，因为它仅在一个时间点有非零值。
-   然而，它的傅里叶变换在整个频率域（傅里叶基）上是一个幅值恒定的复指数函数，能量均匀分布在所有频率上，是极致**稠密**的。

反之亦然，一个单一频率的正弦波在频域是稀疏的，但在时域上却延展至无穷，表现为稠密。这种“能量扩散”的现象，直观地诠释了不确定性原理：一个信号在一个域中越“确定”（稀疏），在另一个不相关的域中就越“不确定”（稠密）。

这个关系不仅仅是一个定性的观察，它有严格的数学证明。类似于物理学中的**海森堡不确定性原理**。这个理论是说，你不可能同时知道一个粒子的位置和它的动量，粒子位置的不确定性：
\begin{equation}
\Delta x \Delta p \ge \frac{h}{4\pi}.
\end{equation}
在信号处理领域，一个更广义的不确定性原理已经被证明。对于任意一个信号，假设它在基底$$\Phi$$下的稀疏度为$$||\boldsymbol{\alpha}||_0 = A$$，在基底$$\Psi$$下的稀疏度为$$||\boldsymbol{\beta}||_0 = B$$，那么它们必须满足以下不等式关系：
\begin{equation}
\sqrt{A \cdot B} \ge \frac{1}{M}
\end{equation}
或者一个稍弱但更常用的形式：
\begin{equation}
A + B \ge \frac{2}{M}
\end{equation}
这里的$$M$$就是两个基底$$\Phi$$和$$\Psi$$之间的互相关性，定义为$$M = \sup_ {i,j} |\langle \phi_i, \psi_j \rangle|$$。这个不等式精准地量化了我们的观察：如果两个基底互不相关（即M非常小），那么$$1/M$$就会非常大，这就迫使A和B中至少有一个必须很大，从而印证了一个信号无法在这两个基底下同时稀疏。