import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CircleAlert, LoaderCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import SupportHelpPanel from "../components/SupportHelpPanel";
import "./HelpCenter.css";

export default function HelpCenter() {
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
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

      setRestaurant(data || null);
      setAccountEmail(user.email || "");
    } catch (loadError) {
      setError(loadError?.message || "We couldn't load your support workspace.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  return (
    <main className="help-center-page">
      <div className="help-center-main">
        <div className="help-center-page-heading">
          <div className="help-center-title-wrap">
            <span className="help-center-page-eyebrow">RESTAURANT WORKSPACE</span>
            <h1>Help &amp; Support</h1>
            <p>Find answers, troubleshoot common tasks, or contact Khaavio Support.</p>
          </div>
          <Link className="help-center-back-link" to="/dashboard">
            <ArrowLeft size={16} aria-hidden="true" /> Back to overview
          </Link>
        </div>

        {loading ? (
          <section className="help-center-state" role="status" aria-live="polite">
            <LoaderCircle className="dashboard-spinner" size={26} />
            <strong>Loading your help workspace…</strong>
          </section>
        ) : error ? (
          <section className="help-center-state help-center-state-error" role="alert">
            <CircleAlert size={24} />
            <strong>Help Center couldn't load</strong>
            <p>{error}</p>
            <button type="button" onClick={loadWorkspace}>Try again</button>
          </section>
        ) : (
          <SupportHelpPanel id="help-center" restaurant={restaurant} accountEmail={accountEmail} />
        )}

        <footer className="help-center-footer">
          <span>Every table, digitally connected.</span>
          <a href="https://khaavio.in/" target="_blank" rel="noreferrer">
            Powered by Khaavio <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
