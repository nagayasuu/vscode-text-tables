import * as vscode from 'vscode';
import { Table, RowType, TableNavigator, Stringifier, Parser } from './ttTable';

/**
 * Create new table with specified rows and columns count in position of cursor
 */
export async function createTable(rowsCount: number, colsCount: number, editor: vscode.TextEditor, stringifier: Stringifier) {
    const table = new Table();
    for (let i = 0; i < rowsCount + 1; i++) {
        table.addRow(RowType.Data, new Array(colsCount).fill(''));
    }
    table.rows[1].type = RowType.Separator;

    const currentPosition = editor.selection.start;
    const currentLine = editor.document.lineAt(currentPosition.line);
    
    // Calculate indentation: get text before cursor position
    const textBeforeCursor = currentLine.text.substring(0, currentPosition.character);
    const indentMatch = textBeforeCursor.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';
    
    // Generate table with indentation for each line
    const tableText = stringifier.stringify(table);
    const indentedTableText = tableText
        .split('\n')
        .map(line => {
            // Don't indent empty lines
            if (line.trim() === '') {
                return line;
            }
            // Add indentation to each table line
            return indentation + line;
        })
        .join('\n');
    
    // If we're not at the beginning of the line, add a newline before the table
    const needsNewlineBefore = currentPosition.character > 0 && textBeforeCursor.trim() !== '';
    const finalTableText = needsNewlineBefore ? '\n' + indentedTableText : indentedTableText;
    
    await editor.edit(b => b.insert(currentPosition, finalTableText));
    
    // Position cursor at the first cell of the new table
    const newCursorLine = currentPosition.line + (needsNewlineBefore ? 1 : 0);
    const firstCellPosition = new vscode.Position(newCursorLine, indentation.length + 2); // After "| "
    editor.selection = new vscode.Selection(firstCellPosition, firstCellPosition);
}

/**
 * Swap row under cursor with row below
 */
export async function moveRowDown(editor: vscode.TextEditor, _range: vscode.Range, table: Table) {
    const rowNum = editor.selection.end.line - table.startLine;
    if (rowNum >= table.rows.length - 1) {
        vscode.window.showWarningMessage('Cannot move row further');
        return;
    }
    await vscode.commands.executeCommand('editor.action.moveLinesDownAction');
}

/**
 * Swap row under cursor with row above
 */
export async function moveRowUp(editor: vscode.TextEditor, _range: vscode.Range, table: Table) {
    const rowNum = editor.selection.start.line - table.startLine;
    if (rowNum <= 0) {
        vscode.window.showWarningMessage('Cannot move row further');
        return;
    }
    await vscode.commands.executeCommand('editor.action.moveLinesUpAction');
}

/**
 * Move cursor to the next cell of table
 */
export async function gotoNextCell(editor: vscode.TextEditor, range: vscode.Range, table: Table,
    stringifier: Stringifier) {

    // Fast path: check if we're on a valid table line
    const currentLine = editor.document.lineAt(editor.selection.start.line);
    const currentLineText = currentLine.text;
    
    // Early exit for non-table lines
    if (!currentLineText.trim() || !currentLineText.includes('|')) {
        return;
    }

    // Always format table for consistency on Tab navigation
    await formatUnderCursor(editor, range, table, stringifier);
    
    // Recreate navigator after formatting to get accurate positions
    const newNav = new TableNavigator(table, editor.document);
    const newCurrentPos = editor.selection.start;
    
    // Check if we're in the last cell using multiple methods for robustness
    const isInLastCell = checkIfInLastCell(newNav, newCurrentPos, table);
    
    if (isInLastCell) {
        // In last cell - add new row
        await addNewRowAndMoveCursor(editor, range, table, stringifier);
        return;
    }
    
    // Try to navigate to next cell
    const nextCellPosition = newNav.nextCell(newCurrentPos);
    
    if (nextCellPosition) {
        // Check for wrap-around (when nextCell returns first cell of same or next row)
        const isWrappingAround = nextCellPosition.line === newCurrentPos.line && 
                                nextCellPosition.character <= newCurrentPos.character;
        
        if (!isWrappingAround) {
            // Simple navigation
            editor.selection = new vscode.Selection(nextCellPosition, nextCellPosition);
            return;
        } else {
            // Wrap-around detected - add new row
            await addNewRowAndMoveCursor(editor, range, table, stringifier);
            return;
        }
    }
    
    // No next cell available - add new row
    await addNewRowAndMoveCursor(editor, range, table, stringifier);
}

