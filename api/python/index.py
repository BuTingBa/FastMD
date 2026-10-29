#!/usr/bin/env python3
"""Zero-dependency document API and restricted static server (Python 3.7+)."""
import json
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DOCS_DIR = os.path.join(ROOT_DIR, 'docs')
NAME_PATTERN = re.compile(r'^([^\[\]]+)(?:\[([^\[\]]*)\])?(?:\[(\d+)\])?$')
PUBLIC_EXTENSIONS = set('.md .html .css .js .json .svg .png .jpg .jpeg .gif .webp .avif .ico .woff .woff2 .ttf .eot .pdf .txt .mp3 .mp4 .webm .ogg .wav'.split())


def parse_file_name(filename, is_file):
    name = filename.rsplit('.', 1)[0] if is_file else filename
    match = NAME_PATTERN.fullmatch(name)
    if not match:
        return name, name, None
    title = match[1].strip()
    return title, (match[2] or '').strip() or title, int(match[3]) if match[3] else None


def scan_docs(directory=DOCS_DIR, parent_route='', parent_path='', seen=None):
    result = []
    if seen is None:
        seen = set()
    if not os.path.isdir(directory):
        return result
    for name in sorted(os.listdir(directory)):
        if name.startswith(('.', '_')):
            continue
        path = os.path.join(directory, name)
        if os.path.islink(path):
            continue
        is_dir = os.path.isdir(path)
        if not is_dir and (not os.path.isfile(path) or not name.endswith('.md')):
            continue
        title, route, weight = parse_file_name(name, not is_dir)
        if not route or route in ('.', '..') or re.search(r'[/\\#?\x00\r\n\t]', route):
            raise ValueError('Invalid route: ' + name)
        full_route = parent_route + '/' + route if parent_route else route
        if full_route in seen:
            raise ValueError('Duplicate route: ' + full_route)
        seen.add(full_route)
        actual_path = parent_path + '/' + name if parent_path else name
        node = {'type': 'dir' if is_dir else 'file', 'title': title, 'route': route,
                'fullRoute': full_route, 'sortWeight': weight if weight is not None else int(os.path.getmtime(path))}
        if is_dir:
            node['children'] = scan_docs(path, full_route, actual_path, seen)
            if not node['children']:
                continue
        else:
            node['actualPath'] = actual_path
        result.append(node)
    return sorted(result, key=lambda node: (node['sortWeight'], node['fullRoute']))


def build_search_index(tree):
    result = []
    for item in tree:
        if item['type'] == 'dir':
            result.extend(build_search_index(item['children']))
        else:
            with open(os.path.join(DOCS_DIR, item['actualPath']), encoding='utf-8') as source:
                text = re.sub(r'[ \t\r\n\f\v]+', ' ', source.read())
            result.append({'title': item['title'], 'route': item['fullRoute'], 'content': text[:20000]})
    return sorted(result, key=lambda item: item['route'])


def public_path(name):
    parts = name.split('/')
    if any(not part or part.startswith(('.', '_')) or re.search(r'[\\:\x00]', part) for part in parts):
        return False
    if name in ('index.html', 'config.js', 'api/file/sidebar', 'api/file/search'):
        return True
    return len(parts) > 1 and parts[0] in ('docs', 'assets') and os.path.splitext(name)[1].lower() in PUBLIC_EXTENSIONS


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.handle_read()

    def do_HEAD(self):
        self.handle_read()

    def handle_read(self):
        try:
            parsed = urlparse(self.path)
            if re.search(r'%(?![0-9a-fA-F]{2})', parsed.path):
                return self.send_error(400, 'Invalid URL encoding')
            name = unquote(parsed.path, errors='strict').lstrip('/') or 'index.html'
            action = name if name in ('sidebar', 'search') else ''
            if name in ('api/php/sidebar', 'api/php/search'):
                action = name.rsplit('/', 1)[1]
            if name in ('index.html', 'api/php', 'api/php/', 'api/php/index.php'):
                action = (parse_qs(parsed.query).get('action') or [action])[0]
            if action:
                if action not in ('sidebar', 'search'):
                    return self.send_json(404, {'error': 'Unknown action'})
                tree = scan_docs()
                return self.send_json(200, {'data': tree} if action == 'sidebar' else build_search_index(tree))
            if not public_path(name):
                return self.send_error(404)
            path = ROOT_DIR
            for part in name.split('/'):
                path = os.path.join(path, part)
                if os.path.islink(path):
                    return self.send_error(404)
            if not os.path.isfile(path):
                return self.send_error(404)
            if name.startswith(('docs/', 'api/file/')):
                # Avoid false 304 responses after a same-second document rebuild.
                del self.headers['If-Modified-Since']
            if self.command == 'HEAD':
                super().do_HEAD()
            else:
                super().do_GET()
        except UnicodeError:
            self.send_error(400, 'Invalid UTF-8')
        except (OSError, ValueError) as error:
            self.log_error('%s', error)
            self.send_json(500, {'error': 'Cannot build document index; check server log'})

    def send_json(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def guess_type(self, path):
        if path.endswith(('/sidebar', '/search')):
            return 'application/json; charset=utf-8'
        if path.endswith('.md'):
            return 'text/plain; charset=utf-8'
        return super().guess_type(path)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def main():
    host, port = os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8300'))
    server = ThreadingHTTPServer((host, port), partial(Handler, directory=ROOT_DIR))
    print('FastMD: http://%s:%s/' % (host, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
