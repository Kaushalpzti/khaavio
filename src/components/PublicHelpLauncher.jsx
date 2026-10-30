import { LifeBuoy } from "lucide-react";
import "./PublicHelpLauncher.css";

export default function PublicHelpLauncher({
  showAI = false,
  showService = false,
  isPanelOpen = false,
  hasStickyCart = false,
  onOpen,
}) {
  if ((!showAI && !showService) || isPanelOpen) return null;

  return (
    <div className={`public-help-launcher ${hasStickyCart ? "is-raised" : ""}`}>
      <button
        type="button"
        className="public-help-launcher-fab"
        aria-label="Open Khaavio Concierge"
        aria-haspopup="dialog"
        aria-expanded={false}
        title="Khaavio Concierge"
        onClick={onOpen}
      >
        <LifeBuoy size={21} strokeWidth={2.1} aria-hidden="true" />
      </button>
    </div>
  );
}
