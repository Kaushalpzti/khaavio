import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const projectRoot = process.cwd();
const distIndexPath = resolve(projectRoot, "dist", "index.html");

const publicPages = [
  { path: "/", moduleId: "/src/pages/Home.jsx" },
  { path: "/about", moduleId: "/src/pages/About.jsx" },
  { path: "/contact", moduleId: "/src/pages/Contact.jsx" },
  { path: "/privacy", moduleId: "/src/pages/LegalPage.jsx", props: { type: "privacy" } },
  { path: "/terms", moduleId: "/src/pages/LegalPage.jsx", props: { type: "terms" } },
  { path: "/refund-policy", moduleId: "/src/pages/LegalPage.jsx", props: { type: "refund" } },
];

function countPrimaryHeadings(markup) {
  return (markup.match(/<h1(?:\s|>)/gi) || []).length;
}

async function prerenderPublicPages() {
  const vite = await createServer({
    configFile: resolve(projectRoot, "vite.config.js"),
    mode: "production",
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const snapshots = {};

    for (const page of publicPages) {
      const pageModule = await vite.ssrLoadModule(page.moduleId);
      if (typeof pageModule.default !== "function") {
        throw new Error("No default React component found for " + page.moduleId);
      }

      const tree = createElement(
        MemoryRouter,
        { initialEntries: [page.path] },
        createElement(pageModule.default, page.props || {}),
      );
      let markup = renderToString(tree);

      // The imported brand image is also available as a stable public asset.
      // Normalize Vite's dev SSR asset URL so prerendered HTML works in production.
      markup = markup.replace(/src="[^"]*icon\.png(?:\?[^"]*)?"/g, 'src="/icon.png"');

      const headingCount = countPrimaryHeadings(markup);
      if (headingCount !== 1) {
        throw new Error(page.path + " must render exactly one H1; found " + headingCount);
      }

      snapshots[page.path] = markup;
      console.log("Prerendered " + page.path + " (" + markup.length + " HTML characters)");
    }

    let html = await readFile(distIndexPath, "utf8");
    html = html.replace(
      /<script\b[^>]*\bid=["']khaavio-seo-prerender["'][^>]*>[\s\S]*?<\/script>/i,
      "",
    );

    const json = JSON.stringify(snapshots).replace(/</g, "\\u003c");
    const payload = '<script id="khaavio-seo-prerender" type="application/json">' + json + "</script>";
    if (!/<\/head>/i.test(html)) {
      throw new Error("Built index.html does not contain a closing </head> tag.");
    }
    html = html.replace(/<\/head>/i, payload + "\n</head>");
    await writeFile(distIndexPath, html, "utf8");
    console.log("Embedded " + Object.keys(snapshots).length + " public SEO snapshots into dist/index.html");
  } finally {
    await vite.close();
  }
}

prerenderPublicPages().catch((error) => {
  console.error("[Khaavio SEO prerender]", error);
  process.exitCode = 1;
});
