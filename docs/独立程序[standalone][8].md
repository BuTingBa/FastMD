# 独立程序：启动与生成索引

无需安装 Go、PHP、Node.js、Python 或 Web 服务器。两个发行程序分别面向 **Windows x64** 和 **Linux x64**，使用 Go 标准库编译，无第三方运行依赖。

## 启动站点

Windows 双击根目录 `fastmd-windows.exe`，Linux 执行：

```bash
chmod +x fastmd-linux
./fastmd-linux
```

访问 `http://127.0.0.1:1120/`。默认监听所有 IPv4 地址，可通过服务器 IP 访问。Ctrl+C 停止。

程序以可执行文件所在目录为站点根目录，不受当前终端目录影响。也支持指定目录：

```bash
./fastmd-linux serve -root /srv/docs
```

启动时读取 `fastmd.json`，生成一次索引，然后提供静态 Web 服务。没有文件监控、数据库或后台任务。

## 只生成索引，执行后退出

```powershell
.\fastmd-windows.exe build
```

```bash
./fastmd-linux build
```

扫描 `docs/` 并生成原有格式的 `api/file/sidebar`、`api/file/search`。新增、删除、移动、重命名或修改文档后再次运行即可。正文也进入搜索索引，因此修改正文后也应重建。

重建无需停止服务；每个索引通过同目录临时文件完整替换，避免读到半份 JSON。两份索引依次替换，并非跨文件事务。扫描失败、重名路由或无效 UTF-8 返回非零退出码；扫描阶段失败不会覆盖原索引。成功后刷新浏览器。

纯静态托管时将 `config.js` 的 `apiEndpoint` 改成 `api/file`，上传页面、资源、文档和索引即可。现有 PHP 模式无需调整；独立服务兼容默认 `api/php` 地址。

## 导出静态站点

运行 `fastmd-windows.exe pages` 或 `./fastmd-linux pages`，生成可直接上传的 `_site/`，并立即退出。输出自动使用静态索引接口，不修改源配置。输出目录必须不存在，可用 `-output 新目录名` 更换。

GitHub Pages 的自动发布与首次启用步骤见 [GitHub Pages](#/pages)。

## 服务配置

```json
{
  "host": "0.0.0.0",
  "port": 1120,
  "domain": ""
}
```

| 字段 | 含义 |
|---|---|
| `host` | 监听 IP；`0.0.0.0` 为全部 IPv4，`127.0.0.1` 为仅本机，`::` 为全部 IPv6 |
| `port` | 监听端口，默认 1120 |
| `domain` | 可选 Host 限制，如 `docs.example.com`；留空接受所有域名/IP |

填写域名不会自动配置 DNS 或证书。将域名解析到服务器，再使用 `http://域名:端口/` 访问；标准 HTTPS 可交给已有反向代理。配置只影响 Go 服务，修改后需重启；`build` 不读取服务配置。

服务拒绝目录列表、隐藏条目、辅助草稿、符号链接和非公开扩展名；源码、配置与可执行文件不会被下载。附件支持常用图片、字体、PDF、文本和音视频，不提供任意文件下载。

Markdown 原生 HTML 保留，文档应由可信维护者编写。搜索摘要会转义 HTML，Mermaid 使用 strict 模式。

## 源码编译

开发者需要 Go 1.25 或更高版本；部署用户不需要。源码在 `api/go/`，没有外部 Go 模块。

在该目录执行：

```bash
go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.version=v1.8.0.202611011511" -o ../../fastmd-linux .
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.version=v1.8.0.202611011511" -o ../../fastmd-windows.exe .
```

PowerShell 用 `$env:CGO_ENABLED='0'`、`$env:GOOS='windows'`、`$env:GOARCH='amd64'` 设置环境变量，再执行相同 `go build` 命令。ARM64 主机需将 `GOARCH` 改为 `arm64` 后自行编译；仓库附带 x64 文件。

查看版本：`fastmd-windows.exe version` 或 `./fastmd-linux version`。文件校验值在根目录 `SHA256SUMS`。

## 回归检查

在项目根目录执行：

```bash
node --test tests/frontend.test.js
python -B tests/backends.py
```

后端检查需要 Node、PHP、Python 和已编译的本平台程序，仅用于开发。测试使用临时站点运行四种后端，对比目录/搜索协议、Unicode 截断、重建结果与文件访问边界，完成后清理。
