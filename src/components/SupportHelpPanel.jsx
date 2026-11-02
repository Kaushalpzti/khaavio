import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Copy,
  CreditCard,
  Headset,
  MessageCircle,
  QrCode,
  Search,
  UtensilsCrossed,
} from "lucide-react";
import { KHAAVIO_EMAILS } from "../lib/contactEmails.js";
import "./SupportHelpPanel.css";

const HELP_ARTICLES = [
  {
    id: "menu-items",
    category: "Menu",
    title: "How do I add or update menu items?",
    answer:
      "Open Menu manager to add categories and dishes, update prices, upload photos, and mark items available or unavailable. After editing, preview the public menu before sharing its QR code.",
    linkTo: "/dashboard/menu",
    linkLabel: "Open menu manager",
    keywords: "food dish category price image photo available unavailable",
  },
  {
    id: "publish-menu",
    category: "Menu",
    title: "Why is my public menu not visible?",
    answer:
      "Make sure at least one menu item is available, then use Publish menu on your dashboard. If you changed a dish, check its availability and open the public menu again.",
    linkTo: "/dashboard/menu",
    linkLabel: "Check menu items",
    keywords: "publish live public private menu visibility link",
  },
  {
    id: "restaurant-qr",
    category: "QR codes",
    title: "How do I download my restaurant QR code?",
    answer:
      "Open QR Studio, preview the code with your restaurant details, and download it. Test the downloaded QR with a phone camera before printing it for customers.",
    linkTo: "/dashboard/qr",
    linkLabel: "Open QR Studio",
    keywords: "qr code download print scan camera restaurant logo",
  },
  {
    id: "table-qr",
    category: "QR codes",
    title: "Which QR code should go on each table?",
    answer:
      "Use Table QR Codes to generate a code for each table. Check the table number on the preview before downloading or printing, then scan a sample code to confirm it opens the expected customer flow.",
    linkTo: "/dashboard/table-qr",
    linkLabel: "Manage table QR codes",
    keywords: "table qr number seat table-specific download print scan",
  },
  {
    id: "orders",
    category: "Orders",
    title: "Where do I manage new orders?",
    answer:
      "Open Orders to review incoming customer orders and update their kitchen status. Keep the Kitchen Display open during service so staff can see the active queue.",
    linkTo: "/dashboard/orders",
    linkLabel: "Open orders",
    keywords: "order kitchen display status new pending preparing served",
  },
  {
    id: "bookings",
    category: "Bookings",
    title: "How do I review table bookings?",
    answer:
      "Open Table bookings to view reservations and their current status. Check restaurant opening hours in settings so customers are offered suitable booking slots.",
    linkTo: "/dashboard/bookings",
    linkLabel: "Open bookings",
    keywords: "reservation table time date slot opening hours settings",
  },
  {
    id: "pause-orders",
    category: "Restaurant settings",
    title: "How can I temporarily stop online orders?",
    answer:
      "Open Restaurant settings and use the order availability controls when your kitchen is busy or closed. Re-enable orders when the restaurant is ready to accept them again.",
    linkTo: "/dashboard/settings",
    linkLabel: "Open restaurant settings",
    keywords: "pause stop disable order busy kitchen closed open availability",
  },
  {
    id: "subscription",
    category: "Subscription",
    title: "How do I renew or review my plan?",
    answer:
      "Open Subscription & Plans to check your current access, compare plans, and submit a renewal request. Submitting a request does not itself collect payment or change your plan; follow the payment instructions confirmed by Khaavio.",
    linkTo: "/dashboard/subscription",
    linkLabel: "Review subscription",
    keywords: "billing trial expire expiry renew plan payment price request",
  },
];

function buildSupportMessage(restaurant, accountEmail) {
  return [
    "Hi Khaavio Support, I need help with my restaurant workspace.",
    `Restaurant: ${restaurant?.name || "Not provided"}`,
    `Menu slug: ${restaurant?.slug || "Not provided"}`,
    `Account email: ${accountEmail || "Not provided"}`,
    "Page: Dashboard > Help & Support",
    "Issue: [Describe what happened and the steps to reproduce it.]",
  ].join("\n");
}

