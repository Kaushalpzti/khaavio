import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Filter,
  Info,
  LoaderCircle,
  Printer,
  Plus,
  Pencil,
  Power,
  Trash2,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Table2,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { normalizeTableNumber } from "../lib/tableNumber";
import khaavioIcon from "../assets/icon.png";
import "./TableQRStudio.css";

const QR_OPTIONS = {
  width: 900,
  margin: 4,
  errorCorrectionLevel: "H",
  color: { dark: "#17120f", light: "#ffffff" },
};

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1620;
const A4_WIDTH = 1240;
const A4_HEIGHT = 1754;

const TEMPLATES = [
  {
    id: "signature",
    name: "Signature Green",
    caption: "Forest · Ivory · Champagne",
    colors: { background: "#f2f1e8", card: "#fffdf5", ink: "#183c31", muted: "#60766b", accent: "#c7a264", accentText: "#183c31", border: "#c8d3c5", soft: "#e4eadf", qr: "#ffffff" },
  },
  {
    id: "classic",
    name: "Classic Elegant",
    caption: "Ivory · Espresso · Gold",
    colors: {
      background: "#fbf1dd",
      card: "#fffaf1",
      ink: "#2e1b12",
      muted: "#725b49",
      accent: "#a86824",
      accentText: "#ffffff",
      border: "#dfc89c",
      soft: "#f2dfbd",
      qr: "#ffffff",
    },
  },
  {
    id: "dark",
    name: "Premium Dark",
    caption: "Espresso · Ivory · Gold",
    colors: {
      background: "#241813",
      card: "#302019",
      ink: "#fff8ea",
      muted: "#dbc8b4",
      accent: "#d7aa55",
      accentText: "#27180f",
      border: "#6d5039",
      soft: "#39271f",
      qr: "#ffffff",
    },
  },
  {
    id: "indian",
    name: "Modern Indian",
    caption: "Cream · Terracotta · Sage",
    colors: {
      background: "#fff3e6",
      card: "#fffbf4",
      ink: "#512a1c",
      muted: "#806656",
      accent: "#bd4825",
      accentText: "#ffffff",
      border: "#e9c7a6",
      soft: "#f8e2cb",
      qr: "#ffffff",
    },
  },
  {
    id: "minimal",
    name: "Minimal Premium",
    caption: "Soft White · Deep Green",
    colors: {
      background: "#f4f5ef",
      card: "#fffefa",
      ink: "#163c31",
      muted: "#5c746a",
      accent: "#17634c",
      accentText: "#ffffff",
      border: "#d3ded2",
      soft: "#e9f0e7",
      qr: "#ffffff",
    },
  },
];

const DEFAULT_SETTINGS = {
  template: "signature",
  showLogo: true,
  showName: true,
  showTagline: false,
  showCuisine: true,
  showTableNumber: true,
  showPoweredBy: true,
  ctaText: "SCAN TO ORDER",
  tableNumberFormat: "table-02",
};

function getErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function getPublicAppBase() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "https://khaavio.in";
}

function getPublicMenuUrl(restaurant, table) {
  if (
    !restaurant?.slug ||
    !table?.qr_token ||
    table.restaurant_id !== restaurant.id
  )
    return "";
  const base = getPublicAppBase();
  return `${base}/menu/${encodeURIComponent(restaurant.slug)}?table=${encodeURIComponent(table.qr_token)}`;
}

function getInitials(name) {
  const words = String(name || "Restaurant")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 1
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : String(words[0] || "R")
        .slice(0, 2)
        .toUpperCase();
}

function getTableNumberParts(value, format = "table-02") {
  const raw = normalizeTableNumber(value) || "?";
  const match = raw.match(/\d+/);
  if (!match) {
    return {
      label: format === "number" ? "" : "TABLE",
      value: raw.slice(0, 14),
      full: raw,
    };
  }

  const digits = match[0];
  const numeric = String(Number(digits));
  if (format === "number") {
    return { label: "", value: numeric, full: numeric };
  }
  if (format === "table-1") {
    return { label: "TABLE", value: numeric, full: `TABLE ${numeric}` };
  }

  const padded = digits.length >= 2 ? digits : digits.padStart(2, "0");
  return { label: "TABLE", value: padded, full: `TABLE ${padded}` };
}

function safeFilename(value) {
  return (
    String(value || "table")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "table"
  );
}

function roundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
  lineWidth = 1,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function wrapCanvasText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  const joinedCount = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (joinedCount < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function safeLoadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawLeaf(ctx, x, y, rotation, palette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = 0.58;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(i * 17, -i * 18, 13, 31, -0.55, 0, Math.PI * 2);
    ctx.fillStyle = palette.soft;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

async function drawBrandedCard(restaurant, table, settings, qrDataUrl) {
  const template =
    TEMPLATES.find((item) => item.id === settings.template) || TEMPLATES[0];
  const colors = template.colors;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("Your browser could not create the QR card canvas.");

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  roundedRect(
    ctx,
    32,
    32,
    CARD_WIDTH - 64,
    CARD_HEIGHT - 64,
    44,
    colors.background,
    colors.border,
    5,
  );
  roundedRect(
    ctx,
    55,
    55,
    CARD_WIDTH - 110,
    CARD_HEIGHT - 110,
    34,
    null,
    colors.border,
    2,
  );

  if (settings.template === "signature") {
    // Keep the dark masthead clear of the scan prompt below it.
    roundedRect(ctx, 58, 58, CARD_WIDTH - 116, 390, 38, "#173e32", null);
  } else if (settings.template === "indian") {
    drawLeaf(ctx, 105, 108, 0.15, colors);
    drawLeaf(ctx, CARD_WIDTH - 110, 110, Math.PI - 0.15, colors);
    drawLeaf(ctx, 102, CARD_HEIGHT - 120, -0.35, colors);
    drawLeaf(ctx, CARD_WIDTH - 110, CARD_HEIGHT - 120, Math.PI + 0.35, colors);
  } else if (settings.template === "classic") {
    ctx.fillStyle = colors.border;
    for (const [x, y] of [
      [100, 105],
      [980, 105],
      [100, 1510],
      [980, 1510],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (settings.template === "dark") {
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(185, 105);
    ctx.lineTo(360, 105);
    ctx.moveTo(720, 105);
    ctx.lineTo(895, 105);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const center = CARD_WIDTH / 2;
  const initials = getInitials(restaurant?.name);

  // A restrained editorial masthead makes the print card feel like a table tent.
  roundedRect(ctx, center - 76, 76, 152, 7, 4, colors.accent, null);
  const signatureTemplate = settings.template === "signature";
  ctx.strokeStyle = signatureTemplate
    ? "rgba(230, 207, 158, 0.68)"
    : colors.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(170, 108);
  ctx.lineTo(350, 108);
  ctx.moveTo(730, 108);
  ctx.lineTo(910, 108);
  ctx.stroke();
  ctx.fillStyle = signatureTemplate ? "#e6cf9e" : colors.muted;
  ctx.font = "700 18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("YOUR TABLE  ·  YOUR MENU", center, 108);
  ctx.textBaseline = "alphabetic";

  let headerBottom = 178;
  if (settings.showLogo) {
    const logo = await safeLoadImage(restaurant?.logo_url || "");
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, 188, 65, 0, Math.PI * 2);
    ctx.fillStyle = colors.card;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors.accent;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, 188, 57, 0, Math.PI * 2);
    ctx.clip();
    if (logo) {
      const side = Math.min(logo.width, logo.height);
      const sx = (logo.width - side) / 2;
      const sy = (logo.height - side) / 2;
      ctx.drawImage(logo, sx, sy, side, side, center - 53, 135, 106, 106);
    } else {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(center - 60, 128, 120, 120);
      ctx.fillStyle = colors.accentText;
      ctx.font = "700 44px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials, center, 188);
    }
    ctx.restore();
    headerBottom = 260;
  }

  if (settings.showName) {
    ctx.fillStyle = settings.template === "signature" ? "#fffdf5" : colors.ink;
    ctx.font = "600 54px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const lines = wrapCanvasText(ctx, restaurant?.name || "Restaurant", 870, 2);
    let y = headerBottom + 44;
    for (const line of lines) {
      ctx.fillText(line, center, y);
      y += 58;
    }
    headerBottom = y - 25;
  }

  if (settings.showCuisine && restaurant?.restaurant_type) {
    ctx.fillStyle = settings.template === "signature" ? "#e3d5b4" : colors.muted;
    ctx.font = "500 24px Arial, sans-serif";
    const cuisine = String(restaurant.restaurant_type).replace(/_/g, " ");
    const lines = wrapCanvasText(ctx, cuisine, 880, 1);
    ctx.textAlign = "center";
    const y = headerBottom + 19;
    ctx.fillText(lines[0] || cuisine, center, y);
    headerBottom = y + 17;
  }

  if (settings.showTagline && restaurant?.description) {
    ctx.fillStyle = settings.template === "signature" ? "#e3d5b4" : colors.muted;
    ctx.font = "400 20px Arial, sans-serif";
    ctx.textAlign = "center";
    const lines = wrapCanvasText(ctx, restaurant.description, 820, 1);
    const y = headerBottom + 19;
    ctx.fillText(lines[0] || "", center, y);
    headerBottom = y + 14;
  }

  const scanLabelY = Math.max(
    settings.template === "signature" ? 525 : 420,
    headerBottom + 20,
  );
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(205, scanLabelY);
  ctx.lineTo(350, scanLabelY);
  ctx.moveTo(730, scanLabelY);
  ctx.lineTo(875, scanLabelY);
  ctx.stroke();
  ctx.fillStyle = colors.accent;
  ctx.font = "800 23px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SCAN TO EXPLORE", center, scanLabelY);
  ctx.fillStyle = colors.muted;
  ctx.font = "400 17px Arial, sans-serif";
  ctx.fillText("Point your camera here", center, scanLabelY + 22);

  const qrFrameY = scanLabelY + 40;
  const qrSize = Math.max(430, Math.min(610, 1118 - qrFrameY - 72));
  const qrFrameSize = qrSize + 72;
  const qrFrameX = center - qrFrameSize / 2;
  roundedRect(ctx, qrFrameX, qrFrameY, qrFrameSize, qrFrameSize, 36, colors.qr, colors.border, 4);
  roundedRect(ctx, qrFrameX + 14, qrFrameY + 14, qrFrameSize - 28, qrFrameSize - 28, 27, null, colors.border, 1.5);

  const qrImage = await safeLoadImage(qrDataUrl);
  if (!qrImage)
    throw new Error("The QR code could not be loaded for export. Please retry.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImage, center - qrSize / 2, qrFrameY + 30, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = colors.muted;
  ctx.font = "700 14px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("MENU  ·  SPECIALS  ·  ORDER", center, qrFrameY + qrFrameSize - 20);

  roundedRect(ctx, 180, 1156, 720, 78, 26, colors.accent, null);
  ctx.fillStyle = colors.accentText;
  ctx.font = "800 30px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cta =
    String(settings.ctaText || "SCAN TO ORDER")
      .trim()
      .slice(0, 35) || "SCAN TO ORDER";
  ctx.fillText(cta.toLocaleUpperCase(), center, 1195);

  ctx.fillStyle = colors.muted;
  ctx.font = "600 20px Arial, sans-serif";
  ctx.fillText("VIEW MENU  ·  PLACE ORDER", center, 1260);

  if (settings.showTableNumber) {
    roundedRect(ctx, center - 180, 1286, 360, 172, 28, colors.card, colors.border, 2);
    const tableParts = getTableNumberParts(
      table?.table_number,
      settings.tableNumberFormat,
    );
    if (tableParts.label) {
      ctx.fillStyle = colors.muted;
      ctx.font = "800 20px Arial, sans-serif";
      ctx.fillText(tableParts.label, center, 1335);
    }
    ctx.fillStyle = colors.ink;
    ctx.font = "700 88px Georgia, 'Times New Roman', serif";
    ctx.fillText(tableParts.value, center, 1425);
  }

  if (settings.showPoweredBy) {
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(335, 1485);
    ctx.lineTo(745, 1485);
    ctx.stroke();
    const brandImage = await safeLoadImage(khaavioIcon);
    if (brandImage) {
      ctx.drawImage(brandImage, center - 110, 1500, 48, 48);
      ctx.textAlign = "left";
      ctx.fillStyle = colors.ink;
      ctx.font = "700 30px Arial, sans-serif";
      ctx.fillText("Powered by Khaavio", center - 50, 1533);
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = colors.muted;
      ctx.font = "700 25px Arial, sans-serif";
      ctx.fillText("Powered by Khaavio", center, 1533);
    }
  }

  return canvas;
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The browser could not export this file.")),
      type,
      quality,
    );
  });
}

async function canvasToJpegBytes(canvas, quality = 0.94) {
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return new Uint8Array(await blob.arrayBuffer());
}

function ascii(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function makePdfFromJpegPages(pages) {
  if (!pages.length)
    throw new Error("Select at least one table to create a PDF.");
  const objectBodies = [];
  const pageObjectIds = pages.map((_, index) => 3 + index * 3);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  objectBodies.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  objectBodies.push(
    ascii(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`),
  );

  pages.forEach((page, index) => {
    const pageObjectId = 3 + index * 3;
    const imageObjectId = pageObjectId + 1;
    const contentObjectId = pageObjectId + 2;
    const pageWidth = page.pageWidth || 595.28;
    const pageHeight = page.pageHeight || 841.89;
    const contents = ascii(
      `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`,
    );

    objectBodies.push(
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
          `/Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> ` +
          `/Contents ${contentObjectId} 0 R >>`,
      ),
    );
    objectBodies.push(
      concatBytes([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`,
        ),
        page.jpegBytes,
        ascii("\nendstream"),
      ]),
    );
    objectBodies.push(
      concatBytes([
        ascii(`<< /Length ${contents.length} >>\nstream\n`),
        contents,
        ascii("\nendstream"),
      ]),
    );
  });

  const header = ascii("%PDF-1.4\n%Khaavio QR Studio\n");
  const fullObjects = objectBodies.map((body, index) =>
    concatBytes([ascii(`${index + 1} 0 obj\n`), body, ascii("\nendobj\n")]),
  );
  const offsets = [];
  let byteOffset = header.length;
  for (const object of fullObjects) {
    offsets.push(byteOffset);
    byteOffset += object.length;
  }

  const xrefOffset = byteOffset;
  const xrefLines = ["0000000000 65535 f "];
  for (const offset of offsets)
    xrefLines.push(`${String(offset).padStart(10, "0")} 00000 n `);
  const xref = ascii(
    `xref\n0 ${fullObjects.length + 1}\n${xrefLines.join("\n")}\n` +
      `trailer\n<< /Size ${fullObjects.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`,
  );
  return concatBytes([header, ...fullObjects, xref]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function createA4PageForCard(cardCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = A4_WIDTH;
  canvas.height = A4_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create an A4 export page.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  const width = 1040;
  const height = 1560;
  ctx.drawImage(
    cardCanvas,
    (A4_WIDTH - width) / 2,
    (A4_HEIGHT - height) / 2,
    width,
    height,
  );
  return canvas;
}

async function createBulkA4Pages(tables, restaurant, settings, onProgress) {
  const pages = [];
  const perPage = 9;
  const cardWidth = 340;
  const cardHeight = 510;
  const horizontalGap = 40;
  const verticalGap = 25;
  const startX = (A4_WIDTH - (cardWidth * 3 + horizontalGap * 2)) / 2;
  const startY = (A4_HEIGHT - (cardHeight * 3 + verticalGap * 2)) / 2;

  for (let offset = 0; offset < tables.length; offset += perPage) {
    const canvas = document.createElement("canvas");
    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create an A4 export page.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    const pageTables = tables.slice(offset, offset + perPage);
    for (let index = 0; index < pageTables.length; index += 1) {
      const table = pageTables[index];
      const qrDataUrl = await QRCode.toDataURL(
        getPublicMenuUrl(restaurant, table),
        QR_OPTIONS,
      );
      const cardCanvas = await drawBrandedCard(
        restaurant,
        table,
        settings,
        qrDataUrl,
      );
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = startX + column * (cardWidth + horizontalGap);
      const y = startY + row * (cardHeight + verticalGap);
      ctx.drawImage(cardCanvas, x, y, cardWidth, cardHeight);
      onProgress?.(Math.min(offset + index + 1, tables.length), tables.length);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    pages.push({
      jpegBytes: await canvasToJpegBytes(canvas, 0.92),
      width: A4_WIDTH,
      height: A4_HEIGHT,
      pageWidth: 595.28,
      pageHeight: 841.89,
    });
  }
  return pages;
}

function SettingToggle({ label, checked, onChange, description }) {
  return (
    <label className="tqr-toggle-row">
      <span className="tqr-toggle-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="tqr-switch" aria-hidden="true" />
    </label>
  );
}

function QRCardPreview({ restaurant, table, posterDataUrl, loading }) {
  if (loading || !posterDataUrl) {
    return (
      <div className="tqr-card-preview-state" role="status" aria-live="polite">
        {loading ? <LoaderCircle className="tqr-spinner" size={24} /> : <QrCode size={32} />}
        <span>{loading ? "Rendering the exact export preview…" : "Preview will appear when the QR is ready."}</span>
      </div>
    );
  }

  return (
    <img
      className="tqr-card-preview-image"
      src={posterDataUrl}
      alt={`Branded table QR poster for ${restaurant?.name || "restaurant"}, ${table?.table_number || "selected table"}`}
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
    />
  );
}

export default function TableQRStudio() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [tables, setTables] = useState([]);
  const [activeTableId, setActiveTableId] = useState("");
  const [selectedTableIds, setSelectedTableIds] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [previewCardDataUrl, setPreviewCardDataUrl] = useState("");
  const [previewCardLoading, setPreviewCardLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [actionBusy, setActionBusy] = useState("");
  const [bulkProgress, setBulkProgress] = useState(null);
  const [showLargePreview, setShowLargePreview] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("4");
  const [editingTable, setEditingTable] = useState(null);
  const [editTableNumber, setEditTableNumber] = useState("");
  const [editTableCapacity, setEditTableCapacity] = useState("4");
  const [updatingTable, setUpdatingTable] = useState(false);

  const restaurant = useMemo(
    () => restaurants.find((item) => item.id === restaurantId) || null,
    [restaurants, restaurantId],
  );
  const activeTable = useMemo(
    () => tables.find((table) => table.id === activeTableId) || null,
    [tables, activeTableId],
  );
  const qrTargetUrl = useMemo(
    () => getPublicMenuUrl(restaurant, activeTable),
    [restaurant, activeTable],
  );

  const tableStats = useMemo(() => {
    const active = tables.filter((table) => table.is_active === true).length;
    const inactive = tables.length - active;
    const qrReady = tables.filter(
      (table) =>
        restaurant?.is_published === true &&
        table.is_active === true &&
        Boolean(table.qr_token),
    ).length;
    return {
      total: tables.length,
      active,
      inactive,
      qrReady,
      pending: tables.length - qrReady,
    };
  }, [tables, restaurant]);

  const canExport = useCallback(
    (table) =>
      Boolean(
        restaurant?.is_published &&
        table?.restaurant_id === restaurant.id &&
        table?.is_active === true &&
        table?.qr_token,
      ),
    [restaurant],
  );

  const filteredTables = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tables.filter((table) => {
      const matchSearch =
        !query ||
        String(table.table_number || "")
          .toLowerCase()
          .includes(query);
      const matchStatus =
        tableFilter === "all" ||
        (tableFilter === "active" && table.is_active === true) ||
        (tableFilter === "inactive" && table.is_active !== true) ||
        (tableFilter === "needs-qr" &&
          (!table.qr_token || restaurant?.is_published !== true));
      return matchSearch && matchStatus;
    });
  }, [tables, search, tableFilter, restaurant]);

  const selectedTables = useMemo(
    () =>
      tables.filter(
        (table) => selectedTableIds.has(table.id) && canExport(table),
      ),
    [tables, selectedTableIds, canExport],
  );

  useEffect(() => {
    let active = true;

    async function loadRestaurants() {
      setLoading(true);
      setLoadError("");
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data, error } = await supabase
          .from("restaurants")
          .select(
            "id, name, slug, restaurant_type, logo_url, description, is_published, created_at",
          )
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (!active) return;

        const ownedRestaurants = data || [];
        setRestaurants(ownedRestaurants);
        setRestaurantId((current) =>
          ownedRestaurants.some((item) => item.id === current)
            ? current
            : ownedRestaurants[0]?.id || "",
        );
      } catch (error) {
        if (active)
          setLoadError(
            getErrorMessage(error, "Unable to load your restaurant workspace."),
          );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRestaurants();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!restaurantId) {
      setTables([]);
      setActiveTableId("");
      setSelectedTableIds(new Set());
      return undefined;
    }

    let active = true;
    setTables([]);
    setActiveTableId("");
    setSelectedTableIds(new Set());
    setQrDataUrl("");
    async function loadTables() {
      setTablesLoading(true);
      setLoadError("");
      try {
        const allRows = [];
        const pageSize = 500;
        let offset = 0;
        while (true) {
          const { data, error } = await supabase
            .from("restaurant_tables")
            .select(
              "id, restaurant_id, table_number, capacity, is_active, qr_token",
            )
            .eq("restaurant_id", restaurantId)
            .order("table_number", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          const page = data || [];
          allRows.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        if (!active) return;
        setTables(allRows);
        setActiveTableId((current) =>
          allRows.some((table) => table.id === current)
            ? current
            : (
                allRows.find((table) => table.is_active && table.qr_token) ||
                allRows[0]
              )?.id || "",
        );
        setSelectedTableIds(
          (current) =>
            new Set(
              [...current].filter((id) =>
                allRows.some((table) => table.id === id),
              ),
            ),
        );
      } catch (error) {
        if (active) {
          setTables([]);
          setLoadError(
            getErrorMessage(error, "Unable to load this restaurant's tables."),
          );
        }
      } finally {
        if (active) setTablesLoading(false);
      }
    }

    loadTables();
    return () => {
      active = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    let active = true;
    if (!qrTargetUrl) {
      setQrDataUrl("");
      setQrLoading(false);
      return undefined;
    }

    setQrLoading(true);
    QRCode.toDataURL(qrTargetUrl, QR_OPTIONS)
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        if (active) {
          setQrDataUrl("");
          setNotice({
            type: "error",
            text: getErrorMessage(error, "Could not generate the QR preview."),
          });
        }
      })
      .finally(() => {
        if (active) setQrLoading(false);
      });

    return () => {
      active = false;
    };
  }, [qrTargetUrl]);

  useEffect(() => {
    setLogoFailed(false);
  }, [restaurant?.id, restaurant?.logo_url]);

  useEffect(() => {
    let active = true;

    if (!restaurant || !activeTable || !qrDataUrl) {
      setPreviewCardDataUrl("");
      setPreviewCardLoading(false);
      return undefined;
    }

    setPreviewCardLoading(true);
    drawBrandedCard(restaurant, activeTable, settings, qrDataUrl)
      .then((canvas) => {
        if (active) setPreviewCardDataUrl(canvas.toDataURL("image/png"));
      })
      .catch((error) => {
        if (!active) return;
        setPreviewCardDataUrl("");
        setNotice({
          type: "error",
          text: getErrorMessage(error, "Could not render the table QR preview."),
        });
      })
      .finally(() => {
        if (active) setPreviewCardLoading(false);
      });

    return () => {
      active = false;
    };
  }, [restaurant, activeTable, settings, qrDataUrl]);

  async function handleCreateTable(event) {
    event.preventDefault();
    if (!restaurant || creatingTable) return;

    const tableNumber = normalizeTableNumber(newTableNumber);
    const capacity = Number(newTableCapacity);

    if (!tableNumber) {
      setNotice({
        type: "error",
        text: "Enter a table name or number, for example Table 1.",
      });
      return;
    }
    if (tableNumber.length > 80) {
      setNotice({
        type: "error",
        text: "Table name must be 80 characters or fewer.",
      });
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      setNotice({
        type: "error",
        text: "Seating capacity must be a whole number from 1 to 50.",
      });
      return;
    }
    if (
      tables.some(
        (table) =>
          normalizeTableNumber(table.table_number).toLowerCase() === tableNumber.toLowerCase(),
      )
    ) {
      setNotice({
        type: "error",
        text: `A table named “${tableNumber}” already exists. Choose a unique name.`,
      });
      return;
    }

    const qrToken = globalThis.crypto?.randomUUID?.();
    if (!qrToken) {
      setNotice({
        type: "error",
        text: "This browser cannot create a secure QR token. Please use an up-to-date browser and try again.",
      });
      return;
    }

    setCreatingTable(true);
    setNotice(null);
    setLoadError("");
    try {
      const { data: createdTable, error: createError } = await supabase
        .from("restaurant_tables")
        .insert({
          restaurant_id: restaurant.id,
          table_number: tableNumber,
          capacity,
          is_active: true,
          qr_token: qrToken,
        })
        .select(
          "id, restaurant_id, table_number, capacity, is_active, qr_token",
        )
        .single();

      if (createError) throw createError;
      if (!createdTable?.id || !createdTable?.qr_token) {
        throw new Error(
          "The table was not returned with a saved QR token. Refresh the table list before retrying.",
        );
      }

      setTables((current) =>
        [...current, createdTable].sort((a, b) =>
          String(a.table_number || "").localeCompare(
            String(b.table_number || ""),
            undefined,
            { numeric: true, sensitivity: "base" },
          ),
        ),
      );
      setActiveTableId(createdTable.id);
      setSearch("");
      setTableFilter("all");
      setNewTableNumber("");
      setNewTableCapacity("4");
      setShowCreateTable(false);
      setNotice({
        type: "success",
        text: `Table ${normalizeTableNumber(createdTable.table_number)} created with its own QR token. ${restaurant.is_published ? "You can preview and export its QR card." : "Publish the restaurant before exporting a working public QR card."}`,
      });
    } catch (error) {
      const message = getErrorMessage(error, "Could not create this table.");
      setNotice({
        type: "error",
        text: /duplicate key|unique constraint/i.test(message)
          ? `A table named “${tableNumber}” already exists. Choose a unique name.`
          : message,
      });
    } finally {
      setCreatingTable(false);
    }
  }

  function beginEditTable(table) {
    setEditingTable(table);
    setEditTableNumber(String(table.table_number ?? ""));
    setEditTableCapacity(String(table.capacity ?? 4));
    setNotice(null);
  }

  async function handleUpdateTable(event) {
    event.preventDefault();
    if (!restaurant || !editingTable || updatingTable) return;

    const tableNumber = normalizeTableNumber(editTableNumber);
    const capacity = Number(editTableCapacity);

    if (!tableNumber) {
      setNotice({ type: "error", text: "Enter a table name or number." });
      return;
    }
    if (tableNumber.length > 80) {
      setNotice({ type: "error", text: "Table name must be 80 characters or fewer." });
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      setNotice({ type: "error", text: "Seating capacity must be a whole number from 1 to 50." });
      return;
    }
    if (tables.some((table) =>
      table.id !== editingTable.id &&
      normalizeTableNumber(table.table_number).toLowerCase() === tableNumber.toLowerCase()
    )) {
      setNotice({ type: "error", text: `A table named “${tableNumber}” already exists. Choose a unique name.` });
      return;
    }

    setUpdatingTable(true);
    setActionBusy(`update:${editingTable.id}`);
    setNotice(null);
    try {
      // Deliberately update only the display name and capacity. The existing
      // QR token remains unchanged, so already-printed QR codes keep working.
      const { data: updatedTable, error } = await supabase
        .from("restaurant_tables")
        .update({ table_number: tableNumber, capacity })
        .eq("id", editingTable.id)
        .eq("restaurant_id", restaurant.id)
        .select("id, restaurant_id, table_number, capacity, is_active, qr_token")
        .single();

      if (error) throw error;
      if (!updatedTable?.id) throw new Error("The table update could not be confirmed. Refresh and try again.");

      setTables((current) => current
        .map((table) => table.id === updatedTable.id ? updatedTable : table)
        .sort((a, b) => String(a.table_number || "").localeCompare(
          String(b.table_number || ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        )));
      setEditingTable(null);
      setNotice({ type: "success", text: `Table ${normalizeTableNumber(updatedTable.table_number)} updated. Its existing QR link is unchanged.` });
    } catch (error) {
      const message = getErrorMessage(error, "Could not update this table.");
      setNotice({
        type: "error",
        text: /duplicate key|unique constraint/i.test(message)
          ? `A table named “${tableNumber}” already exists. Choose a unique name.`
          : message,
      });
    } finally {
      setUpdatingTable(false);
      setActionBusy("");
    }
  }

  async function handleToggleTableActive(table) {
    if (!restaurant || !table?.id || actionBusy) return;
    const nextActive = table.is_active !== true;

    setActionBusy(`active:${table.id}`);
    setNotice(null);
    try {
      const { data: updatedTable, error } = await supabase
        .from("restaurant_tables")
        .update({ is_active: nextActive })
        .eq("id", table.id)
        .eq("restaurant_id", restaurant.id)
        .select("id, restaurant_id, table_number, capacity, is_active, qr_token")
        .single();

      if (error) throw error;
      if (!updatedTable?.id) throw new Error("The table status update could not be confirmed.");

      setTables((current) => current.map((row) => row.id === updatedTable.id ? updatedTable : row));
      setNotice({
        type: "success",
        text: nextActive
          ? `Table ${normalizeTableNumber(table.table_number)} is active again. Its saved QR token has been kept.`
          : `Table ${normalizeTableNumber(table.table_number)} is inactive. Existing order and billing history is preserved.`,
      });
    } catch (error) {
      setNotice({ type: "error", text: getErrorMessage(error, "Could not update this table's status.") });
    } finally {
      setActionBusy("");
    }
  }

  async function handleDeleteTable(table) {
    if (!restaurant || !table?.id || actionBusy) return;
    const confirmed = window.confirm(
      `Permanently delete Table ${normalizeTableNumber(table.table_number)}? This is only allowed when the table has no order or billing history. If it has history, you can deactivate it instead.`,
    );
    if (!confirmed) return;

    setActionBusy(`delete:${table.id}`);
    setNotice(null);
    try {
      // Keep financial history intact: only physically delete an unused table.
      const [ordersResult, sessionsResult, invoicesResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant.id)
          .eq("table_id", table.id),
        supabase
          .from("table_sessions")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant.id)
          .eq("table_id", table.id),
        supabase
          .from("table_session_invoices")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant.id)
          .eq("table_id", table.id),
      ]);

      const queryError = [ordersResult, sessionsResult, invoicesResult].find((result) => result.error)?.error;
      if (queryError) throw queryError;

      const hasHistory = [ordersResult.count, sessionsResult.count, invoicesResult.count]
        .some((count) => Number(count || 0) > 0);
      if (hasHistory) {
        setNotice({
          type: "error",
          text: `Table ${normalizeTableNumber(table.table_number)} has order or billing history, so it cannot be permanently deleted. Deactivate it instead to keep old orders and invoices intact.`,
        });
        return;
      }

      const { data: deletedRows, error } = await supabase
        .from("restaurant_tables")
        .delete()
        .eq("id", table.id)
        .eq("restaurant_id", restaurant.id)
        .select("id");
      if (error) throw error;
      if (!deletedRows?.some((row) => row.id === table.id)) {
        throw new Error("The table was not deleted. Refresh the list and check your permissions.");
      }

      const remainingTables = tables.filter((row) => row.id !== table.id);
      setTables(remainingTables);
      setSelectedTableIds((current) => {
        const next = new Set(current);
        next.delete(table.id);
        return next;
      });
      if (activeTableId === table.id) {
        setActiveTableId((remainingTables.find((row) => canExport(row)) || remainingTables[0])?.id || "");
      }
      setNotice({ type: "success", text: `Table ${normalizeTableNumber(table.table_number)} deleted.` });
    } catch (error) {
      const message = getErrorMessage(error, "Could not delete this table.");
      setNotice({
        type: "error",
        text: /foreign key|constraint|referenced/i.test(message)
          ? `Table ${normalizeTableNumber(table.table_number)} is linked to existing records and cannot be deleted safely. Deactivate it instead to preserve history.`
          : message,
      });
    } finally {
      setActionBusy("");
    }
  }

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleTableSelection(table) {
    if (!canExport(table)) {
      setNotice({
        type: "error",
        text: !restaurant?.is_published
          ? "Publish your restaurant before exporting working table QR cards."
          : table.is_active !== true
            ? "Inactive tables cannot receive new table orders. Activate the table first."
            : "This table has no saved QR token. Review the table setup before exporting.",
      });
      return;
    }
    setSelectedTableIds((current) => {
      const next = new Set(current);
      if (next.has(table.id)) next.delete(table.id);
      else next.add(table.id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const availableIds = filteredTables
      .filter(canExport)
      .map((table) => table.id);
    const allSelected =
      availableIds.length > 0 &&
      availableIds.every((id) => selectedTableIds.has(id));
    setSelectedTableIds((current) => {
      const next = new Set(current);
      if (allSelected) availableIds.forEach((id) => next.delete(id));
      else availableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function getCardCanvas(table) {
    if (!restaurant)
      throw new Error("Choose a restaurant before exporting QR cards.");
    if (!canExport(table)) {
      throw new Error(
        !restaurant.is_published
          ? "Publish your restaurant before exporting working table QR cards."
          : table?.is_active !== true
            ? "This table is inactive. Activate it before exporting its QR card."
            : "This table has no saved QR token. Review the table setup before exporting.",
      );
    }
    const destination = getPublicMenuUrl(restaurant, table);
    if (!destination)
      throw new Error("A valid public menu destination could not be created.");
    const qr = await QRCode.toDataURL(destination, QR_OPTIONS);
    return drawBrandedCard(restaurant, table, settings, qr);
  }

  async function handleDownloadPng(table) {
    setActionBusy(`png:${table.id}`);
    setNotice(null);
    try {
      const canvas = await getCardCanvas(table);
      const blob = await canvasToBlob(canvas, "image/png");
      downloadBlob(
        blob,
        `khaavio-table-${safeFilename(table.table_number)}.png`,
      );
      setNotice({
        type: "success",
        text: `PNG QR card for Table ${normalizeTableNumber(table.table_number)} downloaded.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Could not download this QR card."),
      });
    } finally {
      setActionBusy("");
    }
  }

  async function handleDownloadPdf(table) {
    setActionBusy(`pdf:${table.id}`);
    setNotice(null);
    try {
      const card = await getCardCanvas(table);
      const a4Canvas = await createA4PageForCard(card);
      const page = {
        jpegBytes: await canvasToJpegBytes(a4Canvas),
        width: A4_WIDTH,
        height: A4_HEIGHT,
        pageWidth: 595.28,
        pageHeight: 841.89,
      };
      const pdf = makePdfFromJpegPages([page]);
      downloadBlob(
        new Blob([pdf], { type: "application/pdf" }),
        `khaavio-table-${safeFilename(table.table_number)}.pdf`,
      );
      setNotice({
        type: "success",
        text: `Print-ready PDF for Table ${normalizeTableNumber(table.table_number)} downloaded.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Could not create the PDF."),
      });
    } finally {
      setActionBusy("");
    }
  }

  async function handlePrint(table) {
    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) {
      setNotice({
        type: "error",
        text: "The print preview popup was blocked. Allow popups for this page and try again.",
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      "<!doctype html><html><head><title>Khaavio Table QR</title><style>body{margin:0;padding:12mm;display:flex;justify-content:center;align-items:center;background:#fff}img{display:block;max-height:270mm;max-width:100%;object-fit:contain}@page{size:A4;margin:8mm}@media print{body{padding:0}}</style></head><body><p>Preparing print preview…</p></body></html>",
    );
    printWindow.document.close();

    setActionBusy(`print:${table.id}`);
    try {
      const canvas = await getCardCanvas(table);
      const a4Canvas = await createA4PageForCard(canvas);
      const imageUrl = a4Canvas.toDataURL("image/png");
      printWindow.document.body.innerHTML = "";
      const image = printWindow.document.createElement("img");
      image.alt = `QR card for ${restaurant?.name || "restaurant"}, Table ${normalizeTableNumber(table.table_number)}`;
      image.src = imageUrl;
      printWindow.document.body.appendChild(image);
      image.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
      setNotice({
        type: "success",
        text: `Print preview opened for Table ${normalizeTableNumber(table.table_number)}.`,
      });
    } catch (error) {
      printWindow.close();
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Could not open the print preview."),
      });
    } finally {
      setActionBusy("");
    }
  }

  async function handleCopyLink(table) {
    setActionBusy(`copy:${table.id}`);
    setNotice(null);
    try {
      if (!canExport(table))
        throw new Error(
          "Only published restaurants with active tables and saved QR tokens can copy a working QR destination.",
        );
      const url = getPublicMenuUrl(restaurant, table);
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied)
          throw new Error("Clipboard access was denied by this browser.");
      }
      setNotice({
        type: "success",
        text: `Public QR link for Table ${normalizeTableNumber(table.table_number)} copied.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Could not copy the table link."),
      });
    } finally {
      setActionBusy("");
    }
  }

  async function handleBulkPdf() {
    if (!selectedTables.length) {
      setNotice({
        type: "error",
        text: "Select at least one active table with a saved QR token.",
      });
      return;
    }
    setActionBusy("bulk");
    setNotice(null);
    setBulkProgress({ completed: 0, total: selectedTables.length });
    try {
      const pages = await createBulkA4Pages(
        selectedTables,
        restaurant,
        settings,
        (completed, total) => setBulkProgress({ completed, total }),
      );
      const pdf = makePdfFromJpegPages(pages);
      downloadBlob(
        new Blob([pdf], { type: "application/pdf" }),
        `khaavio-table-qrs-${selectedTables.length}-tables.pdf`,
      );
      setNotice({
        type: "success",
        text: `Created an A4 PDF with ${selectedTables.length} selected table QR card${selectedTables.length === 1 ? "" : "s"}. Each selected table appears once.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Could not create the bulk QR PDF."),
      });
    } finally {
      setActionBusy("");
      setBulkProgress(null);
    }
  }

  if (loading) {
    return (
      <main className="tqr-state">
        <LoaderCircle className="tqr-spinner" size={28} />
        <p>Loading your restaurant QR workspace…</p>
      </main>
    );
  }

  if (!restaurants.length && !loadError) {
    return (
      <main className="tqr-state">
        <div className="tqr-state-icon">
          <Store size={25} />
        </div>
        <h1>No restaurant workspace yet</h1>
        <p>Create your restaurant profile before generating table QR cards.</p>
        <Link className="tqr-button tqr-button--primary" to="/onboarding">
          Set up restaurant
        </Link>
      </main>
    );
  }

  const allVisibleSelected =
    filteredTables.filter(canExport).length > 0 &&
    filteredTables
      .filter(canExport)
      .every((table) => selectedTableIds.has(table.id));
  const qrIsReady = Boolean(qrDataUrl && activeTable && canExport(activeTable));

  return (
    <main className="tqr-page">
      <header className="tqr-page-header">
        <div className="tqr-heading-wrap">
          <Link
            className="tqr-back-link"
            to="/dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={17} /> Dashboard
          </Link>
          <div className="tqr-heading-row">
            <div className="tqr-heading-icon">
              <QrCode size={24} />
            </div>
            <div>
              <p className="tqr-eyebrow">BRANDED TABLE EXPERIENCE</p>
              <h1>Table QR Studio</h1>
              <p className="tqr-subtitle">
                Create branded QR codes for every restaurant table.
              </p>
            </div>
          </div>
        </div>
        {restaurants.length > 1 ? (
          <label className="tqr-restaurant-picker">
            <span>Restaurant workspace</span>
            <span className="tqr-select-wrap">
              <Store size={16} />
              <select
                value={restaurantId}
                onChange={(event) => setRestaurantId(event.target.value)}
                aria-label="Select restaurant"
              >
                {restaurants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </span>
          </label>
        ) : restaurant ? (
          <div className="tqr-selected-restaurant">
            <span className="tqr-restaurant-avatar">
              {restaurant.logo_url && !logoFailed ? (
                <img
                  src={restaurant.logo_url}
                  alt=""
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                getInitials(restaurant.name)
              )}
            </span>
            <span>
              <strong>{restaurant.name}</strong>
              <small>
                {restaurant.is_published
                  ? "Published restaurant"
                  : "Not published yet"}
              </small>
            </span>
          </div>
        ) : null}
      </header>

      {loadError ? (
        <div className="tqr-alert tqr-alert--error" role="alert">
          <Info size={18} />
          <div>
            <strong>We couldn't load the QR workspace.</strong>
            <p>{loadError}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loadError && restaurant && !restaurant.is_published ? (
        <div className="tqr-alert tqr-alert--warning" role="status">
          <Info size={18} />
          <div>
            <strong>Publish your restaurant before printing QR cards.</strong>
            <p>
              You can customize the preview now. Export and copy actions stay
              disabled until public menu links can work for customers.
            </p>
          </div>
          <Link to="/dashboard">Review publishing</Link>
        </div>
      ) : null}

      {notice ? (
        <div
          className={`tqr-alert ${notice.type === "error" ? "tqr-alert--error" : "tqr-alert--success"}`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.type === "error" ? (
            <Info size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <p>{notice.text}</p>
          <button
            type="button"
            className="tqr-alert-close"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <section className="tqr-stats" aria-label="Table QR statistics">
        <article className="tqr-stat-card">
          <span className="tqr-stat-icon">
            <Table2 size={18} />
          </span>
          <div>
            <small>Total tables</small>
            <strong>{tableStats.total}</strong>
          </div>
        </article>
        <article className="tqr-stat-card">
          <span className="tqr-stat-icon tqr-stat-icon--green">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <small>QR ready</small>
            <strong>{tableStats.qrReady}</strong>
          </div>
        </article>
        <article className="tqr-stat-card">
          <span className="tqr-stat-icon tqr-stat-icon--amber">
            <RefreshCw size={18} />
          </span>
          <div>
            <small>Pending setup</small>
            <strong>{tableStats.pending}</strong>
          </div>
        </article>
        <article className="tqr-stat-card">
          <span className="tqr-stat-icon tqr-stat-icon--rose">
            <ShieldCheck size={18} />
          </span>
          <div>
            <small>Inactive tables</small>
            <strong>{tableStats.inactive}</strong>
          </div>
        </article>
      </section>

      <div className="tqr-workspace">
        <section className="tqr-panel tqr-table-panel">
          <div className="tqr-panel-heading">
            <div>
              <h2>Your tables</h2>
              <p>
                Create tables here, then select one to preview its unique QR
                code.
              </p>
            </div>
            <div className="tqr-panel-heading-actions">
              <span className="tqr-count-pill">
                {filteredTables.length} shown
              </span>
              <button
                type="button"
                className="tqr-button tqr-button--primary tqr-add-table-button"
                onClick={() => setShowCreateTable((current) => !current)}
                aria-expanded={showCreateTable}
              >
                {showCreateTable ? <X size={15} /> : <Plus size={15} />}
                {showCreateTable ? "Close" : "Add table"}
              </button>
            </div>
          </div>

          {showCreateTable ? (
            <form
              className="tqr-create-table-panel"
              onSubmit={handleCreateTable}
            >
              <div className="tqr-create-table-heading">
                <div>
                  <strong>Add a restaurant table</strong>
                  <p>
                    A unique QR token is generated and saved for every table.
                  </p>
                </div>
              </div>
              <div className="tqr-create-table-fields">
                <label className="tqr-create-table-field">
                  <span>Table name / number</span>
                  <input
                    autoFocus
                    value={newTableNumber}
                    onChange={(event) => setNewTableNumber(event.target.value)}
                    maxLength={80}
                    placeholder="e.g. Table 1, Patio A"
                    required
                    disabled={creatingTable}
                  />
                </label>
                <label className="tqr-create-table-field tqr-create-capacity-field">
                  <span>Seats</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="50"
                    step="1"
                    value={newTableCapacity}
                    onChange={(event) =>
                      setNewTableCapacity(event.target.value)
                    }
                    required
                    disabled={creatingTable}
                  />
                </label>
              </div>
              <div className="tqr-create-table-actions">
                <button
                  type="button"
                  className="tqr-button tqr-button--secondary"
                  onClick={() => setShowCreateTable(false)}
                  disabled={creatingTable}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tqr-button tqr-button--primary"
                  disabled={creatingTable || !restaurant}
                >
                  {creatingTable ? (
                    <>
                      <LoaderCircle className="tqr-spinner" size={15} />{" "}
                      Creating…
                    </>
                  ) : (
                    <>
                      <Plus size={15} /> Create table
                    </>
                  )}
                </button>
              </div>
              <p className="tqr-create-table-hint">
                Tables can be added before publishing. QR export becomes
                available after the restaurant is published.
              </p>
            </form>
          ) : null}

          <div className="tqr-table-tools">
            <label className="tqr-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tables…"
                aria-label="Search tables"
              />
            </label>
            <label className="tqr-filter">
              <Filter size={16} />
              <select
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
                aria-label="Filter tables"
              >
                <option value="all">All tables</option>
                <option value="active">Active</option>
                <option value="needs-qr">Needs setup</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="tqr-select-all-row">
            <label>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                disabled={!filteredTables.some(canExport)}
              />
              <span>Select all ready tables shown</span>
            </label>
            <span>{selectedTables.length} selected</span>
          </div>

          {tablesLoading ? (
            <div className="tqr-inline-state">
              <LoaderCircle className="tqr-spinner" size={22} />
              <span>Loading all tables…</span>
            </div>
          ) : tables.length === 0 && !loadError ? (
            <div className="tqr-inline-state tqr-inline-state--empty">
              <Table2 size={28} />
              <strong>No tables yet</strong>
              <span>
                Create your first table to save a unique QR token and generate a
                table-specific QR card.
              </span>
              <button
                type="button"
                className="tqr-button tqr-button--primary"
                onClick={() => setShowCreateTable(true)}
              >
                <Plus size={15} /> Add your first table
              </button>
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="tqr-inline-state tqr-inline-state--empty">
              <Search size={24} />
              <strong>No matching tables</strong>
              <span>Try changing your search or filter.</span>
            </div>
          ) : (
            <div className="tqr-table-list">
              {filteredTables.map((table) => {
                const isActive = table.is_active === true;
                const hasToken = Boolean(table.qr_token);
                const isReady = canExport(table);
                const isSelected = selectedTableIds.has(table.id);
                const isPreview = activeTableId === table.id;
                return (
                  <article
                    key={table.id}
                    className={`tqr-table-row ${isPreview ? "is-preview" : ""} ${!isActive ? "is-inactive" : ""}`}
                  >
                    <label className="tqr-table-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTableSelection(table)}
                        disabled={!isReady || Boolean(actionBusy === "bulk")}
                        aria-label={`Select ${table.table_number} for bulk PDF`}
                      />
                    </label>
                    <button
                      type="button"
                      className="tqr-table-main"
                      onClick={() => setActiveTableId(table.id)}
                      aria-pressed={isPreview}
                    >
                      <span className="tqr-mini-qr">
                        <QrCode size={22} />
                      </span>
                      <span className="tqr-table-copy">
                        <strong>Table {normalizeTableNumber(table.table_number)}</strong>
                        <small>
                          {table.capacity
                            ? `${table.capacity} seats`
                            : "Restaurant table"}
                        </small>
                      </span>
                      <span
                        className={`tqr-status ${isReady ? "tqr-status--ready" : isActive ? "tqr-status--pending" : "tqr-status--inactive"}`}
                      >
                        <span />
                        {!isActive
                          ? "Inactive"
                          : !hasToken
                            ? "No token"
                            : !restaurant?.is_published
                              ? "Unpublished"
                              : "Ready"}
                      </span>
                    </button>
                    <div className="tqr-row-actions">
                      <button
                        type="button"
                        onClick={() => beginEditTable(table)}
                        disabled={Boolean(actionBusy)}
                        aria-label={`Edit ${table.table_number}`}
                        title="Edit table"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleTableActive(table)}
                        disabled={Boolean(actionBusy)}
                        aria-label={`${isActive ? "Deactivate" : "Activate"} ${table.table_number}`}
                        title={isActive ? "Deactivate table" : "Activate table"}
                      >
                        <Power size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTable(table)}
                        disabled={Boolean(actionBusy)}
                        aria-label={`Delete ${table.table_number}`}
                        title="Delete table"
                      >
                        {actionBusy === `delete:${table.id}` ? (
                          <LoaderCircle className="tqr-spinner" size={15} />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPng(table)}
                        disabled={!isReady || Boolean(actionBusy)}
                        aria-label={`Download PNG for ${table.table_number}`}
                        title="Download PNG"
                      >
                        {actionBusy === `png:${table.id}` ? (
                          <LoaderCircle className="tqr-spinner" size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(table)}
                        disabled={!isReady || Boolean(actionBusy)}
                        aria-label={`Copy QR link for ${table.table_number}`}
                        title="Copy QR link"
                      >
                        {actionBusy === `copy:${table.id}` ? (
                          <LoaderCircle className="tqr-spinner" size={16} />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="tqr-bulk-card">
            <div className="tqr-bulk-icon">
              <FileText size={20} />
            </div>
            <div className="tqr-bulk-copy">
              <strong>Bulk A4 PDF</strong>
              <span>
                Up to 9 cards per page; additional pages are added
                automatically.
              </span>
            </div>
            <button
              type="button"
              className="tqr-button tqr-button--primary"
              onClick={handleBulkPdf}
              disabled={
                !selectedTables.length ||
                Boolean(actionBusy) ||
                !restaurant?.is_published
              }
            >
              {actionBusy === "bulk" ? (
                <>
                  <LoaderCircle className="tqr-spinner" size={16} />{" "}
                  {bulkProgress
                    ? `${bulkProgress.completed}/${bulkProgress.total}`
                    : "Preparing"}
                </>
              ) : (
                <>
                  <ArrowDownToLine size={16} /> Export
                </>
              )}
            </button>
          </div>
          {bulkProgress ? (
            <div className="tqr-progress-wrap">
              <div className="tqr-progress-label">
                <span>Creating QR cards…</span>
                <strong>
                  {bulkProgress.completed} / {bulkProgress.total}
                </strong>
              </div>
              <div className="tqr-progress">
                <span
                  style={{
                    width: `${(bulkProgress.completed / Math.max(1, bulkProgress.total)) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="tqr-panel tqr-design-panel">
          <div className="tqr-panel-heading">
            <div>
              <h2>Customize your QR card</h2>
              <p>Changes update the preview and exports immediately.</p>
            </div>
            <span className="tqr-live-pill">
              <span /> Live preview
            </span>
          </div>

          <div
            className="tqr-template-grid"
            role="group"
            aria-label="QR card template"
          >
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`tqr-template-option tqr-template-option--${template.id} ${settings.template === template.id ? "is-selected" : ""}`}
                onClick={() => updateSetting("template", template.id)}
                aria-pressed={settings.template === template.id}
              >
                <span className="tqr-template-swatch">
                  <span className="tqr-template-logo" />
                  <span className="tqr-template-qr" />
                  <span className="tqr-template-line" />
                  <span className="tqr-template-number">03</span>
                </span>
                <strong>{template.name}</strong>
                <small>{template.caption}</small>
                {settings.template === template.id ? (
                  <span className="tqr-template-check">
                    <Check size={13} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="tqr-customize-grid">
            <div className="tqr-customize-card">
              <div className="tqr-subheading">
                <Settings2 size={17} />
                <h3>Card content</h3>
              </div>
              <SettingToggle
                label="Restaurant logo"
                checked={settings.showLogo}
                onChange={(value) => updateSetting("showLogo", value)}
                description={
                  restaurant?.logo_url
                    ? "Uses the saved restaurant logo"
                    : "Shows restaurant initials until a logo is uploaded"
                }
              />
              <SettingToggle
                label="Restaurant name"
                checked={settings.showName}
                onChange={(value) => updateSetting("showName", value)}
              />
              <SettingToggle
                label="Tagline / description"
                checked={settings.showTagline}
                onChange={(value) => updateSetting("showTagline", value)}
                description={
                  restaurant?.description
                    ? "Uses the saved restaurant description"
                    : "No description is saved yet"
                }
              />
              <SettingToggle
                label="Cuisine type"
                checked={settings.showCuisine}
                onChange={(value) => updateSetting("showCuisine", value)}
              />
              <SettingToggle
                label="Table number"
                checked={settings.showTableNumber}
                onChange={(value) => updateSetting("showTableNumber", value)}
              />
              <SettingToggle
                label="Powered by Khaavio"
                checked={settings.showPoweredBy}
                onChange={(value) => updateSetting("showPoweredBy", value)}
              />
            </div>
            <div className="tqr-customize-card">
              <div className="tqr-subheading">
                <Settings2 size={17} />
                <h3>Style & format</h3>
              </div>
              <label className="tqr-field">
                <span>Call-to-action text</span>
                <input
                  value={settings.ctaText}
                  maxLength={35}
                  onChange={(event) =>
                    updateSetting("ctaText", event.target.value)
                  }
                  placeholder="SCAN TO ORDER"
                />
              </label>
              <label className="tqr-field">
                <span>Table number format</span>
                <select
                  value={settings.tableNumberFormat}
                  onChange={(event) =>
                    updateSetting("tableNumberFormat", event.target.value)
                  }
                >
                  <option value="table-02">TABLE 03</option>
                  <option value="number">03</option>
                  <option value="table-1">TABLE 3</option>
                </select>
              </label>
              <div className="tqr-export-note">
                <ShieldCheck size={17} />
                <p>
                  QR destinations use each table's saved token. No database
                  records or tokens are created while previewing.
                </p>
              </div>
              <div className="tqr-format-pills">
                <span>PNG · 1080 × 1620</span>
                <span>PDF · A4 print page</span>
              </div>
            </div>
          </div>

          <div className="tqr-preview-heading">
            <div>
              <h3>Live preview</h3>
              <p>
                {activeTable
                  ? `Preview for Table ${normalizeTableNumber(activeTable.table_number)}`
                  : "Select a table to preview its code"}
              </p>
            </div>
            <button
              type="button"
              className="tqr-icon-button"
              onClick={() => {
                setNotice(null);
                setQrDataUrl("");
                if (qrTargetUrl)
                  QRCode.toDataURL(qrTargetUrl, QR_OPTIONS)
                    .then(setQrDataUrl)
                    .catch((error) =>
                      setNotice({
                        type: "error",
                        text: getErrorMessage(
                          error,
                          "Could not refresh the QR preview.",
                        ),
                      }),
                    );
              }}
              disabled={!qrTargetUrl || qrLoading}
              aria-label="Refresh QR preview"
              title="Refresh preview"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          <div className="tqr-preview-layout">
            <div className="tqr-preview-stage">
              {qrLoading ? (
                <div className="tqr-preview-loading">
                  <LoaderCircle className="tqr-spinner" size={24} />
                  <span>Generating secure QR preview…</span>
                </div>
              ) : activeTable ? (
                <QRCardPreview
                  restaurant={restaurant}
                  table={activeTable}
                  posterDataUrl={previewCardDataUrl}
                  loading={previewCardLoading || qrLoading}
                />
              ) : (
                <div className="tqr-preview-empty">
                  <QrCode size={32} />
                  <span>Select a table to begin</span>
                </div>
              )}
            </div>
            <div className="tqr-download-options">
              <div className="tqr-download-copy">
                <span className="tqr-download-option-icon">
                  <FileImage size={19} />
                </span>
                <span>
                  <strong>Download as PNG</strong>
                  <small>High-resolution branded card</small>
                </span>
              </div>
              <button
                type="button"
                aria-label="Download selected table card as PNG"
                onClick={() => activeTable && handleDownloadPng(activeTable)}
                disabled={!activeTable || !qrIsReady || Boolean(actionBusy)}
              >
                <Download size={18} />
              </button>

              <div className="tqr-download-copy">
                <span className="tqr-download-option-icon tqr-download-option-icon--pdf">
                  <FileText size={19} />
                </span>
                <span>
                  <strong>Download as PDF</strong>
                  <small>A4 page, print ready</small>
                </span>
              </div>
              <button
                type="button"
                aria-label="Download selected table card as PDF"
                onClick={() => activeTable && handleDownloadPdf(activeTable)}
                disabled={!activeTable || !qrIsReady || Boolean(actionBusy)}
              >
                <Download size={18} />
              </button>

              <div className="tqr-download-copy">
                <span className="tqr-download-option-icon tqr-download-option-icon--print">
                  <Printer size={19} />
                </span>
                <span>
                  <strong>Print directly</strong>
                  <small>Open a print-ready page</small>
                </span>
              </div>
              <button
                type="button"
                aria-label="Print selected table card"
                onClick={() => activeTable && handlePrint(activeTable)}
                disabled={!activeTable || !qrIsReady || Boolean(actionBusy)}
              >
                <Printer size={17} />
              </button>

              <div className="tqr-download-copy">
                <span className="tqr-download-option-icon tqr-download-option-icon--link">
                  <Copy size={19} />
                </span>
                <span>
                  <strong>Copy QR link</strong>
                  <small>Public menu + this table</small>
                </span>
              </div>
              <button
                type="button"
                aria-label="Copy selected table QR link"
                onClick={() => activeTable && handleCopyLink(activeTable)}
                disabled={!activeTable || !qrIsReady || Boolean(actionBusy)}
              >
                <Copy size={17} />
              </button>

              <button
                type="button"
                className="tqr-full-preview-button"
                onClick={() => setShowLargePreview(true)}
                disabled={!activeTable || !qrDataUrl}
              >
                <ExternalLink size={16} /> View larger preview
              </button>
              {activeTable && qrIsReady ? (
                <a
                  className="tqr-open-menu-link"
                  href={qrTargetUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> Test public table link
                </a>
              ) : (
                <p className="tqr-export-disabled-note">
                  Exports unlock when the restaurant is published and the
                  selected table is active with a saved QR token.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="tqr-page-footer">
        <img src={khaavioIcon} alt="" />
        <span>
          Powered by <strong>Khaavio</strong>
        </span>
        <span className="tqr-footer-separator">·</span>
        <span>Branded for {restaurant?.name || "your restaurant"}</span>
      </footer>

      {showLargePreview && activeTable ? (
        <div
          className="tqr-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShowLargePreview(false);
          }}
        >
          <section
            className="tqr-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tqr-modal-title"
          >
            <div className="tqr-modal-heading">
              <div>
                <h2 id="tqr-modal-title">Live QR card preview</h2>
                <p>
                  Table {normalizeTableNumber(activeTable.table_number)} · {restaurant?.name}
                </p>
              </div>
              <button
                type="button"
                className="tqr-icon-button"
                onClick={() => setShowLargePreview(false)}
                aria-label="Close large preview"
              >
                <X size={18} />
              </button>
            </div>
            <div className="tqr-large-card-stage">
              <QRCardPreview
                restaurant={restaurant}
                table={activeTable}
                posterDataUrl={previewCardDataUrl}
                loading={previewCardLoading || qrLoading}
              />
            </div>
            <div className="tqr-modal-actions">
              <button
                type="button"
                className="tqr-button tqr-button--secondary"
                onClick={() => setShowLargePreview(false)}
              >
                Close preview
              </button>
              <button
                type="button"
                className="tqr-button tqr-button--primary"
                onClick={() => handleDownloadPng(activeTable)}
                disabled={!qrIsReady || Boolean(actionBusy)}
              >
                <Download size={16} /> Download PNG
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {editingTable ? (
        <div
          className="tqr-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (!updatingTable && event.target === event.currentTarget) setEditingTable(null);
          }}
        >
          <section
            className="tqr-preview-modal tqr-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tqr-edit-title"
          >
            <div className="tqr-modal-heading">
              <div>
                <span className="tqr-edit-eyebrow">TABLE SETTINGS</span>
                <h2 id="tqr-edit-title">Edit table</h2>
                <p>Update the name or seating capacity for Table {normalizeTableNumber(editingTable.table_number)}.</p>
              </div>
              <button
                type="button"
                className="tqr-icon-button"
                onClick={() => setEditingTable(null)}
                disabled={updatingTable}
                aria-label="Close edit table"
              >
                <X size={18} />
              </button>
            </div>
            <form className="tqr-edit-form" onSubmit={handleUpdateTable}>
              <label className="tqr-edit-field">
                <span>Table name / number</span>
                <input
                  autoFocus
                  value={editTableNumber}
                  onChange={(event) => setEditTableNumber(event.target.value)}
                  maxLength={80}
                  required
                  disabled={updatingTable}
                />
              </label>
              <label className="tqr-edit-field">
                <span>Seating capacity</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="50"
                  step="1"
                  value={editTableCapacity}
                  onChange={(event) => setEditTableCapacity(event.target.value)}
                  required
                  disabled={updatingTable}
                />
              </label>
              <div className="tqr-edit-safety-note">
                <ShieldCheck size={16} />
                <span>The existing QR token is kept, so printed QR codes continue to point to this table.</span>
              </div>
              <div className="tqr-edit-actions">
                <button
                  type="button"
                  className="tqr-button tqr-button--secondary"
                  onClick={() => setEditingTable(null)}
                  disabled={updatingTable}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tqr-button tqr-button--primary"
                  disabled={updatingTable || Boolean(actionBusy && !actionBusy.startsWith("update:"))}
                >
                  {updatingTable ? (
                    <>
                      <LoaderCircle className="tqr-spinner" size={15} /> Saving…
                    </>
                  ) : (
                    <>
                      <Check size={15} /> Save changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
