# Homebox MCP Server

A Model Context Protocol (MCP) server that connects to your Homebox home inventory system, allowing AI assistants to query and explore your home inventory data in real-time.

## What is This?

This MCP server acts as a bridge between AI assistants (like Claude) and your Homebox home inventory database. It allows your AI assistant to:

- Search for items in your inventory
- Get detailed information about specific items
- List all locations where you store things
- List all tags/categories you use
- Find all items in a specific location or tag
- Create, update, and delete items, locations, and tags
- Record and delete maintenance entries
- Upload, download, update, and delete item attachments

## Deployment Options

Choose the integration method that works best for your use case:

### For claude.ai Users (Remote MCP)

- **[Docker / QNAP Container Station](DOCKER.md)** - Run the MCP server as an HTTP service and connect claude.ai to it directly — no local install required

### For Claude Desktop Users (Local MCP)

- **[Docker / QNAP Container Station](DOCKER.md)** - Run MCP server in a container, accessed via `docker exec`
- **[Native QNAP Installation](QNAP-NATIVE.md)** - Run MCP server directly on QNAP
- **[Local Installation](#step-by-step-setup-instructions)** - Run MCP server on your computer (see below)

### For Open WebUI + Ollama Users

- **[Open WebUI Functions](OPEN-WEBUI.md)** - Native integration for Open WebUI with function-calling models (recommended for Ollama)
- **[Cocktail Examples](COCKTAIL-EXAMPLES.md)** - Specific examples for home bar/cocktail use cases

**Which should I choose?**

- Using **claude.ai**? → Use [Docker](DOCKER.md) (HTTP mode, port 8811)
- Using **Claude Desktop**? → Use [Native QNAP Installation](QNAP-NATIVE.md) or [Docker](DOCKER.md) (stdio mode)
- Using **Ollama with Open WebUI**? → Use [Open WebUI Functions](OPEN-WEBUI.md)
- Running **locally on Windows/Mac/Linux**? → Follow [Local Installation](#step-by-step-setup-instructions) below

## Prerequisites (Local Installation)

**Note:** If you're using Docker/QNAP, see [DOCKER.md](DOCKER.md) instead.

Before you begin, you'll need:

1. **Node.js** - Version 18 or higher ([Download here](https://nodejs.org/))
2. **A running Homebox instance** - You should have Homebox already installed and accessible
3. **Homebox login credentials** - Your email and password for Homebox

## Step-by-Step Setup Instructions (Local Installation)

### Step 1: Install Node.js

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the LTS (Long Term Support) version
3. Run the installer and follow the prompts
4. Open a terminal/command prompt and verify installation:
   ```bash
   node --version
   npm --version
   ```
   Both commands should show version numbers.

### Step 2: Download This MCP Server

If you haven't already:

```bash
git clone <your-repository-url>
cd Homebox-mcp
```

### Step 3: Install Dependencies

In the `Homebox-mcp` folder, run:

```bash
npm install
```

This will download all the required libraries.

### Step 4: Configure Your Homebox Connection

1. Copy the example configuration file:

   ```bash
   cp config.json.example config.json
   ```

2. Open `config.json` in a text editor and fill in your details:

   ```json
   {
     "homeboxUrl": "http://localhost:7745",
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```

   Replace:
   - `homeboxUrl`: The URL where your Homebox is running (default is `http://localhost:7745`)
   - `email`: Your Homebox login email
   - `password`: Your Homebox login password

3. Save the file

### Step 5: Build the Server

Compile the TypeScript code:

```bash
npm run build
```

### Step 6: Test the Connection

Before running the full server, test that it can connect to Homebox:

```bash
npm test
```

This will verify your configuration and show you if everything is working. If successful, you'll see green checkmarks and a summary of your inventory.

Alternatively, you can test the full server:

```bash
npm start
```

If successful, you should see:

```
Homebox MCP Server v1.1.0
...
Successfully authenticated with Homebox
Homebox MCP Server running on stdio
```

Press `Ctrl+C` to stop the server. You're ready to configure your AI assistant!

## Configuring with Claude Desktop

To use this MCP server with Claude Desktop:

1. Open your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add the Homebox MCP server to the configuration:

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "node",
         "args": ["/absolute/path/to/Homebox-mcp/dist/index.js"]
       }
     }
   }
   ```

   Replace `/absolute/path/to/Homebox-mcp` with the actual full path to your Homebox-mcp folder.

   **Example for macOS/Linux:**

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "node",
         "args": ["/home/username/Homebox-mcp/dist/index.js"]
       }
     }
   }
   ```

   **Example for Windows:**

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "node",
         "args": ["C:\\Users\\YourName\\Homebox-mcp\\dist\\index.js"]
       }
     }
   }
   ```

3. Save the file and restart Claude Desktop

## Using the MCP Server

Once configured, you can ask Claude to interact with your Homebox inventory. Here are some example queries:

### Search for Items

"Can you search my Homebox inventory for 'screwdriver'?"

### List All Locations

"Show me all the locations in my Homebox inventory"

### Find Items in a Location

"What items do I have in the garage?" (first get the location ID using list_locations, then use get_items_by_location)

### List All Tags

"What tags/categories do I use in Homebox?"

### Get Item Details

"Can you get the full details for item ID 123?"

### Find Items by Tag

"Show me all items tagged as 'Electronics'"

For more detailed examples and use cases, see [EXAMPLES.md](EXAMPLES.md).

## Available Tools

The MCP server provides these tools:

**Read**

1. **search_items** - Search for items by name or description, with optional location/tag filters
2. **get_item** - Get complete details about a specific item
3. **list_locations** - List all storage locations
4. **get_location** - Get details about a specific location
5. **list_tags** - List all tags/categories
6. **get_tag** - Get details about a specific tag
7. **get_items_by_location** - Get all items in a location
8. **get_items_by_tag** - Get all items with a tag

**Write**

9. **create_item** - Add a new item to the inventory
10. **update_item** - Update an existing item (name, description, location, tags, purchase info, warranty, etc.)
11. **delete_item** - Permanently delete an item
12. **create_location** - Add a new storage location
13. **update_location** - Rename a location, change its description, or move it under a parent
14. **delete_location** - Delete a location
15. **create_tag** - Add a new tag/category
16. **update_tag** - Rename a tag, change its description, color, icon, or parent
17. **delete_tag** - Delete a tag
18. **create_maintenance_entry** - Record a maintenance event on an item
19. **update_maintenance_entry** - Update an existing maintenance entry (name, dates, description, cost)
20. **delete_maintenance_entry** - Delete a maintenance entry

**Attachments**

18. **get_item_attachment** - Get download access to an attachment. Returns an HTTP proxy URL (for cross-MCP transfer: pass to another MCP's upload tool) and a `resource_link` (for reading content via `resources/read` without HTTP fetch restrictions). HTTP mode only; requires `ATTACHMENT_BASE_URL`.
19. **upload_item_attachment** - Fetch a file from a URL and attach it to an item
20. **update_item_attachment** - Update attachment metadata (title, type, primary flag)
21. **delete_item_attachment** - Permanently delete an attachment

## Troubleshooting

### "Authentication failed"

- Check that your `config.json` has the correct email and password
- Verify that your Homebox instance is running
- Make sure the `homeboxUrl` is correct

### "Cannot find module"

- Run `npm install` again
- Make sure you ran `npm run build`

### "ECONNREFUSED" or "Network Error"

- Check that Homebox is running
- Verify the URL in `config.json` is correct
- If using Docker, make sure the Homebox container is running

### Claude Desktop doesn't show the tools

- Check that the path in `claude_desktop_config.json` is absolute (full path)
- Restart Claude Desktop after changing the configuration
- Check Claude Desktop logs for errors

## Security Notes

- Your `config.json` file contains your Homebox password - keep it secure
- The `.gitignore` file is configured to prevent `config.json` from being committed to git
- Never share your `config.json` file publicly

## How It Works

### MCP Server Approach (Claude Desktop)

This MCP server:

1. Connects to your Homebox instance via its REST API
2. Authenticates using your credentials
3. Provides tools that Claude can use to query your inventory
4. Returns data in a format that Claude can understand and present to you

The server doesn't directly access the SQLite database. Instead, it uses Homebox's official API, which is safer and more reliable for real-time access.

### Open WebUI Functions Approach (Ollama)

The Open WebUI integration:

1. Installs as a native function in Open WebUI
2. Calls Homebox REST API directly from within Open WebUI
3. Works with any function-calling capable Ollama model (Llama 3.1, Mistral, Qwen, etc.)
4. No separate server process needed
5. Perfect for Docker deployments on QNAP

**See [OPEN-WEBUI.md](OPEN-WEBUI.md) for complete setup instructions.**

## Development

If you want to modify the server:

1. Edit files in the `src/` directory
2. Rebuild with `npm run build`
3. Restart the server

### Running the E2E Test Suite

The test suite spins up a local Homebox instance via Docker Compose and exercises the MCP server against it:

```bash
npm run test:e2e
```

To test against an older Homebox version (e.g. to verify the legacy `/api/v1/labels` endpoint fallback for versions prior to v0.23.0):

```bash
HOMEBOX_VERSION=0.22.3 npm run test:e2e
```

## License

MIT

## Support

If you encounter issues:

1. Check the Troubleshooting section above
2. Verify your Homebox instance is working properly
3. Check the Homebox documentation at [homebox.software](https://homebox.software/)
