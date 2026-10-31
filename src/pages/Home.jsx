import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { markLeadConfirmed } from "../lib/analytics";
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
const WHATSAPP_NUMBER = "917324883263";

const featureCards = [
  {
    number: "01",
    label: "MENU + QR STUDIO",
    title: "Your menu, beautifully organised.",
    description:
      "Manage categories, dishes, photos, prices and availability. Create branded restaurant and table QR codes for guests to scan.",
    icon: UtensilsCrossed,
    tint: "sage",
  },
  {
    number: "02",
    label: "QR ORDERING + TRACKING",
    title: "From scan to order, without an app.",
    description:
      "Guests open your digital menu in their phone browser, choose items, add available customisations and place table orders.",
    icon: QrCode,
    tint: "orange",
  },
  {
    number: "03",
    label: "ORDERS + INSIGHTS",
    title: "Keep every order in view.",
    description:
      "Review incoming orders, follow order status and keep your front-of-house team connected with the kitchen workflow.",
    icon: LayoutDashboard,
    tint: "blue",
  },
  {
    number: "04",
    label: "KITCHEN DISPLAY + VOICE ALERTS",
    title: "A clearer flow for the kitchen.",
    description:
      "Use the Kitchen Display to organise incoming orders and progress. Voice alerts help staff notice important updates.",
    icon: ChefHat,
    tint: "sage",
  },
  {
    number: "05",
    label: "TABLE SESSIONS + BILLING",
    title: "Billing that fits the table.",
    description:
      "Manage active table sessions, combined bills, and separate guest tabs and bills using supported split-billing workflows.",
    icon: ReceiptText,
    tint: "cream",
  },
  {
    number: "06",
    label: "OPTIONAL GST ON FINAL BILLS",
    title: "Show GST at the final invoice stage.",
    description:
      "Configure restaurant GST settings and apply the configured tax calculation when the final table invoice is issued. Original order totals remain unchanged.",
    icon: CreditCard,
    tint: "orange",
  },
  {
    number: "07",
    label: "TABLE BOOKINGS",
    title: "Keep reservation requests organised.",
    description:
      "Receive and manage table booking requests. Growth adds an advanced booking calendar, search, date filters and CSV export.",
    icon: CalendarCheck,
    tint: "sage",
  },
  {
    number: "08",
    label: "TABLE-SIDE SERVICE",
    title: "Help reaches the right team.",
    description:
      "Guests can request a waiter, water, cutlery or the bill from the public menu, helping staff respond from one workspace.",
    icon: Zap,
    tint: "cream",
  },
  {
    number: "09",
    label: "OFFERS + COUPONS",
    title: "Make promotions easier to manage.",
    description:
      "Set up restaurant offers and coupon campaigns, and present eligible promotions to guests through the digital menu.",
    icon: Gift,
    tint: "rose",
  },
  {
    number: "10",
    label: "MENU BANNERS",
    title: "Give important updates a place to shine.",
    description:
      "Add visual banners to your public menu to highlight specials, seasonal updates and restaurant announcements.",
    icon: Sparkles,
    tint: "orange",
  },
  {
    number: "11",
    label: "LOYALTY + REWARDS",
    title: "Give regulars a reason to return.",
    description:
      "Growth includes digital loyalty stamps and rewards to support repeat visits and guest engagement.",
    icon: Gift,
    tint: "rose",
  },
  {
    number: "12",
    label: "GUEST REVIEWS + FEEDBACK",
    title: "Listen to the people you serve.",
    description:
      "Add a Google Business review link when configured. Growth adds private guest ratings, a feedback inbox and follow-up tools.",
    icon: MessageCircle,
    tint: "sage",
  },
  {
    number: "13",
    label: "ASK KHAAVIO AI",
    title: "Help guests explore your menu.",
    description:
      "The Growth plan includes Ask Khaavio, a menu assistant for guest questions in English, Hindi and Hinglish, subject to usage limits.",
    icon: Sparkles,
    tint: "orange",
  },
  {
    number: "14",
    label: "ANALYTICS + INSIGHTS",
    title: "Understand everyday restaurant activity.",
    description:
      "Review order activity and performance in your workspace. Growth adds enhanced analytics and menu performance insights.",
    icon: LayoutDashboard,
    tint: "blue",
  },
];

