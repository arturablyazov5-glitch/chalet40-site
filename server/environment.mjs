import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
export async function readSiteEnvironment(
  root,
  inherited = process.env,
  required = false,
) {
  let file = {};
  try {
    file = parseEnv(await readFile(new URL(".env", root), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT" || required)
      throw new Error(
        required
          ? "Не удалось прочитать site/.env. Создайте его с TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID."
          : "Не удалось прочитать site/.env. Проверьте синтаксис без вывода содержимого.",
      );
  }
  const value = (key) => inherited[key] ?? file[key] ?? "";
  return {
    token: value("TELEGRAM_BOT_TOKEN"),
    chatId: value("TELEGRAM_CHAT_ID"),
    send: value("TELEGRAM_DEV_SEND") === "1",
  };
}
export function validTelegramEnvironment(env) {
  return (
    /^\d+:[A-Za-z0-9_-]+$/.test(env.token) &&
    /^(?:-?\d+|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(env.chatId)
  );
}
