import source from "../assets/editorial/location-map.svg?raw";
import labels from "../data/map-labels.json";
import { t, type Locale } from "../i18n";
const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Preserve the original vector geometry and label extents, including curved letter-by-letter labels. */
export function locationMap(lang: Locale): string {
  const seen = new Set<string>();
  for (const label of labels) {
    if (label.ids.length !== label.widths.length)
      throw new Error(
        `map label ${label.key}: ${label.ids.length} ids vs ${label.widths.length} widths`,
      );
    for (const id of label.ids) {
      if (seen.has(id)) throw new Error(`Duplicate map label id ${id}`);
      seen.add(id);
    }
  }
  if (lang === "ru") return source;
  let svg = source;
  for (const label of labels) {
    const text = t(lang, label.key);
    const chars = [...text];
    label.ids.forEach((id, index) => {
      const part = chars
        .slice(
          Math.floor((index * chars.length) / label.ids.length),
          Math.floor(((index + 1) * chars.length) / label.ids.length),
        )
        .join("");
      const pattern = new RegExp(
        `<tspan\\b([^>]*\\bid="${id}"[^>]*)>[\\s\\S]*?<\\/tspan>`,
      );
      let matched = false;
      svg = svg.replace(pattern, (_, attributes: string) => {
        matched = true;
        const attrs = attributes.replace(
          /\bx="([^"]*)"/,
          (_all: string, value: string) => `x="${value.split(" ")[0]}"`,
        );
        return `<tspan${attrs} textLength="${label.widths[index]}" lengthAdjust="spacingAndGlyphs">${escape(part)}</tspan>`;
      });
      if (!matched) throw new Error(`Missing map label ${id}`);
    });
  }
  return svg;
}
