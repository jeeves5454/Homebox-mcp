# Docker Deployment Guide for Homebox MCP Server

This guide covers deploying the Homebox MCP Server using Docker, with specific instructions for QNAP Container Station users.

## Transport Modes

The server supports two transport modes selected by the `PORT` environment variable:

| Mode                       | When              | Use case                                    |
| -------------------------- | ----------------- | ------------------------------------------- |
| **HTTP** (Streamable HTTP) | `PORT` is set     | **claude.ai** and any HTTP-based MCP client |
| **stdio**                  | `PORT` is not set | **Claude Desktop** via `docker exec`        |

The default `docker-compose.yml` and `Dockerfile` set `PORT=8811`, so HTTP mode is the default for Docker deployments.

## Table of Contents

- [Quick Start with Docker](#quick-start-with-docker)
- [Connecting to claude.ai (HTTP Mode)](#connecting-to-claudeai-http-mode)
- [Connecting to Claude Desktop (stdio Mode)](#connecting-to-claude-desktop-stdio-mode)
- [QNAP Container Station Deployment](#qnap-container-station-deployment)
- [Configuration Options](#configuration-options)
- [Network Configuration](#network-configuration)
- [Troubleshooting](#troubleshooting)

## Quick Start with Docker

### Method 1: Using Docker Compose (Recommended)

1. **Edit `docker-compose.yml`** and update your credentials:

   ```yaml
   environment:
     - HOMEBOX_URL=http://homebox:7745
     - HOMEBOX_EMAIL=your-email@example.com
     - HOMEBOX_PASSWORD=your-password
   ```

2. **Start the container:**

   ```bash
   docker compose up -d
   ```

3. **Verify it's running:**

   ```bash
   curl http://localhost:8811/health
   # → {"status":"ok","version":"1.1.0"}
   ```

4. **View logs:**
   ```bash
   docker compose logs -f homebox-mcp
   ```

### Method 2: Using Docker CLI

```bash
docker build -t homebox-mcp-server .

docker run -d \
  --name homebox-mcp-server \
  --restart unless-stopped \
  -e HOMEBOX_URL=http://homebox:7745 \
  -e HOMEBOX_EMAIL=your-email@example.com \
  -e HOMEBOX_PASSWORD=your-password \
  -e PORT=8811 \
  -p 8811:8811 \
  --network homebox-network \
  homebox-mcp-server
```

## Connecting to claude.ai (HTTP Mode)

The container exposes an MCP-over-HTTP endpoint at `http://<host>:8811/mcp`. claude.ai connects to this directly as a remote MCP server.

### Requirements

- Port 8811 must be reachable from the internet (or from Cloudflare Tunnel / ngrok / etc.)
- The container must be running with `PORT=8811` (the default)

### Setup

1. Make sure your container is running and port 8811 is exposed (it is by default in `docker-compose.yml`).

2. If your server is behind NAT, expose port 8811 publicly. Options:
   - **Cloudflare Tunnel** (recommended — no open ports required):
     ```bash
     cloudflared tunnel --url http://localhost:8811
     ```
   - **Port forwarding** on your router: forward external port 8811 → internal host:8811
   - **Reverse proxy** (nginx, Caddy, Traefik) with TLS termination

3. In claude.ai, go to **Settings → Integrations → Add custom integration** and enter:

   ```
   https://your-host-or-tunnel-url/mcp
   ```

4. Claude will connect, authenticate, and list the available tools automatically.

### Health Check

```
GET http://localhost:8811/health
→ {"status":"ok","version":"1.1.0"}
```

## Connecting to Claude Desktop (stdio Mode)

Claude Desktop launches the MCP server as a subprocess and communicates over stdio. The simplest way to do this with Docker is `docker exec`.

### Using docker exec

1. Start the container **without** `PORT` set (or override it to empty) so it runs in stdio mode:

   ```yaml
   # docker-compose.yml excerpt
   environment:
     - HOMEBOX_URL=http://homebox:7745
     - HOMEBOX_EMAIL=your-email@example.com
     - HOMEBOX_PASSWORD=your-password
     # omit PORT to use stdio mode
   ```

   Or keep `PORT=8811` running and just use `docker exec` to launch a separate stdio process inside the same container — this works fine since the server binary decides its mode at startup based on `PORT`.

2. Edit your Claude Desktop config:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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
         ],
         "env": {}
       }
     }
   }
   ```

   > `docker exec -i` attaches stdin/stdout to the new process. `PORT` is not set in this exec context, so the server starts in stdio mode even if the container's default is HTTP mode.

3. Restart Claude Desktop.

### For Remote QNAP (SSH)

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

SSH key authentication must be configured (password auth won't work with Claude Desktop).

## QNAP Container Station Deployment

### Prerequisites

1. QNAP NAS with Container Station installed
2. Homebox already running in Container Station
3. SSH access to your QNAP (optional but helpful)

### Step 1: Prepare Your Files

1. **Connect to your QNAP** via SSH or File Station

2. **Create a folder** for the MCP server:
   - Location: `/share/Container/homebox-mcp`

3. **Clone the repository:**
   ```bash
   cd /share/Container
   git clone <your-repo-url> homebox-mcp
   cd homebox-mcp
   ```

### Step 2: Configure Your Settings

**Option A: Environment Variables (Recommended)**

Set these in Container Station when creating the container (Step 3).

**Option B: Config File**

```bash
cp config.json.example /share/Container/homebox-mcp/config.json
# edit config.json with your credentials
chmod 600 /share/Container/homebox-mcp/config.json
```

### Step 3: Deploy in Container Station

#### Using the Container Station UI

1. Open Container Station → **Images** → **Create** → **Create Application**

2. Paste this configuration (adjust network name to match your Homebox container):

   ```yaml
   services:
     homebox-mcp:
       build: /share/Container/homebox-mcp
       container_name: homebox-mcp-server
       restart: unless-stopped
       environment:
         - HOMEBOX_URL=http://homebox:7745
         - HOMEBOX_EMAIL=your-email@example.com
         - HOMEBOX_PASSWORD=your-password
         - PORT=8811
       ports:
         - "8811:8811"
       networks:
         - qnet-static-eth0-your-network-id
   ```

   To use a mounted config file instead of environment variables:

   ```yaml
   volumes:
     - /share/Container/homebox-mcp/config.json:/config/config.json:ro
   ```

3. Replace `qnet-static-eth0-your-network-id` with your actual network name (must match Homebox's network).

4. Click **Validate and Apply** → **Create**.

#### Using Docker CLI on QNAP

```bash
cd /share/Container/homebox-mcp
docker build -t homebox-mcp-server .

# Find your Homebox network
docker inspect homebox --format='{{.HostConfig.NetworkMode}}'
# e.g. qnet-static-eth0-xxxxxx

docker run -d \
  --name homebox-mcp-server \
  --restart unless-stopped \
  -e HOMEBOX_URL=http://homebox:7745 \
  -e HOMEBOX_EMAIL=your-email@example.com \
  -e HOMEBOX_PASSWORD=your-password \
  -e PORT=8811 \
  -p 8811:8811 \
  --network qnet-static-eth0-xxxxxx \
  homebox-mcp-server
```

### Step 4: Verify Deployment

```bash
docker logs homebox-mcp-server
# Should show: Homebox MCP Server running on HTTP port 8811

curl http://localhost:8811/health
# → {"status":"ok","version":"1.1.0"}
```

## Configuration Options

The server reads credentials in this priority order:

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

Include `config.json` at build time (not recommended — credentials end up in the image layer).

## Network Configuration

### Finding Your Homebox Container Network

```bash
docker inspect homebox --format='{{.HostConfig.NetworkMode}}'
```

### Connecting Both Containers

Both containers must be on the same Docker network so the MCP server can reach Homebox by container name:

```yaml
networks:
  - qnet-static-eth0-xxxxx # same as Homebox
```

Use the container name as the hostname in `HOMEBOX_URL` (e.g. `http://homebox:7745`).

## Troubleshooting

### Container won't start / exits immediately

```bash
docker logs homebox-mcp-server
```

Common causes:

- Missing environment variables (`HOMEBOX_URL`, `HOMEBOX_EMAIL`, `HOMEBOX_PASSWORD`)
- Invalid `config.json` syntax
- Permission denied on config file

### "Authentication failed" in logs

- Wrong email or password
- Homebox container not running or not reachable
- Containers on different networks

Verify network reachability:

```bash
docker exec homebox-mcp-server wget -qO- http://homebox:7745/api/v1/status
```

### Health check returns nothing / connection refused

- Confirm `PORT=8811` is set in the container environment
- Confirm `-p 8811:8811` port mapping is present
- Confirm the container is running: `docker ps | grep homebox-mcp`

### claude.ai can't reach the server

- Port 8811 must be publicly reachable (or tunnelled). Test from outside your network:
  ```
  curl https://your-public-url/health
  ```
- If behind NAT with no tunnel, set up Cloudflare Tunnel or configure port forwarding.

### Claude Desktop can't connect (docker exec method)

Verify the exec command works manually:

```bash
docker exec -i homebox-mcp-server node /app/dist/index.js
# Should print startup logs to stderr, then wait for JSON-RPC on stdin
# Press Ctrl+C to exit
```

If this fails, check that the container is running and the image was built successfully.

### Container keeps restarting

```bash
docker logs homebox-mcp-server --tail 50
```

Usually a configuration error on startup. Fix the credentials or config file, then restart.

## Updating the Container

```bash
# With docker compose
docker compose down
git pull
docker compose up -d --build

# With docker CLI
docker stop homebox-mcp-server && docker rm homebox-mcp-server
git pull
docker build -t homebox-mcp-server .
docker run -d ...  # same flags as before
```

## Security Notes

- Credentials in environment variables are visible via `docker inspect`. For production, use [Docker secrets](https://docs.docker.com/engine/swarm/secrets/) or a secrets manager.
- The `/mcp` endpoint has no authentication layer — place it behind a reverse proxy with TLS if exposing publicly, or use Cloudflare Tunnel which provides its own security layer.
- The `/health` endpoint leaks the server version but no credentials.
- `config.json` should have permissions `600` if used.

## Additional Resources

- [Main README](README.md) - General setup and usage
- [EXAMPLES.md](EXAMPLES.md) - Query examples
- [QNAP Native Installation](QNAP-NATIVE.md)
- [Homebox Documentation](https://homebox.software/)
- [QNAP Container Station Guide](https://www.qnap.com/en/how-to/tutorial/article/how-to-use-container-station)
