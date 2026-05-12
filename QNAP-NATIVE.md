# QNAP Native Installation Guide

This guide shows you how to run the Homebox MCP Server **directly on your QNAP** (without Docker). This is the most reliable approach for Claude Desktop connectivity, especially on Windows.

## Why Native Installation?

Running directly on QNAP eliminates the stdin/stdout piping issues that occur when using SSH + docker exec + container. The connection path is simpler:

```
Claude Desktop → SSH → Node.js process (direct) ✓
```

Instead of:

```
Claude Desktop → SSH → wrapper → docker exec → container ✗
```

## Prerequisites

- QNAP NAS with SSH access enabled
- Homebox running on your QNAP (Docker or native)
- Your Homebox login credentials
- SSH key authentication set up from your computer to QNAP

## Installation Steps

### Step 1: Install Node.js on QNAP

SSH into your QNAP:

```bash
ssh admin@your-qnap-ip
```

Check if Node.js is already installed:

```bash
node --version
```

**If Node.js is not installed**, install it via Entware:

1. Install Entware (if not already installed):

   ```bash
   # Check if Entware is installed
   which opkg

   # If not found, install Entware from QNAP Club
   # Visit: https://www.qnapclub.eu/en/qpkg/556
   # Or follow QNAP's Entware installation guide
   ```

2. Install Node.js via Entware:

   ```bash
   opkg update
   opkg install node
   opkg install node-npm
   ```

3. Verify installation:
   ```bash
   node --version  # Should show v18+ or v20+
   npm --version
   ```

### Step 2: Create Installation Directory

Create a dedicated directory for the MCP server:

```bash
# Create directory in your home folder
mkdir -p /share/homes/admin/homebox-mcp
cd /share/homes/admin/homebox-mcp
```

**Note:** Adjust `admin` to your actual QNAP username (could be `admin`, `jeeves`, etc.)

### Step 3: Download and Install MCP Server

**Option A: Using Git (Recommended)**

If git is available:

```bash
git clone https://github.com/jeeves5454/Homebox-mcp.git .
npm install
npm run build
```

**Option B: Manual Download**

If git is not available, download from your computer and transfer:

1. On your computer, download the repository:

   ```bash
   git clone https://github.com/jeeves5454/Homebox-mcp.git
   cd Homebox-mcp
   ```

2. Transfer to QNAP using SCP:

   ```bash
   scp -r * admin@your-qnap-ip:/share/homes/admin/homebox-mcp/
   ```

3. On QNAP, install and build:
   ```bash
   cd /share/homes/admin/homebox-mcp
   npm install
   npm run build
   ```

### Step 4: Configure the Server

Create a configuration file:

```bash
cd /share/homes/admin/homebox-mcp
nano config.json
```

Paste this configuration (adjust values for your setup):

```json
{
  "homeboxUrl": "http://localhost:7745",
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Important:** Adjust `homeboxUrl` based on how your Homebox is running:

- If Homebox is in Docker with port 7745 exposed: `http://localhost:7745`
- If Homebox is in Docker with a custom port: `http://localhost:YOUR_PORT`
- If Homebox is native on QNAP: `http://localhost:7745`

Save and exit (Ctrl+X, then Y, then Enter in nano)

Secure the config file:

```bash
chmod 600 config.json
```

### Step 5: Test the Server

Test that the server can start and authenticate:

```bash
cd /share/homes/admin/homebox-mcp
node dist/index.js
```

You should see:

```
============================================================
Homebox MCP Server v1.1.0
============================================================
Starting Homebox MCP Server...
Loaded configuration from ./config.json
Successfully authenticated with Homebox
Homebox MCP Server running on stdio
```

**Press Ctrl+C to stop the test.**

If you see errors:

- "Authentication failed" - Check your email/password in config.json
- "Cannot connect" - Check the homeboxUrl in config.json
- "config.json not found" - Make sure you're in the right directory

### Step 6: Create a Wrapper Script

Create a simple wrapper script that Claude Desktop will use:

```bash
nano /share/homes/admin/mcp-start.sh
```

Paste this content:

```bash
#!/bin/sh
cd /share/homes/admin/homebox-mcp
exec node dist/index.js 2>/share/homes/admin/mcp-stderr.log
```

Make it executable:

```bash
chmod +x /share/homes/admin/mcp-start.sh
```

**Note:** Adjust the path if you used a different username or location.

### Step 7: Test the Wrapper Script

Test the wrapper from your local computer:

```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":true},"sampling":{}},"clientInfo":{"name":"test","version":"1.0.0"}},"id":0}' | ssh admin@your-qnap-ip /share/homes/admin/mcp-start.sh
```

You should get a JSON response back immediately showing the server's capabilities.

### Step 8: Configure Claude Desktop

Edit your Claude Desktop config file:

- **Windows**: `%APPDATA%\Claude\config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "homebox": {
      "command": "ssh",
      "args": ["admin@your-qnap-ip", "/share/homes/admin/mcp-start.sh"]
    }
  }
}
```

**Important:** Replace:

- `admin@your-qnap-ip` with your actual QNAP username and IP
- The path if you used a different location

### Step 9: Verify SSH Keys

Make sure you have SSH key authentication set up (Claude Desktop requires this):

**On Windows (PowerShell):**

