<?php
// PHP 5.6+; query actions work without rewrite rules. Markdown is served by the web server.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
$docsDir = dirname(dirname(__DIR__)) . '/docs';

function parseFileName($filename, $isFile = false)
{
    $name = $isFile ? substr($filename, 0, strrpos($filename, '.')) : $filename;
    if (!preg_match('/^([^\[\]]+)(?:\[([^\[\]]*)\])?(?:\[(\d+)\])?$/', $name, $match)) {
        return [$name, $name, null];
    }
    $title = trim($match[1]);
    $route = isset($match[2]) ? trim($match[2]) : '';
    return [$title, $route !== '' ? $route : $title, isset($match[3]) ? (int) $match[3] : null];
}

function scanDocs($dir, $parentRoute = '', $parentPath = '', &$seen = [])
{
    $result = [];
    if (!is_dir($dir)) {
        return $result;
    }
    $items = scandir($dir);
    if ($items === false) {
        throw new RuntimeException('Cannot scan docs');
    }
    foreach ($items as $name) {
        if ($name[0] === '.' || $name[0] === '_') {
            continue;
        }
        $path = $dir . '/' . $name;
        $isDir = is_dir($path);
        if (is_link($path) || (!$isDir && (!is_file($path) || substr($name, -3) !== '.md'))) {
            continue;
        }
        list($title, $route, $weight) = parseFileName($name, !$isDir);
        if ($route === '' || $route === '.' || $route === '..' || preg_match('~[/\\\\#?\x00\r\n\t]~', $route)) {
            throw new RuntimeException('Invalid route: ' . $name);
        }
        $fullRoute = $parentRoute !== '' ? $parentRoute . '/' . $route : $route;
        if (isset($seen[$fullRoute])) {
            throw new RuntimeException('Duplicate route: ' . $fullRoute);
        }
        $seen[$fullRoute] = true;
        $actualPath = $parentPath !== '' ? $parentPath . '/' . $name : $name;
        $node = [
            'type' => $isDir ? 'dir' : 'file',
            'title' => $title,
            'route' => $route,
            'fullRoute' => $fullRoute,
            'sortWeight' => $weight !== null ? $weight : filemtime($path)
        ];
        if ($isDir) {
            $node['children'] = scanDocs($path, $fullRoute, $actualPath, $seen);
            if (!$node['children']) {
                continue;
            }
        } else {
            $node['actualPath'] = $actualPath;
        }
        $result[] = $node;
    }
    usort($result, function ($a, $b) {
        if ($a['sortWeight'] == $b['sortWeight']) {
            return strcmp($a['fullRoute'], $b['fullRoute']);
        }
        return $a['sortWeight'] < $b['sortWeight'] ? -1 : 1;
    });
    return $result;
}

function buildSearchIndex($tree, $docsDir)
{
    $result = [];
    foreach ($tree as $item) {
        if ($item['type'] === 'dir') {
            $result = array_merge($result, buildSearchIndex($item['children'], $docsDir));
            continue;
        }
        $text = file_get_contents($docsDir . '/' . $item['actualPath']);
        if ($text === false) {
            throw new RuntimeException('Cannot read document');
        }
        // Do not strip_tags: it consumes PHP examples and Mermaid arrows as markup.
        $text = preg_replace('/[ \t\r\n\f\x0b]+/', ' ', $text);
        // Count Unicode characters without requiring mbstring; reject invalid UTF-8.
        if (!preg_match('/^.{0,20000}/us', $text, $match)) {
            throw new RuntimeException('Document must be UTF-8');
        }
        $result[] = ['title' => $item['title'], 'route' => $item['fullRoute'], 'content' => $match[0]];
    }
    usort($result, function ($a, $b) {
        return strcmp($a['route'], $b['route']);
    });
    return $result;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
if ($action === '') {
    $action = isset($_SERVER['PATH_INFO']) ? trim($_SERVER['PATH_INFO'], '/') : '';
}
// FallbackResource/try_files need not populate PATH_INFO. Recover the route
// relative to this script's URL directory, including subdirectory deployments.
if ($action === '' && isset($_SERVER['REQUEST_URI'], $_SERVER['SCRIPT_NAME'])) {
    $requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';
    if (strpos($requestPath, $prefix) === 0) {
        $tail = substr($requestPath, strlen($prefix));
        if ($tail !== '' && $tail !== 'index.php') {
            $action = trim($tail, '/');
        }
    }
}
$action = $action === '' ? 'sidebar' : $action;
if (!in_array($action, ['sidebar', 'search'], true)) {
    http_response_code(404);
    echo json_encode(['error' => 'Unknown action']);
    exit;
}
try {
    $tree = scanDocs($docsDir);
    $json = json_encode($action === 'search' ? buildSearchIndex($tree, $docsDir) : ['data' => $tree], JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Cannot encode document index');
    }
    echo $json;
} catch (Exception $error) {
    error_log($error->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Cannot build document index; check server log']);
}
