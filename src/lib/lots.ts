import { z } from "zod";
import records from "../data/lots.json";
import { t, number, currency, type Locale } from "../i18n";
export const buildingSchema = z.enum(["pyatnitskaya", "golikovsky", "retail"]);
const positive = z.number().positive();
const mediaSchema = z.object({
  src: z.string().regex(/^properties\/[a-z]+\/[\w.-]+$/),
  width: positive.int(),
  height: positive.int(),
});
export const lotSchema = z
  .object({
    id: z.string().regex(/^[a-z]+$/),
    building: buildingSchema,
    area: positive,
    terrace: positive.nullable(),
    roofTerrace: positive.nullable(),
    ceiling: z.array(positive).min(1).max(2),
    floors: z.array(z.number().int()).min(1).max(2),
    pricePerSqm: positive.int().nullable(),
    totalPrice: positive.int().nullable(),
    status: z.enum(["available", "reserved", "sold", "onrequest"]),
    media: z.object({
      plan: mediaSchema,
      floor: mediaSchema.optional(),
      building: mediaSchema.optional(),
      render: mediaSchema,
      hero: mediaSchema,
    }),
    document: z.string().regex(/^\/assets\/documents\/[\w.-]+\.pdf$/),
  })
  .superRefine((lot, ctx) => {
    if (lot.status === "available" && (!lot.totalPrice || !lot.pricePerSqm))
      ctx.addIssue({
        code: "custom",
        message: "Available lots require both prices",
      });
    for (const key of ["ceiling", "floors"] as const)
      if (lot[key].length === 2 && lot[key][0]! > lot[key][1]!)
        ctx.addIssue({ code: "custom", message: `Invalid ${key} range` });
  });
export type Lot = z.infer<typeof lotSchema>;
export type Building = z.infer<typeof buildingSchema>;
// This is the only data access boundary. Array order is the original button order.
const lots = z.array(lotSchema).min(10).parse(records);
if (new Set(lots.map((l) => l.id)).size !== lots.length)
  throw new Error("Duplicate lot ids");
export function getLots(building?: Building): Lot[] {
  return structuredClone(
    lots.filter((l) => !building || l.building === building),
  );
}
export function getLot(id: string): Lot {
  const lot = lots.find((l) => l.id === id);
  if (!lot) throw new Error(`Unknown lot: ${id}`);
  return structuredClone(lot);
}
export const buildings: Building[] = ["pyatnitskaya", "golikovsky", "retail"];
export function buildingPath(building: Building): string {
  return building === "retail" ? "/retail" : `/office/${building}`;
}
export function lotPath(lot: Lot): string {
  return `${buildingPath(lot.building)}/${lot.id}`;
}
export function lotText(lot: Lot, lang: Locale) {
  return {
    name: t(lang, `lot.${lot.id}.name`),
    description: t(lang, `lot.${lot.id}.description`),
  };
}
export function priceText(lot: Lot, lang: Locale): string {
  return lot.status === "available" && lot.totalPrice
    ? `${currency(lang, lot.totalPrice)} (${t(lang, "ui.vat")})`
    : t(lang, `ui.${lot.status}`);
}
export function lotMetrics(lot: Lot, lang: Locale) {
  const range = (values: number[]) =>
    values.map((v) => number(lang, v)).join("–");
  return [
    { key: "area", value: number(lang, lot.area), unit: t(lang, "ui.sqm") },
    ...(lot.terrace
      ? [
          {
            key: "terrace",
            value: number(lang, lot.terrace),
            unit: t(lang, "ui.sqm"),
          },
        ]
      : []),
    ...(lot.roofTerrace
      ? [
          {
            key: "roofTerrace",
            value: number(lang, lot.roofTerrace),
            unit: t(lang, "ui.sqm"),
          },
        ]
      : []),
    { key: "ceiling", value: range(lot.ceiling), unit: t(lang, "ui.m") },
    { key: "floor", value: range(lot.floors), unit: "" },
  ].map((m) => ({ ...m, label: t(lang, `metric.${m.key}`) }));
}
