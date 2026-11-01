package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var version = "dev"

type Config struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Domain string `json:"domain"`
}

func readConfig(root string) (Config, error) {
	cfg := Config{Host: "0.0.0.0", Port: 1120}
	file, err := os.Open(filepath.Join(root, "fastmd.json"))
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cfg); err != nil {
		return cfg, fmt.Errorf("fastmd.json: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return cfg, errors.New("fastmd.json must contain one JSON object")
	}
	cfg.Domain = strings.ToLower(strings.TrimSpace(cfg.Domain))
	if cfg.Port < 1 || cfg.Port > 65535 || net.ParseIP(cfg.Host) == nil {
		return cfg, errors.New("host must be an IP address; port must be 1..65535")
	}
	if cfg.Domain != "" && (strings.ContainsAny(cfg.Domain, "/\\: \t\r\n") || strings.Contains(cfg.Domain, "..")) {
		return cfg, errors.New("domain must be a hostname without protocol, port or path")
	}
	return cfg, nil
}

func publicPath(name string) bool {
	parts := strings.Split(name, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.HasPrefix(part, ".") ||
			strings.HasPrefix(part, "_") || strings.ContainsAny(part, "\\:\x00") {
			return false
		}
	}
	if name == "index.html" || name == "config.js" || name == "api/file/sidebar" || name == "api/file/search" {
		return true
	}
	if len(parts) < 2 || (parts[0] != "docs" && parts[0] != "assets") {
		return false
	}
	// Source files, binaries and instance configuration never belong to the public tree.
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md", ".html", ".css", ".js", ".json", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
		".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".txt", ".mp3", ".mp4", ".webm", ".ogg", ".wav":
		return true
	}
	return false
}

type siteHandler struct {
	http.Handler
	files *os.Root
}

func (h *siteHandler) Close() error { return h.files.Close() }

func newHandler(root string, cfg Config) (*siteHandler, error) {
	// os.Root confines symlink resolution as well as lexical paths to the site.
	files, err := os.OpenRoot(root)
	if err != nil {
		return nil, err
	}
	return &siteHandler{http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if cfg.Domain != "" && !strings.EqualFold(strings.TrimSuffix(host, "."), cfg.Domain) {
			http.Error(w, "Unknown host", http.StatusMisdirectedRequest)
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		// Preserve the existing frontend configuration when switching to the binary.
		action := ""
		switch name {
		case "sidebar", "search":
			action = name
		case "api/php/sidebar", "api/php/search":
			action = strings.TrimPrefix(name, "api/php/")
		case "index.html", "api/php", "api/php/", "api/php/index.php":
			action = r.URL.Query().Get("action")
		}
		if action != "" {
			if action != "sidebar" && action != "search" {
				http.NotFound(w, r)
				return
			}
			name = "api/file/" + action
		}
		if !publicPath(name) {
			http.NotFound(w, r)
			return
		}
		// Disallow symlinks even inside root (e.g. docs/link.md -> private config).
		parts := strings.Split(name, "/")
		for i := range parts {
			info, err := files.Lstat(strings.Join(parts[:i+1], "/"))
			if err != nil || info.Mode()&os.ModeSymlink != 0 {
				http.NotFound(w, r)
				return
			}
		}
		file, err := files.Open(name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(name, "api/file/") {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
		} else if strings.HasSuffix(name, ".md") {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		}
		modified := info.ModTime()
		if strings.HasPrefix(name, "api/file/") || strings.HasPrefix(name, "docs/") {
			// HTTP dates have one-second precision; same-second rebuilds must not
			// validate an older index or document as unchanged.
			modified = time.Time{}
			w.Header().Set("Cache-Control", "no-store")
		}
		http.ServeContent(w, r, name, modified, file)
	}), files}, nil
}

func run() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	command := "serve"
	args := os.Args[1:]
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command, args = args[0], args[1:]
	}
	if command == "version" {
		fmt.Println("FastMD " + version)
		return nil
	}
	flags := flag.NewFlagSet("fastmd [serve|build|pages|version]", flag.ContinueOnError)
	rootFlag := flags.String("root", filepath.Dir(exe), "site directory (default: beside executable)")
	outputFlag := flags.String("output", "_site", "pages output directory name under the site root (must not exist)")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	isBuildCommand := command == "build" || command == "pages"
	if flags.NArg() != 0 || (!isBuildCommand && command != "serve") {
		return errors.New("usage: fastmd [serve|build|pages|version] [-root site-directory] [-output _site]")
	}
	root, err := filepath.Abs(*rootFlag)
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(root, "index.html")); err != nil {
		return fmt.Errorf("site index.html: %w", err)
	}
	if command == "build" {
		return buildIndex(root)
	}
	if command == "pages" {
		return exportPages(root, *outputFlag)
	}
	cfg, err := readConfig(root)
	if err != nil {
		return err
	}
	if err := buildIndex(root); err != nil {
		return err
	}
	handler, err := newHandler(root, cfg)
	if err != nil {
		return err
	}
	defer handler.Close()
	address := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	server := &http.Server{
		Addr: address, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second,
	}
	fmt.Printf("FastMD %s | %s\nListening on http://%s (Ctrl+C to stop)\n", version, root, address)
	if cfg.Domain != "" {
		fmt.Printf("Allowed domain: %s (configure DNS separately)\n", cfg.Domain)
	}
	return server.ListenAndServe()
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
