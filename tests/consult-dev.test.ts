import test from "node:test";
import assert from "node:assert/strict";
import { createDevConsultHandler } from "../server/consult-dev.mjs";

const env = { send: false };
const validBody = JSON.stringify({
  name: "Test User",
  method: "phone",
  contact: "+79991234567",
  consent: true,
  page: "/contact",
  lang: "ru",
});

function mockRequest({
  method = "POST",
  url = "/",
  headers = {},
  body = validBody,
  remoteAddress = "10.0.0.1",
}: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  remoteAddress?: string;
} = {}) {
  const chunks = body === "" ? [] : [Buffer.from(body, "utf8")];
  const iterable = (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
  return Object.assign(iterable, {
    method,
    url,
    headers: {
      origin: "http://127.0.0.1:4322",
      "content-type": "application/json",
      ...headers,
    },
    socket: { localPort: 4322, remoteAddress },
  });
}

function mockResponse() {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 0,
    body: "",
    headers,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk: string) {
      res.body = chunk;
      return res;
    },
  };
  return res;
}

async function call(handler: any, req: any) {
  const res = mockResponse();
  let nexted = false;
  await handler(req, res, () => {
    nexted = true;
  });
  return { res, nexted, json: () => JSON.parse(res.body) };
}

test("consult-dev middleware: rejects non-POST with 405 and Allow header", async () => {
  const handler = createDevConsultHandler(env);
  const { res, json } = await call(handler, mockRequest({ method: "GET" }));
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.get("allow"), "POST");
  assert.deepEqual(json(), { ok: false, error: "method_not_allowed" });
});

test("consult-dev middleware: foreign and missing Origin get 403", async () => {
  const handler = createDevConsultHandler(env);
  for (const origin of [
    "https://evil.example",
    "http://127.0.0.1:9999",
    undefined,
  ]) {
    const { res, json } = await call(
      handler,
      mockRequest({ headers: { origin: origin as string } }),
    );
    assert.equal(res.statusCode, 403);
    assert.deepEqual(json(), { ok: false, error: "origin_not_allowed" });
  }
  const crossSite = await call(
    handler,
    mockRequest({ headers: { "sec-fetch-site": "cross-site" } }),
  );
  assert.equal(crossSite.res.statusCode, 403);
});

test("consult-dev middleware: non-JSON Content-Type gets 415", async () => {
  const handler = createDevConsultHandler(env);
  for (const type of ["text/plain", "application/x-www-form-urlencoded", ""]) {
    const { res, json } = await call(
      handler,
      mockRequest({ headers: { "content-type": type } }),
    );
    assert.equal(res.statusCode, 415, type);
    assert.deepEqual(json(), { ok: false, error: "invalid_content_type" });
  }
  const charset = await call(
    handler,
    mockRequest({ headers: { "content-type": "Application/JSON; charset=utf-8" } }),
  );
  assert.equal(charset.res.statusCode, 200);
});

test("consult-dev middleware: body over 8192 bytes gets 413", async () => {
  const handler = createDevConsultHandler(env);
  const { res, json } = await call(
    handler,
    mockRequest({ body: "x".repeat(8193) }),
  );
  assert.equal(res.statusCode, 413);
  assert.deepEqual(json(), { ok: false, error: "payload_too_large" });
});

test("consult-dev middleware: malformed JSON gets 400, schema failure 422", async () => {
  const handler = createDevConsultHandler(env);
  const bad = await call(handler, mockRequest({ body: "{not json" }));
  assert.equal(bad.res.statusCode, 400);
  assert.deepEqual(bad.json(), { ok: false, error: "invalid_json" });
  const invalid = await call(
    handler,
    mockRequest({ body: JSON.stringify({ name: "x" }) }),
  );
  assert.equal(invalid.res.statusCode, 422);
  assert.deepEqual(invalid.json(), { ok: false, error: "validation_failed" });
});

test("consult-dev middleware: honeypot returns formal success without transport", async () => {
  // send:true with empty credentials would produce 503 if transport were reached.
  const handler = createDevConsultHandler({ send: true, token: "", chatId: "" });
  const { res, json } = await call(
    handler,
    mockRequest({ body: JSON.stringify({ ...JSON.parse(validBody), company: "0" }) }),
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json(), { ok: true });
});

test("consult-dev middleware: offline success and 5-per-60s rate limit", async () => {
  const handler = createDevConsultHandler(env);
  for (let i = 0; i < 5; i++) {
    const { res, json } = await call(
      handler,
      mockRequest({ remoteAddress: "10.9.9.9" }),
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(json(), { ok: true });
  }
  const limited = await call(handler, mockRequest({ remoteAddress: "10.9.9.9" }));
  assert.equal(limited.res.statusCode, 429);
  assert.deepEqual(limited.json(), { ok: false, error: "rate_limited" });
  assert.ok(Number(limited.res.headers.get("retry-after")) >= 1);
  // A different remote address is not limited.
  const other = await call(handler, mockRequest({ remoteAddress: "10.9.9.10" }));
  assert.equal(other.res.statusCode, 200);
});