const workflowSteps = [
  {
    number: "01",
    title: "Set up your restaurant",
    description:
      "Add your business details, opening hours, branding and table information.",
    icon: Store,
  },
  {
    number: "02",
    title: "Build your digital menu",
    description:
      "Add categories, dishes, photos, prices and availability, then create your QR codes.",
    icon: UtensilsCrossed,
  },
  {
    number: "03",
    title: "Guests scan, browse and order",
    description:
      "Customers open the menu in their phone browser, place an order and use available table-service options.",
    icon: Smartphone,
  },
  {
    number: "04",
    title: "Your team manages service",
    description:
      "Follow incoming orders, kitchen progress, voice alerts, service requests and booking requests.",
    icon: ChefHat,
  },
  {
    number: "05",
    title: "Manage the table and final bill",
    description:
      "Review table sessions, guest tabs and split bills. Optional GST is calculated at final invoice creation using restaurant settings.",
    icon: ReceiptText,
  },
];

const plans = [
  {
    name: "Starter",
    monthly: "499",
    annual: "4,990",
    description:
      "Core digital menu, QR ordering and everyday table operations for an independent food business.",
    popular: false,
    features: [
      "Digital menu, menu management and restaurant/table QR codes",
      "QR ordering, order tracking and receipts",
      "Orders workspace and Kitchen Display",
      "Basic table booking management",
      "Table-side service requests: waiter, water, cutlery and bill",
      "Table sessions, final bills and printable invoices, including separate guest tabs where enabled",
      "Optional GST calculation on final table invoices",
      "Operational voice alerts for orders, kitchen and service requests",
      "Basic order analytics and availability controls",
      "Google Business review link on the public menu (when configured)",
    ],
  },
  {
    name: "Growth",
    monthly: "899",
    annual: "8,990",
    description:
      "More booking tools, deeper insights and guest engagement for growing restaurant teams.",
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
      "Khaavio is designed for independent restaurants, cafés, bakeries, dessert shops and cloud kitchens that want a smoother digital menu, ordering and table-service experience.",
  },
  {
    question: "Do guests need to download an app?",
    answer:
      "No. Guests can scan a restaurant or table QR code and open the available menu and ordering experience in their phone browser.",
  },
  {
    question: "Can I update menu items and prices myself?",
    answer:
      "Yes. Restaurant teams can manage categories, dishes, photos, prices and availability from the Khaavio workspace.",
  },
  {
    question: "Does Khaavio support table sessions and split billing?",
    answer:
      "Khaavio supports table sessions and guest tabs, including separate guest bills in the supported split-billing workflow. The restaurant team can manage the final table bill from its workspace.",
  },
  {
    question: "How does GST work on restaurant bills?",
    answer:
      "Restaurants can configure GST settings, including the applicable rate and GSTIN. In the current workflow, GST is calculated when the final table invoice is created; the original QR order total and its order receipt are not changed by that final-invoice calculation. Configure tax settings with your tax adviser before using them for live billing.",
  },
  {
    question: "How does the 7-day free trial work?",
    answer:
      "The 7-day trial provides access to the available Khaavio trial feature set. No card or payment mandate is required to start the trial. Choosing a paid plan is a separate checkout step.",
  },
  {
    question: "How are paid subscriptions renewed?",
    answer:
      "Paid monthly and yearly plans use Razorpay recurring subscriptions. During paid-plan checkout, the customer authorises a recurring payment mandate through Razorpay. Eligible renewal charges are then attempted according to the selected billing cycle. Khaavio updates paid access after server-side verification of the captured payment. Starting the free trial does not itself create a paid-plan mandate.",
  },
  {
    question: "Does Khaavio replace every full POS or inventory system?",
    answer:
      "Khaavio focuses on digital menus, QR ordering, orders, kitchen workflows, table sessions, billing, bookings and guest engagement. It should not be presented as a full inventory-heavy POS replacement unless those specific capabilities are separately confirmed.",
  },
  {
    question: "Can I see Khaavio before I choose a plan?",
    answer:
      "Yes. Request a free walkthrough and the Khaavio team can show you the public menu, restaurant workspace, kitchen workflow, table billing and guest features relevant to your business.",
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
    <Link
      to="/"
      className={`kh2-brand ${light ? "kh2-brand-light" : ""}`}
      aria-label="Khaavio homepage"
    >
      <img src={khaavioIcon} alt="" width="40" height="40" />
      <span>
        Khaa<span>vio</span>
      </span>
    </Link>
  );
}

