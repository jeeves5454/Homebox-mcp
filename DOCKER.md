# Docker Deployment Guide for Homebox MCP Server

This guide covers deploying the Homebox MCP Server using Docker, with specific instructions for QNAP Container Station users.

## Table of Contents

- [Quick Start with Docker](#quick-start-with-docker)
- [QNAP Container Station Deployment](#qnap-container-station-deployment)
- [Configuration Options](#configuration-options)
- [Network Configuration](#network-configuration)
- [Connecting to Claude Desktop](#connecting-to-claude-desktop)
- [Troubleshooting](#troubleshooting)

## Quick Start with Docker

### Method 1: Using Docker Compose (Recommended)

1. **Edit docker-compose.yml** and update your credentials:

   ```yaml
   environment:
     - HOMEBOX_URL=http://homebox:7745
     - HOMEBOX_EMAIL=your-email@example.com
     - HOMEBOX_PASSWORD=your-password
   ```

2. **Start the container:**

   ```bash
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f homebox-mcp
   ```

### Method 2: Using Docker CLI

1. **Build the image:**

   ```bash
   docker build -t homebox-mcp-server .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name homebox-mcp-server \
     --restart unless-stopped \
     -e HOMEBOX_URL=http://homebox:7745 \
     -e HOMEBOX_EMAIL=your-email@example.com \
     -e HOMEBOX_PASSWORD=your-password \
     --network homebox-network \
     homebox-mcp-server
   ```

## QNAP Container Station Deployment

### Prerequisites

1. QNAP NAS with Container Station installed
2. Homebox already running in Container Station
3. SSH access to your QNAP (optional but helpful)

### Step 1: Prepare Your Files

1. **Connect to your QNAP** via SSH or File Station

2. **Create a folder** for the MCP server:
   - Location: `/share/Container/homebox-mcp`
   - Or use any shared folder you prefer

3. **Upload these files** to that folder:
   - All files from this repository
   - OR clone the repository directly on QNAP:
     ```bash
     cd /share/Container
     git clone <your-repo-url> homebox-mcp
     cd homebox-mcp
     ```

### Step 2: Configure Your Settings

**Option A: Using Environment Variables (Recommended)**

You'll set these in Container Station when creating the container (Step 3).

**Option B: Using a Config File**

1. Create `config.json` in `/share/Container/homebox-mcp`:

   ```json
   {
     "homeboxUrl": "http://homebox:7745",
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```

2. Set proper permissions:
   ```bash
   chmod 600 /share/Container/homebox-mcp/config.json
   ```

### Step 3: Deploy in Container Station

#### Method A: Using the Container Station UI

1. **Open Container Station** on your QNAP

2. **Go to Images** tab

3. **Click "Create" → "Create Application"**

4. **Paste this configuration:**

   **If using environment variables:**

   ```yaml
   version: "3.8"

   services:
     homebox-mcp:
       build: /share/Container/homebox-mcp
       container_name: homebox-mcp-server
       restart: unless-stopped
       environment:
         - HOMEBOX_URL=http://homebox:7745
         - HOMEBOX_EMAIL=your-email@example.com
         - HOMEBOX_PASSWORD=your-password
       networks:
         - qnet-static-eth0-your-network-id
   ```

   **If using config file:**

   ```yaml
   version: "3.8"

   services:
     homebox-mcp:
       build: /share/Container/homebox-mcp
       container_name: homebox-mcp-server
       restart: unless-stopped
       volumes:
         - /share/Container/homebox-mcp/config.json:/config/config.json:ro
       networks:
         - qnet-static-eth0-your-network-id
   ```

5. **Important Network Configuration:**
   - Replace `qnet-static-eth0-your-network-id` with your actual network name
   - To find this, check your Homebox container's network settings in Container Station
   - Both containers MUST be on the same network to communicate

6. **Click "Validate and Apply"**

7. **Click "Create"** to build and start the container

#### Method B: Using Docker CLI on QNAP

1. **SSH into your QNAP**

2. **Navigate to the folder:**

   ```bash
   cd /share/Container/homebox-mcp
   ```

3. **Build the image:**

   ```bash
   docker build -t homebox-mcp-server .
   ```

4. **Find your Homebox network:**

   ```bash
   docker inspect homebox | grep NetworkMode
   ```

   This will show something like `qnet-static-eth0-xxxxxx`

5. **Run the container:**
   ```bash
   docker run -d \
     --name homebox-mcp-server \
     --restart unless-stopped \
     -e HOMEBOX_URL=http://homebox:7745 \
     -e HOMEBOX_EMAIL=your-email@example.com \
     -e HOMEBOX_PASSWORD=your-password \
     --network qnet-static-eth0-xxxxxx \
     homebox-mcp-server
   ```

### Step 4: Verify Deployment

1. **Check container logs** in Container Station or via CLI:

   ```bash
   docker logs homebox-mcp-server
   ```

2. **You should see:**

   ```
   Starting Homebox MCP Server...
   Loaded configuration from environment variables
   Successfully authenticated with Homebox
   Homebox MCP Server running on stdio
   ```

3. **If you see errors**, check the [Troubleshooting](#troubleshooting) section

## Configuration Options

The MCP server supports three configuration methods (in priority order):

### 1. Environment Variables (Best for Docker)

```yaml
environment:
  - HOMEBOX_URL=http://homebox:7745
  - HOMEBOX_EMAIL=your-email@example.com
  - HOMEBOX_PASSWORD=your-password
```

### 2. Mounted Config File

```yaml
volumes:
  - /path/to/config.json:/config/config.json:ro
```

### 3. Built-in Config File

Include config.json when building the image (not recommended for security).

## Network Configuration

### Finding Your Homebox Container Network

**Option 1: Container Station UI**

1. Open Container Station
2. Click on your Homebox container
3. Go to "Network" section
4. Note the network name (e.g., `qnet-static-eth0-xxxxx`)

**Option 2: Docker CLI**

```bash
docker inspect homebox --format='{{.HostConfig.NetworkMode}}'
```

### Connecting Both Containers

The MCP server must be on the **same Docker network** as Homebox:

```yaml
networks:
  - qnet-static-eth0-xxxxx # Same as Homebox
```

### Important Notes

- **Container names vs hostnames**: In your HOMEBOX_URL, use the container name as the hostname
  - If your Homebox container is named "homebox", use `http://homebox:7745`
  - If it's named "homebox-app", use `http://homebox-app:7745`
  - Check the container name in Container Station

- **Port mapping**: The MCP server uses stdio (standard input/output), so no port mapping is needed
  - Homebox typically runs on port 7745 inside the container
  - The MCP server accesses it via the internal Docker network

## Connecting to Claude Desktop

Once your Docker container is running, you need to configure Claude Desktop to connect to it.

### Method 1: Using Docker Exec (Recommended for QNAP)

Since the MCP server runs in a container, you'll use `docker exec` to interact with it:

1. **Edit Claude Desktop config:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add this configuration:**

   **For local Docker/QNAP on same network:**

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "docker",
         "args": [
           "exec",
           "-i",
           "homebox-mcp-server",
           "node",
           "/app/dist/index.js"
         ]
       }
     }
   }
   ```

   **For remote QNAP (using SSH):**

   ```json
   {
     "mcpServers": {
       "homebox": {
         "command": "ssh",
         "args": [
           "user@your-qnap-ip",
           "docker",
           "exec",
           "-i",
           "homebox-mcp-server",
           "node",
           "/app/dist/index.js"
         ]
       }
     }
   }
   ```

3. **Restart Claude Desktop**

### Method 2: Exposing via SSH Tunnel

If you prefer, you can set up an SSH tunnel to access the container:

1. **On your local machine:**

   ```bash
   ssh -L 9000:localhost:9000 user@your-qnap-ip
   ```

2. **Modify the Dockerfile** to add an HTTP wrapper (advanced - not recommended for beginners)

### Testing the Connection

Ask Claude: "Can you list all locations in my Homebox inventory?"

If it works, you should see your Homebox locations!

## Troubleshooting

### Container won't start

**Check logs:**

```bash
docker logs homebox-mcp-server
```

**Common issues:**

- Missing environment variables
- Invalid JSON in config.json
- Permission issues with config file

### "Authentication failed"

**Possible causes:**

1. Wrong email or password in environment variables
2. Homebox container not running
3. Network issue between containers

**Solutions:**

- Verify credentials: `docker logs homebox-mcp-server`
- Check Homebox is running: `docker ps | grep homebox`
- Verify both containers on same network

### "Cannot connect to Homebox" or "ECONNREFUSED"

**Possible causes:**

1. Containers on different networks
2. Wrong Homebox URL
3. Homebox not running

**Solutions:**

1. **Check networks match:**

   ```bash
   docker inspect homebox-mcp-server --format='{{.HostConfig.NetworkMode}}'
   docker inspect homebox --format='{{.HostConfig.NetworkMode}}'
   ```

   These should be identical.

2. **Check Homebox container name:**

   ```bash
   docker ps --format '{{.Names}}' | grep homebox
   ```

   Use this exact name in HOMEBOX_URL

3. **Verify Homebox is accessible:**
   ```bash
   docker exec homebox-mcp-server ping homebox -c 3
   ```

### Claude Desktop can't connect

**For `docker exec` method:**

1. Verify Docker is accessible from your terminal:

   ```bash
   docker ps
   ```

2. Verify container is running:

   ```bash
   docker ps | grep homebox-mcp-server
   ```

3. Test manual connection:
   ```bash
   docker exec -i homebox-mcp-server node /app/dist/index.js
   ```
   (Press Ctrl+C to exit)

**For SSH method:**

1. Test SSH connection:

   ```bash
   ssh user@your-qnap-ip docker ps
   ```

2. Verify SSH keys are set up (password auth won't work with Claude)

### Container keeps restarting

**Check logs for error messages:**

```bash
docker logs homebox-mcp-server --tail 100
```

**Common causes:**

- Configuration error causing immediate exit
- Authentication failure
- Missing dependencies (shouldn't happen with proper Docker build)

### "No configuration found"

The container couldn't find configuration. Verify:

1. **Environment variables are set:**

   ```bash
   docker inspect homebox-mcp-server --format='{{.Config.Env}}'
   ```

   Should show HOMEBOX_URL, HOMEBOX_EMAIL, HOMEBOX_PASSWORD

2. **OR config file is mounted:**
   ```bash
   docker exec homebox-mcp-server ls -la /config/
   ```
   Should show config.json

## Updating the Container

To update the MCP server with new code:

1. **Stop and remove old container:**

   ```bash
   docker stop homebox-mcp-server
   docker rm homebox-mcp-server
   ```

2. **Pull latest code:**

   ```bash
   cd /share/Container/homebox-mcp
   git pull
   ```

3. **Rebuild image:**

   ```bash
   docker build -t homebox-mcp-server .
   ```

4. **Start new container** (use same docker run command as before)

Or with docker-compose:

```bash
docker-compose down
git pull
docker-compose up -d --build
```

## Security Best Practices

1. **Use environment variables** instead of config files when possible
2. **Set restrictive permissions** on config.json: `chmod 600 config.json`
3. **Use secrets management** for production (Docker secrets, etc.)
4. **Regularly update** the container image
5. **Use HTTPS** for Homebox if exposed to internet
6. **Don't expose MCP server ports** - it should only communicate via stdio

## Additional Resources

- [Main README](README.md) - General setup and usage
- [EXAMPLES.md](EXAMPLES.md) - Query examples
- [QUICKSTART.md](QUICKSTART.md) - Non-Docker setup guide
- [Homebox Documentation](https://homebox.software/)
- [QNAP Container Station Guide](https://www.qnap.com/en/how-to/tutorial/article/how-to-use-container-station)
