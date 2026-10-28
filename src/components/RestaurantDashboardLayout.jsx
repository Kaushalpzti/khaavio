import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  BellRing,
  Gift,
  MessageSquareText,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  QrCode,
  Receipt,
  Settings,
  Sparkles,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import khaavioIcon from "../assets/icon.png";
import { supabase } from "../lib/supabaseClient";
import "./RestaurantDashboardLayout.css";
import "./RestaurantWorkspacePolish.css";

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/dashboard", icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: "Restaurant",
    items: [
      { label: "Restaurant settings", to: "/dashboard/settings", icon: Settings },
      { label: "Menu manager", to: "/dashboard/menu", icon: UtensilsCrossed },
      { label: "Menu QR", to: "/dashboard/qr", icon: QrCode },
      { label: "Table QR codes", to: "/dashboard/table-qr", icon: Store },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Orders", to: "/dashboard/orders", icon: ClipboardList },
      { label: "Service requests", to: "/dashboard/service-requests", icon: BellRing },
      { label: "Loyalty & rewards", to: "/dashboard/loyalty", icon: Gift },
      { label: "Kitchen display", to: "/dashboard/kitchen", icon: ChefHat },
      { label: "Table sessions & billing", to: "/dashboard/table-sessions", icon: Receipt },
      { label: "Order receipts", to: "/dashboard/receipts", icon: Receipt },
      { label: "Bookings", to: "/dashboard/bookings", icon: CalendarDays },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", to: "/dashboard/analytics", icon: BarChart3 },
      { label: "Business Copilot", to: "/dashboard/copilot", icon: Sparkles },
      { label: "Reviews & feedback", to: "/dashboard/feedback", icon: MessageSquareText },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Subscription & plan", to: "/dashboard/subscription", icon: CreditCard },
    ],
  },
];

function RestaurantIdentityMark({ restaurant }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [restaurant?.logo_url]);
  const name = restaurant?.name?.trim() || "Your restaurant";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "R";

  return (
    <span className="restaurant-dashboard-identity-mark">
      {restaurant?.logo_url && !imageFailed ? (
        <img
          src={restaurant.logo_url}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}

export default function RestaurantDashboardLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [restaurantIdentity, setRestaurantIdentity] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadRestaurantIdentity() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;
        const { data } = await supabase
          .from("restaurants")
          .select("name, logo_url, created_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (active && data) setRestaurantIdentity(data);
      } catch {
        // The page module still owns its normal loading/error state.
      }
    }
    loadRestaurantIdentity();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 780px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const handleSidebarControlClick = () => {
    if (window.matchMedia("(max-width: 780px)").matches) {
      setMobileOpen(false);
      return;
    }
    setCollapsed((value) => !value);
  };

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setMobileOpen(false);
      navigate("/login", { replace: true });
    } catch (error) {
      setSignOutError(error?.message || "Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className={`restaurant-dashboard-layout${collapsed ? " is-collapsed" : ""}`}>
      <div className="restaurant-dashboard-mobilebar">
        <button
          type="button"
          className="restaurant-dashboard-menu-trigger"
          aria-label={mobileOpen ? "Close dashboard navigation" : "Open dashboard navigation"}
          aria-expanded={mobileOpen}
          aria-controls="restaurant-dashboard-sidebar"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link className="restaurant-dashboard-mobilebrand" to="/dashboard" aria-label={`${restaurantIdentity?.name || "Restaurant"} overview`}>
          <RestaurantIdentityMark restaurant={restaurantIdentity} />
          <span className="restaurant-dashboard-identity-copy">
            <strong>{restaurantIdentity?.name || "Your restaurant"}</strong>
          </span>
        </Link>
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="restaurant-dashboard-backdrop"
          aria-label="Close dashboard navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="restaurant-dashboard-sidebar"
        className={`restaurant-dashboard-sidebar${mobileOpen ? " is-mobile-open" : ""}`}
        aria-label="Restaurant dashboard navigation"
      >
        <div className="restaurant-dashboard-sidebar-header">
          <span className="restaurant-dashboard-sidebar-title">NAVIGATION</span>
          <button
            type="button"
            className="restaurant-dashboard-collapse-button"
            aria-label={isMobileViewport ? "Close dashboard navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={isMobileViewport ? mobileOpen : !collapsed}
            aria-controls="restaurant-dashboard-sidebar"
            onClick={handleSidebarControlClick}
          >
            <span className="restaurant-dashboard-desktop-collapse-icon" aria-hidden="true">
              {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </span>
            <span className="restaurant-dashboard-mobile-close-icon" aria-hidden="true">
              <X size={17} />
            </span>
          </button>
        </div>

        <nav className="restaurant-dashboard-nav">
          {NAV_GROUPS.map((group) => (
            <div className="restaurant-dashboard-nav-group" key={group.label}>
              <div className="restaurant-dashboard-nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      `restaurant-dashboard-nav-link${isActive ? " is-active" : ""}`
                    }
                  >
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span className="restaurant-dashboard-nav-copy">{item.label}</span>
                    <ArrowUpRight className="restaurant-dashboard-nav-arrow" size={13} aria-hidden="true" />
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="restaurant-dashboard-sidebar-footer">
          <a
            className="restaurant-dashboard-footer-link"
            href="https://khaavio.in/"
            target="_blank"
            rel="noreferrer"
            title={collapsed ? "View public website" : undefined}
          >
            <ExternalLink size={17} aria-hidden="true" />
            <span className="restaurant-dashboard-nav-copy">View public website</span>
          </a>
          <Link
            className="restaurant-dashboard-footer-link"
            to="/dashboard/help"
            title={collapsed ? "Help & support" : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <LifeBuoy size={17} aria-hidden="true" />
            <span className="restaurant-dashboard-nav-copy">Help & support</span>
          </Link>
          <button
            type="button"
            className="restaurant-dashboard-footer-link restaurant-dashboard-signout-link"
            title={collapsed ? "Sign out" : undefined}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={17} aria-hidden="true" />
            <span className="restaurant-dashboard-nav-copy">
              {signingOut ? "Signing out..." : "Sign out"}
            </span>
          </button>
          {signOutError && (
            <p className="restaurant-dashboard-signout-error" role="alert">
              {signOutError}
            </p>
          )}
          <div className="restaurant-dashboard-powered-by">
            <img src={khaavioIcon} alt="" />
            <span>
              <small>POWERED BY</small>
              <strong>Khaavio</strong>
            </span>
          </div>
        </div>
      </aside>

      <div className="restaurant-dashboard-content">
        <header className="restaurant-dashboard-workspacebar">
          <Link className="restaurant-dashboard-workspace-identity" to="/dashboard" aria-label={`${restaurantIdentity?.name || "Restaurant"} overview`}>
            <RestaurantIdentityMark restaurant={restaurantIdentity} />
            <span className="restaurant-dashboard-identity-copy">
              <strong>{restaurantIdentity?.name || "Your restaurant"}</strong>
            </span>
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
