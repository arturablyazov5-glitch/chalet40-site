import { z } from "zod";
import source from "../data/parking.json";
export const parkingItemSchema = z
  .object({
    id: z.string().regex(/^(P|K)[1-9]\d*$/),
    floor: z.union([z.literal(-1), z.literal(-2)]),
    type: z.enum(["parking", "storeroom"]),
    areaM2: z.number().positive(),
    pricePerM2: z.number().int().positive(),
    totalPrice: z.number().int().positive(),
    status: z.enum(["available", "reserved", "sold"]),
    svg: z.string().regex(/^#[pk][1-9]\d*$/),
  })
  .superRefine((item, ctx) => {
    if (item.svg !== `#${item.id.toLowerCase()}`)
      ctx.addIssue({
        code: "custom",
        message: "SVG id must match inventory id",
      });
    if (
      item.type === "storeroom" &&
      (item.floor !== -2 || !item.id.startsWith("K"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Storage rooms belong to level -2",
      });
    if (item.type === "parking" && !item.id.startsWith("P"))
      ctx.addIssue({ code: "custom", message: "Parking id must start with P" });
  });
/**
 * totalPrice rule (verified against all 32 items):
 * round(areaM2 * pricePerM2) to the nearest 100 000 ₽, halves rounded up
 * (e.g. 23.25 m² → 23 300 000, 13.25 m² → 13 300 000, 17.92 m² → 17 900 000).
 */
export const parkingSchema = z
  .object({
    floors: z
      .array(
        z.object({
          floor: z.union([z.literal(-1), z.literal(-2)]),
          svg: z.string().regex(/^editorial\/parking-floor-[12]\.svg$/),
        }),
      )
      .length(2),
    items: z.array(parkingItemSchema).length(32),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.items.map((i) => i.id)).size !== data.items.length)
      ctx.addIssue({ code: "custom", message: "Duplicate parking id" });
    if (new Set(data.floors.map((f) => f.floor)).size !== 2)
      ctx.addIssue({ code: "custom", message: "Duplicate floor" });
    // P2 is the calibration reference for parkingMetersPerUnit below.
    if (!data.items.some((i) => i.id === "P2"))
      ctx.addIssue({ code: "custom", message: "Missing calibration item P2" });
  });
const data = parkingSchema.parse(source);
export type ParkingItem = z.infer<typeof parkingItemSchema>;
export type ParkingFloor = -1 | -2;
export function getParkingItems(floor?: ParkingFloor): ParkingItem[] {
  // Items are read-only downstream (render + filter); no clone needed.
  return data.items.filter(
    (i) => floor === undefined || i.floor === floor,
  );
}
export function getParkingFloor(floor: ParkingFloor) {
  const item = data.floors.find((f) => f.floor === floor);
  if (!item) throw new Error(`Missing floor ${floor}`);
  return { ...item };
}

/** Port of mirror/parking/floor-1|2 getSizeLabel; no class outside source ranges. */
export function parkingSizeClass(area: number): "S" | "M" | "L" | "XL" | null {
  if (area >= 13 && area <= 14.5) return "S";
  if (area >= 16 && area <= 18.5) return "M";
  if (area >= 21.5 && area <= 24.9) return "L";
  if (area >= 25) return "XL";
  return null;
}
export function parkingCounts(floor: ParkingFloor) {
  return (["parking", "storeroom"] as const).map(type => {
    const items = getParkingItems(floor).filter(item => item.type === type);
    return {type, total: items.length, available: items.filter(item => item.status === "available").length};
  }).filter(count => count.total > 0);
}
// Original getMetersPerSvgUnit calibration: the P2 bay is 23.25 m² and its SVG
// bounding box measures P2_SVG_WIDTH × P2_SVG_HEIGHT viewBox units, so one SVG
// unit equals sqrt(areaM2 / bboxArea) metres. P2's presence is enforced by
// parkingSchema above.
const P2_SVG_WIDTH = 48.24;
const P2_SVG_HEIGHT = 130.44;
export const parkingMetersPerUnit = Math.sqrt(
  data.items.find((item) => item.id === "P2")!.areaM2 /
    (P2_SVG_WIDTH * P2_SVG_HEIGHT),
);
