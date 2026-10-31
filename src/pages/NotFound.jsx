import { Link } from "react-router-dom";
import "./NotFound.css";

export default function NotFound() {
  return (
    <main className="kh-not-found">
      <div className="kh-not-found-card">
        <span className="kh-not-found-code">404</span>
        <p className="kh-not-found-eyebrow">THIS PAGE IS OFF THE MENU</p>
        <h1>We couldn’t find that page.</h1>
        <p>The link may be outdated or the page may have moved. Head back to Khaavio and continue from there.</p>
        <div className="kh-not-found-actions">
          <Link to="/" className="kh-not-found-primary">Back to Khaavio</Link>
          <Link to="/contact" className="kh-not-found-secondary">Contact support</Link>
        </div>
      </div>
    </main>
  );
}
