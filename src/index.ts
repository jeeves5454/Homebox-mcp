#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load package.json for version info
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const VERSION = packageJson.version;

// Configuration interface
interface HomeboxConfig {
  homeboxUrl: string;
  email: string;
  password: string;
}

// Homebox API client
class HomeboxClient {
  private axios: AxiosInstance;
  private config: HomeboxConfig;
  private authToken: string | null = null;
  // Homebox renamed /api/v1/labels to /api/v1/tags in v0.23.0.
  // Detected at startup via /api/v1/status and set in authenticate().
  private tagEndpoint: string = "/api/v1/tags";

  constructor(config: HomeboxConfig) {
    this.config = config;
    this.axios = axios.create({
      baseURL: config.homeboxUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async authenticate(): Promise<void> {
    try {
      const response = await this.axios.post("/api/v1/users/login", {
        username: this.config.email,
        password: this.config.password,
      });

      if (response.data && response.data.token) {
        const token: string = response.data.token;
        this.authToken = token;
        const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
        this.axios.defaults.headers.common["Authorization"] = authHeader;
      } else {
        throw new Error("Authentication failed: No token received");
      }
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.message}`);
    }

    try {
      const status = await this.axios.get("/api/v1/status");
      const version: string = status.data?.build?.version ?? "v0.0.0";
      // Strip leading "v" and compare numerically
      const [major, minor] = version.replace(/^v/, "").split(".").map(Number);
      // Tags endpoint introduced in v0.23.0
      if (major === 0 && minor < 23) {
        this.tagEndpoint = "/api/v1/labels";
      }
      console.error(`Homebox version: ${version} — using tag endpoint: ${this.tagEndpoint}`);
    } catch {
      console.error(`Could not detect Homebox version, defaulting to ${this.tagEndpoint}`);
    }
  }

  async searchItems(query: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get("/api/v1/items", {
        params: { q: query },
      });
      const data = response.data;
      if (data?.items) data.items = data.items.map((i: any) => this.normalizeItem(i));
      return data;
    } catch (error: any) {
      throw new Error(`Failed to search items: ${error.message}`);
    }
  }

  async getItem(itemId: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get(`/api/v1/items/${itemId}`);
      return this.normalizeItem(response.data);
    } catch (error: any) {
      throw new Error(`Failed to get item: ${error.message}`);
    }
  }

  async listLocations(): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get("/api/v1/locations");
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to list locations: ${error.message}`);
    }
  }

  async getLocation(locationId: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get(`/api/v1/locations/${locationId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get location: ${error.message}`);
    }
  }

