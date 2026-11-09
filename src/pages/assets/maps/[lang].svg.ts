import type { APIRoute } from "astro";
import { locationMap } from "../../../lib/location-map";
import type { Locale } from "../../../i18n";
export function getStaticPaths() {
  return ["ru", "en"].map((lang) => ({ params: { lang } }));
}
export const GET: APIRoute = ({ params }) =>
  new Response(locationMap(params.lang as Locale), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
