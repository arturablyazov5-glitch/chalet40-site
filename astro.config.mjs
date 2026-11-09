import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readSiteEnvironment } from "./server/environment.mjs";
import { devConsultIntegration } from "./server/consult-dev.mjs";
import { deploymentOutput } from "./server/build-output.mjs";
const env = await readSiteEnvironment(new URL("./", import.meta.url));
// Sitemap hack: canonical EN home is "/en/" (trailingSlash: "ignore" leaves "/en"
// reachable), so rewrite the bare "/en" URL the sitemap integration emits.
const enHome = (url) =>
  url === "https://chalet40.moscow/en" ? "https://chalet40.moscow/en/" : url;
export default defineConfig({
  site: "https://chalet40.moscow",
  output: "static",
  trailingSlash: "ignore",
  integrations: [
    sitemap({
      filter: (page) => !/\/404\/?$/.test(page),
      serialize: (item) => ({
        ...item,
        url: enHome(item.url),
        ...(item.links
          ? {
              links: item.links.map((link) => ({
                ...link,
                url: enHome(link.url),
              })),
            }
          : {}),
      }),
      i18n: { defaultLocale: "ru", locales: { ru: "ru", en: "en" } },
    }),
    deploymentOutput(),
    devConsultIntegration(env),
  ],
  devToolbar: { enabled: false },
});
