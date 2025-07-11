import * as path from 'path';

// Alternative import method for better compatibility
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './index');

        const testWorkspace = path.resolve(__dirname, '../../e2e');


        // Download VS Code, unzip it and run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [testWorkspace]});
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();

