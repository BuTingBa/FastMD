# 部署指南

本系统零构建，部署只需一个能解析 PHP 的 Web 容器。

## 方式一：PHP 内置服务器（开发 / 内网演示）

最简方式，适合本地开发或内网快速演示：

```bash
php -S 0.0.0.0:8000
```

访问 `http://服务器IP:8000/` 即可。

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

    # 静态资源与 SPA 入口
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

访问 `http://docs.example.com/` 即可。

## 方式三：Apache

项目目录下新建 `.htaccess`：

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [L]
</IfModule>
```

确保 Apache 已启用 `mod_rewrite` 与 PHP 解析。

## 部署到子目录

本系统支持部署在任意层级的子目录，例如：

- `https://example.com/wiki/`
- `https://example.com/a/b/wiki/`

无需任何配置，项目会在运行时动态计算根路径并写入 `<base>` 标签，所有相对路径引用（CSS / JS / PHP 接口 / 文档请求）都会自动适配。

> 访问时无论是否带结尾斜杠（如 `/wiki` 或 `/wiki/`）均可正常工作，系统会自动补全。

## 隐藏后端接口（可选）

如果不想暴露 `api/` 路径，可在 Nginx 中增加内部重写：

```nginx
location /sidebar.json {
    rewrite ^ /api/sidebar.php last;
}
location /search.json {
    rewrite ^ /api/search.php last;
}
```

然后修改 `assets/main.js` 中的 `fetch('api/sidebar.php')` 与 `fetch('api/search.php')` 为对应的新路径即可。

## 换用其它后端语言

PHP 接口非常简单，只需返回指定 JSON 结构：

- `api/sidebar.php`：返回 `{ "data": [ ...树状结构 ] }`
- `api/search.php`：返回 `[ ...文档列表 ]`

你可以用 Node.js、Go、Python 等任意语言实现相同接口，前端无需改动。详见 [开发说明](#/dev)。

## 常见部署问题

| 症状 | 排查 |
|---|---|
| 页面白屏，控制台 404 | 检查 Web 服务器是否正确指向项目根目录 |
| 菜单为空 | 确认 `docs/` 目录存在且有 `.md` 文件 |
| 搜索无结果 | 确认后端服务已启动，`config.js` 的 `apiEndpoint` 地址可访问 |
| 中文路径 404 | 检查 Nginx 是否对中文 URL 做了额外编码，必要时开启 `charset utf-8;` |
