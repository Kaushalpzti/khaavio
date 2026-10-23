import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ChefHat,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  LoaderCircle,
  LogOut,
  QrCode,
  Store,
  Settings,
  UtensilsCrossed,
  AlertCircle,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import khaavioIcon from "../assets/icon.png";
import SubscriptionExpiryBanner from "../components/SubscriptionExpiryBanner";
import SupportHelpPanel from "../components/SupportHelpPanel";

import "./Dashboard.css";

const modules = [
  {
    title: "Restaurant profile",
    description: "Your restaurant identity and business details.",
    status: "Saved",
    icon: Store,
  },

  {
    title: "Restaurant settings",
    description: "Update your restaurant profile and business details.",
    status: "Available",
    icon: Settings,
  },

  {
    title: "Analytics",
    description:
      "Track completed order value, popular dishes and upcoming bookings.",
    status: "Available",
    icon: BarChart3,
  },
  {
    title: "Menu manager",
    description: "Add food items, categories, prices and photos.",
    status: "Available",
    icon: UtensilsCrossed,
  },
  {
    title: "QR Studio",
    description: "Generate and download your restaurant menu QR code.",
    status: "Available",
    icon: QrCode,
  },

  {
    title: "Table QR Codes",
    description: "Generate and download a unique menu QR for each table.",
    status: "Available",
    icon: QrCode,
  },

  {
    title: "Table bookings",
    description: "Review reservation requests and manage confirmations.",
    status: "Available",
    icon: CalendarDays,
  },
  {
    title: "Orders",
    description: "View incoming orders and manage kitchen progress.",
    status: "Available",
    icon: ClipboardList,
  },
  {
    title: "Kitchen Display",
    description: "View active orders, kitchen timers and preparation progress.",
    status: "Available",
    icon: ChefHat,
  },
  {
    title: "Subscription & plan",
    description: "View your current plan, trial status and access dates.",
    status: "Available",
    icon: CreditCard,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setLoadError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug, restaurant_type, address, is_published")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (restaurantError) throw restaurantError;

        if (!active) return;

        setEmail(user.email || "");
        setRestaurant(data);
      } catch (err) {
        if (active) {
          setLoadError(
            err?.message || "Could not load your restaurant workspace.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSignOut() {
    setSigningOut(true);
    setActionError("");

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) throw signOutError;

      navigate("/login", { replace: true });
    } catch (err) {
      setActionError(err?.message || "Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  async function togglePublication() {
    if (!restaurant || isPublishing) return;

    setActionError("");
    setIsPublishing(true);

    try {
      const shouldPublish = !restaurant.is_published;

      if (shouldPublish) {
        const { count, error: countError } = await supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant.id)
          .eq("is_available", true);

        if (countError) throw countError;

        if (!count) {
          throw new Error(
            "Add at least one available menu item before publishing.",
          );
        }
      }

      const { data, error: updateError } = await supabase
        .from("restaurants")
        .update({ is_published: shouldPublish })
        .eq("id", restaurant.id)
        .select("id, name, slug, restaurant_type, address, is_published")
        .single();

      if (updateError) throw updateError;

      setRestaurant(data);
    } catch (err) {
      setActionError(
        err?.message || "Could not update your menu's publishing status.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function retryLoad() {
    setLoading(true);
    setLoadError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const { data, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name, slug, restaurant_type, address, is_published")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (restaurantError) throw restaurantError;

      setEmail(user.email || "");
      setRestaurant(data);
    } catch (err) {
      setLoadError(err?.message || "Could not load your restaurant workspace.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link to="/" className="dashboard-brand" aria-label="Khaavio homepage">
          <img src={khaavioIcon} alt="" />
          <span>Khaavio</span>
        </Link>

        <div className="dashboard-header-actions">
          <span className="workspace-indicator">
            <span className="workspace-indicator-dot" />
            Workspace
          </span>

          <button
            className="signout-button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={16} />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <div className="dashboard-main">
        <div className="dashboard-eyebrow">YOUR RESTAURANT WORKSPACE</div>

        {loading ? (
          <section className="dashboard-state">
            <LoaderCircle className="dashboard-spinner" size={30} />
            <h2>Loading your workspace...</h2>
            <p>Fetching your restaurant details from Supabase.</p>{" "}
          </section>
        ) : loadError ? (
          <section className="dashboard-state dashboard-error">
            <AlertCircle size={30} />
            <h2>We couldn't load your workspace</h2>
            <p>{loadError}</p>
            <button className="dashboard-primary-button" onClick={retryLoad}>
              Try again
            </button>
          </section>
        ) : !restaurant ? (
          <section className="dashboard-state">
            <Store size={34} />
            <h2>No restaurant found</h2>
            <p>Complete onboarding to set up your restaurant workspace.</p>
            <Link to="/onboarding" className="dashboard-primary-button">
              Set up restaurant <ArrowUpRight size={17} />
            </Link>
          </section>
        ) : (
          <>
            {actionError && (
              <div className="dashboard-action-error" role="alert">
                <AlertCircle size={17} />
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={() => setActionError("")}
                  aria-label="Dismiss error"
                >
                  Ã—
                </button>
              </div>
            )}

            <section className="dashboard-welcome">
              <div>
                <h1>Welcome to {restaurant.name}.</h1>
                <p>Your restaurant's digital workspace starts here.</p>
              </div>

              <div className="database-badge">
                <CheckCircle2 size={17} />
                Connected to database
              </div>
            </section>

            {/* Subscription expiry reminder */}
            <SubscriptionExpiryBanner restaurantId={restaurant.id} />

            <section className="restaurant-summary">
              <div className="restaurant-summary-top">
                <div className="restaurant-avatar">
                  <Store size={25} />
                </div>

                <div className="restaurant-summary-name">
                  <span>YOUR RESTAURANT</span>
                  <h2>{restaurant.name}</h2>
                  <p>
                    {restaurant.restaurant_type
                      ? restaurant.restaurant_type.replace(/_/g, " ")
                      : "Restaurant workspace"}
                  </p>
                </div>

                <span className="saved-status">
                  <CheckCircle2 size={15} />
                  Saved
                </span>
              </div>

              <div className="restaurant-details">
                <div>
                  <span>Menu slug</span>
                  <strong>{restaurant.slug}</strong>
                </div>

                <div>
                  <span>Address</span>
                  <strong>{restaurant.address || "Not added yet"}</strong>
                </div>

                <div>
                  <span>Account</span>
                  <strong className="restaurant-email">
                    {email || "Signed in"}
                  </strong>
                </div>
              </div>

              <div className="menu-publication-panel">
                <div className="menu-publication-copy">
                  <strong>
                    {restaurant.is_published
                      ? "Your menu is live"
                      : "Your menu is private"}
                  </strong>

                  <p>
                    {restaurant.is_published
                      ? "Customers can open your public digital menu."
                      : "Publish your menu to make it accessible to customers."}
                  </p>

                  {restaurant.is_published && (
                    <a
                      href={`/menu/${encodeURIComponent(restaurant.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open public menu <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  className="menu-publication-button"
                  onClick={togglePublication}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <>
                      <LoaderCircle size={15} className="dashboard-spinner" />
                      Updating...
                    </>
                  ) : restaurant.is_published ? (
                    "Unpublish menu"
                  ) : (
                    "Publish menu"
                  )}
                </button>
              </div>
            </section>

            <section className="modules-section">
              <div className="modules-heading">
                <div>
                  <span className="section-eyebrow">WORKSPACE</span>
                  <h2>Your tools</h2>
                </div>

                <p>One place for your restaurant's digital operations.</p>
              </div>

              <div className="dashboard-module-grid">
                {modules.map((module) => {
                  const Icon = module.icon;
                  const isSaved =
                    module.status === "Saved" || module.status === "Available";

                  return (
                    <article className="dashboard-module" key={module.title}>
                      <div className="module-icon">
                        <Icon size={22} />
                      </div>

                      <h3>{module.title}</h3>
                      <p>{module.description}</p>

                      {module.title === "Restaurant settings" && (
                        <Link
                          to="/dashboard/settings"
                          className="module-action"
                        >
                          Edit restaurant settings <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "Analytics" && (
                        <Link
                          to="/dashboard/analytics"
                          className="module-action"
                        >
                          View analytics <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "Menu manager" && (
                        <Link to="/dashboard/menu" className="module-action">
                          Open menu manager <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "Table bookings" && (
                        <Link
                          to="/dashboard/bookings"
                          className="module-action"
                        >
                          Manage bookings <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "QR Studio" && (
                        <Link to="/dashboard/qr" className="module-action">
                          Open QR Studio <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "Table QR Codes" && (
                        <Link
                          to="/dashboard/table-qr"
                          className="module-action"
                        >
                          Manage table QR codes <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "Orders" && (
                        <Link to="/dashboard/orders" className="module-action">
                          Manage orders <ArrowUpRight size={14} />{" "}
                        </Link>
                      )}

                      {module.title === "Kitchen Display" && (
                        <Link to="/dashboard/kitchen" className="module-action">
                          Open kitchen display <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "Subscription & plan" && (
                        <Link
                          to="/dashboard/subscription"
                          className="module-action"
                        >
                          View subscription <ArrowUpRight size={14} />
                        </Link>
                      )}

                      {module.title === "QR Studio" &&
                        restaurant.is_published && (
                          <Link
                            to={`/menu/${encodeURIComponent(restaurant.slug)}`}
                            className="module-action"
                          >
                            Preview public menu <ArrowUpRight size={14} />
                          </Link>
                        )}

                      <span
                        className={`module-status ${
                          isSaved ? "module-status-live" : ""
                        }`}
                      >
                        {isSaved ? <CheckCircle2 size={14} /> : null}
                        {module.status}
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>

            <SupportHelpPanel restaurant={restaurant} accountEmail={email} />

            <footer className="dashboard-footer">
              <Link to="/">
                <ArrowUpRight size={16} />
                Visit Khaavio homepage
              </Link>

              <span>Every Table, Digitally Connected.</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
