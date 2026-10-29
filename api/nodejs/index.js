#!/usr/bin/env node
'use strict';

// Zero-dependency dynamic backend; only document-site resources are public.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const PORT = process.env.PORT || 8300;
const HOST = process.env.HOST || '127.0.0.1';
const NAME_PATTERN = /^([^\[\]]+)(?:\[([^\[\]]*)\])?(?:\[(\d+)\])?$/;
const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
    '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

function parseFileName(filename, isFile) {
    const name = isFile ? filename.slice(0, filename.lastIndexOf('.')) : filename;
    const match = name.match(NAME_PATTERN);
    if (!match) return [name, name, null];
    const title = match[1].trim();
    return [title, (match[2] || '').trim() || title, match[3] === undefined ? null : Number(match[3])];
}

function scanDocs(dir = DOCS_DIR, parentRoute = '', parentPath = '', seen = new Set()) {
    const result = [];
    if (!fs.existsSync(dir)) return result;
    for (const name of fs.readdirSync(dir)) {
        if (/^[._]/.test(name)) continue;
        const filePath = path.join(dir, name);
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || path.extname(name) !== '.md'))) continue;
        const [title, route, sort] = parseFileName(name, stat.isFile());
        if (!route || route === '.' || route === '..' || /[/\\#?\x00\r\n\t]/.test(route)) {
            throw new Error('Invalid route: ' + name);
        }
        const fullRoute = parentRoute ? parentRoute + '/' + route : route;
        if (seen.has(fullRoute)) throw new Error('Duplicate route: ' + fullRoute);
        seen.add(fullRoute);
        const actualPath = parentPath ? parentPath + '/' + name : name;
        const node = { type: stat.isDirectory() ? 'dir' : 'file', title, route, fullRoute,
            sortWeight: sort === null ? Math.floor(stat.mtimeMs / 1000) : sort };
        if (stat.isDirectory()) {
            node.children = scanDocs(filePath, fullRoute, actualPath, seen);
            if (!node.children.length) continue;
        } else {
            node.actualPath = actualPath;
        }
        result.push(node);
    }
    return result.sort((a, b) => a.sortWeight - b.sortWeight || compare(a.fullRoute, b.fullRoute));
}

function buildSearchIndex(tree) {
    const result = [];
    for (const item of tree) {
        if (item.type === 'dir') result.push(...buildSearchIndex(item.children));
        else {
            // Preserve code examples and markup; the frontend escapes displayed excerpts.
            const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(path.join(DOCS_DIR, item.actualPath))).replace(/[ \t\r\n\f\v]+/g, ' ');
            result.push({ title: item.title, route: item.fullRoute, content: Array.from(text).slice(0, 20000).join('') });
        }
    }
    return result.sort((a, b) => compare(a.route, b.route));
}

function sendJson(req, res, code, value) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value));
}

function publicPath(name) {
    const parts = name.split('/');
    if (parts.some(part => !part || /^[._]/.test(part) || /[\\:\x00]/.test(part))) return false;
    if (['index.html', 'config.js', 'api/file/sidebar', 'api/file/search'].includes(name)) return true;
    return parts.length > 1 && ['docs', 'assets'].includes(parts[0]) && Object.hasOwn(MIME, path.extname(name).toLowerCase());
}

function serveStatic(req, res, name) {
    if (!publicPath(name)) return sendJson(req, res, 404, { error: 'Not found' });
    const parts = name.split('/');
    let filePath = ROOT_DIR;
    for (const part of parts) {
        filePath = path.join(filePath, part);
        if (fs.lstatSync(filePath).isSymbolicLink()) return sendJson(req, res, 404, { error: 'Not found' });
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return sendJson(req, res, 404, { error: 'Not found' });
    res.writeHead(200, {
        'Content-Type': name.startsWith('api/file/') ? 'application/json; charset=utf-8' : MIME[path.extname(name).toLowerCase()],
        'Content-Length': stat.size
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    try {
        const url = new URL(req.url, 'http://localhost');
        const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
        let action = ['sidebar', 'search'].includes(name) ? name : '';
        if (/^api\/php\/(sidebar|search)$/.test(name)) action = name.split('/').pop();
        if (['index.html', 'api/php', 'api/php/', 'api/php/index.php'].includes(name)) action = url.searchParams.get('action') || action;
        if (action) {
            if (!['sidebar', 'search'].includes(action)) return sendJson(req, res, 404, { error: 'Unknown action' });
            const tree = scanDocs();
            return sendJson(req, res, 200, action === 'sidebar' ? { data: tree } : buildSearchIndex(tree));
        }
        serveStatic(req, res, name);
    } catch (error) {
        if (res.headersSent) return res.destroy();
        const code = error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
        if (code === 500) console.error(error.message);
        sendJson(req, res, code, { error: code === 500 ? 'Cannot build document index; check server log' : 'Invalid path or file not found' });
    }
});

server.listen(PORT, HOST, () => console.log(`FastMD: http://${HOST}:${PORT}/`));
