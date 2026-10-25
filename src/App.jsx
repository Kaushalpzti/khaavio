import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import SubscriptionAccessGuard from "./components/SubscriptionAccessGuard";
import RestaurantDashboardLayout from "./components/RestaurantDashboardLayout";
import SeoManager from "./components/SeoManager";
import LegalPage from "./pages/LegalPage";
import "./PageLoader.css";

// Public pages
const Home = lazy(() => import("./pages/Home"));
const Auth = lazy(() => import("./pages/Auth"));
const PublicMenu = lazy(() => import("./pages/PublicMenu"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));

// Restaurant setup and dashboard
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const RestaurantSettings = lazy(() => import("./pages/RestaurantSettings"));
const Subscription = lazy(() => import("./pages/Subscription"));
const PlatformAdminSubscriptions = lazy(
  () => import("./pages/PlatformAdminSubscriptions"),
);

// Menu and QR management
const MenuManager = lazy(() => import("./pages/MenuManager"));
const QRStudio = lazy(() => import("./pages/QRStudio"));
const TableQRStudio = lazy(() => import("./pages/TableQRStudio"));
const TableSessions = lazy(() => import("./pages/TableSessions"));
const ServiceRequestsDashboard = lazy(() => import("./pages/ServiceRequestsDashboard"));
const ReviewFeedbackDashboard = lazy(() => import("./pages/ReviewFeedbackDashboard"));

// Orders, receipts, bookings and analytics
const OrdersDashboard = lazy(() => import("./pages/OrdersDashboard"));
const OrderReceipts = lazy(() => import("./pages/OrderReceipts"));
const BookingsDashboard = lazy(() => import("./pages/BookingsDashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));

// Reset scroll after client-side navigation so links from a page footer open
// the destination at the top instead of preserving the previous page's offset.
function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

function PageLoader() {
  return (
    <main
      className="khaavio-page-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading Khaavio"
    >
      <div
        className="khaavio-loader-orb khaavio-loader-orb-one"
        aria-hidden="true"
      />
      <div
        className="khaavio-loader-orb khaavio-loader-orb-two"
        aria-hidden="true"
      />

      <div className="khaavio-loader-content">
        <div className="khaavio-loader-mark-wrap">
          <span className="khaavio-loader-halo" aria-hidden="true" />
          <img
            className="khaavio-loader-mark"
            src="/icon.png"
            alt=""
            width="58"
            height="58"
          />
        </div>

        <div className="khaavio-loader-wordmark">Khaavio</div>
        <p className="khaavio-loader-message">
          Getting your restaurant workspace ready
        </p>

        <div className="khaavio-loader-track" aria-hidden="true">
          <span />
        </div>
        <span className="khaavio-loader-caption">
          Every table, digitally connected.
        </span>
      </div>
    </main>
  );
}

function ProtectedPage({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function ProtectedRestaurantPage({ children }) {
  return (
    <ProtectedPage>
      <SubscriptionAccessGuard>
        <RestaurantDashboardLayout>{children}</RestaurantDashboardLayout>
      </SubscriptionAccessGuard>
    </ProtectedPage>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <SeoManager />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public marketing and legal pages */}
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />
          <Route path="/refund-policy" element={<LegalPage type="refund" />} />
          <Route path="/refunds" element={<Navigate to="/refund-policy" replace />} />

          {/* Authentication */}
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route
            path="/reset-password"
            element={<Auth mode="reset-password" />}
          />

          {/* Public customer pages */}
          <Route path="/menu/:slug" element={<PublicMenu />} />
          <Route path="/book/:slug" element={<PublicBooking />} />
          <Route path="/track/:slug/:orderId" element={<OrderTracking />} />

          {/* Restaurant onboarding */}
          <Route
            path="/onboarding"
            element={
              <ProtectedPage>
                <Onboarding />
              </ProtectedPage>
            }
          />

          {/* Main restaurant dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRestaurantPage>
                <Dashboard />
              </ProtectedRestaurantPage>
            }
          />

          {/* Standalone Help Center: authenticated users can reach support even if their plan expires. */}
          <Route
            path="/dashboard/help"
            element={
              <ProtectedPage>
                <RestaurantDashboardLayout>
                  <HelpCenter />
                </RestaurantDashboardLayout>
              </ProtectedPage>
            }
          />

          {/* Restaurant settings and subscription */}
          <Route
            path="/dashboard/settings"
            element={
              <ProtectedRestaurantPage>
                <RestaurantSettings />
              </ProtectedRestaurantPage>
            }
          />
          <Route
            path="/dashboard/subscription"
            element={
              <ProtectedPage>
                <RestaurantDashboardLayout>
                  <Subscription />
                </RestaurantDashboardLayout>
              </ProtectedPage>
            }
          />

          {/* Restricted platform-admin tools. The RPCs enforce the admin allowlist in the database. */}
          <Route
            path="/platform-admin/subscriptions"
            element={
              <ProtectedPage>
                <PlatformAdminSubscriptions />
              </ProtectedPage>
            }
          />

          {/* Menu and QR management */}
          <Route
            path="/dashboard/menu"
            element={
              <ProtectedRestaurantPage>
                <MenuManager />
              </ProtectedRestaurantPage>
            }
          />
          <Route
            path="/dashboard/qr"
            element={
              <ProtectedRestaurantPage>
                <QRStudio />
              </ProtectedRestaurantPage>
            }
          />
          <Route
            path="/dashboard/table-qr"
            element={
              <ProtectedRestaurantPage>
                <TableQRStudio />
              </ProtectedRestaurantPage>
            }
          />

          {/* Orders and receipts */}
          <Route
            path="/dashboard/orders"
            element={
              <ProtectedRestaurantPage>
                <OrdersDashboard />
              </ProtectedRestaurantPage>
            }
          />
          <Route
            path="/dashboard/receipts"
            element={
              <ProtectedRestaurantPage>
                <OrderReceipts />
              </ProtectedRestaurantPage>
            }
          />

          {/* Bookings and analytics */}
          <Route
            path="/dashboard/bookings"
            element={
              <ProtectedRestaurantPage>
                <BookingsDashboard />
              </ProtectedRestaurantPage>
            }
          />
          <Route
            path="/dashboard/analytics"
            element={
              <ProtectedRestaurantPage>
                <Analytics />
              </ProtectedRestaurantPage>
            }
          />

          {/* Kitchen Display */}
          <Route
            path="/dashboard/kitchen"
            element={
              <ProtectedRestaurantPage>
                <KitchenDisplay />
              </ProtectedRestaurantPage>
            }
          />

          <Route
            path="/dashboard/table-sessions"
            element={
              <ProtectedRestaurantPage>
                <TableSessions />
              </ProtectedRestaurantPage>
            }
          />

          {/* Table service requests */}
          <Route
            path="/dashboard/service-requests"
            element={
              <ProtectedRestaurantPage>
                <ServiceRequestsDashboard />
              </ProtectedRestaurantPage>
            }
          />
          {/* Private customer feedback inbox */}
          <Route
            path="/dashboard/feedback"
            element={
              <ProtectedRestaurantPage>
                <ReviewFeedbackDashboard />
              </ProtectedRestaurantPage>
            }
          />
          {/* Unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
