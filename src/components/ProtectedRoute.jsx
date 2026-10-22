import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import RouteErrorBoundary from "./RouteErrorBoundary";

export default function ProtectedRoute({ children }) {
  const location = useLocation();

  const [authStatus, setAuthStatus] = useState("checking");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;

      if (!active) return;

      setAuthError("");
      setAuthStatus(session ? "authenticated" : "unauthenticated");
    });

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active || authEventReceived) return;

        if (error) throw error;

        setAuthStatus(data.session ? "authenticated" : "unauthenticated");
      } catch (error) {
        if (!active) return;

        setAuthError(
          typeof error?.message === "string"
            ? error.message
            : "Unable to verify your login session.",
        );

        setAuthStatus("error");
      }
    }

    checkSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (authStatus === "checking") {
    return (
      <main style={styles.container}>
        <LoaderCircle size={30} style={styles.spinner} />
        <p style={styles.text}>Verifying your session...</p>
      </main>
    );
  }

  if (authStatus === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (authStatus === "error") {
    return (
      <main style={styles.container}>
        <h2 style={styles.heading}>Unable to verify your session</h2>
        <p style={styles.text}>{authError}</p>
        <button
          type="button"
          style={styles.button}
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </main>
    );
  }

  return <RouteErrorBoundary>{children}</RouteErrorBoundary>;
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    padding: "24px",
    background: "#f7f7ef",
    color: "#064e3b",
    textAlign: "center",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  spinner: {
    animation: "none",
  },
  heading: {
    margin: 0,
    fontSize: "22px",
  },
  text: {
    color: "#737b75",
    fontSize: "14px",
    overflowWrap: "anywhere",
  },
  button: {
    padding: "11px 18px",
    border: 0,
    borderRadius: "999px",
    background: "#07513b",
    color: "#fffefa",
    cursor: "pointer",
  },
};
