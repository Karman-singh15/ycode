# Ycode AI

Ycode is your personal, AI-powered coding assistant built directly into VS Code. Powered by Google's Gemini, it understands your uncommitted code changes and project architecture, explaining them in simple terms.

## Features

- **Explain Recent Changes**: Gets a snapshot of your uncommitted Git diffs and provides a high-level summary, a detailed file-by-file breakdown, or answers specific questions about individual files.
- **Explain Project Architecture**: Maps out your workspace directory structure and reads your `package.json` to deliver a profound architectural analysis of your project.
- **Simplify Copied Text**: Copy any complex explanation or block of code, and Ycode will read your clipboard to break it down into easy-to-understand terms.
- **Beautiful UI**: All explanations are rendered in a seamless, native VS Code Webview tab that matches your active theme.

## Setup

1. Install the extension.
2. Go to your VS Code Settings (Cmd+, or Ctrl+,) and search for `Ycode`.
3. Enter your Google Gemini API Keys in the respective fields:
   - `Explain Api Key`: For code changes and copied text.
   - `Architecture Api Key`: For architectural analysis.

## Usage

Simply click the ✨ **Ycode AI** button in your Status Bar (bottom right) to open the interactive menu!
