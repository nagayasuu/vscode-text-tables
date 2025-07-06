'use strict';

import * as vscode from 'vscode';
import * as utils from './utils';
import * as cmd from './commands';
import { OrgLocator, OrgParser, OrgStringifier } from './ttOrg';
import { Locator, Parser, Stringifier, Table } from './ttTable';
import { MarkdownLocator, MarkdownParser, MarkdownStringifier } from './ttMarkdown';
import { restoreContext } from './context';
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

    vscode.workspace.onDidChangeConfiguration(() => {
        loadConfiguration();
    });

    vscode.window.onDidChangeActiveTextEditor(e => {
        if (e) {
            restoreContext(e);
        }
    });

    ctx.subscriptions.push(vscode.commands.registerCommand('text-tables.enable', () => {
        vscode.window.showInformationMessage('Text tables enabled!');
    }));

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

    ctx.subscriptions.push(registerTableCommand('text-tables.gotoPreviousCell', async (editor, range, table) => {
        await cmd.gotoPreviousCell(editor, range, table, stringifier);
    }));
    ctx.subscriptions.push(registerTableCommand('text-tables.nextRow', async (editor, range, table) => {
        await cmd.nextRow(editor, range, table, stringifier);
    }));

    // Intelligent Tab handler
    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('text-tables.handleTabKey', async editor => {
        await cmd.handleTabKey(editor, locator, parser, stringifier);
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

        if (editor === undefined) {
            return;
        }

        // For navigation commands, check if we're in a table context first
        if ((command.includes('nextRow') || command.includes('gotoNextCell') || command.includes('gotoPreviousCell')) && 
            !cmd.isInTable(editor)) {
            
            // Special case: Tab on incomplete table line should format it
            if (command.includes('gotoNextCell')) {
                const currentLine = editor.document.lineAt(editor.selection.start.line);
                const lineText = currentLine.text.trim();
                
                // Check if it's an incomplete table line like "|test|test"
                if (lineText.startsWith('|') && !lineText.endsWith('|') && lineText.includes('|', 1)) {
                    await cmd.formatIncompleteTableLine(editor, currentLine);
                    return;
                }
                
                // Execute normal tab behavior
                await vscode.commands.executeCommand('type', { text: '\t' });
                return;
            }
            
            // For nextRow (Enter), execute normal newline
            if (command.includes('nextRow')) {
                await vscode.commands.executeCommand('type', { text: '\n' });
                return;
            }
            
            // For gotoPreviousCell (Shift+Tab), execute normal outdent
            if (command.includes('gotoPreviousCell')) {
                await vscode.commands.executeCommand('outdent');
                return;
            }
            
            return;
        }

        const tableRange = locator.locate(editor.document, editor.selection.start.line);
        
        if (tableRange === undefined) {
            return;
        }
        
        // For single-line tables, ensure we always capture the entire line
        let adjustedTableRange = tableRange;
        if (tableRange.start.line === tableRange.end.line) {
            const line = editor.document.lineAt(tableRange.start.line);
            const lineText = line.text.trim();
            if (lineText.startsWith('|')) {
                adjustedTableRange = new vscode.Range(
                    new vscode.Position(tableRange.start.line, 0),
                    new vscode.Position(tableRange.end.line, line.text.length)
                );
            }
        }
        
        const selectedText = editor.document.getText(adjustedTableRange);
        const table = parser.parse(selectedText);

        if (table === undefined) {
            return;
        }

        table.startLine = adjustedTableRange.start.line;

        if (options && options.format) {
            await cmd.formatUnderCursor(editor, adjustedTableRange, table, stringifier);
        }

        await callback(editor, adjustedTableRange, table);
    });
}
