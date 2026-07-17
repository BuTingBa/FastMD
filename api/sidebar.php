<?php
// api/sidebar.php
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
        if ($item === '.' || $item === '..' || str_starts_with($item, '.') || str_starts_with($item, '_')) continue;
        
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