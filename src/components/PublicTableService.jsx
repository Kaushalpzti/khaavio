import { useEffect, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Droplets,
  LoaderCircle,
  MessageCircle,
  ReceiptText,
  Send,
  Utensils,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { normalizeTableNumber } from "../lib/tableNumber";
import "./PublicTableService.css";

const REQUEST_OPTIONS = [
  {
    value: "waiter",
    label: "Call waiter",
    description: "We need a little assistance",
    Icon: BellRing,
  },
  {
    value: "water",
    label: "Water, please",
    description: "Request drinking water",
    Icon: Droplets,
  },
  {
    value: "bill",
    label: "Request the bill",
    description: "Ask the team for your bill",
    Icon: ReceiptText,
  },
  {
    value: "cutlery",
    label: "Plates or cutlery",
    description: "Ask for plates, spoons or tissues",
    Icon: Utensils,
  },
  {
    value: "other",
    label: "Something else",
    description: "Tell the team what you need",
    Icon: MessageCircle,
  },
];

function readableError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid") || message.includes("inactive") || message.includes("unpublished")) {
    return "This table QR is no longer active. Please ask a team member for help.";
  }
  if (message.includes("rate") || message.includes("too many")) {
    return "A few requests were sent just now. Please wait a moment before trying again.";
  }
  return "We couldn't send that request right now. Please try again or ask a team member directly.";
}

export default function PublicTableService({
  slug,
  tableToken,
  tableContext,
  hasStickyCart = false,
  launcherHidden = false,
  externalOpen,
  onExternalOpenChange,
}) {
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isControlledOpen = typeof externalOpen === "boolean";
  const isOpen = isControlledOpen ? externalOpen : localIsOpen;
  function setIsOpen(nextValue) {
    const nextOpen = typeof nextValue === "function" ? nextValue(isOpen) : nextValue;
    if (!isControlledOpen) setLocalIsOpen(nextOpen);
    onExternalOpenChange?.(nextOpen);
  }
  const [requestType, setRequestType] = useState("waiter");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const hasValidTableContext = Boolean(
    slug && tableToken && tableContext?.restaurant_id,
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, submitting]);

  if (!hasValidTableContext) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !slug || !tableToken) return;

    const cleanNote = note.trim();
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
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "create_public_table_service_request",
        {
          p_slug: slug,
          p_table_token: tableToken,
          p_request_type: requestType,
          p_note: cleanNote || null,
        },
      );
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.request_id) {
        throw new Error("The request was not confirmed by the server.");
      }
      setResult({ alreadyOpen: row.already_open === true, requestType });
      setNote("");
    } catch (submitError) {
      console.error("Unable to send table service request:", submitError);
      setError(readableError(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  function closePanel() {
    if (submitting) return;
    setIsOpen(false);
    setError("");
    setResult(null);
  }

  const chosenOption = REQUEST_OPTIONS.find((option) => option.value === requestType);

  return (
    <div className={`public-table-service${hasStickyCart ? " is-raised" : ""}`}>
      {!launcherHidden && !isOpen && (
      <button
        type="button"
        className="public-table-service-fab"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
          setError("");
        }}
      >
        <span className="public-table-service-fab-icon"><MessageCircle size={18} /></span>
        <span>Need help?</span>
      </button>
      )}

      {isOpen && (
        <div
          className="public-table-service-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) closePanel();
          }}
        >
          <section
            className="public-table-service-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-table-service-title"
          >
            <div className="public-table-service-panel-top">
              <div className="public-table-service-brand-mark"><BellRing size={20} /></div>
              <button
                type="button"
                className="public-table-service-close"
                aria-label="Close service requests"
                onClick={closePanel}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            {result ? (
              <div className="public-table-service-success" role="status">
                <span className="public-table-service-success-icon"><CheckCircle2 size={27} /></span>
                <h2 id="public-table-service-title">
                  {result.alreadyOpen ? "Your team is already on it" : "Request sent!"}
                </h2>
                <p>
                  {result.alreadyOpen
                    ? "Your earlier request is still open, so we haven't sent a duplicate."
                    : `The restaurant team has received your ${REQUEST_OPTIONS.find((option) => option.value === result.requestType)?.label.toLowerCase() || "service"} request.`}
                </p>
                <div className="public-table-service-table-pill">
                  <Clock3 size={15} />
                  Table {normalizeTableNumber(tableContext.table_number) || "—"}
                </div>
                <button type="button" className="public-table-service-done" onClick={closePanel}>
                  Done
                </button>
                <button
                  type="button"
                  className="public-table-service-another"
                  onClick={() => {
                    setResult(null);
                    setRequestType("waiter");
                    setError("");
                  }}
                >
                  Make another request
                </button>
              </div>
            ) : (
              <>
                <div className="public-table-service-heading">
                  <span className="public-table-service-eyebrow">HERE TO HELP</span>
                  <h2 id="public-table-service-title">What can we help with?</h2>
                  <p>Your request goes directly to the restaurant team.</p>
                  <span className="public-table-service-table-pill">
                    <Clock3 size={15} /> Table {normalizeTableNumber(tableContext.table_number) || "—"}
                  </span>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="public-table-service-options" role="radiogroup" aria-label="Choose a service request">
                    {REQUEST_OPTIONS.map(({ value, label, description, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={requestType === value}
                        className={`public-table-service-option${requestType === value ? " is-selected" : ""}`}
                        onClick={() => {
                          setRequestType(value);
                          setError("");
                        }}
                      >
                        <span className="public-table-service-option-icon"><Icon size={18} /></span>
                        <span className="public-table-service-option-copy">
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                        <span className="public-table-service-radio" aria-hidden="true" />
                      </button>
                    ))}
                  </div>

                  {requestType === "other" && (
                    <label className="public-table-service-note-label">
                      <span>What do you need?</span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value.slice(0, 240))}
                        placeholder="Tell us briefly…"
                        rows={3}
                        maxLength={240}
                        autoFocus
                      />
                      <small>{note.length}/240</small>
                    </label>
                  )}

                  {error && <p className="public-table-service-error" role="alert">{error}</p>}

                  <button
                    type="submit"
                    className="public-table-service-submit"
                    disabled={submitting || (requestType === "other" && !note.trim())}
                  >
                    {submitting ? <LoaderCircle className="public-table-service-spinner" size={17} /> : <Send size={17} />}
                    {submitting ? "Sending request…" : `Send ${chosenOption?.label.toLowerCase() || "request"}`}
                  </button>
                  <p className="public-table-service-footnote">No need to scan again. The restaurant team will see this in their service queue.</p>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
