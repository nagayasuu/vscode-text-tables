import * as vscode from 'vscode';
import { getStringWidth } from './utils';

export enum RowType {
    Unknown,
    Separator,
    Data
}

export enum Alignment {
    Left,
    Center,
    Right
}

export interface RowDef {
    type: RowType;
}

export interface ColDef {
    alignment: Alignment;
    width: number;
}

export class Table {
    /**
     * Line where the table starts
     */
    startLine = 0;

    rows: RowDef[] = [];
    cols: ColDef[] = [];

    private data: string[][] = [];

    addRow(type: RowType, values: string[]) {
        // Ensure we have at least one column for incomplete rows
        if (values.length === 0 && this.cols.length === 0) {
            values = [''];
        }
        
        let adjustCount = values.length - this.cols.length;
        while (adjustCount-- > 0) {
            this.cols.push({ alignment: Alignment.Left, width: 0 });
        }

        for (const row of this.data) {
            const adjustee = row.length < values.length ? row : values;
            adjustCount = Math.abs(row.length - values.length);

            while (adjustCount-- > 0) {
                adjustee.push('');
            }
        }

        this.cols.forEach((col, i) => {
            const value = values[i] || '';
            col.width = Math.max(col.width, getStringWidth(value));
        });

        this.rows.push({ type });
        this.data.push(values);
    }

    getAt(row: number, col: number): string {
        return this.data[row][col];
    }

    getRow(row: number): string[] {
        return this.data[row];
    }

    setAt(row: number, col: number, value: string) {
        const oldValue = this.data[row][col];
        const oldValueWidth = getStringWidth(oldValue);
        const newValueWidth = getStringWidth(value);
        
        // Update the data
        this.data[row][col] = value;
        
        // Update column width intelligently
        if (newValueWidth > this.cols[col].width) {
            // New value is wider - simply update the column width
            this.cols[col].width = newValueWidth;
        } else if (oldValueWidth === this.cols[col].width && newValueWidth < oldValueWidth) {
            // Old value was the widest and new value is shorter - need to recalculate
            let maxWidth = 0;
            for (let i = 0; i < this.data.length; i++) {
                const cellValue = this.data[i][col] || '';
                maxWidth = Math.max(maxWidth, getStringWidth(cellValue));
            }
            this.cols[col].width = Math.max(maxWidth, 3); // Minimum width for separators
        }
    }

    /**
     * Recalculate column widths based on all current data
     */
    recalculateColumnWidths() {
        // Reset all column widths to minimum
        this.cols.forEach(col => col.width = 0);

        // Go through all data and find maximum width for each column
        for (let rowIndex = 0; rowIndex < this.data.length; rowIndex++) {
            const row = this.data[rowIndex];
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                if (colIndex < this.cols.length) {
                    const value = row[colIndex] || '';
                    const valueWidth = getStringWidth(value);
                    this.cols[colIndex].width = Math.max(this.cols[colIndex].width, valueWidth);
                }
            }
        }

        // Ensure minimum width for separator rows
        if (this.rows.some(x => x.type === RowType.Separator)) {
            this.cols.forEach(x => x.width = Math.max(x.width, 3));
        }
    }

    /**
     * Add a new column to the table
     */
    addColumn(): void {
        // Add new column definition
        this.cols.push({ alignment: Alignment.Left, width: 0 });
        
        // Add empty cell to all existing rows
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].push('');
        }
    }
}

export interface Parser {
    parse(text: string): Table | undefined;
    isSeparatorRow(text: string): boolean;
}

export interface Stringifier {
    stringify(table: Table): string;
    stringifyWithIndent(table: Table, indent: string): string;
}

export interface Locator {
    locate(reader: LineReader, lineNr: number): vscode.Range | undefined;
}

export interface LineReader {
    lineAt(line: number): vscode.TextLine;
    lineCount: number;
}

class JumpPosition {
    constructor(start: vscode.Position, end: vscode.Position, public isSeparator: boolean, prev?: JumpPosition) {
        this.range = new vscode.Range(start, end);

        if (prev) {
            prev.next = this;
            this.prev = prev;
        }
    }

    range: vscode.Range;
    next?: JumpPosition;
    prev?: JumpPosition;
}

export class TableNavigator {
    private jumpPositions: JumpPosition[] = [];

    constructor(public table: Table, private document?: LineReader) {
        this.jumpPositions = this.buildJumpPositions();
    }

    nextCell(cursorPosition: vscode.Position): vscode.Position | undefined {
        return this.jump(cursorPosition, x => x.next!);
    }

    /**
     * Check if the current position is in the last cell of the table
     */
    isLastCell(cursorPosition: vscode.Position): boolean {
        const currentJmp = this.jumpPositions.find(x => x.range.contains(cursorPosition));
        if (!currentJmp || currentJmp.isSeparator) {
            return false;
        }
        
        // Check if there's no next data cell
        let nextJmp = currentJmp.next;
        while (nextJmp && nextJmp.isSeparator) {
            nextJmp = nextJmp.next;
        }
        
        return !nextJmp; // No next data cell means this is the last cell
    }

    /**
     * Check if the current position is on a separator row
     */
    isOnSeparatorRow(cursorPosition: vscode.Position): boolean {
        const currentJmp = this.jumpPositions.find(x => x.range.contains(cursorPosition));
        return currentJmp ? currentJmp.isSeparator : false;
    }

    previousCell(cursorPosition: vscode.Position): vscode.Position | undefined {
        return this.jump(cursorPosition, x => x.prev!);
    }

