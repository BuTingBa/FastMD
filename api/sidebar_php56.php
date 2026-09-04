<?php
// api/sidebar_php56.php —— PHP 5.6 兼容版目录接口
// 与 sidebar.php 功能完全一致，适配 PHP 5.6 环境：
//  - 不使用 PHP 8.0+ 的 str_starts_with()，改用 strncmp() 做字节级前缀比较
//    （二进制安全，UTF-8 多字节字符无影响，效果与 str_starts_with 完全一致）
//  - 不使用任何 PHP 7+ 语法特性
// 部署方式：在 PHP 5.6 环境下将本文件重命名为 sidebar.php（或修改前端请求地址）

header('Content-Type: application/json; charset=utf-8');

$docsDir = dirname(__DIR__) . '/docs';

// 如果没有docs目录，返回空数组
if (!is_dir($docsDir)) {
    echo json_encode(['data' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 解析文件名，格式支持：标题[路由][排序]
 */
function parseFileName($filename, $isFile = false) {
    $nameWithoutExt = $isFile ? pathinfo($filename, PATHINFO_FILENAME) : $filename;

    // 正则提取 标题[路由][排序]
    if (preg_match('/^([^\[\]]+)(?:\[([^\[\]]+)\])?(?:\[(\d+)\])?$/', $nameWithoutExt, $matches)) {
        $title = trim($matches[1]);
        $route = !empty($matches[2]) ? trim($matches[2]) : $title;
        $sort = (isset($matches[3]) && $matches[3] !== '') ? (int)$matches[3] : null;
        return [$title, $route, $sort];
    }

    // 降级处理
    return [$nameWithoutExt, $nameWithoutExt, null];
}

/**
 * 递归扫描文档目录
 */
function scanDocs($dir, $parentRoute = '', $parentPath = '') {
    $result = [];
    $items = scandir($dir);

    foreach ($items as $item) {
        // 忽略隐藏文件 (.开头) 或要求忽略的辅助文档 (_开头)
        // PHP 5.6 无 str_starts_with()，用 strncmp 字节级前缀比较替代
        if ($item === '.' || $item === '..' || strncmp($item, '.', 1) === 0 || strncmp($item, '_', 1) === 0) continue;

        $path = $dir . '/' . $item;
        $currentPath = $parentPath ? $parentPath . '/' . $item : $item;
        $isFile = is_file($path);

        // 如果是文件且不是 markdown 则跳过
        if ($isFile && pathinfo($item, PATHINFO_EXTENSION) !== 'md') continue;

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

    // 升序排序
    usort($result, function($a, $b) {
        if ($a['sortWeight'] == $b['sortWeight']) return 0;
        return ($a['sortWeight'] < $b['sortWeight']) ? -1 : 1;
    });

    return $result;
}

$tree = scanDocs($docsDir);
echo json_encode(['data' => $tree], JSON_UNESCAPED_UNICODE);
