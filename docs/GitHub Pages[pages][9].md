# GitHub Pages 自动部署

FastMD 可以直接托管为静态站点。GitHub Actions 负责扫描文档、生成目录与搜索索引，GitHub Pages 负责提供 HTTPS 页面，无需安装 PHP、Node.js 或维护服务器。

## 首次启用

1. 将项目推送到自己的 GitHub 仓库，或 Fork 本仓库。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
4. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `main` 并运行。
5. 工作流的 `build` 和 `deploy` 成功后，在 Pages 设置或部署任务中打开站点链接。

本仓库地址为 `https://butingba.github.io/FastMD/`。普通项目仓库的地址通常为 `https://用户名.github.io/仓库名/`，用户主页仓库和自定义域名以 Pages 设置显示的地址为准。

Fork 仓库若提示禁用 Actions，先在 Actions 页面启用工作流。默认分支不是 `main` 时，修改 `.github/workflows/pages.yml` 中的 `branches`。

## 日常更新

把 Markdown 和附件放入 `docs/`，提交并推送到 `main` 即可。改名、移动、删除和正文修改都会在下一次部署中自动重建索引，无需手动更新 `api/file/` 或提交构建产物。

工作流依次执行 Go 测试、前端协议测试、静态导出和部署。构建失败时不会发布不完整站点，已有成功部署继续服务；在 Actions 的失败步骤查看具体原因并修正后再推送。

文档链接继续使用 `#/路由`，例如 `#/pages`。前端相对路径自动适配仓库子目录，无需填写仓库名称或修改资源路径。

## 构建内容

导出命令创建 `_site/`，其中包括：

- `index.html`、`config.js` 和公开的 `assets/` 资源。
- 公开的 `docs/` 文档与附件。
- 重新生成的 `api/file/sidebar`、`api/file/search`。
- `.nojekyll`，便于同一目录用于普通静态托管。

构建只在导出的 `config.js` 末尾设置 `apiEndpoint = "api/file"`，保留站点标题等设置。项目源配置和原有 Go/PHP/Node.js/Python 部署继续可用。

隐藏条目、以下划线开头的草稿、符号链接、后端源码、服务配置和可执行文件不进入 Pages 产物。公开文件扩展名沿用独立服务规则。开源仓库中的文件仍可从 GitHub 源码页面访问，草稿过滤只影响网站导出。

GitHub Pages 不运行后端服务，因此 `fastmd.json` 的监听 IP、端口和域名设置不作用于 Pages。绑定自定义域名请在仓库 Pages 设置中配置，并按 GitHub 提示配置 DNS。

## 本地导出

Windows：

```powershell
.\fastmd-windows.exe pages
```

Linux：

```bash
./fastmd-linux pages
```

默认以程序所在目录为根，输出到该目录下的 `_site/`。导出完成后进程立即退出，上传 `_site/` 中的内容即可部署。

输出目录必须不存在；重复导出前自行删除旧输出，或使用 `pages -output site-preview` 指定另一个新的一级目录名。命令不会覆盖已有目录。无效文档、重复路由等错误会返回非零退出码，并清理本次临时目录。

从源码导出时，在 `api/go/` 中执行：

```bash
go run . pages -root ../..
```

GitHub Actions 使用同一命令，Go 版本来自 `api/go/go.mod`。构建不需要额外 Go 模块或 npm 依赖；发布使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需在仓库中保存个人令牌。
