import { readFile, writeFile, readdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export function deploymentOutput() {
  return {
    name: "deployment-output",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        await copyFile(
          new URL("../src/data/consult-message.json", import.meta.url),
          new URL("api/message-format.json", dir),
        );
        // Expose a complete urlset at /sitemap.xml, preserving every shard and alternate from the integration.
        const index = await readFile(new URL("sitemap-index.xml", dir), "utf8");
        const chunks = [];
        let opening;
        for (const match of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const file = new URL(match[1]).pathname.split("/").at(-1);
          if (!/^sitemap-\d+\.xml$/.test(file))
            throw new Error("Unexpected sitemap shard");
          const xml = await readFile(new URL(file, dir), "utf8");
          opening ??= xml.match(/<urlset\b[^>]*>/)?.[0];
          chunks.push(
            xml
              .replace(/^.*?<urlset\b[^>]*>/s, "")
              .replace(/<\/urlset>\s*$/, ""),
          );
        }
        if (!opening) throw new Error("Missing sitemap entries");
        await writeFile(
          new URL("sitemap.xml", dir),
          '<?xml version="1.0" encoding="UTF-8"?>' +
            opening +
            chunks.join("") +
            "</urlset>",
        );
        // Hash exact final inline-script bytes, including data scripts, after Astro has finished rendering.
        const hashes = new Set();
        async function scan(folder) {
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            const file = new URL(
              entry.name + (entry.isDirectory() ? "/" : ""),
              folder,
            );
            if (entry.isDirectory()) await scan(file);
            else if (entry.name.endsWith(".html")) {
              const html = await readFile(file, "utf8");
              for (const match of html.matchAll(
                /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
              ))
                if (!/\bsrc\s*=/i.test(match[1]))
                  hashes.add(
                    `'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`,
                  );
            }
          }
        }
        await scan(dir);
        const policy = `default-src 'self'; script-src 'self' ${[...hashes].sort().join(" ")}; style-src 'self'; font-src 'self'; img-src 'self' data: https://trace-logos.ru; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'none'`;
        const htaccess = new URL(".htaccess", dir);
        await writeFile(
          htaccess,
          (await readFile(htaccess, "utf8")) +
            `\n# Generated from this build; validate Report-Only before enforcement.\n<IfModule mod_headers.c>\n Header always set Content-Security-Policy-Report-Only "${policy}"\n</IfModule>\n`,
        );
      },
    },
  };
}