    nextRow(cursorPosition: vscode.Position): vscode.Position | undefined {
        const nextRowJump = this.jumpPositions.find(x => x.range.contains(cursorPosition.translate(1)));
        if (!nextRowJump) {
            return undefined;
        }

        // Return the exact start position for the next row
        return nextRowJump.range.start;
    }

    private jump(currentPosition: vscode.Position, accessor: (x: JumpPosition) => JumpPosition): vscode.Position | undefined {
        // First, try to find current position in jump positions
        let jmp = this.jumpPositions.find(x => x.range.contains(currentPosition));
        
        if (jmp) {
            jmp = accessor(jmp);
            if (jmp) {
                if (jmp.isSeparator) {
                    const nextJmp = accessor(jmp);
                    if (!nextJmp) {
                        return undefined;
                    }
                    jmp = nextJmp;
                }
                return jmp.range.start;
            }
        }

        // If not found and cursor is at the beginning of line, find first valid position
        if (currentPosition.character === 0) {
            const firstDataPosition = this.jumpPositions.find(x => 
                x.range.start.line === currentPosition.line && !x.isSeparator
            );
            if (firstDataPosition) {
                return firstDataPosition.range.start;
            }
        }
        
        // Try to find the closest position on the same line
        const sameLinePositions = this.jumpPositions.filter(x => 
            x.range.start.line === currentPosition.line && !x.isSeparator
        );
        
        if (sameLinePositions.length > 0) {
            // Find the first position to the right of current cursor
            const nextPosition = sameLinePositions.find(x => 
                x.range.start.character > currentPosition.character
            );
            if (nextPosition) {
                return nextPosition.range.start;
            }
            
            // If no position to the right, return the first position on the line
            return sameLinePositions[0].range.start;
        }

        return undefined;
    }

    private buildJumpPositions(): JumpPosition[] {
        const result: JumpPosition[] = [];

        for (let i = 0; i < this.table.rows.length; ++i) {
            const row = this.table.rows[i];
            const rowLine = this.table.startLine + i;

            if (row.type === RowType.Separator) {
                const prevJmpPos = result[result.length - 1];
                const start = prevJmpPos
                    ? prevJmpPos.range.end
                    : new vscode.Position(rowLine, 0);
                const end = start.translate(1);
                const jmpPos = new JumpPosition(start, end, true, prevJmpPos);
                result.push(jmpPos);
            } else {
                // Calculate cell positions using actual document content if available
                if (this.document && this.document.lineCount > rowLine) {
                    const lineText = this.document.lineAt(rowLine).text;
                    const cellPositions = this.calculateCellPositionsFromText(lineText);
                    
                    // Ensure we have at least one cell position if the line contains a table
                    if (cellPositions.length === 0 && lineText.includes('|')) {
                        // Fallback for incomplete table lines
                        cellPositions.push({ start: 2, end: lineText.length });
                    }
                    
                    for (let j = 0; j < Math.max(cellPositions.length, this.table.cols.length); ++j) {
                        const prevJmpPos = result[result.length - 1];
                        
                        let start: vscode.Position;
                        let end: vscode.Position;
                        
                        if (j < cellPositions.length) {
                            start = new vscode.Position(rowLine, cellPositions[j].start);
                            end = new vscode.Position(rowLine, cellPositions[j].end);
                        } else {
                            // Fallback calculation for additional columns
                            const fallbackStart = 2 + j * 10; // Rough estimate
                            start = new vscode.Position(rowLine, fallbackStart);
                            end = new vscode.Position(rowLine, fallbackStart + 5);
                        }
                        
                        const jmpPos = new JumpPosition(start, end, false, prevJmpPos);
                        result.push(jmpPos);
                    }
                } else {
                    // Fallback to calculated positions based on table structure
                    let currentPosition = 1; // Start after first |
                    
                    for (let j = 0; j < this.table.cols.length; ++j) {
                        const prevJmpPos = result[result.length - 1];
                        
                        // Content starts after: | + space
                        const contentStartPos = currentPosition + 1;
                        const start = new vscode.Position(rowLine, contentStartPos);
                        
                        // Cell width is the padded width
                        const cellWidth = this.table.cols[j].width;
                        const end = new vscode.Position(rowLine, contentStartPos + cellWidth);
                        
                        const jmpPos = new JumpPosition(start, end, false, prevJmpPos);
                        result.push(jmpPos);
                        
                        // Move to next cell position
                        currentPosition += 1 + 1 + cellWidth + 1; // | + space + content + space
                    }
                }
            }
        }
        return result;
    }

    private calculateCellPositionsFromText(lineText: string): Array<{start: number, end: number}> {
        const positions: Array<{start: number, end: number}> = [];
        const pipePositions: number[] = [];
        
        // Find all pipe positions
        for (let i = 0; i < lineText.length; i++) {
            if (lineText[i] === '|') {
                pipePositions.push(i);
            }
        }
        
        // Handle incomplete table rows (like "| test" without closing |)
        if (pipePositions.length < 2) {
            if (pipePositions.length === 1) {
                // Single pipe at the beginning - treat the rest as one cell
                const cellStart = Math.min(pipePositions[0] + 2, lineText.length); // | + space
                const cellEnd = lineText.length;
                positions.push({
                    start: cellStart,
                    end: Math.max(cellStart, cellEnd)
                });
            }
            return positions;
        }
        
        // Calculate content positions between pipes for complete rows
        for (let i = 0; i < pipePositions.length - 1; i++) {
            const cellStart = Math.min(pipePositions[i] + 2, lineText.length); // | + space
            const cellEnd = Math.max(cellStart, pipePositions[i + 1] - 1); // space before next |
            positions.push({
                start: cellStart,
                end: cellEnd
            });
        }
        
        return positions;
    }
}
