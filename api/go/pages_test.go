package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPagesExport(t *testing.T) {
	root := fixture(t)
	put(t, root, "assets/app.js", "window.ready = true;")
	put(t, root, "assets/_private/token.json", "private")
	put(t, root, "docs/private.php", "private")
	put(t, root, "fastmd.json", "private")
	put(t, root, "api/file/search", "stale index")
	put(t, root, "api/php/index.php", "private")
	put(t, root, "docs/无排序/文档.md", "document with time-based sorting")
	modified := time.Unix(1700000000, 0)
	for _, name := range []string{"docs/无排序", "docs/无排序/文档.md"} {
		if err := os.Chtimes(filepath.Join(root, name), modified, modified); err != nil {
			t.Fatal(err)
		}
	}
	if err := exportPages(root, "_site"); err != nil {
		t.Fatal(err)
	}
	site := filepath.Join(root, "_site")
	for _, name := range []string{"index.html", "config.js", "assets/app.js", "api/file/sidebar", "api/file/search", ".nojekyll"} {
		if _, err := os.Stat(filepath.Join(site, name)); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"docs/_draft.md", "docs/.hidden.md", "docs/private.php", "assets/_private", "api/php", "fastmd.json"} {
		if _, err := os.Lstat(filepath.Join(site, name)); !os.IsNotExist(err) {
			t.Fatalf("private path exported: %s (%v)", name, err)
		}
	}
	sourceConfig, err := os.ReadFile(filepath.Join(root, "config.js"))
	if err != nil {
		t.Fatal(err)
	}
	if string(sourceConfig) != "window.FASTMD_CONFIG={};" {
		t.Fatal("source configuration changed")
	}
	config, err := os.ReadFile(filepath.Join(site, "config.js"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(config), "window.FASTMD_CONFIG.apiEndpoint = \"api/file\";") {
		t.Fatal("static API not configured")
	}
	wantTree, wantSearch, err := scanDocuments(root)
	if err != nil {
		t.Fatal(err)
	}
	wantSidebar, err := json.Marshal(struct {
		Data []Node `json:"data"`
	}{wantTree})
	if err != nil {
		t.Fatal(err)
	}
	wantIndex, err := json.Marshal(wantSearch)
	if err != nil {
		t.Fatal(err)
	}
	// Exercise an ordinary static host under the same project prefix as Pages.
	handler := http.StripPrefix("/FastMD/", http.FileServer(http.Dir(site)))
	for path, want := range map[string]string{
		"":                    "<h1>FastMD</h1>",
		"api/file/sidebar":    string(wantSidebar) + "\n",
		"api/file/search":     string(wantIndex) + "\n",
		"docs/首页[home][0].md": "# 中文\n<?php echo 'searchable'; ?>\nA --> B\n😀",
		"assets/app.js":       "window.ready = true;",
	} {
		requestURL := (&url.URL{Path: "/FastMD/" + path}).String()
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, requestURL, nil))
		if recorder.Code != http.StatusOK || recorder.Body.String() != want {
			t.Fatalf("exported %s: HTTP %d, body %q", path, recorder.Code, recorder.Body.String())
		}
	}
	if err := exportPages(root, "_site"); err == nil {
		t.Fatal("existing export must not be overwritten")
	}
}

func TestPagesRejectsInvalidBuild(t *testing.T) {
	root := fixture(t)
	put(t, root, "assets/app.js", "")
	put(t, root, "docs/conflict[home][1].md", "duplicate route")
	if err := exportPages(root, "_site"); err == nil {
		t.Fatal("duplicate route must fail export")
	}
	if _, err := os.Lstat(filepath.Join(root, "_site")); !os.IsNotExist(err) {
		t.Fatal("failed build left a publishable output")
	}
	matches, err := filepath.Glob(filepath.Join(root, ".fastmd-pages-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("staging directory leaked: %v, %v", matches, err)
	}
	for _, output := range []string{"", ".", "..", "../outside", "docs/export"} {
		if err := exportPages(root, output); err == nil {
			t.Fatalf("invalid output accepted: %q", output)
		}
	}
}

func TestPagesSkipsSymlinks(t *testing.T) {
	root := fixture(t)
	put(t, root, "assets/app.js", "")
	put(t, root, "private.txt", "must not be exported")
	link := filepath.Join(root, "docs", "linked.md")
	if err := os.Symlink(filepath.Join(root, "private.txt"), link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := exportPages(root, "_site"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(root, "_site", "docs", "linked.md")); !os.IsNotExist(err) {
		t.Fatal("symlink exported")
	}
}
