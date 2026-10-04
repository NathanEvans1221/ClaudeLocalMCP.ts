import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// 舊版在匯入時讀取設定；提供獨立測試檔，避免接觸使用者金鑰。
const directory = mkdtempSync(join(tmpdir(), "weather-mcp-test-"));
const envPath = join(directory, ".env");
writeFileSync(envPath, "OPENWEATHERMAP_API_KEY=test-key\n");
process.argv.push(`envPath=${envPath}`);
process.env.OPENWEATHERMAP_API_KEY = "test-key";
const { createServer } = await import("../dist/server.js");
after(() => rmSync(directory, { recursive: true, force: true }));

const weatherResponse = {
  cod: 200,
  name: "Taichung",
  main: { temp: 26.5, humidity: 72 },
  weather: [{ description: "clear sky" }],
  wind: { speed: 2.1 },
  sys: { country: "TW" },
};

function requestUrl(url, config) {
  const result = new URL(url);
  for (const [key, value] of Object.entries(config?.params ?? {})) {
    result.searchParams.set(key, String(value));
  }
  return result;
}

async function connect(t) {
  const server = createServer({ apiKey: "test-key" });
  const client = new Client({ name: "weather-tests", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function payload(result) {
  return JSON.parse(result.content[0].text);
}

test("英文城市直接查天氣，保留成功回傳格式並修剪空白", async (t) => {
  const requests = [];
  t.mock.method(axios, "get", async (url, config) => {
    const request = requestUrl(url, config);
    requests.push(request);
    if (request.hostname !== "api.openweathermap.org") {
      throw new Error("英文查詢不應依賴翻譯服務");
    }
    return { status: 200, data: weatherResponse };
  });
  const client = await connect(t);
  const result = await client.callTool({ name: "get_weather", arguments: { city: " Taichung,TW " } });
  assert.notEqual(result.isError, true);
  assert.deepEqual(payload(result), {
    city: "Taichung", temperature: 26.5, condition: "clear sky",
    humidity: 72, wind_speed: 2.1, country: "TW",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get("q"), "Taichung,TW");
  assert.equal(requests[0].searchParams.get("appid"), "test-key");
  assert.equal(requests[0].searchParams.get("units"), "metric");
});

test("中文城市翻譯後查詢，兩個外部請求都有有限等待期限", async (t) => {
  const requests = [];
  t.mock.method(axios, "get", async (url, config) => {
    const request = requestUrl(url, config);
    requests.push({ request, config });
    return { status: 200, data: request.hostname === "api.mymemory.translated.net"
      ? { responseStatus: 200, responseData: { translatedText: "Taichung" } }
      : weatherResponse };
  });
  const client = await connect(t);
  const result = await client.callTool({ name: "get_weather", arguments: { city: "台中" } });
  assert.notEqual(result.isError, true);
  assert.equal(payload(result).city, "Taichung");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].request.searchParams.get("q"), "台中");
  assert.equal(requests[0].request.searchParams.get("langpair"), "zh-TW|en");
  assert.equal(requests[1].request.searchParams.get("q"), "Taichung");
  for (const { config } of requests) {
    assert.ok(config?.timeout > 0 && config.timeout <= 10000, "外部請求必須設定逾時");
    assert.ok(config.signal instanceof AbortSignal, "包含連線階段的總等待期限");
  }
});

for (const city of ["", "   "]) {
  test(`空白城市 ${JSON.stringify(city)} 不應發送外部請求`, async (t) => {
    const requests = [];
    t.mock.method(axios, "get", async (url) => {
      requests.push(url);
      throw new Error("不應發送 HTTP 請求");
    });
    const client = await connect(t);
    // SDK 版本可能以協定錯誤或工具錯誤呈現輸入驗證失敗。
    try {
      const result = await client.callTool({ name: "get_weather", arguments: { city } });
      assert.equal(result.isError, true);
    } catch (error) {
      assert.match(error.message, /invalid|validation|city|城市/i);
    }
    assert.equal(requests.length, 0);
  });
}

for (const [name, error, expected] of [
  ["401", { response: { status: 401 } }, /金鑰|unauthorized|api key/i],
  ["404", { response: { status: 404 } }, /城市|city/i],
  ["429", { response: { status: 429 } }, /頻率|額度|rate|quota/i],
  ["逾時", { code: "ECONNABORTED" }, /逾時|timeout|timed out/i],
  ["總期限", { code: "ERR_CANCELED" }, /逾時|timeout|timed out/i],
  ["斷線", { code: "ENOTFOUND" }, /連線|network|connect/i],
]) {
  test(`天氣服務 ${name} 回傳 MCP 錯誤且不洩漏上游訊息`, async (t) => {
    t.mock.method(axios, "get", async (url) => {
      if (new URL(url).hostname === "api.mymemory.translated.net") {
        return { status: 200, data: { responseStatus: 200, responseData: { translatedText: "Taichung" } } };
      }
      throw Object.assign(new Error("secret-upstream-key"), { isAxiosError: true }, error);
    });
    const client = await connect(t);
    const result = await client.callTool({ name: "get_weather", arguments: { city: "Taichung" } });
    assert.equal(result.isError, true);
    assert.match(payload(result).error, expected);
    assert.doesNotMatch(result.content[0].text, /secret-upstream-key/);
  });
}

for (const data of [
  {},
  { responseStatus: 429, responseData: { translatedText: "QUOTA EXCEEDED" } },
  { responseStatus: 200, responseData: { translatedText: " " } },
  { responseStatus: 200, responseData: { translatedText: 123 } },
]) {
  test(`翻譯回應異常時停止查詢：${JSON.stringify(data)}`, async (t) => {
    const requests = [];
    t.mock.method(axios, "get", async (url) => {
      requests.push(url);
      return { status: 200, data };
    });
    const client = await connect(t);
    const result = await client.callTool({ name: "get_weather", arguments: { city: "台中" } });
    assert.equal(result.isError, true);
    assert.match(payload(result).error, /翻譯|translation/i);
    assert.equal(requests.length, 1);
  });
}

test("翻譯服務逾時會回傳明確錯誤，不繼續查天氣", async (t) => {
  const requests = [];
  t.mock.method(axios, "get", async (url) => {
    requests.push(url);
    throw Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" });
  });
  const client = await connect(t);
  const result = await client.callTool({ name: "get_weather", arguments: { city: "台中" } });
  assert.equal(result.isError, true);
  assert.match(payload(result).error, /翻譯|translation/i);
  assert.match(payload(result).error, /逾時|timeout/i);
  assert.equal(requests.length, 1);
});

for (const data of [
  { ...weatherResponse, main: { temp: "26.5", humidity: 72 } },
  { ...weatherResponse, weather: undefined },
  { ...weatherResponse, wind: null },
  { ...weatherResponse, cod: 404 },
]) {
  test(`天氣回應異常以工具錯誤回傳：${JSON.stringify(data)}`, async (t) => {
    t.mock.method(axios, "get", async (url) => ({ status: 200,
      data: new URL(url).hostname === "api.mymemory.translated.net"
        ? { responseStatus: 200, responseData: { translatedText: "Taichung" } } : data,
    }));
    const client = await connect(t);
    const result = await client.callTool({ name: "get_weather", arguments: { city: "Taichung" } });
    assert.equal(result.isError, true);
    assert.match(payload(result).error, /回應|response/i);
    assert.doesNotMatch(payload(result).error, /Cannot read|undefined|null/);
  });
}
