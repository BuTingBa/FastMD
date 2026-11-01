package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Export into a new directory so a failed build never replaces a working site.
func exportPages(root, output string) error {
	isDirectoryName := filepath.Base(output) == output
	isDot := output == "." || output == ".."
	if !isDirectoryName || isDot || output == "" {
		return errors.New("output must be a new directory name directly under the site root")
	}
	destination := filepath.Join(root, output)
	if _, err := os.Lstat(destination); err == nil {
		return fmt.Errorf("output already exists: %s; choose a new directory or remove it first", destination)
	} else if !os.IsNotExist(err) {
		return err
	}
	staging, err := os.MkdirTemp(root, ".fastmd-pages-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	for _, name := range []string{"index.html", "config.js", "assets", "docs"} {
		info, err := os.Lstat(filepath.Join(root, name))
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("site entry must not be a symlink: %s", name)
		}
		wantDirectory := name == "assets" || name == "docs"
		if info.IsDir() != wantDirectory {
			return fmt.Errorf("site entry has incorrect file type: %s", name)
		}
		if err := copyPublic(root, staging, name); err != nil {
			return err
		}
	}
	config := filepath.Join(staging, "config.js")
	data, err := os.ReadFile(config)
	if err != nil {
		return err
	}
	data = append(data, []byte("\nwindow.FASTMD_CONFIG.apiEndpoint = \"api/file\";\n")...)
	if err := os.WriteFile(config, data, 0644); err != nil {
		return err
	}
	if err := buildIndex(staging); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(staging, ".nojekyll"), nil, 0644); err != nil {
		return err
	}
	if err := os.Chmod(staging, 0755); err != nil {
		return err
	}
	if err := os.Rename(staging, destination); err != nil {
		return err
	}
	fmt.Printf("Static site exported to %s\n", destination)
	return nil
}

func copyPublic(root, output, name string) error {
	source := filepath.Join(root, name)
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil
	}
	publicName := filepath.ToSlash(name)
	if info.IsDir() {
		publicName += "/file.txt"
	}
	if !publicPath(publicName) {
		return nil
	}
	destination := filepath.Join(output, name)
	if info.IsDir() {
		if err := os.Mkdir(destination, 0755); err != nil {
			return err
		}
		entries, err := os.ReadDir(source)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := copyPublic(root, output, filepath.Join(name, entry.Name())); err != nil {
				return err
			}
		}
	} else {
		if !info.Mode().IsRegular() {
			return fmt.Errorf("not a regular file: %s", source)
		}
		data, err := os.ReadFile(source)
		if err != nil {
			return err
		}
		if err := os.WriteFile(destination, data, 0644); err != nil {
			return err
		}
	}
	// Unnumbered documents and directories use modification time for sorting.
	return os.Chtimes(destination, info.ModTime(), info.ModTime())
}