function DemoRequestForm() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest(event) {
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
          type: "demo",
          name: data.get("name"),
          phone: data.get("phone"),
          business: data.get("business"),
          businessType: data.get("businessType"),
          city: data.get("city"),
          email: data.get("email"),
          preferredTime: data.get("preferredTime"),
          website: data.get("website"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || "We couldn't receive your demo request. Please try again.");
      }
      markLeadConfirmed("demo");
      navigate("/thank-you?type=demo");
    } catch (error) {
      setStatus(error?.message || "We couldn't receive your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="kh2-lead-form kh2-demo-form" onSubmit={submitRequest}>
      <div className="kh2-form-grid">
        <label><span>Full name <b>*</b></span><input name="name" autoComplete="name" placeholder="Your name" required /></label>
        <label><span>Phone number <b>*</b></span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" pattern="[+0-9() .-]{8,24}" title="Enter a valid phone number" required /></label>
        <label className="kh2-field-full"><span>Restaurant / café name <b>*</b></span><input name="business" placeholder="Your business name" autoComplete="organization" required /></label>
        <label><span>Business type <b>*</b></span><select name="businessType" defaultValue="" required><option value="" disabled>Select type</option><option>Café</option><option>Restaurant</option><option>Bakery / dessert shop</option><option>Cloud kitchen</option><option>Other food business</option></select></label>
        <label><span>City <b>*</b></span><input name="city" placeholder="e.g. Patna" autoComplete="address-level2" required /></label>
        <label className="kh2-field-full"><span>Business email</span><input name="email" type="email" autoComplete="email" placeholder="you@yourrestaurant.com" /></label>
        <label className="kh2-field-full"><span>Preferred demo time</span><select name="preferredTime" defaultValue="Flexible — please contact me"><option>Flexible — please contact me</option><option>Morning (10 AM–12 PM IST)</option><option>Afternoon (12 PM–4 PM IST)</option><option>Evening (4 PM–7 PM IST)</option></select></label>
        <label className="kh2-lead-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <button className="kh2-button kh2-button-primary kh2-form-submit" type="submit" disabled={submitting}>
        {submitting ? "Sending request…" : "Send demo request"} <ArrowUpRight size={18} />
      </button>
      <p className="kh2-form-note"><MessageCircle size={14} /> Your request is sent securely to Khaavio. We'll contact you using the details you share.</p>
      {status && <p className="kh2-form-status" role="alert">{status}</p>}
      <p className="kh2-privacy-note">By submitting, you agree that Khaavio may contact you about this request. Do not share passwords, OTPs or payment credentials.</p>
    </form>
  );
}

