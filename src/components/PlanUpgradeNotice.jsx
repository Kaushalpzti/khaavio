import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import "./PlanUpgradeNotice.css";

export default function PlanUpgradeNotice({
  title = "Unlock more with Growth",
  description = "Upgrade to Growth to use this feature.",
  compact = false,
}) {
  return (
    <aside
      className={`plan-upgrade-notice${compact ? " plan-upgrade-notice-compact" : ""}`}
      role="note"
    >
      <span className="plan-upgrade-notice-icon" aria-hidden="true">
        <Sparkles size={17} />
      </span>
      <span className="plan-upgrade-notice-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <Link to="/dashboard/subscription" className="plan-upgrade-notice-link">
        View plans
      </Link>
    </aside>
  );
}
