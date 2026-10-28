import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Bot,
  CalendarCheck,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gift,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquareText,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import khaavioIcon from "../assets/icon.png";

import "./Home.css";


/* Add actual Khaavio contact details here before public launch. */
const BRAND_CONTACT = {
  email: "khaavioqr@gmail.com",
  instagram: "https://www.instagram.com/khaavio/",
  linkedin: "",
  youtube: "",
  facebook: "",
};

const socialProfiles = [
  { name: "Instagram", mark: "ig", url: BRAND_CONTACT.instagram },
  { name: "LinkedIn", mark: "in", url: BRAND_CONTACT.linkedin },
  { name: "YouTube", mark: "yt", url: BRAND_CONTACT.youtube },
  { name: "Facebook", mark: "f", url: BRAND_CONTACT.facebook },
];

const features = [
  {
    number: "01",
    label: "MENU + QR STUDIO",
    title: "A menu that feels like your restaurant.",
    description:
      "Organise dishes, categories, prices and photos, then generate shareable restaurant and table QR codes from one workspace.",
    icon: UtensilsCrossed,
  },
  {
    number: "02",
    label: "QR ORDERING + TRACKING",
    title: "From table scan to order updates.",
    description:
      "Guests browse and order from their phone browser, then follow order progress and view their order details without downloading an app.",
    icon: QrCode,
  },
  {
    number: "03",
    label: "BOOKINGS",
    title: "Keep reservations in one place.",
    description:
      "Receive and manage table-booking requests from the dashboard. Growth adds an advanced calendar, search, date filters and CSV export.",
    icon: CalendarCheck,
  },
  {
    number: "04",
    label: "ORDERS + INSIGHTS",
    title: "Stay close to every order.",
    description:
      "Follow incoming orders in the Orders workspace and Kitchen Display, issue receipts, and review basic order analytics. Growth adds enhanced insights.",
    icon: ChefHat,
  },
  {
    number: "05",
    label: "TABLE-SIDE SERVICE",
    title: "Help is one tap away.",
    description:
      "From an active table QR, guests can ask for a waiter, water, cutlery or the bill. Staff can manage requests from the dashboard.",
    icon: BellRing,
  },
  {
    number: "06",
    label: "TABLE SESSIONS + BILLING",
    title: "Billing that fits the table.",
    description:
      "Track table sessions and create numbered, printable invoices. Configure eligible tables for one combined bill or separate guest tabs and bills.",
    icon: ReceiptText,
  },
  {
    number: "07",
    label: "LOYALTY + REWARDS",
    title: "Give guests a reason to return.",
    description:
      "Growth restaurants can offer digital stamp tracking and rewards from the public menu, helping make repeat visits more rewarding.",
    icon: Gift,
  },
  {
    number: "08",
    label: "GUEST REVIEWS + FEEDBACK",
    title: "Keep the conversation going.",
    description:
      "Growth includes private guest ratings and feedback tools. A configured Google review link remains available to Starter and Growth restaurants.",
    icon: MessageSquareText,
  },
  {
    number: "09",
    label: "ASK KHAAVIO AI",
    title: "A menu assistant for every guest.",
    description:
      "Available with Growth: guests can ask about dishes and prices or get menu suggestions in English, Hindi or Hinglish, based on the restaurant menu (usage limits apply).",
    icon: Bot,
  },
];

const plans = [
  {
    name: "Starter",
    monthlyPrice: "499",
    yearlyPrice: "4,990",
    foundingPrice: "3,999",
    description: "Everyday ordering, guest tools and table operations for independent restaurants.",
    features: [
      "Digital menu management and restaurant/table QR codes",
      "QR ordering, customer order tracking and receipts",
      "Orders workspace and Kitchen Display",
      "Basic table-booking management",
      "Table-side service requests: waiter, water, cutlery and bill",
      "Table sessions, final bills and printable invoices",
      "Operational voice alerts for orders, kitchen and service requests",
      "Google Business review link on the public menu (when configured)",
      "Basic order analytics, business hours and pause-orders controls",
    ],
    cta: "Start 7-day free trial",
  },
  {
    name: "Growth",
    monthlyPrice: "899",
    yearlyPrice: "8,990",
    foundingPrice: "6,999",
    description: "Everything in Starter, plus deeper booking tools and business insights.",
    features: [
      "Everything in Starter",
      "Advanced booking calendar, search and date filters",
      "Booking CSV export",
      "Enhanced analytics and menu performance insights",
      "Digital loyalty stamps and rewards",
      "Private guest ratings, feedback inbox and review follow-up tools",
      "Ask Khaavio AI menu assistant in English, Hindi and Hinglish (usage limits apply)",
      "Advanced voice alerts for Growth-specific workflows",
      "Priority support during the founding pilot",
    ],
    cta: "Start 7-day free trial",
    popular: true,
  },
];

