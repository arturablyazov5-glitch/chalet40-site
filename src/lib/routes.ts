import {
  buildings,
  getLots,
  buildingPath,
  lotPath,
  type Lot,
  type Building,
} from "./lots";
import { locales, localizedPath, type Locale } from "../i18n";
export type SiteRoute = {
  lang: Locale;
  path: string;
  building: Building;
  lot?: Lot;
};
export function getRoutes(): SiteRoute[] {
  return locales.flatMap((lang) =>
    buildings.flatMap((building) => [
      { lang, path: localizedPath(buildingPath(building), lang), building },
      ...getLots(building).map((lot) => ({
        lang,
        path: localizedPath(lotPath(lot), lang),
        building,
        lot,
      })),
    ]),
  );
}
