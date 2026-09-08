#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
api/main.py —— FastMD 统一后端入口（Python 3 标准库实现，零依赖）
与 api/main.php 协议完全一致：
  GET ?action=sidebar -> 目录树 JSON：{"data": [...]}
  GET ?action=search  -> 搜索索引 JSON：[{...}, ...]

启动方式：
  python api/main.py            # 默认监听 127.0.0.1:8300
  PORT=9000 python api/main.py  # 自定义端口（Windows: set PORT=9000）

与前端联调：
  将 config.js 的 apiEndpoint 改为 "http://127.0.0.1:8300/" 即可
  （本服务已开启 CORS，允许跨域调用）
"""

import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', '8300'))
HOST = os.environ.get('HOST', '127.0.0.1')
DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'docs')

# ============================ 公共函数 ============================

# 「标题[路由][排序]」命名规范
NAME_PATTERN = re.compile(r'^([^[\]]+)(?:\[([^[\]]+)\])?(?:\[(\d+)\])?$')
# 剔除 HTML 标签（与 PHP strip_tags 行为对齐的简化实现）
HTML_TAG = re.compile(r'<[^>]*>')
WHITESPACE = re.compile(r'\s+')


def parse_file_name(filename, is_file):
    """解析「标题[路由][排序]」，返回 (标题, 路由, 排序或 None)"""
    name = filename
    if is_file:
        dot = name.rfind('.')
        if dot != -1:
            name = name[:dot]
    m = NAME_PATTERN.match(name)
    if not m:
        return name, name, None
    title = m.group(1).strip()
    route = m.group(2).strip() if m.group(2) else title
    sort = int(m.group(3)) if m.group(3) is not None else None
    return title, route, sort


def is_ignored(name):
    """忽略隐藏文件（. 开头）与辅助文档（_ 开头）"""
    return name.startswith('.') or name.startswith('_')


def is_markdown(name):
    """文件是否为 markdown（字节级判断扩展名）"""
    dot = name.rfind('.')
    return dot != -1 and name[dot + 1:] == 'md'

# ============================ 目录树扫描 ============================


def scan_docs(dir_path, parent_route='', parent_path=''):
    result = []
    try:
        items = os.listdir(dir_path)
    except OSError:
        return result

    for item in items:
        if is_ignored(item):
            continue

        full_path = os.path.join(dir_path, item)
        current_path = parent_path + '/' + item if parent_path else item

        if os.path.islink(full_path):
            continue
        is_file = os.path.isfile(full_path)

        if is_file and not is_markdown(item):
            continue

        title, route, sort = parse_file_name(item, is_file)
        full_route = parent_route + '/' + route if parent_route else route
        sort_weight = sort if sort is not None else int(os.path.getmtime(full_path))

        if os.path.isdir(full_path):
            children = scan_docs(full_path, full_route, current_path)
            if children:
                result.append({
                    'type': 'dir', 'title': title, 'route': route,
                    'fullRoute': full_route, 'sortWeight': sort_weight,
                    'children': children,
                })
        else:
            result.append({
                'type': 'file', 'title': title, 'route': route,
                'fullRoute': full_route, 'actualPath': current_path,
                'sortWeight': sort_weight,
            })

    result.sort(key=lambda x: x['sortWeight'])
    return result

# ============================ 搜索索引构建 ============================


def build_search_index(dir_path, parent_route=''):
    result = []
    try:
        items = os.listdir(dir_path)
    except OSError:
        return result

    for item in items:
        if is_ignored(item):
            continue

        full_path = os.path.join(dir_path, item)

        if os.path.islink(full_path):
            continue
        is_file = os.path.isfile(full_path)

        if is_file and not is_markdown(item):
            continue

        title, route, _ = parse_file_name(item, is_file)
        full_route = parent_route + '/' + route if parent_route else route

        if os.path.isdir(full_path):
            result.extend(build_search_index(full_path, full_route))
        else:
            try:
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
            except OSError:
                continue
            # 极简清理：压缩空白、剔除 HTML 标签（与 PHP 版行为一致）
            content = HTML_TAG.sub('', WHITESPACE.sub(' ', content))
            result.append({
                'title': title, 'route': full_route,
                'content': content[:20000],
            })
    return result

# ============================ HTTP 服务 ============================


class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        # 统一 CORS，便于前端跨域联调
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()

        query = parse_qs(urlparse(self.path).query)
        action = (query.get('action') or ['sidebar'])[0]

        if not os.path.isdir(DOCS_DIR):
            payload = [] if action == 'search' else {'data': []}
        elif action == 'search':
            payload = build_search_index(DOCS_DIR)
        else:
            payload = {'data': scan_docs(DOCS_DIR)}

        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))

    def log_message(self, fmt, *args):
        sys.stderr.write('[FastMD] %s\n' % (fmt % args))


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print('FastMD Python backend listening at http://%s:%s/' % (HOST, PORT))
    print('docs dir: %s' % os.path.abspath(DOCS_DIR))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
