# Quick Start Guide - For Complete Beginners

This guide will walk you through setting up the Homebox MCP Server step by step, assuming you have no development experience.

## What You Need First

1. **Homebox running** - You should already have Homebox installed and be able to access it in your web browser
2. **Your Homebox login info** - Your email and password that you use to log into Homebox
3. **Know your Homebox URL** - This is usually `http://localhost:7745` if running locally

## Installation Steps

### Step 1: Install Node.js

Node.js is the software that will run this MCP server.

1. Go to https://nodejs.org/ in your web browser
2. Click the big green button that says "Download Node.js (LTS)"
3. Run the downloaded installer
4. Click "Next" through all the steps (the default options are fine)
5. Click "Finish" when done

### Step 2: Open a Terminal

You need to open a command line terminal:

**On Windows:**

- Press the Windows key
- Type "cmd" or "Command Prompt"
- Press Enter

**On Mac:**

- Press Command + Space
- Type "terminal"
- Press Enter

**On Linux:**

- Press Ctrl + Alt + T

### Step 3: Navigate to the MCP Server Folder

In the terminal, type:

**On Windows:**

```
cd C:\path\to\Homebox-mcp
```

(Replace `C:\path\to\Homebox-mcp` with where you downloaded this folder)

**On Mac/Linux:**

```
cd /path/to/Homebox-mcp
```

(Replace `/path/to/Homebox-mcp` with where you downloaded this folder)

Press Enter.

### Step 4: Run the Setup Script

**On Windows:**

```
setup.bat
```

**On Mac/Linux:**

```
./setup.sh
```

Press Enter and follow the prompts.

### Step 5: Edit Your Configuration

You need to tell the server how to connect to your Homebox:

1. Open the `config.json` file in a text editor:
   - **Windows**: Right-click `config.json` → "Open with" → "Notepad"
   - **Mac**: Right-click `config.json` → "Open With" → "TextEdit"
   - **Linux**: Use any text editor like `gedit` or `nano`

2. You'll see something like this:

   ```json
   {
     "homeboxUrl": "http://localhost:7745",
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```

3. Change these values:
   - Replace `http://localhost:7745` with your Homebox URL (might be the same)
   - Replace `your-email@example.com` with your Homebox email
   - Replace `your-password` with your Homebox password

4. Save the file (File → Save or Ctrl+S / Command+S)

### Step 6: Test the Connection

In your terminal, type:

```
npm start
```

If everything works, you should see:

```
Starting Homebox MCP Server...
Successfully authenticated with Homebox
Homebox MCP Server running on stdio
```

Great! Press Ctrl+C to stop it. The server works!

## Connecting to Claude Desktop

Now you need to tell Claude Desktop about this server:

### Step 1: Find Your Configuration File

The Claude Desktop configuration file is located at:

- **Windows**: `C:\Users\YourName\AppData\Roaming\Claude\claude_desktop_config.json`
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Tip for Windows:** To get to AppData folder:

1. Press Windows + R
2. Type `%APPDATA%`
3. Press Enter
4. Look for the Claude folder

### Step 2: Find the Full Path to Your MCP Server

You need the complete path to the `dist/index.js` file inside your Homebox-mcp folder.

**On Windows:**

- Open File Explorer
- Navigate to your Homebox-mcp folder
- Open the `dist` folder
- Right-click on the address bar at the top
- Click "Copy address as text"
- It might look like: `C:\Users\YourName\Documents\Homebox-mcp\dist`
- Add `\index.js` to the end

**On Mac/Linux:**

- Open Terminal
- Navigate to your Homebox-mcp folder
- Type: `pwd`
- Copy the output
- Add `/dist/index.js` to the end

### Step 3: Edit Claude Desktop Configuration

1. Open `claude_desktop_config.json` in a text editor

2. If the file is empty or has just `{}`, replace everything with:

   **Windows example:**

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "node",
         "args": ["C:\\Users\\YourName\\Documents\\Homebox-mcp\\dist\\index.js"]
       }
     }
   }
   ```

   **Mac/Linux example:**

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "node",
         "args": ["/Users/YourName/Documents/Homebox-mcp/dist/index.js"]
       }
     }
   }
   ```

3. Replace the path with YOUR actual path from Step 2

4. Save the file

### Step 4: Restart Claude Desktop

1. Quit Claude Desktop completely
2. Start Claude Desktop again

## Testing It Out

In Claude Desktop, try asking:

"Can you list all the locations in my Homebox inventory?"

or

"Search my Homebox for 'tools'"

Claude should now be able to access your Homebox data!

## Troubleshooting

### "I can't find the config file"

On Windows, the AppData folder is hidden by default:

1. Open File Explorer
2. Click the "View" tab
3. Check "Hidden items"

### "It says authentication failed"

- Double-check your email and password in `config.json`
- Make sure Homebox is running
- Try logging into Homebox in your web browser with the same credentials

### "Nothing happens in Claude"

- Make sure you restarted Claude Desktop after editing the config
- Check that the path in `claude_desktop_config.json` is correct and uses full path
- Make sure you ran `npm run build` successfully

### "I get an error about Node.js"

- Make sure you installed Node.js
- Try closing and reopening your terminal
- Type `node --version` to verify it's installed

## Need More Help?

See the full [README.md](README.md) for more detailed information and troubleshooting tips.
