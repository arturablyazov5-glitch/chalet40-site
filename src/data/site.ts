import shared from "./shared.json";
import messageSpec from "./consult-message.json";
export const siteOrigin = messageSpec.origin;
import { t, type Locale } from "../i18n";
/** Confirmed by the client: use this single completion date everywhere. */
export const delivery = { quarter: 3, year: 2028 } as const;
export const siteData = shared;
export function deliveryText(lang: Locale): string {
  return t(lang, "site.deliveryValue", {
    quarter: delivery.quarter,
    year: delivery.year,
  });
}
