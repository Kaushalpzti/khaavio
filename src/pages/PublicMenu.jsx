import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Leaf,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import PublicTableService from "../components/PublicTableService";
import PublicReviewsFeedback from "../components/PublicReviewsFeedback";
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

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [orderResult, setOrderResult] = useState(null);
  const [availabilityNow, setAvailabilityNow] = useState(0);
  const [subscriptionAllowsTransactions, setSubscriptionAllowsTransactions] =
    useState(null);

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

      try {
        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select(
            "id, name, slug, restaurant_type, address, google_review_url, is_published, is_accepting_orders, business_hours, timezone",
          )
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle();

        if (restaurantError) throw restaurantError;

        if (!restaurantData) {
          throw new Error(
            "This menu is not published yet, or the link is incorrect.",
          );
        }

        // Restaurant logo is optional. If column access/storage is unavailable,
        // the menu continues to work with a restaurant-name fallback mark.
        let restaurantLogoUrl = null;
        try {
          const { data: logoData, error: logoError } = await supabase
            .from("restaurants")
            .select("logo_url")
            .eq("id", restaurantData.id)
            .maybeSingle();
          if (!logoError) restaurantLogoUrl = logoData?.logo_url || null;
        } catch {
          // Optional branding must never block ordering or menu browsing.
        }

        // This public RPC returns only a boolean. The order RPC independently enforces access server-side.
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

        const [categoryResult, itemResult] = await Promise.all([
          supabase
            .from("menu_categories")
            .select("id, name, restaurant_id")
            .eq("restaurant_id", restaurantData.id),

          supabase
            .from("menu_items")
            .select(
              "id, name, description, price, image_url, is_available, category_id",
            )
            .eq("restaurant_id", restaurantData.id)
            .eq("is_available", true),
        ]);

        if (categoryResult.error) throw categoryResult.error;
        if (itemResult.error) throw itemResult.error;

        if (cancelled) return;

        setRestaurant({ ...restaurantData, logo_url: restaurantLogoUrl });
        setSubscriptionAllowsTransactions(transactionAccess);
        setAvailabilityNow(Date.now());

        setCategories(
          [...(categoryResult.data || [])].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );

        setItems(
          [...(itemResult.data || [])].sort((a, b) =>
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

  const cartTotal = cart.reduce(
    (total, entry) => total + Number(entry.price) * entry.quantity,
    0,
  );

  const cartQuantity = cart.reduce((total, entry) => total + entry.quantity, 0);

  const featuredItem = items.find((item) => item.image_url) || items[0] || null;

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
      };

      const { data, error: orderError } = await supabase.rpc(
        "place_public_order",
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
          <section className="public-menu-hero">
            <div className="public-menu-hero-copy">
              <div className="public-menu-hero-kicker">
                <span className="public-menu-kicker-dot" />
                {restaurant.restaurant_type
                  ? restaurant.restaurant_type.replace(/_/g, " ")
                  : "A PLACE FOR GOOD FOOD"}
              </div>

              <h1>Good food, better moments.</h1>

              <p className="public-menu-hero-description">
                Discover something delicious. Browse the menu, choose your
                favourites, and let the good food moments begin.
              </p>

              <div className="public-menu-hero-facts">
                {restaurant.address && (
                  <span>
                    <MapPin size={15} />
                    {restaurant.address}
                  </span>
                )}
                {tableContext && (
                  <span className="public-menu-hero-table">
                    <UtensilsCrossed size={15} />
                    Ordering at table {tableContext.table_number}
                  </span>
                )}
              </div>

              <div className="public-menu-hero-actions">
                <a href="#menu" className="public-menu-primary-link">
                  Explore menu
                  <ChevronRight size={17} />
                </a>
                <Link
                  to={`/book/${encodeURIComponent(restaurant.slug)}`}
                  className="public-menu-secondary-link"
                >
                  <CalendarDays size={16} />
                  Book a table
                </Link>
              </div>

              <div className="public-menu-hero-trust">
                <span className="public-menu-trust-icon">
                  <CheckCircle2 size={15} />
                </span>
                <span>Directly from the restaurant</span>
              </div>
            </div>

            <div className="public-menu-hero-visual">
              {featuredItem?.image_url ? (
                <img
                  src={featuredItem.image_url}
                  alt={featuredItem.name}
                  className="public-menu-feature-image"
                />
              ) : (
                <div className="public-menu-feature-placeholder">
                  <UtensilsCrossed size={42} />
                  <span>Fresh moments start here</span>
                </div>
              )}
              <div className="public-menu-feature-floating">
                <span className="public-menu-feature-label">
                  <Sparkles size={12} />
                  MADE WITH LOVE
                </span>
                <strong>Good food, happy moments.</strong>
                <span className="public-menu-feature-subtitle">
                  Freshly made, just for you.
                </span>
              </div>
              <div className="public-menu-hero-orb public-menu-hero-orb-one" />
              <div className="public-menu-hero-orb public-menu-hero-orb-two" />
            </div>

            <div className="public-menu-hero-status">
              <div
                className={`public-menu-order-availability ${orderingAvailability.canOrder ? "is-open" : "is-closed"}`}
                role="status"
              >
                <span className="public-menu-order-availability-dot" />
                <div className="public-menu-availability-copy">
                  <strong>{orderingAvailability.title}</strong>
                  <p>{orderingAvailability.message}</p>
                </div>
                <Clock3 size={17} className="public-menu-status-clock" />
              </div>
            </div>
          </section>

          <section className="public-menu-content" id="menu">
            <div className="public-menu-heading">
              <div>
                <span className="public-menu-eyebrow">
                  A LITTLE SOMETHING FOR EVERYONE
                </span>
                <h2>What are you craving?</h2>
                <p>Good food starts with a good choice.</p>
              </div>

              <div className="public-menu-count-card">
                <span>{items.length}</span>
                <small>
                  {items.length === 1 ? "dish available" : "dishes available"}
                </small>
              </div>
            </div>

            <div className="public-menu-tools">
              <label className="public-menu-search">
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Search dishes..."
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
                All dishes
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

          {restaurant?.id && tableContext && (
            <div className="public-reviews-table-placement">
              <PublicReviewsFeedback
                restaurantSlug={slug}
                restaurantName={restaurant.name}
                googleReviewUrl={restaurant.google_review_url}
              />
            </div>
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
                          : `Place order · ${formatPrice(cartTotal)}`}
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

          {restaurant?.id && !tableContext && (
            <PublicReviewsFeedback
              restaurantSlug={slug}
              restaurantName={restaurant.name}
              googleReviewUrl={restaurant.google_review_url}
            />
          )}
          <footer className="public-menu-footer">
            <a
              className="public-menu-footer-brand"
              href="https://khaavio.in/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Khaavio — restaurant ordering platform"
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

          <PublicTableService slug={slug} tableToken={tableToken} tableContext={tableContext} />

          <AskKhaavio
            restaurant={restaurant}
            menuItems={items}
            categories={categories}
            onAddToCart={addToCart}
            hasStickyCart={cart.length > 0 && !orderResult && !isCartOpen}
          />

          {cart.length > 0 && !orderResult && !isCartOpen && (
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
