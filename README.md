# Text Tables

## vscode-text-tables Keybindings Reference

### Basic Operations

| Key | Command | Description |
|-----|---------|-------------|
| `Ctrl+Q Ctrl+Q` | `text-tables.tableModeOn/Off` | Toggle table mode ON/OFF |
| `Ctrl+Q Ctrl+F` | `text-tables.formatUnderCursor` | Format table under cursor |
| `Ctrl+Q Space` | `text-tables.clearCell` | Clear current cell |

### Navigation (Table Mode Only)

> **Note**: The following keybindings only work when `tableMode` is active

| Key | Command | Description |
|-----|---------|-------------|
| `Tab` | `text-tables.gotoNextCell` | Move to next cell (creates new row if at last cell) |
| `Shift+Tab` | `text-tables.gotoPreviousCell` | Move to previous cell |
| `Enter` | `text-tables.nextRow` | Move to next row (creates new column if in header row) |

### Table Editing (Table Mode Only)

| Key | Command | Description |
|-----|---------|-------------|
| `Alt+↑` | `text-tables.moveRowUp` | Move current row up |
| `Alt+↓` | `text-tables.moveRowDown` | Move current row down |
| `Ctrl+Alt+→` | `text-tables.moveColRight` | Move current column right |
| `Ctrl+Alt+←` | `text-tables.moveColLeft` | Move current column left |

### Commands (No Keybinding)

The following commands are available through the Command Palette (`Ctrl+Shift+P`) but have no default keybindings:

| Command | Description |
|---------|-------------|
| `Text Tables: Enable` | Enable the extension |
| `Text Tables: Create table` | Create a new table |

### Conditional Keybindings

The extension uses contextual keybindings based on the following conditions:

- **`when: tableMode`** - Only active when table mode is enabled
- **`when: editorFocus && !tableMode`** - Only when editor is focused and table mode is disabled
- **`when: editorFocus && tableMode`** - Only when editor is focused and table mode is enabled

### Usage Examples

#### Enable Table Mode
1. Place cursor inside a table
2. Press `Ctrl+Q Ctrl+Q`
3. "Table Mode" appears in the status bar

#### Cell Navigation
- `Tab`: Move to the right cell (creates new row if at the end)
- `Shift+Tab`: Move to the left cell
- `Enter`: Move to the cell below (creates new column if in header row)

#### Table Formatting
- `Ctrl+Q Ctrl+F`: Format the current table with proper alignment

### Supported File Types

- Markdown (`.md`)
- Org-mode (`.org`)

### Configuration

The extension behavior can be customized through settings:

- `text-tables.mode`: `"markdown"` or `"org"` (default: `"markdown"`)
- `text-tables.showStatus`: Show/hide status bar item (default: `true`)

### Recent Improvements

This extension now includes enhanced support for:
- Japanese and other wide characters (CJK)
- Incomplete table rows
- Accurate table range detection
- Smart row/column addition
