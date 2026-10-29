# 配置与服务接口

页面标题与接口地址在根目录 `config.js`，修改后刷新浏览器。独立程序的监听 IP、端口和域名限制在 `fastmd.json`，修改后重启服务。本文说明接口协议、静态 JSON 方案和不同后端的切换。

## config.js 配置说明

```javascript
window.FASTMD_CONFIG = {
    siteTitle: "FastMD",     // 网站标题
    apiEndpoint: "api/php"   // 后端服务接口地址
};
```

| 配置项 | 说明 |
|---|---|
| `siteTitle` | 网站标题。用于顶部导航栏 Logo 文字、浏览器标签页标题后缀（如「项目介绍 - FastMD」） |
| `apiEndpoint` | 后端服务接口地址（目录树 + 全文搜索共用一个入口），详见下文路径规则 |

## apiEndpoint 路径规则

### 相对路径（推荐）

相对于**项目根目录**（index.html 会自动写入 `<base>` 标签，无论部署在哪都能正确解析）：

```javascript
apiEndpoint: "api/php"   // 默认 PHP 实现（api/php/index.php，目录默认入口）
apiEndpoint: "api/file"  // 静态 JSON 方案（无需任何后端语言，纯静态主机可运行）
```

Node.js / Python 独立服务用绝对地址：

```javascript
apiEndpoint: "http://127.0.0.1:8300"
```

**二级目录部署**：项目部署在子目录（如 `https://example.com/wiki/`）时，相对路径依然有效——`<base>` 已指向 `/wiki/`，请求会发往 `https://example.com/wiki/api/php/sidebar`，无需任何额外配置。

### 绝对路径

接口与页面不在同一台机器/端口时使用：

```javascript
apiEndpoint: "https://api.example.com/main"
apiEndpoint: "http://127.0.0.1:8300"
```

::: warning 跨域须知
绝对路径指向其它域名/端口时属于跨域请求，后端必须返回 CORS 响应头：

`Access-Control-Allow-Origin: *`
::

## 后端接口协议

自定义后端只需实现两个 GET 路由（直接以路径区分，无任何参数约定）：

- `GET {apiEndpoint}/sidebar` —— 目录树
- `GET {apiEndpoint}/search` —— 搜索索引

::: info 查询参数兼容
前端路径式请求失败（HTTP 错误、网络错误或 JSON 结构不符合约定）时，会回退到查询参数方式 `{apiEndpoint}?action=sidebar|search` 重试。
三种动态后端实现两种方式都支持；自定义后端只需实现路径式一种即可。
:::

采用纯路径式路由的好处：后端可按 URL 路径统一分发（PHP 通过 `PATH_INFO` 获取，Node/Python 直接解析请求路径），路径也可以直接命中静态文件——`api/file/` 静态方案与 Node/Python 的「独立托管整站」正是基于此实现。

### 1. 目录树：`GET {apiEndpoint}/sidebar`

返回菜单层级 JSON：

