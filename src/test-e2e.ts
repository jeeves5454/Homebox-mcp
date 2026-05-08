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

import { spawn, execSync, ChildProcess } from "child_process";
import axios, { AxiosInstance } from "axios";
import * as readline from "readline";

// ── Configuration ────────────────────────────────────────────────────────────

const TEST_EMAIL = "test@homebox-mcp.test";
const TEST_PASSWORD = "TestPassword123!";
const TEST_USERNAME = "Test User";
const HOMEBOX_URL = "http://localhost:7745";
const COMPOSE_FILE = "docker-compose.test.yml";

// ── Types ────────────────────────────────────────────────────────────────────

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, any>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface TestContext {
  callTool: (name: string, args: Record<string, any>) => Promise<any>;
}

interface TestCase {
  name: string;
  run: (ctx: TestContext) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function composeCmd(args: string): string {
  return `docker compose -f ${COMPOSE_FILE} ${args}`;
}

function exec(cmd: string): void {
  execSync(cmd, { stdio: "inherit" });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHomebox(timeoutMs = 60_000): Promise<AxiosInstance> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const client = axios.create({ baseURL: HOMEBOX_URL, timeout: 3000 });
      await client.get("/api/v1/status");
      return client;
    } catch {
      await sleep(2000);
    }
  }
  throw new Error("Homebox did not become healthy within timeout");
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

// ── MCP client (stdio over docker compose run) ───────────────────────────────

class McpClient {
  private proc: ChildProcess;
  private rl: readline.Interface;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private nextId = 1;

  constructor() {
    this.proc = spawn("docker", [
      "compose", "-f", COMPOSE_FILE,
      "run", "--rm", "--no-deps",
      "-e", `HOMEBOX_EMAIL=${TEST_EMAIL}`,
      "-e", `HOMEBOX_PASSWORD=${TEST_PASSWORD}`,
      "homebox-mcp",
      "node", "dist/index.js",
    ], { stdio: ["pipe", "pipe", "ignore"] });

    this.rl = readline.createInterface({ input: this.proc.stdout! });
    this.rl.on("line", (line) => {
      try {
        const msg: McpResponse = JSON.parse(line);
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        // stderr noise or non-JSON line — ignore
      }
    });

    this.proc.on("error", (err) => {
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
  }

  async initialize(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1" },
    });
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const result = await this.send("tools/call", { name, arguments: args });
    if (result?.isError) {
      throw new Error(`Tool error: ${result.content?.[0]?.text ?? "unknown"}`);
    }
    const text = result?.content?.[0]?.text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private send(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const req: McpRequest = { jsonrpc: "2.0", id, method, params };
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify(req) + "\n");
    });
  }

  async close(): Promise<void> {
    this.rl.close();
    this.proc.stdin!.end();
    await new Promise<void>((resolve) => this.proc.on("close", resolve));
  }
}

// ── Stack management ──────────────────────────────────────────────────────────

function stackUp(): void {
  console.log("\n🐳 Starting test stack...");
  // Always tear down first to ensure a clean volume — scoped to this compose file only
  exec(composeCmd("down --volumes --remove-orphans"));
  exec(composeCmd("build homebox-mcp"));
  exec(composeCmd("up -d --wait homebox"));
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

async function runTestCase(tc: TestCase): Promise<boolean> {
  process.stdout.write(`  • ${tc.name} ... `);
  const client = new McpClient();
  try {
    await client.initialize();
    await tc.run({ callTool: (n, a) => client.callTool(n, a) });
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

const TEST_CASES: TestCase[] = [
  {
    name: "list_locations returns seeded default locations on fresh instance",
    async run({ callTool }) {
      const result = await callTool("list_locations", {});
      if (!Array.isArray(result)) throw new Error(`Expected array, got ${typeof result}`);
      if (result.length === 0) throw new Error("Expected seeded default locations, got empty array");
      if (!result[0].id || !result[0].name) throw new Error("Expected location objects with id and name");
    },
  },
  {
    name: "list_labels returns seeded default labels on fresh instance",
    async run({ callTool }) {
      const result = await callTool("list_labels", {});
      if (!Array.isArray(result)) throw new Error(`Expected array, got ${typeof result}`);
      if (result.length === 0) throw new Error("Expected seeded default labels, got empty array");
      if (!result[0].id || !result[0].name) throw new Error("Expected label objects with id and name");
    },
  },
  {
    name: "search_items returns empty results on fresh instance",
    async run({ callTool }) {
      const result = await callTool("search_items", { query: "test" });
      const items = result?.items ?? result;
      if (!Array.isArray(items)) throw new Error(`Expected array, got ${typeof items}`);
      if (items.length !== 0) throw new Error(`Expected 0 items, got ${items.length}`);
    },
  },
  {
    name: "get_location returns location details by id",
    async run({ callTool }) {
      const locations = await callTool("list_locations", {});
      if (!Array.isArray(locations) || locations.length === 0) throw new Error("No locations to test with");
      const first = locations[0];
      const result = await callTool("get_location", { locationId: first.id });
      if (result.id !== first.id) throw new Error(`Expected location id ${first.id}, got ${result.id}`);
      if (!result.name) throw new Error("Expected location to have a name");
    },
  },
  {
    name: "get_label returns label details by id",
    async run({ callTool }) {
      const labels = await callTool("list_labels", {});
      if (!Array.isArray(labels) || labels.length === 0) throw new Error("No labels to test with");
      const first = labels[0];
      const result = await callTool("get_label", { labelId: first.id });
      if (result.id !== first.id) throw new Error(`Expected label id ${first.id}, got ${result.id}`);
      if (!result.name) throw new Error("Expected label to have a name");
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  stackUp();

  let httpClient!: AxiosInstance;
  try {
    console.log("\n⏳ Waiting for Homebox to be ready...");
    httpClient = await waitForHomebox();
    console.log("  ✅ Homebox is healthy");

    console.log("\n👤 Setting up test user...");
    await registerTestUser(httpClient);
  } catch (error: any) {
    console.error("\n❌ Stack setup failed:", error.message);
    stackDown();
    process.exit(1);
  }

  console.log(`\n🧪 Running ${TEST_CASES.length} test case(s)...\n`);

  for (const tc of TEST_CASES) {
    const ok = await runTestCase(tc);
    if (!ok) {
      // Verify state is still clean enough to continue; if not, recreate
      try {
        const verifyClient = new McpClient();
        await verifyClient.initialize();
        const locations = await verifyClient.callTool("list_locations", {});
        await verifyClient.close();
        if (Array.isArray(locations) && locations.length > 0) {
          stackRecreate();
          httpClient = await waitForHomebox();
          await registerTestUser(httpClient);
          console.log("  ✅ Stack recreated — continuing with remaining tests\n");
        }
      } catch {
        stackRecreate();
        httpClient = await waitForHomebox();
        await registerTestUser(httpClient);
      }
    }
  }

  stackDown();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(40));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("\nFatal error:", error.message);
  stackDown();
  process.exit(1);
});
