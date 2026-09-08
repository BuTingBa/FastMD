<?php
// api/main.php —— FastMD 统一后端入口（PHP 5.6 ~ 8.4 单文件兼容版）
// 由 sidebar.php + search.php 合并而来，通过 ?action= 参数区分功能：
//   GET api/main.php?action=sidebar → 目录树 JSON：{"data": [...]}
//   GET api/main.php?action=search  → 搜索索引 JSON：[{...}, ...]
// 不带 action 参数时默认返回 sidebar，方便浏览器直接访问调试。
//
// 兼容性说明：
//  - str_starts_with() 是 PHP 8.0+ 函数，此处 polyfill，PHP 5.6/7.x 可用
//  - mbstring 未启用时 mb_substr 自动降级为 substr（仅影响索引截断，不影响功能）
//  - 去扩展名用字节级 strrpos/substr，规避 pathinfo() 在 Linux +
//    非 UTF-8 locale 下截断中文开头文件名的缺陷

header('Content-Type: application/json; charset=utf-8');

if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) {
        $needle = (string) $needle;
        if ($needle === '') {
            return true;
        }
        return strncmp((string) $haystack, $needle, strlen($needle)) === 0;
    }
}

if (!function_exists('mb_substr')) {
    function mb_substr($str, $start, $length = null, $encoding = null) {
        return $length === null ? substr($str, $start) : substr($str, $start, $length);
    }
}

$docsDir = dirname(__DIR__) . '/docs';

// ============================ 公共函数 ============================

/**
 * 解析文件名，格式支持：标题[路由][排序]
 * 返回 [标题, 路由, 排序(可为 null)]
 */
function parseFileName($filename, $isFile = false) {
    // 去扩展名：字节级 strrpos/substr，规避 pathinfo 的 locale 缺陷
    $nameWithoutExt = $filename;
    if ($isFile) {
        $dot = strrpos($filename, '.');
        if ($dot !== false) {
            $nameWithoutExt = substr($filename, 0, $dot);
        }
    }

    if (preg_match('/^([^\[\]]+)(?:\[([^\[\]]+)\])?(?:\[(\d+)\])?$/', $nameWithoutExt, $matches)) {
        $title = trim($matches[1]);
        $route = !empty($matches[2]) ? trim($matches[2]) : $title;
        $sort = (isset($matches[3]) && $matches[3] !== '') ? (int)$matches[3] : null;
        return [$title, $route, $sort];
    }

    return [$nameWithoutExt, $nameWithoutExt, null];
}

/**
 * 判断是否为需要忽略的条目：隐藏文件（. 开头）或辅助文档（_ 开头）
 */
function isIgnored($item) {
    return str_starts_with($item, '.') || str_starts_with($item, '_');
}

// ============================ 目录树扫描 ============================

/**
 * 递归扫描文档目录，生成菜单层级结构
 */
function scanDocs($dir, $parentRoute = '', $parentPath = '') {
    $result = [];
    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || isIgnored($item)) continue;

        $path = $dir . '/' . $item;
        $currentPath = $parentPath ? $parentPath . '/' . $item : $item;
        $isFile = is_file($path);

        // 文件只处理 markdown（字节级取扩展名）
        if ($isFile) {
            $extDot = strrpos($item, '.');
            if ($extDot === false || substr($item, $extDot + 1) !== 'md') continue;
        }

        list($title, $route, $sort) = parseFileName($item, $isFile);
        $fullRoute = $parentRoute ? $parentRoute . '/' . $route : $route;
        $sortWeight = $sort !== null ? $sort : filemtime($path);

        if (is_dir($path)) {
            $children = scanDocs($path, $fullRoute, $currentPath);
            if (!empty($children)) {
                $result[] = [
                    'type' => 'dir',
                    'title' => $title,
                    'route' => $route,
                    'fullRoute' => $fullRoute,
                    'sortWeight' => $sortWeight,
                    'children' => $children
                ];
            }
        } else {
            $result[] = [
                'type' => 'file',
                'title' => $title,
                'route' => $route,
                'fullRoute' => $fullRoute,
                'actualPath' => $currentPath,
                'sortWeight' => $sortWeight
            ];
        }
    }

    // 按 sortWeight 升序
    usort($result, function($a, $b) {
        if ($a['sortWeight'] == $b['sortWeight']) return 0;
        return ($a['sortWeight'] < $b['sortWeight']) ? -1 : 1;
    });

    return $result;
}

// ============================ 搜索索引构建 ============================

/**
 * 递归读取所有文档内容，构建全文检索索引
 */
function buildSearchIndex($dir, $parentRoute = '') {
    $result = [];
    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || isIgnored($item)) continue;

        $path = $dir . '/' . $item;
        $isFile = is_file($path);

        if ($isFile) {
            $extDot = strrpos($item, '.');
            if ($extDot === false || substr($item, $extDot + 1) !== 'md') continue;
        }

        list($title, $route) = parseFileName($item, $isFile);
        $fullRoute = $parentRoute ? $parentRoute . '/' . $route : $route;

        if (is_dir($path)) {
            $result = array_merge($result, buildSearchIndex($path, $fullRoute));
        } else {
            // 读取内容并做极简清理（去除多余换行和空格，减小 JSON 体积）
            $content = file_get_contents($path);
            $content = preg_replace('/\s+/', ' ', $content);
            $content = strip_tags($content); // 简单剔除可能的 HTML 标签

            $result[] = [
                'title' => $title,
                'route' => $fullRoute,
                'content' => mb_substr($content, 0, 20000) // 限制单篇索引最大字符数，防内存溢出
            ];
        }
    }
    return $result;
}

// ============================ 路由分发 ============================

$action = isset($_GET['action']) ? $_GET['action'] : 'sidebar';

if (!is_dir($docsDir)) {
    // 无 docs 目录：sidebar 返回空树，search 返回空索引
    if ($action === 'search') {
        echo json_encode([], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['data' => []], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

switch ($action) {
    case 'search':
        echo json_encode(buildSearchIndex($docsDir), JSON_UNESCAPED_UNICODE);
        break;
    case 'sidebar':
    default:
        echo json_encode(['data' => scanDocs($docsDir)], JSON_UNESCAPED_UNICODE);
        break;
}
