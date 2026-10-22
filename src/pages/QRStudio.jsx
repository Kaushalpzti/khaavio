import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
  QrCode,
  Store,
} from "lucide-react";
import QRCode from "qrcode";

import { supabase } from "../lib/supabaseClient";
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
          .select("id, name, slug, is_published")
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
    ? `${window.location.origin}/menu/${encodeURIComponent(restaurant.slug)}`
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
          width: 420,
          margin: 3,
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

  function downloadQR() {
    if (!qrImage || !restaurant) return;

    const link = document.createElement("a");
    link.href = qrImage;
    link.download = `${restaurant.slug}-menu-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setFeedback("QR code download started.");
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

        <Link to="/" className="qr-brand">
          <img src={khaavioIcon} alt="" />
          Khaavio
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
                  This QR currently contains your localhost URL. It is useful
                  for testing on this computer, but it will not open your
                  development server on a customer's phone. After deployment,
                  generate a QR from your live domain.
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

                <div className="qr-image-frame">
                  {qrLoading ? (
                    <LoaderCircle className="qr-spinner" size={30} />
                  ) : qrImage ? (
                    <img
                      className="qr-image"
                      src={qrImage}
                      alt={`QR code for ${restaurant.name} digital menu`}
                    />
                  ) : (
                    <div className="qr-image-placeholder">
                      <QrCode size={44} />
                      <span>QR preview unavailable</span>
                    </div>
                  )}
                </div>

                <div className="qr-restaurant-label">
                  <img src={khaavioIcon} alt="" />
                  <div>
                    <strong>{restaurant.name}</strong>
                    <span>Scan to explore the menu</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="qr-download-button"
                  onClick={downloadQR}
                  disabled={!qrImage || qrLoading}
                >
                  <Download size={17} />
                  Download QR as PNG
                </button>

                <p className="qr-download-note">
                  High-resolution PNG · Ready to print
                </p>
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
