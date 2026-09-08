#!/usr/bin/env node
/**
 * api/main.js —— FastMD 统一后端入口（Node.js 实现，零依赖）
 * 与 api/main.php 协议完全一致：
 *   GET ?action=sidebar → 目录树 JSON：{"data": [...]}
 *   GET ?action=search  → 搜索索引 JSON：[{...}, ...]
 *
 * 启动方式：
 *   node api/main.js            # 默认监听 127.0.0.1:8300
 *   PORT=9000 node api/main.js  # 自定义端口（Windows: set PORT=9000）
 *
 * 与前端联调：
 *   将 config.js 的 apiEndpoint 改为 "http://127.0.0.1:8300/" 即可
 *   （本服务已开启 CORS，允许跨域调用）
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8300;
const HOST = process.env.HOST || '127.0.0.1';
const DOCS_DIR = path.join(__dirname, '..', 'docs');

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

const server = http.createServer((req, res) => {
    // 统一 CORS，便于前端跨域联调
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const action = url.searchParams.get('action') || 'sidebar';

    let payload;
    if (!fs.existsSync(DOCS_DIR)) {
        payload = action === 'search' ? [] : { data: [] };
    } else if (action === 'search') {
        payload = buildSearchIndex(DOCS_DIR, '');
    } else {
        payload = { data: scanDocs(DOCS_DIR, '', '') };
    }

    res.end(JSON.stringify(payload));
});

server.listen(PORT, HOST, () => {
    console.log(`FastMD Node.js backend listening at http://${HOST}:${PORT}/`);
    console.log(`docs dir: ${DOCS_DIR}`);
});