export default function SupportHelpPanel({ restaurant, accountEmail, id = "help-center" }) {
  const [query, setQuery] = useState("");
  const [openArticleId, setOpenArticleId] = useState("menu-items");
  const [copyState, setCopyState] = useState("");
  const [showDraft, setShowDraft] = useState(false);

  const supportMessage = useMemo(
    () => buildSupportMessage(restaurant, accountEmail),
    [restaurant, accountEmail],
  );

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return HELP_ARTICLES;

    return HELP_ARTICLES.filter((article) =>
      `${article.category} ${article.title} ${article.answer} ${article.keywords}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  const supportEmail = String(
    import.meta.env.VITE_KHAAVIO_SUPPORT_EMAIL || KHAAVIO_EMAILS.support,
  ).trim();
  const supportWhatsApp = String(
    import.meta.env.VITE_KHAAVIO_SUPPORT_WHATSAPP || "",
  ).replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(supportMessage);
  const emailHref = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(
        `Khaavio support — ${restaurant?.name || "Restaurant workspace"}`,
      )}&body=${encodedMessage}`
    : "";
  const whatsappHref = supportWhatsApp
    ? `https://wa.me/${supportWhatsApp}?text=${encodedMessage}`
    : "";

  async function copySupportMessage() {
    setCopyState("");
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(supportMessage);
      setCopyState("Support summary copied. Paste it into your message to Khaavio.");
      setShowDraft(false);
    } catch {
      setShowDraft(true);
      setCopyState("Copy is unavailable here. Select the summary below and copy it.");
    }
  }

  return (
    <section id={id} className="khaavio-help-panel" aria-labelledby="khaavio-help-title">
      <div className="khaavio-help-heading">
        <div className="khaavio-help-heading-icon" aria-hidden="true">
          <Headset size={22} />
        </div>
        <div className="khaavio-help-heading-copy">
          <span className="khaavio-help-eyebrow">HELP CENTER</span>
          <h2 id="khaavio-help-title">Need a hand?</h2>
          <p>Find quick answers for the tools you use every day.</p>
        </div>
      </div>

      <div className="khaavio-help-layout">
        <div className="khaavio-help-faq">
          <label className="khaavio-help-search" htmlFor="khaavio-help-search-input">
            <Search size={17} aria-hidden="true" />
            <input
              id="khaavio-help-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search menu, QR, orders, bookings..."
            />
          </label>

          <div className="khaavio-help-articles">
            {filteredArticles.length ? (
              filteredArticles.map((article) => {
                const isOpen = openArticleId === article.id;
                return (
                  <article className="khaavio-help-article" key={article.id}>
                    <button
                      type="button"
                      className="khaavio-help-question"
                      aria-expanded={isOpen}
                      onClick={() => setOpenArticleId(isOpen ? "" : article.id)}
                    >
                      <span>
                        <small>{article.category}</small>
                        <strong>{article.title}</strong>
                      </span>
                      <ChevronDown
                        size={18}
                        className={isOpen ? "khaavio-help-chevron is-open" : "khaavio-help-chevron"}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div className="khaavio-help-answer">
                        <p>{article.answer}</p>
                        <Link to={article.linkTo} className="khaavio-help-article-link">
                          {article.linkLabel} <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="khaavio-help-empty">
                <CircleHelp size={22} />
                <strong>No matching help article</strong>
                <p>Try a shorter search, or prepare a support message.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="khaavio-help-contact">
          <div className="khaavio-help-contact-icon" aria-hidden="true">
            <MessageCircle size={21} />
          </div>
          <span className="khaavio-help-contact-eyebrow">CONTACT & QUICK ACCESS</span>
          <h3>Still stuck?</h3>
          <p>
            Include your restaurant name and account email when asking for help so the issue is easier to investigate.
          </p>

          <div className="khaavio-help-contact-actions">
            {whatsappHref && (
              <a className="khaavio-help-action khaavio-help-action-primary" href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle size={16} /> Chat on WhatsApp <ArrowUpRight size={14} />
              </a>
            )}
            {emailHref && (
              <a className="khaavio-help-action" href={emailHref}>
                <Headset size={16} /> Email support <ArrowUpRight size={14} />
              </a>
            )}
            <button type="button" className="khaavio-help-action" onClick={copySupportMessage}>
              {copyState.startsWith("Support summary copied") ? <Check size={16} /> : <Copy size={16} />}
              Copy support summary
            </button>
          </div>

          {!supportEmail && !supportWhatsApp && (
            <p className="khaavio-help-contact-note">
              Direct support contact can be enabled in the app configuration. You can copy the summary now and share it through your existing support channel.
            </p>
          )}

          {copyState && <p className="khaavio-help-copy-status" role="status">{copyState}</p>}
          {showDraft && (
            <textarea
              className="khaavio-help-draft"
              aria-label="Support message to copy"
              readOnly
              rows={6}
              value={supportMessage}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}

          <div className="khaavio-help-shortcuts">
            <span>QUICK LINKS</span>
            <Link to="/dashboard/orders"><ClipboardList size={15} /> Orders</Link>
            <Link to="/dashboard/bookings"><CalendarDays size={15} /> Bookings</Link>
            <Link to="/dashboard/qr"><QrCode size={15} /> QR Studio</Link>
            <Link to="/dashboard/menu"><UtensilsCrossed size={15} /> Menu manager</Link>
            <Link to="/dashboard/subscription"><CreditCard size={15} /> Subscription & plans</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
