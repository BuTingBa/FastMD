#!/usr/bin/env node
/**
 * api/main.js —— FastMD 统一后端入口（Node.js 实现，零依赖）
 * 与 api/main.php 协议完全一致（路径式路由为推荐协议，旧查询参数式向后兼容）：
 *   GET /action/sidebar → 目录树 JSON：{"data": [...]}
 *   GET /action/search  → 搜索索引 JSON：[{...}, ...]
 *   GET ?action=sidebar / ?action=search（旧协议，同样支持）
 *
 * 除 API 路由外的其它路径一律按静态文件处理（根目录为项目根），
 * 因此本服务可独立托管整站：api 目录下的文件也能以目录方式直接访问。
 *
 * 启动方式：
 *   node api/main.js            # 默认监听 127.0.0.1:8300，可直接当整站服务器
 *   PORT=9000 node api/main.js  # 自定义端口（Windows: set PORT=9000）
 *
 * 与前端联调（两种用法）：
 *   1. 独立整站：浏览器直接访问 http://127.0.0.1:8300/ ，config.js 无需修改
 *   2. 仅当接口：将 config.js 的 apiEndpoint 改为 "http://127.0.0.1:8300/"
 *      （本服务已开启 CORS，允许跨域调用）
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8300;
const HOST = process.env.HOST || '127.0.0.1';
// 静态服务根目录 = 项目根（api 的上一级）
const ROOT_DIR = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// 常见静态资源 MIME 类型
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.txt': 'text/plain; charset=utf-8'
};

// ============================ 公共函数 ============================

/**
 * 解析文件名「标题[路由][排序]」，返回 [标题, 路由, 排序(可为 null)]
 */
function parseFileName(filename, isFile) {
    let name = filename;
    if (isFile) {
        const dot = name.lastIndexOf('.');
        if (dot !== -1) name = name.slice(0, dot);
    }
    const m = name.match(/^([^[\]]+)(?:\[([^[\]]+)\])?(?:\[(\d+)\])?$/);
    if (!m) return [name, name, null];
    const title = m[1].trim();
    const route = m[2] ? m[2].trim() : title;
    const sort = (m[3] !== undefined && m[3] !== '') ? parseInt(m[3], 10) : null;
    return [title, route, sort];
}

/** 忽略隐藏文件（. 开头）与辅助文档（_ 开头） */
function isIgnored(name) {
    return name.startsWith('.') || name.startsWith('_');
}

/** 文件是否为 markdown（字节级判断扩展名） */
function isMarkdown(name) {
    const dot = name.lastIndexOf('.');
    return dot !== -1 && name.slice(dot + 1) === 'md';
}

// ============================ 目录树扫描 ============================

function scanDocs(dir, parentRoute, parentPath) {
    const result = [];
    let items;
    try {
        items = fs.readdirSync(dir);
    } catch (e) {
        return result;
    }

    for (const item of items) {
        if (isIgnored(item)) continue;

        const fullPath = path.join(dir, item);
        const currentPath = parentPath ? parentPath + '/' + item : item;

        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            continue;
        }
        const isFile = stat.isFile();

        if (isFile && !isMarkdown(item)) continue;

        const [title, route, sort] = parseFileName(item, isFile);
        const fullRoute = parentRoute ? parentRoute + '/' + route : route;
        const sortWeight = sort !== null ? sort : Math.floor(stat.mtimeMs / 1000);

        if (stat.isDirectory()) {
            const children = scanDocs(fullPath, fullRoute, currentPath);
            if (children.length > 0) {
                result.push({ type: 'dir', title, route, fullRoute, sortWeight, children });
            }
        } else {
            result.push({ type: 'file', title, route, fullRoute, actualPath: currentPath, sortWeight });
        }
    }

    result.sort((a, b) => a.sortWeight - b.sortWeight);
    return result;
}

// ============================ 搜索索引构建 ============================

function buildSearchIndex(dir, parentRoute) {
    const result = [];
    let items;
    try {
        items = fs.readdirSync(dir);
    } catch (e) {
        return result;
    }

    for (const item of items) {
        if (isIgnored(item)) continue;

        const fullPath = path.join(dir, item);

        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            continue;
        }

        if (stat.isFile() && !isMarkdown(item)) continue;

        const [title, route] = parseFileName(item, stat.isFile());
        const fullRoute = parentRoute ? parentRoute + '/' + route : route;

        if (stat.isDirectory()) {
            result.push(...buildSearchIndex(fullPath, fullRoute));
        } else {
            let content;
            try {
                content = fs.readFileSync(fullPath, 'utf8');
            } catch (e) {
                continue;
            }
            // 极简清理：压缩空白、剔除 HTML 标签（与 PHP 版行为一致）
            content = content.replace(/\s+/g, ' ').replace(/<[^>]*>/g, '');
            result.push({ title, route: fullRoute, content: content.slice(0, 20000) });
        }
    }
    return result;
}

// ============================ HTTP 服务 ============================

/** 输出 JSON（API 响应统一走这里） */
function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

/** 按 action 名输出对应 API 数据 */
function sendAction(res, action) {
    let payload;
    if (!fs.existsSync(DOCS_DIR)) {
        payload = action === 'search' ? [] : { data: [] };
    } else if (action === 'search') {
        payload = buildSearchIndex(DOCS_DIR, '');
    } else if (action === 'sidebar') {
        payload = { data: scanDocs(DOCS_DIR, '', '') };
    } else {
        sendJson(res, 404, { error: 'unknown action: ' + action });
        return;
    }
    sendJson(res, 200, payload);
}

/** 静态文件服务（根目录 = 项目根；目录回退到 index.html） */
function serveStatic(res, pathname) {
    let filePath = decodeURIComponent(pathname);
    // 防路径穿越：归一化后必须仍在项目根内
    filePath = path.normalize(path.join(ROOT_DIR, filePath));
    if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    let stat = null;
    try { stat = fs.statSync(filePath); } catch (e) { /* not found */ }
    if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        try { stat = fs.statSync(filePath); } catch (e) { stat = null; }
    }

    if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
    // 统一 CORS，便于前端跨域联调
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 路由解析（优先级：?action= 查询参数 > /action/xxx 路径 > 静态文件）
    const queryAction = url.searchParams.get('action');
    if (queryAction) {
        sendAction(res, queryAction);
        return;
    }

    const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (segments[0] === 'action' && segments[1]) {
        sendAction(res, segments[1]);
        return;
    }

    serveStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
    console.log(`FastMD Node.js backend listening at http://${HOST}:${PORT}/`);
    console.log(`docs dir: ${DOCS_DIR}`);
    console.log('API routes: /action/sidebar, /action/search (legacy: ?action=...)');
});
