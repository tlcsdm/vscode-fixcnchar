import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
let realtimeDisposable: vscode.Disposable | undefined;

/**
 * Get replacement rules from configuration
 */
function getRules(): Map<string, string> {
    const config = vscode.workspace.getConfiguration('tlcsdm.fixcnchar');
    const rulesObj = config.get<Record<string, string>>('rules', {});
    return new Map(Object.entries(rulesObj));
}

/**
 * Check if real-time replacement is enabled
 */
function isRealtimeEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('tlcsdm.fixcnchar');
    return config.get<boolean>('enableRealtime', true);
}

/**
 * Apply replacement rules to text
 */
function applyRules(text: string, rules: Map<string, string>): string {
    let result = text;
    for (const [chinese, english] of rules) {
        result = result.split(chinese).join(english);
    }
    return result;
}

/**
 * Register real-time replacement listener
 */
function registerRealtimeListener(context: vscode.ExtensionContext): void {
    // Dispose existing listener if any
    if (realtimeDisposable) {
        realtimeDisposable.dispose();
    }

    if (!isRealtimeEnabled()) {
        return;
    }

    const rules = getRules();

    realtimeDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (!isRealtimeEnabled()) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) {
            return;
        }

        // Process each change
        for (const change of event.contentChanges) {
            // Only process single character insertions
            if (change.text.length !== 1 || change.rangeLength !== 0) {
                continue;
            }

            const inputChar = change.text;
            const replacement = rules.get(inputChar);

            if (replacement) {
                const position = change.range.start;
                const replaceRange = new vscode.Range(
                    position,
                    position.translate(0, 1)
                );

                // Use edit to replace the character (supports undo/redo)
                await editor.edit((editBuilder) => {
                    editBuilder.replace(replaceRange, replacement);
                }, { undoStopBefore: false, undoStopAfter: false });
            }
        }
    });

    context.subscriptions.push(realtimeDisposable);
}

/**
 * Replace Chinese punctuation in selection
 */
async function replaceInSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor');
        return;
    }

    const rules = getRules();
    const selection = editor.selection;

    if (selection.isEmpty) {
        // If no selection, replace in the entire document
        await replaceInDocument();
        return;
    }

    const text = editor.document.getText(selection);
    const replaced = applyRules(text, rules);

    if (text !== replaced) {
        await editor.edit((editBuilder) => {
            editBuilder.replace(selection, replaced);
        });
        vscode.window.showInformationMessage('Chinese punctuation replaced in selection');
    } else {
        vscode.window.showInformationMessage('No Chinese punctuation found in selection');
    }
}

/**
 * Replace Chinese punctuation in entire document
 */
async function replaceInDocument(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor');
        return;
    }

    const rules = getRules();
    const document = editor.document;
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );
    const text = document.getText();
    const replaced = applyRules(text, rules);

    if (text !== replaced) {
        await editor.edit((editBuilder) => {
            editBuilder.replace(fullRange, replaced);
        });
        vscode.window.showInformationMessage('Chinese punctuation replaced in document');
    } else {
        vscode.window.showInformationMessage('No Chinese punctuation found in document');
    }
}

/**
 * Upgrade VSCode version
 */
async function upgradeVSCodeVersion(): Promise<void> {
    try {
        // Find workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder opened');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const packageJsonPath = path.join(workspaceRoot, 'package.json');

        // Check if package.json exists
        if (!fs.existsSync(packageJsonPath)) {
            vscode.window.showErrorMessage('package.json not found in workspace root');
            return;
        }

        // Read current package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const currentVersion = packageJson.engines?.vscode?.replace('^', '').replace('~', '') || 'unknown';

        // Prompt user for new version
        const newVersion = await vscode.window.showInputBox({
            prompt: `Enter the target VSCode version (current: ${currentVersion})`,
            placeHolder: 'e.g., 1.95.0',
            value: currentVersion,
            validateInput: (value: string) => {
                // Basic version validation
                const versionRegex = /^\d+\.\d+\.\d+$/;
                if (!versionRegex.test(value)) {
                    return 'Please enter a valid version number (e.g., 1.95.0)';
                }
                return null;
            }
        });

        if (!newVersion) {
            // User cancelled
            return;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Upgrading VSCode version to ${newVersion}`,
            cancellable: false
        }, async (progress) => {
            // Update package.json
            progress.report({ message: 'Updating package.json...' });
            
            if (packageJson.engines) {
                packageJson.engines.vscode = `^${newVersion}`;
            }
            
            if (packageJson.devDependencies && packageJson.devDependencies['@types/vscode']) {
                packageJson.devDependencies['@types/vscode'] = `^${newVersion}`;
            }

            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

            // Run npm install to update package-lock.json
            progress.report({ message: 'Running npm install...' });
            
            try {
                const { stderr } = await execAsync('npm install', { 
                    cwd: workspaceRoot,
                    maxBuffer: 10 * 1024 * 1024  // 10MB buffer
                });
                
                if (stderr && !stderr.includes('npm warn')) {
                    console.error('npm install stderr:', stderr);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`npm install failed: ${errorMessage}`);
            }

            return Promise.resolve();
        });

        vscode.window.showInformationMessage(
            `VSCode version upgraded to ${newVersion}. Please reload the window to apply changes.`,
            'Reload Window'
        ).then(selection => {
            if (selection === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to upgrade VSCode version: ${errorMessage}`);
    }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register commands
    const replaceSelectionCmd = vscode.commands.registerCommand(
        'tlcsdm.fixcnchar.replaceSelection',
        replaceInSelection
    );
    const replaceDocumentCmd = vscode.commands.registerCommand(
        'tlcsdm.fixcnchar.replaceDocument',
        replaceInDocument
    );
    const upgradeVersionCmd = vscode.commands.registerCommand(
        'tlcsdm.fixcnchar.upgradeVSCodeVersion',
        upgradeVSCodeVersion
    );

    context.subscriptions.push(replaceSelectionCmd, replaceDocumentCmd, upgradeVersionCmd);

    // Register real-time listener
    registerRealtimeListener(context);

    // Listen for configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('tlcsdm.fixcnchar')) {
            registerRealtimeListener(context);
        }
    });

    context.subscriptions.push(configChangeDisposable);

    console.log('Fix Chinese Characters extension is now active');
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    if (realtimeDisposable) {
        realtimeDisposable.dispose();
    }
}
