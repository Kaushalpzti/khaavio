import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ChefHat,
  ChevronDown,
  CreditCard,
  Gift,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Menu,
  QrCode,
  ReceiptText,
  Smartphone,
  Sparkles,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  X,
  Zap,
} from "lucide-react";
import khaavioIcon from "../assets/icon.png";
import "./Home.css";

const CONTACT_EMAIL = "khaavioqr@gmail.com";

const featureCards = [
  {
    number: "01",
    label: "MENU + QR STUDIO",
    title: "One workspace for your digital menu.",
    description:
      "Manage menu categories, dishes, photos, prices and availability, then create branded restaurant and table QR codes.",
    icon: UtensilsCrossed,
    tint: "sage",
  },
  {
    number: "02",
    label: "QR ORDERING + TRACKING",
    title: "From scan to order, smoothly.",
    description:
      "Guests scan a table QR code, browse the menu in their phone browser, place an order and follow its status without downloading an app.",
    icon: QrCode,
    tint: "orange",
  },
  {
    number: "03",
    label: "BOOKINGS",
    title: "Keep booking requests organised.",
    description:
      "Receive and manage table booking requests, with advanced calendar, search, date filters and CSV export on Growth.",
    icon: CalendarCheck,
    tint: "sage",
  },
  {
    number: "04",
    label: "ORDERS + INSIGHTS",
    title: "Keep the whole team in sync.",
    description:
      "Follow incoming orders, kitchen progress and everyday performance from the restaurant workspace.",
    icon: ChefHat,
    tint: "blue",
  },
  {
    number: "05",
    label: "TABLE-SIDE SERVICE",
    title: "Help reaches the right team.",
    description:
      "Guests can request a waiter, water, cutlery or the bill from the table, helping your team respond from one workspace.",
    icon: Zap,
    tint: "cream",
  },
  {
    number: "06",
    label: "TABLE SESSIONS + BILLING",
    title: "Billing that fits the table.",
    description:
      "Manage table sessions, final bills and printable invoices, including separate guest tabs and bills where enabled.",
    icon: ReceiptText,
    tint: "cream",
  },
  {
    number: "07",
    label: "LOYALTY + REWARDS",
    title: "Give regulars a reason to return.",
    description:
      "Growth adds digital loyalty stamps and rewards to support repeat visits without complicating the guest journey.",
    icon: Gift,
    tint: "rose",
  },
  {
    number: "08",
    label: "GUEST REVIEWS + FEEDBACK",
    title: "Make guest feedback useful.",
    description:
      "Use a Google Business review link on the public menu when configured. Growth adds private guest ratings, a feedback inbox and review follow-up tools.",
    icon: MessageCircle,
    tint: "sage",
  },
  {
    number: "09",
    label: "ASK KHAAVIO AI",
    title: "Get menu answers in your language.",
    description:
      "The Growth plan includes the Ask Khaavio AI menu assistant in English, Hindi and Hinglish, subject to usage limits.",
    icon: Sparkles,
    tint: "orange",
  },
];

const workflowSteps = [
  {
    number: "01",
    title: "Set up your restaurant",
    description: "Add your business details, opening hours and restaurant identity.",
    icon: Store,
  },
  {
    number: "02",
    title: "Build your digital menu",
    description: "Upload dishes, set prices and create restaurant or table QR codes.",
    icon: UtensilsCrossed,
  },
  {
    number: "03",
    title: "Let guests scan and order",
    description: "Customers open the menu in their browser—no app download required.",
    icon: Smartphone,
  },
  {
    number: "04",
    title: "Manage service from one place",
    description: "Follow orders, kitchen progress, booking requests and table-side help.",
    icon: LayoutDashboard,
  },
];

