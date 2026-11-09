import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  getPages,
  getContentRoutes,
  pageText,
  pageJsonLd,
} from "../src/lib/pages";
import {
  getParkingItems,
  getParkingFloor,
  parkingItemSchema,
  parkingSchema,
} from "../src/lib/parking";
import { delivery, deliveryText, siteData } from "../src/data/site";
import { t } from "../src/i18n";
import { consultSchema } from "../src/lib/consult";
test("all new routes share templates and dictionaries; policy is indexable", () => {
  const routes = getContentRoutes();
  assert.equal(routes.length, 18);
  for (const lang of ["ru", "en"] as const)
    for (const page of getPages()) {
      assert.ok(t(lang, page.titleKey));
      assert.ok(t(lang, page.descriptionKey));
      const headings = page.sections.flatMap((s) => s.headings);
      assert.equal(headings.filter((h) => h.level === 1).length, 1);
      for (const section of page.sections) {
        for (const key of section.paragraphs) assert.ok(pageText(lang, key));
        for (const heading of section.headings) assert.ok(t(lang, heading.key));
        for (const media of section.media) {
          assert.ok(t(lang, media.altKey));
          assert.ok(
            existsSync(new URL("../src/assets/" + media.src, import.meta.url)),
          );
        }
      }
    }
  assert.equal(getPages().find((p) => p.id === "privacy")?.noindex, false);
  assert.deepEqual(delivery, { quarter: 3, year: 2028 });
  assert.equal(deliveryText("ru"), "3 квартал 2028");
  assert.equal(deliveryText("en"), "Q3 2028");
  for (const id of ["home", "about"])
    assert.ok(
      getPages()
        .find((p) => p.id === id)
        ?.sections.some((s) => s.paragraphs.includes("site.delivery")),
    );
  assert.equal(pageJsonLd("home", "ru")[0]?.["@type"], "RealEstateAgent");
  assert.equal(pageJsonLd("contact", "en")[0]?.["@type"], "ContactPage");
});
test("parking inventory preserves authoritative totals and statuses", () => {
  const items = getParkingItems();
  assert.equal(items.length, 32);
  assert.equal(items.filter((i) => i.type === "parking").length, 22);
  assert.equal(items.filter((i) => i.type === "storeroom").length, 10);
  assert.equal(getParkingItems(-1).length, 10);
  assert.equal(getParkingItems(-2).length, 22);
  assert.equal(items.find((i) => i.id === "P2")?.totalPrice, 23300000);
  assert.equal(items.find((i) => i.id === "K1")?.totalPrice, 6200000);
  assert.deepEqual(
    items.filter((i) => i.status === "reserved").map((i) => i.id),
    ["P11", "P12"],
  );
  assert.equal(
    parkingItemSchema.safeParse({ ...items[0], areaM2: "26.5" }).success,
    false,
  );
  assert.equal(
    parkingItemSchema.safeParse({ ...items[0], svg: "#p99" }).success,
    false,
  );
  assert.equal(
    parkingItemSchema.safeParse({ ...items[0], totalPrice: -1 }).success,
    false,
  );
  const data = JSON.parse(
    readFileSync(new URL("../src/data/parking.json", import.meta.url), "utf8"),
  );
  data.items[1] = data.items[0];
  assert.equal(parkingSchema.safeParse(data).success, false);
});
test("each parking id and subsidiary shape resolves to an existing vector group", () => {
  for (const floor of [-1, -2] as const) {
    const source = readFileSync(
      new URL("../src/assets/" + getParkingFloor(floor).svg, import.meta.url),
      "utf8",
    );
    for (const item of getParkingItems(floor))
      assert.ok(source.includes(`id="${item.svg.slice(1)}"`), item.id);
    for (const id of source.matchAll(/id="([pk]\d+)(?:-b)?"/g))
      assert.ok(
        getParkingItems(floor).some((i) => i.svg === "#" + id[1]),
        id[0],
      );
  }
});
test("shared menu resolves to contract paths; confirmed external footer links", () => {
  assert.deepEqual(
    siteData.menu.map((l) => l.href),
    ["/about", "/office", "/retail", "/parking", "/map", "/contact"],
  );
  assert.deepEqual(
    siteData.footerLinks.map((l) => l.href),
    ["https://hitbroker.ru", "https://t.me/hitechdevelopment"],
  );
});

test("parking consultations use the same API with the selected inventory id", () => {
  assert.ok(
    consultSchema.safeParse({
      name: "Test User",
      method: "phone",
      contact: "+79991234567",
      consent: true,
      lot: "P13",
      page: "/parking/floor-1",
      lang: "ru",
    }).success,
  );
});
