import * as vscode from 'vscode';
import { Table, RowType, TableNavigator, Stringifier, Parser } from './ttTable';
import { debugCursorMovement } from './debugUtils';

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
    await editor.edit(b => b.insert(currentPosition, stringifier.stringify(table)));
    editor.selection = new vscode.Selection(currentPosition, currentPosition);
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

    console.log('Debug: gotoNextCell called');
    console.log('Debug: table rows:', table.rows.length, 'cols:', table.cols.length);

    // Check if we're on an empty line that's not part of the table
    const currentLine = editor.document.lineAt(editor.selection.start.line);
    const currentLineText = currentLine.text.trim();
    
    if (currentLineText === '' || (!currentLineText.startsWith('|'))) {
        console.log('Debug: Current line is empty or not a table line, not navigating');
        return;
    }

    // First, format the table to ensure it's properly structured
    await formatUnderCursor(editor, range, table, stringifier);
    
    // Create navigator with updated document after formatting
    const nav = new TableNavigator(table, editor.document);
    console.log('Debug: Current cursor position:', editor.selection.start.line, editor.selection.start.character);

    // Simple approach: Try to move to next cell first
    const nextCellPosition = nav.nextCell(editor.selection.start);
    console.log('Debug: Next cell position:', nextCellPosition ? `${nextCellPosition.line},${nextCellPosition.character}` : 'null');
    
    // Check if we're in the last cell and nextCell is wrapping around to the first cell
    if (nextCellPosition) {
        const currentPos = editor.selection.start;
        
        // If next cell position is before current position on the same line, it's wrapping around
        const isWrappingAround = nextCellPosition.line === currentPos.line && 
                                nextCellPosition.character < currentPos.character;
        
        if (isWrappingAround) {
            console.log('Debug: Navigation is wrapping around - treating as last cell');
            // No next cell available - add new row
            await addNewRowAndMoveCursor(editor, range, table, stringifier);
            return;
        }
        
        // Normal navigation: move to next cell
        console.log('Debug: Moving to next cell');
        editor.selection = new vscode.Selection(nextCellPosition, nextCellPosition);
        return;
    }
    
    // No next cell available - add new row
    console.log('Debug: No next cell found, adding new row');
    await addNewRowAndMoveCursor(editor, range, table, stringifier);
}

async function addNewRowAndMoveCursor(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    // Add a new row
    table.addRow(RowType.Data, new Array(table.cols.length).fill(''));
    
    // Format the table with the new row
    const formattedText = stringifier.stringify(table);
    console.log('Debug: Formatted text with new row:', JSON.stringify(formattedText));
    console.log('Debug: Original range:', range.start.line, range.start.character, 'to', range.end.line, range.end.character);
    
    // Get the original text that will be replaced
    const originalText = editor.document.getText(range);
    console.log('Debug: Original text being replaced:', JSON.stringify(originalText));
    
    // For single-line tables, always ensure we capture the entire line
    let adjustedRange = range;
    if (range.start.line === range.end.line) {
        const line = editor.document.lineAt(range.start.line);
        const lineText = line.text;
        console.log('Debug: Full line text:', JSON.stringify(lineText));
        
        // Check if this looks like a table line (starts with |)
        const trimmedText = lineText.trim();
        if (trimmedText.startsWith('|')) {
            console.log('Debug: Detected table line, adjusting range to cover entire line');
            adjustedRange = new vscode.Range(
                new vscode.Position(range.start.line, 0),
                new vscode.Position(range.end.line, lineText.length)
            );
            console.log('Debug: Adjusted range:', adjustedRange.start.line, adjustedRange.start.character, 'to', adjustedRange.end.line, adjustedRange.end.character);
        }
    }
    
    // Replace the table text
    const editResult = await editor.edit(e => e.replace(adjustedRange, formattedText));

    console.log('Debug: Edit result:', editResult);
    
    // Wait a moment for the document to be updated
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Calculate the new range that should contain the updated table
    const formattedLines = formattedText.split('\n');
    const newEndLine = adjustedRange.start.line + formattedLines.length - 1;
    const newEndChar = formattedLines[formattedLines.length - 1].length;
    const updatedRange = new vscode.Range(
        adjustedRange.start,
        new vscode.Position(newEndLine, newEndChar)
    );
    
    console.log('Debug: Updated range:', updatedRange.start.line, updatedRange.start.character, 'to', updatedRange.end.line, updatedRange.end.character);
    
    // Re-read the actual document content to ensure we have the correct state
    const actualDocumentText = editor.document.getText(updatedRange);
    console.log('Debug: Actual document text after update:', JSON.stringify(actualDocumentText));
    
    // Find the last data row (not separator) - use the formatted text for calculation
    let lastDataRowIndex = -1;
    for (let i = formattedLines.length - 1; i >= 0; i--) {
        const line = formattedLines[i];
        if (line.startsWith('|') && !line.includes('-')) {
            lastDataRowIndex = i;
            break;
        }
    }
    
    if (lastDataRowIndex === -1) {
        console.log('Debug: Could not find data row, using last line');
        lastDataRowIndex = formattedLines.length - 1;
    }

    const newRowLine = table.startLine + lastDataRowIndex;
    const newRowText = formattedLines[lastDataRowIndex] || '';
    
    console.log('Debug: New row line:', newRowLine, 'text from formatted:', JSON.stringify(newRowText));
    
    // Verify the actual line at that position
    if (newRowLine < editor.document.lineCount) {
        const actualLineText = editor.document.lineAt(newRowLine).text;
        console.log('Debug: Actual line text at position', newRowLine, ':', JSON.stringify(actualLineText));
    } else {
        console.log('Debug: New row line', newRowLine, 'is beyond document line count', editor.document.lineCount);
    }
    
    // Find the first cell position
    let firstCellPos = newRowText.indexOf('|') + 2;
    if (firstCellPos >= newRowText.length - 1) {
        console.log('Debug: Adjusting position to avoid end of line');
        firstCellPos = Math.max(2, newRowText.indexOf('|') + 2);
    }
    
    // Use debug utility for safer cursor movement
    const success = debugCursorMovement(editor, newRowLine, firstCellPos);
    if (!success) {
        console.log('Debug: Cursor movement failed');
    }
}