const plans = [
  {
    name: "Starter",
    monthly: "499",
    annual: "4,990",
    founding: "3,999",
    description: "Core digital ordering and table operations for independent food businesses.",
    popular: false,
    features: [
      "Digital menu and restaurant/table QR codes",
      "QR ordering, order tracking and receipts",
      "Orders workspace and Kitchen Display",
      "Basic table booking management",
      "Table-side service requests: waiter, water, cutlery and bill",
      "Table sessions, final bills and printable invoices",
      "Operational voice alerts for orders, kitchen and service requests",
      "Basic order analytics and availability controls",
      "Google Business review link on the public menu (when configured)",
    ],
  },
  {
    name: "Growth",
    monthly: "899",
    annual: "8,990",
    founding: "6,999",
    description: "More booking tools, insights and guest engagement for growing teams.",
    popular: true,
    features: [
      "Everything in Starter",
      "Advanced booking calendar, search and date filters",
      "Booking CSV export",
      "Enhanced analytics and menu performance insights",
      "Digital loyalty stamps and rewards",
      "Private guest ratings, feedback inbox and review follow-up tools",
      "Ask Khaavio AI menu assistant in English, Hindi and Hinglish (usage limits apply)",
      "Advanced voice alerts",
      "Priority support during the founding pilot",
    ],
  },
];

const faqs = [
  {
    question: "Who is Khaavio built for?",
    answer:
      "Khaavio is designed for independent cafés, restaurants, bakeries, dessert shops and cloud kitchens that want a smoother digital menu, ordering and table-service experience.",
  },
  {
    question: "Do customers need to download an app?",
    answer:
      "No. Guests can scan a table QR code or open the restaurant menu link in their phone browser to use the available customer features.",
  },
  {
    question: "Can I update menu items and prices myself?",
    answer:
      "Yes. Restaurant owners can manage menu categories, dishes, photos, prices and availability from their Khaavio workspace.",
  },
  {
    question: "Does Khaavio include a full POS and inventory system?",
    answer:
      "Khaavio focuses on digital menus, QR ordering, orders, kitchen workflows, bookings, guest tools and table-level billing. It is not positioned as a full replacement for inventory-heavy POS suites.",
  },
  {
    question: "How much does Khaavio cost?",
    answer:
      "Starter is ₹499/month or ₹4,990/year. Growth is ₹899/month or ₹8,990/year. Eligible first-ten founding restaurants can request a first-year annual offer. During the early-access pilot, plan activation is handled manually and online payment collection or automatic renewals are not enabled yet.",
  },
  {
    question: "Can I see Khaavio before I sign up?",
    answer:
      "Yes. Use the free demo request form on this page. Share your restaurant details and preferred time, and the Khaavio team can coordinate a walkthrough with you.",
  },
];

