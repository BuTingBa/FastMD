window.routeMap = {};
window.firstRoute = null;

// ================= 0. 首次加载进度条控制 =================
// 侧边栏与首篇文档渲染完成后淡出移除；8 秒兜底防止意外卡死
function hideAppLoader() {
    const loader = document.getElementById('app-loader');
    if (!loader) return;
    loader.classList.add('is-hidden');
    setTimeout(() => loader.remove(), 600);
}

// ================= 1. 拉取并渲染菜单结构 =================
async function initTree() {
    try {
        const res = await fetch('api/sidebar.php');
        const { data } = await res.json();
        DOM.menu.innerHTML = renderSidebar(data);
        initSidebarResizer();
        initMobileMenu(); // 初始化移动端菜单事件
    } catch (err) {
        console.error("加载目录树失败:", err);
        DOM.menu.innerHTML = '<p style="color:var(--vp-c-text-2);font-size:0.9rem;">加载文档出错或不存在文档</p>';
    }
}

function renderSidebar(items) {
    let html = '<ul>';
    items.forEach(item => {
        if (item.type === 'dir') {
            html += `
            <li class="dir-group">
                <details>
                    <summary class="dir-title">${item.title}</summary>
                    <div class="nested-menu">${renderSidebar(item.children)}</div>
                </details>
            </li>`;
        } else {
            window.routeMap[item.fullRoute] = item.actualPath;
            if (!window.firstRoute) window.firstRoute = item.fullRoute;
            html += `<li><a href="#/${item.fullRoute}" data-route="${item.fullRoute}">${item.title}</a></li>`;
        }
    });
    html += '</ul>';
    return html;
}

// ================= 2. 路由监听与内容加载 =================
async function loadContent() {
    let hash = window.location.hash.replace(/^#\//, '');
    let hashPath = decodeURIComponent(hash);
    
    if (!hashPath) {
        if (window.firstRoute) {
            window.location.hash = '#/' + window.firstRoute;
        } else {
            DOM.content.innerHTML = '<h1>欢迎使用</h1><p>请在 docs 文件夹放入文档。</p>';
            document.title = "欢迎 - FastMD";
        }
        return;
    }

    const actualFilePath = window.routeMap[hashPath];
    if (!actualFilePath) {
        render404(hashPath, '左侧菜单未找到匹配路由映射');
        document.title = "404 未找到 - 项目文档";
        return;
    }

    let text = '';
    const fetchUrl = 'docs/' + actualFilePath.split('/').map(encodeURIComponent).join('/');

    try {
        const res = await fetch(fetchUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Fetch 状态异常 (${res.status})`);
        text = await res.text();
    } catch (err) {
        render404(hashPath, err.message);
        document.title = "加载失败 - FastMD";
        return;
    }

    try {
        DOM.content.innerHTML = md.render(text);
        if (window.Prism) Prism.highlightAllUnder(DOM.content);

        // 渲染 Mermaid 图表（流程图/时序图/甘特图等），异步确保不阻塞后续逻辑
        renderMermaid();

        generateTOC();
        highlightActiveMenu(hashPath);
        updateDocumentTitle(hashPath); // 更新浏览器标签页标题
        window.scrollTo(0, 0);

        // 如果是移动端屏幕，点击某篇文章后自动收起侧边栏
        if (window.innerWidth <= 768) {
            toggleMobileSidebar(false);
        }
    } catch (err) {
        DOM.content.innerHTML = `<div class="custom-block warning" style="border-color: red; background-color: #ffe6e6;">
            <p class="custom-block-title" style="color: red;">渲染异常</p>
            <p>在解析文档或渲染代码高亮时发生错误：<br><code>${err.message}</code></p>
        </div>` + DOM.content.innerHTML;
    }
}

// ================= 2.1 Mermaid 图表渲染 =================
// 将 markdown-it 输出的 ```mermaid 代码块转换为可视化图表
// 特性：拖拽平移、滚轮缩放、双击复位、源码/图表切换、全屏查看
let _mermaidInited = false;
async function renderMermaid() {
    if (!window.mermaid) return;

    // 渲染新内容前，先清理上一页可能残留的 mermaid 临时 DOM
    cleanupMermaidTmpDom();

    // 查找所有 mermaid 代码块（markdown-it 会输出 <pre><code class="language-mermaid">）
    const mermaidCodes = DOM.content.querySelectorAll('code.language-mermaid');
    if (mermaidCodes.length === 0) return;

    // 关键：等待浏览器完成布局计算和字体加载后再渲染 mermaid。
    // mermaid 的 flowchart/classDiagram/gantt 等需要测量文字尺寸来计算布局。
    // 如果在 markdown 刚插入 DOM 后立即渲染，浏览器可能还没完成布局
    // （getBoundingClientRect 返回 0），导致 mermaid 返回默认的 16x16 viewBox。
    // 等待字体加载 + setTimeout 确保布局和样式完全稳定。
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 100));

    // 首次调用时初始化 mermaid（根据系统深色模式自适应主题）
    if (!_mermaidInited) {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        window.mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'default',
            securityLevel: 'loose',
            // 使用 mermaid 默认的 useMaxWidth:true 确保所有图表类型正确渲染
            // （classDiagram、gantt 等依赖 max-width 进行内部布局计算）
            // 渲染后在 buildMermaidCard 中手动移除 SVG 的 max-width 限制以支持缩放
            flowchart: { useMaxWidth: true, htmlLabels: true },
            sequence: { useMaxWidth: true },
            journey: { useMaxWidth: true },
            gantt: { useMaxWidth: true },
            pie: { useMaxWidth: true }
        });
        _mermaidInited = true;
    }

    // 逐个渲染：取原始文本 -> 调用 mermaid.render 生成 svg -> 替换原 <pre>
    for (let i = 0; i < mermaidCodes.length; i++) {
        const code = mermaidCodes[i];
        const pre = code.parentElement; // <pre> 标签
        const graphDefinition = code.textContent;
        const id = 'mermaid-svg-' + Date.now() + '-' + i;

        // 图表间加小延迟，让 mermaid 内部状态重置
        if (i > 0) await new Promise(r => setTimeout(r, 50));

        try {
            const { svg } = await window.mermaid.render(id, graphDefinition);
            // 构建图表卡片容器（含工具栏、图表区、源码区）
            pre.replaceWith(buildMermaidCard(svg, graphDefinition));
        } catch (err) {
            console.error('Mermaid 渲染失败:', err);
            // 渲染失败时，构建只显示源码的卡片，并标红提示
            pre.replaceWith(buildMermaidCard('', graphDefinition, err.message || '语法错误'));
        }
    }
    // 渲染完成后清理临时容器
    cleanupMermaidTmpDom();
}

