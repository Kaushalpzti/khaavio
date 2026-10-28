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
  Clock3,
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
  { name: "Instagram", url: BRAND_CONTACT.instagram },
  { name: "LinkedIn", url: BRAND_CONTACT.linkedin },
  { name: "YouTube", url: BRAND_CONTACT.youtube },
  { name: "Facebook", url: BRAND_CONTACT.facebook },
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
    <Link to="/" className={footer ? "hp-brand hp-brand-footer" : "hp-brand"} aria-label="Khaavio home">
      <img src={khaavioIcon} alt="" />
      <span>Khaa<span>vio</span></span>
    </Link>
  );
}

function HeroScene() {
  return (
    <div className="hp-hero-stage" aria-label="Illustrative Khaavio restaurant product preview">
      <div className="hp-hero-photo" role="img" aria-label="Warmly lit contemporary restaurant interior" />
      <div className="hp-photo-caption">
        <span className="hp-caption-mark"><Sparkles size={14} /></span>
        <span><strong>Made for the moments that matter.</strong><small>One calm workspace behind every service.</small></span>
      </div>
      <div className="hp-order-float">
        <div className="hp-order-float-top"><span className="hp-live-dot" /> LIVE ORDER <span>TABLE 08</span></div>
        <div className="hp-order-line"><span className="hp-order-dish">🍝</span><span><strong>Truffle Alfredo</strong><small>1 item · note added</small></span><b>₹329</b></div>
        <div className="hp-order-status"><span>Kitchen progress</span><strong>Preparing</strong></div>
        <div className="hp-progress"><span /></div>
      </div>
      <div className="hp-menu-float">
        <div className="hp-menu-device-top"><span>9:41</span><span>•••</span></div>
        <div className="hp-menu-brand"><img src={khaavioIcon} alt="" /><span><strong>Olive &amp; Ember</strong><small>MENU · TABLE 08</small></span></div>
        <div className="hp-menu-hero-copy"><small>MADE FRESH, JUST FOR YOU</small><strong>Something<br /><em>delicious.</em></strong></div>
        <div className="hp-menu-item"><span className="hp-dish-art hp-dish-pasta">🍝</span><span><strong>Truffle Alfredo</strong><small>Chef's favourite</small></span><b>₹329</b></div>
        <div className="hp-menu-item"><span className="hp-dish-art hp-dish-pizza">🍕</span><span><strong>Garden Margherita</strong><small>Fresh from the oven</small></span><b>₹279</b></div>
        <div className="hp-menu-cart"><span>2 items · ₹608</span><strong>View order <ArrowRight size={11} /></strong></div>
      </div>
      <div className="hp-qr-float">
        <span className="hp-qr-icon"><QrCode size={21} /></span>
        <span><strong>One scan away.</strong><small>No app download needed.</small></span>
        <ArrowUpRight size={15} />
      </div>
      <div className="hp-scene-stamp"><span>YOUR TABLE</span><strong>08</strong><small>Scan · Order · Enjoy</small></div>
    </div>
  );
}

function MenuFeatureVisual() {
  return (
    <div className="hp-feature-menu-visual">
      <div className="hp-feature-menu-top"><span className="hp-mini-brand"><img src={khaavioIcon} alt="" /> Khaavio menu</span><span className="hp-menu-open"><i /> Published preview</span></div>
      <div className="hp-feature-menu-content">
        <div><small>WELCOME TO</small><h3>Olive &amp; Ember</h3><p>A little something for every craving.</p></div>
        <div className="hp-feature-food-list">
          <span><i>🥗</i><b>Garden bowl</b><small>₹249</small></span>
          <span><i>🍕</i><b>Stone-baked pizza</b><small>₹279</small></span>
          <span><i>🍰</i><b>Basque cheesecake</b><small>₹199</small></span>
        </div>
      </div>
    </div>
  );
}

