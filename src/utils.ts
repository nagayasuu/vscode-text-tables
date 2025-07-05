export const tableSizeRe = /^(\d+)x(\d+)$/u;

/**
 * Calculate the display width of a string, considering wide characters (CJK)
 * Full-width characters (like Japanese, Chinese, Korean) take 2 columns
 * Half-width characters take 1 column
 */
export function getStringWidth(str: string): number {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        
        // Check for wide characters (CJK characters and other full-width characters)
        if (isWideCharacter(code)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

/**
 * Check if a character code represents a wide character
 */
function isWideCharacter(code: number): boolean {
    // CJK Unified Ideographs (Chinese, Japanese, Korean)
    if (code >= 0x4E00 && code <= 0x9FFF) {
        return true;
    }
    
    // Hiragana
    if (code >= 0x3040 && code <= 0x309F) {
        return true;
    }
    
    // Katakana
    if (code >= 0x30A0 && code <= 0x30FF) {
        return true;
    }
    
    // Full-width Latin characters
    if (code >= 0xFF01 && code <= 0xFF5E) {
        return true;
    }
    
    // CJK Symbols and Punctuation
    if (code >= 0x3000 && code <= 0x303F) {
        return true;
    }
    
    // Additional CJK ranges
    if (code >= 0x3400 && code <= 0x4DBF) {
        return true; // CJK Extension A
    }
    if (code >= 0x20000 && code <= 0x2A6DF) {
        return true; // CJK Extension B
    }
    if (code >= 0x2A700 && code <= 0x2B73F) {
        return true; // CJK Extension C
    }
    if (code >= 0x2B740 && code <= 0x2B81F) {
        return true; // CJK Extension D
    }
    if (code >= 0x2B820 && code <= 0x2CEAF) {
        return true; // CJK Extension E
    }
    
    return false;
}

/**
 * Pad a string to a specific display width
 */
export function padString(str: string, targetWidth: number, char: string = ' '): string {
    const currentWidth = getStringWidth(str);
    const paddingNeeded = Math.max(0, targetWidth - currentWidth);
    return str + char.repeat(paddingNeeded);
}

/**
 * Debug function to analyze table structure and cursor positions
 */
export function analyzeTableLine(_line: string): void {
    // Debug function - implementation removed for production
}
