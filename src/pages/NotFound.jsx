import { ArrowLeft, Home, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: "32px 20px", background: "#f7f8f5", color: "#17231c" }}>
      <section style={{ width: "min(100%, 540px)", textAlign: "center", padding: "clamp(28px, 6vw, 52px)", border: "1px solid #e2e8df", borderRadius: 28, background: "#fff", boxShadow: "0 18px 60px rgba(25, 45, 30, .07)" }}>
        <div style={{ width: 64, height: 64, display: "grid", placeItems: "center", margin: "0 auto 18px", borderRadius: 20, background: "#edf4ed", color: "#3c7550" }}><SearchX size={30} aria-hidden="true" /></div>
        <p style={{ margin: 0, color: "#4f7c5b", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" }}>ERROR 404</p>
        <h1 style={{ margin: "12px 0", fontSize: "clamp(32px, 7vw, 48px)", letterSpacing: "-.05em" }}>This page wandered off.</h1>
        <p style={{ maxWidth: 380, margin: "0 auto", color: "#667369", lineHeight: 1.7 }}>The link may be outdated, or the page may no longer be available. Let’s get you back on track.</p>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 10, marginTop: 26 }}>
          <Link to="/" style={{ minHeight: 46, display: "inline-flex", alignItems: "center", gap: 9, padding: "0 17px", borderRadius: 13, background: "#245b3b", color: "#fff", textDecoration: "none", fontWeight: 750 }}><Home size={17} /> Back to Khaavio</Link>
          <Link to="/contact" style={{ minHeight: 46, display: "inline-flex", alignItems: "center", gap: 9, padding: "0 17px", borderRadius: 13, border: "1px solid #dce5da", color: "#34513e", textDecoration: "none", fontWeight: 750 }}><ArrowLeft size={16} /> Contact support</Link>
        </div>
      </section>
    </main>
  );
}
