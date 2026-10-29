package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

type Node struct {
	Type       string `json:"type"`
	Title      string `json:"title"`
	Route      string `json:"route"`
	FullRoute  string `json:"fullRoute"`
	ActualPath string `json:"actualPath,omitempty"`
	SortWeight int64  `json:"sortWeight"`
	Children   []Node `json:"children,omitempty"`
}

type SearchEntry struct {
	Title   string `json:"title"`
	Route   string `json:"route"`
	Content string `json:"content"`
}

var namePattern = regexp.MustCompile(`^([^\[\]]+)(?:\[([^\[\]]*)\])?(?:\[(\d+)\])?$`)
var whitespace = regexp.MustCompile(`[ \t\r\n\f\v]+`)

func parseName(name string, file bool, modified int64) (string, string, int64) {
	if file {
		name = strings.TrimSuffix(name, filepath.Ext(name))
	}
	title, route, weight := name, name, modified
	if m := namePattern.FindStringSubmatch(name); m != nil {
		title = strings.TrimSpace(m[1])
		route = strings.TrimSpace(m[2])
		if route == "" {
			route = title
		}
		if m[3] != "" {
			if n, err := strconv.ParseInt(m[3], 10, 64); err == nil {
				weight = n
			}
		}
	}
	return title, route, weight
}

func validRoute(route string) bool {
	return route != "" && route != "." && route != ".." &&
		!strings.ContainsAny(route, "/\\#?\x00\r\n\t")
}

// One walk builds both existing API formats; raw Markdown stays searchable,
// including PHP examples and Mermaid arrows.
func scanDocuments(root string) ([]Node, []SearchEntry, error) {
	index := []SearchEntry{}
	seen := map[string]string{}
	var walk func(string, string) ([]Node, error)
	walk = func(relative, parentRoute string) ([]Node, error) {
		nodes := []Node{}
		entries, err := os.ReadDir(filepath.Join(root, "docs", relative))
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			name := entry.Name()
			if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") || entry.Type()&os.ModeSymlink != 0 {
				continue
			}
			info, err := entry.Info()
			if err != nil {
				return nil, err
			}
			if !info.IsDir() && (!info.Mode().IsRegular() || filepath.Ext(name) != ".md") {
				continue
			}
			actual := filepath.Join(relative, name)
			title, route, weight := parseName(name, !info.IsDir(), info.ModTime().Unix())
			if !validRoute(route) {
				return nil, fmt.Errorf("invalid route in %s", actual)
			}
			fullRoute := route
			if parentRoute != "" {
				fullRoute = parentRoute + "/" + route
			}
			if previous, exists := seen[fullRoute]; exists {
				return nil, fmt.Errorf("duplicate route %q: %s and %s", fullRoute, previous, actual)
			}
			seen[fullRoute] = actual
			node := Node{Title: title, Route: route, FullRoute: fullRoute, SortWeight: weight}
			if info.IsDir() {
				node.Type = "dir"
				node.Children, err = walk(actual, fullRoute)
				if err != nil {
					return nil, err
				}
				if len(node.Children) == 0 {
					continue
				}
			} else {
				node.Type = "file"
				node.ActualPath = filepath.ToSlash(actual)
				content, err := os.ReadFile(filepath.Join(root, "docs", actual))
				if err != nil {
					return nil, err
				}
				if !utf8.Valid(content) {
					return nil, fmt.Errorf("%s must be UTF-8", actual)
				}
				text := []rune(whitespace.ReplaceAllString(string(content), " "))
				if len(text) > 20000 {
					text = text[:20000]
				}
				index = append(index, SearchEntry{title, fullRoute, string(text)})
			}
			nodes = append(nodes, node)
		}
		sort.Slice(nodes, func(i, j int) bool {
			if nodes[i].SortWeight == nodes[j].SortWeight {
				return nodes[i].FullRoute < nodes[j].FullRoute
			}
			return nodes[i].SortWeight < nodes[j].SortWeight
		})
		return nodes, nil
	}
	tree, err := walk("", "")
	if os.IsNotExist(err) {
		// A missing docs directory is almost always a wrong deployment path.
		return nil, nil, fmt.Errorf("docs directory or document missing: %w", err)
	}
	sort.Slice(index, func(i, j int) bool { return index[i].Route < index[j].Route })
	return tree, index, err
}

func buildIndex(root string) error {
	tree, index, err := scanDocuments(root)
	if err != nil {
		return err // Validate all documents before replacing either index.
	}
	dir := filepath.Join(root, "api", "file")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	for _, output := range []struct {
		name string
		data any
	}{
		{"sidebar", struct {
			Data []Node `json:"data"`
		}{tree}},
		{"search", index},
	} {
		data, err := json.Marshal(output.data)
		if err != nil {
			return err
		}
		if err := writeIndex(filepath.Join(dir, output.name), append(data, '\n')); err != nil {
			return err
		}
	}
	fmt.Printf("Indexed %d documents -> api/file/sidebar, api/file/search\n", len(index))
	return nil
}

// Replace each complete file instead of exposing partially written JSON to readers.
func writeIndex(destination string, data []byte) error {
	file, err := os.CreateTemp(filepath.Dir(destination), ".fastmd-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Chmod(0644); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), destination)
}
