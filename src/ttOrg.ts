import * as tt from './ttTable';
import * as vscode from 'vscode';
import { padString } from './utils';

const verticalSeparator = '|';
const horizontalSeparator = '-';
const intersection = '+';

type StringReducer = (previous: string, current: string, index: number) => string;

export class OrgParser implements tt.Parser {
    parse(text: string): tt.Table | undefined {
        if (!text || text.length === 0) {
            return undefined;
        }

        const result = new tt.Table();
        const strings = text.split('\n').map(x => x.trim()).filter(x => x.startsWith(verticalSeparator));

        for (const s of strings) {
            if (this.isSeparatorRow(s)) {
                result.addRow(tt.RowType.Separator, []);
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
        return text.length > 1 && text[1] === horizontalSeparator;
    }
}

export class OrgStringifier implements tt.Stringifier {
    private reducers = new Map([
        [tt.RowType.Data, this.dataRowReducer],
        [tt.RowType.Separator, this.separatorReducer],
    ]);

    stringify(table: tt.Table): string {
        const result = [];

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

    stringifyWithIndent(table: tt.Table, indent: string): string {
        const tableText = this.stringify(table);
        return tableText
            .split('\n')
            .map(line => {
                // Don't indent empty lines
                if (line.trim() === '') {
                    return line;
                }
                // Add indentation to each table line
                return indent + line;
            })
            .join('\n');
    }

    private dataRowReducer(cols: tt.ColDef[]): StringReducer {
        return (prev, cur, idx) => {
            const paddedValue = padString(cur, cols[idx].width);
            return prev + ' ' + paddedValue + ' ' + verticalSeparator;
        };
    }

    private separatorReducer(cols: tt.ColDef[]): (p: string, c: string, i: number) => string {
        return (prev, _, idx) => {
            // Intersections for each cell are '+', except the last one, where it should be '|'
            const ending = (idx === cols.length - 1)
                ? verticalSeparator
                : intersection;

            return prev + horizontalSeparator.repeat(cols[idx].width + 2) + ending;
        };
    }
}

export class OrgLocator implements tt.Locator {
    /**
     * Locate start and end of Org table in text from line number.
     *
     * @param reader Reader that is able to read line by line
     * @param lineNr Current line number
     * @returns vscode.Range if table was located. undefined if it failed
     */
    locate(reader: tt.LineReader, lineNr: number): vscode.Range | undefined {

        // Checks that line starts with vertical bar
        const isTableLikeString = (ln: number) => {
            if (ln < 0 || ln >= reader.lineCount) {
                return false;
            }
            const line = reader.lineAt(ln);
            const firstCharIdx = line.firstNonWhitespaceCharacterIndex;
            const firstChar = line.text[firstCharIdx];
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

                return new vscode.Range(startPos, endPos);
            }
            return undefined;
        }

        // Multiple line table - use the range of table lines
        const endLine = reader.lineAt(end - 1);
        
        // For multi-line tables, ensure we capture the entire start and end lines
        const startPos = new vscode.Position(start + 1, 0);
        const endPos = new vscode.Position(end - 1, endLine.text.length);


        return new vscode.Range(startPos, endPos);
    }
}
