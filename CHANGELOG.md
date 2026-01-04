# Changelog

All notable changes to the "Fix Chinese Characters" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Command to upgrade VSCode version requirement (`Fix Chinese Characters: Upgrade VSCode Version`)
- Automatic update of both `engines.vscode` and `@types/vscode` dependencies
- Automatic `npm install` after version upgrade

## [1.0.0] - 2026-01-04

### Added
- Initial release
- Real-time replacement of Chinese punctuation while typing
- Manual replacement of Chinese punctuation in selected text
- Replace all Chinese punctuation in document
- Configurable replacement rules
- Toggle to enable/disable real-time replacement
- Keyboard shortcut `Ctrl+Alt+R` / `Cmd+Alt+R` for quick replacement
- Full undo/redo support
