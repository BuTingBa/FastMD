# Fast Wiki 轻量级文档渲染系统

> 一套基于「纯运行时驱动」的轻量级文档渲染引擎。结合 Docsify 的零构建优势与 Vitepress 的现代化 UI/UX 体验，并通过轻量级的 PHP 后端介入，彻底解决纯前端架构在文件系统读取、索引构建和路由管理上的先天性缺陷。

* 预览地址：[https://cli.cc/wiki](https://cli.cc/wiki)
* 查看文档：[https://cli.cc/wiki](https://cli.cc/wiki)



## 核心特性

* **快速部署**：将 `.md` 文件丢入 `docs` 文件夹即可自动生成文档，PHP 接口也可用其它语言实现，超级解耦。
* **零编译 / 零构建**：完全抛弃 Node.js、Webpack、Vite 等构建工具链，文档修改即刻生效。
* **混合架构**：PHP 处理文件系统的 I/O 遍历与结构序列化，Vanilla JS 处理路由拦截、Markdown 动态解析与 DOM 渲染。
* **物理路径解耦**：独创的 `标题\[路由]\[排序]` 命名规范，将物理文件系统与前端逻辑路由彻底解耦，提供极高的菜单定制自由度。
* **高性能本地检索**：后端一次性聚合索引 + 前端 Fuse.js 模糊匹配，兼顾网络性能与检索精度。
* **现代化渲染**：原生集成代码高亮（Prism）、数学公式（KaTeX）、图表绘制（Mermaid），企业级排版体验。
* **响应式布局**：PC 端侧边栏与目录均可手动收起/展开，移动端自动切换为抽屉式菜单。
* **任意目录部署**：动态计算项目根路径，无论部署在网站根目录还是任意层级的子目录，资源都能正确加载。
* **高兼容移植性**：默认使用php脚本生成目录和文件检索，也可以使用其它语言，比如Go、Python、Java、NodeJS等实现，也可以稍作改动使用静态生成目录和文件结构。详细请看[开发文档](https://cli.cc/wiki)

## 技术栈

|层级|技术|
|-|-|
|数据层|PHP 8+（文件系统遍历与 JSON 序列化）|
|网络层|浏览器 Fetch API + DOM `hashchange` 事件|
|展示层|Vanilla JS + CSS Variables|
|解析引擎|markdown-it、Prism.js、KaTeX、Mermaid、Fuse.js|

## 项目结构

```text
/项目根目录
│  index.html            # 前端入口（单页应用核心）
│  CHANGELOG.md          # 项目更新日志
├─api/                   # 后端接口
│      sidebar.php       # 扫描 docs 目录生成菜单层级
│      search.php        # 递归读取文档构建全文检索索引
├─assets/                # 静态资源
│      main.css          # 全局样式（CSS Variables 主题）
│      main.js           # 前端核心引擎
│      font/             # 字体图标
└─docs/                  # 【核心工作区】所有 Markdown 文档
```

## 接下来

* 第一次使用？请阅读 [快速开始](#/quick-start)
* 想了解部署细节？请阅读 [部署指南](#/deploy)
* 想掌握文件命名？请阅读 [命名规则](#/naming)
* 想看渲染效果？请阅读 [渲染示例](#/render)

