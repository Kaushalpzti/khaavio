import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Leaf,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Gift,
  Star,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { getOrCreateKhaavioLoyaltyToken } from "../lib/loyaltyToken";
import { getStoredKhaavioLoyaltyPhone, setStoredKhaavioLoyaltyPhone } from "../lib/loyaltyPhone";
import { DEFAULT_PUBLIC_FEATURES, normalizePublicFeatureFlags, shouldShowPublicReviewsTab } from "../lib/publicPlanFeatures";
import { hasSocialLinks } from "../lib/restaurantSocialLinks.js";
import PublicTableService from "../components/PublicTableService";
import PublicLoyaltyClub from "../components/PublicLoyaltyClub";
import PublicReviewsFeedback, { isValidGoogleReviewUrl } from "../components/PublicReviewsFeedback";
import PublicBooking from "./PublicBooking";
import AskKhaavio from "../components/AskKhaavio";
import khaavioIcon from "../assets/icon.png";
import "./PublicMenu.css";
import "./PublicMenuExperience.css";

function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(price) || 0);
}

function getErrorMessage(error, fallback) {
  const message =
    typeof error?.message === "string" ? error.message.trim() : "";
  if (message.includes("KHAAVIO_PLAN_ACCESS_REQUIRED")) {
    return "Online ordering is temporarily unavailable at this restaurant. Please ask the restaurant team for help.";
  }
  return message || fallback;
}

function getRestaurantAvailability(restaurant, timestamp) {
  if (!restaurant) {
    return {
      canOrder: false,
      title: "Checking order availability",
      message: "Please wait while we check the restaurant's hours.",
    };
  }

  if (restaurant.is_accepting_orders === false) {
    return {
      canOrder: false,
      title: "Online orders are paused",
      message:
        "This restaurant is temporarily not accepting online orders. You can still browse the menu or ask the staff for assistance.",
    };
  }

  const schedule = restaurant.business_hours;
  if (!schedule || typeof schedule !== "object" || !timestamp) {
    return {
      canOrder: true,
      title: "Online ordering",
      message: "Online orders are available when the restaurant is open.",
    };
  }

  const timezone = restaurant.timezone || "Asia/Kolkata";
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
  }

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const dayKey = String(values.weekday || "").toLowerCase();
  const day = schedule[dayKey];

  if (!day || day.closed) {
    return {
      canOrder: false,
      title: "Restaurant is closed",
      message:
        "Online ordering is currently closed for today. Please check back during opening hours.",
    };
  }

  const parseMinutes = (value) => {
    if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
    const [hour, minute] = value.split(":").map(Number);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };

  const opens = parseMinutes(day.open);
  const closes = parseMinutes(day.close);
  const current = Number(values.hour) * 60 + Number(values.minute);

  if (opens === null || closes === null || opens >= closes) {
    return {
      canOrder: false,
      title: "Ordering hours unavailable",
      message:
        "The restaurant's opening hours need to be updated. Please ask staff for assistance.",
    };
  }

  const beforeOpen = current < opens;
  const afterClose = closes !== 1439 && current >= closes;
  if (beforeOpen || afterClose) {
    return {
      canOrder: false,
      title: "Restaurant is currently closed",
      message: `Online ordering is open from ${day.open} to ${day.close} IST today. Please try again during opening hours.`,
    };
  }

  return {
    canOrder: true,
    title: "Online ordering is open",
    message: "You can place an order while the restaurant is open.",
  };
}