```powershell
# Generate key if you don't have one
ssh-keygen -t rsa -b 4096

# Copy to QNAP (will ask for password once)
type $env:USERPROFILE\.ssh\id_rsa.pub | ssh admin@your-qnap-ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# Test (should not ask for password)
ssh admin@your-qnap-ip echo "success"
```

**On macOS/Linux:**

```bash
# Generate key if you don't have one
ssh-keygen -t rsa -b 4096

# Copy to QNAP
ssh-copy-id admin@your-qnap-ip

# Test
ssh admin@your-qnap-ip echo "success"
```

### Step 10: Test with Claude Desktop

1. **Restart Claude Desktop** completely (quit and relaunch)

2. **Open a new conversation**

3. **Ask Claude:** "Can you list all the locations in my Homebox inventory?"

If it works, you'll see your Homebox locations listed! 🎉

## Troubleshooting

### Server Won't Start

**Problem:** Error when running `node dist/index.js`

**Solutions:**

1. Check Node.js version: `node --version` (should be 18+)
2. Rebuild: `cd /share/homes/admin/homebox-mcp && npm run build`
3. Check config.json exists and has correct JSON syntax
4. Check permissions: `chmod 644 config.json`

### Authentication Failed

**Problem:** "Authentication failed with Homebox"

**Solutions:**

1. Verify credentials are correct in config.json
2. Test login manually in Homebox web UI
3. Check for special characters in password that need escaping in JSON
4. Ensure email address is correct (exact match with Homebox account)

### Cannot Connect to Homebox

**Problem:** "Error connecting to Homebox at http://..."

**Solutions:**

1. Check Homebox is actually running:
   ```bash
   curl http://localhost:7745
   ```
2. If Homebox is in Docker, verify port mapping:
   ```bash
   docker ps | grep homebox
   ```
3. Try different URLs in config.json:
   - `http://localhost:7745`
   - `http://127.0.0.1:7745`
   - `http://homebox:7745` (if on same Docker network)
   - Your QNAP's IP: `http://192.168.1.114:7745`

### Claude Desktop Can't Connect

**Problem:** "Server disconnected" in Claude Desktop logs

**Solutions:**

1. Test the SSH command manually:

   ```bash
   ssh admin@your-qnap-ip /share/homes/admin/mcp-start.sh
   ```

   Should start the server (Ctrl+C to stop)

2. Check SSH keys work without password:

   ```bash
   ssh admin@your-qnap-ip echo "test"
   ```

   Should print "test" without asking for password

3. Check the wrapper script path is correct:

   ```bash
   ssh admin@your-qnap-ip "ls -la /share/homes/admin/mcp-start.sh"
   ```

4. Check stderr log for errors:
   ```bash
   ssh admin@your-qnap-ip "cat /share/homes/admin/mcp-stderr.log"
   ```

### Permission Denied Errors

**Problem:** "Permission denied" when trying to run scripts

**Solutions:**

1. Make wrapper executable:

   ```bash
   chmod +x /share/homes/admin/mcp-start.sh
   ```

2. Check directory permissions:

   ```bash
   ls -la /share/homes/admin/homebox-mcp
   ```

3. Ensure you're using the correct user (admin, jeeves, etc.)

## Updating the Server

When a new version is released:

```bash
ssh admin@your-qnap-ip
cd /share/homes/admin/homebox-mcp
git pull
npm install
npm run build
```

Or if you installed manually, re-download and transfer the files, then run `npm install && npm run build`.

## Uninstalling

To remove the native installation:

```bash
ssh admin@your-qnap-ip
rm -rf /share/homes/admin/homebox-mcp
rm /share/homes/admin/mcp-start.sh
rm /share/homes/admin/mcp-stderr.log
```

Then remove the "homebox" entry from your Claude Desktop config.json.

## Comparison: Docker vs Native

| Aspect                           | Docker                      | Native                 |
| -------------------------------- | --------------------------- | ---------------------- |
| **Setup Complexity**             | Easier initial setup        | More steps             |
| **Claude Desktop Compatibility** | Issues with stdin/stdout    | Reliable               |
| **Updates**                      | Pull new image              | Git pull + rebuild     |
| **Isolation**                    | Containerized               | Runs on host           |
| **Resource Usage**               | Higher (container overhead) | Lower                  |
| **Debugging**                    | More complex (docker exec)  | Easier (direct access) |

For Claude Desktop connectivity, **native installation is recommended** due to the stdin/stdout compatibility issues with the Docker approach on Windows.

## Security Notes

1. **Secure config.json** - Contains your Homebox password:

   ```bash
   chmod 600 /share/homes/admin/homebox-mcp/config.json
   ```

2. **Use SSH keys** - Never use password authentication for SSH

3. **Restrict SSH access** - Consider firewall rules to limit SSH to trusted IPs

4. **Keep Node.js updated** - Regularly update via Entware:

   ```bash
   opkg update && opkg upgrade node node-npm
   ```

5. **Monitor logs** - Check stderr log periodically:
   ```bash
   cat /share/homes/admin/mcp-stderr.log
   ```

## Need Help?

- **General documentation**: See [README.md](README.md)
- **Docker approach**: See [DOCKER.md](DOCKER.md) or [QNAP-QUICKSTART.md](QNAP-QUICKSTART.md)
- **Example queries**: See [EXAMPLES.md](EXAMPLES.md)
- **Entware help**: https://github.com/Entware/Entware/wiki
