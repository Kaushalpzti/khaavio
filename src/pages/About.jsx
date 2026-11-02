import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChefHat,
  Mail,
  QrCode,
  ReceiptText,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";
import { Link } from "react-router-dom";
import khaavioIcon from "../assets/icon.png";
import { KHAAVIO_EMAILS } from "../lib/contactEmails.js";
import "./About.css";

const SUPPORT_EMAIL = KHAAVIO_EMAILS.support;

const pillars = [
  {
    icon: UtensilsCrossed,
    title: "A menu you can manage",
    description:
      "Keep dishes, prices, photos and availability together, then share your restaurant menu through a QR code or link.",
  },
  {
    icon: QrCode,
    title: "A smoother table journey",
    description:
      "Let guests browse from their phone, send order requests and follow order progress without installing an app.",
  },
  {
    icon: ChefHat,
    title: "One workspace for the team",
    description:
      "Give staff a clear place to manage incoming orders, kitchen progress, bookings and table-side service requests.",
  },
];

const steps = [
  {
    number: "01",
    title: "Set up your restaurant",
    description:
      "Add your menu, opening hours and restaurant details, then create the QR codes your guests will scan.",
  },
  {
    number: "02",
    title: "Connect the table",
    description:
      "Guests use the menu in their mobile browser to view dishes, place orders and access available table services.",
  },
  {
    number: "03",
    title: "Keep service moving",
    description:
      "Your team handles order progress, bookings and table billing in the Khaavio workspace—with combined or separate guest bills when configured.",
  },
];

export default function About() {
  return (
    <main className="kh-about" id="top">
      <header className="kh-about-header">
        <div className="kh-about-container kh-about-header-inner">
          <Link to="/" className="kh-about-brand" aria-label="Khaavio homepage">
            <img src={khaavioIcon} alt="" width="44" height="44" />
            <span>Khaa<span>vio</span></span>
          </Link>
          <nav className="kh-about-header-actions" aria-label="About page navigation">
            <Link to="/" className="kh-about-back">
              <ArrowLeft size={16} /> Home
            </Link>
            <Link to="/signup" className="kh-about-nav-cta">
              Get started <ArrowUpRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <section className="kh-about-hero">
        <div className="kh-about-container kh-about-hero-grid">
          <div className="kh-about-hero-copy">
            <span className="kh-about-eyebrow"><span /> THE THINKING BEHIND KHAAVIO</span>
            <h1>
              Better table service,
              <em> with less friction.</em>
            </h1>
            <p>
              Khaavio brings a restaurant’s digital touchpoints into one workspace—from the first menu scan to the final bill—so teams can spend less time switching between tools and more time looking after guests.
            </p>
            <div className="kh-about-actions">
              <Link to="/signup" className="kh-about-button kh-about-button-dark">
                Start your 7-day trial <ArrowRight size={17} />
              </Link>
              <Link to="/#features" className="kh-about-text-link">
                Explore the platform <ArrowUpRight size={16} />
              </Link>
            </div>
            <p className="kh-about-hero-note">
              Built for cafés, restaurants, bakeries, dessert shops and other food businesses.
            </p>
          </div>

          <div className="kh-about-hero-visual" aria-label="Khaavio product capabilities">
            <div className="kh-about-visual-top">
              <div className="kh-about-visual-mark"><img src={khaavioIcon} alt="" /></div>
              <div>
                <span>ONE CONNECTED WORKSPACE</span>
                <strong>From menu to management</strong>
              </div>
              <ShieldCheck size={22} />
            </div>
            <div className="kh-about-visual-list">
              <div><span><UtensilsCrossed size={18} /></span><div><strong>Digital menu</strong><small>Control dishes and prices</small></div><ArrowRight size={16} /></div>
              <div><span><QrCode size={18} /></span><div><strong>QR ordering</strong><small>Orders from the guest’s phone</small></div><ArrowRight size={16} /></div>
              <div><span><CalendarDays size={18} /></span><div><strong>Bookings & service</strong><small>Requests in the workspace</small></div><ArrowRight size={16} /></div>
              <div><span><ReceiptText size={18} /></span><div><strong>Table billing</strong><small>Combined or separate guest tabs</small></div><ArrowRight size={16} /></div>
            </div>
            <div className="kh-about-visual-foot"><span><span /> READY FOR YOUR RESTAURANT</span><small>Powered by Khaavio</small></div>
          </div>
        </div>
      </section>

      <section className="kh-about-section">
        <div className="kh-about-container">
          <div className="kh-about-section-heading">
            <span className="kh-about-eyebrow"><span /> WHAT WE’RE BUILDING</span>
            <h2>Useful technology should feel <em>easy to use.</em></h2>
            <p>
              Restaurants already have enough moving parts. Khaavio is designed to make everyday digital tasks easier to find, follow and manage—without asking guests to download another app.
            </p>
          </div>
          <div className="kh-about-pillar-grid">
            {pillars.map(({ icon: Icon, title, description }) => (
              <article className="kh-about-pillar" key={title}>
                <span className="kh-about-pillar-icon"><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kh-about-how">
        <div className="kh-about-container">
          <div className="kh-about-section-heading kh-about-how-heading">
            <span className="kh-about-eyebrow"><span /> HOW IT FITS TOGETHER</span>
            <h2>From first scan to <em>final bill.</em></h2>
          </div>
          <div className="kh-about-steps">
            {steps.map((step) => (
              <article className="kh-about-step" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kh-about-responsibility">
        <div className="kh-about-container kh-about-responsibility-inner">
          <div>
            <span className="kh-about-eyebrow"><span /> CLEAR ROLES, BETTER SERVICE</span>
            <h2>Technology from Khaavio. Hospitality from your team.</h2>
          </div>
          <p>
            Khaavio provides software for menus, ordering, bookings and restaurant operations. The restaurant remains responsible for its food, prices, availability, fulfilment and restaurant-side guest payments. Khaavio supports the digital workflow; it does not prepare or deliver food.
          </p>
        </div>
      </section>

      <section className="kh-about-cta">
        <div className="kh-about-container kh-about-cta-inner">
          <span className="kh-about-cta-icon"><ChefHat size={24} /></span>
          <span className="kh-about-eyebrow"><span /> YOUR RESTAURANT, YOUR WAY</span>
          <h2>Ready to make your tables <em>work smarter?</em></h2>
          <p>Explore the workspace with a 7-day trial. No card required.</p>
          <div className="kh-about-actions kh-about-actions-centered">
            <Link to="/signup" className="kh-about-button kh-about-button-light">Get started <ArrowRight size={17} /></Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="kh-about-contact-link"><Mail size={16} /> Talk to support</a>
          </div>
        </div>
      </section>

      <footer className="kh-about-footer">
        <div className="kh-about-container kh-about-footer-inner">
          <span>© {new Date().getFullYear()} Khaavio. Every Table, Digitally Connected.</span>
          <nav aria-label="Footer quick links">
            <Link to="/about" aria-current="page">About</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/refund-policy">Refund Policy</Link>
            <Link to="/">Home</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
