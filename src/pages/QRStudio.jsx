import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Printer,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
  QrCode,
  Store,
} from "lucide-react";
import QRCode from "qrcode";

import { supabase } from "../lib/supabaseClient";
import { createPublicQrDestination } from "../lib/seoMetadata.js";
import khaavioIcon from "../assets/icon.png";
import "./QRStudio.css";

export default function QRStudio() {
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;

    async function loadRestaurant() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug, is_published, logo_url, restaurant_type, description")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (restaurantError) throw restaurantError;

        if (!active) return;

        if (!data) {
          setError("No restaurant found. Complete restaurant setup first.");
          return;
        }

        setRestaurant(data);
      } catch (err) {
        if (active) {
          setError(
            typeof err?.message === "string"
              ? err.message
              : "Could not load your restaurant.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRestaurant();

    return () => {
      active = false;
    };
  }, [navigate]);

  const menuUrl = restaurant
    ? createPublicQrDestination("menu", restaurant.slug)
    : "";

  useEffect(() => {
    let active = true;

    async function generateQR() {
      if (!menuUrl) {
        setQrImage("");
        return;
      }

      setQrLoading(true);
      setError("");
      setFeedback("");

      try {
        const image = await QRCode.toDataURL(menuUrl, {
          width: 1200,
          margin: 4,
          errorCorrectionLevel: "H",
          color: {
            dark: "#064e3b",
            light: "#ffffff",
          },
        });

        if (active) setQrImage(image);
      } catch (err) {
        if (active) {
          setError(err?.message || "Could not generate the QR code.");
          setQrImage("");
        }
      } finally {
        if (active) setQrLoading(false);
      }
    }

    generateQR();

    return () => {
      active = false;
    };
  }, [menuUrl]);

  async function copyMenuLink() {
    if (!menuUrl) return;

    setFeedback("");
    setError("");

    try {
      await navigator.clipboard.writeText(menuUrl);
      setFeedback("Menu link copied successfully.");
    } catch {
      setError(
        "Clipboard access is unavailable. Copy the menu URL from the field.",
      );
    }
  }

  function roundedCanvasRect(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 1) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function loadPosterImage(src) {
    return new Promise((resolve) => {
      if (!src) { resolve(null); return; }
      const image = new Image(); image.crossOrigin = "anonymous";
      image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src;
    });
  }

  function fitCanvasText(ctx, value, maxWidth, startSize, family, weight = "600") {
    let size = startSize; ctx.font = weight + " " + size + "px " + family;
    while (ctx.measureText(value).width > maxWidth && size > 28) { size -= 2; ctx.font = weight + " " + size + "px " + family; }
    return size;
  }

  async function buildMenuPoster() {
    const posterScale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 1080 * posterScale;
    canvas.height = 1440 * posterScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not create the menu poster.");
    ctx.scale(posterScale, posterScale);
    const colors = { green: "#173e32", paper: "#fbf8ef", ink: "#183d31", muted: "#64776b", gold: "#c7a264", border: "#d8d1bd" };
    ctx.fillStyle = colors.green; ctx.fillRect(0, 0, canvas.width / posterScale, canvas.height / posterScale);
    roundedCanvasRect(ctx, 28, 28, 1024, 1384, 46, colors.paper, colors.gold, 3);
    roundedCanvasRect(ctx, 48, 48, 984, 1344, 34, null, colors.border, 2);
    roundedCanvasRect(ctx, 58, 58, 964, 410, 34, colors.green, null);

    ctx.strokeStyle = colors.gold; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(150, 105); ctx.lineTo(340, 105); ctx.moveTo(740, 105); ctx.lineTo(930, 105); ctx.stroke();
    ctx.fillStyle = "#e5d3a8"; ctx.font = "800 20px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("GOOD FOOD  ·  ONE SCAN AWAY", 540, 105);

    roundedCanvasRect(ctx, 465, 128, 150, 150, 75, colors.paper, colors.gold, 4);
    ctx.save(); ctx.beginPath(); ctx.arc(540, 203, 66, 0, Math.PI * 2); ctx.clip();
    const logo = await loadPosterImage(restaurant.logo_url || "") || await loadPosterImage(khaavioIcon);
    if (logo) {
      const side = Math.min(logo.width, logo.height);
      ctx.drawImage(logo, (logo.width-side)/2, (logo.height-side)/2, side, side, 474, 137, 132, 132);
    } else { ctx.fillStyle = colors.green; ctx.font = "800 40px Arial, sans-serif"; ctx.fillText(String(restaurant.name || "R").slice(0,2).toUpperCase(), 540, 207); }
    ctx.restore();

    ctx.fillStyle = colors.paper; ctx.textBaseline = "alphabetic";
    const restaurantName = String(restaurant.name || "Restaurant");
    fitCanvasText(ctx, restaurantName, 850, 54, "Georgia, serif", "600"); ctx.fillText(restaurantName, 540, 337);
    const cuisine = String(restaurant.restaurant_type || "RESTAURANT").replace(/_/g, " ").toUpperCase();
    ctx.fillStyle = "#e5d3a8"; ctx.font = "700 19px Arial, sans-serif"; ctx.fillText(cuisine.slice(0,45), 540, 382);
    ctx.strokeStyle = "rgba(229,211,168,0.65)"; ctx.beginPath(); ctx.moveTo(390,414); ctx.lineTo(690,414); ctx.stroke();

    ctx.fillStyle = colors.green; ctx.font = "900 24px Arial, sans-serif"; ctx.fillText("SCAN TO EXPLORE", 540, 523);
    ctx.fillStyle = colors.muted; ctx.font = "400 18px Arial, sans-serif"; ctx.fillText("Browse the menu · Discover favourites · Order easily", 540, 555);
    roundedCanvasRect(ctx,245,585,590,590,30,"#ffffff",colors.gold,3); roundedCanvasRect(ctx,261,601,558,558,23,null,colors.border,1.5);
    const qr = await loadPosterImage(qrImage); if (!qr) throw new Error("The QR image could not be prepared for print.");
    ctx.imageSmoothingEnabled = false; ctx.drawImage(qr,293,633,494,494); ctx.imageSmoothingEnabled = true;

    roundedCanvasRect(ctx,205,1200,670,72,25,colors.green,null);
    ctx.fillStyle = colors.paper; ctx.font = "900 24px Arial, sans-serif"; ctx.fillText("OPEN MENU & ORDER",540,1244);
    ctx.fillStyle = colors.muted; ctx.font = "600 16px Arial, sans-serif"; ctx.fillText("MENU  ·  SPECIALS  ·  FAVOURITES",540,1308);
    ctx.strokeStyle = colors.border; ctx.beginPath(); ctx.moveTo(360,1334); ctx.lineTo(720,1334); ctx.stroke();
    const brand = await loadPosterImage(khaavioIcon); if (brand) ctx.drawImage(brand,435,1350,31,31);
    ctx.fillStyle = colors.ink; ctx.textAlign = "left"; ctx.font = "800 17px Arial, sans-serif"; ctx.fillText("POWERED BY KHAAVIO",475,1372);
    return canvas;
  }

  async function downloadQR() {
    if (!qrImage || !restaurant) return;
    setFeedback("");
    setError("");
    if (!restaurant.is_published) {
      setError("Publish your menu before downloading a customer-ready QR poster.");
      return;
    }
    try {
      const canvas = await buildMenuPoster();
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (result) => result
            ? resolve(result)
            : reject(new Error("Could not export the menu poster.")),
          "image/png",
        ),
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = String(restaurant.slug || "menu") + "-branded-menu-qr.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // High-resolution images can take longer to be picked up by the browser's download manager.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setFeedback("High-resolution branded menu QR poster downloaded. Print it at A4 size.");
    } catch (err) {
      setError(err?.message || "Could not export the branded menu QR poster.");
    }
  }

  async function printMenuQR() {
    if (!qrImage || !restaurant) return;
    setFeedback("");
    setError("");
    if (!restaurant.is_published) {
      setError("Publish your menu before printing a customer-ready QR poster.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) {
      setError("The print preview popup was blocked. Allow popups for this page and try again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Khaavio Menu QR</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;width:100%;height:100%;background:#fff}body{display:flex;align-items:center;justify-content:center}img{display:block;width:210mm;height:297mm;object-fit:contain}@media screen{body{padding:16px;box-sizing:border-box}img{width:auto;height:calc(100vh - 32px);max-width:calc(100vw - 32px)}}@media print{html,body{width:210mm;height:297mm;margin:0;padding:0}body{display:block}img{width:210mm;height:297mm}}</style></head><body><p>Preparing print preview…</p></body></html>");
    printWindow.document.close();

    try {
      const canvas = await buildMenuPoster();
      const imageUrl = canvas.toDataURL("image/png");
      const image = printWindow.document.createElement("img");
      image.alt = `Branded menu QR poster for ${restaurant.name || "restaurant"}`;
      let printStarted = false;
      const openPrintDialog = () => {
        if (printStarted || printWindow.closed) return;
        printStarted = true;
        printWindow.focus();
        printWindow.print();
        setFeedback("Print preview opened for your menu QR poster.");
      };
      image.onload = openPrintDialog;
      image.onerror = () => {
        if (!printWindow.closed) printWindow.close();
        setError("The print image could not be loaded. Download the PNG and print it instead.");
      };
      printWindow.document.body.replaceChildren(image);
      image.src = imageUrl;
      if (image.complete && image.naturalWidth > 0) window.setTimeout(openPrintDialog, 0);
    } catch (err) {
      printWindow.close();
      setError(err?.message || "Could not prepare the menu QR for printing.");
    }
  }

  const isLocal =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (loading) {
    return (
      <main className="qr-state">
        <LoaderCircle className="qr-spinner" size={30} />
        <p>Loading your QR Studio...</p>
      </main>
    );
  }

  return (
    <main className="qr-page">
      <header className="qr-header">
        <Link to="/dashboard" className="qr-back-link">
          <ArrowLeft size={17} />
          Dashboard
        </Link>

      </header>

      <div className="qr-container">
        <div className="qr-heading">
          <span className="qr-eyebrow">RESTAURANT WORKSPACE</span>
          <h1>QR Studio</h1>
          <p>One scan takes your customers straight to your digital menu.</p>
        </div>

        {error && (
          <div className="qr-alert qr-alert-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}

        {feedback && (
          <div className="qr-alert qr-alert-success" role="status">
            <CheckCircle2 size={17} />
            <span>{feedback}</span>
            <button
              onClick={() => setFeedback("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {restaurant && (
          <>
            {isLocal && (
              <div className="qr-dev-notice">
                <strong>Local development preview</strong>
                <p>
                  QR codes always use your public Khaavio domain, even during
                  local development. Customers can scan the same QR from any
                  phone and open your published menu on khaavio.in.
                </p>
              </div>
            )}

            <section className="qr-workspace">
              <div className="qr-preview-column">
                <div className="qr-preview-top">
                  <span className="qr-mini-label">YOUR MENU QR</span>

                  <span
                    className={`qr-status ${
                      restaurant.is_published ? "qr-status-live" : ""
                    }`}
                  >
                    <span />
                    {restaurant.is_published ? "Published" : "Not published"}
                  </span>
                </div>

                <div className="qr-poster-preview">
                  <div className="qr-poster-topline"><span /><strong>GOOD FOOD · ONE SCAN AWAY</strong><span /></div>
                  <div className="qr-poster-logo"><img src={restaurant.logo_url || khaavioIcon} alt={restaurant.logo_url ? restaurant.name + " logo" : "Khaavio"} /></div>
                  <p className="qr-poster-kicker">YOUR DIGITAL MENU</p>
                  <h2 className="qr-poster-name">{restaurant.name}</h2>
                  {restaurant.restaurant_type ? <p className="qr-poster-cuisine">{String(restaurant.restaurant_type).replace(/_/g, " ")}</p> : null}
                  <div className="qr-poster-divider" />
                  <div className="qr-poster-scan-label">SCAN TO EXPLORE</div>
                  <p className="qr-poster-scan-copy">Browse dishes · Discover favourites · Order easily</p>
                  <div className="qr-image-frame">
                    {qrLoading ? (
                      <LoaderCircle className="qr-spinner" size={30} />
                    ) : qrImage ? (
                      <img className="qr-image" src={qrImage} alt={`QR code for ${restaurant.name} digital menu`} />
                    ) : (
                      <div className="qr-image-placeholder"><QrCode size={44} /><span>QR preview unavailable</span></div>
                    )}
                  </div>
                  <div className="qr-poster-cta">OPEN MENU & ORDER</div>
                  <p className="qr-poster-footer-copy">MENU · SPECIALS · FAVOURITES</p>
                  <div className="qr-poster-brand"><img src={khaavioIcon} alt="" /><span>POWERED BY KHAAVIO</span></div>
                </div>

                <button type="button" className="qr-download-button" onClick={downloadQR} disabled={!qrImage || qrLoading || !restaurant?.is_published}>
                  <Download size={17} /> Download branded menu QR
                </button>
                <button type="button" className="qr-secondary-button" onClick={printMenuQR} disabled={!qrImage || qrLoading || !restaurant?.is_published} aria-label="Print branded menu QR poster">
                  <Printer size={17} /> Print menu QR
                </button>
                <p className="qr-download-note">{restaurant.is_published ? "High-resolution PNG · Print-ready A4 layout" : "Publish your menu before downloading or printing a customer-ready QR."}</p>
              </div>

              <div className="qr-details-column">
                <span className="qr-eyebrow">MENU CONNECTION</span>
                <h2>{restaurant.name}</h2>

                <p className="qr-explanation">
                  This QR code opens your restaurant's public digital menu. It
                  updates automatically when you change dishes or prices.
                </p>

                <label className="qr-field">
                  <span>Public menu URL</span>
                  <input
                    readOnly
                    value={menuUrl}
                    onFocus={(event) => event.target.select()}
                  />
                </label>

                <button
                  className="qr-secondary-button"
                  type="button"
                  onClick={copyMenuLink}
                >
                  <Copy size={16} />
                  Copy menu link
                </button>

                {restaurant.is_published ? (
                  <a
                    className="qr-open-link"
                    href={menuUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview live menu
                    <ExternalLink size={15} />
                  </a>
                ) : (
                  <div className="qr-publish-note">
                    <Store size={19} />
                    <div>
                      <strong>Publish your menu first</strong>
                      <p>
                        The QR can be generated now, but customers need a
                        published menu to view its contents.
                      </p>
                      <Link to="/dashboard">
                        Go to dashboard <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>
                )}

                <div className="qr-instructions">
                  <h3>How to use it</h3>
                  <div>
                    <span>01</span>
                    <p>Download your QR code as a PNG.</p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      Print it for your counter, menu card or display stand.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      Customers scan it to view your latest available dishes.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
