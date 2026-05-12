# Homebox Integration for Open WebUI

This guide shows you how to integrate your Homebox home inventory with Open WebUI, enabling any function-calling capable LLM (like Llama 3.1, Mistral, Qwen) to query your inventory data.

Perfect for use cases like:

- 🍸 "What cocktails can I make with my liquor?"
- 🔧 "Do I have any power tools in the garage?"
- 📦 "What's in my storage unit?"
- 🎨 "List all my art supplies"

## Prerequisites

- ✅ Homebox running in Docker on QNAP
- ✅ Open WebUI running in Docker on QNAP
- ✅ Both containers on the same Docker network (or use host networking)
- ✅ Your Homebox login credentials

## Architecture

```
You → Open WebUI → Ollama (function-calling model)
                      ↓
                  Homebox Function
                      ↓
                  Homebox REST API
                      ↓
                  Your Inventory Data
```

## Installation Steps

### Step 1: Verify Docker Networking

First, check if your Homebox and Open WebUI containers can communicate:

```bash
# SSH into your QNAP
ssh admin@your-qnap-ip

# Check what network Homebox is on
docker inspect homebox | grep -A 10 "Networks"

# Check what network Open WebUI is on
docker inspect open-webui | grep -A 10 "Networks"
```

**If they're on different networks**, you have two options:

**Option A: Use Host Network (Easiest)**

Update your docker-compose or recreate containers with `--network host`

**Option B: Create Shared Network**

```bash
# Create a shared network
docker network create homebox-network

# Connect both containers to it
docker network connect homebox-network homebox
docker network connect homebox-network open-webui

# Restart containers
docker restart homebox open-webui
```

### Step 2: Find Your Homebox Container Name

```bash
docker ps | grep homebox
```

Note the container name (e.g., `homebox`, `homebox-homebox-1`, etc.)

### Step 3: Test Connectivity from Open WebUI

```bash
# Get a shell in Open WebUI container
docker exec -it open-webui /bin/bash

# Try to reach Homebox (replace 'homebox' with your container name)
curl http://homebox:7745
# Should return HTML or "Not Found" (that's OK, means it's reachable)

# If that fails, try with the container IP
docker inspect homebox | grep IPAddress
# Then: curl http://CONTAINER_IP:7745

# Exit the shell
exit
```

### Step 4: Install the Homebox Function in Open WebUI

1. **Open Open WebUI** in your browser (e.g., `http://your-qnap-ip:3000`)

2. **Navigate to Functions**:
   - Click your profile icon (top right)
   - Select **"Admin Panel"**
   - Click **"Functions"** in the sidebar

3. **Create New Function**:
   - Click **"+ Create Function"** or **"Import Function"**
   - Click **"Import from Code"**

4. **Copy the function code**:
   - Open the file `open-webui-functions/homebox_search.py` from this repository
   - Copy the entire contents
   - Paste into Open WebUI

5. **Click "Save"**

### Step 5: Configure the Function

After saving, you'll see the function's configuration page:

1. **Click on the "Valves" tab**

2. **Configure these settings**:
   - **HOMEBOX_URL**:
     - If same Docker network: `http://homebox:7745` (use your container name)
     - If different networks: `http://CONTAINER_IP:7745`
     - If host network: `http://localhost:7745`

   - **HOMEBOX_EMAIL**: Your Homebox login email

   - **HOMEBOX_PASSWORD**: Your Homebox login password

3. **Click "Save"**

### Step 6: Enable the Function

1. In the Functions list, find "Homebox Item Search"
2. Toggle it **ON** (the switch should be blue/green)

### Step 7: Test with a Function-Calling Model

1. **Start a new chat** in Open WebUI

2. **Select a function-calling capable model**:
   - Llama 3.1 (8B, 70B, or 405B)
   - Mistral (7B or larger)
   - Qwen 2.5 (7B or larger)
   - Command R
   - Any other model with function calling support

