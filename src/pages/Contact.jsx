import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { markLeadConfirmed } from "../lib/analytics";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Mail,
  Menu,
  MessageSquareText,
  ShieldCheck,
  X,
} from "lucide-react";
import khaavioIcon from "../assets/icon.png";
import "./Home.css";
import "./Contact.css";

const CONTACT_EMAIL = "khaavioqr@gmail.com";

function ContactBrand() {
  return (
    <Link to="/" className="kh2-brand" aria-label="Khaavio homepage">
      <img src={khaavioIcon} alt="" width="40" height="40" />
      <span>Khaa<span>vio</span></span>
    </Link>
  );
}

export default function Contact() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState("");

  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  async function submitContact(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "contact",
          name: data.get("name"),
          phone: data.get("phone"),
          business: data.get("business"),
          businessType: data.get("businessType"),
          city: data.get("city"),
          email: data.get("email"),
          enquiryType: data.get("enquiryType"),
          message: data.get("message"),
          website: data.get("website"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || "We couldn't receive your enquiry. Please try again.");
      }
      markLeadConfirmed("contact");
      navigate("/thank-you?type=contact");
    } catch (error) {
      setStatus(error?.message || "We couldn't receive your enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="khc-page">
      <div className="khc-topbar"><span /> KHAAVIO SUPPORT & ENQUIRIES <span className="khc-topbar-divider">·</span> WE'D LOVE TO HEAR FROM YOU</div>
      <header className="kh2-header khc-header">
        <div className="kh2-nav-wrap">
          <ContactBrand />
          <button className="kh2-mobile-toggle" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav className={`kh2-nav ${menuOpen ? "kh2-nav-open" : ""}`} aria-label="Main navigation">
            <Link to="/#platform" onClick={() => setMenuOpen(false)}>Platform</Link>
            <Link to="/#how-it-works" onClick={() => setMenuOpen(false)}>How it works</Link>
            <Link to="/#pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
            <Link to="/contact" aria-current="page" onClick={() => setMenuOpen(false)}>Contact</Link>
            <div className="kh2-mobile-nav-buttons">
              <Link to="/login" className="kh2-nav-login" onClick={() => setMenuOpen(false)}>Sign in</Link>
              <Link to="/#book-demo" className="kh2-button kh2-button-primary" onClick={() => setMenuOpen(false)}>Book a demo <ArrowUpRight size={16} /></Link>
            </div>
          </nav>
          <div className="kh2-nav-actions">
            <Link to="/login" className="kh2-nav-login">Sign in</Link>
            <Link to="/#book-demo" className="kh2-button kh2-button-primary">Book a free demo <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </header>

      <section className="khc-hero">
        <div className="kh2-container khc-hero-grid">
          <div className="khc-hero-copy">
            <Link to="/" className="khc-back-link"><ArrowLeft size={15} /> Back to Khaavio</Link>
            <div className="khc-eyebrow"><span /> CONTACT KHAAVIO</div>
            <h1>Let's start a<br /><em>conversation.</em></h1>
            <p>Want to see Khaavio in action, ask about plans, or get help with your account? Send us a message and tell us a little about what you need.</p>
            <div className="khc-contact-cards">
              <a className="khc-contact-card" href={`mailto:${CONTACT_EMAIL}`}>
                <span><Mail size={21} /></span><div><small>EMAIL US</small><strong>{CONTACT_EMAIL}</strong><em>Open your email app <ArrowUpRight size={13} /></em></div>
              </a>
              <Link to="/#book-demo" className="khc-contact-card">
                <span><MessageSquareText size={21} /></span><div><small>PRODUCT DEMO</small><strong>See the workflow</strong><em>Request a walkthrough <ArrowRight size={13} /></em></div>
              </Link>
            </div>
            <div className="khc-contact-note"><ShieldCheck size={18} /><p><strong>Your details stay relevant to your enquiry.</strong><br />Please share only the information needed for us to respond.</p></div>
          </div>
          <div className="khc-form-wrap">
            <div className="khc-form-heading"><span className="khc-form-mark"><Mail size={21} /></span><div><h2>Send us a message</h2><p>Fields marked * are required.</p></div></div>
            <form className="kh2-lead-form kh2-contact-form" onSubmit={submitContact}>
              <div className="kh2-form-grid">
                <label className="kh2-lead-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
                <label><span>Full name <b>*</b></span><input name="name" autoComplete="name" placeholder="Your name" required /></label>
                <label><span>Phone number <b>*</b></span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" pattern="[+0-9() .-]{8,20}" title="Enter a valid phone number" required /></label>
                <label className="kh2-field-full"><span>Restaurant / business name <b>*</b></span><input name="business" autoComplete="organization" placeholder="Your business name" required /></label>
                <label><span>Business type <b>*</b></span><select name="businessType" defaultValue="" required><option value="" disabled>Select type</option><option>Café</option><option>Restaurant</option><option>Bakery / dessert shop</option><option>Cloud kitchen</option><option>Other food business</option></select></label>
                <label><span>City <b>*</b></span><input name="city" autoComplete="address-level2" placeholder="e.g. Patna" required /></label>
                <label className="kh2-field-full"><span>Business email</span><input name="email" type="email" autoComplete="email" placeholder="you@yourrestaurant.com" /></label>
                <label className="kh2-field-full"><span>Enquiry type <b>*</b></span><select name="enquiryType" defaultValue="General enquiry" required><option>General enquiry</option><option>Product demo</option><option>Plans and pricing</option><option>Technical support</option><option>Account or billing</option><option>Partnership</option></select></label>
                <label className="kh2-field-full"><span>How can we help? <b>*</b></span><textarea name="message" rows="4" placeholder="Tell us a little about your question..." required /></label>
              </div>
              <button className="kh2-button kh2-button-primary kh2-form-submit" type="submit" disabled={submitting}>{submitting ? "Sending enquiry…" : "Send enquiry"} <ArrowUpRight size={17} /></button>
              <p className="kh2-form-note"><Mail size={14} /> Your enquiry is sent securely to Khaavio. We will respond using the contact details you provide.</p>
              {status && <p className="kh2-form-status" role="alert">{status}</p>}
              <p className="kh2-privacy-note">Do not include passwords, payment card details or other sensitive information.</p>
            </form>
          </div>
        </div>
      </section>

      <section className="khc-bottom">
        <div className="kh2-container khc-bottom-inner"><div><span className="khc-eyebrow"><span /> WANT TO SEE THE PRODUCT?</span><h2>Let's walk through<br /><em>Khaavio together.</em></h2></div><Link to="/#book-demo" className="kh2-button kh2-button-primary">Request a free demo <ArrowUpRight size={17} /></Link></div>
      </section>

      <footer className="kh2-footer khc-footer">
        <div className="kh2-container"><div className="kh2-footer-grid">
          <div className="kh2-footer-brand"><ContactBrand /><p>Digital menus, QR ordering and thoughtful table operations for independent food businesses.</p><a href={`mailto:${CONTACT_EMAIL}`}><Mail size={16} />{CONTACT_EMAIL}</a></div>
          <div className="kh2-footer-column"><strong>EXPLORE</strong><Link to="/#platform">Platform</Link><Link to="/#features">Features</Link><Link to="/#how-it-works">How it works</Link><Link to="/#pricing">Pricing</Link></div>
          <div className="kh2-footer-column"><strong>GET STARTED</strong><Link to="/#book-demo">Book a free demo</Link><Link to="/signup">Create account</Link><Link to="/login">Sign in</Link><Link to="/about">About Khaavio</Link></div>
          <div className="kh2-footer-column"><strong>LEGAL</strong><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms &amp; Conditions</Link><Link to="/refund-policy">Cancellation &amp; Refund</Link></div>
        </div><div className="kh2-footer-bottom"><span>© {new Date().getFullYear()} Khaavio. All rights reserved.</span><span>Every Table, Digitally Connected.</span><Link to="/">Back to home ↑</Link></div></div>
      </footer>
    </main>
  );
}