/**
 * Move cursor to the previous cell of table
 */
export async function gotoPreviousCell(editor: vscode.TextEditor, _range: vscode.Range, table: Table) {
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
    
    const newText = stringifier.stringify(table);
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

    [table.cols[rowCol.col], table.cols[rowCol.col + 1]] = [table.cols[rowCol.col + 1], table.cols[rowCol.col]];

    table.rows.forEach((_, i) => {
        const v1 = table.getAt(i, rowCol.col);
        const v2 = table.getAt(i, rowCol.col + 1);
        table.setAt(i, rowCol.col + 1, v1);
        table.setAt(i, rowCol.col, v2);
    });

    const newText = stringifier.stringify(table);
    await editor.edit(e => e.replace(range, newText));
    await gotoNextCell(editor, range, table, stringifier);
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

    [table.cols[rowCol.col], table.cols[rowCol.col - 1]] = [table.cols[rowCol.col - 1], table.cols[rowCol.col]];

    table.rows.forEach((_, i) => {
        const v1 = table.getAt(i, rowCol.col);
        const v2 = table.getAt(i, rowCol.col - 1);
        table.setAt(i, rowCol.col - 1, v1);
        table.setAt(i, rowCol.col, v2);
    });

    const newText = stringifier.stringify(table);
    await editor.edit(e => e.replace(range, newText));
    await gotoPreviousCell(editor, range, table);
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
    await editor.edit(b => b.replace(range, stringifier.stringify(table)));

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
        let targetPosition = 1; // Start after first '|'
        
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
            // Fallback to start of next row
            const fallbackPos = new vscode.Position(nextRowLine, 2);
            editor.selection = new vscode.Selection(fallbackPos, fallbackPos);
        }
    }
}

function rowColFromPosition(table: Table, position: vscode.Position): { row: number, col: number } {
    const result = { row: -1, col: -1 };

    result.row = position.line - table.startLine;
    
    // Calculate column based on actual character positions in Markdown table
    let currentPos = 1; // Start after first '|'
    
    for (let i = 0; i < table.cols.length; ++i) {
        const colWidth = table.cols[i].width;
        const cellStart = currentPos + 1; // Position after '| '
        const cellEnd = cellStart + colWidth; // End of content area
        
        if (position.character >= cellStart && position.character <= cellEnd) {
            result.col = i;
            break;
        }
        
        // Move to next cell: | + space + content + space
        currentPos += 1 + colWidth + 1 + 1; // space + content + space + |
    }

    return result;
}
