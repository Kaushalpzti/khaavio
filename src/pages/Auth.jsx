
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getAppRedirectUrl } from "../lib/domainRouting.js";
import khaavioIcon from "../assets/icon.png";
import "./Auth.css";

function Brand() {
  return (
    <Link to="/" className="auth-brand" aria-label="Khaavio homepage">
      <img src={khaavioIcon} alt="" className="auth-brand-icon" />
      <span>Khaa<span>vio</span></span>
    </Link>
  );
}

function getErrorMessage(error) {
  const message = error?.message || "";

  if (/invalid login credentials/i.test(message)) {
    return "Email or password is incorrect. Please check and try again.";
  }

  if (/email not confirmed/i.test(message)) {
    return "Please verify your email first. Check your inbox for the confirmation link.";
  }

  if (/user already registered/i.test(message)) {
    return "An account may already exist for this email. Try signing in instead.";
  }

  if (/password should be at least/i.test(message)) {
    return "Your password is too short. Use at least 8 characters.";
  }

  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts. Please wait a little and try again.";
  }

  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return "Google login is not enabled in Supabase yet. You can continue using email and password.";
  }

  return message || "Something went wrong. Please try again.";
}

export default function Auth({ mode = "login" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isSignup = mode === "signup";
  const isReset = mode === "reset-password";

  const [fullName, setFullName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [recoveryStage, setRecoveryStage] = useState(
    isReset ? "checking" : "form"
  );

  const [signupComplete, setSignupComplete] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      if (isReset) {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          setRecoveryStage("request");
          return;
        }

        setRecoveryStage(data.session ? "update" : "request");
        return;
      }

      if (!isSignup) {
        const { data } = await supabase.auth.getSession();

        if (active && data.session) {
          navigate("/onboarding", { replace: true });
        }
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (isReset && session) {
        setRecoveryStage("update");
      }

      if (isReset && event === "SIGNED_OUT") {
        setRecoveryStage("request");
      }

      if (!isReset && !isSignup && session) {
        navigate("/onboarding", { replace: true });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isReset, isSignup, navigate]);

  function clearFeedback() {
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    clearFeedback();
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (isReset && recoveryStage === "update") {
        if (password.length < 8) {
          throw new Error("Use a password with at least 8 characters.");
        }

        if (password !== confirmPassword) {
          throw new Error("Your passwords do not match.");
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) throw updateError;

        setPasswordUpdated(true);
        setPassword("");
        setConfirmPassword("");
        setSuccess("Your password has been updated. You can now sign in.");
        return;
      }

      if (isReset) {
        if (!normalizedEmail) {
          throw new Error("Enter your account email address first.");
        }

        const { error: resetError } =
          await supabase.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: getAppRedirectUrl("/reset-password", window.location.hostname, window.location.origin),
          });

        if (resetError) throw resetError;

        setResetEmailSent(true);
        setSuccess(
          "If your account is eligible, a password reset link will arrive in your inbox. Check your spam folder too."
        );
        return;
      }

      if (!normalizedEmail) {
        throw new Error("Enter a valid email address.");
      }

      if (isSignup) {
        if (fullName.trim().length < 2) {
          throw new Error("Please enter your full name.");
        }

        if (restaurantName.trim().length < 2) {
          throw new Error("Please enter your restaurant name.");
        }

        if (password.length < 8) {
          throw new Error("Use a password with at least 8 characters.");
        }

        if (password !== confirmPassword) {
          throw new Error("Your passwords do not match.");
        }

        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAppRedirectUrl("/login", window.location.hostname, window.location.origin),
            data: {
              full_name: fullName.trim(),
              restaurant_name: restaurantName.trim(),
            },
          },
        });

        if (signupError) throw signupError;

        if (data.session) {
          navigate("/onboarding", { replace: true });
          return;
        }

        setSignupComplete(true);
        setSuccess(
          `We sent a confirmation email to ${normalizedEmail}. Open that email to verify your account, then sign in.`
        );
        return;
      }

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (loginError) throw loginError;

      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (loading) return;

    clearFeedback();
    setLoading(true);

    try {
      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: getAppRedirectUrl("/onboarding", window.location.hostname, window.location.origin),
          },
        });

      if (oauthError) throw oauthError;
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  const title = isReset
    ? recoveryStage === "update"
      ? "Choose a new password."
      : "Let's get you back in."
    : isSignup
      ? "Your next chapter starts here."
      : "Good to see you again.";

  const subtitle = isReset
    ? recoveryStage === "update"
      ? "Create a new password for your Khaavio account."
      : "Enter the email address associated with your account."
    : isSignup
      ? "Create your account and bring your restaurant online."
      : "Sign in to manage your restaurant's digital home.";

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="auth-showcase-glow auth-showcase-glow-one" />
        <div className="auth-showcase-glow auth-showcase-glow-two" />

        <div className="auth-showcase-header">
          <Brand />
          <Link to="/" className="auth-back-home">
            <ArrowLeft size={15} />
            <span>Back to website</span>
          </Link>
        </div>

        <div className="auth-showcase-content">
          <div className="auth-showcase-kicker">
            <span />
            MADE FOR THE PEOPLE BEHIND THE FOOD
          </div>

          <h1>
            A little less
            <br />
            <span className="auth-serif">busy work.</span>
            <br />
            A lot more
            <br />
            <span className="auth-serif">hospitality.</span>
          </h1>

          <p className="auth-showcase-description">
            Your digital menu, your tables and your restaurant's next chapter.
            One thoughtful platform, made to grow with you.
          </p>

          <div className="auth-showcase-points">
            <div>
              <span className="auth-point-icon"><Check size={14} /></span>
              Your restaurant, your identity
            </div>
            <div>
              <span className="auth-point-icon"><Check size={14} /></span>
              Your menu, always up to date
            </div>
            <div>
              <span className="auth-point-icon"><Check size={14} /></span>
              One place to manage it all
            </div>
          </div>

          <div className="auth-mini-preview">
            <div className="auth-mini-preview-top">
              <div className="auth-mini-restaurant">
                <span className="auth-mini-restaurant-icon">
                  <UtensilsCrossed size={16} />
                </span>
                <span>
                  <strong>Atelier Café</strong>
                  <small>Your digital storefront</small>
                </span>
              </div>
              <span className="auth-mini-live">
                <i /> PREVIEW
              </span>
            </div>

            <div className="auth-mini-menu-row">
              <span className="auth-mini-food auth-food-coffee">☕</span>
              <span className="auth-mini-food-name">
                <strong>Signature Latte</strong>
                <small>Made fresh, just for you</small>
              </span>
              <strong>₹189</strong>
            </div>

            <div className="auth-mini-menu-row">
              <span className="auth-mini-food auth-food-bakery">🥐</span>
              <span className="auth-mini-food-name">
                <strong>Butter Croissant</strong>
                <small>Golden and beautifully flaky</small>
              </span>
              <strong>₹149</strong>
            </div>
          </div>
        </div>

        <footer className="auth-showcase-footer">
          <span>© {2026} Khaavio</span>
          <span className="auth-footer-separator" />
          <span>Every Table, Digitally Connected.</span>
        </footer>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-top">
          <Link to="/" className="auth-mobile-brand">
            <img src={khaavioIcon} alt="" />
            <strong>Khaavio</strong>
          </Link>

          <span className="auth-secure-label">
            <ShieldCheck size={14} />
            SECURE ACCOUNT ACCESS
          </span>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <div className="auth-form-eyebrow">
              <span className="auth-heading-line" />
              {isReset
                ? recoveryStage === "update"
                  ? "PASSWORD RECOVERY"
                  : "ACCOUNT RECOVERY"
                : isSignup
                  ? "YOUR RESTAURANT STARTS HERE"
                  : "WELCOME BACK"}
            </div>

            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          {signupComplete || resetEmailSent || passwordUpdated ? (
            <div className="auth-success-card" role="status">
              <div className="auth-success-icon">
                {passwordUpdated ? (
                  <CheckCircle2 size={27} />
                ) : (
                  <Mail size={27} />
                )}
              </div>
              <h3>
                {passwordUpdated
                  ? "Password updated"
                  : resetEmailSent
                    ? "Check your inbox"
                    : "You're almost there"}
              </h3>
              <p>{success}</p>

              {signupComplete && (
                <button
                  type="button"
                  className="auth-secondary-action"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Continue to sign in <ArrowRight size={16} />
                </button>
              )}

              {passwordUpdated && (
                <button
                  type="button"
                  className="auth-secondary-action"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("/login", { replace: true });
                  }}
                >
                  Go to sign in <ArrowRight size={16} />
                </button>
              )}

              {resetEmailSent && (
                <button
                  type="button"
                  className="auth-secondary-action"
                  onClick={() => {
                    setResetEmailSent(false);
                    setSuccess("");
                  }}
                >
                  Try another email <ArrowRight size={16} />
                </button>
              )}
            </div>
          ) : (
            <>
              {!isReset && (
                <button
                  className="auth-google-button"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  <span className="auth-google-mark">G</span>
                  Continue with Google
                </button>
              )}

              {!isReset && (
                <div className="auth-divider">
                  <span />
                  <span>or continue with email</span>
                  <span />
                </div>
              )}

              {isReset && recoveryStage === "checking" ? (
                <div className="auth-checking">
                  <LoaderCircle size={22} className="auth-spinner" />
                  <span>Checking your recovery session...</span>
                </div>
              ) : (
                <form className="auth-form" onSubmit={handleSubmit}>
                  {isSignup && (
                    <>
                      <div className="auth-field">
                        <label htmlFor="auth-full-name">Your full name</label>
                        <input
                          id="auth-full-name"
                          type="text"
                          autoComplete="name"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder="e.g. Aditi Sharma"
                          minLength={2}
                          maxLength={120}
                          required
                        />
                      </div>

                      <div className="auth-field">
                        <label htmlFor="auth-restaurant-name">
                          Restaurant or café name
                        </label>
                        <input
                          id="auth-restaurant-name"
                          type="text"
                          autoComplete="organization"
                          value={restaurantName}
                          onChange={(event) =>
                            setRestaurantName(event.target.value)
                          }
                          placeholder="e.g. The Green Table"
                          minLength={2}
                          maxLength={120}
                          required
                        />
                      </div>
                    </>
                  )}

                  {!(isReset && recoveryStage === "update") && (
                    <div className="auth-field">
                      <label htmlFor="auth-email">Email address</label>
                      <div className="auth-input-wrap">
                        <Mail size={17} />
                        <input
                          id="auth-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@example.com"
                          maxLength={254}
                          required
                        />
                      </div>
                    </div>
                  )}

                  {!isReset && (
                    <div className="auth-field">
                      <div className="auth-label-row">
                        <label htmlFor="auth-password">Password</label>
                        {!isSignup && (
                          <Link
                            to="/reset-password"
                            state={{ email }}
                            className="auth-forgot-link"
                          >
                            Forgot password?
                          </Link>
                        )}
                      </div>

                      <div className="auth-input-wrap">
                        <KeyRound size={17} />
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={
                            isSignup ? "new-password" : "current-password"
                          }
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={
                            isSignup
                              ? "Create at least 8 characters"
                              : "Enter your password"
                          }
                          minLength={8}
                          maxLength={128}
                          required
                        />
                        <button
                          type="button"
                          className="auth-password-toggle"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {isReset && recoveryStage === "update" && (
                    <>
                      <div className="auth-field">
                        <label htmlFor="auth-new-password">New password</label>
                        <div className="auth-input-wrap">
                          <KeyRound size={17} />
                          <input
                            id="auth-new-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="At least 8 characters"
                            minLength={8}
                            maxLength={128}
                            required
                          />
                          <button
                            type="button"
                            className="auth-password-toggle"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? (
                              <EyeOff size={17} />
                            ) : (
                              <Eye size={17} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="auth-field">
                        <label htmlFor="auth-confirm-password">
                          Confirm new password
                        </label>
                        <div className="auth-input-wrap">
                          <KeyRound size={17} />
                          <input
                            id="auth-confirm-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) =>
                              setConfirmPassword(event.target.value)
                            }
                            placeholder="Enter the new password again"
                            minLength={8}
                            maxLength={128}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {isSignup && (
                    <>
                      <div className="auth-password-hint">
                        <ShieldCheck size={15} />
                        Use at least 8 characters for your password.
                      </div>

                      <div className="auth-field">
                        <label htmlFor="auth-confirm-signup-password">
                          Confirm password
                        </label>
                        <div className="auth-input-wrap">
                          <KeyRound size={17} />
                          <input
                            id="auth-confirm-signup-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) =>
                              setConfirmPassword(event.target.value)
                            }
                            placeholder="Enter the same password"
                            minLength={8}
                            maxLength={128}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {error && (
                    <div className="auth-alert auth-alert-error" role="alert">
                      <span className="auth-alert-mark">!</span>
                      <p>{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="auth-alert auth-alert-success" role="status">
                      <CheckCircle2 size={17} />
                      <p>{success}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="auth-submit"
                    disabled={loading}
                  >
                    <span>
                      {loading
                        ? "Please wait..."
                        : isReset
                          ? recoveryStage === "update"
                            ? "Update password"
                            : "Send reset link"
                          : isSignup
                            ? "Create your account"
                            : "Sign in to Khaavio"}
                    </span>

                    {loading ? (
                      <LoaderCircle size={18} className="auth-spinner" />
                    ) : (
                      <ArrowRight size={18} />
                    )}
                  </button>
                </form>
              )}
            </>
          )}

          {!signupComplete && !resetEmailSent && !passwordUpdated && (
            <div className="auth-switch">
              {isReset ? (
                <Link to="/login" className="auth-switch-link">
                  <ArrowLeft size={15} /> Back to sign in
                </Link>
              ) : (
                <>
                  <span>
                    {isSignup
                      ? "Already have an account?"
                      : "New to Khaavio?"}
                  </span>
                  <Link
                    to={isSignup ? "/login" : "/signup"}
                    className="auth-switch-link"
                  >
                    {isSignup ? "Sign in" : "Create an account"}
                    <ArrowRight size={14} />
                  </Link>
                </>
              )}
            </div>
          )}

          <div className="auth-legal">
            By continuing, you agree to our{" "}
            <Link to="/terms">Terms &amp; Conditions</Link>,{" "}
            <Link to="/privacy">Privacy Policy</Link> and{" "}
            <Link to="/refund-policy">Refund Policy</Link>.
          </div>
        </div>

        <div className="auth-panel-footer">
          <span><ShieldCheck size={14} /> Secure account access</span>
          <span>© 2026 Khaavio</span>
        </div>
      </section>
    </main>
  );
}