/**
 * 构建 Mermaid 图表卡片
 * @param {string} svg - 渲染出的 SVG 字符串（失败时为空）
 * @param {string} source - 原始 mermaid 源码
 * @param {string} [errMsg] - 渲染失败时的错误信息
 */
function buildMermaidCard(svg, source, errMsg) {
    const card = document.createElement('div');
    card.className = 'mermaid-card' + (errMsg ? ' mermaid-card-error' : '');

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';

    const title = document.createElement('span');
    title.className = 'mermaid-toolbar-title';
    title.textContent = errMsg ? '图表渲染失败' : 'Mermaid 图表';
    toolbar.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'mermaid-btn-group';

    // 源码切换按钮
    const codeBtn = document.createElement('button');
    codeBtn.className = 'mermaid-btn';
    codeBtn.type = 'button';
    codeBtn.title = '查看/隐藏源码';
    codeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
    btnGroup.appendChild(codeBtn);

    // 复位按钮（仅渲染成功时显示）
    const resetBtn = document.createElement('button');
    resetBtn.className = 'mermaid-btn';
    resetBtn.type = 'button';
    resetBtn.title = '复位缩放';
    if (!svg) resetBtn.style.display = 'none';
    resetBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
    btnGroup.appendChild(resetBtn);

    // 全屏按钮（仅渲染成功时显示）
    const fullBtn = document.createElement('button');
    fullBtn.className = 'mermaid-btn';
    fullBtn.type = 'button';
    fullBtn.title = '全屏查看';
    if (!svg) fullBtn.style.display = 'none';
    fullBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>';
    btnGroup.appendChild(fullBtn);

    toolbar.appendChild(btnGroup);
    card.appendChild(toolbar);

    // 图表显示区（可拖拽缩放）
    const stage = document.createElement('div');
    stage.className = 'mermaid-stage';
    if (errMsg) stage.classList.add('mermaid-stage-error');

    if (svg) {
        const viewport = document.createElement('div');
        viewport.className = 'mermaid-viewport';
        viewport.innerHTML = svg;
        stage.appendChild(viewport);
        bindPanZoom(stage, viewport, resetBtn);
        bindFullscreen(card, stage, fullBtn);
    } else {
        const errTip = document.createElement('div');
        errTip.className = 'mermaid-err-tip';
        errTip.textContent = errMsg;
        stage.appendChild(errTip);
    }
    card.appendChild(stage);

    // 源码区（默认隐藏）
    const sourceBox = document.createElement('pre');
    sourceBox.className = 'mermaid-source';
    sourceBox.textContent = source;
    sourceBox.style.display = 'none';
    card.appendChild(sourceBox);

    // 工具栏按钮事件
    codeBtn.addEventListener('click', function () {
        const showing = sourceBox.style.display !== 'none';
        sourceBox.style.display = showing ? 'none' : 'block';
        stage.style.display = showing ? '' : 'none';
        codeBtn.classList.toggle('active', !showing);
    });

    return card;
}

