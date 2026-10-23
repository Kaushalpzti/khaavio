import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

const Home = lazy(() => import("./pages/Home"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const MenuManager = lazy(() => import("./pages/MenuManager"));
const PublicMenu = lazy(() => import("./pages/PublicMenu"));
const QRStudio = lazy(() => import("./pages/QRStudio"));
const TableQRStudio = lazy(() => import("./pages/TableQRStudio"));
const OrdersDashboard = lazy(() => import("./pages/OrdersDashboard"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const BookingsDashboard = lazy(() => import("./pages/BookingsDashboard"));
const RestaurantSettings = lazy(() => import("./pages/RestaurantSettings"));

function PageLoader() {
  return (
    <main className="app-loading">
      <img src="/icon.png" alt="" width="40" height="40" />
      <p>Preparing your Khaavio experience...</p>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route
            path="/reset-password"
            element={<Auth mode="reset-password" />}
          />
          <Route path="/book/:slug" element={<PublicBooking />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/menu"
            element={
              <ProtectedRoute>
                <MenuManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/qr"
            element={
              <ProtectedRoute>
                <QRStudio />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/table-qr"
            element={
              <ProtectedRoute>
                <TableQRStudio />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/orders"
            element={
              <ProtectedRoute>
                <OrdersDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/bookings"
            element={
              <ProtectedRoute>
                <BookingsDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/settings"
            element={
              <ProtectedRoute>
                <RestaurantSettings />
              </ProtectedRoute>
            }
          />

          <Route path="/menu/:slug" element={<PublicMenu />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
