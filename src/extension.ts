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

    realtimeDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
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

        // Collect all replacements to apply
        const replacements: { range: vscode.Range; replacement: string }[] = [];
        
        // Process each change
        for (const change of event.contentChanges) {
            // Process single character changes (both insertions and replacements for IME support)
            if (change.text.length !== 1) {
                continue;
            }

            const inputChar = change.text;
            const replacement = rules.get(inputChar);

            if (replacement) {
                // After the change, the character is at change.range.start
                const position = change.range.start;
                const replaceRange = new vscode.Range(
                    position,
                    position.translate(0, 1)
                );
                replacements.push({ range: replaceRange, replacement });
            }
        }
        
        // Apply all replacements if any
        if (replacements.length > 0) {
            // Sort replacements by position in reverse order to avoid position shift issues
            replacements.sort((a, b) => b.range.start.compareTo(a.range.start));
            
            // Set flag to prevent recursive triggering for this document
            processingDocuments.add(event.document);
            try {
                // Use edit to replace the characters (supports undo/redo)
                // undoStopBefore: false groups this edit with the previous typing action
                // undoStopAfter: true allows normal undo after this edit
                await editor.edit((editBuilder) => {
                    for (const { range, replacement } of replacements) {
                        editBuilder.replace(range, replacement);
                    }
                }, { undoStopBefore: false, undoStopAfter: true });
            } finally {
                processingDocuments.delete(event.document);
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