/**
 * 为图表容器绑定平移（拖拽）与缩放（滚轮）交互
 */
function bindPanZoom(stage, viewport, resetBtn) {
    let scale = 1;
    let x = 0;
    let y = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startTx = 0;
    let startTy = 0;

    function apply() {
        viewport.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }

    stage.addEventListener('mousedown', function (e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startTx = x;
        startTy = y;
        stage.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        x = startTx + (e.clientX - startX);
        y = startTy + (e.clientY - startY);
        apply();
    });

    document.addEventListener('mouseup', function () {
        if (!isDragging) return;
        isDragging = false;
        stage.style.cursor = 'grab';
    });

    // 滚轮缩放（以鼠标位置为中心）
    stage.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.2, Math.min(5, scale * delta));
        if (newScale === scale) return;

        // 计算鼠标在 stage 中的位置作为缩放锚点
        const rect = stage.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;

        // 调整平移量，使缩放围绕鼠标点
        const k = newScale / scale;
        x = mx - (mx - x) * k;
        y = my - (my - y) * k;
        scale = newScale;
        apply();
    });

    // 双击复位
    stage.addEventListener('dblclick', function () {
        scale = 1; x = 0; y = 0;
        apply();
    });

    // 复位按钮（全屏克隆时 resetBtn 为 null）
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            scale = 1; x = 0; y = 0;
            apply();
        });
    }

    stage.style.cursor = 'grab';
    apply();
}

/**
 * 全屏查看图表（ESC 退出）
 * 通过 CSS class 切换全屏状态，不移动 DOM，保留当前的缩放和平移状态
 */
function bindFullscreen(card, stage, fullBtn) {
    fullBtn.addEventListener('click', function () {
        // 添加全屏 class，CSS 控制 position:fixed 占满视口
        card.classList.add('mermaid-card-fullscreen');

        // 在工具栏添加一个全屏专用的关闭按钮（如果还没有）
        const btnGroup = card.querySelector('.mermaid-btn-group');
        let closeBtn = btnGroup.querySelector('.mermaid-fullscreen-close');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.className = 'mermaid-btn mermaid-fullscreen-close';
            closeBtn.type = 'button';
            closeBtn.title = '退出全屏';
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            btnGroup.appendChild(closeBtn);
        }
        closeBtn.style.display = 'inline-flex';
        fullBtn.style.display = 'none';

        function close() {
            card.classList.remove('mermaid-card-fullscreen');
            closeBtn.style.display = 'none';
            fullBtn.style.display = 'inline-flex';
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        closeBtn.addEventListener('click', close, { once: true });
        document.addEventListener('keydown', onKey);
    });
}

/**
 * 清理 mermaid 渲染过程中产生的临时 DOM 残留
 * 包括：错误提示 SVG（带 id="dmermaid-..." 或 class="mermaid-error-svg"）
 *      以及隐藏的临时渲染容器（style 含 position: absolute/fixed 且高度为 0）
 */
