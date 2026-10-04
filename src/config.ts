import { resolve } from "node:path";
import dotenv from "dotenv";

export interface ServerConfig {
  apiKey: string;
}

export function loadConfig(): ServerConfig {
  let envPath: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("envPath=") || envPath !== undefined) {
      throw new Error("啟動參數只接受一個 envPath=<.env 路徑>。");
    }
    // 僅移除前綴，保留路徑內的等號與空白。
    envPath = arg.slice("envPath=".length);
    if (!envPath.trim()) {
      throw new Error("envPath 不可為空白。");
    }
  }

  const path = resolve(envPath ?? ".env");
  const result = dotenv.config({ path });
  if (result.error && (envPath !== undefined || (result.error as NodeJS.ErrnoException).code !== "ENOENT")) {
    throw new Error(`無法讀取設定檔：${path}`);
  }

  const apiKey = process.env.OPENWEATHERMAP_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 OPENWEATHERMAP_API_KEY，請設定環境變數或 .env 檔案。");
  }
  return { apiKey };
}
