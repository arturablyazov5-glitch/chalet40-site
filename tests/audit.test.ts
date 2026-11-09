import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consultSchema, consultMessage } from "../src/lib/consult";
import { getLots } from "../src/lib/lots";
import { lotSeo } from "../src/lib/seo";
import { t, localizedPath } from "../src/i18n";
import { getPages } from "../src/lib/pages";
import sections from "../src/data/privacy.json";
import { deliverDevConsult } from "../server/consult-dev.mjs";
import { readSiteEnvironment } from "../server/environment.mjs";
const valid = {
  name: "Test User",
  method: "phone",
  contact: "+79991234567",
  consent: true,
  page: "/contact",
  lang: "ru",
};
test("MAX contacts accept a phone number and retain the chosen delivery channel", () => {
  const data = consultSchema.parse({ ...valid, method: "max" });
  assert.equal(data.method, "max");
  assert.match(consultMessage(data), /Связь:<\/b> MAX — <code>\+79991234567<\/code>/);
  for (const contact of ["@username", "123", "+7\n9991234567"]) {
    assert.equal(consultSchema.safeParse({ ...valid, method: "max", contact }).success, false);
  }
});
test("audited consultation limits reject message injection and oversized metadata", () => {
  for (const bad of [
    { name: "Test\nContact: forged" },
    { contact: "+7\n9991234567" },
    { page: "/contact\u2028Other" },
    { lot: "a".repeat(65) },
    { utm: { utm_unknown: "x" } },
    { utm: { utm_source: "x".repeat(201) } },
    { utm: [] },
    { name: "x\u202Ey" },
  ])
    assert.equal(consultSchema.safeParse({ ...valid, ...bad }).success, false);
  const parsed = consultSchema.parse({
    ...valid,
    name: "  Test User  ",
    utm: { utm_content: "b", utm_source: "a" },
  });
  assert.equal(parsed.name, "Test User");
  assert.match(consultMessage(parsed), /source=<code>a<\/code>/);
  const maximum = consultSchema.parse({
    ...valid,
    name: "x".repeat(100),
    lot: "x".repeat(64),
    page: "/" + "x".repeat(499),
    utm: Object.fromEntries(
      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
      ].map((k) => [k, "x".repeat(200)]),
    ),
  });
  assert.ok(consultMessage(maximum).length <= 4000);
  assert.equal(consultSchema.parse({ ...valid, company: "0" }).company, "0");
});
test("dev delivery is offline by default, and opt-in transport is fully stubbed", async () => {
  const data = consultSchema.parse(valid);
  let calls = 0;
  const transport = async (_url: unknown, request: RequestInit = {}) => {
    calls++;
    const body = request.body as URLSearchParams;
    assert.equal(body.get("parse_mode"), "HTML");
    assert.match(body.get("text")!, /<b>Новая заявка с сайта Chalet 40<\/b>/);
    return new Response('{"ok":true}', { status: 200 });
  };
  const fake = { token: "1:offline_TEST_ONLY", chatId: "1", send: false };
  assert.deepEqual(await deliverDevConsult(data, fake, transport), {
    status: 200,
    body: { ok: true },
  });
  assert.equal(calls, 0);
  assert.deepEqual(
    await deliverDevConsult(data, { ...fake, send: true }, transport),
    { status: 200, body: { ok: true } },
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await deliverDevConsult(
        data,
        { ...fake, send: true },
        async () => new Response('{"ok":false}', { status: 403 }),
      )
    ).status,
    502,
  );
  assert.equal(
    (
      await deliverDevConsult(data, { ...fake, send: true }, async () => {
        throw new Error("offline");
      })
    ).status,
    502,
  );
  assert.equal(
    (
      await deliverDevConsult(
        data,
        { send: true, token: "", chatId: "" },
        transport,
      )
    ).status,
    503,
  );
  assert.equal(calls, 1);
});
test("required .env missing has an actionable error without values", async () => {
  await assert.rejects(
    readSiteEnvironment(
      new URL("./missing-env-fixture/", import.meta.url),
      {},
      true,
    ),
    /site\/\.env/,
  );
});
test("privacy is indexable and sourced RU blocks remain verbatim; EN keys cover all sections", () => {
  const ru = JSON.parse(
    readFileSync(new URL("../src/i18n/ru.json", import.meta.url), "utf8"),
  );
  assert.equal(getPages().find((p) => p.id === "privacy")?.noindex, false);
  assert.equal(sections.length, 12);
  assert.deepEqual(
    sections.map((s) => s.anchor),
    Array.from({ length: 12 }, (_, i) => `section-${i + 1}`),
  );
  for (const s of sections) {
    assert.ok(ru[s.headingKey]);
    assert.ok(t("en", s.headingKey));
    for (const key of s.paragraphKeys) assert.ok(t("en", key));
  }
  assert.equal(localizedPath("/", "en"), "/en/");
});
test("all lot descriptions are within 50–170 chars and Flow refers to retail", () => {
  for (const lang of ["ru", "en"] as const)
    for (const lot of getLots()) {
      const description = lotSeo(lot, lang).description;
      assert.ok(
        description.length >= 50 && description.length <= 170,
        `${lang} ${lot.id}: ${description.length}`,
      );
    }
  assert.match(t("en", "lot.flow.alt.building"), /Retail building/);
  assert.match(
    t("en", "building.diagramCaption", { name: t("en", "building.retail") }),
    /Retail building/,
  );
  assert.equal(t("en", "metric.roofTerrace"), "Roof terrace");
  assert.equal(t("en", "nav.office"), "Office units");
});
