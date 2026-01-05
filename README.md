# VSCode Fix Chinese Characters

Automatically replace full-width Chinese punctuation with half-width English punctuation. This tool helps developers maintain consistent punctuation without frequently switching input methods.

Now supports VS Code 1.107.0 and later, macOS, Linux, and Windows.

## Features

* **Context menu replacement**: Right-click on selected text and choose "tlcsdm" → "Replace Chinese Punctuation" to replace.
* **Replace entire document**: Replace all Chinese punctuation in the current document via Command Palette.
* **Configurable rules**: Customize replacement rules (Chinese → English mapping) in VS Code settings.
* **Undo/Redo support**: All replacement operations support VS Code's undo/redo mechanism.

## Usage

### Manual Replacement (Context Menu)
1. Select the text you want to replace
2. Right-click to open context menu
3. Select "tlcsdm" → "Replace Chinese Punctuation"

### Replace Entire Document
1. Open Command Palette (`Ctrl+Shift+P`)
2. Search for "Fix Chinese Characters: Replace in Document"

## Configuration

Open VS Code Settings and search for "Fix Chinese Characters" to configure:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tlcsdm.fixcnchar.rules` | object | See below | Custom replacement rules |

### Default Replacement Rules

| Chinese | English |
|---------|---------|
| ， | , |
| 。 | . |
| ； | ; |
| ： | : |
| " | " |
| " | " |
| ' | ' |
| ' | ' |
| （ | ( |
| ） | ) |
| 【 | [ |
| 】 | ] |
| 《 | < |
| 》 | > |

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Fix Chinese Characters"
4. Click Install

### From VSIX File
1. Download the `.vsix` file from [Releases](https://github.com/tlcsdm/vscode-fixcnchar/releases)
2. In VS Code, open Command Palette (`Ctrl+Shift+P`)
3. Search for "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file

### From Jenkins  
Download from [Jenkins](https://jenkins.tlcsdm.com/job/vscode-plugin/job/vscode-fixcnchar/)

## Build

This project uses TypeScript and npm (Node.js 22).

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode (for development)
npm run watch

# Lint
npm run lint

# Package
npx @vscode/vsce package

# Test
npm run test
```

## Related Projects

* [eclipse-fixcnchar](https://github.com/tlcsdm/eclipse-fixcnchar) - Eclipse version of this plugin

## License

MIT License - see [LICENSE](LICENSE) for details.
