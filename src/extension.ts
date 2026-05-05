import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';


const exec = util.promisify(cp.exec);

let activePanel: vscode.WebviewPanel | undefined;

function getWebviewPanel(title: string): vscode.WebviewPanel {
	if (activePanel) {
		activePanel.title = title;
		activePanel.reveal(vscode.ViewColumn.One);
	} else {
		activePanel = vscode.window.createWebviewPanel(
			'ycodeAI',
			title,
			vscode.ViewColumn.Beside, // Open in a split tab
			{ enableScripts: true }
		);
		activePanel.onDidDispose(() => {
			activePanel = undefined;
		});
	}
	return activePanel;
}

function updateWebview(panel: vscode.WebviewPanel, contentHtml: string) {
	panel.webview.html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<style>
				body {
					font-family: var(--vscode-font-family);
					padding: 20px 40px;
					line-height: 1.6;
					color: var(--vscode-editor-foreground);
					background-color: var(--vscode-editor-background);
					max-width: 900px;
					margin: 0 auto;
				}
				h1, h2, h3 {
					color: var(--vscode-editor-foreground);
					border-bottom: 1px solid var(--vscode-panel-border);
					padding-bottom: 8px;
					margin-top: 24px;
				}
				pre {
					background-color: var(--vscode-textCodeBlock-background);
					padding: 16px;
					border-radius: 6px;
					overflow-x: auto;
				}
				code {
					font-family: var(--vscode-editor-font-family);
				}
				p > code, li > code {
					background-color: var(--vscode-textCodeBlock-background);
					padding: 2px 4px;
					border-radius: 4px;
				}
				blockquote {
					border-left: 4px solid var(--vscode-textLink-foreground);
					padding: 10px 16px;
					margin-left: 0;
					color: var(--vscode-textBlockQuote-foreground);
					background: var(--vscode-textBlockQuote-background);
				}
				.loading {
					display: flex;
					align-items: center;
					gap: 12px;
					font-size: 16px;
					color: var(--vscode-descriptionForeground);
					margin-top: 40px;
				}
				.spinner {
					width: 24px;
					height: 24px;
					border: 3px solid var(--vscode-panel-border);
					border-top: 3px solid var(--vscode-textLink-foreground);
					border-radius: 50%;
					animation: spin 1s linear infinite;
				}
				@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
			</style>
		</head>
		<body>
			${contentHtml}
		</body>
		</html>
	`;
}

function generateTree(dir: string, prefix = '', depth = 0, maxDepth = 4): string {
	if (depth > maxDepth) return '';
	
	let items: fs.Dirent[] = [];
	try {
		items = fs.readdirSync(dir, { withFileTypes: true });
	} catch (e) {
		return '';
	}

	const ignoreList = ['node_modules', '.git', 'dist', 'out', 'build', '.vscode', '.expo'];
	const filteredItems = items.filter(item => !ignoreList.includes(item.name));

	// Sort directories first, then files
	filteredItems.sort((a, b) => {
		if (a.isDirectory() && !b.isDirectory()) return -1;
		if (!a.isDirectory() && b.isDirectory()) return 1;
		return a.name.localeCompare(b.name);
	});

	let treeStr = '';
	filteredItems.forEach((item, index) => {
		const isLast = index === filteredItems.length - 1;
		const connector = isLast ? '└── ' : '├── ';
		treeStr += `${prefix}${connector}${item.name}\n`;
		
		if (item.isDirectory()) {
			const newPrefix = prefix + (isLast ? '    ' : '│   ');
			treeStr += generateTree(path.join(dir, item.name), newPrefix, depth + 1, maxDepth);
		}
	});
	return treeStr;
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "Ycode" is now active!');

	const outputChannel = vscode.window.createOutputChannel('Ycode AI');
	context.subscriptions.push(outputChannel);

	// Create a Status Bar Item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'ycode.showMenu';
	statusBarItem.text = '$(sparkle) Ycode AI';
	statusBarItem.tooltip = 'Click to show Ycode AI commands';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Register a command to show a quick pick menu when the status bar item is clicked
	const showMenuCommand = vscode.commands.registerCommand('ycode.showMenu', async () => {
		const selection = await vscode.window.showQuickPick([
			{ label: '$(git-pull-request) Explain Recent Changes', description: 'Analyze your uncommitted git diffs', target: 'ycode.explainChanges' },
			{ label: '$(file-directory) Explain Architecture', description: 'Analyze the project folder structure', target: 'ycode.explainArchitecture' }
		], { placeHolder: 'What would you like Ycode AI to do?' });

		if (selection) {
			vscode.commands.executeCommand(selection.target);
		}
	});
	context.subscriptions.push(showMenuCommand);

	const explainChangesCommand = vscode.commands.registerCommand('ycode.explainChanges', async () => {
		const config = vscode.workspace.getConfiguration('ycode');
		const apiKey = config.get<string>('explainApiKey');

		if (!apiKey) {
			vscode.window.showErrorMessage('Please configure your Ycode Explain API key in settings.');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace folder open.');
			return;
		}

		const cwd = workspaceFolders[0].uri.fsPath;

		try {
			// 1. Quick check to see if there are any changes at all
			const { stdout: diffCheck } = await exec('git diff HEAD', { cwd });
			if (!diffCheck.trim()) {
				vscode.window.showInformationMessage('No recent changes found to explain.');
				return;
			}

			// 2. Ask the user what kind of explanation they want
			const actionSelection = await vscode.window.showQuickPick([
				{ label: '$(book) Summary', description: 'Get a brief overview of all changes', id: 'summary' },
				{ label: '$(list-flat) Every file', description: 'Get a detailed file-by-file breakdown', id: 'every-file' },
				{ label: '$(question) Query', description: 'Ask a specific question about a changed file', id: 'query' }
			], { placeHolder: 'How would you like to analyze your changes?' });

			if (!actionSelection) {
				return; // User cancelled
			}

			const panel = getWebviewPanel(`Ycode AI: ${actionSelection.label}`);
			updateWebview(panel, '<div class="loading"><div class="spinner"></div><span>Gathering data and analyzing...</span></div>');

			let prompt = '';
			let finalDiff = '';

			if (actionSelection.id === 'summary') {
				finalDiff = diffCheck;
				prompt = `You are an expert software developer. Give a high-level, easy-to-understand summary of the overall purpose of these code changes. Do not go line-by-line.\n\nDiff:\n${finalDiff}`;
			} else if (actionSelection.id === 'every-file') {
				finalDiff = diffCheck;
				prompt = `You are an expert software developer. Go through the following git diff file by file and explain in detail what changed in each file and why it might have been changed.\n\nDiff:\n${finalDiff}`;
			} else if (actionSelection.id === 'query') {
				// Get list of changed files
				const { stdout: filesChanged } = await exec('git diff --name-only HEAD', { cwd });
				const filesList = filesChanged.split('\n').map(f => f.trim()).filter(f => f.length > 0);

				if (filesList.length === 0) {
					vscode.window.showErrorMessage('No files found.');
					return;
				}

				const selectedFile = await vscode.window.showQuickPick(filesList, {
					placeHolder: 'Select a file to query'
				});

				if (!selectedFile){
					return;
				}

				const userQuestion = await vscode.window.showInputBox({
					prompt: `What is your doubt or question about ${selectedFile}?`,
					placeHolder: 'e.g. Why was this function removed?'
				});

				if (!userQuestion) {
					return;
				}

				// Get diff for just that file
				const { stdout: specificDiff } = await exec(`git diff HEAD -- "${selectedFile}"`, { cwd });
				finalDiff = specificDiff;
				
				prompt = `You are an expert software developer. A user has a question about the recent changes to the file "${selectedFile}".\n\nUser Question: ${userQuestion}\n\nFile Diff:\n${finalDiff}\n\nPlease answer the user's question clearly.`;
				updateWebview(panel, '<div class="loading"><div class="spinner"></div><span>Thinking about your question...</span></div>');
			}

			const { GoogleGenAI } = await import('@google/genai');
			const ai = new GoogleGenAI({ apiKey: apiKey });

			const response = await ai.models.generateContent({
				model: 'gemini-2.5-flash-lite',
				contents: prompt,
			});

			if (response.text) {
				const { marked } = await import('marked');
				const parsedHtml = await marked.parse(response.text);
				updateWebview(panel, parsedHtml);
				vscode.window.showInformationMessage('Explanation complete!');
			} else {
				updateWebview(panel, '<h3>Error</h3><p>Failed to generate an explanation.</p>');
				vscode.window.showErrorMessage('Failed to generate an explanation.');
			}
			
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to retrieve or explain changes: ${error.message || error}`);
			console.error(error);
		}
	});

	const explainArchitectureCommand = vscode.commands.registerCommand('ycode.explainArchitecture', async () => {
		const config = vscode.workspace.getConfiguration('ycode');
		const apiKey = config.get<string>('architectureApiKey');

		if (!apiKey) {
			vscode.window.showErrorMessage('Please configure your Ycode Architecture API key in settings.');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace folder open.');
			return;
		}

		const cwd = workspaceFolders[0].uri.fsPath;
		
		const panel = getWebviewPanel('Ycode AI: Architecture Analysis');
		updateWebview(panel, '<div class="loading"><div class="spinner"></div><span>Scanning workspace and analyzing architecture...</span></div>');

		try {
			// Generate the tree
			const tree = generateTree(cwd);
			
			// Try to read package.json dependencies
			let dependenciesStr = '';
			const packageJsonPath = path.join(cwd, 'package.json');
			if (fs.existsSync(packageJsonPath)) {
				try {
					const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
					const deps = { ...pkg.dependencies, ...pkg.devDependencies };
					if (Object.keys(deps).length > 0) {
						dependenciesStr = `\n\nProject Dependencies:\n${JSON.stringify(deps, null, 2)}`;
					}
				} catch (e) {
					// Ignore parsing errors
				}
			}

			const prompt = `You are an expert software architect. Below is the directory structure of my project, along with its dependencies (if any).
Please explain the overall architecture, what this project likely does, and give a detailed insight into how the code is organized and working based on this structure.

Directory Structure:
${tree}${dependenciesStr}`;

			const { GoogleGenAI } = await import('@google/genai');
			const ai = new GoogleGenAI({ apiKey: apiKey });

			const response = await ai.models.generateContent({
				model: 'gemini-2.5-flash-lite',
				contents: prompt,
			});

			if (response.text) {
				const { marked } = await import('marked');
				const parsedHtml = await marked.parse(response.text);
				updateWebview(panel, parsedHtml);
				vscode.window.showInformationMessage('Architecture analysis complete!');
			} else {
				updateWebview(panel, '<h3>Error</h3><p>Failed to generate an explanation.</p>');
				vscode.window.showErrorMessage('Failed to generate an explanation.');
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to analyze architecture: ${error.message || error}`);
			console.error(error);
			updateWebview(panel, `<h3>Error</h3><p>${error.message || error}</p>`);
		}
	});

	context.subscriptions.push(explainChangesCommand, explainArchitectureCommand);
}

export function deactivate() {}
