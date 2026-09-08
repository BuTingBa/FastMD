# 部署指南

本系统零构建，后端支持多种部署形态（默认 PHP；也可 Node.js / Python / 纯静态 JSON，见文末「换用其它后端语言」），按需选择：

## 方式一：PHP 内置服务器（开发 / 内网演示）

最简方式，适合本地开发或内网快速演示：

```bash
php -S 0.0.0.0:8000
```

访问 `http://服务器IP:8000/` 即可。

::: tip 路由说明
内置服务器不解析 `.htaccess`，路径式请求 `api/php/sidebar` 会 404，前端自动回退到 `?action=sidebar` 查询参数方式，功能完全一致，无需处理。
:::

## 方式二：Nginx + PHP-FPM（生产推荐）

将整个项目目录上传到服务器，例如 `/var/www/wiki/`。

Nginx 配置示例：

```nginx
server {
    listen       80;
    server_name  docs.example.com;
    root         /var/www/wiki;
    index        index.html index.php;

    # PHP 接口
    location ~ \.php$ {
        fastcgi_pass   unix:/run/php/php8.1-fpm.sock;
        fastcgi_index  index.php;
        include        fastcgi_params;
        fastcgi_param  SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # 后端路径路由：/api/php/sidebar 等回退到 api/php/index.php（PATH_INFO 分发）
    location /api/php/ {
        try_files $uri $uri/ /api/php/index.php?$query_string;
    }

    # 静态资源与 SPA 入口
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

访问 `http://docs.example.com/` 即可。

## 方式三：Apache

项目根目录新建 `.htaccess`（SPA 入口回退）：

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [L]
</IfModule>
```

确保 Apache 已启用 `mod_rewrite` 与 PHP 解析，且虚拟主机配置 `AllowOverride All`（允许读取 .htaccess）。

后端路由无需额外配置：`api/php/.htaccess`（`FallbackResource index.php`）已内置，`/api/php/sidebar`、`/api/php/search` 路径会自动回退到 `api/php/index.php` 并按 `PATH_INFO` 分发。

## 部署到子目录

本系统支持部署在任意层级的子目录，例如：

- `https://example.com/wiki/`
- `https://example.com/a/b/wiki/`

无需任何配置，项目会在运行时动态计算根路径并写入 `<base>` 标签，所有相对路径引用（CSS / JS / PHP 接口 / 文档请求）都会自动适配。

> 访问时无论是否带结尾斜杠（如 `/wiki` 或 `/wiki/`）均可正常工作，系统会自动补全。

## 隐藏后端接口（可选）

如果不想暴露 `api/` 路径，可在 Nginx 中增加内部重写：

```nginx
location /data/sidebar {
    rewrite ^ /api/php/index.php?action=sidebar last;
}
location /data/search {
    rewrite ^ /api/php/index.php?action=search last;
}
```

然后修改 `config.js` 的 `apiEndpoint` 为 `"data"`，前端请求 `data/sidebar`、`data/search` 即被重写到后端（详见 [配置与服务](#/config)）。

## 换用其它后端语言

后端接口非常简单，只需实现两个 GET 路由、返回指定 JSON 结构：

- `GET /sidebar`：返回 `{ "data": [ ...树状结构 ] }`
- `GET /search`：返回 `[ ...文档列表 ]`

api 目录已按语言分目录提供官方实现（`api/php/`、`api/nodejs/`、`api/python/`），也可以用 Go、Java 等任意语言自实现；甚至完全不用后端——`api/file/` 静态 JSON 方案改一行 `apiEndpoint` 即可纯静态部署。前端无需改动，详见 [配置与服务](#/config)。

## 常见部署问题

| 症状 | 排查 |
|---|---|
| 页面白屏，控制台 404 | 检查 Web 服务器是否正确指向项目根目录 |
| 菜单为空 | 确认 `docs/` 目录存在且有 `.md` 文件 |
| 搜索无结果 | 确认后端服务已启动，`config.js` 的 `apiEndpoint` 地址可访问 |
| 中文路径 404 | 检查 Nginx 是否对中文 URL 做了额外编码，必要时开启 `charset utf-8;` |
