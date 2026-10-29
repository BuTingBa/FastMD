const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const markdown = require('../assets/vendor/markdown-it@13.0.2/dist/markdown-it.min.js');

function context(fetch) {
    const ctx = vm.createContext({
        AbortController, setTimeout, clearTimeout, URL, console: { log() {}, error() {} },
        window: { FASTMD_CONFIG: {}, location: { hash: '' }, innerWidth: 1200, scrollTo() {} },
        document: { getElementById() { return null; }, querySelector() { return null; }, title: '' },
        md: markdown(), fetch,
        DOM: { content: { innerHTML: '' }, toc: { innerHTML: '' } }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/runtime.js'), 'utf8'), ctx);
    // Browser window properties are globals; model that explicitly in the VM.
    ctx.SITE_TITLE = ctx.window.SITE_TITLE;
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/main.js'), 'utf8'), ctx);
    vm.runInContext('generateTOC=()=>{}; highlightActiveMenu=()=>{}; renderMermaid=async()=>{};', ctx);
    return ctx;
}

test('late document responses cannot replace the active route', async () => {
    const pending = [];
    const ctx = context((url, options) => new Promise(resolve => pending.push({ resolve, options })));
    ctx.window.routeMap = { a: 'a.md', b: 'b.md' };
    ctx.window.location.hash = '#/a';
    const a = vm.runInContext('loadContent()', ctx);
    ctx.window.location.hash = '#/b';
    const b = vm.runInContext('loadContent()', ctx);
    assert.equal(pending[0].options.signal.aborted, true);
    pending[1].resolve({ ok: true, text: async () => '# B' });
    await b;
    pending[0].resolve({ ok: true, text: async () => '# A' });
    await a;
    assert.match(ctx.DOM.content.innerHTML, /<h1>B<\/h1>/);
});

test('404 and menu output escape route/title HTML and support special route names', async () => {
    const ctx = context();
    ctx.window.location.hash = '#/' + encodeURIComponent('<img src=x onerror=alert(1)>');
    await vm.runInContext('loadContent()', ctx);
    assert.ok(!ctx.DOM.content.innerHTML.includes('<img'));
    assert.match(ctx.DOM.content.innerHTML, /&lt;img/);
    ctx.items = [{ type: 'file', title: '<b>Title</b>', fullRoute: '__proto__', actualPath: 'a.md' }];
    const html = vm.runInContext('renderSidebar(items)', ctx);
    assert.match(html, /&lt;b&gt;Title/);
    assert.equal(ctx.window.routeMap.__proto__, 'a.md');
    assert.throws(() => vm.runInContext('renderSidebar(items)', ctx), /重复路由/);
});

test('invalid hash encoding renders an error without rejecting', async () => {
    const ctx = context();
    ctx.window.location.hash = '#/%ZZ';
    await vm.runInContext('loadContent()', ctx);
    assert.match(ctx.DOM.content.innerHTML, /链接编码不正确/);
});

test('API retries when HTTP 200 contains the wrong JSON contract', async () => {
    const urls = [];
    const ctx = context(async url => {
        urls.push(url);
        return { ok: true, json: async () => urls.length === 1 ? { data: [] } : [] };
    });
    await vm.runInContext("fetchApi('search')", ctx);
    assert.deepEqual(urls, ['api/php/search', 'api/php?action=search']);
});

test('API rejects unsafe document paths', async () => {
    const ctx = context(async () => ({ ok: true, json: async () => ({
        data: [{ type: 'file', title: 'Bad', fullRoute: 'bad', actualPath: '../secret.md' }]
    }) }));
    await assert.rejects(vm.runInContext("fetchApi('sidebar')", ctx), /接口数据格式/);
});

test('search escapes raw source before adding its own highlight markup', () => {
    const ctx = context();
    const html = vm.runInContext(`
        SearchSys.resultsArea = {innerHTML:''};
        SearchSys.isDataLoaded = true;
        SearchSys.fuse = {search:()=>[{item:{
            title:'<img src=x onerror=alert(1)>', route:'a"b',
            content:'<?php echo "needle"; ?> <script>needle</script>'
        },matches:[]}]};
        SearchSys.performSearch('needle');
        SearchSys.resultsArea.innerHTML;
    `, ctx);
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script>'));
    assert.match(html, /<span class="highlight">needle<\/span>/);
    assert.match(html, /#\/a%22b/);
});
