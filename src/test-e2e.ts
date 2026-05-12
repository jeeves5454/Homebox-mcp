#!/usr/bin/env node

/**
 * E2E test suite for the Homebox MCP server.
 *
 * Lifecycle:
 *   1. docker compose -f docker-compose.test.yml up (Homebox + MCP image)
 *   2. Register a fresh test user via the Homebox REST API
 *   3. For each test case: spawn MCP server via docker compose run, run the case, assert clean state
 *   4. If a case leaves dirty state: tear down and recreate the stack, then fail the suite
 *   5. docker compose -f docker-compose.test.yml down --volumes on exit
 */

import { execSync } from "child_process";
import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server as HttpServer } from "http";
import axios, { AxiosInstance } from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ── Configuration ────────────────────────────────────────────────────────────

const TEST_EMAIL = "test@homebox-mcp.test";
const TEST_PASSWORD = "TestPassword123!";
const TEST_USERNAME = "Test User";
const HOMEBOX_URL = "http://localhost:7745";
const COMPOSE_FILE = "docker-compose.test.yml";

// ── Types ────────────────────────────────────────────────────────────────────

interface TestContext {
  callTool: (name: string, args: Record<string, any>) => Promise<any>;
  callToolRaw: (name: string, args: Record<string, any>) => Promise<any>;
  readResource: (uri: string) => Promise<any>;
}

interface TestCase {
  name: string;
  // Minimum Homebox version required (semver, e.g. "0.25.0"). Omit for all versions.
  minVersion?: string;
  run: (ctx: TestContext) => Promise<void>;
}

// Returns true if actual >= required (both "major.minor.patch", leading "v" stripped).
function meetsMinVersion(actual: string, required: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [aMaj, aMin, aPat] = parse(actual);
  const [rMaj, rMin, rPat] = parse(required);
  if (aMaj !== rMaj) return aMaj > rMaj;
  if (aMin !== rMin) return aMin > rMin;
  return aPat >= rPat;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Resolve the hostname by which the MCP container can reach the test-runner process.
// On macOS/Windows Docker Desktop, host.docker.internal is always available.
// On Linux, Docker sets the bridge gateway as the host-reachable address.
function dockerHostname(): string {
  try {
    execSync("docker run --rm alpine getent hosts host.docker.internal", { stdio: "pipe" });
    return "host.docker.internal";
  } catch {
    // Fall back to the docker bridge gateway IP
    try {
      const gw = execSync(
        "docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'",
        { stdio: "pipe" }
      ).toString().trim();
      if (gw) return gw;
    } catch {}
    return "172.17.0.1";
  }
}

interface FileServer {
  url: string;
  close: () => void;
}

// Serve a single static text payload on a random port, reachable from inside Docker.
function serveText(content: string, filename: string): Promise<FileServer> {
  return new Promise((resolve, reject) => {
    const server: HttpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
      res.end(content);
    });
    server.listen(0, "0.0.0.0", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to get server address"));
        return;
      }
      const host = dockerHostname();
      resolve({
        url: `http://${host}:${addr.port}/${filename}`,
        close: () => server.close(),
      });
    });
  });
}

function composeCmd(args: string): string {
  return `docker compose -f ${COMPOSE_FILE} ${args}`;
}

function exec(cmd: string): void {
  execSync(cmd, { stdio: "inherit" });
}

async function fetchHomeboxVersion(): Promise<string> {
  const res = await axios.get(`${HOMEBOX_URL}/api/v1/status`);
  const version: string = res.data?.build?.version ?? "0.0.0";
  return version.replace(/^v/, "");
}

