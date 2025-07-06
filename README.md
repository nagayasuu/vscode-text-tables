# Text Tables

## vscode-text-tables Keybindings Reference

### Basic Operations

| Key | Command | Description |
|-----|---------|-------------|
| `Ctrl+Q Ctrl+F` | `text-tables.formatUnderCursor` | Format table under cursor |
| `Ctrl+Q Space` | `text-tables.clearCell` | Clear current cell |

### Navigation (Automatic Table Detection)

> **Note**: The following keybindings work automatically when your cursor is inside a table in Markdown or Org-mode files

| Key | Command | Description |
|-----|---------|-------------|
| `Tab` | `text-tables.gotoNextCell` | Move to next cell (creates new row if at last cell, formats incomplete table lines) |
| `Shift+Tab` | `text-tables.gotoPreviousCell` | Move to previous cell |
| `Enter` | `text-tables.nextRow` | Move to next row (creates new column if in header row) |
| `Ctrl+Enter` | `text-tables.exitTableAndNewline` | Create a normal newline (exit table context) |

### Table Editing (Automatic Table Detection)

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

### Automatic Table Detection

The extension automatically detects when you're working with tables and enables table navigation features. No manual mode switching required!

#### How it works:
- **Automatic detection**: Extension detects table context based on current line and surrounding content
- **Seamless operation**: Table commands work automatically when cursor is in a table
- **Normal behavior**: When not in a table, keys work normally (Enter = newline, Tab = indent, etc.)

#### Smart Table Formatting:
- Type `|content|content` and press `Tab` → automatically formats into a proper table
- `Enter` in tables creates new rows
- `Enter` outside tables creates normal newlines
- `Ctrl+Enter` in tables creates a normal newline (exits table context)
- **`Tab` intelligently decides**: table navigation in tables, inline suggestion acceptance outside tables
- `Tab` outside tables works normally

### Usage Examples

#### Create a Table Automatically
1. Type: `|Header 1|Header 2|`
2. Press `Tab` → automatically formats into:
   ```
   | Header 1 | Header 2 |
   |----------|----------|
   |          |          |
   ```

#### Cell Navigation
- **`Tab`: Intelligent behavior** - Table navigation when in table, inline suggestion acceptance otherwise
- `Shift+Tab`: Move to the left cell  
- `Enter`: Move to the cell below (creates new column if in header row)
- `Ctrl+Enter`: Create a normal newline (exit table context)

#### Table Formatting
- `Ctrl+Q Ctrl+F`: Format the current table with proper alignment

### Supported File Types

- Markdown (`.md`)
- Org-mode (`.org`)

### Configuration

The extension behavior can be customized through settings:

- `text-tables.mode`: `"markdown"` or `"org"` (default: `"markdown"`)

### Recent Improvements

This extension now includes enhanced support for:
- **Fully automatic table detection** - No more manual tableMode switching!
- **Smart context-aware navigation** - Enter and Tab work naturally inside and outside tables
- **Automatic table formatting** - Type incomplete table lines and press Tab to format
- Japanese and other wide characters (CJK)
- Accurate table range detection
- Smart row/column addition