/**
 * Check if current position is in the last cell of the table
 */
function checkIfInLastCell(nav: TableNavigator, currentPos: vscode.Position, table: Table): boolean {
    // Method 1: Use navigator's isLastCell if available
    try {
        if ('isLastCell' in nav && typeof nav.isLastCell === 'function') {
            return nav.isLastCell(currentPos);
        }
    } catch (e) {
        // Fall through to alternative method
    }
    
    // Method 2: Check if nextCell returns null/undefined or wraps around
    const nextCellPos = nav.nextCell(currentPos);
    if (!nextCellPos) {
        return true; // No next cell means we're in the last cell
    }
    
    // Method 3: Check if we're on the last row and last column
    const currentRowIndex = currentPos.line - table.startLine;
    const lastRowIndex = table.rows.length - 1;
    
    // If we're on the last data row
    if (currentRowIndex === lastRowIndex || 
        (currentRowIndex === lastRowIndex - 1 && table.rows[lastRowIndex].type === RowType.Separator)) {
        
        // Check if we're in the last column by comparing character positions
        const isWrappingToBeginning = nextCellPos.line === currentPos.line && 
                                     nextCellPos.character <= currentPos.character;
        
        if (isWrappingToBeginning) {
            return true;
        }
    }
    
    return false;
}

async function addNewRowAndMoveCursor(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    // Add a new row
    table.addRow(RowType.Data, new Array(table.cols.length).fill(''));
    
    // Detect indentation from the first line of the table
    const firstLine = editor.document.lineAt(range.start.line);
    const indentMatch = firstLine.text.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';
    
    // Format the table with the new row and preserved indentation
    const formattedText = stringifier.stringifyWithIndent(table, indentation);
    
    // Optimize range adjustment for single-line tables
    let adjustedRange = range;
    if (range.start.line === range.end.line) {
        const lineText = editor.document.lineAt(range.start.line).text;
        if (lineText.includes('|')) {
            adjustedRange = new vscode.Range(
                new vscode.Position(range.start.line, 0),
                new vscode.Position(range.end.line, lineText.length)
            );
        }
    }
    
    // Replace the table text
    await editor.edit(e => e.replace(adjustedRange, formattedText));
    
    // Efficiently calculate new cursor position
    const formattedLines = formattedText.split('\n');
    const lastLineIndex = formattedLines.length - 1;
    const lastLine = formattedLines[lastLineIndex];
    
    // Position cursor at the start of the first cell in the new row
    const newRowLine = table.startLine + lastLineIndex;
    const firstCellPos = lastLine.indexOf('|') >= 0 ? lastLine.indexOf('|') + 2 : indentation.length + 2;
    
    // Move cursor to the new row
    const targetPosition = new vscode.Position(newRowLine, firstCellPos);
    editor.selection = new vscode.Selection(targetPosition, targetPosition);
}

/**
 * Move cursor to the previous cell of table
 */
export async function gotoPreviousCell(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    // Always format table for consistency on navigation
    await formatUnderCursor(editor, range, table, stringifier);
    
    // Navigate to previous cell
    const nav = new TableNavigator(table, editor.document);
    const newPos = nav.previousCell(editor.selection.start);
    if (newPos) {
        editor.selection = new vscode.Selection(newPos, newPos);
    }
}

/**
 * Format table under cursor
 */
export async function formatUnderCursor(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    // Recalculate column widths to ensure proper alignment
    table.recalculateColumnWidths();
    
    // Detect indentation from the first line of the table
    const firstLine = editor.document.lineAt(range.start.line);
    const indentMatch = firstLine.text.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';
    
    // Generate table with preserved indentation
    const newText = stringifier.stringifyWithIndent(table, indentation);
    const prevSel = editor.selection.start;

    await editor.edit(e => e.replace(range, newText));
    editor.selection = new vscode.Selection(prevSel, prevSel);
}

/**
 * Swap column under cursor with column on the right
 */
