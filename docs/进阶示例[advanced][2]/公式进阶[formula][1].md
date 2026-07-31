# 公式进阶

本页演示更复杂的 KaTeX 数学公式用法。

## 微积分

### 极限

$$
\lim_{x \to 0} \frac{\sin x}{x} = 1
$$

### 导数

$$
\frac{d}{dx}\left(\int_{0}^{x} f(t)\,dt\right) = f(x)
$$

### 泰勒展开

$$
e^x = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots
$$

## 线性代数

### 行列式

$$
\det(A) = \begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc
$$

### 特征值

$$
A\mathbf{v} = \lambda \mathbf{v}
$$

其中 $A$ 是方阵，$\mathbf{v}$ 是特征向量，$\lambda$ 是对应的特征值。

## 概率统计

### 贝叶斯定理

$$
P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}
$$

### 正态分布

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

## 物理学

### 麦克斯韦方程组

$$
\begin{align}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{align}
$$

### 薛定谔方程

$$
i\hbar \frac{\partial}{\partial t}\Psi(\mathbf{r},t) = \left[-\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r},t)\right]\Psi(\mathbf{r},t)
$$

## 行内公式示例

当 $a \ne 0$ 时，方程 $ax^2 + bx + c = 0$ 的解为 $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$。

至此进阶示例结束，可回到 [更新日志](#/changelog) 查看版本演进。
