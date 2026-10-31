import { useEffect, useRef, useState } from "react";
import {
  BellRing, Bot, CheckCircle2, ChevronRight, Droplets, LoaderCircle,
  MessageCircle, ReceiptText, Send, Sparkles, Utensils, X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./PublicHelpLauncher.css";

const SERVICE_ACTIONS = [
  { value: "water", label: "Water, please", description: "Request drinking water", Icon: Droplets },
  { value: "bill", label: "Request the bill", description: "Ask the team for your bill", Icon: ReceiptText },
  { value: "cutlery", label: "Plates or cutlery", description: "Ask for plates, spoons or tissues", Icon: Utensils },
];

function getServiceErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("rate") || message.includes("too many")) return "A few requests were sent just now. Please wait a moment.";
  if (message.includes("invalid") || message.includes("inactive") || message.includes("unpublished")) return "This table QR is no longer active. Please ask a team member for help.";
  return "We couldn't send that request right now. Please try again or ask a team member directly.";
}

export default function PublicHelpLauncher({
  showAI = false,
  showService = false,
  isEnabled = true,
  isPanelOpen = false,
  hasStickyCart = false,
  slug = "",
  tableToken = "",
  onOpenAI,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomRequest, setShowCustomRequest] = useState(false);
  const [customNote, setCustomNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const customInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key === "Escape" && !submitting) setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, submitting]);

  useEffect(() => {
    if (showCustomRequest && isOpen) customInputRef.current?.focus();
  }, [showCustomRequest, isOpen]);

  useEffect(() => {
    if (!isEnabled && isOpen) {
      setIsOpen(false);
      setShowCustomRequest(false);
      setError("");
      setStatus("");
    }
  }, [isEnabled, isOpen]);

  if ((!showAI && !showService) || !isEnabled || isPanelOpen) return null;

  async function sendServiceRequest(requestType, note = "") {
    const cleanNote = note.trim();
    if (!showService || submitting || !slug || !tableToken) return;
    if (requestType === "other" && !cleanNote) {
      setError("Please tell the team what you need.");
      return;
    }
    if (cleanNote.length > 240) {
      setError("Please keep your note under 240 characters.");
      return;
    }

    setSubmitting(true);
    setError("");
    setStatus("");
    try {
      const { data, error: rpcError } = await supabase.rpc("create_public_table_service_request", {
        p_slug: slug,
        p_table_token: tableToken,
        p_request_type: requestType,
        p_note: cleanNote || null,
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.request_id) throw new Error("The restaurant team did not confirm this request.");
      setStatus(row.already_open === true
        ? "Your earlier request is already open. The team can see it."
        : "Request sent! The restaurant team has received it.");
      setCustomNote("");
      setShowCustomRequest(false);
    } catch (submitError) {
      console.error("Unable to send public table service request:", submitError);
      setError(getServiceErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  function openAIChat() {
    if (!showAI) return;
    setIsOpen(false);
    setShowCustomRequest(false);
    setError("");
    setStatus("");
    onOpenAI?.();
  }

  function closeHelp() {
    if (submitting) return;
    setIsOpen(false);
    setShowCustomRequest(false);
    setError("");
  }

  return (
    <>
      {!isOpen && (
        <div className={"public-help-launcher" + (hasStickyCart ? " is-raised" : "")}>
          <button
            type="button"
            className="public-help-launcher-fab"
            aria-label="Open Khaavio help"
            aria-haspopup="dialog"
            aria-expanded={false}
            aria-controls="public-help-launcher-dialog"
            title="Get Help"
            onClick={() => {
              setIsOpen(true);
              setError("");
              setStatus("");
            }}
          >
            <Sparkles size={21} strokeWidth={2.1} aria-hidden="true" />
          </button>
        </div>
      )}

      {isOpen && (
        <div
          className="public-help-launcher-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeHelp();
          }}
        >
          <section
            id="public-help-launcher-dialog"
            className="public-help-launcher-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-help-launcher-title"
            aria-describedby="public-help-launcher-description"
            aria-busy={submitting}
          >
            <div className="public-help-launcher-handle" aria-hidden="true" />
            <header className="public-help-launcher-header">
              <span className="public-help-launcher-header-icon"><MessageCircle size={19} aria-hidden="true" /></span>
              <div>
                <h2 id="public-help-launcher-title">How can we help you?</h2>
                <p id="public-help-launcher-description">
                  {showService && showAI
                    ? "Send a request to the restaurant team or chat with Khaavio for menu suggestions."
                    : showService
                      ? "Your request goes directly to the restaurant team."
                      : "Chat with Khaavio for dish ideas, menu details and recommendations."}
                </p>
              </div>
              <button type="button" className="public-help-launcher-close" aria-label="Close help options" onClick={closeHelp} disabled={submitting}>
                <X size={19} />
              </button>
            </header>

            {status && <p className="public-help-launcher-status" role="status"><CheckCircle2 size={16} /><span>{status}</span></p>}
            {error && <p className="public-help-launcher-error" role="alert">{error}</p>}

            <div className={"public-help-launcher-cards" + (showService && showAI ? " has-two" : "")}>
              {showService && (
                <button type="button" className="public-help-launcher-primary-card is-service" onClick={() => void sendServiceRequest("waiter")} disabled={submitting}>
                  <span className="public-help-launcher-card-icon">{submitting ? <LoaderCircle className="is-spinning" size={21} /> : <BellRing size={21} />}</span>
                  <strong>Call waiter</strong>
                  <small>Get assistance from the restaurant team.</small>
                  <span className="public-help-launcher-card-arrow"><ChevronRight size={17} /></span>
                </button>
              )}
              {showAI && (
                <button type="button" className="public-help-launcher-primary-card is-ai" onClick={openAIChat}>
                  <span className="public-help-launcher-card-icon"><Bot size={21} /></span>
                  <strong>Ask Khaavio</strong>
                  <small>Your friendly menu assistant.</small>
                  <span className="public-help-launcher-card-arrow"><ChevronRight size={17} /></span>
                </button>
              )}
            </div>

            {showService && (
              <div className="public-help-launcher-service-list" aria-label="More table services">
                {SERVICE_ACTIONS.map(({ value, label, description, Icon }) => (
                  <button key={value} type="button" className="public-help-launcher-service-row" onClick={() => void sendServiceRequest(value)} disabled={submitting}>
                    <span className="public-help-launcher-service-icon"><Icon size={18} /></span>
                    <span className="public-help-launcher-service-copy"><strong>{label}</strong><small>{description}</small></span>
                    <ChevronRight size={17} className="public-help-launcher-service-arrow" />
                  </button>
                ))}
                <button type="button" className="public-help-launcher-service-row" aria-expanded={showCustomRequest} onClick={() => { setShowCustomRequest((current) => !current); setError(""); }} disabled={submitting}>
                  <span className="public-help-launcher-service-icon"><MessageCircle size={18} /></span>
                  <span className="public-help-launcher-service-copy"><strong>Something else</strong><small>Tell the team what you need</small></span>
                  <ChevronRight size={17} className={"public-help-launcher-service-arrow" + (showCustomRequest ? " is-open" : "")} />
                </button>
              </div>
            )}

            {showService && showCustomRequest && (
              <form className="public-help-launcher-custom" onSubmit={(event) => { event.preventDefault(); void sendServiceRequest("other", customNote); }}>
                <label htmlFor="public-help-custom-note">What do you need?</label>
                <div>
                  <input
                    ref={customInputRef}
                    id="public-help-custom-note"
                    value={customNote}
                    onChange={(event) => setCustomNote(event.target.value.slice(0, 240))}
                    placeholder="Tell us briefly…"
                    maxLength={240}
                    disabled={submitting}
                  />
                  <button type="submit" aria-label="Send custom request" disabled={submitting || !customNote.trim()}>
                    {submitting ? <LoaderCircle className="is-spinning" size={17} /> : <Send size={17} />}
                  </button>
                </div>
                <small>{customNote.length}/240 characters</small>
              </form>
            )}

            <p className="public-help-launcher-footnote">
              <span className="public-help-launcher-footnote-icon">✦</span>
              <span>{showService
                ? "No need to scan again. The restaurant team will see your table request."
                : "Ask about dishes, prices, ingredients and recommendations from this menu."}</span>
            </p>
          </section>
        </div>
      )}
    </>
  );
}
