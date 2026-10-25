import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthSessionContext = createContext(null);

function stateFromSession(session) {
  return {
    status: session ? "authenticated" : "unauthenticated",
    userId: session?.user?.id || null,
    error: "",
  };
}

function errorMessage(error) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : "Unable to verify your login session. Check your connection and retry.";
}

/**
 * Keeps one Supabase auth subscription alive for the lifetime of the SPA.
 * Protected pages can read the session immediately instead of re-running
 * getSession() whenever the current route changes.
 */
export function AuthSessionProvider({ children }) {
  const [authState, setAuthState] = useState({
    status: "checking",
    userId: null,
    error: "",
  });

  const refreshSession = useCallback(async () => {
    setAuthState((current) =>
      current.status === "authenticated" || current.status === "unauthenticated"
        ? current
        : { ...current, status: "checking", error: "" },
    );

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setAuthState(stateFromSession(data?.session || null));
    } catch (error) {
      setAuthState({
        status: "error",
        userId: null,
        error: errorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (!active) return;
      setAuthState(stateFromSession(session || null));
    });

    async function loadInitialSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active || authEventReceived) return;
        setAuthState(stateFromSession(data?.session || null));
      } catch (error) {
        if (!active || authEventReceived) return;
        setAuthState({
          status: "error",
          userId: null,
          error: errorMessage(error),
        });
      }
    }

    loadInitialSession();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ ...authState, refreshSession }),
    [authState, refreshSession],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider.");
  }
  return context;
}
