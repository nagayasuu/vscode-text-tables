import * as tt from './ttTable';
import * as vscode from 'vscode';
import { RowType } from './ttTable';
import { padString } from './utils';

const verticalSeparator = '|';
const horizontalSeparator = '-';

type StringReducer = (previous: string, current: string, index: number) => string;

export class MarkdownParser implements tt.Parser {
    parse(text: string): tt.Table | undefined {
        if (!text || text.length === 0) {
            return undefined;
        }

        const result = new tt.Table();
        const strings = text.split('\n').map(x => x.trim()).filter(x => x.startsWith(verticalSeparator));

        for (const s of strings) {
            const cleanedString = s.replace(/\s+/g, '');

            if (this.isSeparatorRow(cleanedString)) {
                result.addRow(tt.RowType.Separator, []);
                const startIndex = cleanedString.startsWith(verticalSeparator) ? 1 : 0;
                const endIndex = cleanedString.length - (cleanedString.endsWith(verticalSeparator) ? 1 : 0);
                const rowParts = cleanedString.slice(startIndex, endIndex).split('|');

                rowParts.forEach((part, i) => {
                    if (part.length < 3) {
                        return;
                    }
                    const trimmed = part.trim();
                    let align = tt.Alignment.Left;
                    if (trimmed[trimmed.length - 1] === ':') {
                        if (trimmed[0] === ':') {
                            align = tt.Alignment.Center;
                        } else {
                            align = tt.Alignment.Right;
                        }
                    }
                    const col = result.cols[i];
                    if (col) {
                        col.alignment = align;
                    } else {
                        result.cols.push({ alignment: align, width: 3 });
                    }
                });

                continue;
            }

            const lastIndex = s.length - (s.endsWith(verticalSeparator) ? 1 : 0);

            let values: string[];
            if (s.endsWith(verticalSeparator)) {
                // Complete table row: | cell1 | cell2 |
                values = s
                    .slice(1, lastIndex)
                    .split(verticalSeparator)
                    .map(x => x.trim());
            } else {
                // Incomplete table row: | cell1 | cell2 | cell3
                // Count the number of cells by splitting on |
                const allParts = s.slice(1).split(verticalSeparator).map(x => x.trim());
                values = allParts;
            }

            result.addRow(tt.RowType.Data, values);
        }

        // Recalculate column widths based on all data to ensure proper alignment
        result.recalculateColumnWidths();

        return result;
    }

    isSeparatorRow(text: string): boolean {
        const cleaned = text.replace(/\s+/g, '');
        return cleaned.startsWith('|-') || cleaned.startsWith('|:-');
    }
}

export class MarkdownStringifier implements tt.Stringifier {
    private reducers = new Map([
        [tt.RowType.Data, this.dataRowReducer],
        [tt.RowType.Separator, this.separatorReducer],
    ]);

    stringify(table: tt.Table): string {
        const result = [];

        if (table.rows.some(x => x.type === RowType.Separator)) {
            table.cols.forEach(x => x.width = Math.max(x.width, 3));
        }

        for (let i = 0; i < table.rows.length; ++i) {
            let rowString = '';
            const rowData = table.getRow(i);
            const reducer = this.reducers.get(table.rows[i].type);
            if (reducer) {
                rowString = rowData.reduce(reducer(table.cols), verticalSeparator);
            }
            result.push(rowString);
        }

        return result.join('\n');
    }

    private dataRowReducer(cols: tt.ColDef[]): StringReducer {
        return (prev, cur, idx) => {
            const paddedValue = padString(cur, cols[idx].width);
            return prev + ' ' + paddedValue + ' ' + verticalSeparator;
        };
    }

    private separatorReducer(cols: tt.ColDef[]): StringReducer {
        return (prev, _, idx) => {
            const begin = cols[idx].alignment === tt.Alignment.Center
                ? ' :'
                : ' -';
            const ending = cols[idx].alignment !== tt.Alignment.Left
                ? ': ' + verticalSeparator
                : '- ' + verticalSeparator;

            const middle = horizontalSeparator.repeat(cols[idx].width - 2);

            return prev + begin + middle + ending;
        };
    }
}

export class MarkdownLocator implements tt.Locator {
    locate(reader: tt.LineReader, lineNr: number): vscode.Range | undefined {
        
        const isTableLikeString = (ln: number) => {
            if (ln < 0 || ln >= reader.lineCount) {
                return false;
            }
            const firstCharIdx = reader.lineAt(ln).firstNonWhitespaceCharacterIndex;
            const firstChar = reader.lineAt(ln).text[firstCharIdx];
            return firstChar === '|';
        };

        let start = lineNr;
        while (isTableLikeString(start)) {
            start--;
        }

        let end = lineNr;
        while (isTableLikeString(end)) {
            end++;
        }

        if (start === end) {
            // Check if the current line itself is a table-like string
            if (isTableLikeString(lineNr)) {
                // Single line table - always include the entire line to avoid leftover characters
                const line = reader.lineAt(lineNr);
                const startPos = new vscode.Position(lineNr, 0);
                const endPos = new vscode.Position(lineNr, line.text.length);
                console.log('Debug: MarkdownLocator single line table range:', lineNr, '0 to', line.text.length);
                console.log('Debug: MarkdownLocator line text:', JSON.stringify(line.text));
                console.log('Debug: MarkdownLocator range positions:', startPos, 'to', endPos);
                return new vscode.Range(startPos, endPos);
            }
            return undefined;
        }

        // Multiple line table - use the range of table lines
        const endLine = reader.lineAt(end - 1);
        
        // For multi-line tables, ensure we capture the entire start and end lines
        const startPos = new vscode.Position(start + 1, 0);
        const endPos = new vscode.Position(end - 1, endLine.text.length);
        
        console.log('Debug: MarkdownLocator multi-line table range:', startPos, 'to', endPos);
        return new vscode.Range(startPos, endPos);
    }
}
