# FactGuard Extension

FactGuard is a Chrome Extension built with **React**, **Vite**, and **Manifest V3**.

## Requirements to Run on Another Device

Since this is a Node.js project, it does not use a Python `requirements.txt`. Instead, all of the necessary libraries and dependencies are automatically managed by the `package.json` file. 

To set this up on a new device, you just need to install Node.js and run the install command.

### 1. Prerequisites
- **Node.js** (v18 or higher)
  - Download from: [nodejs.org](https://nodejs.org/)
- **Google Chrome** (or any Chromium-based browser)

### 2. Installation
Once Node.js is installed on your new device, open your terminal (Command Prompt, PowerShell, or macOS Terminal), navigate to this project folder, and run:

```bash
# Install all dependencies listed in package.json
npm install
```

### 3. Building the Extension
To compile the React code into the vanilla JavaScript that Chrome understands, run:

```bash
# Build the project for production
npm run build
```
*(Note: A new folder called `dist/` will be generated. This is the actual extension).*

### 4. Loading the Extension into Chrome
1. Open Google Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode** (toggle switch in the top right corner).
3. Click the **Load unpacked** button.
4. Select the `dist/` folder located inside your FactGuard project directory.

### 5. Development Mode (Optional)
If you want to edit the code on the new device, run:
```bash
npm run dev
```
This will watch your files for changes and rebuild the extension automatically. You will still need to click the 🔄 Reload button on the extension card in `chrome://extensions/` after making changes.
