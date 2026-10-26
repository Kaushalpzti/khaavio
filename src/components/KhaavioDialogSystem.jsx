import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./KhaavioDialogSystem.css";

let activeDialogClose = null;

function confirmMeta(message) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  let title = "Confirm this action";
  let confirmLabel = "Continue";
  let danger = false;

  if (/delete/.test(lower)) {
    title = /categor/.test(lower) ? "Delete category?" : /menu item|from your menu/.test(lower) ? "Delete menu item?" : "Delete this item?";
    confirmLabel = "Delete";
    danger = true;
  } else if (/cancel order/.test(lower)) {
    title = "Cancel this order?";
    confirmLabel = "Cancel order";
    danger = true;
  } else if (/booking/.test(lower) && /reject|cancelled/.test(lower)) {
    title = /reject/.test(lower) ? "Reject this booking?" : "Cancel this booking?";
    confirmLabel = /reject/.test(lower) ? "Reject booking" : "Cancel booking";
    danger = true;
  } else if (/assign .* to /.test(lower)) {
    title = "Assign subscription plan?";
    confirmLabel = "Assign plan";
  } else if (/independently verified payment|verify payment/.test(lower)) {
    title = "Verify payment before activation";
    confirmLabel = "Continue to activation";
  } else if (/reject the subscription request/.test(lower)) {
    title = "Reject subscription request?";
    confirmLabel = "Reject request";
    danger = true;
  } else if (/final bill|close .*table/.test(lower)) {
    title = "Generate final bill?";
    confirmLabel = "Generate bill & close";
    danger = true;
  } else if (/mark invoice .* as paid/.test(lower)) {
    title = "Mark invoice as paid?";
    confirmLabel = "Mark as paid";
  } else if (/cancel/.test(lower)) {
    title = "Confirm cancellation";
    confirmLabel = "Confirm cancellation";
    danger = true;
  }
  return { title, confirmLabel, danger };
}

function promptMeta(message) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  if (/amount actually received|amount.*inr/.test(lower)) {
    return { title: "Confirm received payment", label: "Amount received (INR)", inputType: "number", placeholder: "Enter amount in rupees", multiline: false };
  }
  if (/payment reference|\butr\b/.test(lower)) {
    return { title: "Payment reference", label: "Verified UPI / bank reference (UTR)", inputType: "text", placeholder: "Enter at least 4 characters", multiline: false };
  }
  if (/reason shown to the restaurant owner/.test(lower)) {
    return { title: "Reason for rejection", label: "Reason (shown to restaurant owner)", inputType: "text", placeholder: "Add a clear, helpful reason", multiline: true };
  }
  if (/admin note/.test(lower)) {
    return { title: "Add an admin note", label: "Admin note (optional)", inputType: "text", placeholder: "Offer eligibility or payment context", multiline: true };
  }
  return { title: "Enter details", label: "Value", inputType: "text", placeholder: "Enter a value", multiline: false };
}

