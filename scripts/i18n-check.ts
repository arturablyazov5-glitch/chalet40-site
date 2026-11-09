import { existsSync } from "node:fs";
import ru from "../src/i18n/ru.json";
import en from "../src/i18n/en.json";
import { getLots } from "../src/lib/lots";
import { getPages } from "../src/lib/pages";
const errors: string[] = [];
const english: Record<string, string> = en;
// "наш.дом.рф" is a proper domain name and legitimately stays Cyrillic in EN.
const CYRILLIC = /[А-Яа-яЁё]/;
for (const [key, value] of Object.entries(ru)) {
  if (!english[key]?.trim()) errors.push(`Missing EN: ${key}`);
  const tokens = (s: string) =>
    [...s.matchAll(/\{\w+\}/g)]
      .map((m) => m[0])
      .sort()
      .join(",");
  if (english[key] && tokens(value) !== tokens(english[key]))
    errors.push(`Interpolation mismatch: ${key}`);
}
for (const key of Object.keys(en))
  if (!(key in ru)) errors.push(`EN-only key: ${key}`);
for (const [key, value] of Object.entries(english))
  if (CYRILLIC.test(value.replaceAll("наш.дом.рф", "")))
    errors.push(`EN value contains Cyrillic: ${key}`);
for (const lot of getLots())
  for (const suffix of [
    "name",
    "description",
    ...Object.keys(lot.media).map((k) => `alt.${k}`),
  ])
    if (!(`lot.${lot.id}.${suffix}` in ru))
      errors.push(`Missing lot text: ${lot.id}.${suffix}`);
const dictionary = ru as Record<string, string>;
const referencedKey = (owner: string, key: string) => {
  if (!dictionary[key]?.trim() || !english[key]?.trim())
    errors.push(`pages.json references missing i18n key ${key} (${owner})`);
};
const mediaRoots = ["../src/assets/", "../public/"];
const mediaExists = (src: string) =>
  mediaRoots.some((root) => existsSync(new URL(root + src, import.meta.url)));
for (const page of getPages()) {
  referencedKey(page.id, page.titleKey);
  referencedKey(page.id, page.descriptionKey);
  for (const section of page.sections) {
    for (const heading of section.headings)
      referencedKey(`${page.id} heading`, heading.key);
    for (const key of section.paragraphs)
      referencedKey(`${page.id} paragraph`, key);
    for (const link of section.links)
      referencedKey(`${page.id} link`, link.key);
    for (const stat of section.stats ?? [])
      referencedKey(`${page.id} stat`, stat.labelKey);
    for (const media of section.media) {
      referencedKey(`${page.id} media alt`, media.altKey);
      if (!mediaExists(media.src))
        errors.push(`Missing media file: ${media.src} (${page.id})`);
    }
  }
}
for (const lot of getLots())
  for (const media of Object.values(lot.media))
    if (!mediaExists(media.src))
      errors.push(`Missing lot media file: ${media.src} (${lot.id})`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `i18n OK: ${Object.keys(ru).length} RU/EN keys, ${getLots().length} lots, ${getPages().length} pages`,
);