function cleanupMermaidTmpDom() {
    // 1. 清理 id 以 "dmermaid" 开头的元素（mermaid 内部错误时生成的错误 SVG 容器）
    document.querySelectorAll('[id^="dmermaid"]').forEach(function (el) {
        el.remove();
    });
    // 2. 清理带 overflow:hidden 且不可见的临时容器（mermaid 渲染时插入的临时 div）
    document.querySelectorAll('body > div').forEach(function (el) {
        const st = getComputedStyle(el);
        // 临时容器通常 position:absolute 且无内容尺寸
        if ((st.position === 'absolute' || st.position === 'fixed') &&
            el.offsetWidth === 0 && el.offsetHeight === 0 &&
            st.overflow === 'hidden') {
            el.remove();
        }
    });
}

function render404(path, msg) {
    DOM.content.innerHTML = `<h1>404 Not Found</h1><p>未找到文档路径：${path}</p><p style="color:red;font-size:12px;">内部排错提示: ${msg}</p>`;
    DOM.toc.innerHTML = '';
}

// ================= 3. UI 交互功能 (高亮、动态标题、移动端抽屉) =================
function highlightActiveMenu(activeRoute) {
    const links = DOM.menu.querySelectorAll('a');
    links.forEach(a => {
        if (a.getAttribute('data-route') === activeRoute) {
            a.classList.add('active');
            let parent = a.parentElement;
            while (parent && parent.id !== 'sidebar-menu') {
                if (parent.tagName === 'DETAILS') parent.open = true;
                parent = parent.parentElement;
            }
            a.scrollIntoView({ block: 'nearest' });
        } else {
            a.classList.remove('active');
        }
    });
}

// 动态修改网站标题
function updateDocumentTitle(activeRoute) {
    const activeLink = DOM.menu.querySelector(`a[data-route="${activeRoute}"]`);
    if (activeLink) {
        document.title = `${activeLink.innerText} - 项目文档`;
    }
}

