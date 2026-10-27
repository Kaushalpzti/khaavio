import QRCode from "qrcode";
import { createPublicQrDestination } from "../src/lib/seoMetadata.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(req.url || "/", "https://khaavio.in");
  const type = requestUrl.searchParams.get("type") || "menu";
  const slug = requestUrl.searchParams.get("slug") || "";
  const tableToken = requestUrl.searchParams.get("table") || "";
  const destination = createPublicQrDestination(type, slug, tableToken);
  if (!destination) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("A valid public menu or booking slug is required.");
    return;
  }

  try {
    const png = await QRCode.toBuffer(destination, {
      type: "png",
      width: 1200,
      margin: 5,
      errorCorrectionLevel: "H",
      color: { dark: "#103c30", light: "#ffffff" },
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", String(png.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    if (req.method === "HEAD") res.end();
    else res.end(png);
  } catch (error) {
    console.error("Social QR image generation failed.", error?.message || error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Unable to generate the QR image.");
  }
}
