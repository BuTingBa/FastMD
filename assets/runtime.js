// Shared configuration and API contract. Loaded before main.js and app.js.
window.SITE_TITLE = (window.FASTMD_CONFIG || {}).siteTitle || 'FastMD';
window.API_ENDPOINT = (window.FASTMD_CONFIG || {}).apiEndpoint || 'api/php';

function escapeHtml(value) {
    return md.utils.escapeHtml(String(value));
}

function routeHref(route) {
    return '#/' + route.split('/').map(encodeURIComponent).join('/');
}

function validTree(items) {
    return Array.isArray(items) && items.every(item =>
        item && typeof item.title === 'string' && typeof item.fullRoute === 'string' &&
        (item.type === 'dir' ? validTree(item.children) :
            item.type === 'file' && typeof item.actualPath === 'string' &&
            item.actualPath.split('/').every(part => part && part !== '.' && part !== '..' &&
                !/[\\:\x00]/.test(part))));
}

// A 200 response can still be an HTML fallback or the wrong JSON endpoint.
// Validate the data before accepting it, then try the legacy query protocol.
async function fetchApi(action) {
    const endpoint = window.API_ENDPOINT;
    const queryUrl = endpoint + (endpoint.includes('?') ? '&' : '?') + 'action=' + action;
    const pathUrl = endpoint.includes('?') ? queryUrl : endpoint.replace(/\/+$/, '') + '/' + action;
    let lastError;
    for (const url of new Set([pathUrl, queryUrl])) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            const valid = action === 'sidebar' ? data && validTree(data.data) :
                Array.isArray(data) && data.every(item => item &&
                    ['title', 'route', 'content'].every(key => typeof item[key] === 'string'));
            if (!valid) throw new Error('接口数据格式不正确');
            return data;
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError;
}

const scriptLoads = new Map();
function loadScript(src) {
    if (!scriptLoads.has(src)) {
        scriptLoads.set(src, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                script.remove();
                scriptLoads.delete(src);
                reject(new Error('无法加载图表组件，请刷新重试'));
            };
            document.head.appendChild(script);
        }));
    }
    return scriptLoads.get(src);
}