```json
{
  "data": [
    {
      "type": "dir",
      "title": "基础教程",
      "route": "basic",
      "fullRoute": "basic",
      "sortWeight": 1,
      "children": [ /* 子项，结构同上 */ ]
    },
    {
      "type": "file",
      "title": "项目介绍",
      "route": "home",
      "fullRoute": "home",
      "actualPath": "项目介绍[home][0].md",
      "sortWeight": 0
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `type` | `dir`（目录）或 `file`（文档） |
| `title` | 菜单显示标题（来自文件命名规范中的标题段） |
| `route` / `fullRoute` | 本级路由 / 含父级的完整路由（前端 hash 路由使用） |
| `actualPath` | 相对 `docs/` 的物理文件路径（仅 `file` 类型，前端据此 fetch 文档内容） |
| `sortWeight` | 排序权重；未显式指定排序时使用文件修改时间 |
| `children` | 子级数组（仅 `dir` 类型） |

### 2. 搜索索引：`GET {apiEndpoint}/search`

返回全文检索索引 JSON 数组：

```json
[
  {
    "title": "项目介绍",
    "route": "home",
    "content": "压缩空白后的 Markdown 正文与代码，单篇最长 20000 个 Unicode 字符"
  }
]
```

前端用 Fuse.js 对 `title` 和 `content` 做模糊匹配，索引只需一次性聚合返回即可。

## 扫描规则（所有后端实现必须一致）

- 扫描根目录为项目下的 `docs/`，递归处理子目录
- 忽略 `.` 开头（隐藏）与 `_` 开头（辅助文档）的文件/目录
- 仅收录 `.md` 文件
- 跳过符号链接；重复完整路由或无效路由报错，不静默覆盖
- 搜索保留代码与 Markdown，显示摘要时由前端转义 HTML
- 文件命名规范：`标题[路由][排序].md`，目录为 `标题[路由][排序]`，详见 [命名规则](#/naming)
- 同级按 `sortWeight` 升序排列

## 官方四种接口实现

api 目录按语言分目录组织，每个目录以 `index` 作为默认入口，一眼即可分辨实现语言：

| 目录 | 类型 | 运行方式 |
|---|---|---|
| `api/php/` | PHP 5.6 ~ 8.4 | 任意 PHP 虚拟主机 / `php -S` 内置服务器，零配置 |
| `api/nodejs/` | Node.js（零依赖） | `node api/nodejs/index.js`，默认监听 `127.0.0.1:8300`，`PORT` 环境变量改端口 |
| `api/python/` | Python 3 标准库 | `python api/python/index.py`，默认监听 `127.0.0.1:8300`，`PORT` 环境变量改端口 |
| `api/file/` | 静态 JSON | 无需后端语言，任何静态服务器（nginx / GitHub Pages / 对象存储）直接托管 |

三种动态实现协议完全一致（Node/Python 版已内置 CORS 头，可直接跨域联调）。

### Go 独立程序

根目录 `fastmd-windows.exe` / `fastmd-linux` 默认启动服务；追加 `build` 只生成索引后退出。服务监听配置在 `fastmd.json`，默认 `0.0.0.0:1120`。兼容默认 `api/php` 地址，详见 [独立程序](#/standalone)。

### PHP 路径分发

`apiEndpoint: "api/php"` 时，`/sidebar`、`/search` 路径由服务器回退到 `api/php/index.php`，根据 `PATH_INFO` 或原始请求路径分发：

- **Apache**：已内置 `api/php/.htaccess`（`FallbackResource index.php`），上传即用
- **nginx**：加一条 `location /api/php/ { try_files $uri $uri/ /api/php/index.php?$query_string; }`
- **未配置回退的服务器**（如 `php -S`）：前端会自动回退到 `?action=` 查询参数方式，同样可用

### Node / Python 版可独立托管整站

除 `/sidebar`、`/search` 路由外的请求会按静态文件处理（根目录为项目根），因此一条命令即可同时提供页面、静态资源与 API，浏览器直接访问 `http://127.0.0.1:8300/` 就能使用，无需再配 Web 服务器。

### 静态 JSON 方案（api/file/）

不想部署任何后端语言？`api/file/` 下放两个预渲染好的 JSON 文件即可：

```text
api/file/sidebar   # 目录树 JSON（同 GET /sidebar 的返回结构）
api/file/search    # 搜索索引 JSON（同 GET /search 的返回结构）
```

把 `config.js` 的 `apiEndpoint` 改为 `"api/file"`，前端请求 `api/file/sidebar`、`api/file/search` 时会被静态服务器直接命中文件——整个站点变成纯静态站点，可部署到 GitHub Pages、对象存储等任何静态托管。

仓库内附带当前 `docs/` 的索引。文档更新后推荐运行独立程序的 `build` 命令，无需 PHP；也可以导出动态接口：

```bash
# 用任一官方后端导出（以 PHP 为例）
php -S 127.0.0.1:8302
curl http://127.0.0.1:8302/api/php/index.php?action=sidebar > api/file/sidebar
curl http://127.0.0.1:8302/api/php/index.php?action=search  > api/file/search
```

::: tip 切换后端三步走
1. 启动目标后端（如 `node api/nodejs/index.js`）
2. 修改 `config.js`：`apiEndpoint: "http://127.0.0.1:8300"`
3. 刷新浏览器

若只用 Node/Python 版独立托管整站（页面与接口同源），`apiEndpoint` 保持默认相对路径也可以。
:::

## 用其它语言实现（Go / Java / Rust ...）

只需实现 `/sidebar`、`/search` 两个路由、返回相同结构的 JSON 即可。参考要点：

1. **读取目录**：递归扫描 `docs/`，按上文扫描规则过滤
2. **解析文件名**：用正则 `^([^[\]]+)(?:\[([^[\]]+)\])?(?:\[(\d+)\])?$` 提取 `标题[路由][排序]`
3. **去扩展名**：用字节级的「最后一个 `.`」截取（勿用依赖系统 locale 的 API，避免中文开头文件名被错误截断）
4. **输出 JSON**：`Content-Type: application/json; charset=utf-8`，UTF-8 编码输出
5. **跨域**（可选）：若与页面不同源，返回 `Access-Control-Allow-Origin: *`

也可以不走动态服务：按上节「静态 JSON 方案」把目录树/索引预编译成静态文件即可。

继续阅读 [开发说明](#/dev)。