function DialogView({ kind, message, defaultValue, onResolve }) {
  const [value, setValue] = useState(defaultValue == null ? "" : String(defaultValue));
  const [validation, setValidation] = useState("");
  const panelRef = useRef(null);
  const fieldRef = useRef(null);
  const meta = kind === "confirm" ? confirmMeta(message) : promptMeta(message);

  useEffect(() => {
    const target = kind === "prompt" ? fieldRef.current : panelRef.current?.querySelector(".khaavio-dialog__cancel");
    target?.focus?.({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(kind === "confirm" ? false : null);
        return;
      }
      if (event.key === "Tab" && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex='0']"));
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [kind, onResolve]);

  function submit(event) {
    event?.preventDefault?.();
    if (kind === "prompt") {
      if (/payment reference|\butr\b/i.test(String(message || "")) && value.trim().length < 4) {
        setValidation("Enter a payment reference of at least 4 characters.");
        fieldRef.current?.focus();
        return;
      }
      onResolve(value);
      return;
    }
    onResolve(true);
  }

  return (
    <div
      className="khaavio-dialog__backdrop"
      data-khaavio-dialog-layer="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(kind === "confirm" ? false : null);
      }}
    >
      <section
        className="khaavio-dialog"
        ref={panelRef}
        role={kind === "confirm" && meta.danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="khaavio-dialog-title"
        aria-describedby="khaavio-dialog-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="khaavio-dialog__header">
          <div className={`khaavio-dialog__mark${meta.danger ? " is-danger" : ""}`} aria-hidden="true">K</div>
          <div className="khaavio-dialog__heading">
            <span className="khaavio-dialog__eyebrow">KHAAVIO Â· RESTAURANT WORKSPACE</span>
            <h2 id="khaavio-dialog-title">{meta.title}</h2>
          </div>
          <button
            type="button"
            className="khaavio-dialog__close khaavio-dialog__focusable"
            aria-label="Close dialog"
            onClick={() => onResolve(kind === "confirm" ? false : null)}
          >Ã—</button>
        </header>
        <div className="khaavio-dialog__body">
          <p id="khaavio-dialog-message" className="khaavio-dialog__message">{String(message || "Please review this action before continuing.")}</p>
          {kind === "prompt" && (
            <form onSubmit={submit}>
              <label className="khaavio-dialog__field-label" htmlFor="khaavio-dialog-input">{meta.label}</label>
              {meta.multiline ? (
                <textarea
                  id="khaavio-dialog-input"
                  ref={fieldRef}
                  className="khaavio-dialog__input khaavio-dialog__textarea"
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setValidation(""); }}
                  placeholder={meta.placeholder}
                  rows={4}
                />
              ) : (
                <input
                  id="khaavio-dialog-input"
                  ref={fieldRef}
                  className="khaavio-dialog__input"
                  type={meta.inputType}
                  min={meta.inputType === "number" ? "0.01" : undefined}
                  step={meta.inputType === "number" ? "0.01" : undefined}
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setValidation(""); }}
                  placeholder={meta.placeholder}
                  autoComplete="off"
                />
              )}
              {validation && <p className="khaavio-dialog__validation" role="alert">{validation}</p>}
              <div className="khaavio-dialog__actions">
                <button type="button" className="khaavio-dialog__button khaavio-dialog__cancel khaavio-dialog__focusable" onClick={() => onResolve(null)}>Cancel</button>
                <button type="submit" className="khaavio-dialog__button khaavio-dialog__primary">Save and continue</button>
              </div>
            </form>
          )}
          {kind === "confirm" && (
            <div className="khaavio-dialog__actions">
              <button type="button" className="khaavio-dialog__button khaavio-dialog__cancel khaavio-dialog__focusable" onClick={() => onResolve(false)}>Cancel</button>
              <button type="button" className={`khaavio-dialog__button ${meta.danger ? "khaavio-dialog__danger" : "khaavio-dialog__primary"}`} onClick={submit}>{meta.confirmLabel}</button>
            </div>
          )}
        </div>
        <footer className="khaavio-dialog__footer"><span className="khaavio-dialog__footer-dot" /> Your action will only continue after confirmation.</footer>
      </section>
    </div>
  );
}

function openDialog(kind, message, defaultValue) {
  return new Promise((resolve) => {
    if (activeDialogClose) activeDialogClose(kind === "confirm" ? false : null);
    const previouslyFocused = document.activeElement;
    const container = document.createElement("div");
    container.setAttribute("data-khaavio-dialog-root", "true");
    document.body.appendChild(container);
    const root = createRoot(container);
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      if (activeDialogClose === finish) activeDialogClose = null;
      root.unmount();
      container.remove();
      resolve(value);
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === "function") {
        window.requestAnimationFrame(() => previouslyFocused.focus({ preventScroll: true }));
      }
    };
    activeDialogClose = finish;
    root.render(<DialogView kind={kind} message={message} defaultValue={defaultValue} onResolve={finish} />);
  });
}

export function confirmKhaavio(message) {
  return openDialog("confirm", message, undefined);
}

export function promptKhaavio(message, defaultValue = "") {
  return openDialog("prompt", message, defaultValue);
}
