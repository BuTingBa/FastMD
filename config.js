/**
 * FastMD 全局配置文件
 * ------------------------------------------------------------------
 * 修改本文件后刷新浏览器即可生效，无需重启服务。
 * 本文件必须以 <script> 方式在 main.js / app.js 之前引入。
 */
window.FASTMD_CONFIG = {

    /**
     * 网站标题
     * 用途：顶部导航栏 Logo 文字、浏览器标签页标题后缀（如「项目介绍 - FastMD」）
     */
    siteTitle: "FastMD",

    /**
     * 后端服务接口地址（目录树 + 全文搜索共用一个入口）
     *
     * ── 路径规则说明 ──────────────────────────────────────────────
     * 1. 相对路径（推荐）：相对于项目根目录（index.html 会自动写入 <base>）。
     *    - "api/main.php"          → 默认 PHP 实现，无论部署在根目录还是
     *                                任意层级子目录（/a/b/wiki/）都能正确解析
     *    - "api/main.py"           → 换成 Python 实现（需自行部署服务）
     *    - "api/main.js"           → 换成 Node.js 实现（需自行部署服务）
     *
     * 2. 绝对路径：接口与服务页面不在同一台机器/端口时使用。
     *    - "https://api.example.com/main"
     *    注意：跨域部署时后端必须返回 CORS 头：
     *    Access-Control-Allow-Origin: *
     *
     * ── 接口协议（自定义后端语言只需实现两个 action）──────────────
     * GET {apiEndpoint}/action/sidebar → 返回目录树 JSON：{ "data": [...] }
     * GET {apiEndpoint}/action/search  → 返回搜索索引 JSON：[ {...}, ... ]
     * 兼容旧协议：{apiEndpoint}?action=sidebar / ?action=search（后端两种都支持）
     * 详细字段说明见 docs/ 配置与服务 文档。
     */
    apiEndpoint: "api/main.php"
};

/**
 * ================= 以下为框架内部全局变量（一般无需修改） =================
 * 挂载到 window，供 main.js / app.js 全局引用。
 * 注意：定义放在 config.js（而非 main.js）是为了保证配置优先加载、
 * 全局可用，避免脚本加载顺序问题。
 */

// 站点标题（main.js 中页面标题后缀使用）
window.SITE_TITLE = window.FASTMD_CONFIG.siteTitle || 'FastMD';

// 后端接口地址
window.API_ENDPOINT = window.FASTMD_CONFIG.apiEndpoint || 'api/main.php';

/**
 * 拼接后端接口地址：apiEndpoint + /action/xxx（路径式路由）
 * - 自动去掉末尾斜杠："http://host:8300/" → "http://host:8300/action/xxx"
 * - 接口地址自带查询参数时（如 "http://host/main?token=1"），
 *   路径已不可追加，退回旧协议 ?action=xxx 追加方式
 */
window.apiUrl = function (action) {
    var ep = window.API_ENDPOINT;
    if (ep.indexOf('?') !== -1) {
        return ep + '&action=' + action;
    }
    return ep.replace(/\/+$/, '') + '/action/' + action;
};

/**
 * 发起后端 API 请求：路径式路由（/action/xxx）优先，
 * 失败（404/网络错误）时自动回退旧协议（?action=xxx）。
 * 兼容不支持 PATH_INFO 的服务器（如部分 nginx 配置）
 * 与预编译静态 JSON 方案（静态服务器会忽略查询字符串）。
 */
window.fetchApi = async function (action) {
    try {
        const res = await fetch(window.apiUrl(action));
        if (res.ok) return res;
    } catch (e) { /* 落入下方旧协议重试 */ }
    return fetch(window.API_ENDPOINT + (window.API_ENDPOINT.indexOf('?') !== -1 ? '&' : '?') + 'action=' + action);
};
