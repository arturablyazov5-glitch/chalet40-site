import one from "../assets/editorial/parking-floor-1.svg?raw";
import two from "../assets/editorial/parking-floor-2.svg?raw";
import { getParkingItems, parkingSizeClass, parkingMetersPerUnit, type ParkingFloor } from "./parking";
import { t, number, type Locale } from "../i18n";
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** Scale bar geometry in SVG units: a 5 m reference bar at the plan's right edge. */
const SCALE_BAR_X = 1490;
const SCALE_BAR_Y = 890;
const SCALE_TEXT_Y = 915;
const SCALE_METERS = 5;
const CYRILLIC = /[Ѐ-ӿ]/;
/** RU source labels translated for EN; any Cyrillic left after this fails the build. */
const EN_SOURCE_LABELS: [RegExp, string][] = [
  [/>Лифт</g, ">Lift<"],
  [/>Автомобильный</g, ">Car<"],
  [/>лифт</g, ">lift<"],
  [/>Зона</g, ">Waiting<"],
  [/>ожидания</g, ">room<"],
  [/>\(водительская\)</g, ">(drivers)<"],
];
const INVENTORY_LABEL = /^[PK]\d+$/;
const INVENTORY_GROUP = /^[pk]\d/;
/** Trusted, local vector sources only; inventory and locale attributes are added at build time. */
export function parkingSvg(floor: ParkingFloor, lang: Locale): string {
  const items = getParkingItems(floor);
  const source = floor === -1 ? one : two;
  let svg = source;
  if (lang === "en")
    for (const [pattern, replacement] of EN_SOURCE_LABELS)
      svg = svg.replace(pattern, replacement);
  const initialScale = `<g data-scale-initial aria-label="${escape(t(lang, "parking.scale"))}"><path d="M${SCALE_BAR_X - SCALE_METERS / parkingMetersPerUnit} ${SCALE_BAR_Y}v8h${SCALE_METERS / parkingMetersPerUnit}v-8" fill="none" stroke="#555" stroke-width="2"/><text x="${SCALE_BAR_X}" y="${SCALE_TEXT_Y}" fill="#555" font-size="12" text-anchor="end">${SCALE_METERS} ${t(lang, "ui.m")}</text></g>`;
  const labelled = new Set<string>();
  const unlabelled: string[] = [];
  svg = svg
    .replace(/<\/svg>$/, initialScale + "</svg>")
    .replace(/<text\b([^>]*class="lotLabel"[^>]*)>([^<]*)<\/text>/g, (tag, attrs: string, id: string) => {
      const item = items.find(item => item.id === id);
      if (!item) {
        if (INVENTORY_LABEL.test(id)) unlabelled.push(id);
        return tag;
      }
      labelled.add(item.id);
      const x = attrs.match(/\bx="([^"]+)"/)?.[1] ?? "0";
      const y = Number(attrs.match(/\by="([^"]+)"/)?.[1] ?? 0);
      const size = parkingSizeClass(item.areaM2);
      return `<text ${attrs} aria-hidden="true"><tspan class="parking-label-id" x="${x}" y="${y - 6}" font-size="13" font-weight="700">${item.id}<tspan class="parking-label-class">${size ? ` (${size})` : ""}</tspan></tspan><tspan class="parking-label-area" x="${x}" y="${y + 7}" font-size="10" font-weight="400">${number(lang, item.areaM2)} ${t(lang, "ui.sqm")}</tspan></text>`;
    })
    .replace(
      /<svg\b/,
      `<svg data-parking-svg role="group" aria-label="${escape(t(lang, "parking.plan", { floor }))}"`,
    );
  const grouped = new Set<string>();
  const ungrouped: string[] = [];
  svg = svg.replace(/<g\b[^>]*>/g, (tag) => {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    if (!id) return tag;
    const key = id.replace(/-b$/, "");
    const item = items.find((i) => i.svg === "#" + key);
    const clean = tag
      .replace(/\s(?:role|aria-label|tabindex)="[^"]*"/g, "")
      .slice(0, -1);
    if (item) {
      grouped.add(item.svg);
      const secondary = id !== key;
      const label = `${t(lang, `parking.${item.type}`)} ${item.id}, ${parkingSizeClass(item.areaM2) ? parkingSizeClass(item.areaM2) + ", " : ""}${number(lang, item.areaM2)} ${t(lang, "ui.sqm")}, ${t(lang, `ui.${item.status}`)}`;
      return `${clean} data-parking-id="${item.id}" data-status="${item.status}" ${secondary ? 'aria-hidden="true"' : `role="button" tabindex="0" aria-pressed="false" aria-controls="parking-card" aria-label="${escape(label)}"`}>`;
    }
    const zone = id.startsWith("lift")
      ? "lift"
      : ["carlift", "waitzone"].includes(id)
        ? id
        : null;
    if (zone)
      return `${clean} data-parking-zone="${escape(t(lang, `parking.${zone}`))}" role="button" tabindex="0" aria-label="${escape(t(lang, `parking.${zone}`))}">`;
    if (INVENTORY_GROUP.test(id)) ungrouped.push(id);
    return tag;
  });
  for (const item of items) {
    if (!labelled.has(item.id))
      throw new Error(`parking-svg floor ${floor}: no lotLabel matched ${item.id}`);
    if (!grouped.has(item.svg))
      throw new Error(`parking-svg floor ${floor}: no <g> matched ${item.svg} (${item.id})`);
  }
  if (unlabelled.length)
    throw new Error(
      `parking-svg floor ${floor}: lotLabel without inventory item: ${unlabelled.join(", ")}`,
    );
  if (ungrouped.length)
    throw new Error(
      `parking-svg floor ${floor}: group id without inventory item: ${ungrouped.join(", ")}`,
    );
  if (lang === "en" && CYRILLIC.test(svg))
    throw new Error(
      `parking-svg floor ${floor}: Cyrillic text remains in EN output; a source label is missing from EN_SOURCE_LABELS`,
    );
  return svg;
}
