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
     *    - "api/php"     → 默认 PHP 实现（api/php/index.php，经目录默认入口分发）
     *    - "api/file"    → 静态 JSON 方案（api/file/ 下预渲染好的 sidebar、search
     *                      文件，无需任何后端语言，纯静态主机即可运行）
     *    - "http://127.0.0.1:8300" → Node.js / Python 独立服务（需先启动）
     *    无论部署在根目录还是任意层级子目录（/a/b/wiki/）都能正确解析。
     *
     * 2. 绝对路径：接口与服务页面不在同一台机器/端口时使用。
     *    - "https://api.example.com/main"
     *    注意：跨域部署时后端必须返回 CORS 头：
     *    Access-Control-Allow-Origin: *
     *
     * ── 接口协议（自定义后端语言只需实现两个路由）──────────────────
     * GET {apiEndpoint}/sidebar → 返回目录树 JSON：{ "data": [...] }
     * GET {apiEndpoint}/search  → 返回搜索索引 JSON：[ {...}, ... ]
     * 兼容查询参数方式：{apiEndpoint}?action=sidebar / ?action=search
     * （前端路径式请求失败时自动回退，无需额外配置）
     * 详细字段说明见 docs/ 配置与服务 文档。
     */
    apiEndpoint: "api/php"
};