3. **Enable tools for this chat**:
   - Look for the **tools icon** (🔧) in the chat interface
   - Make sure "Homebox Item Search" is **enabled**

4. **Ask a test question**:

   ```
   What locations do I have in my Homebox inventory?
   ```

   The model should call `list_homebox_locations()` and show you your locations!

## Example Queries for Your Cocktail Use Case

Once set up, you can ask questions like:

### Inventory Queries

```
What alcohol do I have in my bar?
```

```
List all spirits in my liquor cabinet
```

```
Show me everything in the "Bar" location
```

### Recipe Suggestions

```
What cocktails can I make with the liquor I have available?
```

```
I want to make an Old Fashioned. Do I have all the ingredients?
```

```
Suggest a cocktail recipe using only what's in my bar right now
```

### Specific Searches

```
Do I have any vodka? What brand?
```

```
How much gin do I have left?
```

```
What types of rum are in my inventory?
```

## Available Functions

The Homebox function provides these tools to the LLM:

| Function                   | Purpose                                           | Example Use                  |
| -------------------------- | ------------------------------------------------- | ---------------------------- |
| `search_homebox_items()`   | Search items by keyword                           | "Find vodka"                 |
| `list_homebox_locations()` | Show all locations                                | "What locations exist?"      |
| `get_items_by_location()`  | Items in specific place                           | "What's in the bar?"         |
| `list_homebox_labels()`    | Show all tags                                     | "What categories do I have?" |
| `get_items_by_label()`     | Items with specific tag (legacy name — see above) | "Show me all alcohol"        |

## Setting Up Your Homebox for Best Results

To get the most out of this integration:

### 1. Use Clear Naming

```
✅ "Grey Goose Vodka"
❌ "Bottle 1"
```

### 2. Add Descriptive Tags

Create tags like:

- "Spirits"
- "Liquor"
- "Alcohol"
- "Mixers"
- "Garnishes"

### 3. Use Specific Locations

Instead of:

- ❌ "Kitchen"

Use:

- ✅ "Kitchen - Bar Cabinet"
- ✅ "Kitchen - Liquor Shelf"
- ✅ "Bar Cart"

### 4. Add Descriptions

Include useful details:

```
Name: "Tanqueray London Dry Gin"
Description: "750ml, 47.3% ABV, opened 2024-01"
Tags: ["Gin", "Spirits", "Alcohol"]
Location: "Bar Cabinet"
Quantity: 1
```

### 5. Update Quantities

Keep quantities current so the LLM knows what's actually available.

## Docker Compose Example

If you want to deploy both Homebox and Open WebUI together, here's an example:

```yaml
version: "3.8"

services:
  homebox:
    image: ghcr.io/sysadminsmedia/homebox:latest
    container_name: homebox
    restart: unless-stopped
    environment:
      - HBOX_LOG_LEVEL=info
      - HBOX_LOG_FORMAT=text
      - HBOX_WEB_PORT=7745
    volumes:
      - homebox-data:/data/
    ports:
      - "7745:7745"
    networks:
      - homebox-network

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: open-webui
    restart: unless-stopped
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    volumes:
      - open-webui-data:/app/backend/data
    ports:
      - "3000:8080"
    networks:
      - homebox-network
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    volumes:
      - ollama-data:/root/.ollama
    ports:
      - "11434:11434"
    networks:
      - homebox-network

networks:
  homebox-network:
    driver: bridge

volumes:
  homebox-data:
  open-webui-data:
  ollama-data:
```

With this setup, use these URLs in the function configuration:

- **HOMEBOX_URL**: `http://homebox:7745`

## Troubleshooting

### "Authentication failed"

**Problem:** Function can't log into Homebox

**Solutions:**

1. Check email/password in Valves configuration
2. Verify credentials work in Homebox web UI
3. Check for special characters in password
4. Try recreating the Homebox user account

### "Connection refused" or "Cannot connect"

**Problem:** Open WebUI can't reach Homebox

**Solutions:**

1. Verify both containers are on same network:

   ```bash
   docker network inspect homebox-network
   ```

