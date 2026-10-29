package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func put(t *testing.T, root, name, content string) {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func fixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	put(t, root, "index.html", "<h1>FastMD</h1>")
	put(t, root, "config.js", "window.FASTMD_CONFIG={};")
	put(t, root, "docs/首页[home][0].md", "# 中文\n<?php echo 'searchable'; ?>\nA --> B\n😀")
	put(t, root, "docs/分组[group][1]/常见问题[][2].md", "FAQ")
	put(t, root, "docs/零[0][3].md", "Zero")
	put(t, root, "docs/_draft.md", "Hidden")
	put(t, root, "docs/.hidden.md", "Hidden")
	return root
}

func TestBuildAndReplace(t *testing.T) {
	root := fixture(t)
	if err := buildIndex(root); err != nil {
		t.Fatal(err)
	}
	readIndex := func() []SearchEntry {
		data, err := os.ReadFile(filepath.Join(root, "api/file/search"))
		if err != nil {
			t.Fatal(err)
		}
		var entries []SearchEntry
		if err := json.Unmarshal(data, &entries); err != nil {
			t.Fatal(err)
		}
		return entries
	}
	entries := readIndex()
	if len(entries) != 3 || entries[0].Route != "0" || entries[1].Route != "group/常见问题" ||
		!strings.Contains(entries[2].Content, "<?php") || !strings.Contains(entries[2].Content, "A --> B") {
		t.Fatalf("unexpected index: %+v", entries)
	}
	put(t, root, "docs/新增[new][4].md", strings.Repeat("😀", 20001))
	if err := buildIndex(root); err != nil {
		t.Fatal(err)
	}
	entries = readIndex()
	if len(entries) != 4 || len([]rune(entries[3].Content)) != 20000 {
		t.Fatal("rebuild or Unicode truncation failed")
	}
	before, _ := os.ReadFile(filepath.Join(root, "api/file/sidebar"))
	put(t, root, "docs/冲突[home][9].md", "duplicate")
	if err := buildIndex(root); err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatal("duplicate route should fail")
	}
	after, _ := os.ReadFile(filepath.Join(root, "api/file/sidebar"))
	if string(before) != string(after) {
		t.Fatal("failed scan replaced a valid index")
	}
}

func TestPublicServer(t *testing.T) {
	root := fixture(t)
	put(t, root, ".git/HEAD", "private")
	put(t, root, "api/php/index.php", "private")
	put(t, root, "fastmd.json", "{}")
	put(t, root, "assets/app.js", "console.log('ok')")
	put(t, root, "docs/private.php", "private")
	if err := buildIndex(root); err != nil {
		t.Fatal(err)
	}
	handler, err := newHandler(root, Config{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { handler.Close() })
	for _, test := range []struct {
		path string
		code int
	}{
		{"/", 200}, {"/config.js", 200}, {"/assets/app.js", 200},
		{"/api/file/sidebar", 200}, {"/api/php/sidebar", 200},
		{"/api/php?action=search", 200}, {"/?action=unknown", 404},
		{"/.git/HEAD", 404}, {"/fastmd.json", 404}, {"/api/php/index.php", 404},
		{"/docs/_draft.md", 404}, {"/docs/.hidden.md", 404}, {"/docs/private.php", 404},
		{"/api/", 404}, {"/docs/", 404}, {"/docs/../fastmd.json", 404},
		{"/docs/%2e%2e/fastmd.json", 404}, {"/docs/x%5c..%5cfastmd.json", 404},
		{"/config.js::$DATA", 404},
	} {
		t.Run(test.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest("GET", test.path, nil))
			if recorder.Code != test.code {
				t.Fatalf("got %d, want %d: %s", recorder.Code, test.code, recorder.Body.String())
			}
		})
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("HEAD", "/api/file/search", nil))
	if recorder.Code != 200 || recorder.Body.Len() != 0 {
		t.Fatal("HEAD should return headers only")
	}
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("POST", "/", nil))
	if recorder.Code != 405 {
		t.Fatal("server must be read-only")
	}
}

func TestDomainAndConfig(t *testing.T) {
	root := fixture(t)
	cfg, err := readConfig(root)
	if err != nil || cfg.Host != "0.0.0.0" || cfg.Port != 1120 {
		t.Fatal("incorrect defaults", cfg, err)
	}
	for _, text := range []string{`{"port":0}`, `{"host":"not-an-ip"}`,
		`{"domain":"https://docs.example.com"}`, `{"ports":1120}`, "{} {}"} {
		put(t, root, "fastmd.json", text)
		if _, err := readConfig(root); err == nil {
			t.Fatalf("accepted invalid config: %s", text)
		}
	}
	handler, err := newHandler(root, Config{Domain: "docs.example.com"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { handler.Close() })
	for _, host := range []string{"docs.example.com", "DOCS.EXAMPLE.COM:1120", "other.example.com"} {
		request := httptest.NewRequest("GET", "/", nil)
		request.Host = host
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if (recorder.Code == http.StatusOK) != strings.HasPrefix(strings.ToLower(host), "docs.example.com") {
			t.Fatal("host filter failed", host, recorder.Code)
		}
	}
}

func TestSymlinks(t *testing.T) {
	root := fixture(t)
	link := filepath.Join(root, "docs/link.md")
	if err := os.Symlink(filepath.Join(root, "config.js"), link); err != nil {
		t.Skip("symlink creation unavailable:", err)
	}
	_, index, err := scanDocuments(root)
	if err != nil || len(index) != 3 {
		t.Fatal("scanner followed a symlink", err)
	}
	handler, err := newHandler(root, Config{})
	if err != nil {
		t.Fatal(err)
	}
	defer handler.Close()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("GET", "/docs/link.md", nil))
	if recorder.Code != 404 {
		t.Fatal("server followed a symlink")
	}
}
