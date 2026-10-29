"""Integration contract tests. Requires Node, PHP, Python and the built Windows binary."""
import contextlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BINARY = ROOT / ('fastmd-windows.exe' if os.name == 'nt' else 'fastmd-linux')
FLAGS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def get(port, path, method='GET', headers=None):
    request = urllib.request.Request('http://127.0.0.1:%s%s' % (port, path), method=method, headers=headers or {})
    try:
        with OPENER.open(request, timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


@contextlib.contextmanager
def server(kind, site):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    (site / 'fastmd.json').write_text(json.dumps({'host': '127.0.0.1', 'port': port, 'domain': ''}))
    commands = {
        'node': ['node', str(site / 'api/nodejs/index.js')],
        'python': [sys.executable, '-B', str(site / 'api/python/index.py')],
        'php': ['php', '-S', '127.0.0.1:%s' % port, '-t', str(site)],
        'go': [str(BINARY), 'serve', '-root', str(site)]
    }
    process = subprocess.Popen(commands[kind], cwd=site, env=dict(os.environ, HOST='127.0.0.1', PORT=str(port)),
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **FLAGS)
    try:
        for _ in range(60):
            if process.poll() is not None:
                raise AssertionError('%s exited: %s' % (kind, process.returncode))
            try:
                get(port, '/')
                break
            except OSError:
                time.sleep(.1)
        else:
            raise AssertionError('%s did not start' % kind)
        yield port
    finally:
        process.terminate()
        process.wait(timeout=10)


def build(site):
    return subprocess.run([str(BINARY), 'build', '-root', str(site)],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, **FLAGS)


def main():
    with tempfile.TemporaryDirectory(prefix='fastmd-test-') as temp:
        site = Path(temp)
        for language in ('nodejs', 'python', 'php'):
            shutil.copytree(ROOT / 'api' / language, site / 'api' / language, ignore=shutil.ignore_patterns('__pycache__'))
        (site / 'docs/Group[group][1]').mkdir(parents=True)
        (site / '.git').mkdir()
        (site / '.git/HEAD').write_text('private fixture')
        (site / 'index.html').write_text('<h1>Test</h1>')
        (site / 'config.js').write_text('window.FASTMD_CONFIG={};')
        for name, content in {
            'Home[home][0].md': '# 中文入门\n<?php echo "tail"; ?>\nA --> B\nEND',
            'Zero[0][3].md': 'Zero',
            'Group[group][1]/FAQ[][2].md': 'Question',
            'Unicode[unicode][4].md': '😀' * 20001,
            '_draft.md': 'hidden', '.hidden.md': 'hidden',
            'private.php': '<?php echo "private";'
        }.items():
            (site / 'docs' / name).write_text(content, encoding='utf-8')
        assert build(site).returncode == 0
        results = {}
        for kind in ('go', 'node', 'python', 'php'):
            with server(kind, site) as port:
                api = '/api/php/index.php?action=' if kind == 'php' else '/'
                tree = json.loads(get(port, api + 'sidebar')[1])
                index = json.loads(get(port, api + 'search')[1])
                assert len(index) == 4, (kind, index)
                assert index[0]['route'] == '0'
                assert len(index[-1]['content']) == 20000
                assert '<?php' in index[2]['content'] and 'END' in index[2]['content'], (kind, index)
                results[kind] = (tree, index)
                assert isinstance(json.loads(get(port, '/api/php/search')[1]), list), kind
                assert get(port, '/api/php?action=invalid')[0] == 404, kind
                for route in ('/api/php?action=sidebar', '/api/php?action=search'):
                    assert get(port, route)[0] == 200, (kind, route)
                if kind != 'php':  # PHP static-file policy belongs to Apache/nginx.
                    for name in ('/.git/HEAD', '/fastmd.json', '/api/php/index.php', '/docs/_draft.md',
                                 '/docs/.hidden.md', '/docs/private.php', '/docs/', '/api/',
                                 '/docs/x%5c..%5cfastmd.json', '/config.js::$DATA'):
                        assert get(port, name)[0] == 404, (kind, name)
                    assert get(port, '/%ZZ')[0] == 400, kind
                    assert get(port, '/')[0] == 200, 'malformed request killed server'
                    assert get(port, '/api/file/search', method='HEAD')[1] == b''
                    for resource in ('/api/file/search', '/docs/Home%5Bhome%5D%5B0%5D.md'):
                        assert get(port, resource, headers={'If-Modified-Since': 'Wed, 01 Jan 2099 00:00:00 GMT'})[0] == 200
                status, body = get(port, '/docs/' + urllib.parse.quote('Home[home][0].md'))
                assert status == 200 and b'END' in body
                if kind == 'go':
                    (site / 'docs/New[new][9].md').write_text('new')
                    assert build(site).returncode == 0
                    assert len(json.loads(get(port, '/search')[1])) == 5, 'running server did not pick up rebuilt index'
                    before = {name: (site / 'api/file' / name).read_bytes() for name in ('sidebar', 'search')}
                    (site / 'docs/Conflict[home][9].md').write_text('duplicate')
                    assert build(site).returncode != 0
                    assert all((site / 'api/file' / name).read_bytes() == data for name, data in before.items())
                    (site / 'docs/Conflict[home][9].md').unlink()
                    (site / 'docs/New[new][9].md').unlink()
                    assert build(site).returncode == 0
                print(kind, 'HTTP, index and boundary checks passed')
        assert all(result == results['go'] for result in results.values()), 'cross-language output differs'
        print('All four backend outputs match, including Unicode truncation and PHP examples')


if __name__ == '__main__':
    main()