2. Test connectivity from Open WebUI container:

   ```bash
   docker exec -it open-webui curl http://homebox:7745
   ```

3. Check Homebox container name is correct in HOMEBOX_URL

4. Try using container IP instead:
   ```bash
   docker inspect homebox | grep IPAddress
   # Use http://CONTAINER_IP:7745
   ```

### "No items found" when you know items exist

**Problem:** Function returns empty results

**Solutions:**

1. Check you have items actually added in Homebox
2. Verify the function is authenticated (check logs)
3. Try searching for item names you know exist
4. Check Homebox API is responding:

   ```bash
   # Get your auth token
   curl -X POST http://localhost:7745/api/v1/users/login \
     -H "Content-Type: application/json" \
     -d '{"username":"your-email","password":"your-password"}'

   # Use token to search (replace YOUR_TOKEN)
   curl http://localhost:7745/api/v1/items \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### Model doesn't use the function

**Problem:** LLM answers without calling Homebox function

**Solutions:**

1. **Make sure model supports function calling**:
   - Use Llama 3.1+ (not Llama 3.0)
   - Use Mistral 7B+ with function calling
   - Use Qwen 2.5+

2. **Enable tools in chat**:
   - Click the tools icon (🔧) in chat
   - Ensure "Homebox Item Search" is checked

3. **Be explicit in your question**:
   - ❌ "Make me a cocktail"
   - ✅ "What alcohol do I have in my Homebox inventory?"

4. **Check function is enabled**:
   - Admin Panel → Functions
   - "Homebox Item Search" should be toggled ON

### Function enabled but not showing in tools

**Problem:** Can't see Homebox function in tools list

**Solutions:**

1. Refresh the page completely (Ctrl+F5)
2. Try a new chat conversation
3. Check function is saved and enabled in Admin Panel
4. Look for errors in browser console (F12)

## Advanced: Custom Fields

If you want to add more functionality, you can extend the function to include:

- Custom fields from your items
- Purchase dates and warranties
- Price information
- Purchase locations
- Images and attachments
- Maintenance schedules

Edit the function code and add more methods following the same pattern.

## Security Notes

1. **Protect your credentials**: The Valves configuration stores your Homebox password
2. **Limit Open WebUI access**: Use authentication and restrict who can access Open WebUI
3. **Network isolation**: Keep Homebox and Open WebUI on private network
4. **Use HTTPS**: If exposing Open WebUI externally, use HTTPS
5. **Regular updates**: Keep both Homebox and Open WebUI updated

## Comparison: Open WebUI vs MCP

| Aspect               | Open WebUI Functions    | MCP Server                |
| -------------------- | ----------------------- | ------------------------- |
| **Setup Complexity** | Simple (copy/paste)     | Complex (server setup)    |
| **Ollama Support**   | Native, stable          | Experimental              |
| **Claude Support**   | No                      | Yes (primary use case)    |
| **Maintenance**      | Low (built-in)          | Higher (separate process) |
| **Docker Friendly**  | Yes, perfect for Docker | stdin/stdout issues       |
| **Function Calling** | Native Ollama           | Via MCP protocol          |
| **Best For**         | Ollama + Open WebUI     | Claude Desktop            |

**For your use case (Ollama + Open WebUI on QNAP), Open WebUI Functions are the clear winner.**

## Next Steps

1. ✅ Install the function following steps above
2. ✅ Test with a simple query
3. ✅ Organize your Homebox inventory with clear tags and locations
4. ✅ Try cocktail recipe queries!
5. ✅ Explore other use cases (tools, supplies, collections, etc.)

## Need Help?

- **Open WebUI Docs**: https://docs.openwebui.com/
- **Homebox Docs**: https://hay-kot.github.io/homebox/
- **Ollama Models**: https://ollama.com/library
- **Function Calling Guide**: https://docs.openwebui.com/tutorial/functions

---

**Enjoy asking your LLM about your home inventory!** 🍸🏠📦
