window.routeMap = {};
window.firstRoute = null;

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
            document.title = "欢迎 - 项目文档";
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
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Fetch 状态异常 (${res.status})`);
        text = await res.text();
    } catch (err) {
        render404(hashPath, err.message);
        document.title = "加载失败 - 项目文档";
        return;
    }

    try {
        DOM.content.innerHTML = md.render(text);
        if (window.Prism) Prism.highlightAllUnder(DOM.content);

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
 Fast Wiki v1.0                                                                                                                               
                                                                                                                                `);