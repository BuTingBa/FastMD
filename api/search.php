<?php
// api/search.php（兼容 PHP 7.2 ~ 8.4）
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

// mbstring 扩展未启用时的降级处理（按字节截断，仅影响索引长度限制，不影响功能）
if (!function_exists('mb_substr')) {
    function mb_substr($str, $start, $length = null, $encoding = null) {
        return $length === null ? substr($str, $start) : substr($str, $start, $length);
    }
}

$docsDir = dirname(__DIR__) . '/docs';

if (!is_dir($docsDir)) {
    echo json_encode([], JSON_UNESCAPED_UNICODE);
    exit;
}

// 复用路由解析逻辑
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
    if (preg_match('/^([^\[\]]+)(?:\[([^\[\]]+)\])?(?:\[(\d+)\])?$/', $nameWithoutExt, $matches)) {
        $title = trim($matches[1]);
        $route = !empty($matches[2]) ? trim($matches[2]) : $title;
        return [$title, $route];
    }
    return [$nameWithoutExt, $nameWithoutExt];
}

// 递归提取所有文档内容
function buildSearchIndex($dir, $parentRoute = '') {
    $result = [];
    $items = scandir($dir);
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || $item[0] === '.' || $item[0] === '_') continue;
        
        $path = $dir . '/' . $item;
        $isFile = is_file($path);
        
        // 如果是文件且不是 markdown 则跳过（字节级取扩展名，规避 pathinfo 的 locale 缺陷）
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
                'content' => mb_substr($content, 0, 20000) // 限制单篇文档索引最大字符数，防内存溢出
            ];
        }
    }
    return $result;
}

echo json_encode(buildSearchIndex($docsDir), JSON_UNESCAPED_UNICODE);