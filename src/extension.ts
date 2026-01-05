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
                const line = startPos.line;
                const character = startPos.character;
                const docUri = event.document.uri;
                const expectedChar = inputChar; // Capture for use in async callback

                // Set flag to prevent recursive triggering for this document
                processingDocuments.add(event.document);

                // Use Promise.resolve().then() to ensure we're in a new microtask
                // This is more reliable than setTimeout for immediate deferred execution
                Promise.resolve().then(async () => {
                    try {
                        // Get the document by URI (more reliable than checking active editor)
                        const currentDoc = vscode.workspace.textDocuments.find(
                            doc => doc.uri.fsPath === docUri.fsPath
                        );
                        
                        if (!currentDoc) {
                            return;
                        }

                        // Verify the character at the position is still what we expect to replace
                        if (line >= currentDoc.lineCount) {
                            return;
                        }
                        
                        const currentLine = currentDoc.lineAt(line);
                        if (character >= currentLine.text.length) {
                            return;
                        }

                        const currentChar = currentLine.text.charAt(character);
                        if (currentChar !== expectedChar) {
                            // Character has changed, skip replacement
                            return;
                        }

                        // Create the range for replacement
                        const replaceRange = new vscode.Range(
                            new vscode.Position(line, character),
                            new vscode.Position(line, character + 1)
                        );

                        // Use WorkspaceEdit for reliable editing
                        const workspaceEdit = new vscode.WorkspaceEdit();
                        workspaceEdit.replace(docUri, replaceRange, replacement);
                        
                        const success = await vscode.workspace.applyEdit(workspaceEdit);
                        
                        if (!success) {
                            console.error('Fix Chinese Characters: Edit failed');
                        }
                    } catch (error) {
                        console.error('Fix Chinese Characters: Error during replacement', error);
                    } finally {
                        processingDocuments.delete(event.document);
                    }
                });

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
