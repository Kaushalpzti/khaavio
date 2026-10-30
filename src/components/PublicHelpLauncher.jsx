import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Headset, LifeBuoy, Sparkles } from "lucide-react";
import "./PublicHelpLauncher.css";

export default function PublicHelpLauncher({
  showAI = false,
  showService = false,
  isPanelOpen = false,
  hasStickyCart = false,
  onSelectAI,
  onSelectService,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isPanelOpen) setIsOpen(false);
  }, [isPanelOpen]);

  if ((!showAI && !showService) || isPanelOpen) return null;

  function choose(action) {
    setIsOpen(false);
    action?.();
  }

  return (
    <div
      ref={rootRef}
      className={`public-help-launcher ${hasStickyCart ? "is-raised" : ""}`}
    >
      {isOpen && (
        <section
          className="public-help-launcher-menu"
          role="dialog"
          aria-label="Khaavio help options"
        >
          <div className="public-help-launcher-menu-heading">
            <span className="public-help-launcher-menu-icon"><LifeBuoy size={17} /></span>
            <div>
              <strong>How can we help?</strong>
              <small>Choose the support you need</small>
            </div>
          </div>

          <div className="public-help-launcher-options">
            {showService && (
              <button
                type="button"
                className="public-help-launcher-option"
                onClick={() => choose(onSelectService)}
              >
                <span className="public-help-launcher-option-icon is-support"><Headset size={18} /></span>
                <span className="public-help-launcher-option-copy">
                  <strong>Contact restaurant team</strong>
                  <small>Call a waiter, request water or ask for your bill</small>
                </span>
                <ChevronDown size={15} className="public-help-launcher-option-arrow" />
              </button>
            )}

            {showAI && (
              <button
                type="button"
                className="public-help-launcher-option"
                onClick={() => choose(onSelectAI)}
              >
                <span className="public-help-launcher-option-icon is-ai"><Bot size={18} /></span>
                <span className="public-help-launcher-option-copy">
                  <strong>Ask Khaavio</strong>
                  <small>Get dish suggestions and menu answers</small>
                </span>
                <Sparkles size={14} className="public-help-launcher-ai-sparkle" />
              </button>
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        className={`public-help-launcher-fab ${isOpen ? "is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close help options" : "Open help options"}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <span className="public-help-launcher-fab-close">×</span> : <LifeBuoy size={17} />}
        <span>{isOpen ? "Close" : "Help"}</span>
      </button>
    </div>
  );
}
