#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";

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
  // Homebox renamed /api/v1/labels to /api/v1/tags in v0.23.0, and the
  // corresponding item filter param from `labels` to `tags` at the same time.
  // Both are detected at startup via /api/v1/status and set in authenticate().
  private tagEndpoint: string = "/api/v1/tags";
  private tagFilterParam: string = "tags";

  constructor(config: HomeboxConfig) {
    this.config = config;
    this.axios = axios.create({
      baseURL: config.homeboxUrl,
      headers: {
        "Content-Type": "application/json",
      },
      // Homebox expects repeated keys for array params (e.g. locations=a&locations=b),
      // not the axios default bracket notation (locations[0]=a).
      paramsSerializer: (params) => {
        const parts: string[] = [];
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) continue;
          const values = Array.isArray(value) ? value : [value];
          for (const v of values) parts.push(`${key}=${encodeURIComponent(v)}`);
        }
        return parts.join("&");
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
        this.tagFilterParam = "labels";
      }
      console.error(`Homebox version: ${version} — using tag endpoint: ${this.tagEndpoint}, filter param: ${this.tagFilterParam}`);
    } catch {
      console.error(`Could not detect Homebox version, defaulting to ${this.tagEndpoint}`);
    }
  }

  async searchItems(query: string, locationId?: string, tagId?: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get("/api/v1/items", {
        params: {
          q: query,
          ...(locationId ? { locations: [locationId] } : {}),
          ...(tagId ? { [this.tagFilterParam]: [tagId] } : {}),
        },
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
      const response = await this.axios.get("/api/v1/items", { params: { locations: [locationId] } });
      return (response.data?.items ?? []).map((i: any) => this.normalizeItem(i));
    } catch (error: any) {
      throw new Error(`Failed to get items by location: ${error.message}`);
    }
  }

  async getItemsByTag(tagId: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.get("/api/v1/items", { params: { [this.tagFilterParam]: [tagId] } });
      return (response.data?.items ?? []).map((i: any) => this.normalizeItem(i));
    } catch (error: any) {
      throw new Error(`Failed to get items by tag: ${error.message}`);
    }
  }

  async createLocation(name: string, description?: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.post("/api/v1/locations", { name, description });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to create location: ${error.message}`);
    }
  }

  async deleteMaintenanceEntry(entryId: string): Promise<void> {
    await this.ensureAuthenticated();
    try {
      await this.axios.delete(`/api/v1/maintenance/${entryId}`);
    } catch (error: any) {
      throw new Error(`Failed to delete maintenance entry: ${error.message}`);
    }
  }

  async createMaintenanceEntry(
    itemId: string,
    name: string,
    completedDate?: string,
    scheduledDate?: string,
    description?: string,
    cost?: string
  ): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.post(`/api/v1/items/${itemId}/maintenance`, {
        name,
        completedDate,
        scheduledDate,
        description,
        cost,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to create maintenance entry: ${error.message}`);
    }
  }

  async updateItem(itemId: string, patch: Record<string, any>): Promise<any> {
    await this.ensureAuthenticated();
    try {
      // Fetch current state so we can implement PATCH semantics over Homebox's PUT API.
      const currentResponse = await this.axios.get(`/api/v1/items/${itemId}`);
      const current = currentResponse.data;

      // The GET response uses nested objects for location/tags, but PUT expects flat IDs.
      // Flatten those fields from current, then spread current + patch on top.
      // Fields absent from patch are preserved from current; null explicitly clears.
      const tagKey = this.tagFilterParam === "labels" ? "labelIds" : "tagIds";
      // Start from current item state, flattening nested objects to the IDs that PUT expects.
      const base: Record<string, any> = {
        ...current,
        locationId: current.location?.id,
        [tagKey]: (current.labels ?? current.tags ?? []).map((t: any) => t.id),
        parentId: current.parent?.id,
      };
      // Apply patch fields, remapping tagIds to the version-appropriate key if needed.
      const { tagIds, ...restPatch } = patch;
      const body: Record<string, any> = {
        ...base,
        ...restPatch,
        ...(tagIds !== undefined && { [tagKey]: tagIds }),
      };

      const response = await this.axios.put(`/api/v1/items/${itemId}`, body);
      return this.normalizeItem(response.data);
    } catch (error: any) {
      throw new Error(`Failed to update item: ${error.message}`);
    }
  }

  async createItem(
    name: string,
    locationId: string,
    description?: string,
    tagIds?: string[],
    parentId?: string
  ): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.post("/api/v1/items", {
        name,
        locationId,
        description,
        labelIds: tagIds,
        parentId,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to create item: ${error.message}`);
    }
  }

  async createTag(name: string, description?: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.post(this.tagEndpoint, { name, description });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to create tag: ${error.message}`);
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.ensureAuthenticated();
    try {
      await this.axios.delete(`/api/v1/items/${itemId}`);
    } catch (error: any) {
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  }

  async deleteLocation(locationId: string): Promise<void> {
    await this.ensureAuthenticated();
    try {
      await this.axios.delete(`/api/v1/locations/${locationId}`);
    } catch (error: any) {
      throw new Error(`Failed to delete location: ${error.message}`);
    }
  }

  async deleteTag(tagId: string): Promise<void> {
    await this.ensureAuthenticated();
    try {
      await this.axios.delete(`${this.tagEndpoint}/${tagId}`);
    } catch (error: any) {
      throw new Error(`Failed to delete tag: ${error.message}`);
    }
  }

  async proxyAttachment(itemId: string, attachmentId: string): Promise<{ body: ReadableStream | null; contentType: string; contentDisposition: string }> {
    await this.ensureAuthenticated();
    const token = this.authToken!;
    const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    const url = `${this.config.homeboxUrl}/api/v1/items/${itemId}/attachments/${attachmentId}`;
    const response = await fetch(url, { headers: { Authorization: authHeader } });
    if (!response.ok) {
      throw new Error(`Homebox returned ${response.status} ${response.statusText}`);
    }
    return {
      body: response.body,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      contentDisposition: response.headers.get("content-disposition") ?? "attachment",
    };
  }

  async deleteItemAttachment(itemId: string, attachmentId: string): Promise<void> {
    await this.ensureAuthenticated();
    try {
      await this.axios.delete(`/api/v1/items/${itemId}/attachments/${attachmentId}`);
    } catch (error: any) {
      throw new Error(`Failed to delete attachment: ${error.message}`);
    }
  }

  async updateItemAttachment(
    itemId: string,
    attachmentId: string,
    title?: string,
    type?: string,
    primary?: boolean
  ): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.put(
        `/api/v1/items/${itemId}/attachments/${attachmentId}`,
        { title, type, primary }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to update attachment: ${error.message}`);
    }
  }

  async uploadItemAttachment(
    itemId: string,
    url: string,
    name?: string,
    type?: string
  ): Promise<any> {
    await this.ensureAuthenticated();

    // Fetch the file from the given URL
    let fileArrayBuffer: ArrayBuffer;
    let contentType: string;
    let filename: string;
    try {
      const fetchResponse = await fetch(url);
      if (!fetchResponse.ok) {
        throw new Error(`HTTP ${fetchResponse.status} ${fetchResponse.statusText}`);
      }
      contentType = fetchResponse.headers.get("content-type") ?? "application/octet-stream";
      // Strip parameters (e.g. "application/pdf; charset=utf-8" → "application/pdf")
      contentType = contentType.split(";")[0].trim();
      fileArrayBuffer = await fetchResponse.arrayBuffer();
      // Derive filename from URL path if not provided
      const urlPath = new URL(url).pathname;
      filename = name ?? urlPath.split("/").filter(Boolean).pop() ?? "attachment";
    } catch (error: any) {
      throw new Error(`Failed to fetch attachment from URL: ${error.message}`);
    }

    try {
      const form = new FormData();
      const blob = new Blob([fileArrayBuffer], { type: contentType });
      form.append("file", blob, filename);
      form.append("name", name ?? filename);
      if (type) form.append("type", type);

      const response = await this.axios.post(
        `/api/v1/items/${itemId}/attachments`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to upload attachment: ${error.message}`);
    }
  }

  async updateLocation(locationId: string, name: string, description?: string, parentId?: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.put(`/api/v1/locations/${locationId}`, { id: locationId, name, description, parentId });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to update location: ${error.message}`);
    }
  }

  async updateTag(tagId: string, name: string, description?: string, color?: string, icon?: string, parentId?: string): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.put(`${this.tagEndpoint}/${tagId}`, { id: tagId, name, description, color, icon, parentId });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to update tag: ${error.message}`);
    }
  }

  async updateMaintenanceEntry(
    entryId: string,
    name: string,
    completedDate?: string,
    scheduledDate?: string,
    description?: string,
    cost?: string
  ): Promise<any> {
    await this.ensureAuthenticated();
    try {
      const response = await this.axios.put(`/api/v1/maintenance/${entryId}`, {
        name, completedDate, scheduledDate, description, cost,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to update maintenance entry: ${error.message}`);
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

// Base URL used to construct attachment proxy URLs returned by get_item_attachment.
// Set ATTACHMENT_BASE_URL to the public URL that routes to this server's /items/… path.
// This is independent of the MCP endpoint URL — use a separate path or hostname so your
// reverse proxy can route attachment traffic without conflicting with /mcp traffic.
// Example: ATTACHMENT_BASE_URL=https://example.com/homebox-mcp-attachments
// Falls back to http://localhost:{PORT} if unset (only useful for same-host clients).
function getAttachmentBaseUrl(port: number): string {
  const base = process.env.ATTACHMENT_BASE_URL?.replace(/\/$/, "");
  return base ?? `http://localhost:${port}`;
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
    description: "Search for items in your Homebox inventory by name, description, or other fields. Optionally filter by location or tag. Returns a list of matching items with their basic information.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find items",
        },
        locationId: {
          type: "string",
          description: "Optional: filter results to items in this location ID",
        },
        tagId: {
          type: "string",
          description: "Optional: filter results to items with this tag ID",
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
    description: "List all locations in your Homebox inventory. Locations are where items are stored (e.g., 'Office', 'Warehouse', 'Storage Room'). Returns location names, IDs, and descriptions.",
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
    description: "Get all items stored in a specific location. Useful for finding everything in a particular location or storage area.",
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
  {
    name: "delete_maintenance_entry",
    description: "Delete a maintenance entry by its ID. Note: use the top-level maintenance entry ID, not the item ID. The entry is permanently removed.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: {
          type: "string",
          description: "ID of the maintenance entry to delete",
        },
      },
      required: ["entryId"],
    },
  },
  {
    name: "create_maintenance_entry",
    description: "Record a maintenance event on an item. At least one of completedDate or scheduledDate must be provided (the API returns 500 otherwise). For completed work, set both to the same date. Cost must be a string, not a number (e.g. \"85.00\").",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item this maintenance entry belongs to",
        },
        name: {
          type: "string",
          description: "Name of the maintenance task (e.g. 'Annual service', 'Battery replacement')",
        },
        completedDate: {
          type: "string",
          description: "Date the work was completed, in ISO 8601 format with time component (e.g. 2026-05-01T00:00:00Z)",
        },
        scheduledDate: {
          type: "string",
          description: "Date the work is scheduled for, in ISO 8601 format with time component (e.g. 2026-06-01T00:00:00Z)",
        },
        description: {
          type: "string",
          description: "Notes about the work performed, findings, or next steps",
        },
        cost: {
          type: "string",
          description: "Cost of the service as a numeric string (e.g. \"85.00\")",
        },
      },
      required: ["itemId", "name"],
    },
  },
  {
    name: "update_item",
    description: "Partially update an item by ID. Only include fields you want to change — omitted fields are left as-is. Pass null to explicitly clear a field.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item to update",
        },
        name: {
          type: "string",
          description: "Name of the item",
        },
        description: {
          type: "string",
          description: "Description of the item: model details, specs, notable characteristics (max 1000 characters).",
        },
        quantity: {
          type: "integer",
          description: "Number of units",
        },
        locationId: {
          type: "string",
          description: "ID of the location where the item is stored",
        },
        tagIds: {
          type: "array",
          items: { type: "string" },
          description: "List of tag IDs to attach to the item (replaces existing tags)",
        },
        parentId: {
          type: "string",
          description: "ID of a parent item, if this item is a sub-item",
        },
        assetId: {
          type: "string",
          description: "Asset tracking number",
        },
        archived: {
          type: "boolean",
          description: "Whether the item is archived",
        },
        insured: {
          type: "boolean",
          description: "Whether the item is insured",
        },
        serialNumber: {
          type: "string",
          description: "Serial number of the item",
        },
        modelNumber: {
          type: "string",
          description: "Model number of the item",
        },
        manufacturer: {
          type: "string",
          description: "Manufacturer or brand",
        },
        purchaseTime: {
          type: "string",
          description: "Date of purchase in ISO 8601 format with time component (e.g. 2025-08-28T00:00:00Z)",
        },
        purchaseFrom: {
          type: "string",
          description: "Vendor or store where the item was purchased",
        },
        purchasePrice: {
          type: "string",
          description: "Original purchase price as a numeric string (no currency symbol)",
        },
        lifetimeWarranty: {
          type: "boolean",
          description: "Whether the item has a lifetime warranty",
        },
        warrantyExpires: {
          type: "string",
          description: "Warranty expiration date in ISO 8601 format with time component (e.g. 2028-08-28T00:00:00Z)",
        },
        warrantyDetails: {
          type: "string",
          description: "Free-text warranty description (e.g. 'Parts: 3 years. Labor: 1 year.')",
        },
        soldTime: {
          type: "string",
          description: "Date the item was sold or retired, in ISO 8601 format with time component",
        },
        soldTo: {
          type: "string",
          description: "Name of the buyer, or empty string if retired without a sale",
        },
        soldPrice: {
          type: "string",
          description: "Sale price as a numeric string, or '0' if retired without a sale",
        },
        soldNotes: {
          type: "string",
          description: "Notes about the sale or retirement (e.g. why retired, what replaced it)",
        },
        notes: {
          type: "string",
          description: "Additional structured properties that don't fit a native field (e.g. color, voltage, compatible accessories). Max 1000 characters.",
        },
        fields: {
          type: "array",
          description: "Custom fields. Each field has a name, type ('text', 'number', 'boolean', 'date'), and a corresponding value key (textValue, numberValue, booleanValue, timeValue).",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              textValue: { type: "string" },
              numberValue: { type: "number" },
              booleanValue: { type: "boolean" },
              timeValue: { type: "string" },
            },
          },
        },
      },
      required: ["itemId"],
    },
  },
  {
    name: "create_item",
    description: "Create a new item in Homebox. Only a subset of fields can be set on creation (name, locationId, description, tagIds, parentId). Use update_item afterward to set warranty, purchase info, serial number, custom fields, and other metadata. Returns the created item including its new ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the item",
        },
        locationId: {
          type: "string",
          description: "ID of the location where the item is stored",
        },
        description: {
          type: "string",
          description: "Description of the item (max 1000 characters)",
        },
        tagIds: {
          type: "array",
          items: { type: "string" },
          description: "List of tag IDs to attach to the item",
        },
        parentId: {
          type: "string",
          description: "ID of a parent item, if this item is a sub-item",
        },
      },
      required: ["name", "locationId"],
    },
  },
  {
    name: "create_tag",
    description: "Create a new tag in Homebox. Tags are used to categorize items across locations (e.g., 'Electronics', 'Fragile', 'High Value'). Returns the created tag including its new ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the tag",
        },
        description: {
          type: "string",
          description: "Optional description of the tag",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "create_location",
    description: "Create a new location in Homebox. Locations are physical places where items are stored (e.g., 'Office', 'Storage Room'). Returns the created location including its new ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the location",
        },
        description: {
          type: "string",
          description: "Optional description of the location",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_item",
    description: "Permanently delete an item by ID. This cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item to delete",
        },
      },
      required: ["itemId"],
    },
  },
  {
    name: "delete_location",
    description: "Permanently delete a location by ID. Do not delete a location that still contains items — deletion cascades and removes all items in it.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "ID of the location to delete",
        },
      },
      required: ["locationId"],
    },
  },
  {
    name: "delete_tag",
    description: "Permanently delete a tag by ID. Items that had this tag will have it removed.",
    inputSchema: {
      type: "object",
      properties: {
        tagId: {
          type: "string",
          description: "ID of the tag to delete",
        },
      },
      required: ["tagId"],
    },
  },
  {
    name: "get_item_attachment",
    description: "Get download access to an attachment from a Homebox item. Returns two content items: (1) a text/JSON object with an 'url' field — an HTTP URL served by this MCP server as an authenticated proxy, usable for cross-MCP file transfer by passing it to another MCP's upload tool; (2) a resource_link with the same URI — use this for reading the file content via resources/read without triggering HTTP fetch restrictions. Only available in HTTP mode (PORT must be set). The attachment ID, title, and mimeType are found in the item's attachments array returned by get_item.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item the attachment belongs to",
        },
        attachmentId: {
          type: "string",
          description: "ID of the attachment",
        },
        title: {
          type: "string",
          description: "Filename for the attachment (from the title field in the attachments array). Used to make the URL human-readable.",
        },
        mimeType: {
          type: "string",
          description: "MIME type of the attachment (from the mimeType field in the attachments array), if known. Included in the resource_link so clients can handle the content correctly.",
        },
      },
      required: ["itemId", "attachmentId", "title"],
    },
  },
  {
    name: "delete_item_attachment",
    description: "Permanently delete an attachment from an item by attachment ID. The attachment ID is found in the item's attachments array (get_item returns it). This cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item the attachment belongs to",
        },
        attachmentId: {
          type: "string",
          description: "ID of the attachment to delete",
        },
      },
      required: ["itemId", "attachmentId"],
    },
  },
  {
    name: "update_item_attachment",
    description: "Update the metadata of an existing attachment (title, type, or primary flag). Returns the updated item JSON. The attachment ID is found in the item's attachments array.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item the attachment belongs to",
        },
        attachmentId: {
          type: "string",
          description: "ID of the attachment to update",
        },
        title: {
          type: "string",
          description: "New display name for the attachment",
        },
        type: {
          type: "string",
          enum: ["photo", "manual", "warranty", "attachment", "receipt", "thumbnail"],
          description: "New attachment type",
        },
        primary: {
          type: "boolean",
          description: "Whether this attachment is the primary photo for the item",
        },
      },
      required: ["itemId", "attachmentId"],
    },
  },
  {
    name: "upload_item_attachment",
    description: "Fetch a file from a URL and upload it as an attachment to an existing Homebox item. The file is fetched server-side, so the URL must be reachable from the MCP server. Returns the updated item JSON.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of the item to attach the file to",
        },
        url: {
          type: "string",
          description: "URL to fetch the file from. Must be accessible from the MCP server.",
        },
        name: {
          type: "string",
          description: "Display name for the attachment. Defaults to the filename from the URL.",
        },
        type: {
          type: "string",
          enum: ["photo", "manual", "warranty", "attachment", "receipt", "thumbnail"],
          description: "Attachment type. Defaults to 'attachment' if omitted.",
        },
      },
      required: ["itemId", "url"],
    },
  },
  {
    name: "update_location",
    description: "Update an existing location's name, description, or parent location.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "ID of the location to update",
        },
        name: {
          type: "string",
          description: "New name for the location",
        },
        description: {
          type: "string",
          description: "New description for the location",
        },
        parentId: {
          type: "string",
          description: "ID of a parent location to nest this location under, or omit to make it top-level",
        },
      },
      required: ["locationId", "name"],
    },
  },
  {
    name: "update_tag",
    description: "Update an existing tag's name, description, color, icon, or parent tag.",
    inputSchema: {
      type: "object",
      properties: {
        tagId: {
          type: "string",
          description: "ID of the tag to update",
        },
        name: {
          type: "string",
          description: "New name for the tag",
        },
        description: {
          type: "string",
          description: "New description for the tag",
        },
        color: {
          type: "string",
          description: "Hex color code for the tag (e.g. '#ff0000')",
        },
        icon: {
          type: "string",
          description: "Icon identifier for the tag",
        },
        parentId: {
          type: "string",
          description: "ID of a parent tag to nest this tag under, or omit to make it top-level",
        },
      },
      required: ["tagId", "name"],
    },
  },
  {
    name: "update_maintenance_entry",
    description: "Update an existing maintenance entry on an item. At least one of completedDate or scheduledDate must be provided. Cost must be a numeric string (e.g. \"85.00\").",
    inputSchema: {
      type: "object",
      properties: {
        entryId: {
          type: "string",
          description: "ID of the maintenance entry to update",
        },
        name: {
          type: "string",
          description: "Name of the maintenance task",
        },
        completedDate: {
          type: "string",
          description: "Date the work was completed, in ISO 8601 format with time component (e.g. 2026-05-01T00:00:00Z)",
        },
        scheduledDate: {
          type: "string",
          description: "Date the work is scheduled for, in ISO 8601 format with time component (e.g. 2026-06-01T00:00:00Z)",
        },
        description: {
          type: "string",
          description: "Notes about the work performed, findings, or next steps",
        },
        cost: {
          type: "string",
          description: "Cost of the service as a numeric string (e.g. \"85.00\")",
        },
      },
      required: ["entryId", "name"],
    },
  },
];

