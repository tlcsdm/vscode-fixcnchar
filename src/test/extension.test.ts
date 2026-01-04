import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('tlcsdm.vscode-fixcnchar'));
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('tlcsdm.fixcnchar.replaceSelection'));
        assert.ok(commands.includes('tlcsdm.fixcnchar.replaceDocument'));
    });

    test('Configuration should have default values', () => {
        const config = vscode.workspace.getConfiguration('tlcsdm.fixcnchar');
        assert.strictEqual(config.get('enableRealtime'), true);
        const rules = config.get<Record<string, string>>('rules');
        assert.ok(rules);
        assert.strictEqual(rules['，'], ',');
        assert.strictEqual(rules['。'], '.');
    });
});
