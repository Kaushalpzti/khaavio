import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

import seoHandler from "../api/seo.js";
import sitemapHandler from "../api/sitemap.js";

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

function saveEnv(names) {
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  return () => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  };
}

test("SEO handler returns an actual HTTP 404 for unknown routes", async () => {
  const indexUrl = new URL("../dist/index.html", import.meta.url);
  const distUrl = new URL("../dist/", import.meta.url);
  const hadBuiltIndex = existsSync(indexUrl);
  if (!hadBuiltIndex) {
    mkdirSync(distUrl, { recursive: true });
    writeFileSync(
      indexUrl,
      '<!doctype html><html><head><title>Khaavio</title></head><body><div id="root"></div></body></html>',
    );
  }

  try {
    const res = mockResponse();
    await seoHandler(
      {
        method: "GET",
        url: "/api/seo?path=%2Fnot-a-real-page",
        headers: { host: "khaavio.in" },
      },
      res,
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.headers["x-robots-tag"], "noindex,follow");
    assert.match(res.body, /Page Not Found \| Khaavio/);
  } finally {
    if (!hadBuiltIndex) {
      rmSync(indexUrl, { force: true });
      try { rmSync(distUrl); } catch { /* Keep any pre-existing build folder. */ }
    }
  }
});

test("unpublished restaurant menu URLs return 404 only after a successful public lookup", async () => {
  const restoreEnv = saveEnv([
    "VITE_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  const indexUrl = new URL("../dist/index.html", import.meta.url);
  const distUrl = new URL("../dist/", import.meta.url);
  const hadBuiltIndex = existsSync(indexUrl);
  if (!hadBuiltIndex) {
    mkdirSync(distUrl, { recursive: true });
    writeFileSync(
      indexUrl,
      '<!doctype html><html><head><title>Khaavio</title></head><body><div id="root"></div></body></html>',
    );
  }

  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ restaurant: null }),
    });

    const missingRes = mockResponse();
    await seoHandler(
      {
        method: "GET",
        url: "/api/seo?path=%2Fmenu%2Fnot-published",
        headers: { host: "khaavio.in" },
      },
      missingRes,
    );
    assert.equal(missingRes.statusCode, 404);
    assert.equal(missingRes.headers["x-robots-tag"], "noindex,follow");

    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => null,
    });
    const unavailableRes = mockResponse();
    await seoHandler(
      {
        method: "GET",
        url: "/api/seo?path=%2Fmenu%2Ftemporarily-unavailable",
        headers: { host: "khaavio.in" },
      },
      unavailableRes,
    );
    assert.equal(unavailableRes.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    if (!hadBuiltIndex) {
      rmSync(indexUrl, { force: true });
      try { rmSync(distUrl); } catch { /* Keep any pre-existing build folder. */ }
    }
  }
});

test("dynamic sitemap contains public static pages and only validated published menu slugs", async () => {
  const restoreEnv = saveEnv([
    "VITE_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        String(url),
        "https://project.supabase.co/rest/v1/rpc/khaavio_public_sitemap_slugs",
      );
      assert.equal(options.method, "POST");
      assert.equal(options.body, "{}");
      return {
        ok: true,
        status: 200,
        json: async () => [
          { slug: "published-cafe" },
          { slug: "published-cafe" },
          { slug: "invalid/slug" },
          { slug: "another-restaurant" },
        ],
      };
    };

    const res = mockResponse();
    await sitemapHandler({ method: "GET" }, res);

    assert.equal(res.statusCode, 200);
    assert.ok(String(res.headers["content-type"]).includes("application/xml"));
    assert.equal(res.headers["x-sitemap-dynamic"], "enabled");
    assert.ok(res.body.includes("https://khaavio.in/contact"));
    assert.ok(res.body.includes("https://khaavio.in/privacy"));
    assert.ok(res.body.includes("https://khaavio.in/menu/published-cafe"));
    assert.ok(res.body.includes("https://khaavio.in/menu/another-restaurant"));
    assert.ok(!res.body.includes("invalid/slug"));
    assert.ok(!res.body.includes("/dashboard") && !res.body.includes("/login") && !res.body.includes("/book/"));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
