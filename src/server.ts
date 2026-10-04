import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import type { ServerConfig } from "./config.js";

const REQUEST_TIMEOUT_MS = 10000;
const CITY_SCHEMA = z.string().trim().min(1, "城市名稱不可為空白").max(200);
const TRANSLATION_SCHEMA = z.object({
  responseStatus: z.literal(200),
  responseData: z.object({ translatedText: CITY_SCHEMA }),
});
const WEATHER_SCHEMA = z.object({
  cod: z.literal(200),
  name: z.string().min(1),
  main: z.object({ temp: z.number().finite(), humidity: z.number().min(0).max(100) }),
  weather: z.array(z.object({ description: z.string().optional() })),
  wind: z.object({ speed: z.number().nonnegative() }),
  sys: z.object({ country: z.string().min(1) }),
});

async function fetchData(url: string, params: Record<string, string>, service: string): Promise<unknown> {
  try {
    const response = await axios.get<unknown>(url, {
      params,
      timeout: REQUEST_TIMEOUT_MS,
      // 同時限制連線建立與回應的總等待時間。
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.data;
  } catch (error: unknown) {
    // 不回傳原始 Axios 訊息或設定，避免 URL 中的 API Key 外洩。
    if (axios.isAxiosError(error)) {
      if (["ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED"].includes(error.code ?? "")) {
        throw new Error(service + "請求逾時，請稍後重試。");
      }
      switch (error.response?.status) {
        case 401:
          throw new Error(service + "授權失敗，請檢查 API 金鑰。");
        case 404:
          throw new Error(service + "找不到指定城市。");
        case 429:
          throw new Error(service + "請求頻率或額度已超過限制，請稍後重試。");
        default:
          if (error.response) {
            throw new Error(service + "回應錯誤（HTTP " + error.response.status + "）。");
          }
      }
    }
    throw new Error(service + "連線失敗，請稍後重試。");
  }
}

async function translateToEnglish(city: string): Promise<string> {
  if (/^[\x20-\x7E]+$/.test(city)) {
    return city;
  }
  const result = TRANSLATION_SCHEMA.safeParse(await fetchData(
    "https://api.mymemory.translated.net/get",
    { q: city, langpair: "zh-TW|en" },
    "翻譯服務",
  ));
  if (!result.success) {
    throw new Error("翻譯服務回應格式或狀態異常，請稍後重試，或使用英文城市名稱。");
  }
  return result.data.responseData.translatedText;
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "Real Weather MCP Server",
    version: "0.1.2",
  });

  server.tool(
    "get_weather",
    {
      city: CITY_SCHEMA.describe("城市名稱，可附國家代碼（例如 Taichung,TW）；英文直接查詢，中文先翻譯成英文。"),
    },
    async ({ city }) => {
      try {
        const cityInEnglish = await translateToEnglish(city);
        const result = WEATHER_SCHEMA.safeParse(await fetchData(
          "https://api.openweathermap.org/data/2.5/weather",
          { q: cityInEnglish, appid: config.apiKey, units: "metric" },
          "天氣服務",
        ));
        if (!result.success) {
          throw new Error("天氣服務回應格式或狀態異常，請稍後重試。");
        }
        const data = result.data;
        const weather = {
          city: data.name,
          temperature: data.main.temp,
          condition: data.weather[0]?.description || "N/A",
          humidity: data.main.humidity,
          wind_speed: data.wind.speed,
          country: data.sys.country,
        };
        return { content: [{ type: "text", text: JSON.stringify(weather, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "天氣查詢失敗，請稍後重試。";
        console.error("[get_weather] " + message);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
        };
      }
    },
  );

  return server;
}
