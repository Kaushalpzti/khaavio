import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
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
const RestaurantSettings = lazy(() => import("./pages/RestaurantSettings"));
const Subscription = lazy(() => import("./pages/Subscription"));
const PlatformAdminSubscriptions = lazy(
  () => import("./pages/PlatformAdminSubscriptions"),
);

// Menu and QR management
const MenuManager = lazy(() => import("./pages/MenuManager"));
const QRStudio = lazy(() => import("./pages/QRStudio"));
const TableQRStudio = lazy(() => import("./pages/TableQRStudio"));

// Orders, receipts, bookings and analytics
const OrdersDashboard = lazy(() => import("./pages/OrdersDashboard"));
const OrderReceipts = lazy(() => import("./pages/OrderReceipts"));
const BookingsDashboard = lazy(() => import("./pages/BookingsDashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));

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
        <p className="khaavio-loader-message">Getting Khaavio ready for you</p>

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

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public homepage */}
          <Route path="/" element={<Home />} />

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
              <ProtectedPage>
                <Dashboard />
              </ProtectedPage>
            }
          />

          {/* Restaurant settings and subscription */}
          <Route
            path="/dashboard/settings"
            element={
              <ProtectedPage>
                <RestaurantSettings />
              </ProtectedPage>
            }
          />
          <Route
            path="/dashboard/subscription"
            element={
              <ProtectedPage>
                <Subscription />
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
              <ProtectedPage>
                <MenuManager />
              </ProtectedPage>
            }
          />
          <Route
            path="/dashboard/qr"
            element={
              <ProtectedPage>
                <QRStudio />
              </ProtectedPage>
            }
          />
          <Route
            path="/dashboard/table-qr"
            element={
              <ProtectedPage>
                <TableQRStudio />
              </ProtectedPage>
            }
          />

          {/* Orders and receipts */}
          <Route
            path="/dashboard/orders"
            element={
              <ProtectedPage>
                <OrdersDashboard />
              </ProtectedPage>
            }
          />
          <Route
            path="/dashboard/receipts"
            element={
              <ProtectedPage>
                <OrderReceipts />
              </ProtectedPage>
            }
          />

          {/* Bookings and analytics */}
          <Route
            path="/dashboard/bookings"
            element={
              <ProtectedPage>
                <BookingsDashboard />
              </ProtectedPage>
            }
          />
          <Route
            path="/dashboard/analytics"
            element={
              <ProtectedPage>
                <Analytics />
              </ProtectedPage>
            }
          />

          {/* Kitchen Display */}
          <Route
            path="/dashboard/kitchen"
            element={
              <ProtectedPage>
                <KitchenDisplay />
              </ProtectedPage>
            }
          />

          {/* Unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