export async function moveColRight(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const rowCol = rowColFromPosition(table, editor.selection.start);
    
    if (rowCol.col < 0) {
        vscode.window.showWarningMessage('Not in table data field');
        return;
    }

    if (rowCol.col >= table.cols.length - 1 ) {
        vscode.window.showWarningMessage('Cannot move column further right');
        return;
    }

    // Store the current row for cursor positioning
    const currentRow = rowCol.row;
    const sourceCol = rowCol.col;
    const targetCol = rowCol.col + 1; // The column we're moving to

    // Swap column metadata
    [table.cols[sourceCol], table.cols[targetCol]] = [table.cols[targetCol], table.cols[sourceCol]];

    // Swap column data in all rows
    table.rows.forEach((_, i) => {
        const v1 = table.getAt(i, sourceCol);
        const v2 = table.getAt(i, targetCol);
        table.setAt(i, targetCol, v1);
        table.setAt(i, sourceCol, v2);
    });

    // Recalculate column widths after swap
    table.recalculateColumnWidths();

    // Detect indentation from the first line of the table
    const firstLine = editor.document.lineAt(range.start.line);
    const indentMatch = firstLine.text.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';
    
    const newText = stringifier.stringifyWithIndent(table, indentation);
    await editor.edit(e => e.replace(range, newText));
    
    // Position cursor in the moved column (target column)
    if (currentRow >= 0 && targetCol >= 0 && targetCol < table.cols.length) {
        const targetRowLine = table.startLine + currentRow;
        
        // Get the actual updated line text after the edit
        const updatedLineText = newText.split('\n')[currentRow];
        const targetPosition = calculateColumnPosition(updatedLineText, targetCol, indentation);
        
        setSafeCursorPosition(editor, targetRowLine, targetPosition, indentation);
    }
}

/**
 * Swap column under cursor with column on the left
 */
export async function moveColLeft(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const rowCol = rowColFromPosition(table, editor.selection.start);
    
    if (rowCol.col < 0) {
        vscode.window.showWarningMessage('Not in table data field');
        return;
    }

    if (rowCol.col === 0) {
        vscode.window.showWarningMessage('Cannot move column further left');
        return;
    }

    // Store the current row for cursor positioning
    const currentRow = rowCol.row;
    const sourceCol = rowCol.col;
    const targetCol = rowCol.col - 1; // The column we're moving to

    // Swap column metadata
    [table.cols[sourceCol], table.cols[targetCol]] = [table.cols[targetCol], table.cols[sourceCol]];

    // Swap column data in all rows
    table.rows.forEach((_, i) => {
        const v1 = table.getAt(i, sourceCol);
        const v2 = table.getAt(i, targetCol);
        table.setAt(i, targetCol, v1);
        table.setAt(i, sourceCol, v2);
    });

    // Recalculate column widths after swap
    table.recalculateColumnWidths();

    // Detect indentation from the first line of the table
    const firstLine = editor.document.lineAt(range.start.line);
    const indentMatch = firstLine.text.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';
    
    const newText = stringifier.stringifyWithIndent(table, indentation);
    await editor.edit(e => e.replace(range, newText));
    
    // Position cursor in the moved column (target column)
    if (currentRow >= 0 && targetCol >= 0 && targetCol < table.cols.length) {
        const targetRowLine = table.startLine + currentRow;
        
        // Get the actual updated line text after the edit
        const updatedLineText = newText.split('\n')[currentRow];
        const targetPosition = calculateColumnPosition(updatedLineText, targetCol, indentation);
        
        setSafeCursorPosition(editor, targetRowLine, targetPosition, indentation);
    }
}

/**
 * Clear cell under cursor
 */
export function clearCell(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, parser: Parser) {
    const document = editor.document;
    const currentLineNumber = editor.selection.start.line;
    const currentLine = document.lineAt(currentLineNumber);

    if (parser.isSeparatorRow(currentLine.text)) {
        vscode.window.showInformationMessage('Not in table data field');
        return;
    }

    const leftSepPosition = currentLine.text.lastIndexOf('|', editor.selection.start.character - 1);
    let rightSepPosition = currentLine.text.indexOf('|', editor.selection.start.character);
    if (rightSepPosition < 0) {
        rightSepPosition = currentLine.range.end.character;
    }

    if (leftSepPosition === rightSepPosition) {
        vscode.window.showInformationMessage('Not in table data field');
        return;
    }

    const r = new vscode.Range(currentLineNumber, leftSepPosition + 1, currentLineNumber, rightSepPosition);
    edit.replace(r, ' '.repeat(rightSepPosition - leftSepPosition - 1));
    // Position cursor at content start (after padding space)
    const newPos = new vscode.Position(currentLineNumber, leftSepPosition + 2);
    editor.selection = new vscode.Selection(newPos, newPos);
}

