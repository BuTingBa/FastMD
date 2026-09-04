<?php
// api/sidebar.php（兼容 PHP 7.2 ~ 8.4）
header('Content-Type: application/json; charset=utf-8');

// str_starts_with() 是 PHP 8.0+ 新增函数，低版本会 Fatal error。
// 此处做版本兜底，语义与 PHP 8 原生完全一致：
//  - 字节级前缀比较（strncmp 二进制安全，UTF-8 多字节字符无影响）
//  - 空前缀返回 true（与原生行为一致）
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) {
        $needle = (string) $needle;
        if ($needle === '') {
            return true;
        }
        return strncmp((string) $haystack, $needle, strlen($needle)) === 0;
    }
}

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
    // 去扩展名改用字节级 strrpos/substr：pathinfo() 在 Linux + 非 UTF-8 locale 环境
    // 会错误截断以多字节字符（如中文）开头的文件名，
    // 例如「支付结果通知[notify][3].md」会被截成「[notify][3]」，导致标题/路由错误
    $nameWithoutExt = $filename;
    if ($isFile) {
        $dot = strrpos($filename, '.');
        if ($dot !== false) {
            $nameWithoutExt = substr($filename, 0, $dot);
        }
    }
    
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
        if ($item === '.' || $item === '..' || $item[0] === '.' || $item[0] === '_') continue;
        
        $path = $dir . '/' . $item;
        $currentPath = $parentPath ? $parentPath . '/' . $item : $item;
        $isFile = is_file($path);
        
        // 如果是文件且不是 markdown 则跳过（字节级取扩展名，规避 pathinfo 的 locale 缺陷）
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
    
    // 升序排序
    usort($result, function($a, $b) {
        if ($a['sortWeight'] == $b['sortWeight']) return 0;
        return ($a['sortWeight'] < $b['sortWeight']) ? -1 : 1;
    });
    
    return $result;
}

$tree = scanDocs($docsDir);
echo json_encode(['data' => $tree], JSON_UNESCAPED_UNICODE);