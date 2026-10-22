import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  LoaderCircle,
  Plus,
  QrCode,
  Users,
} from "lucide-react";
import QRCode from "qrcode";

import { supabase } from "../lib/supabaseClient";
import "./TableQRStudio.css";

function getTableMenuUrl(restaurant, table) {
  const url = new URL(
    `/menu/${encodeURIComponent(restaurant.slug)}`,
    window.location.origin,
  );

  url.searchParams.set("table", table.qr_token);

  return url.toString();
}

function TableQRCard({ restaurant, table, onToggleActive, updating }) {
  const [qrImage, setQrImage] = useState("");
  const [qrError, setQrError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const menuUrl = getTableMenuUrl(restaurant, table);

  useEffect(() => {
    let active = true;

    async function generateQR() {
      setQrImage("");
      setQrError("");

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
          setQrError(
            err?.message || "QR generation failed. Try refreshing the page.",
          );
        }
      }
    }

    generateQR();

    return () => {
      active = false;
    };
  }, [menuUrl]);

  function downloadQR() {
    if (!qrImage || !table.is_active) return;

    const safeTableName = table.table_number.replace(/[^a-z0-9_-]/gi, "-");

    const link = document.createElement("a");
    link.href = qrImage;
    link.download = `${restaurant.slug}-table-${safeTableName}-qr.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setActionMessage("QR code download started.");
  }

  async function copyLink() {
    if (!table.is_active) return;

    setActionMessage("");

    try {
      await navigator.clipboard.writeText(menuUrl);
      setActionMessage("Table menu link copied.");
    } catch {
      setActionMessage(`Clipboard unavailable. Menu link: ${menuUrl}`);
    }
  }

  return (
    <article className="table-qr-card">
      <div className="table-qr-card-header">
        <div className="table-qr-icon">
          <QrCode size={20} />
        </div>

        <div className="table-qr-title">
          <h3>{table.table_number}</h3>
          <p>
            <Users size={13} />
            Capacity: {table.capacity}
          </p>
        </div>

        <span
          className={`table-qr-active ${
            table.is_active ? "" : "table-qr-inactive"
          }`}
        >
          <span />
          {table.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="table-qr-image-frame">
        {qrError ? (
          <p className="table-qr-error">{qrError}</p>
        ) : qrImage ? (
          <img
            src={qrImage}
            alt={`QR code for ${restaurant.name}, ${table.table_number}`}
          />
        ) : (
          <LoaderCircle className="table-qr-spinner" size={28} />
        )}
      </div>

      {!table.is_active && (
        <div className="table-qr-inactive-note">
          This table is inactive. Its QR will not validate until the table is
          activated again.
        </div>
      )}

      <div className="table-qr-card-actions">
        <button
          type="button"
          className="table-qr-primary"
          onClick={downloadQR}
          disabled={!qrImage || !table.is_active}
        >
          <Download size={15} />
          Download PNG
        </button>

        <button
          type="button"
          className="table-qr-secondary"
          onClick={copyLink}
          disabled={!table.is_active}
        >
          <Copy size={15} />
          Copy link
        </button>

        <button
          type="button"
          className="table-qr-secondary table-qr-toggle"
          onClick={() => onToggleActive(table)}
          disabled={updating}
        >
          {updating ? (
            <LoaderCircle size={15} className="table-qr-spinner" />
          ) : (
            <CheckCircle2 size={15} />
          )}

          {updating
            ? "Updating..."
            : table.is_active
              ? "Deactivate table"
              : "Activate table"}
        </button>
      </div>

      {actionMessage && (
        <p className="table-qr-card-message" role="status">
          {actionMessage}
        </p>
      )}

      <p className="table-qr-card-note">
        {table.is_active
          ? "Scan to open the restaurant menu for this table."
          : "Activate this table before downloading or sharing its QR."}
      </p>
    </article>
  );
}

export default function TableQRStudio() {
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [tables, setTables] = useState([]);

  const [tableNumber, setTableNumber] = useState("");
  const [capacity, setCapacity] = useState("4");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTableId, setUpdatingTableId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTables() {
      setLoading(true);
      setError("");

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

        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug, is_published")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (restaurantError) throw restaurantError;

        if (!restaurantData) {
          if (active) {
            setError("No restaurant found. Complete restaurant setup first.");
          }
          return;
        }

        const { data: tableData, error: tableError } = await supabase
          .from("restaurant_tables")
          .select(
            "id, restaurant_id, table_number, capacity, qr_token, is_active, created_at",
          )
          .eq("restaurant_id", restaurantData.id)
          .order("created_at", { ascending: true });

        if (tableError) throw tableError;

        if (!active) return;

        setRestaurant(restaurantData);
        setTables(tableData || []);
      } catch (err) {
        if (active) {
          setError(
            typeof err?.message === "string"
              ? err.message
              : "Could not load your restaurant tables.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTables();

    return () => {
      active = false;
    };
  }, [navigate]);

  async function addTable(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!restaurant || saving) return;

    const number = tableNumber.trim();
    const seats = Number(capacity);

    if (!number) {
      setError("Enter a table name or number.");
      return;
    }

    if (!Number.isInteger(seats) || seats < 1 || seats > 100) {
      setError("Capacity must be a whole number between 1 and 100.");
      return;
    }

    const duplicate = tables.some(
      (table) =>
        table.table_number.trim().toLowerCase() === number.toLowerCase(),
    );

    if (duplicate) {
      setError(
        "This table name already exists. Use a different name or number.",
      );
      return;
    }

    if (!window.crypto?.randomUUID) {
      setError("Secure QR token generation is unavailable in this browser.");
      return;
    }

    setSaving(true);

    try {
      const { data, error: insertError } = await supabase
        .from("restaurant_tables")
        .insert({
          restaurant_id: restaurant.id,
          table_number: number,
          capacity: seats,
          qr_token: window.crypto.randomUUID(),
          is_active: true,
        })
        .select(
          "id, restaurant_id, table_number, capacity, qr_token, is_active, created_at",
        )
        .single();

      if (insertError) throw insertError;

      setTables((current) =>
        [...current, data].sort(
          (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
        ),
      );

      setTableNumber("");
      setCapacity("4");
      setNotice(`QR code created for ${number}.`);
    } catch (err) {
      setError(
        typeof err?.message === "string"
          ? err.message
          : "Unable to save this table.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleTableActive(table) {
    if (!restaurant || updatingTableId) return;

    if (
      table.is_active &&
      !window.confirm(
        `Deactivate ${table.table_number}? Its table QR will no longer validate.`,
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setUpdatingTableId(table.id);

    try {
      const nextActive = !table.is_active;

      const { data, error: updateError } = await supabase
        .from("restaurant_tables")
        .update({ is_active: nextActive })
        .eq("id", table.id)
        .eq("restaurant_id", restaurant.id)
        .select(
          "id, restaurant_id, table_number, capacity, qr_token, is_active, created_at",
        )
        .single();

      if (updateError) throw updateError;

      setTables((current) =>
        current.map((entry) => (entry.id === data.id ? data : entry)),
      );

      setNotice(
        nextActive
          ? `${table.table_number} is active again. Its existing QR will work again.`
          : `${table.table_number} is inactive. Its existing QR will no longer validate.`,
      );
    } catch (err) {
      setError(
        typeof err?.message === "string"
          ? err.message
          : "Could not update the table.",
      );
    } finally {
      setUpdatingTableId("");
    }
  }

  if (loading) {
    return (
      <main className="table-qr-state">
        <LoaderCircle className="table-qr-spinner" size={30} />
        <p>Loading your tables...</p>
      </main>
    );
  }

  return (
    <main className="table-qr-page">
      <header className="table-qr-header">
        <Link to="/dashboard" className="table-qr-back">
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <Link to="/dashboard/qr" className="table-qr-header-link">
          Restaurant QR Studio
        </Link>
      </header>

      <div className="table-qr-container">
        <div className="table-qr-heading">
          <span className="table-qr-eyebrow">RESTAURANT WORKSPACE</span>

          <h1>Table QR Codes</h1>

          <p>
            Create a separate QR code for every table at{" "}
            <strong>{restaurant?.name || "your restaurant"}</strong>.
          </p>
        </div>

        {error && (
          <div className="table-qr-alert table-qr-alert-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="table-qr-alert table-qr-alert-success" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}

        {restaurant && (
          <>
            {!restaurant.is_published && (
              <div className="table-qr-notice">
                Your restaurant menu is not published yet. You can prepare table
                QR codes now, but publish the menu before sharing them with
                customers. <Link to="/dashboard">Go to dashboard</Link>
              </div>
            )}

            {["localhost", "127.0.0.1"].includes(window.location.hostname) && (
              <div className="table-qr-notice table-qr-notice-warning">
                These codes currently use a localhost URL. After deploying,
                generate new QR codes from your public domain before printing.
              </div>
            )}

            <section className="table-qr-create-panel">
              <div className="table-qr-create-icon">
                <Plus size={22} />
              </div>

              <div className="table-qr-create-heading">
                <h2>Add a restaurant table</h2>
                <p>Every saved table gets its own unique QR token.</p>
              </div>

              <form className="table-qr-create-form" onSubmit={addTable}>
                <label className="table-qr-field">
                  <span>Table name or number</span>
                  <input
                    value={tableNumber}
                    onChange={(event) => setTableNumber(event.target.value)}
                    placeholder="e.g. Table 1, Window 2"
                    maxLength={60}
                    required
                  />
                </label>

                <label className="table-qr-field table-qr-capacity-field">
                  <span>Seating capacity</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                    required
                  />
                </label>

                <button
                  className="table-qr-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? (
                    <LoaderCircle size={16} className="table-qr-spinner" />
                  ) : (
                    <Plus size={16} />
                  )}

                  {saving ? "Saving..." : "Create table QR"}
                </button>
              </form>
            </section>

            <section className="table-qr-list-section">
              <div className="table-qr-list-heading">
                <div>
                  <span className="table-qr-eyebrow">YOUR RESTAURANT</span>
                  <h2>Saved tables</h2>
                </div>

                <span className="table-qr-count">
                  {tables.length} {tables.length === 1 ? "table" : "tables"}
                </span>
              </div>

              {tables.length > 0 ? (
                <div className="table-qr-grid">
                  {tables.map((table) => (
                    <TableQRCard
                      key={table.id}
                      restaurant={restaurant}
                      table={table}
                      onToggleActive={toggleTableActive}
                      updating={updatingTableId === table.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="table-qr-empty">
                  <QrCode size={34} />
                  <h3>No tables added yet</h3>
                  <p>
                    Create your first table above to generate its unique menu QR
                    code.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
