import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { getLots, getLot, lotSchema, lotPath } from "../src/lib/lots";
import { getRoutes } from "../src/lib/routes";
import { consultSchema } from "../src/lib/consult";
import { t } from "../src/i18n";
test("source ordering, exact prices, ranges and reserved lot", () => {
  assert.deepEqual(
    getLots("pyatnitskaya").map((l) => l.id),
    ["gain", "value", "profit", "revenue"],
  );
  assert.deepEqual(
    getLots("retail").map((l) => l.id),
    ["flow", "traffic"],
  );
  assert.deepEqual(
    getLots("golikovsky").map((l) => l.id),
    ["capital", "fortune", "success", "benefit", "spa"],
  );
  assert.equal(getLot("value").totalPrice, 275000000);
  assert.equal(getLot("value").roofTerrace, null);
  assert.equal(getLot("profit").status, "reserved");
  assert.equal(getLot("profit").totalPrice, null);
  assert.deepEqual(getLot("traffic").ceiling, [3.4, 4.6]);
  assert.deepEqual(getLot("traffic").floors, [-1, 1]);
  assert.equal(lotPath(getLot("traffic")), "/retail/traffic");
});
test("schema rejects string prices, missing available prices and descending ranges", () => {
  const lot = getLot("value");
  assert.equal(
    lotSchema.safeParse({ ...lot, totalPrice: "275000000" }).success,
    false,
  );
  assert.equal(
    lotSchema.safeParse({ ...lot, totalPrice: null }).success,
    false,
  );
  assert.equal(lotSchema.safeParse({ ...lot, ceiling: [4, 3] }).success, false);
});
test("all media and documents exist; all routes have RU and EN", () => {
  for (const lot of getLots()) {
    for (const media of Object.values(lot.media))
      assert.ok(
        existsSync(new URL(`../src/assets/${media.src}`, import.meta.url)),
      );
    assert.ok(existsSync(new URL(`../public${lot.document}`, import.meta.url)));
  }
  const routes = getRoutes();
  assert.equal(routes.length, 28);
  assert.equal(new Set(routes.map((r) => r.path)).size, 28);
  assert.ok(routes.some((r) => r.path === "/office/golikovsky/spa"));
  assert.ok(routes.some((r) => r.path === "/en/office/golikovsky/spa"));
  for (const r of routes.filter((r) => r.lang === "ru"))
    assert.ok(routes.some((en) => en.path === "/en" + r.path));
});
test("access boundary does not expose mutable records", () => {
  const lot = getLot("value");
  lot.totalPrice = 1;
  assert.equal(getLot("value").totalPrice, 275000000);
});
test("consult contract validates contacts and explicit consent", () => {
  const valid = {
    name: "Rafael",
    method: "phone",
    contact: "+7 999 123-45-67",
    consent: true,
    page: "/retail",
    lang: "ru",
  };
  assert.ok(consultSchema.safeParse(valid).success);
  for (const bad of [
    { consent: false },
    { contact: "abc" },
    { method: "email" },
    { page: "https://external.test" },
  ])
    assert.equal(consultSchema.safeParse({ ...valid, ...bad }).success, false);
  assert.ok(
    consultSchema.safeParse({
      ...valid,
      method: "telegram",
      contact: "@rafael_test",
    }).success,
  );
  assert.throws(() => t("en", "missing.key"));
});
