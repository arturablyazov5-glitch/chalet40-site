import ru from "./ru.json";
import en from "./en.json";
export type Locale = "ru" | "en";
export const locales: Locale[] = ["ru", "en"];
const dictionaries: Record<Locale, Record<string, string>> = { ru, en };
export function t(
  lang: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const value = dictionaries[lang][key];
  if (value === undefined)
    throw new Error(`Missing ${lang} translation: ${key}`);
  return value.replace(/\{(\w+)\}/g, (_, name: string) => {
    const param = params[name];
    if (param === undefined) return `{${name}}`;
    // Parking levels are always negative; render the typographic minus (U+2212).
    if (name === "floor" && typeof param === "number" && param < 0)
      return `−${-param}`;
    return String(param);
  });
}
/** Split an office-selector marker label into two display lines
 *  ("Корпус — «Пятницкая»" → ["Корпус", "«Пятницкая»"]). */
export function markerLines(label: string): [string, string] {
  const dash = label.split(/\s+[—–-]\s+/);
  if (dash.length === 2) return [dash[0]!, dash[1]!];
  const space = label.indexOf(" ");
  return space === -1
    ? [label, ""]
    : [label.slice(0, space), label.slice(space + 1)];
}
export function localizedPath(path: string, lang: Locale): string {
  return lang === "en" ? `/en${path === "/" ? "/" : path}` : path;
}
export function unlocalizedPath(path: string): string {
  return path.replace(/^\/en(?=\/|$)/, "") || "/";
}
export function number(lang: Locale, value: number): string {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
}
export function currency(lang: Locale, value: number): string {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}