const faqs = [
  {
    question: "Who can use Khaavio?",
    answer:
      "Independent cafés, restaurants, bakeries, dessert shops and cloud kitchens can use Khaavio for digital menus, QR ordering, bookings, kitchen workflows, table-side requests and guest engagement.",
  },
  {
    question: "Do my customers need to download an app?",
    answer:
      "No. Guests can scan a table QR code or open a restaurant link in their phone browser to view the menu and use the available customer features.",
  },
  {
    question: "Can I update my menu and availability?",
    answer:
      "Yes. Restaurant owners can manage menu items, availability, prices and photos from their workspace, configure business hours, and pause online orders when needed.",
  },
  {
    question: "Can customers place orders and reserve tables?",
    answer:
      "Published restaurants can offer QR-based table ordering and online table booking. The team can manage orders, kitchen progress, table-side service requests and booking requests from the workspace.",
  },
  {
    question: "How does pricing work?",
    answer:
      "Every new restaurant starts with a 7-day free trial. Starter is ₹499 per month or ₹4,990 per year; Growth is ₹899 per month or ₹8,990 per year. The first 10 restaurants can request a founding annual price. During the pilot, plan activation is handled manually and online payments or automatic renewals are not enabled yet.",
  },
  {
    question: "What guest-facing tools are available?",
    answer:
      "All active plans can show a configured Google review link and support table-side requests from a valid table QR. Growth additionally unlocks loyalty stamps and rewards, private feedback, and Ask Khaavio AI for menu suggestions (subject to usage limits).",
  },
  {
    question: "What is included in Starter and Growth?",
    answer:
      "Both plans include the core restaurant workflow: digital menus and QR codes, QR ordering, Kitchen Display, receipts, basic bookings and analytics, table-side requests, table sessions and bills, and a configurable Google review link. Growth adds advanced booking tools, CSV export, enhanced analytics, loyalty stamps and rewards, private guest feedback, Ask Khaavio AI (usage limits apply), advanced voice alerts and priority pilot support.",
  },
  {
    question: "Can I try Khaavio before paying?",
    answer:
      "Yes. The 7-day trial is designed for you to set up your menu, try QR ordering, explore table-side requests, table billing, loyalty and Ask Khaavio AI, and test booking workflows before choosing a paid plan.",
  },
];

function Brand({ footer = false }) {
  return (
    <Link
      to="/"
      className={`kh-brand ${footer ? "kh-brand-footer" : ""}`}
      aria-label="Khaavio homepage"
    >
      <img src={khaavioIcon} alt="" />
      <span>
        Khaa<span>vio</span>
      </span>
    </Link>
  );
}

