import * as vscode from 'vscode';

export function debugCursorMovement(editor: vscode.TextEditor, targetLine: number, targetChar: number): boolean {
    if (targetLine >= 0 && targetLine < editor.document.lineCount) {
        const targetLineText = editor.document.lineAt(targetLine).text;
        
        let adjustedTargetChar = targetChar;
        if (targetChar > targetLineText.length) {
            adjustedTargetChar = targetLineText.length;
        }
        
        const targetPos = new vscode.Position(targetLine, adjustedTargetChar);
        editor.selection = new vscode.Selection(targetPos, targetPos);
        
        return true;
    } else {
        return false;
    }
}
