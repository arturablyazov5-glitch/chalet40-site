import { lotText, priceText, lotPath, type Lot } from "./lots";
import { t, number, localizedPath, type Locale } from "../i18n";
export function lotSeo(lot: Lot, lang: Locale) {
  const { name, description } = lotText(lot, lang);
  const params = {
    name,
    description,
    area: number(lang, lot.area),
    price: priceText(lot, lang),
  };
  return {
    title: t(lang, "seo.lot", params),
    description: t(lang, "seo.lotDescription", params),
  };
}
export function lotJsonLd(
  lot: Lot,
  lang: Locale,
  origin = "https://chalet40.moscow",
) {
  const { name, description } = lotText(lot, lang);
  return {
    "@type": "RealEstateListing",
    name,
    description,
    url: new URL(localizedPath(lotPath(lot), lang), origin).href,
    inLanguage: lang,
    about: {
      "@type": "Place",
      name,
      floorSize: {
        "@type": "QuantitativeValue",
        value: lot.area,
        unitCode: "MTK",
      },
      address: {
        "@type": "PostalAddress",
        streetAddress: "40 Pyatnitskaya Street",
        addressLocality: "Moscow",
        addressCountry: "RU",
      },
    },
    // Lots without a price (on request / reserved) get no Offer: schema.org
    // availability would be misleading without an actual price.
    ...(lot.totalPrice
      ? {
          offers: {
            "@type": "Offer",
            price: lot.totalPrice,
            priceCurrency: "RUB",
            ...(lot.status !== "onrequest"
              ? {
                  availability: `https://schema.org/${lot.status === "sold" ? "SoldOut" : lot.status === "reserved" ? "OutOfStock" : "InStock"}`,
                }
              : {}),
            url: new URL(localizedPath(lotPath(lot), lang), origin).href,
          },
        }
      : {}),
  };
}