/**
 * Moves cursor to the next row. If cursor is in the last row of table, create new row
 */
/**
 * Moves cursor to the next row. If cursor is in the last row of table, create new row.
 * If cursor is in the first row (header), add a new column instead.
 */
export async function nextRow(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const currentRowIndex = editor.selection.start.line - table.startLine;
    const isFirstRow = currentRowIndex === 0;
    
    if (isFirstRow) {
        // In header row - add a new column and move to it
        table.addColumn();
        
        // Recalculate column widths to ensure proper formatting
        table.recalculateColumnWidths();
        
        // Format the table with the new column
        await formatUnderCursor(editor, range, table, stringifier);
        
        // Calculate the position of the new (last) column
        const currentRowLine = table.startLine + currentRowIndex;
        const lineText = editor.document.lineAt(currentRowLine).text;
        
        // Find all pipe positions to identify column boundaries
        const pipePositions: number[] = [];
        for (let i = 0; i < lineText.length; i++) {
            if (lineText[i] === '|') {
                pipePositions.push(i);
            }
        }
        
        if (pipePositions.length >= 2) {
            // Get the second-to-last pipe position (start of last column)
            const lastColumnStartPipe = pipePositions[pipePositions.length - 2];
            // Position cursor after "| " (pipe + space)
            const newColumnPos = new vscode.Position(currentRowLine, lastColumnStartPipe + 2);
            editor.selection = new vscode.Selection(newColumnPos, newColumnPos);
        } else {
            // Fallback: find position after last |
            let position = lineText.lastIndexOf('|');
            if (position === -1) {
                position = lineText.length;
            } else {
                // Move to after the last | and any following space
                position++;
                while (position < lineText.length && lineText[position] === ' ') {
                    position++;
                }
            }
            
            const newColumnPos = new vscode.Position(currentRowLine, position);
            editor.selection = new vscode.Selection(newColumnPos, newColumnPos);
        }
        return;
    }
    
    // Normal behavior for non-header rows
    const inLastRow = range.end.line === editor.selection.start.line;

    if (inLastRow) {
        table.addRow(RowType.Data, new Array(table.cols.length).fill(''));
    }

    // Recalculate column widths and format
    table.recalculateColumnWidths();
    
    // Detect indentation from the first line of the table
    const firstLine = editor.document.lineAt(range.start.line);
    const indentMatch = firstLine.text.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';
    
    await editor.edit(b => b.replace(range, stringifier.stringifyWithIndent(table, indentation)));

    // Move to the next row, preserving the current column position
    const currentCol = rowColFromPosition(table, editor.selection.start).col;
    let nextRowLineIndex = currentRowIndex + 1;
    
    // Skip separator rows when moving to next row
    while (nextRowLineIndex < table.rows.length && table.rows[nextRowLineIndex].type === RowType.Separator) {
        nextRowLineIndex++;
    }
    
    const nextRowLine = table.startLine + nextRowLineIndex;
    
    if (nextRowLineIndex < table.rows.length && currentCol >= 0) {
        // Use the same logic as rowColFromPosition but in reverse
        // to find the exact position for the target column
        let targetPosition = indentation.length + 1; // Start after indentation + first '|'
        
        for (let i = 0; i < currentCol; i++) {
            const colWidth = table.cols[i].width;
            // Move to next cell: | + space + content + space
            targetPosition += 1 + 1 + colWidth + 1; // | + space + content + space
        }
        
        // Position after "| " in the target column (same as rowColFromPosition cellStart)
        targetPosition += 1; // Move to position after "| "
        
        const nextRowPos = new vscode.Position(nextRowLine, targetPosition);
        editor.selection = new vscode.Selection(nextRowPos, nextRowPos);
    } else {
        // Use navigator as fallback for edge cases
        const nav = new TableNavigator(table, editor.document);
        const nextRowPos = nav.nextRow(editor.selection.start);
        if (nextRowPos) {
            editor.selection = new vscode.Selection(nextRowPos, nextRowPos);
        } else if (nextRowLineIndex < table.rows.length) {
            // Fallback to start of next row with indentation
            const fallbackPos = new vscode.Position(nextRowLine, indentation.length + 2);
            editor.selection = new vscode.Selection(fallbackPos, fallbackPos);
        }
    }
}