  async listTags(): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get(this.tagEndpoint);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to list tags: ${error.message}`);
    }
  }

  async getTag(tagId: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get(`${this.tagEndpoint}/${tagId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get tag: ${error.message}`);
    }
  }

  async getItemsByLocation(locationId: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get(`/api/v1/locations/${locationId}/items`);
      return (response.data ?? []).map((i: any) => this.normalizeItem(i));
    } catch (error: any) {
      throw new Error(`Failed to get items by location: ${error.message}`);
    }
  }

  async getItemsByTag(tagId: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get(`${this.tagEndpoint}/${tagId}/items`);
      return (response.data ?? []).map((i: any) => this.normalizeItem(i));
    } catch (error: any) {
      throw new Error(`Failed to get items by tag: ${error.message}`);
    }
  }

  // Homebox < v0.23.0 returns item.labels; v0.23.0+ returns item.tags.
  // Normalize to always expose item.tags so callers see a consistent shape.
  private normalizeItem(item: any): any {
    if (item && item.labels !== undefined && item.tags === undefined) {
      const { labels, ...rest } = item;
      return { ...rest, tags: labels };
    }
    return item;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.authToken) {
      await this.authenticate();
    }
  }
}

// Load configuration from multiple sources
// Priority: 1. /config/config.json (Docker volume), 2. Environment variables, 3. ./config.json
function loadConfig(): HomeboxConfig {
  // Try Docker volume mount location first
  const dockerConfigPath = "/config/config.json";
  if (existsSync(dockerConfigPath)) {
    try {
      const configData = readFileSync(dockerConfigPath, "utf-8");
      const config = JSON.parse(configData);
      console.error("Loaded configuration from /config/config.json");
      return config;
    } catch (error: any) {
      console.error("Error loading /config/config.json:", error.message);
    }
  }

  // Try environment variables
  if (process.env.HOMEBOX_URL && process.env.HOMEBOX_EMAIL && process.env.HOMEBOX_PASSWORD) {
    console.error("Loaded configuration from environment variables");
    return {
      homeboxUrl: process.env.HOMEBOX_URL,
      email: process.env.HOMEBOX_EMAIL,
      password: process.env.HOMEBOX_PASSWORD,
    };
  }

  // Try local config.json
  const localConfigPath = join(__dirname, "..", "config.json");
  if (existsSync(localConfigPath)) {
    try {
      const configData = readFileSync(localConfigPath, "utf-8");
      const config = JSON.parse(configData);
      console.error("Loaded configuration from config.json");
      return config;
    } catch (error: any) {
      console.error("Error loading config.json:", error.message);
    }
  }

  // No configuration found
  console.error("Error: No configuration found!");
  console.error("Please provide configuration via one of:");
  console.error("  1. Environment variables: HOMEBOX_URL, HOMEBOX_EMAIL, HOMEBOX_PASSWORD");
  console.error("  2. /config/config.json (for Docker)");
  console.error("  3. config.json (copy from config.json.example)");
  process.exit(1);
}

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "search_items",
    description: "Search for items in your Homebox inventory by name, description, or other fields. Returns a list of matching items with their basic information.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find items",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_item",
    description: "Get detailed information about a specific item by its ID. Returns complete item details including name, description, location, tags, purchase info, warranty info, and more.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The ID of the item to retrieve",
        },
      },
      required: ["itemId"],
    },
  },
  {
    name: "list_locations",
    description: "List all locations in your Homebox inventory. Locations are where items are stored (e.g., 'Kitchen', 'Garage', 'Living Room'). Returns location names, IDs, and descriptions.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_location",
    description: "Get detailed information about a specific location by its ID, including its name, description, and parent location if nested.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "The ID of the location to retrieve",
        },
      },
      required: ["locationId"],
    },
  },
  {
    name: "list_tags",
    description: "List all tags in your Homebox inventory. Tags are used to categorize items (e.g., 'Electronics', 'Important', 'Fragile'). Returns tag names, IDs, and descriptions.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_tag",
    description: "Get detailed information about a specific tag by its ID, including its name, description, and color.",
    inputSchema: {
      type: "object",
      properties: {
        tagId: {
          type: "string",
          description: "The ID of the tag to retrieve",
        },
      },
      required: ["tagId"],
    },
  },
  {
    name: "get_items_by_location",
    description: "Get all items stored in a specific location. Useful for finding everything in a particular room or storage area.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "The ID of the location",
        },
      },
      required: ["locationId"],
    },
  },
  {
    name: "get_items_by_tag",
    description: "Get all items that have a specific tag. Useful for finding all items in a category (e.g., all electronics, all important items).",
    inputSchema: {
      type: "object",
      properties: {
        tagId: {
          type: "string",
          description: "The ID of the tag",
        },
      },
      required: ["tagId"],
    },
  },
];

// Main server setup
async function main() {
  console.error("=".repeat(60));
  console.error("Homebox MCP Server v" + VERSION);
  console.error("=".repeat(60));
  console.error("Node version:", process.version);
  console.error("Platform:", process.platform);
  console.error("Build date:", new Date().toISOString());

  try {
    console.error("Loading configuration...");
    const config = loadConfig();
    console.error("Configuration loaded successfully");

    console.error("Creating Homebox client...");
    const homeboxClient = new HomeboxClient(config);

    // Test authentication on startup
    console.error("Attempting authentication with Homebox...");
    try {
      await homeboxClient.authenticate();
      console.error("Successfully authenticated with Homebox");
    } catch (error: any) {
      console.error("Failed to authenticate with Homebox:", error.message);
      console.error("Please check your config.json settings");
      process.exit(1);
    }

    console.error("Creating MCP Server instance...");
    const server = new Server(
      {
        name: "homebox-mcp-server",
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    console.error("MCP Server instance created");

    console.error("Setting up request handlers...");
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error("ListTools request received");
      return { tools: TOOLS };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error("CallTool request received:", request.params.name);
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error("Missing arguments");
        }

        switch (name) {
        case "search_items": {
          const result = await homeboxClient.searchItems(args.query as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_item": {
          const result = await homeboxClient.getItem(args.itemId as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "list_locations": {
          const result = await homeboxClient.listLocations();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_location": {
          const result = await homeboxClient.getLocation(args.locationId as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "list_tags": {
          const result = await homeboxClient.listTags();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_tag": {
          const result = await homeboxClient.getTag(args.tagId as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_items_by_location": {
          const result = await homeboxClient.getItemsByLocation(args.locationId as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_items_by_tag": {
          const result = await homeboxClient.getItemsByTag(args.tagId as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
    });
    console.error("Request handlers configured");

    // Start the server
    console.error("Creating stdio transport...");
    const transport = new StdioServerTransport();
    console.error("Stdio transport created");

    console.error("Connecting server to transport...");
    await server.connect(transport);
    console.error("Homebox MCP Server running on stdio");
    console.error("Server is ready to accept requests");

  } catch (error: any) {
    console.error("Error in main():", error);
    console.error("Stack trace:", error.stack);
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  console.error("Error details:", JSON.stringify(error, null, 2));
  process.exit(1);
});