function OrderFeatureVisual() {
  return (
    <div className="hp-order-feature-visual">
      <div className="hp-order-feature-head"><span>TABLE 08</span><span className="hp-order-mini-live"><i /> IN PROGRESS</span></div>
      <div className="hp-order-feature-title">A little more time.<br /><em>Then it’s served.</em></div>
      <div className="hp-order-timeline">
        <div className="hp-timeline-step hp-done"><i><Check size={12} /></i><span><b>Order received</b><small>Sent to the restaurant</small></span><small>Done</small></div>
        <div className="hp-timeline-step hp-active"><i><ChefHat size={13} /></i><span><b>In the kitchen</b><small>Your order is being prepared</small></span><small>Now</small></div>
        <div className="hp-timeline-step"><i><BellRing size={12} /></i><span><b>Ready to enjoy</b><small>We'll update the status</small></span></div>
      </div>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="hp-workspace-frame">
      <div className="hp-browser-bar"><span className="hp-browser-dots"><i /><i /><i /></span><span className="hp-browser-address">app.khaavio.in / dashboard</span><ShieldCheck size={14} /></div>
      <div className="hp-workspace-app">
        <aside className="hp-workspace-sidebar">
          <div className="hp-workspace-brand"><img src={khaavioIcon} alt="" /><span>Khaavio</span></div>
          <small>WORKSPACE</small>
          <span className="hp-workspace-nav hp-selected"><LayoutDashboard size={13} /> Overview</span>
          <span className="hp-workspace-nav"><UtensilsCrossed size={13} /> Menu</span>
          <span className="hp-workspace-nav"><QrCode size={13} /> QR Studio</span>
          <span className="hp-workspace-nav"><CalendarCheck size={13} /> Bookings</span>
          <span className="hp-workspace-nav"><ChefHat size={13} /> Kitchen</span>
          <div className="hp-workspace-plan"><Sparkles size={12} /> Restaurant workspace</div>
        </aside>
        <div className="hp-workspace-main">
          <div className="hp-workspace-heading"><div><small>YOUR RESTAURANT, AT A GLANCE</small><h3>Good afternoon, Atelier <span>✳</span></h3><p>Here’s a sample of how your workspace comes together.</p></div><span className="hp-workspace-avatar">A</span></div>
          <div className="hp-workspace-stats">
            <div><small>ORDERS TODAY</small><strong>18</strong><span>Sample data</span></div>
            <div><small>BOOKING REQUESTS</small><strong>06</strong><span>Sample data</span></div>
            <div><small>MENU STATUS</small><strong className="hp-ready">Published</strong><span>Illustrative preview</span></div>
          </div>
          <div className="hp-workspace-lower">
            <div className="hp-chart-card"><div className="hp-chart-heading"><span><b>Order activity</b><small>Example dashboard chart</small></span><BarChart3 size={16} /></div><div className="hp-chart-bars">{[34,55,43,70,51,83,62,92,74,58,78,48].map((height,index)=><i key={index} style={{height: height + "%"}} />)}</div><div className="hp-chart-axis"><span>10 AM</span><span>12 PM</span><span>2 PM</span><span>4 PM</span></div></div>
            <div className="hp-recent-card"><div><b>Recent orders</b><small>Sample list</small></div><span><i>08</i><b>Table 08</b><small>Preparing</small></span><span><i>03</i><b>Table 03</b><small>Received</small></span><span><i>12</i><b>Table 12</b><small>Ready</small></span></div>
          </div>
        </div>
      </div>
      <div className="hp-workspace-annotation"><span><ShieldCheck size={15} /></span><div><strong>One connected workspace.</strong><small>Menus, orders, bookings and kitchen flow.</small></div></div>
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
      const distance = Math.abs(center - (rect.left + rect.width / 2));
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
    track.children[boundedIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActivePlan(boundedIndex);
  }

  return (
    <section className="hp-section hp-pricing" id="pricing">
      <div className="hp-container">
        <div className="hp-section-intro hp-centered">
          <span className="hp-eyebrow"><i /> CLEAR PRICING. NO GUESSWORK.</span>
          <h2>The right tools for<br /><em>your next chapter.</em></h2>
          <p>Try the core restaurant workflow for 7 days. Choose the plan that fits how you serve.</p>
        </div>
        <div className="hp-trial-banner"><span><Sparkles size={19} /></span><div><strong>Start with 7 days on us.</strong><small>Full trial access · No card required · Choose a plan when you're ready</small></div><ArrowRight size={17} /></div>
        <div className="hp-billing-switch" role="group" aria-label="Billing frequency">
          <button type="button" className={billingCycle === "monthly" ? "is-active" : ""} aria-pressed={billingCycle === "monthly"} onClick={() => setBillingCycle("monthly")}>Monthly</button>
          <button type="button" className={billingCycle === "yearly" ? "is-active" : ""} aria-pressed={billingCycle === "yearly"} onClick={() => setBillingCycle("yearly")}>Yearly <span>Save 2 months</span></button>
        </div>
        <div className="hp-price-track" ref={trackRef} onScroll={updateActivePlan} aria-label="Subscription plans">
          {plans.map((plan) => (
            <article className={plan.popular ? "hp-price-card hp-price-featured" : "hp-price-card"} key={plan.name}>
              {plan.popular && <div className="hp-plan-tag"><Sparkles size={12} /> MOST VERSATILE</div>}
              <span className="hp-plan-name">{plan.name}</span>
              <p className="hp-plan-description">{plan.description}</p>
              <div className="hp-plan-price"><span>₹</span>{billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice}<small>/ {billingCycle === "monthly" ? "month" : "year"}</small></div>
              {billingCycle === "yearly" ? <div className="hp-founding-offer"><small>FOUNDING OFFER · FIRST 10 RESTAURANTS</small><strong>₹{plan.foundingPrice} for year one</strong><span>Regular annual price ₹{plan.yearlyPrice}</span></div> : <p className="hp-monthly-note">Flexible monthly billing · 7-day free trial included</p>}
              <Link to="/signup" className={plan.popular ? "hp-button hp-button-dark hp-plan-cta" : "hp-button hp-button-outline hp-plan-cta"}>{plan.cta} <ArrowUpRight size={16} /></Link>
              <div className="hp-plan-rule" />
              <small className="hp-included-title">WHAT'S INCLUDED</small>
              <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} /><span>{feature}</span></li>)}</ul>
            </article>
          ))}
        </div>
        <div className="hp-price-controls" aria-label="Pricing plan carousel controls">
          <button type="button" onClick={() => goToPlan(activePlan - 1)} disabled={activePlan === 0} aria-label="Previous pricing plan"><ChevronLeft size={18} /></button>
          <div className="hp-price-dots">{plans.map((plan,index)=><button key={plan.name} type="button" className={activePlan === index ? "is-active" : ""} onClick={() => goToPlan(index)} aria-label={"Show " + plan.name + " plan"} aria-current={activePlan === index ? "true" : undefined} />)}</div>
          <button type="button" onClick={() => goToPlan(activePlan + 1)} disabled={activePlan === plans.length - 1} aria-label="Next pricing plan"><ChevronRight size={18} /></button>
        </div>
        <p className="hp-pricing-disclaimer">During the early-access pilot, subscriptions are activated manually. Online payment collection and automatic renewals are not enabled yet. Starter and Growth feature access follows the assigned active plan; plan changes and founding-offer eligibility are confirmed manually. Founding prices are for the first 10 restaurants for their first year; renewal is at the then-current published annual price.</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(0);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="hp-home" id="top">
      <div className="hp-announcement"><span><Sparkles size={13} /></span><strong>YOUR FIRST 7 DAYS ARE ON US</strong><i /> No card required <a href="#pricing">Explore plans <ArrowRight size={13} /></a></div>
      <header className="hp-header">
        <div className="hp-header-inner">
          <Brand />
          <button className="hp-menu-toggle" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
          <nav className={menuOpen ? "hp-nav hp-nav-open" : "hp-nav"} aria-label="Main navigation">
            <a href="#features" onClick={closeMenu}>Platform</a>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#pricing" onClick={closeMenu}>Pricing</a>
            <a href="#faq" onClick={closeMenu}>FAQs</a>
            <div className="hp-nav-actions"><Link to="/login" onClick={closeMenu} className="hp-signin">Sign in</Link><Link to="/signup" onClick={closeMenu} className="hp-button hp-button-dark">Get started <ArrowUpRight size={15} /></Link></div>
          </nav>
        </div>
      </header>

      <section className="hp-hero">
        <div className="hp-hero-grid hp-container">
          <div className="hp-hero-copy">
            <span className="hp-eyebrow"><i /> RESTAURANT OPERATIONS, REIMAGINED</span>
            <h1>Great service.<br /><em>Less</em> chaos.</h1>
            <p>From the first menu scan to the final bill, bring your guest experience and table operations together in one calm, connected workspace.</p>
            <div className="hp-hero-actions"><Link to="/signup" className="hp-button hp-button-dark">Start your 7-day free trial <ArrowUpRight size={17} /></Link><a href="#how-it-works" className="hp-button hp-button-outline">See how it works <ArrowRight size={16} /></a></div>
            <div className="hp-hero-note"><span className="hp-note-icon"><Check size={15} /></span><span><strong>Made for independent restaurants &amp; cafés</strong><small>No customer app downloads. No complicated setup.</small></span></div>
          </div>
          <HeroScene />
        </div>
        <div className="hp-hero-bottom hp-container"><span>THOUGHTFUL TECH FOR REAL HOSPITALITY</span><span className="hp-hero-rule" /><span>MENU <i /> ORDER <i /> SERVE <i /> REPEAT</span></div>
      </section>

      <section className="hp-capability-strip" aria-label="Khaavio platform capabilities"><div className="hp-container hp-capability-inner"><span><QrCode size={18} /> Digital menu &amp; QR</span><i /><span><UtensilsCrossed size={18} /> Table ordering</span><i /><span><CalendarCheck size={18} /> Reservations</span><i /><span><ChefHat size={18} /> Kitchen workflow</span><i /><span><ReceiptText size={18} /> Table billing</span></div></section>

      <section className="hp-section hp-features" id="features">
        <div className="hp-container">
          <div className="hp-section-intro hp-feature-intro"><div><span className="hp-eyebrow"><i /> THE KHAAVIO WORKSPACE</span><h2>Everything your team needs.<br /><em>Nothing in the way.</em></h2></div><p>Guest-facing convenience and behind-the-scenes control, built around the way restaurants actually work.</p></div>
          <div className="hp-feature-bento">
            <article className="hp-bento-card hp-menu-bento">
              <div className="hp-bento-copy"><span className="hp-feature-number">01 / DIGITAL MENU</span><span className="hp-feature-icon"><UtensilsCrossed size={20} /></span><h3>{features[0].title}</h3><p>{features[0].description}</p><a href="#how-it-works" className="hp-inline-link">Explore the workflow <ArrowRight size={15} /></a></div>
              <MenuFeatureVisual />
            </article>
            <article className="hp-bento-card hp-order-bento">
              <div className="hp-order-bento-copy"><span className="hp-feature-number">02 / QR ORDERING</span><h3>{features[1].title}</h3><p>{features[1].description}</p></div>
              <OrderFeatureVisual />
            </article>
          </div>
          <div className="hp-feature-grid">
            {features.slice(2).map((feature) => { const Icon = feature.icon; return <article className="hp-feature-tile" key={feature.number}><div className="hp-feature-tile-top"><span className="hp-feature-icon"><Icon size={19} /></span><small>{feature.number}</small></div><span className="hp-feature-number">{feature.label}</span><h3>{feature.title}</h3><p>{feature.description}</p></article>; })}
          </div>
        </div>
      </section>

      <section className="hp-workflow" id="how-it-works">
        <div className="hp-container hp-workflow-inner">
          <div className="hp-workflow-heading"><span className="hp-eyebrow"><i /> READY WHEN YOU ARE</span><h2>From first setup<br />to <em>first scan.</em></h2><p>Get your digital front door ready, then let your guests take it from there.</p><Link to="/signup" className="hp-button hp-button-coral">Build your restaurant menu <ArrowUpRight size={16} /></Link></div>
          <div className="hp-steps">
            <article className="hp-step"><span className="hp-step-index">01</span><span className="hp-step-icon"><Store size={21} /></span><h3>Set up your space</h3><p>Add your restaurant details and give your workspace its identity.</p><span className="hp-step-foot">YOUR BRAND, YOUR RULES</span></article>
            <article className="hp-step"><span className="hp-step-index">02</span><span className="hp-step-icon"><UtensilsCrossed size={21} /></span><h3>Add your menu</h3><p>Organise categories, dishes, prices and photos from one place.</p><span className="hp-step-foot">MAKE IT YOURS</span></article>
            <article className="hp-step"><span className="hp-step-index">03</span><span className="hp-step-icon"><QrCode size={21} /></span><h3>Go live with QR</h3><p>Share your menu and let guests browse or order in their browser.</p><span className="hp-step-foot">READY TO SERVE</span></article>
          </div>
        </div>
      </section>

      <section className="hp-section hp-operations">
        <div className="hp-container">
          <div className="hp-section-intro hp-operations-heading"><div><span className="hp-eyebrow"><i /> YOUR DAILY CONTROL ROOM</span><h2>See the moving parts.<br /><em>Keep service flowing.</em></h2></div><p>One restaurant workspace for your published menu, incoming orders, bookings and kitchen progress.</p></div>
          <div className="hp-operations-grid"><WorkspacePreview /><div className="hp-operations-copy"><span className="hp-operations-kicker"><Sparkles size={14} /> DESIGNED FOR THE REAL SHIFT</span><h3>Less switching tabs.<br />More time for people.</h3><p>Keep the important parts of a service connected—without forcing your team to learn an oversized system.</p><div className="hp-operation-benefit"><span><Check size={15} /></span><div><strong>Know what needs attention</strong><small>Review orders and kitchen progress in a single workflow.</small></div></div><div className="hp-operation-benefit"><span><Check size={15} /></span><div><strong>Keep bookings organised</strong><small>Manage reservation requests and table-side service tools.</small></div></div><div className="hp-operation-benefit"><span><Check size={15} /></span><div><strong>Make billing more flexible</strong><small>Track table sessions and issue printable invoices.</small></div></div><p className="hp-preview-disclaimer">Illustrative interface with sample data—not live restaurant analytics.</p></div></div>
        </div>
      </section>

      <PricingSection />

      <section className="hp-section hp-faq" id="faq"><div className="hp-container hp-faq-layout"><div className="hp-faq-intro"><span className="hp-eyebrow"><i /> GOOD TO KNOW</span><h2>A few things<br /><em>you might wonder.</em></h2><p>Everything you need to know before your first scan.</p><a href={"mailto:" + BRAND_CONTACT.email} className="hp-faq-contact"><span><Mail size={17} /></span><span><strong>Still have questions?</strong><small>{BRAND_CONTACT.email}</small></span><ArrowUpRight size={15} /></a></div><div className="hp-faq-list">{faqs.map((faq,index)=>{const isOpen=activeFaq===index;return <article className={isOpen?"hp-faq-item hp-faq-open":"hp-faq-item"} key={faq.question}><button type="button" onClick={()=>setActiveFaq(isOpen?-1:index)} aria-expanded={isOpen}><span>{faq.question}</span><ChevronDown size={18} /></button>{isOpen&&<p>{faq.answer}</p>}</article>;})}</div></div></section>

      <section className="hp-final-cta"><div className="hp-final-cta-inner hp-container"><div className="hp-cta-orbit" aria-hidden="true" /><span className="hp-cta-label"><Sparkles size={14} /> FOR THE PEOPLE BEHIND THE FOOD</span><h2>Your restaurant,<br /><em>ready for what’s next.</em></h2><p>Try Khaavio for 7 days and see how a connected guest experience feels.</p><div className="hp-final-actions"><Link to="/signup" className="hp-button hp-button-light">Get started with Khaavio <ArrowUpRight size={17} /></Link><Link to="/login" className="hp-button hp-button-ghost">Already have an account? Sign in</Link></div><span className="hp-cta-footnote"><Check size={13} /> No card required to start your trial</span></div></section>

      <footer className="hp-footer"><div className="hp-container"><div className="hp-footer-top"><div className="hp-footer-brand-column"><Brand footer /><p>Thoughtful digital experiences for the restaurants and cafés bringing people together.</p><a className="hp-footer-email" href={"mailto:" + BRAND_CONTACT.email}><Mail size={15} /> {BRAND_CONTACT.email}</a><div className="hp-footer-social">{socialProfiles.filter((profile)=>profile.url).map((profile)=><a href={profile.url} key={profile.name} target="_blank" rel="noopener noreferrer">{profile.name}<ArrowUpRight size={12} /></a>)}</div></div><div className="hp-footer-column"><span>EXPLORE</span><a href="#features">Platform</a><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQs</a><Link to="/about">About Khaavio</Link></div><div className="hp-footer-column"><span>YOUR ACCOUNT</span><Link to="/signup">Create account</Link><Link to="/login">Sign in</Link><Link to="/onboarding">Restaurant setup</Link></div><div className="hp-footer-column"><span>THE IMPORTANT BITS</span><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms &amp; Conditions</Link><Link to="/refund-policy">Refund Policy</Link></div></div><div className="hp-footer-bottom"><span>© 2026 Khaavio. All rights reserved.</span><span>Every table, thoughtfully connected.</span><a href="#top">Back to top ↑</a></div></div></footer>
    </main>
  );
}