function rowColFromPosition(table: Table, position: vscode.Position): { row: number, col: number } {
    const result = { row: position.line - table.startLine, col: -1 };
    
    // Early exit if row is invalid
    if (result.row < 0 || result.row >= table.rows.length) {
        result.row = -1;
        return result;
    }
    
    // Get indentation for this table row to calculate correct positions
    const editor = vscode.window.activeTextEditor;
    let indentLength = 0;
    let lineText = '';
    if (editor && position.line < editor.document.lineCount) {
        lineText = editor.document.lineAt(position.line).text;
        const indentMatch = lineText.match(/^(\s*)/);
        indentLength = indentMatch ? indentMatch[1].length : 0;
    }
    
    const posChar = position.character;
    
    // Use a more reliable method: find all pipe positions and determine column from that
    const pipePositions: number[] = [];
    for (let i = indentLength; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            pipePositions.push(i);
        }
    }
    
    // If we have pipes, determine column based on position relative to pipes
    if (pipePositions.length > 0) {
        for (let i = 0; i < pipePositions.length - 1; i++) {
            const leftPipe = pipePositions[i];
            const rightPipe = pipePositions[i + 1];
            
            // Check if cursor is between these two pipes (in this column)
            if (posChar > leftPipe && posChar < rightPipe) {
                result.col = i;
                break;
            }
        }
        
        // Special case: if cursor is after the last pipe (last column)
        if (result.col === -1 && pipePositions.length >= 2) {
            const lastPipe = pipePositions[pipePositions.length - 1];
            if (posChar > lastPipe) {
                // But only if this looks like the end of the table
                const remainingText = lineText.substring(lastPipe + 1).trim();
                if (remainingText === '') {
                    result.col = pipePositions.length - 2; // -2 because we count columns between pipes
                }
            }
        }
        
        // Another special case: cursor exactly on a pipe - choose the column to the right
        if (result.col === -1) {
            for (let i = 0; i < pipePositions.length; i++) {
                if (posChar === pipePositions[i]) {
                    // Choose the column to the right of this pipe
                    result.col = Math.min(i, table.cols.length - 1);
                    break;
                }
            }
        }
    }
    
    // Final bounds check
    if (result.col >= table.cols.length) {
        result.col = table.cols.length - 1;
    }
    if (result.col < 0 && pipePositions.length > 0) {
        result.col = 0; // Default to first column if we're in a table row
    }

    return result;
}

// Helper function for safe cursor positioning after column moves
function setSafeCursorPosition(editor: vscode.TextEditor, targetRowLine: number, targetPosition: number, indentation: string): void {
    if (editor && targetRowLine < editor.document.lineCount) {
        const lineText = editor.document.lineAt(targetRowLine).text;
        const maxPos = lineText.length;
        
        // Ensure position is within valid bounds
        let safePosition = targetPosition;
        if (safePosition > maxPos) {
            // Fallback: position at a safe location within the line
            safePosition = Math.max(indentation.length + 2, maxPos - 1);
        }
        safePosition = Math.min(safePosition, maxPos);
        
        const newPos = new vscode.Position(targetRowLine, safePosition);
        editor.selection = new vscode.Selection(newPos, newPos);
    }
}

/**
 * Calculate accurate cursor position for a target column in a table row
 */
function calculateColumnPosition(lineText: string, targetCol: number, indentation: string): number {
    // Find all pipe positions in the line
    const pipePositions: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            pipePositions.push(i);
        }
    }
    
    // Calculate target position: position after "| " in the target column
    if (pipePositions.length > targetCol) {
        return pipePositions[targetCol] + 2; // After the target column's opening pipe + space
    }
    
    // Fallback to default position
    return indentation.length + 2;
}

// Debug helper function to verify column detection (temporary)
