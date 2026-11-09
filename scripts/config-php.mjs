import { writeFile, rename, chmod, access, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  readSiteEnvironment,
  validTelegramEnvironment,
} from "../server/environment.mjs";
const root = new URL("../", import.meta.url);
const quote = (value) =>
  "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
let temporary;
try {
  const env = await readSiteEnvironment(root, process.env, true);
  if (!validTelegramEnvironment(env))
    throw new Error(
      "В site/.env должны быть корректные непустые TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.",
    );
  try {
    await access(new URL("dist/api/consult.php", root));
  } catch {
    throw new Error(
      "Сначала выполните npm run build: dist/api/consult.php отсутствует.",
    );
  }
  process.umask(0o077);
  temporary = new URL(
    `dist/api/.config-${randomBytes(8).toString("hex")}.tmp`,
    root,
  );
  await writeFile(
    temporary,
    `<?php\nreturn ['token'=>${quote(env.token)},'chat_id'=>${quote(env.chatId)}];\n`,
    { mode: 0o600, flag: "wx" },
  );
  const target = new URL("dist/api/config.php", root);
  await rename(temporary, target);
  temporary = undefined;
  await chmod(target, 0o600);
  console.log(
    "Создан dist/api/config.php (0600): файл содержит секрет, грузить только на сервер.",
  );
} catch (error) {
  if (temporary) await unlink(temporary).catch(() => {});
  console.error(
    error instanceof Error ? error.message : "Не удалось создать конфигурацию.",
  );
  process.exitCode = 1;
}
