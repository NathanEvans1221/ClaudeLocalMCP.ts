import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "weather-startup-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
    key.toUpperCase() !== "OPENWEATHERMAP_API_KEY" && typeof value === "string"));
  // SDK close() 發出終止訊號後即返回；非同步清理讓程序退出事件完成。
  const cleanup = () => rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  return { cwd, env, cleanup };
}

for (const [name, args, file] of [
  ["缺少 API Key", ["envPath=.env"], ""],
  ["空白 API Key", ["envPath=.env"], 'OPENWEATHERMAP_API_KEY="  "\n'],
  ["指定檔案不存在", ["envPath=missing.env"], null],
  ["空白 envPath", ["envPath="], null],
]) {
  test(`啟動時立即拒絕${name}，stdout 保持乾淨`, (t) => {
    const { cwd, env, cleanup } = fixture();
    t.after(cleanup);
    if (file !== null) writeFileSync(join(cwd, ".env"), file);
    const result = spawnSync(process.execPath, [entry, ...args], { cwd, env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /API Key|OPENWEATHERMAP_API_KEY|envPath|設定檔/i);
  });
}

for (const mode of ["預設 .env", "含等號與空白的 envPath", "環境變數"]) {
  test(`${mode} 可完成真實 stdio 握手並列出工具`, { timeout: 8000 }, async (t) => {
    const { cwd, env, cleanup } = fixture();
    const args = [entry];
    if (mode === "環境變數") {
      env.OPENWEATHERMAP_API_KEY = "test-key";
    } else {
      const path = join(cwd, mode === "預設 .env" ? ".env" : "weather = test.env");
      writeFileSync(path, "OPENWEATHERMAP_API_KEY=test-key\n");
      if (mode !== "預設 .env") args.push(`envPath=${path}`);
    }
    const transport = new StdioClientTransport({ command: process.execPath, args, cwd, env, stderr: "pipe" });
    const client = new Client({ name: "startup-tests", version: "1.0.0" });
    t.after(async () => {
      await client.close();
      await transport.close();
      await cleanup();
    });
    await client.connect(transport, { timeout: 2000 });
    const result = await client.listTools();
    assert.deepEqual(result.tools.map(tool => tool.name), ["get_weather"]);
    assert.equal(result.tools[0].inputSchema.properties.city.type, "string");
  });
}
