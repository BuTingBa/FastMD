# Fast MD 轻量级文档渲染系统

> 一套基于「纯运行时驱动」的轻量级文档渲染引擎。结合 Docsify 的零构建优势与 Vitepress 的现代化 UI/UX 体验，并通过轻量级的 PHP 后端介入，彻底解决纯前端架构在文件系统读取、索引构建和路由管理上的先天性缺陷。

* 预览地址：[https://cli.cc/wiki](https://cli.cc/wiki)
* 查看文档：[https://cli.cc/wiki](https://cli.cc/wiki)



## 核心特性

* **快速部署**：将 `.md` 文件丢入 `docs` 文件夹即可自动生成文档，超级解耦。
* **零编译 / 零构建**：完全抛弃 Node.js、Webpack、Vite 等构建工具链，文档修改即刻生效。
* **多语言后端，随意替换**：后端只是一个轻量 JSON 接口（`GET /sidebar` 目录树 + `GET /search` 搜索索引），api 目录按语言分目录、各以 `index` 为默认入口（`api/php/`、`api/nodejs/`、`api/python/`），改一行 `config.js` 即可切换；也可以用 Java、Go、C#、Rust 等语言快速实现，协议详见 [配置与服务接口文档](docs/配置与服务[config][7].md)。
* **纯静态也能跑**：不想部署任何后端语言？`api/file/` 预渲染 JSON 方案 + `apiEndpoint: "api/file"`，整站变成纯静态站点，GitHub Pages、对象存储均可托管。
* **单文件配置**：根目录 `config.js` 集中配置站点标题与后端接口地址，支持相对路径（自动适配任意层级子目录部署）与绝对路径（跨域需后端返回 CORS 头）。
* **混合架构**：后端处理文件系统的 I/O 遍历与结构序列化，Vanilla JS 处理路由拦截、Markdown 动态解析与 DOM 渲染。
* **物理路径解耦**：独创的 `标题\[路由]\[排序]` 命名规范，将物理文件系统与前端逻辑路由彻底解耦，提供极高的菜单定制自由度。
* **高性能本地检索**：后端一次性聚合索引 + 前端 Fuse.js 模糊匹配，兼顾网络性能与检索精度。
* **现代化渲染**：原生集成代码高亮（Prism）、数学公式（KaTeX）、图表绘制（Mermaid）、Vitepress 风格容器块（`::: tip/warning` 等），企业级排版体验。
* **响应式布局**：PC 端侧边栏与目录均可手动收起/展开，移动端自动切换为抽屉式菜单。
* **任意目录部署**：动态计算项目根路径，无论部署在网站根目录还是任意层级的子目录，资源都能正确加载。
* **超宽 PHP 兼容**：默认后端单文件兼容 PHP 5.6 ~ 8.4（含 polyfill 与 locale 缺陷规避），老旧虚拟主机也能跑。

## 技术栈

|层级|技术|
|-|-|
|数据层|任意语言（官方实现：PHP 5.6~8.4 / Node.js / Python 3）|
|网络层|浏览器 Fetch API + DOM `hashchange` 事件|
|展示层|Vanilla JS + CSS Variables|
|解析引擎|markdown-it、Prism.js、KaTeX、Mermaid、Fuse.js|

## 部署方式

* **PHP 主机（默认）**：上传即用，`config.js` 保持默认 `api/php`。兼容 PHP 5.6 ~ 8.4，宝塔/虚拟主机均可（Apache 已内置 .htaccess 路由回退，nginx 见文档配置说明）。
* **纯静态托管（零后端）**：`apiEndpoint` 改为 `api/file`，使用 `api/file/` 下预渲染的 JSON 数据，GitHub Pages、对象存储、任意静态服务器均可运行。
* **Node.js 一条命令托管整站**：`node api/nodejs/index.js` 即可同时提供页面、静态资源与 API（`/sidebar`、`/search` 走接口，其余路径按静态文件处理），浏览器直接访问 `http://127.0.0.1:8300/`。也可仅当接口服务，`apiEndpoint` 改为 `http://127.0.0.1:8300`（可用 nginx 反代到正式域名）。
* **Python 同上**：`python api/python/index.py`（标准库，零依赖），独立托管 / 仅当接口均可。
* **任意语言自实现**：后端只需实现 `GET /sidebar`、`GET /search` 两个 JSON 路由（`?action=` 查询参数式同样兼容），协议详见 [配置与服务接口文档](docs/配置与服务[config][7].md)。
* 任意层级子目录部署（如 `/wiki/`）无需额外配置，相对路径自动适配。

## 项目结构

```text
/项目根目录
│  index.html            # 前端入口（单页应用核心）
│  config.js             # 全局配置（站点标题 / 后端接口地址）
│  CHANGELOG.md          # 项目更新日志
├─api/                   # 后端接口（按语言分目录，各以 index 为默认入口，协议一致可互换）
│  ├─php/                # PHP 实现（默认，5.6~8.4 单文件兼容，含 .htaccess）
│  ├─nodejs/             # Node.js 实现（零依赖，可独立托管整站）
│  ├─python/             # Python 实现（标准库，可独立托管整站）
│  └─file/               # 静态 JSON 方案（预渲染数据，零后端部署）
├─assets/                # 静态资源
│      main.css          # 全局样式（CSS Variables 主题）
│      main.js           # 前端核心引擎
│      app.js            # 应用启动入口（markdown 引擎装配 + 启动）
│      font/             # 字体图标
└─docs/                  # 【核心工作区】所有 Markdown 文档
```

## 接下来

* 第一次使用？请阅读 [快速开始](#/quick-start)
* 想了解部署细节？请阅读 [部署指南](#/deploy)
* 想掌握文件命名？请阅读 [命名规则](#/naming)
* 想看渲染效果？请阅读 [渲染示例](#/render)