function setupHandlers(server: Server, homeboxClient: HomeboxClient, attachmentBaseUrl?: string): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("ListTools request received");
    return { tools: TOOLS };
  });

  // resources/read: resolves attachment proxy URLs returned as resource_links by get_item_attachment.
  // Allows agents on platforms that restrict HTTP fetching of tool-generated URLs (e.g. claude.ai)
  // to read attachment content through the MCP protocol instead.
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (!attachmentBaseUrl || !uri.startsWith(attachmentBaseUrl)) {
      throw new Error(`Unknown resource URI: ${uri}`);
    }
    const { body, contentType } = await homeboxClient.proxyAttachment(
      // Extract itemId and attachmentId from the URL path: /items/{itemId}/attachments/{attachmentId}/{filename}
      ...(() => {
        const path = new URL(uri).pathname;
        const m = path.match(/\/items\/([^/]+)\/attachments\/([^/]+)\//);
        if (!m) throw new Error(`Cannot parse attachment URI: ${uri}`);
        return [m[1], m[2]] as [string, string];
      })()
    );
    if (!body) throw new Error("Empty response from Homebox");
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    const isText = contentType.startsWith("text/");
    return {
      contents: [{
        uri,
        mimeType: contentType,
        ...(isText
          ? { text: new TextDecoder().decode(merged) }
          : { blob: Buffer.from(merged).toString("base64") }),
      }],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.error("CallTool request received:", request.params.name);
    const { name, arguments: args } = request.params;

    try {
      if (!args) {
        throw new Error("Missing arguments");
      }

      switch (name) {
      case "search_items": {
        const result = await homeboxClient.searchItems(
          args.query as string,
          args.locationId as string | undefined,
          args.tagId as string | undefined,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_item": {
        const result = await homeboxClient.getItem(args.itemId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_locations": {
        const result = await homeboxClient.listLocations();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_location": {
        const result = await homeboxClient.getLocation(args.locationId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_tags": {
        const result = await homeboxClient.listTags();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_tag": {
        const result = await homeboxClient.getTag(args.tagId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_items_by_location": {
        const result = await homeboxClient.getItemsByLocation(args.locationId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_items_by_tag": {
        const result = await homeboxClient.getItemsByTag(args.tagId as string);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_maintenance_entry": {
        await homeboxClient.deleteMaintenanceEntry(args.entryId as string);
        return {
          content: [{ type: "text", text: "Maintenance entry deleted successfully." }],
        };
      }

      case "create_maintenance_entry": {
        const result = await homeboxClient.createMaintenanceEntry(
          args.itemId as string,
          args.name as string,
          args.completedDate as string | undefined,
          args.scheduledDate as string | undefined,
          args.description as string | undefined,
          args.cost as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_item": {
        const { itemId, ...data } = args as { itemId: string; [key: string]: any };
        const result = await homeboxClient.updateItem(itemId, data);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_item": {
        const result = await homeboxClient.createItem(
          args.name as string,
          args.locationId as string,
          args.description as string | undefined,
          args.tagIds as string[] | undefined,
          args.parentId as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_tag": {
        const result = await homeboxClient.createTag(
          args.name as string,
          args.description as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_location": {
        const result = await homeboxClient.createLocation(
          args.name as string,
          args.description as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_item": {
        await homeboxClient.deleteItem(args.itemId as string);
        return {
          content: [{ type: "text", text: "Item deleted successfully." }],
        };
      }

      case "delete_location": {
        await homeboxClient.deleteLocation(args.locationId as string);
        return {
          content: [{ type: "text", text: "Location deleted successfully." }],
        };
      }

      case "delete_tag": {
        await homeboxClient.deleteTag(args.tagId as string);
        return {
          content: [{ type: "text", text: "Tag deleted successfully." }],
        };
      }

        case "update_location": {
          const result = await homeboxClient.updateLocation(
            args.locationId as string,
            args.name as string,
            args.description as string | undefined,
            args.parentId as string | undefined
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "update_tag": {
          const result = await homeboxClient.updateTag(
            args.tagId as string,
            args.name as string,
            args.description as string | undefined,
            args.color as string | undefined,
            args.icon as string | undefined,
            args.parentId as string | undefined
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "update_maintenance_entry": {
          const result = await homeboxClient.updateMaintenanceEntry(
            args.entryId as string,
            args.name as string,
            args.completedDate as string | undefined,
            args.scheduledDate as string | undefined,
            args.description as string | undefined,
            args.cost as string | undefined
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

      case "get_item_attachment": {
        if (!attachmentBaseUrl) {
          throw new Error("get_item_attachment is only available in HTTP mode (PORT must be set)");
        }
        const itemId = args.itemId as string;
        const attachmentId = args.attachmentId as string;
        const encodedTitle = encodeURIComponent(args.title as string);
        const title = args.title as string;
        const mimeType = args.mimeType as string | undefined;
        const url = `${attachmentBaseUrl}/items/${itemId}/attachments/${attachmentId}/${encodedTitle}`;
        return {
          content: [
            // HTTP URL — for cross-MCP transfer: pass to another MCP's upload tool,
            // which fetches server-side. Also usable by humans and offline scripts.
            { type: "text", text: JSON.stringify({ url }, null, 2) },
            // resource_link — for agent reading on claude.ai: the client resolves this
            // via resources/read through the MCP protocol, bypassing HTTP fetch restrictions.
            { type: "resource_link", uri: url, name: title, ...(mimeType ? { mimeType } : {}) },
          ],
        };
      }

      case "delete_item_attachment": {
        await homeboxClient.deleteItemAttachment(
          args.itemId as string,
          args.attachmentId as string
        );
        return {
          content: [{ type: "text", text: "Attachment deleted successfully." }],
        };
      }

      case "update_item_attachment": {
        const result = await homeboxClient.updateItemAttachment(
          args.itemId as string,
          args.attachmentId as string,
          args.title as string | undefined,
          args.type as string | undefined,
          args.primary as boolean | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "upload_item_attachment": {
        const result = await homeboxClient.uploadItemAttachment(
          args.itemId as string,
          args.url as string,
          args.name as string | undefined,
          args.type as string | undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });
}

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

    // In stdio mode, verify credentials eagerly so the caller gets immediate feedback.
    // In HTTP mode, defer auth to the first request — the server may start before
    // the Homebox user exists (e.g. during e2e test stack bringup).
    const httpMode = !!process.env.PORT;
    if (!httpMode) {
      console.error("Attempting authentication with Homebox...");
      try {
        await homeboxClient.authenticate();
        console.error("Successfully authenticated with Homebox");
      } catch (error: any) {
        console.error("Failed to authenticate with Homebox:", error.message);
        console.error("Please check your config.json settings");
        process.exit(1);
      }
    } else {
      console.error("HTTP mode: deferring authentication to first request");
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
          resources: {},
        },
      }
    );
    console.error("MCP Server instance created");

    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
    const attachmentBaseUrl = port ? getAttachmentBaseUrl(port) : undefined;

    console.error("Setting up request handlers...");
    setupHandlers(server, homeboxClient, attachmentBaseUrl);
    console.error("Request handlers configured");

    if (port) {
      // HTTP mode: Streamable HTTP transport (MCP spec 2025-03-26)
      console.error(`Starting HTTP server on port ${port}...`);
      console.error(`  MCP base URL: ${attachmentBaseUrl}`);

      // One transport instance per session; keyed by session ID for stateful operation.
      const transports = new Map<string, StreamableHTTPServerTransport>();

      const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", version: VERSION }));
          return;
        }

        if (url.pathname === "/mcp") {
          try {
            const sessionId = req.headers["mcp-session-id"] as string | undefined;

            if (req.method === "POST") {
              let transport: StreamableHTTPServerTransport;

              // Re-use existing session or create a new one for initialize requests
              if (sessionId && transports.has(sessionId)) {
                transport = transports.get(sessionId)!;
              } else if (!sessionId) {
                // New session — create a fresh server + transport pair
                const sessionServer = new Server(
                  { name: "homebox-mcp-server", version: VERSION },
                  { capabilities: { tools: {}, resources: {} } }
                );
                setupHandlers(sessionServer, homeboxClient, attachmentBaseUrl);

                transport = new StreamableHTTPServerTransport({
                  sessionIdGenerator: () => randomUUID(),
                  onsessioninitialized: (id) => {
                    transports.set(id, transport);
                    console.error(`Session initialized: ${id}`);
                  },
                  onsessionclosed: (id) => {
                    transports.delete(id);
                    console.error(`Session closed: ${id}`);
                  },
                });

                await sessionServer.connect(transport);
              } else {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unknown session ID" }));
                return;
              }

              await transport.handleRequest(req, res);
            } else if (req.method === "GET" || req.method === "DELETE") {
              if (!sessionId || !transports.has(sessionId)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unknown or missing session ID" }));
                return;
              }
              await transports.get(sessionId)!.handleRequest(req, res);
            } else {
              res.writeHead(405);
              res.end();
            }
          } catch (err: any) {
            console.error("MCP request error:", err);
            if (!res.headersSent) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          }
          return;
        }

        // Attachment proxy: /attachments/:itemId/:attachmentId/:filename
        const attachmentMatch = url.pathname.match(/^\/items\/([^/]+)\/attachments\/([^/]+)\/([^/]+)$/);
        if (attachmentMatch && req.method === "GET") {
          const [, itemId, attachmentId] = attachmentMatch;
          try {
            const { body, contentType, contentDisposition } = await homeboxClient.proxyAttachment(itemId, attachmentId);
            res.writeHead(200, {
              "Content-Type": contentType,
              "Content-Disposition": contentDisposition,
            });
            if (body) {
              const reader = body.getReader();
              const pump = async () => {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
              };
              await pump();
            }
            res.end();
          } catch (err: any) {
            console.error("Attachment proxy error:", err);
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          }
          return;
        }

        res.writeHead(404);
        res.end();
      });

      httpServer.listen(port, () => {
        console.error(`Homebox MCP Server running on HTTP port ${port}`);
        console.error(`  MCP endpoint: http://localhost:${port}/mcp`);
        console.error(`  Health check: http://localhost:${port}/health`);
      });
    } else {
      // Stdio mode (default — preserves Claude Desktop usage)
      console.error("Creating stdio transport...");
      const transport = new StdioServerTransport();
      console.error("Stdio transport created");

      setupHandlers(server, homeboxClient);

      console.error("Connecting server to transport...");
      await server.connect(transport);
      console.error("Homebox MCP Server running on stdio");
      console.error("Server is ready to accept requests");
    }

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
