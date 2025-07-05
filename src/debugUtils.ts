import * as vscode from 'vscode';

export function debugCursorMovement(editor: vscode.TextEditor, targetLine: number, targetChar: number): boolean {
    console.log('=== CURSOR MOVEMENT DEBUG ===');
    console.log('Current document line count:', editor.document.lineCount);
    console.log('Target position:', targetLine, targetChar);
    
    if (targetLine >= 0 && targetLine < editor.document.lineCount) {
        const targetLineText = editor.document.lineAt(targetLine).text;
        console.log('Target line text:', JSON.stringify(targetLineText));
        console.log('Target line length:', targetLineText.length);
        
        let adjustedTargetChar = targetChar;
        if (targetChar > targetLineText.length) {
            console.log('WARNING: Target character position exceeds line length!');
            console.log('Adjusting to end of line...');
            adjustedTargetChar = targetLineText.length;
        }
        
        const targetPos = new vscode.Position(targetLine, adjustedTargetChar);
        editor.selection = new vscode.Selection(targetPos, targetPos);
        
        console.log('Cursor set to:', editor.selection.start.line, editor.selection.start.character);
        console.log('=== END DEBUG ===');
        
        return true;
    } else {
        console.log('ERROR: Target line is out of bounds!');
        console.log('=== END DEBUG ===');
        return false;
    }
}
