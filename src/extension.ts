import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';


const exec = util.promisify(cp.exec);

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "Ycode" is now active!');

	const outputChannel = vscode.window.createOutputChannel('Ycode AI');
	context.subscriptions.push(outputChannel);

	const explainChangesCommand = vscode.commands.registerCommand('ycode.explainChanges', async () => {
		vscode.window.showInformationMessage('Gathering recent changes to explain...');
		
		const config = vscode.workspace.getConfiguration('ycode');
		const apiKey = config.get<string>('apiKey');

		if (!apiKey) {
			vscode.window.showErrorMessage('Please configure your Ycode API key in settings.');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace folder open.');
			return;
		}

		const cwd = workspaceFolders[0].uri.fsPath;
		try {
			// Get uncommitted changes (both staged and unstaged) compared to HEAD
			const { stdout, stderr } = await exec('git diff HEAD', { cwd });
			
			if (stderr) {
				console.error('Git diff error:', stderr);
			}

			if (!stdout.trim()) {
				vscode.window.showInformationMessage('No recent changes found to explain.');
				return;
			}

			outputChannel.appendLine('--- Recent Changes ---');
			outputChannel.appendLine(stdout);
			outputChannel.appendLine('\n--- Explaining Changes (via AI) ---');
			outputChannel.show();

			const { GoogleGenAI } = await import('@google/genai');
			const ai = new GoogleGenAI({ apiKey: apiKey });
			const prompt = `You are an expert software developer. Explain the following git diff in simple, easy-to-understand language. Focus on the 'why' and 'what changed', rather than just narrating the code line by line.\n\nDiff:\n${stdout}`;

			const response = await ai.models.generateContent({
				model: 'gemini-2.5-flash',
				contents: prompt,
			});

			if (response.text) {
				outputChannel.appendLine(response.text);
				vscode.window.showInformationMessage('Explanation complete! Check the Ycode AI Output panel.');
			} else {
				vscode.window.showErrorMessage('Failed to generate an explanation.');
			}
			
		} catch (error) {
			vscode.window.showErrorMessage('Failed to retrieve or explain changes.');
			console.error(error);
		}
	});

	const explainArchitectureCommand = vscode.commands.registerCommand('ycode.explainArchitecture', () => {
		vscode.window.showInformationMessage('Analyzing project architecture...');
	});

	context.subscriptions.push(explainChangesCommand, explainArchitectureCommand);
}

export function deactivate() {}