// 移动端菜单控制逻辑
function toggleMobileSidebar(show) {
    if (!DOM.sidebar || !DOM.mobileBackdrop) return;
    if (show) {
        DOM.sidebar.classList.add('open');
        DOM.mobileBackdrop.classList.add('show');
        document.body.style.overflow = 'hidden'; // 防底层滚动
    } else {
        DOM.sidebar.classList.remove('open');
        DOM.mobileBackdrop.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function initMobileMenu() {
    if (DOM.mobileBtn) {
        DOM.mobileBtn.addEventListener('click', () => toggleMobileSidebar(true));
    }
    if (DOM.mobileBackdrop) {
        DOM.mobileBackdrop.addEventListener('click', () => toggleMobileSidebar(false));
    }
}

// ================= 3.1 布局控制：侧边栏与目录的收起/展开 =================
// 设计要点：
// - 侧边栏的「自动收起/展开」与「手动收起/展开」共用同一个状态 body.sidebar-collapsed，
//   跨越阈值时自动切换状态，同区间内的手动操作不会被 resize 重置。
// - <=768px 走移动端抽屉模式（保持原交互）；>768px 走 PC 端占位收起模式。
// - 右侧目录仅手动控制，通过 body.toc-collapsed 切换。
// 注意：init() 需在 DOM 对象定义后调用（由 index.html 内联脚本触发）。
const LayoutCtrl = {
    sidebarCollapseBtn: document.getElementById('sidebar-collapse-btn'),
    sidebarFloatBtn: document.getElementById('sidebar-float-btn'),
    tocToggleBtn: document.getElementById('toc-toggle-btn'),
    tocFloatBtn: document.getElementById('toc-float-btn'),

    AUTO_COLLAPSE_WIDTH: 1024, // <=此宽度自动收起左侧菜单
    MOBILE_WIDTH: 768,         // <=此宽度进入移动端抽屉模式
    lastMode: null,

    init() {
        // 手动收起左侧菜单（footer 内的折叠按钮）
        if (this.sidebarCollapseBtn) {
            this.sidebarCollapseBtn.addEventListener('click', () => {
                document.body.classList.add('sidebar-collapsed');
            });
        }
        // 浮动按钮展开左侧菜单
        if (this.sidebarFloatBtn) {
            this.sidebarFloatBtn.addEventListener('click', () => {
                document.body.classList.remove('sidebar-collapsed');
            });
        }
        // 手动收起/展开右侧目录（点击标题栏的箭头按钮切换）
        if (this.tocToggleBtn) {
            this.tocToggleBtn.addEventListener('click', () => {
                document.body.classList.toggle('toc-collapsed');
            });
        }
        // 浮动按钮展开右侧目录
        if (this.tocFloatBtn) {
            this.tocFloatBtn.addEventListener('click', () => {
                document.body.classList.remove('toc-collapsed');
            });
        }

        // 响应式：监听窗口尺寸变化，跨越阈值时自动切换侧边栏状态
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize(); // 初始化执行一次
    },

    handleResize() {
        const w = window.innerWidth;
        let mode;
        if (w <= this.MOBILE_WIDTH) mode = 'mobile';
        else if (w <= this.AUTO_COLLAPSE_WIDTH) mode = 'narrow';
        else mode = 'wide';

        // 同区间内不重复处理，避免覆盖用户的手动操作
        if (mode === this.lastMode) return;
        this.lastMode = mode;

        if (mode === 'mobile') {
            // 进入移动端：清理 PC 端收起状态，关闭抽屉
            document.body.classList.remove('sidebar-collapsed');
            toggleMobileSidebar(false);
        } else {
            // 进入 PC 端：清理移动端抽屉残留状态
            if (DOM.sidebar) DOM.sidebar.classList.remove('open');
            if (DOM.mobileBackdrop) DOM.mobileBackdrop.classList.remove('show');
            document.body.style.overflow = '';
            // 窄屏自动收起，宽屏自动展开（与手动控制共用同一状态）
            if (mode === 'narrow') {
                document.body.classList.add('sidebar-collapsed');
            } else {
                document.body.classList.remove('sidebar-collapsed');
            }
        }
    }
};

// ================= 4. 生成右侧 TOC 大纲 =================
function generateTOC() {
    DOM.toc.innerHTML = '';
    const headers = DOM.content.querySelectorAll('h2, h3');
    if (headers.length === 0) return;

    headers.forEach(h => {
        if (!h.id) h.id = h.innerText.trim().replace(/\s+/g, '-').toLowerCase();
        const li = document.createElement('li');
        if (h.tagName === 'H3') li.className = 'h3';
        const a = document.createElement('a');
        a.innerText = h.innerText;
        a.href = "javascript:void(0)";
        a.onclick = () => h.scrollIntoView({ behavior: 'smooth' });
        li.appendChild(a);
        DOM.toc.appendChild(li);
    });
}

// ================= 5. 左边栏动态拖拉宽度功能 =================
function initSidebarResizer() {
    const sidebar = document.querySelector('.vp-sidebar');
    if (!sidebar || sidebar.querySelector('.sidebar-resizer')) return;

    const resizer = document.createElement('div');
    resizer.className = 'sidebar-resizer';
    sidebar.appendChild(resizer);

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; 
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newWidth = startWidth + (e.clientX - startX);
        if (newWidth < 200) newWidth = 200;
        if (newWidth > window.innerWidth / 2) newWidth = window.innerWidth / 2;
        document.documentElement.style.setProperty('--vp-sidebar-width', `${newWidth}px`);
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// ================= 6. 全文搜索系统 (Fuse.js 驱动) =================
const SearchSys = {
    modal: document.getElementById('search-modal'),
    backdrop: document.getElementById('search-backdrop'),
    input: document.getElementById('search-input'),
    resultsArea: document.getElementById('search-results'),
    triggerBtn: document.querySelector('.search-placeholder'),
    
    fuse: null,
    isDataLoaded: false,

    init() {
        if (!this.triggerBtn) return;
        this.triggerBtn.addEventListener('click', () => this.open());
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.open();
            }
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.close();
            }
        });

        this.backdrop.addEventListener('click', () => this.close());
        this.input.addEventListener('input', (e) => this.performSearch(e.target.value));
    },

    async open() {
        this.modal.style.display = 'flex';
        this.input.focus();
        document.body.style.overflow = 'hidden';

        if (!this.isDataLoaded) {
            this.resultsArea.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--vp-c-text-3);">正在建立本地索引...</li>';
            try {
                const res = await fetch('api/search.php');
                const rawData = await res.json();
                
                this.fuse = new Fuse(rawData, {
                    keys: ['title', 'content'],
                    includeMatches: true,
                    threshold: 0.3,
                    ignoreLocation: true
                });
                this.isDataLoaded = true;
                this.performSearch(this.input.value); 
            } catch (err) {
                this.resultsArea.innerHTML = '<li style="padding: 16px; color: red;">索引加载失败，请检查 api/search.php。</li>';
            }
        }
    },

    close() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
    },

    performSearch(query) {
        if (!this.isDataLoaded || !this.fuse) return;
        
        if (!query.trim()) {
            this.resultsArea.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--vp-c-text-3);">键入关键词开始检索</li>';
            return;
        }

        const results = this.fuse.search(query);
        
        if (results.length === 0) {
            this.resultsArea.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--vp-c-text-3);">没有找到相关内容</li>';
            return;
        }

        let html = '';
        results.slice(0, 15).forEach(({ item, matches }) => {
            let excerpt = item.content.substring(0, 80) + '...';
            const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${safeQuery})`, 'gi');
            
            const contentMatch = matches.find(m => m.key === 'content');
            if (contentMatch && contentMatch.indices.length > 0) {
                const matchStart = contentMatch.indices[0][0];
                const start = Math.max(0, matchStart - 20);
                const end = Math.min(item.content.length, matchStart + 60);
                excerpt = (start > 0 ? '...' : '') + item.content.substring(start, end) + '...';
            }

            const highlightedTitle = item.title.replace(regex, '<span class="highlight">$1</span>');
            const highlightedExcerpt = excerpt.replace(regex, '<span class="highlight">$1</span>');

            html += `
                <li>
                    <a href="#/${item.route}" onclick="SearchSys.close()">
                        <span class="res-title">${highlightedTitle}</span>
                        <span class="res-excerpt">${highlightedExcerpt}</span>
                    </a>
                </li>
            `;
        });
        
        this.resultsArea.innerHTML = html;
    }
};

SearchSys.init();


console.log(`                                                                                                                                
                                                                                                                                
KKKKKKKKK    KKKKKKK                                                                                              iiii  lllllll 
K:::::::K    K:::::K                                                                                             i::::i l:::::l 
K:::::::K    K:::::K                                                                                              iiii  l:::::l 
K:::::::K   K::::::K                                                                                                    l:::::l 
KK::::::K  K:::::KKKnnnn  nnnnnnnn       ooooooooooo wwwwwww           wwwww           wwwwwwwnnnn  nnnnnnnn    iiiiiii  l::::l 
  K:::::K K:::::K   n:::nn::::::::nn   oo:::::::::::oow:::::w         w:::::w         w:::::w n:::nn::::::::nn  i:::::i  l::::l 
  K::::::K:::::K    n::::::::::::::nn o:::::::::::::::ow:::::w       w:::::::w       w:::::w  n::::::::::::::nn  i::::i  l::::l 
  K:::::::::::K     nn:::::::::::::::no:::::ooooo:::::o w:::::w     w:::::::::w     w:::::w   nn:::::::::::::::n i::::i  l::::l 
  K:::::::::::K       n:::::nnnn:::::no::::o     o::::o  w:::::w   w:::::w:::::w   w:::::w      n:::::nnnn:::::n i::::i  l::::l 
  K::::::K:::::K      n::::n    n::::no::::o     o::::o   w:::::w w:::::w w:::::w w:::::w       n::::n    n::::n i::::i  l::::l 
  K:::::K K:::::K     n::::n    n::::no::::o     o::::o    w:::::w:::::w   w:::::w:::::w        n::::n    n::::n i::::i  l::::l 
KK::::::K  K:::::KKK  n::::n    n::::no::::o     o::::o     w:::::::::w     w:::::::::w         n::::n    n::::n i::::i  l::::l 
K:::::::K   K::::::K  n::::n    n::::no:::::ooooo:::::o      w:::::::w       w:::::::w          n::::n    n::::ni::::::il::::::l
K:::::::K    K:::::K  n::::n    n::::no:::::::::::::::o       w:::::w         w:::::w           n::::n    n::::ni::::::il::::::l
K:::::::K    K:::::K  n::::n    n::::n oo:::::::::::oo         w:::w           w:::w            n::::n    n::::ni::::::il::::::l
KKKKKKKKK    KKKKKKK  nnnnnn    nnnnnn   ooooooooooo            www             www             nnnnnn    nnnnnniiiiiiiillllllll
                                                                                                                                
                                                                                                                                
                                                                                                                                
                                                                                                                                
                                                                                                                                
 重庆知无科技有限公司 版权所有
 FastMD v1.4.8                                                                                                                               
                                                                                                                                `);