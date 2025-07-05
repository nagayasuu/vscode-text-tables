'use strict';

import * as vscode from 'vscode';
import * as utils from './utils';
import * as cmd from './commands';
import { OrgLocator, OrgParser, OrgStringifier } from './ttOrg';
import { Locator, Parser, Stringifier, Table } from './ttTable';
import { MarkdownLocator, MarkdownParser, MarkdownStringifier } from './ttMarkdown';
import { isUndefined } from 'util';
import { registerContext, ContextType, enterContext, exitContext, restoreContext } from './context';
import * as cfg from './configuration';

let locator: Locator;
let parser: Parser;
let stringifier: Stringifier;
let configuration: cfg.Configuration;

function loadConfiguration() {
    configuration = cfg.build();

    if (configuration.mode === cfg.Mode.Org) {
        locator = new OrgLocator();
        parser = new OrgParser();
        stringifier = new OrgStringifier();
    } else {
        locator = new MarkdownLocator();
        parser = new MarkdownParser();
        stringifier = new MarkdownStringifier();
    }
}

export function activate(ctx: vscode.ExtensionContext) {
    loadConfiguration();

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    registerContext(ContextType.TableMode, '$(book) Table Mode', statusItem);

    if (configuration.showStatus) {
        statusItem.show();
    }

    vscode.workspace.onDidChangeConfiguration(() => {
        loadConfiguration();

        if (configuration.showStatus) {
            statusItem.show();
        } else {
            statusItem.hide();
        }
    });

    vscode.window.onDidChangeActiveTextEditor(e => {
        if (e) {
            restoreContext(e);
        }
    });

    ctx.subscriptions.push(vscode.commands.registerCommand('text-tables.enable', () => {
        vscode.window.showInformationMessage('Text tables enabled!');
    }));

    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('text-tables.tableModeOn',
        (e) => enterContext(e, ContextType.TableMode)));
    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('text-tables.tableModeOff',
        (e) => exitContext(e, ContextType.TableMode)));

    ctx.subscriptions.push(registerTableCommand('text-tables.moveRowDown', cmd.moveRowDown, {format: true}));
    ctx.subscriptions.push(registerTableCommand('text-tables.moveRowUp', cmd.moveRowUp, {format: true}));
    ctx.subscriptions.push(registerTableCommand('text-tables.moveColRight', async (editor, range, table) => {
        await cmd.moveColRight(editor, range, table, stringifier);
    }));
    ctx.subscriptions.push(registerTableCommand('text-tables.moveColLeft', async (editor, range, table) => {
        await cmd.moveColLeft(editor, range, table, stringifier);
    }));

    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('text-tables.clearCell',
        (e, ed) => cmd.clearCell(e, ed, parser)));

    ctx.subscriptions.push(registerTableCommand('text-tables.gotoNextCell', async (editor, range, table) => {
        await cmd.gotoNextCell(editor, range, table, stringifier);
    }));

    ctx.subscriptions.push(registerTableCommand('text-tables.gotoPreviousCell', cmd.gotoPreviousCell, {format: true}));
    ctx.subscriptions.push(registerTableCommand('text-tables.nextRow', async (editor, range, table) => {
        await cmd.nextRow(editor, range, table, stringifier);
    }));

    // Format table under cursor
    ctx.subscriptions.push(registerTableCommand('text-tables.formatUnderCursor',
        (editor, range, table) => cmd.formatUnderCursor(editor, range, table, stringifier)));

    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('text-tables.createTable', async editor => {
        const opts: vscode.InputBoxOptions = {
            value: '5x2',
            prompt: 'Table size Columns x Rows (e.g. 5x2)',
            validateInput: (value: string) => {
                if (!utils.tableSizeRe.test(value)) {
                    return 'Provided value is invalid. Please provide the value in format Columns x Rows (e.g. 5x2)';
                }
                return;
            }
        };

        const size = await vscode.window.showInputBox(opts);
        if (size) {
            const match = size.match(utils.tableSizeRe);
            if (match) {
                const cols = +match[1] || 1;
                const rows = +match[2] || 2;
                cmd.createTable(rows, cols, editor, stringifier);
            }
        }
    }));
}

export function deactivate() {
}

type TableCommandCallback = (editor: vscode.TextEditor, tableLocation: vscode.Range, table: Table) => Thenable<void>;

function registerTableCommand(command: string, callback: TableCommandCallback, options?: {format: boolean}) {
    return vscode.commands.registerCommand(command, async () => {
        const editor = vscode.window.activeTextEditor;

        if (isUndefined(editor)) {
            console.log('Debug: No active editor');
            return;
        }

        console.log('Debug: Command', command, 'called on line', editor.selection.start.line);

        const tableRange = locator.locate(editor.document, editor.selection.start.line);
        console.log('Debug: Table range:', tableRange);
        
        if (isUndefined(tableRange)) {
            console.log('Debug: No table range found');
            return;
        }
        
        // For single-line tables, ensure we always capture the entire line
        let adjustedTableRange = tableRange;
        if (tableRange.start.line === tableRange.end.line) {
            const line = editor.document.lineAt(tableRange.start.line);
            const lineText = line.text.trim();
            if (lineText.startsWith('|')) {
                console.log('Debug: Single-line table detected, adjusting range to entire line');
                adjustedTableRange = new vscode.Range(
                    new vscode.Position(tableRange.start.line, 0),
                    new vscode.Position(tableRange.end.line, line.text.length)
                );
                console.log('Debug: Adjusted table range:', adjustedTableRange);
            }
        }
        
        const selectedText = editor.document.getText(adjustedTableRange);
        console.log('Debug: Selected text for parsing:', JSON.stringify(selectedText));
        
        const table = parser.parse(selectedText);
        console.log('Debug: Parsed table:', table ? {rows: table.rows.length, cols: table.cols.length} : 'null');

        if (isUndefined(table)) {
            console.log('Debug: Failed to parse table');
            return;
        }

        table.startLine = adjustedTableRange.start.line;
        console.log('Debug: Table startLine set to:', table.startLine);

        if (options && options.format) {
            await cmd.formatUnderCursor(editor, adjustedTableRange, table, stringifier);
        }

        await callback(editor, adjustedTableRange, table);
    });
}
