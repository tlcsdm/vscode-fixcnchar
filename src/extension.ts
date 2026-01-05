import * as vscode from 'vscode';

let realtimeDisposable: vscode.Disposable | undefined;
// Track documents currently being processed to prevent recursive triggering
const processingDocuments = new Set<vscode.TextDocument>();

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

    realtimeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        // Prevent recursive triggering for this document
        if (processingDocuments.has(event.document)) {
            return;
        }

        if (!isRealtimeEnabled()) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) {
            return;
        }

        // Get fresh rules on each change to support dynamic configuration updates
        const rules = getRules();

        // Process each change - find the first Chinese character that needs replacement
        for (const change of event.contentChanges) {
            // Process single character changes (both insertions and replacements for IME support)
            if (change.text.length !== 1) {
                continue;
            }

            const inputChar = change.text;
            const replacement = rules.get(inputChar);

            if (replacement) {
                // For text changes, the new text starts at change.range.start
                const startPos = change.range.start;
                const endPos = startPos.translate(0, 1);
                const replaceRange = new vscode.Range(startPos, endPos);

                // Set flag to prevent recursive triggering for this document
                processingDocuments.add(event.document);

                // Use setTimeout with minimal delay to ensure we're outside the event handler
                // This is necessary because VS Code may reject edits made during the change event
                setTimeout(() => {
                    try {
                        // Verify editor is still valid
                        const currentEditor = vscode.window.activeTextEditor;
                        if (!currentEditor || currentEditor.document !== event.document) {
                            processingDocuments.delete(event.document);
                            return;
                        }

                        // Perform the replacement
                        currentEditor.edit((editBuilder) => {
                            editBuilder.replace(replaceRange, replacement);
                        }, { undoStopBefore: false, undoStopAfter: true }).then((success) => {
                            processingDocuments.delete(event.document);
                            if (!success) {
                                console.error('Fix Chinese Characters: Edit failed');
                            }
                        });
                    } catch (error) {
                        processingDocuments.delete(event.document);
                        console.error('Fix Chinese Characters: Error during replacement', error);
                    }
                }, 1);

                // Only process one replacement per event
                break;
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

    context.subscriptions.push(replaceSelectionCmd, replaceDocumentCmd);

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
