# 配置与服务接口

FastMD 的所有可配置项集中在一个文件：根目录 `config.js`。修改后刷新浏览器即可生效，无需重启服务。本文同时说明后端接口协议，以及如何用任意编程语言替换默认的 PHP 后端。

## config.js 配置说明

```javascript
window.FASTMD_CONFIG = {
    siteTitle: "FastMD",          // 网站标题
    apiEndpoint: "api/main.php"   // 后端服务接口地址
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
apiEndpoint: "api/main.php"   // 默认 PHP 实现
apiEndpoint: "api/main.py"    // 换成 Python 实现（需自行部署服务）
apiEndpoint: "api/main.js"    // 换成 Node.js 实现（需自行部署服务）
```

**二级目录部署**：项目部署在子目录（如 `https://example.com/wiki/`）时，相对路径依然有效——`<base>` 已指向 `/wiki/`，请求会发往 `https://example.com/wiki/api/main.php`，无需任何额外配置。

### 绝对路径

接口与页面不在同一台机器/端口时使用：

```javascript
apiEndpoint: "https://api.example.com/main"
apiEndpoint: "http://127.0.0.1:8300/"
```

::: warning 跨域须知
绝对路径指向其它域名/端口时属于跨域请求，后端必须返回 CORS 响应头：

`Access-Control-Allow-Origin: *`
::

## 后端接口协议

自定义后端只需实现两个 GET 接口（共用一个入口，用 `action` 参数区分）：

### 1. 目录树：`GET {apiEndpoint}?action=sidebar`

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

### 2. 搜索索引：`GET {apiEndpoint}?action=search`

返回全文检索索引 JSON 数组：

```json
[
  {
    "title": "项目介绍",
    "route": "home",
    "content": "文档正文纯文本（已压缩空白、剔除 HTML 标签，单篇最长 20000 字符）"
  }
]
```

前端用 Fuse.js 对 `title` 和 `content` 做模糊匹配，索引只需一次性聚合返回即可。

## 扫描规则（所有后端实现必须一致）

- 扫描根目录为项目下的 `docs/`，递归处理子目录
- 忽略 `.` 开头（隐藏）与 `_` 开头（辅助文档）的文件/目录
- 仅收录 `.md` 文件
- 文件命名规范：`标题[路由][排序].md`，目录为 `标题[路由][排序]`，详见 [命名规则](#/naming)
- 同级按 `sortWeight` 升序排列

## 官方三种后端实现

| 文件 | 语言 | 运行方式 |
|---|---|---|
| `api/main.php` | PHP 5.6 ~ 8.4 | 任意 PHP 虚拟主机 / `php -S` 内置服务器，零配置 |
| `api/main.js` | Node.js（零依赖） | `node api/main.js`，默认监听 `127.0.0.1:8300`，`PORT` 环境变量改端口 |
| `api/main.py` | Python 3 标准库 | `python api/main.py`，默认监听 `127.0.0.1:8300`，`PORT` 环境变量改端口 |

三种实现协议完全一致（Node/Python 版已内置 CORS 头，可直接跨域联调）。

::: tip 切换后端三步走
1. 启动目标后端（如 `node api/main.js`）
2. 修改 `config.js`：`apiEndpoint: "http://127.0.0.1:8300/"`
3. 刷新浏览器
::

## 用其它语言实现（Go / Java / Rust ...）

只需实现上文的两个 action、返回相同结构的 JSON 即可。参考要点：

1. **读取目录**：递归扫描 `docs/`，按上文扫描规则过滤
2. **解析文件名**：用正则 `^([^[\]]+)(?:\[([^[\]]+)\])?(?:\[(\d+)\])?$` 提取 `标题[路由][排序]`
3. **去扩展名**：用字节级的「最后一个 `.`」截取（勿用依赖系统 locale 的 API，避免中文开头文件名被错误截断）
4. **输出 JSON**：`Content-Type: application/json; charset=utf-8`，UTF-8 编码输出
5. **跨域**（可选）：若与页面不同源，返回 `Access-Control-Allow-Origin: *`

也可以不走动态服务：写一个编译器把目录树/索引预编译成静态 JSON 文件，把 `apiEndpoint` 指向该静态文件并带上 `?action=` 可被忽略的查询参数即可（前提是你的静态服务器忽略查询字符串）。

继续阅读 [开发说明](#/dev)。
