import { consultSchema, consultMessage } from "../src/lib/consult.ts";
import { validTelegramEnvironment } from "./environment.mjs";
/** Transport is injectable for offline tests. No network is used unless env.send is explicitly true. */
export async function deliverDevConsult(data, env, transport = fetch) {
  if (!env.send) return { status: 200, body: { ok: true } };
  if (!validTelegramEnvironment(env))
    return { status: 503, body: { ok: false, error: "service_unavailable" } };
  try {
    const response = await transport(
      `https://api.telegram.org/bot${env.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          chat_id: env.chatId,
          text: consultMessage(data),
          parse_mode: "HTML",
          link_preview_options: JSON.stringify({ is_disabled: true }),
        }),
        signal: AbortSignal.timeout(12000),
      },
    );
    const result = await response.json();
    return response.status === 200 && result?.ok === true
      ? { status: 200, body: { ok: true } }
      : { status: 502, body: { ok: false, error: "delivery_failed" } };
  } catch {
    return { status: 502, body: { ok: false, error: "delivery_failed" } };
  }
}
// Exported so tests can exercise the middleware without booting an Astro dev server.
export function createDevConsultHandler(env) {
  const attempts = new Map();
  return async (req, res, next) => {
    if (req.url !== "/" && req.url !== "") return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return reply(405, { ok: false, error: "method_not_allowed" });
    }
    const port = req.socket.localPort;
    if (
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
        req.headers.origin,
      ) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reply(403, { ok: false, error: "origin_not_allowed" });
    if (
      req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return reply(415, { ok: false, error: "invalid_content_type" });
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192)
          return reply(413, { ok: false, error: "payload_too_large" });
        chunks.push(chunk);
      }
    } catch {
      return reply(400, { ok: false, error: "invalid_json" });
    }
    let raw;
    try {
      raw = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.concat(chunks),
        ),
      );
    } catch {
      return reply(400, { ok: false, error: "invalid_json" });
    }
    const parsed = consultSchema.safeParse(raw);
    if (!parsed.success)
      return reply(422, { ok: false, error: "validation_failed" });
    const data = parsed.data;
    if ((data.company ?? "") !== "") return reply(200, { ok: true });
    const now = Date.now();
    for (const [key, times] of attempts)
      if (!times.some((time) => now - time < 60000)) attempts.delete(key);
    const key = req.socket.remoteAddress ?? "local";
    const recent = (attempts.get(key) ?? []).filter(
      (time) => now - time < 60000,
    );
    if (recent.length >= 5) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((60000 - now + recent[0]) / 1000))),
      );
      return reply(429, { ok: false, error: "rate_limited" });
    }
    attempts.set(key, [...recent, now]);
    const result = await deliverDevConsult(data, env);
    return reply(result.status, result.body);
  };
}
export function devConsultIntegration(env) {
  const handler = createDevConsultHandler(env);
  return {
    name: "consult-dev",
    hooks: {
      "astro:server:setup": ({ server }) => {
        server.middlewares.use("/api/consult", handler);
      },
    },
  };
}
