import HomeLanding from "../components/HomeLanding.astro";
import AboutPage from "../components/AboutPage.astro";
import OfficeLanding from "../components/OfficeLanding.astro";
import ParkingLanding from "../components/ParkingLanding.astro";
import PrivacyPolicy from "../components/PrivacyPolicy.astro";
import MapPage from "../components/MapPage.astro";
import ContactPage from "../components/ContactPage.astro";
const contentViews = {home: HomeLanding, about: AboutPage, office: OfficeLanding,
  parking: ParkingLanding, privacy: PrivacyPolicy, map: MapPage, contact: ContactPage} as const;
export type ContentViewId = keyof typeof contentViews;
export function contentView(id: string) {
  if (!Object.hasOwn(contentViews, id)) throw new Error(`Unknown content page: ${id}`);
  return contentViews[id as ContentViewId];
}