async function registerTestUser(client: AxiosInstance): Promise<void> {
  try {
    await client.post("/api/v1/users/register", {
      name: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    console.log(`  ✅ Registered test user: ${TEST_EMAIL}`);
  } catch (error: any) {
    // 400/409/500 may mean already registered (Homebox returns 500 on duplicate email)
    if (error.response?.status === 400 || error.response?.status === 409 || error.response?.status === 500) {
      console.log("  ℹ️  Test user already exists, continuing");
    } else {
      throw new Error(`Failed to register test user: ${error.message}`);
    }
  }
}

// Creates a named group via the Homebox REST API authenticated as the test user.
// The creator is automatically the owner and a member of the new group.
// Returns the new group's ID.
async function createTestGroup(name: string): Promise<string> {
  // Authenticate as the test user to get their token
  const loginRes = await axios.post(`${HOMEBOX_URL}/api/v1/users/login`, {
    username: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  const token: string = loginRes.data.token;
  const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  const res = await axios.post(
    `${HOMEBOX_URL}/api/v1/groups`,
    { name },
    { headers: { Authorization: authHeader, "Content-Type": "application/json" } }
  );
  const groupId: string = res.data.id;
  console.log(`  ✅ Created test group: ${name} (${groupId})`);
  return groupId;
}

// ── MCP client (Streamable HTTP) ─────────────────────────────────────────────

const MCP_URL = "http://localhost:8811/mcp";

class McpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;

  constructor() {
    this.transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    this.client = new Client({ name: "e2e-test", version: "1" });
  }

  async initialize(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const result = await this.client.callTool({ name, arguments: args });
    if (result?.isError) {
      throw new Error(`Tool error: ${(result.content as any)?.[0]?.text ?? "unknown"}`);
    }
    const text = (result.content as any)?.[0]?.text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async callToolRaw(name: string, args: Record<string, any>): Promise<any> {
    const result = await this.client.callTool({ name, arguments: args });
    if (result?.isError) {
      throw new Error(`Tool error: ${(result.content as any)?.[0]?.text ?? "unknown"}`);
    }
    return result.content;
  }

  async readResource(uri: string): Promise<any> {
    const result = await this.client.readResource({ uri });
    return result.contents;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

// ── Stack management ──────────────────────────────────────────────────────────

function stackUp(): void {
  console.log("\n🐳 Starting test stack...");
  // Always tear down first to ensure a clean volume — scoped to this compose file only
  exec(composeCmd("down --volumes --remove-orphans"));
  exec(composeCmd("build homebox-mcp"));
  exec(composeCmd("up -d --wait homebox homebox-mcp"));
}

function stackDown(): void {
  console.log("\n🐳 Tearing down test stack...");
  try {
    exec(composeCmd("down --volumes --remove-orphans"));
  } catch {
    // best-effort
  }
}

function stackRecreate(): void {
  console.log("\n⚠️  Dirty state detected — recreating test stack...");
  stackDown();
  stackUp();
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

let skipped = 0;

async function runTestCase(tc: TestCase, homeboxVersion: string): Promise<boolean> {
  process.stdout.write(`  • ${tc.name} ... `);

  if (tc.minVersion && !meetsMinVersion(homeboxVersion, tc.minVersion)) {
    console.log(`⏭  (requires Homebox >= ${tc.minVersion}, got ${homeboxVersion})`);
    skipped++;
    return true;
  }

  const client = new McpClient();
  try {
    await client.initialize();
    await tc.run({
      callTool: (n, a) => client.callTool(n, a),
      callToolRaw: (n, a) => client.callToolRaw(n, a),
      readResource: (uri) => client.readResource(uri),
    });
    await client.close();
    console.log("✅");
    passed++;
    return true;
  } catch (error: any) {
    await client.close().catch(() => {});
    console.log(`❌\n    ${error.message}`);
    failed++;
    return false;
  }
}

// ── Test cases ────────────────────────────────────────────────────────────────
//
// Invariant: every test case must leave the database in the same state it found
// it. The first test wipes all seeded data so subsequent tests start from a
// known-empty state and can assert precisely.

const TEST_CASES: TestCase[] = [
  {
    name: "wipe all seeded entities to establish a clean baseline",
    async run({ callTool }) {
      // Items must be deleted before locations (cascade risk)
      const itemsResult = await callTool("search_items", { query: "" });
      const items = itemsResult?.items ?? itemsResult ?? [];
      for (const item of items) {
        await callTool("delete_item", { itemId: item.id });
      }

      const locations = await callTool("list_locations", {});
      for (const loc of (locations as any[])) {
        await callTool("delete_location", { locationId: loc.id });
      }

      const tags = await callTool("list_tags", {});
      for (const tag of (tags as any[])) {
        await callTool("delete_tag", { tagId: tag.id });
      }

      // Verify clean state
      const remainingLocations = await callTool("list_locations", {});
      if ((remainingLocations as any[]).length !== 0)
        throw new Error(`Expected 0 locations after wipe, got ${(remainingLocations as any[]).length}`);
      const remainingTags = await callTool("list_tags", {});
      if ((remainingTags as any[]).length !== 0)
        throw new Error(`Expected 0 tags after wipe, got ${(remainingTags as any[]).length}`);
    },
  },

  {
    name: "locations: create, read, then delete",
    async run({ callTool }) {
      const created = await callTool("create_location", { name: "Test Location", description: "e2e test location" });
      if (!created.id) throw new Error("Expected created location to have an id");

      const listed = await callTool("list_locations", {});
      if (!(listed as any[]).find((l: any) => l.id === created.id))
        throw new Error("Created location not found in list_locations");

      const fetched = await callTool("get_location", { locationId: created.id });
      if (fetched.id !== created.id) throw new Error("get_location returned wrong id");
      if (fetched.name !== "Test Location") throw new Error(`Expected name 'Test Location', got '${fetched.name}'`);

      await callTool("delete_location", { locationId: created.id });

      const after = await callTool("list_locations", {});
      if ((after as any[]).find((l: any) => l.id === created.id))
        throw new Error("Location still present after delete");
    },
  },

  {
    name: "tags: create, read, then delete",
    async run({ callTool }) {
      const created = await callTool("create_tag", { name: "test-tag" });
      if (!created.id) throw new Error("Expected created tag to have an id");

      const listed = await callTool("list_tags", {});
      if (!(listed as any[]).find((l: any) => l.id === created.id))
        throw new Error("Created tag not found in list_tags");

      const fetched = await callTool("get_tag", { tagId: created.id });
      if (fetched.id !== created.id) throw new Error("get_tag returned wrong id");
      if (fetched.name !== "test-tag") throw new Error(`Expected name 'test-tag', got '${fetched.name}'`);

      await callTool("delete_tag", { tagId: created.id });

      const after = await callTool("list_tags", {});
      if ((after as any[]).find((l: any) => l.id === created.id))
        throw new Error("Tag still present after delete");
    },
  },

  {
    name: "items: create, read, update, search, then delete",
    async run({ callTool }) {
      const location = await callTool("create_location", { name: "Item Test Location" });

      const created = await callTool("create_item", {
        name: "Test Item",
        locationId: location.id,
        description: "Created by e2e test",
      });
      if (!created.id) throw new Error("Expected created item to have an id");

      const fetched = await callTool("get_item", { itemId: created.id });
      if (fetched.name !== "Test Item") throw new Error(`Expected 'Test Item', got '${fetched.name}'`);
      if (!Array.isArray(fetched.tags)) throw new Error("Expected item.tags to be an array");
      if (fetched.labels !== undefined) throw new Error("Expected item.labels to be absent (normalized to tags)");

      const tag = await callTool("create_tag", { name: "e2e-tag" });
      if (!tag.id) throw new Error("Expected created tag to have an id");

      await callTool("update_item", {
        itemId: created.id,
        name: "Test Item (updated)",
        locationId: location.id,
        description: "Updated by e2e test",
        quantity: 2,
        tagIds: [tag.id],
      });

      const updated = await callTool("get_item", { itemId: created.id });
      if (updated.name !== "Test Item (updated)") throw new Error(`Expected updated name, got '${updated.name}'`);
      if (updated.quantity !== 2) throw new Error(`Expected quantity 2, got ${updated.quantity}`);
      if (!Array.isArray(updated.tags)) throw new Error("Expected item.tags to be an array");
      if (updated.labels !== undefined) throw new Error("Expected item.labels to be absent (normalized to tags)");
      if (!(updated.tags as any[]).find((t: any) => t.id === tag.id))
        throw new Error("Tag not found on updated item");

      // Partial update: only change quantity — name and tags must be preserved
      await callTool("update_item", { itemId: created.id, quantity: 3 });
      const partial = await callTool("get_item", { itemId: created.id });
      if (partial.name !== "Test Item (updated)") throw new Error(`Partial update wiped name, got '${partial.name}'`);
      if (partial.quantity !== 3) throw new Error(`Expected quantity 3, got ${partial.quantity}`);
      if (!(partial.tags as any[]).find((t: any) => t.id === tag.id))
        throw new Error("Partial update wiped tags");

      const searchResult = await callTool("search_items", { query: "updated" });
      const items = searchResult?.items ?? searchResult ?? [];
      const found = (items as any[]).find((i: any) => i.id === created.id);
      if (!found) throw new Error("Updated item not found in search results");
      if (!Array.isArray(found.tags)) throw new Error("Expected search result item.tags to be an array");
      if (found.labels !== undefined) throw new Error("Expected search result item.labels to be absent (normalized to tags)");

      // Cleanup
      await callTool("delete_item", { itemId: created.id });
      await callTool("delete_tag", { tagId: tag.id });
      await callTool("delete_location", { locationId: location.id });

      const after = await callTool("list_locations", {});
      if ((after as any[]).find((l: any) => l.id === location.id))
        throw new Error("Location still present after delete");
    },
  },

  {
    name: "maintenance entries: create, then delete",
    async run({ callTool }) {
      const location = await callTool("create_location", { name: "Maintenance Test Location" });
      const item = await callTool("create_item", { name: "Maintenance Test Item", locationId: location.id });

      const entry = await callTool("create_maintenance_entry", {
        itemId: item.id,
        name: "Annual service",
        completedDate: "2026-05-08T00:00:00Z",
        scheduledDate: "2026-05-08T00:00:00Z",
        cost: "150.00",
      });
      if (!entry.id) throw new Error("Expected maintenance entry to have an id");

      await callTool("delete_maintenance_entry", { entryId: entry.id });

      const fetched = await callTool("get_item", { itemId: item.id });
      const entries = fetched.maintenanceEntries ?? fetched.maintenance ?? [];
      if ((entries as any[]).length !== 0)
        throw new Error(`Expected 0 maintenance entries after delete, got ${(entries as any[]).length}`);

      // Cleanup
      await callTool("delete_item", { itemId: item.id });
      await callTool("delete_location", { locationId: location.id });
    },
  },
  {
    name: "item filters: get_items_by_location, get_items_by_tag, and search_items with filters return correct items",
    async run({ callTool }) {
      // Seed: two locations, two tags, two items — one item per location, each tagged differently
      const locA = await callTool("create_location", { name: "Filter Location A" });
      const locB = await callTool("create_location", { name: "Filter Location B" });
      const tagA = await callTool("create_tag", { name: "filter-tag-a" });
      const tagB = await callTool("create_tag", { name: "filter-tag-b" });

      const itemA = await callTool("create_item", { name: "Filter Item A", locationId: locA.id });
      await callTool("update_item", { itemId: itemA.id, name: "Filter Item A", locationId: locA.id, tagIds: [tagA.id] });

      const itemB = await callTool("create_item", { name: "Filter Item B", locationId: locB.id });
      await callTool("update_item", { itemId: itemB.id, name: "Filter Item B", locationId: locB.id, tagIds: [tagB.id] });

      // get_items_by_location: locA must return only itemA
      const byLocA = await callTool("get_items_by_location", { locationId: locA.id });
      if (!Array.isArray(byLocA)) throw new Error(`get_items_by_location: expected array, got ${typeof byLocA}`);
      if (!byLocA.find((i: any) => i.id === itemA.id)) throw new Error("get_items_by_location: itemA missing from locA results");
      if (byLocA.find((i: any) => i.id === itemB.id)) throw new Error("get_items_by_location: itemB leaked into locA results");

      // get_items_by_tag: tagA must return only itemA
      const byTagA = await callTool("get_items_by_tag", { tagId: tagA.id });
      if (!Array.isArray(byTagA)) throw new Error(`get_items_by_tag: expected array, got ${typeof byTagA}`);
      if (!byTagA.find((i: any) => i.id === itemA.id)) throw new Error("get_items_by_tag: itemA missing from tagA results");
      if (byTagA.find((i: any) => i.id === itemB.id)) throw new Error("get_items_by_tag: itemB leaked into tagA results");

      // search_items with locationId filter: only itemA should appear
      const searchByLoc = await callTool("search_items", { query: "Filter", locationId: locA.id });
      const searchByLocItems: any[] = searchByLoc?.items ?? searchByLoc ?? [];
      if (!Array.isArray(searchByLocItems)) throw new Error(`search_items+locationId: expected array, got ${typeof searchByLocItems}`);
      if (!searchByLocItems.find((i: any) => i.id === itemA.id)) throw new Error("search_items+locationId: itemA missing");
      if (searchByLocItems.find((i: any) => i.id === itemB.id)) throw new Error("search_items+locationId: itemB leaked in");

      // search_items with tagId filter: only itemB should appear
      const searchByTag = await callTool("search_items", { query: "Filter", tagId: tagB.id });
      const searchByTagItems: any[] = searchByTag?.items ?? searchByTag ?? [];
      if (!Array.isArray(searchByTagItems)) throw new Error(`search_items+tagId: expected array, got ${typeof searchByTagItems}`);
      if (!searchByTagItems.find((i: any) => i.id === itemB.id)) throw new Error("search_items+tagId: itemB missing");
      if (searchByTagItems.find((i: any) => i.id === itemA.id)) throw new Error("search_items+tagId: itemA leaked in");

      // search_items with both locationId and tagId: only itemA (locA + tagA) should appear
      const searchBoth = await callTool("search_items", { query: "Filter", locationId: locA.id, tagId: tagA.id });
      const searchBothItems: any[] = searchBoth?.items ?? searchBoth ?? [];
      if (!Array.isArray(searchBothItems)) throw new Error(`search_items+both: expected array, got ${typeof searchBothItems}`);
      if (!searchBothItems.find((i: any) => i.id === itemA.id)) throw new Error("search_items+both: itemA missing");
      if (searchBothItems.find((i: any) => i.id === itemB.id)) throw new Error("search_items+both: itemB leaked in");

      // Cleanup
      await callTool("delete_item", { itemId: itemA.id });
      await callTool("delete_item", { itemId: itemB.id });
      await callTool("delete_tag", { tagId: tagA.id });
      await callTool("delete_tag", { tagId: tagB.id });
      await callTool("delete_location", { locationId: locA.id });
      await callTool("delete_location", { locationId: locB.id });
    },
  },
  {
    name: "attachments: upload, get proxy URL and verify content, update metadata, then delete",
    async run({ callTool, callToolRaw, readResource }) {
      const ATTACHMENT_CONTENT = "Hello from e2e attachment test!\n";
      const ATTACHMENT_FILENAME = "e2e-test.txt";

      const location = await callTool("create_location", { name: "Attachment Test Location" });
      const item = await callTool("create_item", { name: "Attachment Test Item", locationId: location.id });

      // Serve the text file from the test runner so the MCP container can fetch it
      const fileServer = await serveText(ATTACHMENT_CONTENT, ATTACHMENT_FILENAME);
      let uploadResult: any;
      try {
        uploadResult = await callTool("upload_item_attachment", {
          itemId: item.id,
          url: fileServer.url,
          name: ATTACHMENT_FILENAME,
          type: "attachment",
        });
      } finally {
        fileServer.close();
      }

      // upload returns full item — find the new attachment
      const attachments: any[] = uploadResult?.attachments ?? [];
      const att = attachments.find((a: any) => a.title === ATTACHMENT_FILENAME);
      if (!att) throw new Error(`Uploaded attachment '${ATTACHMENT_FILENAME}' not found in item response`);
      if (!att.id) throw new Error("Attachment missing id");

      // get_item_attachment: should return both a text/url content item and a resource_link
      const rawContent = await callToolRaw("get_item_attachment", {
        itemId: item.id,
        attachmentId: att.id,
        title: ATTACHMENT_FILENAME,
        mimeType: att.mimeType,
      });

      // 1. HTTP URL present in the text content item
      const textItem = (rawContent as any[]).find((c: any) => c.type === "text");
      if (!textItem) throw new Error("get_item_attachment: missing text content item");
      const urlResult = JSON.parse(textItem.text);
      if (!urlResult?.url) throw new Error("get_item_attachment: text item missing url field");
      const expectedUrlPrefix = `http://localhost:8811/items/${item.id}/attachments/${att.id}/`;
      if (!urlResult.url.startsWith(expectedUrlPrefix))
        throw new Error(`get_item_attachment: unexpected url '${urlResult.url}'`);

      // 2. resource_link present with matching URI
      const resourceLink = (rawContent as any[]).find((c: any) => c.type === "resource_link");
      if (!resourceLink) throw new Error("get_item_attachment: missing resource_link content item");
      if (resourceLink.uri !== urlResult.url)
        throw new Error(`get_item_attachment: resource_link uri '${resourceLink.uri}' does not match url '${urlResult.url}'`);

      // 3. Content via HTTP URL
      const proxyResponse = await axios.get(urlResult.url, { responseType: "text" });
      if (proxyResponse.status !== 200) throw new Error(`Proxy URL returned HTTP ${proxyResponse.status}`);
      if (proxyResponse.data !== ATTACHMENT_CONTENT)
        throw new Error(`HTTP content mismatch: expected ${JSON.stringify(ATTACHMENT_CONTENT)}, got ${JSON.stringify(proxyResponse.data)}`);

      // 4. Content via resources/read (MCP resource protocol)
      const resourceContents = await readResource(resourceLink.uri);
      const resourceItem = (resourceContents as any[])?.[0];
      if (!resourceItem) throw new Error("resources/read: empty contents");
      const resourceText = resourceItem.text ?? (resourceItem.blob
        ? Buffer.from(resourceItem.blob, "base64").toString("utf-8")
        : undefined);
      if (resourceText !== ATTACHMENT_CONTENT)
        throw new Error(`resources/read content mismatch: expected ${JSON.stringify(ATTACHMENT_CONTENT)}, got ${JSON.stringify(resourceText)}`);

      // update_item_attachment: rename and change type
      const updated = await callTool("update_item_attachment", {
        itemId: item.id,
        attachmentId: att.id,
        title: "e2e-test-renamed.txt",
        type: "receipt",
      });
      const updatedAtts: any[] = updated?.attachments ?? [];
      const renamedAtt = updatedAtts.find((a: any) => a.id === att.id);
      if (!renamedAtt) throw new Error("Attachment not found after update");
      if (renamedAtt.title !== "e2e-test-renamed.txt")
        throw new Error(`Expected renamed title, got '${renamedAtt.title}'`);
      if (renamedAtt.type !== "receipt")
        throw new Error(`Expected type 'receipt', got '${renamedAtt.type}'`);

      // delete_item_attachment
      await callTool("delete_item_attachment", { itemId: item.id, attachmentId: att.id });

      const afterDelete = await callTool("get_item", { itemId: item.id });
      const remainingAtts: any[] = afterDelete?.attachments ?? [];
      if (remainingAtts.find((a: any) => a.id === att.id))
        throw new Error("Attachment still present after delete");

      // Cleanup
      await callTool("delete_item", { itemId: item.id });
      await callTool("delete_location", { locationId: location.id });
    },
  },

  {
    name: "update_location: rename and re-describe a location",
    async run({ callTool }) {
      const created = await callTool("create_location", { name: "Location Before", description: "original" });

      const updated = await callTool("update_location", {
        locationId: created.id,
        name: "Location After",
        description: "updated description",
      });
      if (updated.name !== "Location After")
        throw new Error(`Expected updated name, got '${updated.name}'`);
      if (updated.description !== "updated description")
        throw new Error(`Expected updated description, got '${updated.description}'`);

      // Verify via get_location
      const fetched = await callTool("get_location", { locationId: created.id });
      if (fetched.name !== "Location After")
        throw new Error(`get_location: expected 'Location After', got '${fetched.name}'`);

      await callTool("delete_location", { locationId: created.id });
    },
  },

  {
    name: "update_tag: rename, re-describe, and set color",
    async run({ callTool }) {
      const created = await callTool("create_tag", { name: "Tag Before" });

      const updated = await callTool("update_tag", {
        tagId: created.id,
        name: "Tag After",
        description: "updated tag description",
        color: "#ff0000",
      });
      if (updated.name !== "Tag After")
        throw new Error(`Expected updated name, got '${updated.name}'`);
      if (updated.description !== "updated tag description")
        throw new Error(`Expected updated description, got '${updated.description}'`);
      if (updated.color !== "#ff0000")
        throw new Error(`Expected color '#ff0000', got '${updated.color}'`);

      // Verify via get_tag
      const fetched = await callTool("get_tag", { tagId: created.id });
      if (fetched.name !== "Tag After")
        throw new Error(`get_tag: expected 'Tag After', got '${fetched.name}'`);

      await callTool("delete_tag", { tagId: created.id });
    },
  },

  {
    name: "update_maintenance_entry: change name, description, and cost",
    async run({ callTool }) {
      const location = await callTool("create_location", { name: "Maint Update Test Location" });
      const item = await callTool("create_item", { name: "Maint Update Test Item", locationId: location.id });

      const entry = await callTool("create_maintenance_entry", {
        itemId: item.id,
        name: "Original service",
        completedDate: "2026-05-01T00:00:00Z",
        scheduledDate: "2026-05-01T00:00:00Z",
        cost: "50.00",
      });

      const updated = await callTool("update_maintenance_entry", {
        entryId: entry.id,
        name: "Updated service",
        completedDate: "2026-05-01T00:00:00Z",
        scheduledDate: "2026-05-01T00:00:00Z",
        description: "Added notes after the fact",
        cost: "75.00",
      });
      if (updated.name !== "Updated service")
        throw new Error(`Expected updated name, got '${updated.name}'`);
      if (parseFloat(updated.cost) !== 75)
        throw new Error(`Expected cost 75, got '${updated.cost}'`);

      // Cleanup
      await callTool("delete_maintenance_entry", { entryId: entry.id });
      await callTool("delete_item", { itemId: item.id });
      await callTool("delete_location", { locationId: location.id });
    },
  },

  {
    name: "collections: list_collections returns all groups; collection param scopes inventory tools",
    minVersion: "0.25.0",
    async run({ callTool }) {
      // list_collections must return at least two groups (default + the extra one created in setup)
      const result = await callTool("list_collections", {});
      const collections: any[] = result?.collections ?? [];
      if (collections.length < 2)
        throw new Error(`Expected at least 2 collections, got ${collections.length}`);

      const defaultCol = collections.find((c: any) => c.isDefault);
      if (!defaultCol) throw new Error("No collection marked as default");

      const otherCol = collections.find((c: any) => !c.isDefault);
      if (!otherCol) throw new Error("No non-default collection found");

      // Create a location in the default collection (no collection param)
      const locDefault = await callTool("create_location", { name: "Collection Test Location (default)" });

      // Create a location in the other collection by name
      const locOther = await callTool("create_location", {
        name: "Collection Test Location (other)",
        collection: otherCol.name,
      });

      // list_locations without collection param must see the default location, not the other
      const defaultLocs: any[] = await callTool("list_locations", {});
      if (!defaultLocs.find((l: any) => l.id === locDefault.id))
        throw new Error("Default collection location not found in default list_locations");
      if (defaultLocs.find((l: any) => l.id === locOther.id))
        throw new Error("Other collection location leaked into default list_locations");

      // list_locations scoped to otherCol by ID must see the other location, not the default
      const otherLocs: any[] = await callTool("list_locations", { collection: otherCol.id });
      if (!otherLocs.find((l: any) => l.id === locOther.id))
        throw new Error("Other collection location not found when scoped by ID");
      if (otherLocs.find((l: any) => l.id === locDefault.id))
        throw new Error("Default collection location leaked into other collection list_locations");

      // list_locations scoped to otherCol by name must give the same result as by ID
      const otherLocsByName: any[] = await callTool("list_locations", { collection: otherCol.name });
      if (!otherLocsByName.find((l: any) => l.id === locOther.id))
        throw new Error("Other collection location not found when scoped by name");

      // Create an item in the other collection and verify it doesn't bleed into the default
      const itemOther = await callTool("create_item", {
        name: "Collection Test Item (other)",
        locationId: locOther.id,
        collection: otherCol.id,
      });
      const searchDefault = await callTool("search_items", { query: "Collection Test Item" });
      const defaultItems: any[] = searchDefault?.items ?? searchDefault ?? [];
      if (defaultItems.find((i: any) => i.id === itemOther.id))
        throw new Error("Item from other collection leaked into default collection search");

      const searchOther = await callTool("search_items", {
        query: "Collection Test Item",
        collection: otherCol.id,
      });
      const otherItems: any[] = searchOther?.items ?? searchOther ?? [];
      if (!otherItems.find((i: any) => i.id === itemOther.id))
        throw new Error("Item not found when searching in other collection");

      // Invalid collection name must produce a helpful error
      try {
        await callTool("list_locations", { collection: "nonexistent-collection-xyz" });
        throw new Error("Expected error for nonexistent collection, got none");
      } catch (err: any) {
        if (!err.message.includes("not found"))
          throw new Error(`Expected 'not found' error, got: ${err.message}`);
      }

      // Cleanup: delete from each collection explicitly
      await callTool("delete_item", { itemId: itemOther.id, collection: otherCol.id });
      await callTool("delete_location", { locationId: locOther.id, collection: otherCol.id });
      await callTool("delete_location", { locationId: locDefault.id });
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  stackUp();
  // Both services are healthy at this point (stackUp uses --wait with healthchecks).
  // We still need an httpClient instance to register the test user via Homebox REST API.
  const httpClient = axios.create({ baseURL: HOMEBOX_URL });

  let homeboxVersion = "0.0.0";
  try {
    console.log("\n👤 Setting up test user...");
    await registerTestUser(httpClient);
    homeboxVersion = await fetchHomeboxVersion();
    console.log(`  ✅ Homebox version: ${homeboxVersion}`);
    if (meetsMinVersion(homeboxVersion, "0.25.0")) {
      await createTestGroup("Extra Collection");
    }
  } catch (error: any) {
    console.error("\n❌ Stack setup failed:", error.message);
    stackDown();
    process.exit(1);
  }

  console.log(`\n🧪 Running ${TEST_CASES.length} test case(s)...\n`);

  for (const tc of TEST_CASES) {
    const ok = await runTestCase(tc, homeboxVersion);
    if (!ok) {
      // Verify state is still clean enough to continue; if not, recreate
      try {
        const verifyClient = new McpClient();
        await verifyClient.initialize();
        const locations = await verifyClient.callTool("list_locations", {});
        await verifyClient.close();
        if (Array.isArray(locations) && locations.length > 0) {
          stackRecreate();
          await registerTestUser(httpClient);
          if (meetsMinVersion(homeboxVersion, "0.25.0")) {
            await createTestGroup("Extra Collection");
          }
          console.log("  ✅ Stack recreated — continuing with remaining tests\n");
        }
      } catch {
        stackRecreate();
        await registerTestUser(httpClient);
        if (meetsMinVersion(homeboxVersion, "0.25.0")) {
          await createTestGroup("Extra Collection");
        }
      }
    }
  }

  stackDown();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("=".repeat(40));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("\nFatal error:", error.message);
  stackDown();
  process.exit(1);
});
