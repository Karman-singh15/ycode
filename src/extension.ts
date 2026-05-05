import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';


const exec = util.promisify(cp.exec);

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

			outputChannel.appendLine(`\n--- Ycode AI: ${actionSelection.label} ---`);
			outputChannel.show();
			vscode.window.showInformationMessage('Gathering data and analyzing...');

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
				outputChannel.appendLine(`File: ${selectedFile}\nQuestion: ${userQuestion}\n`);
			}

			const { GoogleGenAI } = await import('@google/genai');
			const ai = new GoogleGenAI({ apiKey: apiKey });

			const response = await ai.models.generateContent({
				model: 'gemini-2.5-flash-lite',
				contents: prompt,
			});

			if (response.text) {
				outputChannel.appendLine('');
				outputChannel.appendLine(response.text);
				vscode.window.showInformationMessage('Explanation complete! Check the Ycode AI Output panel.');
			} else {
				vscode.window.showErrorMessage('Failed to generate an explanation.');
			}
			
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to retrieve or explain changes: ${error.message || error}`);
			console.error(error);
		}
	});

	const explainArchitectureCommand = vscode.commands.registerCommand('ycode.explainArchitecture', () => {
		const config = vscode.workspace.getConfiguration('ycode');
		const apiKey = config.get<string>('architectureApiKey');

		if (!apiKey) {
			vscode.window.showErrorMessage('Please configure your Ycode Architecture API key in settings.');
			return;
		}

		vscode.window.showInformationMessage('Analyzing project architecture...');
	});

	context.subscriptions.push(explainChangesCommand, explainArchitectureCommand);
}

export function deactivate() {}