function InstagramBrandIcon({ size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Brand({ light = false }) {
  return (
    <Link to="/" className={`kh2-brand ${light ? "kh2-brand-light" : ""}`} aria-label="Khaavio homepage">
      <img src={khaavioIcon} alt="" width="40" height="40" />
      <span>Khaa<span>vio</span></span>
    </Link>
  );
}

function MailRequestForm({ variant = "demo" }) {
  const [status, setStatus] = useState("");
  const isDemo = variant === "demo";

  function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const subject = isDemo ? "Khaavio — Free Demo Request" : "Khaavio — Contact Enquiry";
    const rows = [
      `${isDemo ? "FREE DEMO REQUEST" : "CONTACT ENQUIRY"}`,
      "",
      `Name: ${data.get("name") || "Not provided"}`,
      `Phone: ${data.get("phone") || "Not provided"}`,
      `Business: ${data.get("business") || "Not provided"}`,
      `Business type: ${data.get("businessType") || "Not provided"}`,
      `City: ${data.get("city") || "Not provided"}`,
      `Email: ${data.get("email") || "Not provided"}`,
      ...(isDemo ? [`Preferred time: ${data.get("preferredTime") || "Flexible"}`] : []),
      ...(!isDemo ? [`Enquiry type: ${data.get("enquiryType") || "General enquiry"}`, `Message: ${data.get("message") || "Not provided"}`] : []),
      "",
      "Sent from the Khaavio website.",
    ];
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(rows.join("\n"))}`;
    setStatus("Your email app should open with the request prepared. Send that email to complete your enquiry.");
    window.location.href = mailto;
  }

  return (
    <form className={`kh2-lead-form ${isDemo ? "kh2-demo-form" : "kh2-contact-form"}`} onSubmit={submitRequest}>
      <div className="kh2-form-grid">
        <label>
          <span>Full name <b>*</b></span>
          <input name="name" autoComplete="name" placeholder="Your name" required />
        </label>
        <label>
          <span>Phone number <b>*</b></span>
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" pattern="[+0-9() .-]{8,20}" title="Enter a valid phone number" required />
        </label>
        <label className="kh2-field-full">
          <span>Restaurant / café name <b>*</b></span>
          <input name="business" placeholder="Your business name" autoComplete="organization" required />
        </label>
        <label>
          <span>Business type <b>*</b></span>
          <select name="businessType" defaultValue="" required>
            <option value="" disabled>Select type</option>
            <option>Café</option>
            <option>Restaurant</option>
            <option>Bakery / dessert shop</option>
            <option>Cloud kitchen</option>
            <option>Other food business</option>
          </select>
        </label>
        <label>
          <span>City <b>*</b></span>
          <input name="city" placeholder="e.g. Patna" autoComplete="address-level2" required />
        </label>
        <label className="kh2-field-full">
          <span>Business email</span>
          <input name="email" type="email" autoComplete="email" placeholder="you@yourrestaurant.com" />
        </label>
        {isDemo && (
          <label className="kh2-field-full">
            <span>Preferred demo time</span>
            <select name="preferredTime" defaultValue="Flexible — please contact me">
              <option>Flexible — please contact me</option>
              <option>Morning (10 AM–12 PM IST)</option>
              <option>Afternoon (12 PM–4 PM IST)</option>
              <option>Evening (4 PM–7 PM IST)</option>
            </select>
          </label>
        )}
        {!isDemo && (
          <>
            <label className="kh2-field-full">
              <span>What is your enquiry about? <b>*</b></span>
              <select name="enquiryType" defaultValue="General enquiry" required>
                <option>General enquiry</option>
                <option>Product demo</option>
                <option>Plans and pricing</option>
                <option>Technical support</option>
                <option>Account or billing</option>
                <option>Partnership</option>
              </select>
            </label>
            <label className="kh2-field-full">
              <span>Message <b>*</b></span>
              <textarea name="message" rows="4" placeholder="Tell us how we can help..." required />
            </label>
          </>
        )}
      </div>
      <button className="kh2-button kh2-button-primary kh2-form-submit" type="submit">
        {isDemo ? "Request my free demo" : "Prepare enquiry email"}
        <ArrowUpRight size={18} />
      </button>
      <p className="kh2-form-note">
        <Mail size={14} /> This opens your email app with your details prepared. You will need to send the email to submit the request.
      </p>
      {status && <p className="kh2-form-status" role="status">{status}</p>}
      <p className="kh2-privacy-note">By submitting, you agree that Khaavio may contact you about this enquiry. Please do not include sensitive personal information.</p>
    </form>
  );
}

function ProductShowcase() {
  return (
    <div className="kh2-showcase" aria-label="Khaavio restaurant dashboard preview">
      <div className="kh2-showcase-glow" aria-hidden="true" />
      <div className="kh2-showcase-orbit kh2-showcase-orbit-one" aria-hidden="true" />
      <div className="kh2-showcase-orbit kh2-showcase-orbit-two" aria-hidden="true" />
      <div className="kh2-laptop-wrap">
        <div className="kh2-laptop">
          <div className="kh2-laptop-bezel">
            <span className="kh2-laptop-camera" aria-hidden="true" />
            <div className="kh2-laptop-screen">
              <img src="/images/khaavio-dashboard-desktop.png" alt="Restaurant dashboard showing Khaavio workspace, order tools and restaurant settings" />
              <span className="kh2-screen-caption">Restaurant workspace preview</span>
            </div>
          </div>
          <div className="kh2-laptop-chin"><span>KHAAVIO</span></div>
          <div className="kh2-laptop-base" aria-hidden="true" />
        </div>
      </div>
      <div className="kh2-phone-wrap">
        <div className="kh2-phone">
          <div className="kh2-phone-screen">
            <img src="/images/khaavio-dashboard-mobile.jpg" alt="Mobile view of Khaavio restaurant workspace tools" />
          </div>
          <span className="kh2-phone-side-button" aria-hidden="true" />
        </div>
      </div>
      <div className="kh2-float-card kh2-float-card-top">
        <span className="kh2-float-icon"><QrCode size={18} /></span>
        <span><strong>One scan away</strong><small>Your digital menu</small></span>
        <BadgeCheck size={17} className="kh2-float-check" />
      </div>
      <div className="kh2-float-card kh2-float-card-bottom">
        <span className="kh2-live-dot" />
        <span><strong>One connected workspace</strong><small>Menu · Orders · Bookings</small></span>
      </div>
      <div className="kh2-showcase-caption"><span /><span>PRODUCT PREVIEW</span><span>Actual Khaavio workspace</span></div>
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(0);
  const [billing, setBilling] = useState("yearly");
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return undefined;
    const targetId = decodeURIComponent(location.hash.slice(1));
    const frame = requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash]);

  useEffect(() => {
    const elements = document.querySelectorAll(".kh-home .kh2-reveal");
    if (!elements.length) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <main className="kh-home" id="top">
      <div className="kh2-announcement">
        <span className="kh2-announcement-dot" />
        <span>7-DAY FREE TRIAL</span>
        <span className="kh2-announcement-separator">·</span>
        <span>No card required</span>
        <a href="#book-demo" onClick={closeMenu}>Book a free demo <ArrowUpRight size={13} /></a>
      </div>

      <header className="kh2-header">
        <div className="kh2-nav-wrap">
          <Brand />
          <button className="kh2-mobile-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav className={`kh2-nav ${menuOpen ? "kh2-nav-open" : ""}`} aria-label="Main navigation">
            <a href="#platform" onClick={closeMenu}>Platform</a>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#pricing" onClick={closeMenu}>Pricing</a>
            <Link to="/contact" onClick={closeMenu}>Contact</Link>
            <div className="kh2-mobile-nav-buttons">
              <Link to="/login" className="kh2-nav-login" onClick={closeMenu}>Sign in</Link>
              <a href="#book-demo" className="kh2-button kh2-button-primary" onClick={closeMenu}>Book a demo <ArrowUpRight size={16} /></a>
            </div>
          </nav>
          <div className="kh2-nav-actions">
            <Link to="/login" className="kh2-nav-login">Sign in</Link>
            <a href="#book-demo" className="kh2-button kh2-button-primary">Book a free demo <ArrowUpRight size={16} /></a>
          </div>
        </div>
      </header>

      <section className="kh2-hero">
        <div className="kh2-hero-grid">
          <div className="kh2-hero-copy kh2-reveal">
            <div className="kh2-eyebrow"><span className="kh2-eyebrow-line" /> BUILT FOR CAFÉS & RESTAURANTS</div>
            <h1>Better service.<br /><em>Simpler tables.</em></h1>
            <p className="kh2-hero-description">A beautiful digital menu, QR ordering, kitchen workflows and table bookings—connected in one easy restaurant workspace.</p>
            <div className="kh2-hero-actions">
              <a href="#book-demo" className="kh2-button kh2-button-primary kh2-button-large">Book a free demo <ArrowUpRight size={18} /></a>
              <Link to="/signup" className="kh2-button kh2-button-light kh2-button-large">Start 7-day free trial <ArrowRight size={17} /></Link>
            </div>
            <div className="kh2-trust-row">
              <span className="kh2-trust-icon"><Check size={16} /></span>
              <span><strong>No app for guests.</strong><small>Scan, browse and order in the phone browser.</small></span>
            </div>
            <div className="kh2-hero-tags">
              <span><Check size={14} /> Branded menu + QR</span>
              <span><Check size={14} /> Orders + kitchen</span>
              <span><Check size={14} /> Bookings + billing</span>
            </div>
          </div>
          <div className="kh2-hero-visual kh2-reveal"><ProductShowcase /></div>
        </div>
        <div className="kh2-hero-bottom">
          <span>THE DIGITAL SIDE OF HOSPITALITY</span><span className="kh2-hero-bottom-rule" />
          <span className="kh2-hero-bottom-list">MENU <i /> QR <i /> ORDERS <i /> BOOKINGS <i /> GUESTS</span>
        </div>
      </section>

      <section className="kh2-logo-strip" aria-label="Khaavio capabilities">
        <div className="kh2-logo-strip-inner">
          <span><QrCode size={18} /> QR-FIRST ORDERING</span>
          <span><LayoutDashboard size={18} /> ONE WORKSPACE</span>
          <span><ChefHat size={18} /> KITCHEN VISIBILITY</span>
          <span><CreditCard size={18} /> TABLE BILLING</span>
          <span><CalendarCheck size={18} /> BOOKINGS</span>
        </div>
      </section>

      <section className="kh2-intro kh2-section" id="platform">
        <div className="kh2-container kh2-intro-grid kh2-reveal">
          <div><div className="kh2-section-kicker">MEET KHAAVIO <span /></div><h2>Less juggling tools.<br /><em>More welcoming people.</em></h2></div>
          <div className="kh2-intro-copy"><p>Running a restaurant is about food and people—not chasing updates across different tools. Khaavio brings the digital guest journey and everyday table operations into one focused workspace.</p><a className="kh2-text-link" href="#how-it-works">See the workflow <ArrowRight size={16} /></a></div>
        </div>
      </section>

      <section className="kh2-features kh2-section" id="features">
        <div className="kh2-container">
          <div className="kh2-section-heading kh2-reveal">
            <div><div className="kh2-section-kicker">MADE FOR EVERYDAY SERVICE <span /></div><h2>Every table has a story.<br /><em>Make it run smoother.</em></h2></div>
            <p>From the first scan to the final bill, give guests and staff a clearer digital experience without making the restaurant feel complicated.</p>
          </div>
          <div className="kh2-feature-grid">
            {featureCards.map(({ number, label, title, description, icon: Icon, tint }) => (
              <article className={`kh2-feature-card kh2-reveal kh2-tint-${tint}`} key={number}>
                <div className="kh2-feature-top"><span className="kh2-feature-icon"><Icon size={23} strokeWidth={1.8} /></span><span>{number}</span></div>
                <span className="kh2-feature-label">{label}</span><h3>{title}</h3><p>{description}</p>
                <a href="#book-demo" className="kh2-feature-link" aria-label={`Ask for a demo of ${label}`}><ArrowUpRight size={18} /></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kh2-workflow kh2-section" id="how-it-works">
        <div className="kh2-container kh2-workflow-grid">
          <div className="kh2-workflow-copy kh2-reveal">
            <div className="kh2-section-kicker">HOW KHAAVIO WORKS <span /></div>
            <h2>From first scan<br />to <em>better service.</em></h2>
            <p>Bring your menu, table orders and service touchpoints into one practical flow. Your guests use their phones; your team stays in control.</p>
            <a href="#book-demo" className="kh2-button kh2-button-primary">See it in a free demo <ArrowUpRight size={17} /></a>
            <div className="kh2-workflow-note"><Zap size={16} /><span><strong>Designed for quick onboarding</strong><small>Set up your menu, create QR codes and test your guest journey.</small></span></div>
          </div>
          <div className="kh2-steps">
            {workflowSteps.map(({ number, title, description, icon: Icon }, index) => (
              <article className="kh2-step kh2-reveal" key={number}>
                <div className="kh2-step-number">{number}</div><div className="kh2-step-icon"><Icon size={22} /></div>
                <div className="kh2-step-content"><h3>{title}</h3><p>{description}</p></div><ArrowDownRight className="kh2-step-arrow" size={20} />
                {index < workflowSteps.length - 1 && <span className="kh2-step-connector" aria-hidden="true" />}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kh2-product-band">
        <div className="kh2-container kh2-product-band-inner kh2-reveal">
          <div className="kh2-product-band-copy"><span className="kh2-product-band-kicker"><Sparkles size={15} /> ONE CONNECTED EXPERIENCE</span><h2>Made for your restaurant.<br /><em>Easy for your guests.</em></h2><p>Guests see your menu and brand. Your team gets a workspace to manage the digital side of service.</p><a href="#book-demo" className="kh2-button kh2-button-cream">Walk me through it <ArrowRight size={17} /></a></div>
          <div className="kh2-product-points">
            <div><span><Smartphone size={21} /></span><div><strong>Guest-friendly</strong><small>Browser-based menu and ordering flow</small></div><Check size={17} /></div>
            <div><span><LayoutDashboard size={21} /></span><div><strong>Team-ready</strong><small>Menu, orders, bookings and table tools</small></div><Check size={17} /></div>
            <div><span><ShieldCheck size={21} /></span><div><strong>Restaurant-controlled</strong><small>Manage your menu and availability</small></div><Check size={17} /></div>
          </div>
        </div>
      </section>

      <section className="kh2-pricing kh2-section" id="pricing">
        <div className="kh2-container">
          <div className="kh2-pricing-heading kh2-reveal"><div className="kh2-section-kicker kh2-kicker-center">STRAIGHTFORWARD PLANS <span /></div><h2>Start simple.<br /><em>Grow when you're ready.</em></h2><p>Explore Khaavio with a 7-day free trial, then choose the plan that fits your restaurant.</p></div>
          <div className="kh2-trial-banner kh2-reveal"><span><Sparkles size={19} /></span><div><strong>Try Khaavio free for 7 days.</strong><small>No card required. Early-access subscriptions are activated manually.</small></div><a href="#book-demo">Questions? Book a demo <ArrowRight size={15} /></a></div>
          <div className="kh2-billing-switch" role="group" aria-label="Billing frequency"><button type="button" className={billing === "monthly" ? "is-active" : ""} aria-pressed={billing === "monthly"} onClick={() => setBilling("monthly")}>Monthly</button><button type="button" className={billing === "yearly" ? "is-active" : ""} aria-pressed={billing === "yearly"} onClick={() => setBilling("yearly")}>Yearly <span>Save with annual billing</span></button></div>
          <div className="kh2-pricing-grid">
            {plans.map((plan) => (
              <article className={`kh2-price-card kh2-reveal ${plan.popular ? "kh2-price-card-popular" : ""}`} key={plan.name}>
                {plan.popular && <span className="kh2-popular-pill"><Sparkles size={13} /> MOST VERSATILE</span>}
                <div className="kh2-plan-top"><span className="kh2-plan-icon"><Store size={20} /></span><span className="kh2-plan-audience">FOR {plan.name === "Starter" ? "ESSENTIALS" : "GROWING TEAMS"}</span></div>
                <h3>{plan.name}</h3><p className="kh2-plan-description">{plan.description}</p>
                <div className="kh2-plan-price"><span>₹</span>{billing === "monthly" ? plan.monthly : plan.annual}<small>/ {billing === "monthly" ? "month" : "year"}</small></div>
                {billing === "yearly" ? <div className="kh2-founding-offer"><small>FOUNDING OFFER · FIRST 10 RESTAURANTS</small><strong>₹{plan.founding} for year one</strong><span>Regular annual price ₹{plan.annual}</span></div> : <div className="kh2-monthly-note">7-day free trial included</div>}
                <Link to="/signup" className={`kh2-button ${plan.popular ? "kh2-button-primary" : "kh2-button-outline"} kh2-plan-cta`}>Start 7-day free trial <ArrowRight size={16} /></Link>
                <div className="kh2-plan-divider" /><span className="kh2-includes-label">INCLUDES</span><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
              </article>
            ))}
          </div>
          <p className="kh2-pricing-disclaimer">During the early-access pilot, subscriptions are activated manually. Online payment collection and automatic renewals are not enabled yet. Founding prices apply to eligible first-ten restaurants for year one; renewal is at the then-current published annual price.</p>
        </div>
      </section>

      <section className="kh2-demo kh2-section" id="book-demo">
        <div className="kh2-container kh2-demo-grid">
          <div className="kh2-demo-copy kh2-reveal">
            <div className="kh2-section-kicker kh2-kicker-light">LET'S TALK ABOUT YOUR RESTAURANT <span /></div>
            <h2>See how Khaavio<br /><em>could fit your service.</em></h2>
            <p>Tell us a little about your business. Request a free walkthrough of QR menus, table ordering, kitchen workflows and the restaurant workspace.</p>
            <div className="kh2-demo-benefits"><div><span><Check size={17} /></span><p><strong>Personalised walkthrough</strong><small>Explore the areas most relevant to your restaurant.</small></p></div><div><span><Check size={17} /></span><p><strong>Ask your real questions</strong><small>Talk through setup, plans and the guest experience.</small></p></div><div><span><Check size={17} /></span><p><strong>No card needed for the trial</strong><small>See the workflow before making a decision.</small></p></div></div>
            <div className="kh2-demo-direct"><Mail size={18} /><span><small>Prefer email?</small><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></span></div>
          </div>
          <div className="kh2-demo-panel kh2-reveal"><div className="kh2-demo-panel-heading"><span className="kh2-demo-panel-icon"><CalendarCheck size={22} /></span><div><h3>Book a free demo</h3><p>Share your details and preferred time.</p></div></div><MailRequestForm variant="demo" /></div>
        </div>
      </section>

      <section className="kh2-faq kh2-section" id="faq">
        <div className="kh2-container kh2-faq-grid">
          <div className="kh2-faq-intro kh2-reveal"><div className="kh2-section-kicker">GOOD TO KNOW <span /></div><h2>Questions before<br /><em>you get started?</em></h2><p>Here are a few useful details. Still unsure? Reach out and we'll help you work through it.</p><Link to="/contact" className="kh2-text-link">Contact Khaavio <ArrowUpRight size={16} /></Link></div>
          <div className="kh2-faq-list kh2-reveal">{faqs.map((faq, index) => { const open = activeFaq === index; return <article className={`kh2-faq-item ${open ? "is-open" : ""}`} key={faq.question}><button type="button" onClick={() => setActiveFaq(open ? -1 : index)} aria-expanded={open}><span>{faq.question}</span><ChevronDown size={18} /></button>{open && <p>{faq.answer}</p>}</article>; })}</div>
        </div>
      </section>

      <section className="kh2-bottom-cta"><div className="kh2-container kh2-bottom-cta-inner kh2-reveal"><span className="kh2-bottom-cta-mark"><Sparkles size={23} /></span><div><span className="kh2-section-kicker kh2-kicker-light">YOUR RESTAURANT, YOUR WAY <span /></span><h2>Make the digital side<br /><em>of service feel simpler.</em></h2><p>Explore the workflow, ask questions and find out whether Khaavio fits your restaurant.</p></div><div className="kh2-bottom-cta-actions"><a href="#book-demo" className="kh2-button kh2-button-cream">Book a free demo <ArrowUpRight size={17} /></a><Link to="/signup" className="kh2-button kh2-button-ghost">Start free trial</Link></div></div></section>

      <footer className="kh2-footer">
        <div className="kh2-container">
          <div className="kh2-footer-grid">
            <div className="kh2-footer-brand">
              <Brand light />
              <p>Digital menus, QR ordering and thoughtful table operations for independent food businesses.</p>
              <a className="kh2-footer-email" href={`mailto:${CONTACT_EMAIL}`}><Mail size={16} />{CONTACT_EMAIL}</a>
              <div className="kh2-footer-social" aria-label="Khaavio social and contact links">
                <span>FOLLOW KHAAVIO</span>
                <div className="kh2-social-icons">
                  <a href="https://www.instagram.com/khaavio/" target="_blank" rel="noopener noreferrer" aria-label="Khaavio on Instagram" title="Instagram"><InstagramBrandIcon size={18} /></a>
                  <a href="https://wa.me/917324883263" target="_blank" rel="noopener noreferrer" aria-label="Contact Khaavio on WhatsApp" title="WhatsApp"><MessageCircle size={18} strokeWidth={1.8} /></a>
                </div>
              </div>
            </div>
            <div className="kh2-footer-column"><strong>EXPLORE</strong><a href="#platform">Platform</a><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQs</a></div>
            <div className="kh2-footer-column"><strong>GET STARTED</strong><a href="#book-demo">Book a free demo</a><Link to="/signup">Create account</Link><Link to="/login">Sign in</Link><Link to="/contact">Contact us</Link><Link to="/about">About Khaavio</Link></div>
            <div className="kh2-footer-column"><strong>LEGAL</strong><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms &amp; Conditions</Link><Link to="/refund-policy">Cancellation &amp; Refund</Link></div>
          </div>
          <div className="kh2-footer-bottom"><span>© {new Date().getFullYear()} Khaavio. All rights reserved.</span><span>Every Table, Digitally Connected.</span><a href="#top">Back to top ↑</a></div>
        </div>
      </footer>
    </main>
  );
}
