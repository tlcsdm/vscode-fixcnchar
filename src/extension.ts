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

        // Collect replacements across all changes (handles multi-character inserts)
        const pendingEdits: Array<{ offset: number; oldText: string; newText: string }> = [];

        for (const change of event.contentChanges) {
            if (!change.text) {
                continue;
            }

            const newText = applyRules(change.text, rules);
            if (newText === change.text) {
                continue;
            }

            // Capture location using offsets so we can re-verify later
            const offset = event.document.offsetAt(change.range.start);
            const endOffset = offset + change.text.length;
            const currentRange = new vscode.Range(
                change.range.start,
                event.document.positionAt(endOffset)
            );

            // Ensure the document still contains the original change text before queuing edit
            if (event.document.getText(currentRange) !== change.text) {
                continue;
            }

            pendingEdits.push({ offset, oldText: change.text, newText });
        }

        if (pendingEdits.length === 0) {
            return;
        }

        processingDocuments.add(event.document);

        // Defer to avoid interfering with the in-flight change event
        setTimeout(async () => {
            try {
                const currentEditor = vscode.window.activeTextEditor;
                if (!currentEditor || currentEditor.document !== event.document) {
                    return;
                }

                const document = currentEditor.document;
                const editsToApply: Array<{ range: vscode.Range; newText: string }> = [];

                for (const { offset, oldText, newText } of pendingEdits) {
                    const start = document.positionAt(offset);
                    const end = document.positionAt(offset + oldText.length);
                    const range = new vscode.Range(start, end);

                    // Skip if the text has since changed
                    if (document.getText(range) !== oldText) {
                        continue;
                    }

                    editsToApply.push({ range, newText });
                }

                if (editsToApply.length === 0) {
                    return;
                }

                const success = await currentEditor.edit((editBuilder) => {
                    for (const edit of editsToApply) {
                        editBuilder.replace(edit.range, edit.newText);
                    }
                }, { undoStopBefore: false, undoStopAfter: true });

                if (!success) {
                    console.error('Fix Chinese Characters: Edit failed');
                }
            } catch (error) {
                console.error('Fix Chinese Characters: Error during replacement', error);
            } finally {
                processingDocuments.delete(event.document);
            }
        }, 0);
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
