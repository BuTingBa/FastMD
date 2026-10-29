# Fast MD 轻量级文档渲染系统

## 无需安装环境：直接运行

根目录提供 **Windows x64**、**Linux x64** 独立程序，无需安装 Go、PHP、Node.js 或 Web 服务器。

Windows 双击 `fastmd-windows.exe`，或执行：

```powershell
.\fastmd-windows.exe
```

Linux 执行：

```bash
chmod +x fastmd-linux
./fastmd-linux
```

打开 `http://127.0.0.1:1120/`，局域网使用服务器 IP。默认监听 `0.0.0.0:1120`，Ctrl+C 停止。程序以自身所在目录为站点根目录，启动时生成一次索引，之后只提供静态文件，不在每次请求时扫描目录。

新增、删除、移动或修改文档后，再运行一次生成命令：

```powershell
.\fastmd-windows.exe build
```

```bash
./fastmd-linux build
```

`build` 更新原有格式的 `api/file/sidebar`、`api/file/search` 后立即退出。正在运行的服务无需重启；浏览器刷新后读取新目录和搜索索引。也可以直接重启服务完成更新。

根目录 `fastmd.json` 配置独立服务，修改后重启：

```json
{
  "host": "0.0.0.0",
  "port": 1120,
  "domain": ""
}
```

- `host`：监听 IP；`127.0.0.1` 仅本机，`::` 为全部 IPv6 地址。
- `port`：1～65535，默认 1120。
- `domain`：可选，如 `docs.example.com`；留空接受所有 Host，填写后只接受该域名。不包含协议、端口和路径，DNS 需自行配置；HTTPS 可交给现有反向代理。

`config.js` 继续配置页面标题和接口。Go 服务兼容默认的 `api/php` 地址；纯静态托管时改成 `api/file`，运行 `build` 后上传站点即可。

PHP、Node.js、Python 动态模式继续按请求扫描，不需要运行 `build`。Node/Python 保持 `HOST`、`PORT` 环境变量及默认 `127.0.0.1:8300`，不读取 `fastmd.json`。

详细使用与源码编译见 [独立程序](docs/独立程序[standalone][8].md)。二进制校验值见 `SHA256SUMS`，开发源码在 `api/go/`。

> 一套基于「纯运行时驱动」的轻量级文档渲染引擎。结合 Docsify 的零构建优势与 Vitepress 的现代化 UI/UX 体验，并通过轻量级的 PHP（或其它编程语言） 后端介入，彻底解决纯前端架构在文件系统读取、索引构建和路由管理上的先天性缺陷。

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
* **本地检索**：首次搜索时获取索引，前端 Fuse.js 模糊匹配；每篇保留前 20000 个 Unicode 字符，包含代码和 Markdown。
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
│  fastmd.json           # 独立服务监听 IP、端口与可选域名
│  fastmd-windows.exe    # Windows x64：serve / build / version
│  fastmd-linux          # Linux x64：serve / build / version
│  SHA256SUMS            # 可执行文件 SHA-256
├─api/                   # 后端接口（按语言分目录，各以 index 为默认入口，协议一致可互换）
│  ├─php/                # PHP 实现（默认，5.6~8.4 单文件兼容，含 .htaccess）
│  ├─nodejs/             # Node.js 实现（零依赖，可独立托管整站）
│  ├─python/             # Python 实现（标准库，可独立托管整站）
│  └─file/               # 静态 JSON 方案（预渲染数据，零后端部署）
├─assets/                # 静态资源
│      main.css          # 全局样式（CSS Variables 主题）
│      main.js           # 前端核心引擎
│      runtime.js        # 接口协议校验、转义、脚本按需加载
│      app.js            # 应用启动入口（markdown 引擎装配 + 启动）
│      font/             # 字体图标
└─docs/                  # 【核心工作区】所有 Markdown 文档
```

## 接下来

* 第一次使用？请阅读 [快速开始](#/quick-start)
* 想了解部署细节？请阅读 [部署指南](#/deploy)
* 想掌握文件命名？请阅读 [命名规则](#/naming)
* 想看渲染效果？请阅读 [渲染示例](#/render/basis)

