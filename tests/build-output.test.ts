import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { deploymentOutput } from "../server/build-output.mjs";

async function fixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), "build-output-test-"));
  // Astro copies public/api into dist before astro:build:done runs.
  await mkdir(join(dir, "api"));
  await writeFile(
    join(dir, "sitemap-index.xml"),
    `<?xml version="1.0"?><sitemapindex>` +
      `<sitemap><loc>https://chalet40.moscow/sitemap-0.xml</loc></sitemap>` +
      `<sitemap><loc>https://chalet40.moscow/sitemap-1.xml</loc></sitemap>` +
      `</sitemapindex>`,
  );
  const shard = (n: number, loc: string) =>
    writeFile(
      join(dir, `sitemap-${n}.xml`),
      `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
        `<url><loc>${loc}</loc></url>` +
        `</urlset>`,
    );
  await shard(0, "https://chalet40.moscow/");
  await shard(1, "https://chalet40.moscow/en/");
  await writeFile(
    join(dir, "index.html"),
    `<html><head></head><body>` +
      `<script>console.log("inline-one")</script>` +
      `<script src="/_astro/app.js"></script>` +
      `<script type="application/ld+json">{"@type":"WebPage"}</script>` +
      `</body></html>`,
  );
  await writeFile(join(dir, ".htaccess"), "# existing rules\n");
  return dir;
}

test("build-output merges sitemap shards into sitemap.xml", async () => {
  const dir = await fixtureDir();
  try {
    const hook = deploymentOutput().hooks["astro:build:done"] as any;
    await hook({ dir: pathToFileURL(dir + "/") });
    const sitemap = await readFile(join(dir, "sitemap.xml"), "utf8");
    assert.match(sitemap, /<sitemapindex|urlset/);
    assert.ok(sitemap.includes("<urlset"));
    assert.ok(sitemap.includes("https://chalet40.moscow/"));
    assert.ok(sitemap.includes("https://chalet40.moscow/en/"));
    assert.ok(!sitemap.includes("sitemapindex"));
    // The consult-message spec is copied next to the API payload.
    const spec = JSON.parse(await readFile(join(dir, "api/message-format.json"), "utf8"));
    assert.ok(spec.origin || spec.siteOrigin || Object.keys(spec).length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("build-output appends CSP Report-Only with exact inline-script hashes", async () => {
  const dir = await fixtureDir();
  try {
    const hook = deploymentOutput().hooks["astro:build:done"] as any;
    await hook({ dir: pathToFileURL(dir + "/") });
    const htaccess = await readFile(join(dir, ".htaccess"), "utf8");
    assert.ok(htaccess.includes("# existing rules"));
    const inline = "console.log(\"inline-one\")";
    const jsonLd = "{\"@type\":\"WebPage\"}";
    const hash = (s: string) =>
      `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
    const policy = htaccess.match(/Content-Security-Policy-Report-Only "([^"]+)"/)?.[1];
    assert.ok(policy, "CSP policy missing");
    assert.ok(policy.includes(hash(inline)));
    assert.ok(policy.includes(hash(jsonLd)));
    // External <script src> must not contribute a hash.
    assert.ok(!policy.includes("app.js"));
    assert.match(policy, /img-src 'self' data: https:\/\/trace-logos\.ru/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("build-output rejects unexpected sitemap shard names", async () => {
  const dir = await fixtureDir();
  try {
    await writeFile(
      join(dir, "sitemap-index.xml"),
      `<?xml version="1.0"?><sitemapindex>` +
        `<sitemap><loc>https://chalet40.moscow/evil.xml</loc></sitemap>` +
        `</sitemapindex>`,
    );
    const hook = deploymentOutput().hooks["astro:build:done"] as any;
    await assert.rejects(
      hook({ dir: pathToFileURL(dir + "/") }),
      /Unexpected sitemap shard/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
