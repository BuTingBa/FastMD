window.routeMap = {};
window.firstRoute = null;

// ================= 1. 拉取并渲染菜单结构 =================
async function initTree() {
    try {
        const res = await fetch('api/sidebar.php');
        const { data } = await res.json();
        DOM.menu.innerHTML = renderSidebar(data);
        initSidebarResizer();
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
        }
        return;
    }

    const actualFilePath = window.routeMap[hashPath];
    if (!actualFilePath) {
        render404(hashPath, '左侧菜单未找到匹配路由映射');
        return;
    }

    let text = '';
    const fetchUrl = 'docs/' + actualFilePath.split('/').map(encodeURIComponent).join('/');

    // 【修复点】：第一个独立的 Try-Catch，专门负责处理网络 IO 异常
    try {
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Fetch 状态异常 (${res.status}): ${fetchUrl}`);
        text = await res.text();
    } catch (err) {
        render404(hashPath, err.message);
        console.error("文件加载失败:", err);
        return; // 请求失败，终止后续渲染
    }

    // 【修复点】：第二个独立的 Try-Catch，专门负责处理渲染和高亮异常
    try {
        DOM.content.innerHTML = md.render(text);
        if (window.Prism) Prism.highlightAllUnder(DOM.content);

        generateTOC();
        highlightActiveMenu(hashPath);
        window.scrollTo(0, 0);
    } catch (err) {
        console.error("文档渲染或代码高亮错误:", err);
        // 如果是渲染崩溃，保留已渲染的部分（可能不完整），并在顶部/底部追加明确的错误信息，不再误报为 404。
        DOM.content.innerHTML = `<div class="custom-block warning" style="border-color: red; background-color: #ffe6e6;">
            <p class="custom-block-title" style="color: red;">渲染异常</p>
            <p>在解析文档或渲染代码高亮时发生错误：<br><code>${err.message}</code></p>
        </div>` + DOM.content.innerHTML;
    }
}

// 提取公共 404 渲染函数
function render404(path, msg) {
    DOM.content.innerHTML = `<h1>404 Not Found</h1><p>未找到文档路径：${path}</p><p style="color:red;font-size:12px;">内部排错提示: ${msg}</p>`;
    DOM.toc.innerHTML = '';
}

// ================= 3. 高亮菜单并自动展开父级菜单 =================
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
        // 绑定呼出事件：点击导航栏搜索框，或快捷键 Ctrl+K / Cmd+K
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
        document.body.style.overflow = 'hidden'; // 禁止底层滚动

        // 惰性加载：只有第一次打开弹窗时才去请求聚合的全文数据
        if (!this.isDataLoaded) {
            this.resultsArea.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--vp-c-text-3);">正在建立本地索引...</li>';
            try {
                const res = await fetch('api/search.php');
                const rawData = await res.json();
                
                // 初始化 Fuse.js
                this.fuse = new Fuse(rawData, {
                    keys: ['title', 'content'], // 检索范围：标题和内容
                    includeMatches: true,       // 返回匹配位置，用于高亮
                    threshold: 0.3,             // 匹配容忍度（越小越精确）
                    ignoreLocation: true        // 全文任意位置匹配
                });
                this.isDataLoaded = true;
                this.performSearch(this.input.value); // 如果输入框已有值，直接搜索
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

        // 渲染结果并实现关键词高亮截取
        let html = '';
        // 只取前 15 条结果，防止 DOM 渲染卡顿
        results.slice(0, 15).forEach(({ item, matches }) => {
            let excerpt = item.content.substring(0, 80) + '...';
            
            // 简单的高亮逻辑：在摘要中查找关键词并包裹高亮 span
            // Fuse.js 的 matches 结构比较复杂，这里为了性能使用正则对 query 进行简单着色
            const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${safeQuery})`, 'gi');
            
            // 如果内容中匹配到了，截取匹配点附近的上下文作为摘要
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

// 启动搜索系统
SearchSys.init();
console.log(
    `
                                                                                                                                
                                                                                                                                
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
                                                                                                                                
                                                                                                                                
重庆知无科技有限公司  版权所有
文档渲染系统 v1.0                                
    `
);