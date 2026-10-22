import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  Mail,
  Menu,
  QrCode,
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
  email: "khaavioapp@gmail.com",
  instagram: "https://www.instagram.com/your-official-handle/",
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
    label: "DIGITAL MENU",
    title: "A menu that feels like your brand.",
    description:
      "Showcase your dishes, photos, prices, categories and customizations in a beautiful mobile-friendly menu.",
    icon: UtensilsCrossed,
  },
  {
    number: "02",
    label: "SMART QR",
    title: "One scan. A better experience.",
    description:
      "Create a QR code for your restaurant or individual tables. Update your menu without printing it again.",
    icon: QrCode,
  },
  {
    number: "03",
    label: "TABLE BOOKINGS",
    title: "Make room for every guest.",
    description:
      "Keep reservation requests, guest information and booking confirmations organised in one place.",
    icon: CalendarCheck,
  },
  {
    number: "04",
    label: "ONE WORKSPACE",
    title: "Everything, in its right place.",
    description:
      "Manage your restaurant profile, menus, QR codes and subscription from one dedicated dashboard.",
    icon: BarChart3,
  },
];

const plans = [
  {
    name: "Free",
    price: "0",
    description: "A simple start for your digital journey.",
    features: [
      "Digital restaurant menu",
      "Basic menu QR code",
      "Restaurant profile",
      "One restaurant outlet",
    ],
    cta: "Start for free",
  },
  {
    name: "Starter",
    price: "299",
    description: "For businesses ready to stand out.",
    features: [
      "Everything in Free",
      "Advanced menu customization",
      "Restaurant branding",
      "Extended menu management",
    ],
    cta: "Explore Starter",
  },
  {
    name: "Growth",
    price: "699",
    description: "For restaurants ready to work smarter.",
    features: [
      "Everything in Starter",
      "Table-wise QR codes",
      "Table booking management",
      "Menu and booking insights",
    ],
    cta: "Choose Growth",
    popular: true,
  },
  {
    name: "Pro",
    price: "1299",
    description: "For growing food businesses.",
    features: [
      "Everything in Growth",
      "Advanced reporting",
      "Priority support",
      "Planned multi-outlet tools",
    ],
    cta: "Explore Pro",
  },
];

const faqs = [
  {
    question: "Who can use Khaavio?",
    answer:
      "Cafés, restaurants, bakeries, dessert shops and cloud kitchens can use Khaavio to build their digital restaurant presence.",
  },
  {
    question: "Do my customers need an app?",
    answer:
      "No. Customers can open a published digital menu in their phone's browser through a link or QR code.",
  },
  {
    question: "Can I update my menu whenever I want?",
    answer:
      "The platform is being built so restaurant owners can edit dishes, prices and availability through their dashboard. Those changes will appear on the published menu once the corresponding publishing functionality is enabled.",
  },
  {
    question: "Can customers reserve tables online?",
    answer:
      "Online table booking is part of the planned platform. The goal is to let customers submit requests and restaurants manage confirmations in their workspace.",
  },
  {
    question: "What does Khaavio cost?",
    answer:
      "The proposed model includes a free plan and paid subscriptions starting at ₹299 per month. Final pricing and feature limits will be confirmed before public launch.",
  },
  {
    question: "Will Khaavio work across India?",
    answer:
      "Yes, the product is being designed for Indian food businesses nationwide, with initial customer acquisition starting in Patna.",
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
        Official social profiles will be added before launch.
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
            Start with the essentials. Add more capabilities as your restaurant
            grows.
          </p>
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
                {plan.price}
                <small>/ month</small>
              </div>
              <p className="kh-price-note">Proposed launch pricing</p>

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
          Pricing and included features are proposed launch details. Final
          limits and billing terms will be confirmed before public launch.
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
        A NEW DIGITAL HOME FOR HOSPITALITY
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
              Your menu, table bookings and digital storefront. Everything your
              restaurant needs to show up beautifully, all in one thoughtful
              platform.
            </p>

            <div className="kh-hero-actions">
              <Link
                to="/signup"
                className="kh-button kh-button-dark kh-button-large"
              >
                Bring your restaurant online <ArrowUpRight size={17} />
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
                <p>From your first café to multiple locations.</p>
              </div>
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
              Running a restaurant is about the food, the atmosphere and the
              little details that bring everyone together. Khaavio is being
              built to make the digital side feel simpler, so you can focus on
              the experience.
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
              Thoughtful tools for everyday restaurant operations. Simple to
              start, with room to grow as your business does.
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
              No complicated setup. Your restaurant gets its own digital space,
              ready for you to make it yours.
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
          <p>Start creating a better digital experience for your restaurant.</p>

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
              <span>EXPLORE</span>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQs</a>
            </div>

            <div className="kh-footer-column">
              <span>YOUR ACCOUNT</span>
              <Link to="/signup">Create account</Link>
              <Link to="/login">Sign in</Link>
              <Link to="/reset-password">Reset password</Link>
              <Link to="/onboarding">Restaurant setup</Link>
            </div>

            <div className="kh-footer-social">
              <span>LET'S CONNECT</span>
              <p>Follow Khaavio's journey.</p>
              <SocialLinks />
              <small>
                Add official social URLs in the BRAND_CONTACT settings.
              </small>
            </div>
          </div>

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
