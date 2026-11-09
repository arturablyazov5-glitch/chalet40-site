import { z } from "zod";
import source from "../data/pages.json";
import { locales, localizedPath, t, type Locale } from "../i18n";
import { deliveryText, siteData } from "../data/site";
const sectionSchema = z.object({
  role: z.string(),
  headings: z.array(
    z.object({ level: z.number().int().min(1).max(6), key: z.string() }),
  ),
  paragraphs: z.array(z.string()),
  media: z.array(z.object({ src: z.string(), altKey: z.string() })),
  links: z.array(z.object({ href: z.string(), key: z.string() })),
  stats: z
    .array(z.object({ value: z.string(), labelKey: z.string() }))
    .optional(),
});
export const pageSchema = z.object({
  id: z.string(),
  path: z.string().startsWith("/"),
  titleKey: z.string(),
  descriptionKey: z.string(),
  noindex: z.boolean(),
  sections: z.array(sectionSchema),
});
const pages = z.array(pageSchema).parse(source);
const warnedJsonLdIds = new Set<string>();
export type ContentPage = z.infer<typeof pageSchema>;
export type PageRoute =
  | { kind: "content"; lang: Locale; path: string; page: ContentPage }
  | { kind: "parking"; lang: Locale; path: string; floor: -1 | -2 };
// Pages are parsed once and only read by route builders; no consumer mutates them.
export function getPages(): ContentPage[] {
  return pages;
}
export function getContentRoutes(): PageRoute[] {
  return locales.flatMap((lang) => [
    ...pages.map((page) => ({
      kind: "content" as const,
      lang,
      path: localizedPath(page.path, lang),
      page,
    })),
    ...([-1, -2] as const).map((floor) => ({
      kind: "parking" as const,
      lang,
      path: localizedPath(`/parking/floor${floor}`, lang),
      floor,
    })),
  ]);
}
export function pageText(lang: Locale, key: string): string {
  return key === "site.delivery"
    ? t(lang, key, { delivery: deliveryText(lang) })
    : t(lang, key);
}
export function pageJsonLd(
  id: string,
  lang: Locale,
): Record<string, unknown>[] {
  const address = {
    "@type": "PostalAddress",
    streetAddress: t(lang, "footer.address"),
    addressLocality: lang === "ru" ? "Москва" : "Moscow",
    addressCountry: "RU",
  };
  const contact = {
    "@type": "ContactPoint",
    contactType: "sales",
    telephone: siteData.contacts.phone,
    email: siteData.contacts.email,
    availableLanguage: ["ru", "en"],
  };
  if (id === "home")
    return [
      {
        "@type": "RealEstateAgent",
        "@id": "https://chalet40.moscow/#agent",
        name: "Пятницкая 40 Chalet",
        url: "https://chalet40.moscow",
        address,
        telephone: siteData.contacts.phone,
        email: siteData.contacts.email,
        contactPoint: contact,
      },
      { "@type": "Place", name: "Пятницкая 40 Chalet", address },
    ];
  if (id === "contact")
    return [
      {
        "@type": "ContactPage",
        name: t(lang, "page.contact.title"),
        url: "https://chalet40.moscow" + localizedPath("/contact", lang),
        mainEntity: contact,
      },
    ];
  if (id === "privacy")
    return [
      {
        "@type": "WebPage",
        name: t(lang, "privacy.heading"),
        url: "https://chalet40.moscow" + localizedPath("/privacy", lang),
        inLanguage: lang,
      },
    ];
  if (id === "map")
    return [{ "@type": "Place", name: "Пятницкая 40 Chalet", address }];
  if (!warnedJsonLdIds.has(id)) {
    warnedJsonLdIds.add(id);
    console.warn(`pageJsonLd: no JSON-LD defined for page id "${id}"`);
  }
  return [];
}