function SocialLinks() {
  const available = socialProfiles.filter((profile) => profile.url);

  if (!available.length) {
    return (
      <p className="kh-social-pending">
        Official social profiles will be announced here.
      </p>
    );
  }

  return (
    <div className="kh-social-links">
      {available.map((profile) => (
        <a
          key={profile.name}
          href={profile.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Khaavio on ${profile.name}`}
          title={profile.name}
        >
          {profile.mark}
        </a>
      ))}
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="kh-preview-window">
      <div className="kh-preview-browser">
        <div className="kh-browser-dots">
          <i />
          <i />
          <i />
        </div>
        <span>app.khaavio.in / dashboard</span>
        <ShieldCheck size={14} />
      </div>

      <div className="kh-preview-app">
        <aside className="kh-preview-sidebar">
          <div className="kh-preview-brand">
            <img src={khaavioIcon} alt="" />
            <strong>Atelier</strong>
          </div>
          <span className="kh-preview-side-label">WORKSPACE</span>
          <div className="kh-preview-nav active">
            <LayoutDashboard size={14} /> Overview
          </div>
          <div className="kh-preview-nav">
            <UtensilsCrossed size={14} /> My Menu
          </div>
          <div className="kh-preview-nav">
            <QrCode size={14} /> QR Studio
          </div>
          <div className="kh-preview-nav">
            <CalendarCheck size={14} /> Bookings
          </div>
          <div className="kh-preview-nav">
            <CreditCard size={14} /> Subscription
          </div>

          <div className="kh-preview-plan">
            <Sparkles size={14} />
            <span>Growth plan</span>
          </div>
        </aside>

        <div className="kh-preview-main">
          <div className="kh-preview-heading">
            <div>
              <span className="kh-preview-eyebrow">YOUR WORKSPACE</span>
              <h3>
                Good morning, Atelier <span>✳</span>
              </h3>
              <p>A little overview of your restaurant.</p>
            </div>
            <div className="kh-preview-avatar">A</div>
          </div>

          <div className="kh-preview-stats">
            <div>
              <span>MENU STATUS</span>
              <strong>
                <i /> Ready to customise
              </strong>
              <small>Illustrative preview</small>
            </div>
            <div>
              <span>TABLE QR CODES</span>
              <strong>
                12 <small>tables</small>
              </strong>
              <small>Sample workspace</small>
            </div>
          </div>

          <div className="kh-preview-menu">
            <div className="kh-preview-menu-head">
              <div>
                <span className="kh-preview-eyebrow">A TASTE OF THE MENU</span>
                <h4>House favourites</h4>
              </div>
              <span className="kh-preview-badge">SAMPLE</span>
            </div>

            <div className="kh-preview-dish">
              <span className="kh-dish-art kh-dish-coffee">☕</span>
              <span className="kh-dish-info">
                <strong>Signature Latte</strong>
                <small>Rich, smooth and made fresh</small>
              </span>
              <b>₹189</b>
            </div>

            <div className="kh-preview-dish">
              <span className="kh-dish-art kh-dish-bakery">🥐</span>
              <span className="kh-dish-info">
                <strong>Butter Croissant</strong>
                <small>Golden, flaky perfection</small>
              </span>
              <b>₹149</b>
            </div>

            <div className="kh-preview-dish">
              <span className="kh-dish-art kh-dish-matcha">🍵</span>
              <span className="kh-dish-info">
                <strong>Matcha Cloud</strong>
                <small>A little green goodness</small>
              </span>
              <b>₹219</b>
            </div>
          </div>

          <div className="kh-preview-footer">
            <span>
              <Check size={12} /> Designed around your brand
            </span>
            <span>Powered by Khaavio</span>
          </div>
        </div>
      </div>

      <div className="kh-floating-card kh-floating-qr">
        <span>
          <QrCode size={18} />
        </span>
        <div>
          <strong>One scan away.</strong>
          <small>Your digital menu.</small>
        </div>
        <Check size={15} />
      </div>

      <div className="kh-floating-card kh-floating-booking">
        <span>
          <CalendarCheck size={18} />
        </span>
        <div>
          <strong>Bookings, organised.</strong>
          <small>One simple workspace.</small>
        </div>
      </div>
    </div>
  );
}

function PricingSection() {
  const trackRef = useRef(null);
  const [activePlan, setActivePlan] = useState(0);
  const [billingCycle, setBillingCycle] = useState("yearly");

  function updateActivePlan() {
    const track = trackRef.current;
    if (!track) return;

    const cards = Array.from(track.children);
    if (!cards.length) return;

    const center = track.getBoundingClientRect().left + track.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(center - cardCenter);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActivePlan(nearestIndex);
  }

  function goToPlan(index) {
    const track = trackRef.current;
    if (!track || !track.children.length) return;

    const boundedIndex = Math.max(0, Math.min(plans.length - 1, index));
    const card = track.children[boundedIndex];

    card.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });

    setActivePlan(boundedIndex);
  }

  return (
    <section className="kh-pricing kh-section" id="pricing">
      <div className="kh-section-wrap">
        <div className="kh-pricing-heading">
          <div className="kh-section-label">
            <span /> SIMPLE BY DESIGN
          </div>
          <h2>
            A plan for <em>your next chapter.</em>
          </h2>
          <p>
            Try every core feature for 7 days, then choose monthly flexibility
            or save with annual billing.
          </p>
        </div>

        <div className="kh-pricing-trial-banner">
          <span className="kh-pricing-trial-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <strong>Start with 7 days on us.</strong>
            <p>
              Full trial access · No card required · Choose a plan when you're
              ready
            </p>
          </div>
        </div>

        <div
          className="kh-pricing-billing"
          role="group"
          aria-label="Billing frequency"
        >
          <button
            type="button"
            className={billingCycle === "monthly" ? "active" : ""}
            aria-pressed={billingCycle === "monthly"}
            onClick={() => setBillingCycle("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={billingCycle === "yearly" ? "active" : ""}
            aria-pressed={billingCycle === "yearly"}
            onClick={() => setBillingCycle("yearly")}
          >
            Yearly <span>Save 2 months</span>
          </button>
        </div>

        <div
          className="kh-pricing-grid"
          ref={trackRef}
          onScroll={updateActivePlan}
          aria-label="Subscription plans"
        >
          {plans.map((plan) => (
            <article
              className={`kh-price-card ${plan.popular ? "kh-price-popular" : ""}`}
              key={plan.name}
            >
              {plan.popular && (
                <div className="kh-popular-tag">
                  <Sparkles size={12} /> MOST VERSATILE
                </div>
              )}

              <h3>{plan.name}</h3>
              <p className="kh-price-description">{plan.description}</p>

              <div className="kh-price-amount">
                <span>₹</span>
                {billingCycle === "monthly"
                  ? plan.monthlyPrice
                  : plan.yearlyPrice}
                <small>/ {billingCycle === "monthly" ? "month" : "year"}</small>
              </div>

              {billingCycle === "yearly" ? (
                <div className="kh-plan-founders-offer">
                  <span>FOUNDING OFFER · FIRST 10 RESTAURANTS</span>
                  <strong>₹{plan.foundingPrice} for year one</strong>
                  <small>Regular annual price ₹{plan.yearlyPrice}</small>
                </div>
              ) : (
                <p className="kh-price-note">
                  Flexible monthly billing · 7-day free trial included
                </p>
              )}

              <Link
                to="/signup"
                className={`kh-button ${plan.popular ? "kh-button-dark" : "kh-button-outline"} kh-plan-cta`}
              >
                {plan.cta} <ArrowRight size={15} />
              </Link>

              <div className="kh-plan-divider" />
              <span className="kh-includes-label">WHAT'S INCLUDED</span>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={15} /> {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div
          className="kh-pricing-controls"
          aria-label="Pricing carousel controls"
        >
          <button
            type="button"
            onClick={() => goToPlan(activePlan - 1)}
            disabled={activePlan === 0}
            aria-label="Previous pricing plan"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="kh-pricing-dots">
            {plans.map((plan, index) => (
              <button
                key={plan.name}
                type="button"
                className={activePlan === index ? "active" : ""}
                onClick={() => goToPlan(index)}
                aria-label={`Show ${plan.name} plan`}
                aria-current={activePlan === index ? "true" : undefined}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goToPlan(activePlan + 1)}
            disabled={activePlan === plans.length - 1}
            aria-label="Next pricing plan"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <p className="kh-pricing-disclaimer">
          During the early-access pilot, subscriptions are activated manually.
          Online payment collection and automatic renewals are not enabled yet.
          Starter and Growth feature access follows the assigned active plan; plan
          changes and founding-offer eligibility are confirmed manually. Founding
          prices are for the first 10 restaurants for their first year; renewal is at
          the then-current published annual price.
        </p>
      </div>
    </section>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(0);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <main className="kh-home" id="top">
      <div className="kh-announcement">
        <span>
          <Sparkles size={13} />
        </span>
        7 DAYS FREE · NO CARD REQUIRED
        <a href="#features">
          Meet Khaavio <ArrowRight size={13} />
        </a>
      </div>

      <header className="kh-header">
        <div className="kh-nav-inner">
          <Brand />

          <button
            className="kh-mobile-menu"
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>

          <nav className={`kh-nav-links ${menuOpen ? "kh-nav-open" : ""}`}>
            <a href="#features" onClick={closeMenu}>
              Features
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

            <div className="kh-mobile-nav-actions">
              <Link to="/login" onClick={closeMenu}>
                Sign in
              </Link>
              <Link
                to="/signup"
                className="kh-button kh-button-dark"
                onClick={closeMenu}
              >
                Get started <ArrowUpRight size={16} />
              </Link>
            </div>
          </nav>

          <div className="kh-nav-actions">
            <Link to="/login" className="kh-login-link">
              Sign in
            </Link>
            <Link to="/signup" className="kh-button kh-button-dark">
              Get started <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <section className="kh-hero">
        <div className="kh-hero-grid">
          <div className="kh-hero-copy">
            <div className="kh-eyebrow">
              <span />
              BUILT FOR RESTAURANTS, MADE FOR PEOPLE
            </div>

            <h1>
              Make room for
              <span className="kh-headline-serif">better</span>
              <span className="kh-headline-last">hospitality.</span>
            </h1>

            <p>
              Digital menus, QR ordering, reservations, kitchen workflows and
              guest tools—all connected in one workspace built around your
              restaurant and its own identity.
            </p>

            <div className="kh-hero-actions">
              <Link
                to="/signup"
                className="kh-button kh-button-dark kh-button-large"
              >
                Start your 7-day free trial <ArrowUpRight size={17} />
              </Link>
              <a
                href="#how-it-works"
                className="kh-button kh-button-outline kh-button-large"
              >
                See how it works <ArrowRight size={16} />
              </a>
            </div>

            <div className="kh-hero-proof">
              <div className="kh-proof-symbols" aria-hidden="true">
                <span>
                  <Store size={14} />
                </span>
                <span>
                  <QrCode size={14} />
                </span>
                <span>
                  <CalendarCheck size={14} />
                </span>
              </div>
              <div>
                <strong>Made for independent food businesses</strong>
                <p>From the first menu upload to everyday service.</p>
              </div>
            </div>

            <div
              className="kh-hero-capabilities"
              aria-label="Khaavio essentials"
            >
              <span>
                <Check size={13} /> Digital menu + QR studio
              </span>
              <span>
                <Check size={13} /> Orders, kitchen + table billing
              </span>
              <span>
                <Check size={13} /> Bookings + guest engagement tools
              </span>
            </div>
          </div>

          <div className="kh-hero-visual">
            <div className="kh-visual-orbit kh-orbit-one" />
            <div className="kh-visual-orbit kh-orbit-two" />

            <div className="kh-visual-label kh-label-left">
              <Sparkles size={14} /> Thoughtfully simple.
            </div>

            <DashboardPreview />

            <div className="kh-visual-label kh-label-right">
              <span /> A menu that evolves with you
            </div>
          </div>
        </div>

        <div className="kh-hero-bottom">
          <span>BUILT FOR THE PEOPLE BEHIND THE FOOD</span>
          <span className="kh-bottom-rule" />
          <span>
            MENU <i /> QR <i /> BOOKINGS <i /> GROWTH
          </span>
        </div>
      </section>

      <section className="kh-intro" id="about">
        <div className="kh-section-wrap kh-intro-grid">
          <div className="kh-section-label">
            <span /> MEET KHAAVIO
          </div>

          <div>
            <h2>
              Less juggling tools.
              <em> More welcoming people.</em>
            </h2>
            <p>
              Running a restaurant is about the food and the people. Khaavio
              brings your digital menu, table ordering, booking requests and
              kitchen workflow into one workspace, so daily service feels easier
              to manage.
            </p>
            <a href="#features" className="kh-text-link">
              Get to know the platform <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <section className="kh-features kh-section" id="features">
        <div className="kh-section-wrap">
          <div className="kh-section-heading">
            <div>
              <div className="kh-section-label">
                <span /> THE ESSENTIALS
              </div>
              <h2>
                Everything in its
                <br />
                <em>right place.</em>
              </h2>
            </div>
            <p>
              From the first QR scan to the final bill, service request or repeat-visit
              reward, manage restaurant operations and guest touchpoints in one workspace.
            </p>
          </div>

          <div className="kh-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <article className="kh-feature-card" key={feature.number}>
                  <div className="kh-feature-top">
                    <span className="kh-feature-icon">
                      <Icon size={22} strokeWidth={1.8} />
                    </span>
                    <span>{feature.number}</span>
                  </div>
                  <span className="kh-feature-label">{feature.label}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <Link
                    to="/signup"
                    className="kh-feature-link"
                    aria-label={`Get started with ${feature.label}`}
                  >
                    <ArrowUpRight size={18} />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="kh-workflow kh-section" id="how-it-works">
        <div className="kh-section-wrap kh-workflow-grid">
          <div className="kh-workflow-copy">
            <div className="kh-section-label">
              <span /> A FRESH START
            </div>
            <h2>
              From first click
              <br />
              to <em>fully yours.</em>
            </h2>
            <p>
              Create your restaurant workspace, add your menu, then share your
              QR code with guests. Start with a 7-day free trial.
            </p>
            <Link to="/signup" className="kh-button kh-button-dark">
              Start your journey <ArrowUpRight size={16} />
            </Link>
          </div>

          <div className="kh-steps">
            {[
              {
                number: "01",
                title: "Create your space",
                description:
                  "Set up your restaurant profile and business details.",
                icon: Store,
              },
              {
                number: "02",
                title: "Make it yours",
                description:
                  "Add your dishes, prices, photos and visual identity.",
                icon: UtensilsCrossed,
              },
              {
                number: "03",
                title: "Go live with a scan",
                description:
                  "Publish your menu and share your QR code with guests.",
                icon: QrCode,
              },
            ].map((step) => {
              const Icon = step.icon;

              return (
                <div className="kh-step" key={step.number}>
                  <span className="kh-step-number">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  <Icon size={21} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <PricingSection />

      <section className="kh-faq kh-section" id="faq">
        <div className="kh-section-wrap kh-faq-grid">
          <div>
            <div className="kh-section-label">
              <span /> GOOD TO KNOW
            </div>
            <h2>
              A few things
              <br />
              <em>you might wonder.</em>
            </h2>
            <p>
              We want to make running the digital side of your restaurant feel
              straightforward from day one.
            </p>

            <div className="kh-faq-contact">
              <span>
                <Mail size={17} />
              </span>
              <div>
                <strong>Need more information?</strong>
                <small>Find contact options in the footer.</small>
              </div>
            </div>
          </div>

          <div className="kh-faq-list">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;

              return (
                <article
                  className={`kh-faq-item ${isOpen ? "kh-faq-open" : ""}`}
                  key={faq.question}
                >
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown size={17} />
                  </button>

                  {isOpen && <p>{faq.answer}</p>}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="kh-final-cta" id="get-started">
        <div className="kh-final-cta-inner">
          <span className="kh-cta-emblem">
            <Sparkles size={22} />
          </span>
          <div className="kh-cta-kicker">YOUR RESTAURANT, YOUR WAY</div>
          <h2>
            Let’s make your
            <br />
            <em>next chapter delicious.</em>
          </h2>
          <p>Try Khaavio free for 7 days. No card required.</p>

          <div className="kh-final-actions">
            <Link to="/signup" className="kh-button kh-button-cream">
              Get started with Khaavio <ArrowUpRight size={17} />
            </Link>
            <Link to="/login" className="kh-button kh-button-ghost">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="kh-footer" id="contact">
        <div className="kh-section-wrap">
          <div className="kh-footer-main">
            <div className="kh-footer-brand">
              <Brand footer />
              <p>
                Helping food businesses create thoughtful digital experiences,
                one table at a time.
              </p>

              <div className="kh-footer-contact">
                {BRAND_CONTACT.email ? (
                  <a href={`mailto:${BRAND_CONTACT.email}`}>
                    <Mail size={15} /> {BRAND_CONTACT.email}
                  </a>
                ) : (
                  <span className="kh-contact-unset">
                    <Mail size={15} /> Contact email to be configured
                  </span>
                )}
              </div>
            </div>

            <div className="kh-footer-column">
              <span>QUICK LINKS</span>
              <Link to="/about">About Khaavio</Link>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQs</a>
            </div>

            <div className="kh-footer-column">
              <span>YOUR ACCOUNT</span>
              <Link to="/signup">Create account</Link>
              <Link to="/login">Sign in</Link>
              {/* <Link to="/reset-password">Reset password</Link> */}
              <Link to="/onboarding">Restaurant setup</Link>
            </div>

            <div className="kh-footer-column">
              <span>LEGAL</span>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms &amp; Conditions</Link>
              <Link to="/refund-policy">Refund Policy</Link>
            </div>

            <div className="kh-footer-social">
              <span>LET'S CONNECT</span>
              <p>Follow Khaavio's journey.</p>
              <SocialLinks />
              {/* <small>Follow official Khaavio channels as they launch.</small> */}
            </div>
          </div>

          <section className="kh-footer-operator" aria-label="Platform operator and grievance contact">
            <div className="kh-footer-operator-copy">
              <strong>Platform operator &amp; grievance contact</strong>
              <p>Consumer complaints are acknowledged within 48 hours and redressed within 30 days of receipt, or sooner where applicable law requires.</p>
            </div>
            <div className="kh-footer-operator-details">
              <span><strong>Legal operator:</strong> Kaushal Kumar</span>
              <span><strong>Principal address:</strong> Patna, Bihar – 800011, India</span>
              <span><strong>Grievance Officer:</strong> Kaushal Kumar (Platform Operator)</span>
              <a href="tel:+919471640485">+91 9471640485</a>
              <a href="mailto:kaushalpzti@gmail.com">kaushalpzti@gmail.com</a>
            </div>
          </section>

          <div className="kh-footer-bottom">
            <span>© 2026 Khaavio. All rights reserved.</span>
            <span>Every Table, Digitally Connected.</span>
            <a href="#top">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
