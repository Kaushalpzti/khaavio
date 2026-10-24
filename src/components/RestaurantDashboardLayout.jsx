import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  QrCode,
  Receipt,
  Settings,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import khaavioIcon from "../assets/icon.png";
import "./RestaurantDashboardLayout.css";

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
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Subscription & plan", to: "/dashboard/subscription", icon: CreditCard },
    ],
  },
];

export default function RestaurantDashboardLayout({ children }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

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
        <Link className="restaurant-dashboard-mobilebrand" to="/dashboard" aria-label="Khaavio dashboard">
          <img src={khaavioIcon} alt="" />
          <span>Khaavio</span>
        </Link>
        <span className="restaurant-dashboard-mobile-caption">Restaurant workspace</span>
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
          <Link className="restaurant-dashboard-brand" to="/dashboard" aria-label="Khaavio overview">
            <img src={khaavioIcon} alt="" />
            <span className="restaurant-dashboard-brand-copy">
              <strong>Khaa<span>vio</span></strong>
              <small>RESTAURANT WORKSPACE</small>
            </span>
          </Link>
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
          <a
            className="restaurant-dashboard-footer-link"
            href="mailto:khaavioqr@gmail.com"
            title={collapsed ? "Contact support" : undefined}
          >
            <LifeBuoy size={17} aria-hidden="true" />
            <span className="restaurant-dashboard-nav-copy">Help & support</span>
          </a>
          <div className="restaurant-dashboard-footer-note">
            <span className="restaurant-dashboard-online-dot" />
            <span className="restaurant-dashboard-nav-copy">Every table, digitally connected.</span>
          </div>
        </div>
      </aside>

      <div className="restaurant-dashboard-content">{children}</div>
    </div>
  );
}