export default function PublicMenu() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();

  const hasTableParam = searchParams.has("table");
  const tableToken = searchParams.get("table");

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [tableContext, setTableContext] = useState(null);
  const [publicFeatures, setPublicFeatures] = useState({ ...DEFAULT_PUBLIC_FEATURES });

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState("menu");
  const [activePromoSlide, setActivePromoSlide] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyPhone, setLoyaltyPhone] = useState(() => getStoredKhaavioLoyaltyPhone(slug));
  const [orderNotes, setOrderNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [orderResult, setOrderResult] = useState(null);
  const [availabilityNow, setAvailabilityNow] = useState(0);
  const [subscriptionAllowsTransactions, setSubscriptionAllowsTransactions] =
    useState(null);

  const canUseLoyaltyRewards = publicFeatures.loyalty_rewards === true;
  const canUsePrivateFeedback = publicFeatures.private_feedback === true;
  const canShowGoogleReviewLink = publicFeatures.google_review_link === true
    && isValidGoogleReviewUrl(restaurant?.google_review_url);
  const canShowReviewsTab = shouldShowPublicReviewsTab(
    publicFeatures,
    canShowGoogleReviewLink,
    hasSocialLinks(restaurant?.social_links),
  );
  const canUseAskKhaavio = publicFeatures.ai_menu_assistant === true;

  function handleLoyaltyPhoneChange(value) {
    setLoyaltyPhone(value);
    setStoredKhaavioLoyaltyPhone(slug, value);
  }

  function switchBottomTab(tab) {
    setIsCartOpen(false);
    setActiveBottomTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (activeBottomTab === "rewards" && !canUseLoyaltyRewards) {
      setActiveBottomTab("menu");
    } else if (activeBottomTab === "reviews" && !canShowReviewsTab) {
      setActiveBottomTab("menu");
    }
  }, [activeBottomTab, canUseLoyaltyRewards, canShowReviewsTab]);

  // Give each published restaurant menu a useful, restaurant-specific title.
  useEffect(() => {
    if (!restaurant?.name) return;

    const pageTitle = `${restaurant.name} Digital Menu | Khaavio`;
    const pageDescription = `Explore ${restaurant.name}'s digital menu on Khaavio. Browse available dishes and prices, and use table QR ordering where available.`;
    document.title = pageTitle;

    const setMeta = (selector, attribute, key, content) => {
      let node = document.head.querySelector(selector);
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute(attribute, key);
        document.head.appendChild(node);
      }
      node.setAttribute("content", content);
    };

    setMeta('meta[name="description"]', "name", "description", pageDescription);
    setMeta('meta[name="robots"]', "name", "robots", "index,follow,max-image-preview:large");
    setMeta('meta[property="og:title"]', "property", "og:title", pageTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", pageDescription);
    setMeta('meta[property="og:url"]', "property", "og:url", `https://khaavio.in/menu/${encodeURIComponent(restaurant.slug || slug)}`);
    setMeta('meta[property="og:image"]', "property", "og:image", "https://khaavio.in/khaavio-social-preview.png");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", pageTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", pageDescription);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", "https://khaavio.in/khaavio-social-preview.png");

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `https://khaavio.in/menu/${encodeURIComponent(restaurant.slug || slug)}`;
  }, [restaurant?.name, restaurant?.slug, slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      setLoading(true);
      setError("");
      setRestaurant(null);
      setCategories([]);
      setItems([]);
      setTableContext(null);
      setCategoryId("all");
      setCart([]);
      setIsCartOpen(false);
      setOrderResult(null);
      setCheckoutError("");
      setSubscriptionAllowsTransactions(null);
      setPublicFeatures({ ...DEFAULT_PUBLIC_FEATURES });
      setActiveBottomTab("menu");

      try {
        const { data: menuSnapshot, error: restaurantError } = await supabase.rpc(
          "khaavio_public_restaurant_menu",
          { p_slug: slug },
        );
        if (restaurantError) throw restaurantError;
        const restaurantData = menuSnapshot?.restaurant;

        if (!restaurantData) {
          throw new Error(
            "This menu is not published yet, or the link is incorrect.",
          );
        }

        // Public menus receive only a small, non-sensitive set of plan entitlements.
        // If the RPC is unavailable, Growth-only public features fail closed while
        // core menu browsing remains available.
        let resolvedPublicFeatures = { ...DEFAULT_PUBLIC_FEATURES };
        try {
          const { data: featureData, error: featureError } = await supabase.rpc(
            "khaavio_public_restaurant_feature_flags",
            { p_slug: slug },
          );
          if (!featureError) {
            resolvedPublicFeatures = normalizePublicFeatureFlags(featureData);
          }
        } catch {
          resolvedPublicFeatures = { ...DEFAULT_PUBLIC_FEATURES };
        }

        // Branding is included in the least-privilege public menu snapshot.
        // The transaction-access RPC below returns only a boolean; order RPCs
        // continue to enforce transaction access independently on the server.
        let transactionAccess = null;
        const { data: accessData, error: accessError } = await supabase.rpc(
          "khaavio_public_restaurant_can_transact",
          { p_slug: slug },
        );
        if (!accessError) transactionAccess = accessData === true;

        let resolvedTable = null;

        // A table-specific QR must resolve to a valid active table.
        if (hasTableParam) {
          const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

          if (!tableToken || !uuidPattern.test(tableToken)) {
            throw new Error(
              "This table QR code is invalid. Please ask staff for a new code.",
            );
          }

          const { data: tableData, error: validationError } =
            await supabase.rpc("resolve_public_table", {
              p_slug: slug,
              p_token: tableToken,
            });

          if (validationError) throw validationError;

          resolvedTable = Array.isArray(tableData) ? tableData[0] : tableData;

          if (
            !resolvedTable ||
            resolvedTable.restaurant_id !== restaurantData.id
          ) {
            throw new Error(
              "This table QR is inactive or invalid. Please ask staff for assistance.",
            );
          }
        }

        const publicCategories = Array.isArray(menuSnapshot?.categories)
          ? menuSnapshot.categories
          : [];
        const publicItems = Array.isArray(menuSnapshot?.items)
          ? menuSnapshot.items
          : [];

        if (cancelled) return;

        setRestaurant(restaurantData);
        setPublicFeatures(resolvedPublicFeatures);
        setSubscriptionAllowsTransactions(transactionAccess);
        setAvailabilityNow(Date.now());

        setCategories(
          [...publicCategories].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );

        setItems(
          [...publicItems].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );

        setTableContext(resolvedTable);
      } catch (err) {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Unable to load this menu. Please try again."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMenu();

    return () => {
      cancelled = true;
    };
  }, [slug, tableToken, hasTableParam]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setAvailabilityNow(Date.now());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Keep the compact food-highlight slider moving only while the Menu tab is visible.
  useEffect(() => {
    if (activeBottomTab !== "menu") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActivePromoSlide((current) => (current + 1) % 3);
    }, 5200);

    return () => window.clearInterval(intervalId);
  }, [activeBottomTab]);

  useEffect(() => {
    if (!isCartOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape" && !submitting) setIsCartOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isCartOpen, submitting]);



  const visibleItems = items.filter((item) => {
    const matchesCategory =
      categoryId === "all" || item.category_id === categoryId;

    const searchableText =
      `${item.name || ""} ${item.description || ""}`.toLowerCase();

    return (
      matchesCategory && searchableText.includes(search.trim().toLowerCase())
    );
  });

  const promoImageItems = items.filter((item) => Boolean(item.image_url));
  const promoSlides = [
    {
      eyebrow: "FRESH FAVOURITES",
      titleStart: "Good food,",
      titleAccent: "better moments.",
      description: "Fresh favourites, right at your table.",
      imageItem: promoImageItems[0],
    },
    {
      eyebrow: "FROM OUR KITCHEN",
      titleStart: "Find your next",
      titleAccent: "favourite.",
      description: "Explore the dishes made for your table.",
      imageItem: promoImageItems[1] || promoImageItems[0],
    },
    {
      eyebrow: "ORDER WITH EASE",
      titleStart: "Your favourites,",
      titleAccent: "just a tap away.",
      description: "Browse the menu and add dishes to your order.",
      imageItem: promoImageItems[2] || promoImageItems[0],
    },
  ];
  const currentPromoSlide = promoSlides[activePromoSlide] || promoSlides[0];

  const cartTotal = cart.reduce(
    (total, entry) => total + Number(entry.price) * entry.quantity,
    0,
  );

  const cartQuantity = cart.reduce((total, entry) => total + entry.quantity, 0);

  const baseOrderingAvailability = getRestaurantAvailability(
    restaurant,
    availabilityNow,
  );
  const orderingAvailability =
    subscriptionAllowsTransactions !== true
      ? {
          canOrder: false,
          title: "Online ordering is temporarily unavailable",
          message:
            "This restaurant is not currently accepting online orders. Please contact the restaurant team for assistance.",
        }
      : baseOrderingAvailability;

  function addToCart(item) {
    setCheckoutError("");
    setOrderResult(null);

    const existing = cart.find((entry) => entry.id === item.id);

    if (existing && existing.quantity >= 20) {
      setCheckoutError(
        "You can order up to 20 units of a single dish per order.",
      );
      return;
    }

    setCart((current) => {
      const entry = current.find((row) => row.id === item.id);

      if (entry) {
        return current.map((row) =>
          row.id === item.id ? { ...row, quantity: row.quantity + 1 } : row,
        );
      }

      return [...current, { ...item, quantity: 1 }];
    });
  }

  function changeQuantity(itemId, difference) {
    setCheckoutError("");
    setOrderResult(null);

    const existing = cart.find((entry) => entry.id === itemId);

    if (!existing) return;

    if (existing.quantity + difference > 20) {
      setCheckoutError(
        "You can order up to 20 units of a single dish per order.",
      );
      return;
    }

    setCart((current) =>
      current.flatMap((entry) => {
        if (entry.id !== itemId) return [entry];

        const nextQuantity = entry.quantity + difference;

        return nextQuantity > 0 ? [{ ...entry, quantity: nextQuantity }] : [];
      }),
    );
  }

  function removeFromCart(itemId) {
    setCart((current) => current.filter((entry) => entry.id !== itemId));
    setCheckoutError("");
    setOrderResult(null);
  }

  function resetOrderForm() {
    setOrderResult(null);
    setCheckoutError("");
    setCart([]);
  }

  async function placeOrder(event) {
    event.preventDefault();
    setCheckoutError("");

    if (submitting) return;

    if (subscriptionAllowsTransactions !== true) {
      setCheckoutError(
        "Online ordering is temporarily unavailable at this restaurant. Please contact the restaurant team.",
      );
      return;
    }

    const currentAvailability = getRestaurantAvailability(
      restaurant,
      Date.now(),
    );
    if (!currentAvailability.canOrder) {
      setCheckoutError(currentAvailability.message);
      return;
    }

    if (!tableContext || !tableToken) {
      setCheckoutError(
        "To place an order, scan the QR code assigned to your restaurant table.",
      );
      return;
    }

    if (cart.length === 0) {
      setCheckoutError("Add at least one dish to your cart.");
      return;
    }

    const name = customerName.trim();

    if (!name || name.length > 80) {
      setCheckoutError("Enter your name (maximum 80 characters).");
      return;
    }

    if (customerPhone.trim().length > 25) {
      setCheckoutError("Phone number must be 25 characters or fewer.");
      return;
    }

    if (orderNotes.trim().length > 500) {
      setCheckoutError("Order notes must be 500 characters or fewer.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        p_slug: slug,
        p_table_token: tableToken,
        p_customer_name: name,
        p_customer_phone: customerPhone.trim() || null,
        p_notes: orderNotes.trim() || null,
        p_items: cart.map((entry) => ({
          item_id: entry.id,
          quantity: entry.quantity,
        })),
        p_loyalty_member_token: getOrCreateKhaavioLoyaltyToken(slug),
        p_loyalty_phone: loyaltyPhone || null,
      };

      const { data, error: orderError } = await supabase.rpc(
        "place_public_order_with_loyalty",
        payload,
      );

      if (orderError) throw orderError;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.order_id) {
        throw new Error(
          "We couldn't confirm the order reference. Please check with restaurant staff before submitting again.",
        );
      }

      setOrderResult({
        id: result.order_id,
        reference: result.order_reference,
        total: result.total_amount,
        trackingToken: result.tracking_token || null,
      });

      setCart([]);
      setOrderNotes("");
    } catch (err) {
      setCheckoutError(
        getErrorMessage(
          err,
          "We couldn't place your order. Please review your cart and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="public-menu-page public-menu-loading">
        <div className="public-menu-loader-mark" aria-hidden="true">
          <UtensilsCrossed size={24} />
        </div>
        <LoaderCircle className="public-menu-spinner" size={28} />
        <p>Preparing your menu...</p>
      </main>
    );
  }

  return (
    <main className="public-menu-page">
      <header className="public-menu-header">
        <div
          className="public-menu-brand"
          aria-label={`${restaurant?.name || "Restaurant"} menu`}
        >
          <span className="public-menu-brand-mark" aria-hidden="true">
            <span className="public-menu-brand-initial">
              {(restaurant?.name || "R").trim().charAt(0).toUpperCase()}
            </span>
            {restaurant?.logo_url && (
              <img
                src={restaurant.logo_url}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.opacity = "0";
                }}
              />
            )}
          </span>
          <span className="public-menu-brand-copy">
            <strong>{restaurant?.name || "Restaurant"}</strong>
            <small>
              {restaurant?.restaurant_type
                ? restaurant.restaurant_type.replace(/_/g, " ")
                : "Restaurant menu"}
            </small>
          </span>
        </div>

        <div className="public-menu-header-actions">
          {tableContext && (
            <span
              className="public-menu-table-badge"
              aria-label={`Ordering at table ${tableContext.table_number}`}
            >
              <UtensilsCrossed size={17} aria-hidden="true" />
              <span>Table {tableContext.table_number}</span>
            </span>
          )}
          <button
            type="button"
            className="public-menu-header-cart"
            aria-label={`View cart with ${cartQuantity} items`}
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingBag size={17} />
            <span>View cart</span>
            <b>{cartQuantity}</b>
          </button>
        </div>
      </header>

      {error ? (
        <section className="public-menu-state">
          <div className="public-menu-state-icon">
            <UtensilsCrossed size={28} />
          </div>
          <span className="public-menu-eyebrow">MENU UNAVAILABLE</span>
          <h1>Menu unavailable</h1>
          <p>{error}</p>
          <Link to="/" className="public-menu-button">
            <ArrowLeft size={16} />
            Return home
          </Link>
        </section>
      ) : restaurant ? (
        <>
          {activeBottomTab === "menu" && (
            <>
          <section className="public-menu-promo-slider" aria-label="Restaurant food highlights">
            <div className="public-menu-promo-image" aria-hidden="true">
              {currentPromoSlide.imageItem?.image_url ? (
                <img
                  key={currentPromoSlide.imageItem.id}
                  src={currentPromoSlide.imageItem.image_url}
                  alt=""
                  fetchPriority={activePromoSlide === 0 ? "high" : "auto"}
                />
              ) : (
                <div className="public-menu-promo-image-placeholder">
                  <UtensilsCrossed size={38} aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="public-menu-promo-copy" key={activePromoSlide}>
              <span className="public-menu-promo-eyebrow">
                <span aria-hidden="true" />
                {currentPromoSlide.eyebrow}
              </span>
              <h1>
                <span>{currentPromoSlide.titleStart}</span>
                <strong>{currentPromoSlide.titleAccent}</strong>
              </h1>
              <p>{currentPromoSlide.description}</p>
            </div>

            <div className="public-menu-promo-dots" aria-label="Choose banner">
              {promoSlides.map((slide, index) => (
                <button
                  key={slide.eyebrow}
                  type="button"
                  className={index === activePromoSlide ? "is-active" : ""}
                  aria-label={`Show banner ${index + 1}`}
                  aria-pressed={index === activePromoSlide}
                  onClick={() => setActivePromoSlide(index)}
                />
              ))}
            </div>
          </section>

          <section className="public-menu-content" id="menu">
            <div className="public-menu-tools">
              <label className="public-menu-search">
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Search dishes, cuisine..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search menu items"
                />
                {search && (
                  <button
                    type="button"
                    className="public-menu-clear-search"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>
              <span className="public-menu-tools-note">
                <Leaf size={14} />
                Freshly listed by the restaurant
              </span>
            </div>

            <div
              className="public-menu-categories"
              aria-label="Menu categories"
            >
              <button
                type="button"
                className={categoryId === "all" ? "active" : ""}
                onClick={() => setCategoryId("all")}
                aria-pressed={categoryId === "all"}
              >
                All
              </button>

              {categories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={categoryId === category.id ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={categoryId === category.id}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="public-menu-section-heading">
              <h2>Popular dishes</h2>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryId("all");
                }}
                aria-label="See all dishes"
              >
                See all <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>

            {visibleItems.length > 0 ? (
              <div className="public-menu-grid">
                {visibleItems.map((item) => {
                  const category = categories.find(
                    (entry) => entry.id === item.category_id,
                  );
                  const cartEntry = cart.find((entry) => entry.id === item.id);

                  return (
                    <article className="public-menu-card" key={item.id}>
                      <div className="public-menu-card-media">
                        {item.image_url ? (
                          <img
                            className="public-menu-image"
                            src={item.image_url}
                            alt={item.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="public-menu-image-empty">
                            <UtensilsCrossed size={25} />
                            <span>Made with care</span>
                          </div>
                        )}
                        <span className="public-menu-item-available">
                          <span />
                          Available
                        </span>
                      </div>

                      <div className="public-menu-card-body">
                        <span className="public-menu-item-category">
                          {category?.name || "From our kitchen"}
                        </span>
                        <h3>{item.name}</h3>

                        {item.description && (
                          <p className="public-menu-description">
                            {item.description}
                          </p>
                        )}

                        <div className="public-menu-item-footer">
                          <strong>{formatPrice(item.price)}</strong>
                          {cartEntry ? (
                            <div className="public-menu-add-controls">
                              <button
                                type="button"
                                aria-label={`Remove one ${item.name}`}
                                onClick={() => changeQuantity(item.id, -1)}
                              >
                                <Minus size={14} />
                              </button>
                              <strong>{cartEntry.quantity}</strong>
                              <button
                                type="button"
                                aria-label={`Add one ${item.name}`}
                                onClick={() => changeQuantity(item.id, 1)}
                                disabled={cartEntry.quantity >= 20}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="public-menu-add-button"
                              onClick={() => addToCart(item)}
                              aria-label={`Add ${item.name} to order`}
                            >
                              <Plus size={16} />
                              Add
                            </button>
                          )}
                        </div>
                        {cartEntry && (
                          <span className="public-menu-quantity-hint">
                            {cartEntry.quantity} in your cart
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="public-menu-empty">
                <div className="public-menu-empty-icon">
                  <Search size={24} />
                </div>
                <h3>No dishes found</h3>
                <p>
                  {items.length
                    ? "Try another search or choose a different category."
                    : "This restaurant has no available dishes yet."}
                </p>
                {(search || categoryId !== "all") && (
                  <button
                    type="button"
                    className="public-menu-reset-filters"
                    onClick={() => {
                      setSearch("");
                      setCategoryId("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </section>
            </>
          )}

          {activeBottomTab === "rewards" && canUseLoyaltyRewards && (
            <section className="public-menu-tab-view public-menu-rewards-view" aria-labelledby="public-menu-rewards-title">
              <div className="public-menu-tab-hero public-menu-tab-hero-rewards">
                <span className="public-menu-tab-eyebrow"><Gift size={15} /> YOUR REWARDS</span>
                <h1 id="public-menu-rewards-title">Dine more, get rewarded.</h1>
                <p>Collect stamps on eligible orders and unlock treats from {restaurant.name}.</p>
              </div>
              <div className="public-menu-tab-content">
                <PublicLoyaltyClub
                  slug={slug}
                  phone={loyaltyPhone}
                  onPhoneChange={handleLoyaltyPhoneChange}
                />
              </div>
            </section>
          )}

          {activeBottomTab === "book" && (
            <div className="public-menu-tab-view public-menu-booking-view">
              <PublicBooking
                slugOverride={slug}
                embedded
                onReturnToMenu={() => switchBottomTab("menu")}
              />
            </div>
          )}

          {activeBottomTab === "reviews" && canShowReviewsTab && (
            <section className="public-menu-tab-view public-menu-reviews-view" aria-labelledby="public-menu-reviews-heading">
              <div className="public-menu-tab-hero public-menu-tab-hero-reviews">
                <span className="public-menu-tab-eyebrow"><Star size={15} /> RATINGS & REVIEW</span>
                <h1 id="public-menu-reviews-heading">{canUsePrivateFeedback ? "Your feedback means a lot." : "Enjoyed your visit?"}</h1>
                <p>{canUsePrivateFeedback
                  ? `Tell ${restaurant.name} how your experience went, or leave an honest Google review.`
                  : `Leave an honest Google review to help other guests discover ${restaurant.name}.`}</p>
              </div>
              <div className="public-menu-tab-content">
                <PublicReviewsFeedback
                  restaurantSlug={slug}
                  restaurantName={restaurant.name}
                  googleReviewUrl={restaurant.google_review_url}
                  socialLinks={restaurant.social_links}
                  allowGoogleReviewLink={publicFeatures.google_review_link}
                  allowPrivateFeedback={canUsePrivateFeedback}
                />
              </div>
            </section>
          )}

          {isCartOpen && (
            <div
              className="public-cart-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting) {
                  setIsCartOpen(false);
                }
              }}
            >
              <section
                className="public-order-section public-cart-drawer"
                id="your-order"
                role="dialog"
                aria-modal="true"
                aria-labelledby="public-cart-heading"
                tabIndex={-1}
              >
                <div className="public-cart-drawer-topbar">
                  <span className="public-menu-eyebrow">YOUR SELECTION</span>
                  <button
                    type="button"
                    className="public-cart-drawer-close"
                    aria-label="Close cart"
                    onClick={() => setIsCartOpen(false)}
                    disabled={submitting}
                  >
                    <X size={19} />
                  </button>
                </div>
                <div className="public-order-heading">
                  <div>
                    <span className="public-menu-eyebrow">
                      READY WHEN YOU ARE
                    </span>
                    <h2 id="public-cart-heading">Your order</h2>
                    <p>
                      Review your selection before sending it to the kitchen.
                    </p>
                  </div>

                  <span className="public-order-count">
                    <ShoppingBag size={15} />
                    {cartQuantity} {cartQuantity === 1 ? "item" : "items"}
                  </span>
                </div>

                {orderResult ? (
                  <div className="public-order-success" role="status">
                    <div className="public-order-success-icon">
                      <CheckCircle2 size={30} />
                    </div>

                    <span className="public-menu-eyebrow">ORDER SUBMITTED</span>
                    <h3>Thank you, {customerName.trim()}!</h3>
                    <p>
                      Your order was saved successfully. Please share the
                      reference below with restaurant staff.
                    </p>

                    <div className="public-order-reference">
                      <span>Order reference</span>
                      <strong>{orderResult.reference}</strong>
                    </div>

                    <div className="public-order-confirmed-total">
                      <span>Confirmed total</span>
                      <strong>{formatPrice(orderResult.total)}</strong>
                    </div>

                    {orderResult.trackingToken ? (
                      <>
                        <p className="public-order-pending-note">
                          Your order is pending. Follow its progress using the
                          secure tracking link below. Online payment has not
                          been collected for this order.
                        </p>

                        <Link
                          className="public-order-track-link"
                          to={`/track/${encodeURIComponent(slug)}/${encodeURIComponent(
                            orderResult.id,
                          )}?token=${encodeURIComponent(orderResult.trackingToken)}`}
                        >
                          Track my order
                          <ChevronRight size={17} />
                        </Link>
                      </>
                    ) : (
                      <p className="public-order-pending-note">
                        Your order was submitted, but a tracking link could not
                        be generated. Please share your order reference with
                        restaurant staff and avoid placing the same order again.
                      </p>
                    )}

                    <button
                      type="button"
                      className="public-order-submit public-order-secondary-submit"
                      onClick={() => {
                        resetOrderForm();
                        setIsCartOpen(false);
                      }}
                    >
                      Place another order
                    </button>
                  </div>
                ) : cart.length === 0 ? (
                  <div className="public-order-empty">
                    <div className="public-menu-empty-icon">
                      <ShoppingBag size={24} />
                    </div>
                    <h3>Your cart is waiting</h3>
                    <p>
                      Add a dish from the menu above and it will show up here.
                    </p>
                    <a
                      href="#menu"
                      className="public-menu-secondary-link"
                      onClick={() => setIsCartOpen(false)}
                    >
                      Browse menu
                      <ChevronRight size={16} />
                    </a>
                  </div>
                ) : (
                  <div className="public-order-layout">
                    <div className="public-order-cart">
                      <div className="public-order-cart-heading">
                        <h3>Items in your cart</h3>
                        <button
                          type="button"
                          className="public-order-clear"
                          onClick={() => {
                            setCart([]);
                            setCheckoutError("");
                            setOrderResult(null);
                          }}
                        >
                          Clear cart
                        </button>
                      </div>

                      {cart.map((entry) => (
                        <div className="public-order-line" key={entry.id}>
                          <div className="public-order-line-info">
                            <strong>{entry.name}</strong>
                            <span>{formatPrice(entry.price)} each</span>
                          </div>

                          <div className="public-order-line-controls">
                            <button
                              type="button"
                              aria-label={`Decrease ${entry.name} quantity`}
                              onClick={() => changeQuantity(entry.id, -1)}
                            >
                              <Minus size={14} />
                            </button>
                            <span>{entry.quantity}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${entry.name} quantity`}
                              onClick={() => changeQuantity(entry.id, 1)}
                              disabled={entry.quantity >= 20}
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <strong className="public-order-line-total">
                            {formatPrice(Number(entry.price) * entry.quantity)}
                          </strong>

                          <button
                            className="public-order-remove"
                            type="button"
                            aria-label={`Remove ${entry.name} from cart`}
                            onClick={() => removeFromCart(entry.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}

                      <div className="public-order-total">
                        <span>Estimated total</span>
                        <strong>{formatPrice(cartTotal)}</strong>
                      </div>
                      <p className="public-order-estimate-note">
                        Final amount is recalculated using current menu prices
                        when you submit your order.
                      </p>
                    </div>

                    <form className="public-order-form" onSubmit={placeOrder}>
                      <h3>Customer details</h3>

                      {tableContext ? (
                        <div className="public-order-table-info">
                          <CheckCircle2 size={16} />
                          <span>
                            Ordering for table{" "}
                            <strong>{tableContext.table_number}</strong>
                          </span>
                        </div>
                      ) : (
                        <div className="public-order-table-warning">
                          Open this menu by scanning the QR code assigned to
                          your restaurant table to place an order.
                        </div>
                      )}

                      <label>
                        <span>Your name *</span>
                        <input
                          value={customerName}
                          onChange={(event) =>
                            setCustomerName(event.target.value)
                          }
                          maxLength={80}
                          autoComplete="name"
                          placeholder="Enter your name"
                          required
                        />
                      </label>

                      <label>
                        <span>Phone number (optional)</span>
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(event) =>
                            setCustomerPhone(event.target.value)
                          }
                          maxLength={25}
                          autoComplete="tel"
                          placeholder="Enter phone number"
                        />
                      </label>

                      <label>
                        <span>Special instructions (optional)</span>
                        <textarea
                          value={orderNotes}
                          onChange={(event) =>
                            setOrderNotes(event.target.value)
                          }
                          maxLength={500}
                          rows={3}
                          placeholder="e.g. Less spicy, no onion..."
                        />
                      </label>

                      {checkoutError && (
                        <div className="public-order-error" role="alert">
                          {checkoutError}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="public-order-submit"
                        disabled={
                          submitting ||
                          subscriptionAllowsTransactions !== true ||
                          cart.length === 0 ||
                          !tableContext ||
                          !orderingAvailability.canOrder
                        }
                      >
                        {submitting ? (
                          <LoaderCircle
                            className="public-menu-spinner"
                            size={17}
                          />
                        ) : (
                          <ShoppingBag size={17} />
                        )}
                        {submitting
                          ? "Submitting order..."
                          : `Place order Â· ${formatPrice(cartTotal)}`}
                      </button>

                      <p className="public-order-disclaimer">
                        {!orderingAvailability.canOrder
                          ? orderingAvailability.message
                          : "No online payment is collected. The restaurant receives this order as pending."}
                      </p>
                    </form>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeBottomTab === "menu" && (
          <footer className="public-menu-footer">
            <a
              className="public-menu-footer-brand"
              href="https://khaavio.in/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Khaavio â€” restaurant ordering platform"
            >
              <img src={khaavioIcon} alt="" />
              <div>
                <span>
                  Powered by <strong>Khaavio</strong>
                </span>
                <small>A better way to order</small>
              </div>
            </a>
          </footer>
          )}

          <nav className="public-menu-bottom-navigation" aria-label="Public menu navigation">
            <button
              type="button"
              className={activeBottomTab === "menu" ? "is-active" : ""}
              aria-pressed={activeBottomTab === "menu"}
              onClick={() => switchBottomTab("menu")}
            >
              <UtensilsCrossed size={19} strokeWidth={2.1} />
              <span>Menu</span>
            </button>
            {canUseLoyaltyRewards && (
              <button
                type="button"
                className={activeBottomTab === "rewards" ? "is-active" : ""}
                aria-pressed={activeBottomTab === "rewards"}
                onClick={() => switchBottomTab("rewards")}
              >
                <Gift size={19} strokeWidth={2.1} />
                <span>Rewards</span>
              </button>
            )}
            <button
              type="button"
              className={activeBottomTab === "book" ? "is-active" : ""}
              aria-pressed={activeBottomTab === "book"}
              onClick={() => switchBottomTab("book")}
            >
              <CalendarDays size={19} strokeWidth={2.1} />
              <span>Book table</span>
            </button>
            {canShowReviewsTab && (
              <button
                type="button"
                className={activeBottomTab === "reviews" ? "is-active" : ""}
                aria-pressed={activeBottomTab === "reviews"}
                onClick={() => switchBottomTab("reviews")}
              >
                <Star size={19} strokeWidth={2.1} />
                <span>Ratings & Review</span>
              </button>
            )}
          </nav>

          <PublicTableService
            slug={slug}
            tableToken={tableToken}
            tableContext={tableContext}
            hasStickyCart={activeBottomTab === "menu" && cart.length > 0 && !orderResult && !isCartOpen}
          />

          {canUseAskKhaavio && (
            <AskKhaavio
              restaurant={restaurant}
              menuItems={items}
              categories={categories}
              onAddToCart={addToCart}
              hasStickyCart={activeBottomTab === "menu" && cart.length > 0 && !orderResult && !isCartOpen}
            />
          )}

          {activeBottomTab === "menu" && cart.length > 0 && !orderResult && !isCartOpen && (
            <button
              type="button"
              className="public-menu-sticky-cart"
              aria-label={`View cart with ${cartQuantity} items, total ${formatPrice(cartTotal)}`}
              onClick={() => setIsCartOpen(true)}
            >
              <span className="public-menu-sticky-cart-count">
                <ShoppingBag size={17} />
                {cartQuantity}
              </span>
              <span className="public-menu-sticky-cart-label">
                <small>
                  {cartQuantity === 1
                    ? "1 ITEM ADDED"
                    : `${cartQuantity} ITEMS ADDED`}
                </small>
                <strong>{formatPrice(cartTotal)}</strong>
              </span>
              <span className="public-menu-sticky-cart-action">
                View cart
                <ChevronRight size={17} />
              </span>
            </button>
          )}
        </>
      ) : null}
    </main>
  );
}

