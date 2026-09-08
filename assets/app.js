/**
 * assets/app.js —— 应用启动入口
 * 由 index.html 内联脚本抽取而来，职责：
 *   1. 创建 markdown-it 实例并挂载插件（公式、容器块）
 *   2. 建立 DOM 引用映射
 *   3. 应用全局配置（config.js 中的站点标题等）
 *   4. 启动应用（目录树 + 首篇文档 + 进度条收尾）
 *
 * 依赖顺序：config.js → assets/main.js → assets/app.js
 */

// ================= 1. Markdown 引擎与插件 =================
const md = window.markdownit({ html: true, linkify: true, typographer: true });

// Texmath 插件：数学公式（$ 行内 / $$ 块级）
md.use(window.texmath, {
    engine: window.katex,
    delimiters: 'dollars',
    katexOptions: { macros: { "\\RR": "\\mathbb{R}" } } // 可选：支持部分自定义宏
});

// Vitepress 风格容器块：::: tip / info / warning / danger [可选自定义标题]
// 例：::: warning 注意 \n 内容 \n :::  →  彩色提示框
(function () {
    var defaultTitles = { tip: '提示', info: '信息', warning: '注意', danger: '警告' };
    ['tip', 'info', 'warning', 'danger'].forEach(function (name) {
        md.use(window.markdownitContainer, name, {
            render: function (tokens, idx) {
                if (tokens[idx].nesting === 1) {
                    // 容器名后的剩余文本作为自定义标题，没有则用默认标题
                    var m = tokens[idx].info.trim().match(/^\S+\s+(.*)$/);
                    var title = (m && m[1]) ? m[1] : defaultTitles[name];
                    return '<div class="custom-block ' + name + '"><p class="custom-block-title">' +
                        md.utils.escapeHtml(title) + '</p>\n';
                }
                return '</div>\n';
            }
        });
    });
})();

// ================= 2. DOM 引用映射 =================
const DOM = {
    menu: document.getElementById('sidebar-menu'),
    content: document.getElementById('content-body'),
    toc: document.getElementById('toc-menu'),
    mobileBtn: document.getElementById('mobile-menu-btn'),
    mobileBackdrop: document.getElementById('mobile-backdrop'),
    sidebar: document.querySelector('.vp-sidebar'),

    // 展开/收缩全部的控制函数
    toggleAll: function (expand) {
        document.querySelectorAll('.sidebar-menu details').forEach(d => d.open = expand);
    }
};

// ================= 3. 应用全局配置（config.js）=================
(function applyConfig() {
    const cfg = window.FASTMD_CONFIG || {};
    if (cfg.siteTitle) {
        // 导航栏 Logo 文字 + 浏览器标签页初始标题
        const logoTitle = document.getElementById('site-title');
        if (logoTitle) logoTitle.textContent = cfg.siteTitle;
        document.title = cfg.siteTitle;
    }
})();

// ================= 4. 启动应用 =================
window.addEventListener('hashchange', loadContent);

// 初始化布局控制（侧边栏自动收起/展开 + 右侧目录手动收起/展开）
// 必须在 DOM 对象定义之后调用，因为内部依赖 DOM.sidebar 等引用
LayoutCtrl.init();

initTree().then(() => loadContent()).finally(hideAppLoader);
// 兜底：极端情况下（接口超时等）8 秒后强制隐藏进度条，避免页面卡在加载态
setTimeout(hideAppLoader, 8000);
