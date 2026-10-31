import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { consumeLeadConfirmation, trackEvent } from "../lib/analytics";
import "./ThankYou.css";

export default function ThankYou() {
  const [searchParams] = useSearchParams();
  const leadType = searchParams.get("type") === "demo" ? "demo" : "contact";
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    if (!consumeLeadConfirmation(leadType)) return;
    trackEvent("generate_lead", { lead_type: leadType });
  }, [leadType]);

  return (
    <main className="kh-thank-you">
      <section className="kh-thank-you-card" aria-labelledby="kh-thank-you-title">
        <span className="kh-thank-you-icon"><CheckCircle2 size={30} /></span>
        <p className="kh-thank-you-eyebrow">MESSAGE RECEIVED</p>
        <h1 id="kh-thank-you-title">Thanks for reaching out.</h1>
        <p>Your {leadType === "demo" ? "demo request" : "enquiry"} has been received by Khaavio. Our team will review the details and contact you using the information you shared.</p>
        <Link to="/" className="kh-thank-you-link">Back to Khaavio <ArrowRight size={17} /></Link>
      </section>
    </main>
  );
}
