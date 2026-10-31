import { ArrowLeft, Home, SearchX } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import "./NotFound.css";

export default function NotFound() {
  const location = useLocation();

  return (
    <main className="kh-not-found-page">
      <div className="kh-not-found-orb kh-not-found-orb-one" aria-hidden="true" />
      <div className="kh-not-found-orb kh-not-found-orb-two" aria-hidden="true" />

      <section className="kh-not-found-card" aria-labelledby="kh-not-found-title">
        <Link className="kh-not-found-brand" to="/" aria-label="Khaavio home">
          <span className="kh-not-found-mark">K</span>
          <span>Khaa<span>vio</span></span>
        </Link>

        <div className="kh-not-found-illustration" aria-hidden="true">
          <span className="kh-not-found-number">4</span>
          <span className="kh-not-found-search"><SearchX size={54} strokeWidth={1.45} /></span>
          <span className="kh-not-found-number">4</span>
        </div>

        <p className="kh-not-found-eyebrow">ERROR 404 · PAGE NOT FOUND</p>
        <h1 id="kh-not-found-title">This page took a wrong turn.</h1>
        <p className="kh-not-found-description">
          The link may be outdated, or this page may no longer be available.
          Let's get you back to the right place.
        </p>
        <p className="kh-not-found-path" title={location.pathname}>{location.pathname}</p>

        <div className="kh-not-found-actions">
          <Link className="kh-not-found-primary" to="/">
            <Home size={17} /> Back to Khaavio
          </Link>
          <button className="kh-not-found-secondary" type="button" onClick={() => window.history.back()}>
            <ArrowLeft size={17} /> Go back
          </button>
        </div>

        <p className="kh-not-found-help">
          Need a hand? <a href="mailto:khaavioqr@gmail.com">Contact support</a>
        </p>
      </section>
    </main>
  );
}