function ProductShowcase() {
  return (
    <div
      className="kh2-showcase"
      aria-label="Khaavio restaurant dashboard preview"
    >
      <div className="kh2-showcase-glow" aria-hidden="true" />
      <div
        className="kh2-showcase-orbit kh2-showcase-orbit-one"
        aria-hidden="true"
      />
      <div
        className="kh2-showcase-orbit kh2-showcase-orbit-two"
        aria-hidden="true"
      />
      <div className="kh2-laptop-wrap">
        <div className="kh2-laptop">
          <div className="kh2-laptop-bezel">
            <span className="kh2-laptop-camera" aria-hidden="true" />
            <div className="kh2-laptop-screen">
              <img
                src="/images/khaavio-dashboard-desktop.png"
                alt="Khaavio restaurant dashboard showing restaurant operations and management tools"
              />
              <span className="kh2-screen-caption">
                Restaurant workspace preview
              </span>
            </div>
          </div>
          <div className="kh2-laptop-chin">
            <span>KHAAVIO</span>
          </div>
          <div className="kh2-laptop-base" aria-hidden="true" />
        </div>
      </div>
      <div className="kh2-phone-wrap">
        <div className="kh2-phone">
          <div className="kh2-phone-screen">
            <img
              src="/images/khaavio-dashboard-mobile.jpg"
              alt="Mobile view of the Khaavio restaurant workspace"
            />
          </div>
          <span className="kh2-phone-side-button" aria-hidden="true" />
        </div>
      </div>
      <div className="kh2-float-card kh2-float-card-top">
        <span className="kh2-float-icon">
          <QrCode size={18} />
        </span>
        <span>
          <strong>One scan away</strong>
          <small>Your digital menu</small>
        </span>
        <BadgeCheck size={17} className="kh2-float-check" />
      </div>
      <div className="kh2-float-card kh2-float-card-bottom">
        <span className="kh2-live-dot" />
        <span>
          <strong>One connected workspace</strong>
          <small>Menu · Orders · Billing · Guests</small>
        </span>
      </div>
      <div className="kh2-showcase-caption">
        <span />
        <span>PRODUCT PREVIEW</span>
        <span>Actual Khaavio workspace</span>
      </div>
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
    let targetId = "";
    try {
      targetId = decodeURIComponent(location.hash.slice(1));
    } catch {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" },
    );
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
        <span>No card or mandate required to start</span>
        <a href="#book-demo" onClick={closeMenu}>
          Book a free demo <ArrowUpRight size={13} />
        </a>
      </div>

      <header className="kh2-header">
        <div className="kh2-nav-wrap">
          <Brand />
          <button
            className="kh2-mobile-toggle"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav
            className={`kh2-nav ${menuOpen ? "kh2-nav-open" : ""}`}
            aria-label="Main navigation"
          >
            <a href="#platform" onClick={closeMenu}>
              Platform
            </a>
            <a href="#how-it-works" onClick={closeMenu}>
              How it works
            </a>
            <a href="#pricing" onClick={closeMenu}>
              Pricing
            </a>
            <a href="#faq" onClick={closeMenu}>
              FAQs
            </a>
            <Link to="/contact" onClick={closeMenu}>
              Contact
            </Link>
            <div className="kh2-mobile-nav-buttons">
              <Link to="/login" className="kh2-nav-login" onClick={closeMenu}>
                Sign in
              </Link>
              <a
                href="#book-demo"
                className="kh2-button kh2-button-primary"
                onClick={closeMenu}
              >
                Book a demo <ArrowUpRight size={16} />
              </a>
            </div>
          </nav>
          <div className="kh2-nav-actions">
            <Link to="/login" className="kh2-nav-login">
              Sign in
            </Link>
            <a href="#book-demo" className="kh2-button kh2-button-primary">
              Book a free demo <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </header>

      <section className="kh2-hero">
        <div className="kh2-hero-grid">
          <div className="kh2-hero-copy kh2-reveal">
            <div className="kh2-eyebrow">
              <span className="kh2-eyebrow-line" /> RESTAURANT OPERATIONS +
              GUEST EXPERIENCE
            </div>
            <h1>
              Every table.
              <br />
              <em>One smarter workspace.</em>
            </h1>
            <p className="kh2-hero-description">
              Digital menus, QR ordering, kitchen display, table sessions,
              GST-ready final billing, bookings and guest engagement—connected
              with Khaavio.
            </p>
            <div className="kh2-hero-actions">
              <Link
                to="/signup"
                className="kh2-button kh2-button-primary kh2-button-large"
              >
                Start 7-day free trial <ArrowRight size={17} />
              </Link>
              <a
                href="#book-demo"
                className="kh2-button kh2-button-light kh2-button-large"
              >
                Book a free demo <ArrowUpRight size={18} />
              </a>
            </div>
            <div className="kh2-trust-row">
              <span className="kh2-trust-icon">
                <Check size={16} />
              </span>
              <span>
                <strong>No app download for guests.</strong>
                <small>Scan, browse and use the menu in a phone browser.</small>
              </span>
            </div>
            <div className="kh2-hero-tags">
              <span>
                <Check size={14} /> Menu + QR ordering
              </span>
              <span>
                <Check size={14} /> Kitchen + billing
              </span>
              <span>
                <Check size={14} /> Bookings + rewards
              </span>
            </div>
          </div>
          <div className="kh2-hero-visual kh2-reveal">
            <ProductShowcase />
          </div>
        </div>
        <div className="kh2-hero-bottom">
          <span>THE DIGITAL SIDE OF HOSPITALITY</span>
          <span className="kh2-hero-bottom-rule" />
          <span className="kh2-hero-bottom-list">
            MENU <i /> QR <i /> KITCHEN <i /> BILLING <i /> GUESTS
          </span>
        </div>
      </section>

      <section className="kh2-logo-strip" aria-label="Khaavio capabilities">
        <div className="kh2-logo-strip-inner">
          <span>
            <QrCode size={18} /> DIGITAL MENU + QR
          </span>
          <span>
            <LayoutDashboard size={18} /> RESTAURANT WORKSPACE
          </span>
          <span>
            <ChefHat size={18} /> KITCHEN DISPLAY
          </span>
          <span>
            <ReceiptText size={18} /> TABLE BILLING + GST
          </span>
          <span>
            <CalendarCheck size={18} /> BOOKINGS + GUEST TOOLS
          </span>
        </div>
      </section>

      <section className="kh2-intro kh2-section" id="platform">
        <div className="kh2-container kh2-intro-grid kh2-reveal">
          <div>
            <div className="kh2-section-kicker">
              MEET KHAAVIO <span />
            </div>
            <h2>
              More than a QR menu.
              <br />
              <em>Your connected service workspace.</em>
            </h2>
          </div>
          <div className="kh2-intro-copy">
            <p>
              Khaavio brings the guest-facing digital journey and everyday
              restaurant operations together—from managing menus and orders to
              kitchen progress, table billing, bookings and guest engagement.
            </p>
            <a className="kh2-text-link" href="#features">
              Explore the platform <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <section className="kh2-features kh2-section" id="features">
        <div className="kh2-container">
          <div className="kh2-section-heading kh2-reveal">
            <div>
              <div className="kh2-section-kicker">
                ONE WORKSPACE. CONNECTED WORKFLOWS. <span />
              </div>
              <h2>
                Everything your team needs
                <br />
                <em>for everyday service.</em>
              </h2>
            </div>
            <p>
              Explore the actual Khaavio modules across menus, orders, kitchen,
              table operations, billing and guest experience. Plan availability
              may vary by feature.
            </p>
          </div>
          <div className="kh2-feature-grid">
            {featureCards.map(
              ({ number, label, title, description, icon: Icon, tint }) => (
                <article
                  className={`kh2-feature-card kh2-reveal kh2-tint-${tint}`}
                  key={number}
                >
                  <div className="kh2-feature-top">
                    <span className="kh2-feature-icon">
                      <Icon size={23} strokeWidth={1.8} />
                    </span>
                    <span>{number}</span>
                  </div>
                  <span className="kh2-feature-label">{label}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <a
                    href="#book-demo"
                    className="kh2-feature-link"
                    aria-label={`Ask for a demo of ${label}`}
                  >
                    <ArrowUpRight size={18} />
                  </a>
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="kh2-workflow kh2-section" id="how-it-works">
        <div className="kh2-container kh2-workflow-grid">
          <div className="kh2-workflow-copy kh2-reveal">
            <div className="kh2-section-kicker">
              HOW KHAAVIO WORKS <span />
            </div>
            <h2>
              From first scan
              <br />
              to <em>the final bill.</em>
            </h2>
            <p>
              Set up your restaurant once, then connect the guest menu, QR
              orders, kitchen progress and table operations in one practical
              flow.
            </p>
            <a href="#book-demo" className="kh2-button kh2-button-primary">
              See the full workflow <ArrowUpRight size={17} />
            </a>
            <div className="kh2-workflow-note">
              <Zap size={16} />
              <span>
                <strong>Designed for practical onboarding</strong>
                <small>
                  Set up your menu, create QR codes and test an order before
                  going live.
                </small>
              </span>
            </div>
          </div>
          <div className="kh2-steps">
            {workflowSteps.map(
              ({ number, title, description, icon: Icon }, index) => (
                <article className="kh2-step kh2-reveal" key={number}>
                  <div className="kh2-step-number">{number}</div>
                  <div className="kh2-step-icon">
                    <Icon size={22} />
                  </div>
                  <div className="kh2-step-content">
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                  <ArrowDownRight className="kh2-step-arrow" size={20} />
                  {index < workflowSteps.length - 1 && (
                    <span className="kh2-step-connector" aria-hidden="true" />
                  )}
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="kh2-billing-detail kh2-section" id="table-billing">
        <div className="kh2-container kh2-billing-grid">
          <div className="kh2-billing-copy kh2-reveal">
            <div className="kh2-section-kicker">
              TABLE SESSIONS + FINAL BILLING <span />
            </div>
            <h2>
              Keep table billing
              <br />
              <em>clear and connected.</em>
            </h2>
            <p>
              Follow active table sessions, review guest tabs and manage the
              final invoice from the restaurant workspace.
            </p>
            <div className="kh2-billing-points">
              <div>
                <Check size={16} />
                <span>
                  <strong>Combined table bills</strong>
                  <small>
                    Bring eligible orders together for the final invoice.
                  </small>
                </span>
              </div>
              <div>
                <Check size={16} />
                <span>
                  <strong>Separate guest tabs</strong>
                  <small>
                    Manage individual guest tabs in the supported split-billing
                    workflow.
                  </small>
                </span>
              </div>
              <div>
                <Check size={16} />
                <span>
                  <strong>Optional GST at final invoice</strong>
                  <small>
                    Use restaurant GST settings when the final table invoice is
                    created.
                  </small>
                </span>
              </div>
            </div>
          </div>
          <div className="kh2-billing-note kh2-reveal">
            <span className="kh2-billing-note-icon">
              <ReceiptText size={23} />
            </span>
            <span className="kh2-billing-note-kicker">HOW GST IS APPLIED</span>
            <h3>GST is calculated at final bill creation.</h3>
            <p>
              In the current Khaavio workflow, GST is not added to the original
              QR order total or its order receipt. The configured GST
              calculation is applied when the final table invoice is issued.
            </p>
            <div className="kh2-billing-note-foot">
              <ShieldCheck size={16} /> Restaurant-controlled tax settings
            </div>
          </div>
        </div>
      </section>

      <section className="kh2-product-band">
        <div className="kh2-container kh2-product-band-inner kh2-reveal">
          <div className="kh2-product-band-copy">
            <span className="kh2-product-band-kicker">
              <Sparkles size={15} /> GUEST EXPERIENCE + TEAM WORKSPACE
            </span>
            <h2>
              Made for your restaurant.
              <br />
              <em>Easy for your guests.</em>
            </h2>
            <p>
              Guests see your restaurant brand and menu. Your team gets one
              workspace for orders, kitchen progress, service requests, bookings
              and guest engagement.
            </p>
            <a href="#book-demo" className="kh2-button kh2-button-cream">
              Walk me through Khaavio <ArrowRight size={17} />
            </a>
          </div>
          <div className="kh2-product-points">
            <div>
              <span>
                <Smartphone size={21} />
              </span>
              <div>
                <strong>Guest-friendly</strong>
                <small>Browser-based digital menu and ordering flow</small>
              </div>
              <Check size={17} />
            </div>
            <div>
              <span>
                <LayoutDashboard size={21} />
              </span>
              <div>
                <strong>Team-ready</strong>
                <small>
                  Orders, kitchen, billing, bookings and service tools
                </small>
              </div>
              <Check size={17} />
            </div>
            <div>
              <span>
                <Gift size={21} />
              </span>
              <div>
                <strong>Built for engagement</strong>
                <small>Offers, rewards, reviews and menu assistance</small>
              </div>
              <Check size={17} />
            </div>
          </div>
        </div>
      </section>

      <section className="kh2-pricing kh2-section" id="pricing">
        <div className="kh2-container">
          <div className="kh2-pricing-heading kh2-reveal">
            <div className="kh2-section-kicker kh2-kicker-center">
              CLEAR PLANS + RECURRING BILLING <span />
            </div>
            <h2>
              Start with the essentials.
              <br />
              <em>Grow with your restaurant.</em>
            </h2>
            <p>
              Explore the 7-day free trial, then choose monthly or annual
              billing for your restaurant.
            </p>
          </div>
          <div className="kh2-trial-banner kh2-reveal">
            <span>
              <Sparkles size={19} />
            </span>
            <div>
              <strong>Try Khaavio free for 7 days.</strong>
              <small>
                No card or payment mandate is required to start the trial. A
                paid plan is a separate checkout.
              </small>
            </div>
            <a href="#book-demo">
              Need help? Book a demo <ArrowRight size={15} />
            </a>
          </div>
          <div
            className="kh2-billing-switch"
            role="group"
            aria-label="Billing frequency"
          >
            <button
              type="button"
              className={billing === "monthly" ? "is-active" : ""}
              aria-pressed={billing === "monthly"}
              onClick={() => setBilling("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={billing === "yearly" ? "is-active" : ""}
              aria-pressed={billing === "yearly"}
              onClick={() => setBilling("yearly")}
            >
              Yearly <span>Annual billing</span>
            </button>
          </div>
          <div className="kh2-pricing-grid">
            {plans.map((plan) => (
              <article
                className={`kh2-price-card kh2-reveal ${plan.popular ? "kh2-price-card-popular" : ""}`}
                key={plan.name}
              >
                {plan.popular && (
                  <span className="kh2-popular-pill">
                    <Sparkles size={13} /> FOR GROWING TEAMS
                  </span>
                )}
                <div className="kh2-plan-top">
                  <span className="kh2-plan-icon">
                    <Store size={20} />
                  </span>
                  <span className="kh2-plan-audience">
                    FOR{" "}
                    {plan.name === "Starter"
                      ? "EVERYDAY OPERATIONS"
                      : "GROWING RESTAURANTS"}
                  </span>
                </div>
                <h3>{plan.name}</h3>
                <p className="kh2-plan-description">{plan.description}</p>
                <div className="kh2-plan-price">
                  <span>₹</span>
                  {billing === "monthly" ? plan.monthly : plan.annual}
                  <small>/ {billing === "monthly" ? "month" : "year"}</small>
                </div>
                <div className="kh2-monthly-note">
                  {billing === "monthly"
                    ? "Billed monthly through Razorpay recurring billing."
                    : "Billed annually through Razorpay recurring billing."}
                </div>
                <Link
                  to="/signup"
                  className={`kh2-button ${plan.popular ? "kh2-button-primary" : "kh2-button-outline"} kh2-plan-cta`}
                >
                  Start 7-day free trial <ArrowRight size={16} />
                </Link>
                <div className="kh2-plan-divider" />
                <span className="kh2-includes-label">INCLUDES</span>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="kh2-recurring-note kh2-reveal">
            <div>
              <CreditCard size={18} />
              <strong>How recurring payments work</strong>
            </div>
            <p>
              When you choose a paid plan, Razorpay Checkout asks you to
              authorise a recurring payment mandate for the selected monthly or
              yearly plan. Eligible renewal charges are attempted according to
              that billing cycle. Khaavio enables paid access after its server
              verifies the captured payment. The 7-day free trial is separate
              and does not itself create a paid-plan mandate or automatic
              charge.
            </p>
            <p>
              All prices are shown in INR. Review the amount and recurring terms
              displayed during Razorpay checkout before authorising a paid
              subscription.
            </p>
          </div>
        </div>
      </section>

      <section className="kh2-demo kh2-section" id="book-demo">
        <div className="kh2-container kh2-demo-grid">
          <div className="kh2-demo-copy kh2-reveal">
            <div className="kh2-section-kicker kh2-kicker-light">
              LET'S TALK ABOUT YOUR RESTAURANT <span />
            </div>
            <h2>
              See Khaavio
              <br />
              <em>in a real workflow.</em>
            </h2>
            <p>
              Tell us a little about your business. We'll walk you through the
              digital menu, QR ordering, kitchen display, table billing,
              bookings and guest features relevant to your restaurant.
            </p>
            <div className="kh2-demo-benefits">
              <div>
                <span>
                  <Check size={17} />
                </span>
                <p>
                  <strong>Personalised walkthrough</strong>
                  <small>See the modules that matter to your restaurant.</small>
                </p>
              </div>
              <div>
                <span>
                  <Check size={17} />
                </span>
                <p>
                  <strong>Ask your real questions</strong>
                  <small>
                    Talk through plans, billing, setup and guest experience.
                  </small>
                </p>
              </div>
              <div>
                <span>
                  <Check size={17} />
                </span>
                <p>
                  <strong>Try before choosing a paid plan</strong>
                  <small>
                    Start the 7-day trial without a payment mandate.
                  </small>
                </p>
              </div>
            </div>
            <div className="kh2-demo-direct">
              <Mail size={18} />
              <span>
                <small>Prefer email?</small>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </span>
            </div>
          </div>
          <div className="kh2-demo-panel kh2-reveal">
            <div className="kh2-demo-panel-heading">
              <span className="kh2-demo-panel-icon">
                <CalendarCheck size={22} />
              </span>
              <div>
                <h3>Request a free demo</h3>
                <p>Share your details and preferred time.</p>
              </div>
            </div>
            <DemoRequestForm />
          </div>
        </div>
      </section>

      <section className="kh2-faq kh2-section" id="faq">
        <div className="kh2-container kh2-faq-grid">
          <div className="kh2-faq-intro kh2-reveal">
            <div className="kh2-section-kicker">
              GOOD TO KNOW <span />
            </div>
            <h2>
              Questions before
              <br />
              <em>you get started?</em>
            </h2>
            <p>
              Find answers about Khaavio features, restaurant billing, GST, free
              trials and recurring subscriptions.
            </p>
            <Link to="/contact" className="kh2-text-link">
              Contact Khaavio <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="kh2-faq-list kh2-reveal">
            {faqs.map((faq, index) => {
              const open = activeFaq === index;
              return (
                <article
                  className={`kh2-faq-item ${open ? "is-open" : ""}`}
                  key={faq.question}
                >
                  <button
                    type="button"
                    onClick={() => setActiveFaq(open ? -1 : index)}
                    aria-expanded={open}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown size={18} />
                  </button>
                  {open && <p>{faq.answer}</p>}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="kh2-bottom-cta">
        <div className="kh2-container kh2-bottom-cta-inner kh2-reveal">
          <span className="kh2-bottom-cta-mark">
            <Sparkles size={23} />
          </span>
          <div>
            <span className="kh2-section-kicker kh2-kicker-light">
              YOUR RESTAURANT. YOUR WAY. <span />
            </span>
            <h2>
              Make every table
              <br />
              <em>work a little smarter.</em>
            </h2>
            <p>
              Explore the product, see the complete workflow and find out
              whether Khaavio fits your restaurant.
            </p>
          </div>
          <div className="kh2-bottom-cta-actions">
            <a href="#book-demo" className="kh2-button kh2-button-cream">
              Book a free demo <ArrowUpRight size={17} />
            </a>
            <Link to="/signup" className="kh2-button kh2-button-ghost">
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <footer className="kh2-footer">
        <div className="kh2-container">
          <div className="kh2-footer-grid">
            <div className="kh2-footer-brand">
              <Brand light />
              <p>
                Restaurant operations and guest experience tools for
                restaurants, cafés, bakeries and cloud kitchens.
              </p>
              <a className="kh2-footer-email" href={`mailto:${CONTACT_EMAIL}`}>
                <Mail size={16} />
                {CONTACT_EMAIL}
              </a>
              <div
                className="kh2-footer-social"
                aria-label="Khaavio social and contact links"
              >
                <span>FOLLOW KHAAVIO</span>
                <div className="kh2-social-icons">
                  <a
                    href="https://www.instagram.com/khaavio/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Khaavio on Instagram"
                    title="Instagram"
                  >
                    <InstagramBrandIcon size={18} />
                  </a>
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Contact Khaavio on WhatsApp"
                    title="WhatsApp"
                  >
                    <MessageCircle size={18} strokeWidth={1.8} />
                  </a>
                </div>
              </div>
            </div>
            <div className="kh2-footer-column">
              <strong>EXPLORE</strong>
              <a href="#platform">Platform</a>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#table-billing">Table billing + GST</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQs</a>
            </div>
            <div className="kh2-footer-column">
              <strong>GET STARTED</strong>
              <a href="#book-demo">Book a free demo</a>
              <Link to="/signup">Create account</Link>
              <Link to="/login">Sign in</Link>
              <Link to="/contact">Contact us</Link>
              <Link to="/about">About Khaavio</Link>
            </div>
            <div className="kh2-footer-column">
              <strong>LEGAL</strong>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms &amp; Conditions</Link>
              <Link to="/refund-policy">Cancellation &amp; Refund</Link>
            </div>
          </div>
          <div className="kh2-footer-bottom">
            <span>
              © {new Date().getFullYear()} Khaavio. All rights reserved.
            </span>
            <span>Every Table, Digitally Connected.</span>
            <a href="#top">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
