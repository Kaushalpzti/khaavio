import { ArrowLeft, ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import khaavioIcon from "../assets/icon.png";
import "./LegalPage.css";

const SUPPORT_EMAIL = "khaavioqr@gmail.com";
const SUPPORT_WHATSAPP = "917324883263";
const LAST_UPDATED = "28 October 2026";

const LEGAL_CONTENT = {
  privacy: {
    eyebrow: "YOUR DATA, TREATED WITH CARE",
    title: "Privacy Policy",
    description:
      "Learn what information Khaavio handles, why it is used, and how restaurant teams and guests can contact us about privacy.",
    intro:
      "This policy explains how Khaavio handles information when you visit khaavio.in, create a restaurant workspace, or use Khaavio-powered menus, QR ordering, bookings and order tracking.",
    sections: [
      {
        title: "1. Who this policy covers",
        paragraphs: [
          "Khaavio is a digital platform that helps restaurants manage digital menus, table QR codes, online order requests, bookings, kitchen updates and subscription access. This policy applies to the Khaavio website and platform.",
          "When a restaurant collects guest details through its own Khaavio-powered menu, order or booking page, that restaurant generally decides why it needs those details and how it uses them. Khaavio provides the technology that processes those details to deliver the restaurant's requested service. For a question about a specific restaurant's use of your details, contact the restaurant first; we will help route a request where appropriate.",
        ],
      },
      {
        title: "2. Information we may handle",
        bullets: [
          "Account information: name, email address, authentication identifiers and account or access status.",
          "Restaurant workspace information: restaurant name, slug, contact or address details supplied by the operator, menu items, prices, opening hours, table settings, logos and other content the operator uploads.",
          "Guest order and booking information: name, a mobile number for public menu orders, email when provided, party size, requested date and time, order items, notes, booking/order status and reference identifiers.",
          "Subscription and support information: selected plan, request notes, amount and payment reference/UTR supplied for manual verification, activation status, support messages and related records.",
          "Technical information: basic request, device, browser, diagnostic and security information needed to operate, protect and troubleshoot the service.",
        ],
      },
      {
        title: "3. How we use information",
        bullets: [
          "Create and secure accounts and restaurant workspaces.",
          "Display restaurant menus and pass orders or booking requests to the relevant restaurant workspace.",
          "Provide order tracking, kitchen updates, receipts, subscription administration and customer support.",
          "Group submitted orders by the guest-provided mobile number to show the relevant restaurant repeat-visit and order trends. Promotional messages require any consent that applicable law requires; submitting an order is not marketing consent.",
          "Verify manual subscription payments, prevent fraud or misuse, maintain records and resolve disputes.",
          "Maintain platform reliability, troubleshoot failures, protect the service and meet legal obligations.",
        ],
        paragraphs: [
          "We use information for the purposes described here and as otherwise explained when information is collected. Where required by applicable law, we will seek valid consent and provide a practical way to withdraw it.",
        ],
      },
      {
        title: "4. How information is shared",
        paragraphs: [
          "Guest information submitted on a restaurant's page is made available to the relevant restaurant so it can manage the order or booking. Restaurant owners and authorised team members are responsible for controlling who in their organisation can access it.",
          "We use service providers to host and operate the platform, including Vercel for website hosting and Supabase for authentication and database services. These providers may process information as needed to provide their services under their applicable terms and safeguards. We may also disclose information where reasonably necessary to address legal process, protect users or the service, or handle a business reorganisation. We do not sell personal information as a business model.",
        ],
      },
      {
        title: "5. Payments and payment references",
        paragraphs: [
          "Khaavio subscription renewals may be reviewed manually. To verify a subscription payment, we may record the plan, amount, payment reference/UTR, verification status and related dates. Do not send us your password, card PIN, banking password or one-time password (OTP).",
          "Food, beverage, booking deposits and other restaurant charges are managed by the restaurant unless a particular flow clearly states otherwise. Khaavio does not act as the restaurant or prepare or deliver food.",
        ],
      },
      {
        title: "6. Cookies and browser storage",
        paragraphs: [
          "The platform may use essential browser storage and session technologies to keep you signed in, remember necessary settings and protect account access. Your browser may also retain technical data needed for security and troubleshooting. If optional analytics or advertising technologies are introduced, we will update this policy and provide choices or notices where required by law.",
        ],
      },
      {
        title: "7. Retention and security",
        paragraphs: [
          "We retain information for as long as reasonably needed to provide the service, maintain business and security records, resolve issues, enforce agreements or comply with applicable law. Retention can vary by data type and the restaurant's settings and obligations. Deletion from an active system may not immediately remove every backup or record we must retain.",
          "We use reasonable technical and organisational safeguards designed to protect information. No online service or transmission can be guaranteed to be completely secure. Restaurant operators must protect their credentials and limit workspace access to people who need it.",
        ],
      },
      {
        title: "8. Your choices and requests",
        paragraphs: [
          "You can ask us to access, correct or delete Khaavio account information, or raise a privacy question, by emailing us from the address associated with the account. We may need to verify your identity and may retain information where permitted or required for security, legal or recordkeeping purposes.",
          "If your information was submitted by a restaurant guest through a restaurant's menu, booking or order flow, contact that restaurant first for requests relating to the restaurant's use of the information. We will assist where the request concerns systems operated by Khaavio.",
        ],
      },
      {
        title: "9. Children",
        paragraphs: [
          "Khaavio restaurant workspaces are designed for business operators and authorised team members, not for children to create business accounts. Restaurants are responsible for ensuring that guest information they collect through their own workflows is collected and used lawfully, including any applicable requirements relating to children or guardians.",
        ],
      },
      {
        title: "10. Indian data protection framework and privacy requests",
        paragraphs: [
          "Khaavio reviews its personal-data handling against applicable Indian privacy law, including the Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025. Different provisions have different commencement dates under the notified schedule. This policy does not represent a provision as currently in force before its legal commencement; we will update notices and workflows as requirements applicable to our service take effect.",
          "To request access to, correction of, or erasure of Khaavio account information—or to withdraw consent where processing is based on consent—email khaavioqr@gmail.com. Describe the request and identify the account using the associated email address. We may need to verify identity, coordinate with a restaurant where it determines how guest information is used, and retain certain records where permitted or required by law. We will handle verified requests within the timelines required by applicable law.",
          "Where Khaavio provides technical processing on behalf of a restaurant, that restaurant may be the right first contact for decisions about guest data. We will assist with routing a request where appropriate."
        ],
      },
      {
        title: "11. Updates and contact",
        paragraphs: [
          "We may update this policy when the service or legal requirements change. The latest version will be published on this page with its updated date. Material changes will be communicated through the platform or another reasonable channel where appropriate.",
        ],
      },
    ],
  },
  terms: {
    eyebrow: "A CLEAR WAY TO WORK TOGETHER",
    title: "Terms & Conditions",
    description:
      "The terms for using Khaavio's restaurant software, digital menus, QR ordering, bookings and subscription services.",
    intro:
      "These Terms govern your access to the Khaavio website and platform. By creating an account or using the service, you agree to these Terms. If you use Khaavio for a restaurant or business, you confirm that you are authorised to bind that business to these Terms.",
    sections: [
      {
        title: "1. What Khaavio provides",
        paragraphs: [
          "Khaavio provides digital tools that may include restaurant-branded menus, table QR codes, online order requests, order tracking, kitchen updates, table bookings, receipts, analytics and subscription management. Features and limits depend on the plan and the functionality available at the time.",
          "Khaavio is a technology platform, not a restaurant, food manufacturer, delivery provider or agent of any restaurant. A restaurant remains responsible for its food, prices, availability, hygiene, allergens, fulfilment, booking acceptance and guest service.",
        ],
      },
      {
        title: "2. Accounts and access",
        bullets: [
          "Provide accurate account and restaurant information and keep it updated.",
          "Keep your password and authentication methods confidential and promptly tell us if you suspect unauthorised access.",
          "Only invite team members who are authorised to access the workspace, and promptly remove access when it is no longer needed.",
          "You are responsible for activity performed through your account, except where applicable law provides otherwise.",
        ],
      },
      {
        title: "3. Free trial, plans and subscriptions",
        paragraphs: [
          "The website currently advertises a 7-day free trial without a card requirement. Trial access begins when it is assigned to the restaurant workspace and may end or become limited after the trial period unless an eligible plan is activated.",
          "Plan names, prices, billing intervals, feature limits and availability are shown in the product or communicated by Khaavio. Prices are shown in Indian rupees (INR). Applicable taxes, if any, will be communicated or shown before payment where required.",
          "Khaavio may use a manual renewal-request and payment-verification process. Submitting a renewal request is not itself confirmation that a paid plan is active. Access is updated after the payment and request are verified and the plan is assigned. Unless a checkout or written offer clearly says otherwise, do not assume that a subscription automatically renews or that a payment method will be charged automatically.",
          "Changes to plan prices or features will apply prospectively and will not remove rights that applicable law gives you for a paid period already purchased.",
        ],
      },
      {
        title: "4. Restaurant responsibilities",
        bullets: [
          "Ensure that menu descriptions, prices, availability, opening hours, booking rules and restaurant details are accurate and lawful.",
          "Handle food preparation, allergen information, order acceptance and fulfilment, guest complaints, cancellations and restaurant-side refunds.",
          "Use guest information only for legitimate restaurant operations and protect it from unauthorised access.",
          "Ensure that uploaded logos, photographs, menu text and other content may lawfully be used and displayed.",
        ],
      },
      {
        title: "5. Guest orders and bookings",
        paragraphs: [
          "A guest order or booking request made through a Khaavio-powered page is directed to the relevant restaurant. The restaurant determines availability, accepts or rejects requests, prepares the order and communicates any restaurant-specific payment or cancellation conditions. Guests should contact the restaurant about food, fulfilment, allergens, reservation changes or restaurant charges.",
        ],
      },
      {
        title: "6. Acceptable use and content",
        paragraphs: [
          "Do not misuse the service, attempt unauthorised access, interfere with platform security, upload unlawful or deceptive content, submit malicious code, or use the platform to violate another person's rights. We may remove content or restrict access where reasonably necessary to protect the service, users or compliance with law.",
          "You keep your rights in content you upload. You grant Khaavio permission to host, process, display and transmit that content only as reasonably needed to provide, maintain and support the service. You are responsible for the accuracy and legality of your content.",
        ],
      },
      {
        title: "7. Availability and changes",
        paragraphs: [
          "We aim to keep Khaavio useful and reliable, but uninterrupted or error-free operation cannot be guaranteed. Maintenance, network issues, third-party service failures or changes outside our reasonable control may temporarily affect access. We may update or discontinue features where reasonably necessary, while taking reasonable steps to communicate material changes to users who may be affected.",
        ],
      },
      {
        title: "8. Privacy and third-party services",
        paragraphs: [
          "Our Privacy Policy explains how information is handled. The platform relies on third-party infrastructure and services, which may be subject to their own terms. We are not responsible for independent third-party services beyond the responsibilities imposed on us by applicable law.",
        ],
      },
      {
        title: "9. Suspension and termination",
        paragraphs: [
          "You may stop using Khaavio and request account closure through support. We may suspend or restrict access if reasonably necessary to address security risks, unlawful use, non-payment, a material breach of these Terms or a risk to other users. Where appropriate, we will provide notice and an opportunity to resolve the issue. Outstanding obligations and provisions that by their nature should continue will survive termination.",
        ],
      },
      {
        title: "10. Disclaimers and liability",
        paragraphs: [
          "Khaavio is supplied on an as-available basis, subject to warranties and rights that cannot be excluded under applicable law. To the maximum extent permitted by law, Khaavio is not responsible for indirect or consequential loss arising from a restaurant's own food, pricing, booking, fulfilment or business decisions. Nothing in these Terms excludes or limits liability or consumer rights that cannot lawfully be excluded or limited.",
        ],
      },
      {
        title: "11. Consumer complaints and grievance handling",
        paragraphs: [
          "Send complaints about Khaavio software, account access or subscription billing to khaavioqr@gmail.com. Include your account email, a clear description of the issue and relevant dates or payment references. Do not send passwords, card PINs, banking passwords or OTPs.",
          "We aim to acknowledge consumer complaints within 48 hours and resolve them within 30 days, or sooner where a different deadline is required by applicable law. This process does not limit any statutory right or remedy. For food quality, fulfilment, restaurant-side cancellations, bookings or charges collected by a restaurant, contact the restaurant directly; Khaavio can assist with issues relating to the platform itself."
        ],
      },
      {
        title: "12. Law, changes and contact",
        paragraphs: [
          "These Terms are governed by the laws of India, subject to any mandatory protections and jurisdictional rights available under applicable law. We may update the Terms as the platform evolves; the latest version and its updated date will appear here.",
        ],
      },
    ],
  },
  refund: {
    eyebrow: "STRAIGHTFORWARD BILLING, CLEAR EXPECTATIONS",
    title: "Refund & Cancellation Policy",
    description:
      "How Khaavio handles subscription cancellations, manual payment verification and refund requests.",
    intro:
      "This policy covers fees paid to Khaavio for its software subscriptions. It does not replace a restaurant's own policy for food orders, table bookings, deposits or other restaurant charges.",
    sections: [
      {
        title: "1. Free trial",
        paragraphs: [
          "Khaavio currently advertises a 7-day free trial without a card requirement. If no payment was collected for the trial, there is no trial fee to refund. A paid plan is activated only when the applicable plan and payment process have been completed.",
        ],
      },
      {
        title: "2. Subscription renewals and cancellation",
        paragraphs: [
          "Subscription renewals may be requested and verified manually. Sending a renewal request does not guarantee activation and does not, by itself, authorise an automatic charge. If you do not want to continue after your current access period, do not submit or pay for a further renewal request. Contact support if you need help confirming your current plan or end date.",
        ],
      },
      {
        title: "3. When a refund may be available",
        paragraphs: [
          "We review refund requests individually. Subject to verification and applicable law, a refund may be approved for a duplicate payment, an amount charged or received in error, or a verified subscription payment where access was not activated because of a Khaavio-side issue and we cannot resolve the activation problem within five business days after you notify support. We will also consider other cases where a refund is required by law or is expressly approved by Khaavio in writing.",
          "Except where required by law or expressly agreed in writing, partial-period or pro-rata refunds are not automatic after a subscription has been activated. Unused days, low usage, a restaurant's decision to stop using the platform, or a change of business plans do not by themselves guarantee a refund.",
        ],
      },
      {
        title: "4. Restaurant guest payments are handled by restaurants",
        paragraphs: [
          "Khaavio provides ordering and booking technology; it does not prepare or deliver restaurant food. Requests for refunds, cancellations, booking deposits, incorrect dishes or restaurant-side payments must be directed to the restaurant that accepted the order or booking. The restaurant is responsible for its own guest-facing policy and applicable obligations.",
        ],
      },
      {
        title: "5. How to request a refund",
        paragraphs: [
          "Email khaavioqr@gmail.com with the account email, restaurant name, plan, payment date, amount and payment reference/UTR (if applicable). Explain the issue and include any receipt or confirmation that supports the request. Do not send passwords, card PINs, banking passwords or OTPs. We may request reasonable information to verify the payment and prevent fraud.",
          "We aim to review complete requests within five business days. If approved, we aim to initiate the refund within 7–10 business days using the original payment method where possible or another verified method agreed with you. Banks and payment providers may take additional time to credit the funds. We will explain the outcome if a request is declined.",
        ],
      },
      {
        title: "6. Legal rights, complaints and updates",
        paragraphs: [
          "Subscription billing complaints and policy concerns can be sent to khaavioqr@gmail.com with the account email, relevant dates, amount and payment reference where applicable. We aim to acknowledge consumer complaints within 48 hours and resolve them within 30 days, or sooner where a different deadline is required by applicable law.",
          "Nothing in this policy limits any refund, cancellation or consumer right that cannot lawfully be excluded. Any mandatory statutory right or applicable payment-system requirement takes precedence over a conflicting statement in this policy. This policy may be updated as billing workflows or legal requirements change; the current version and its updated date will be published here.",
        ],
      },
    ],
  },
};

export default function LegalPage({ type }) {
  const page = LEGAL_CONTENT[type] || LEGAL_CONTENT.privacy;

  const otherLinks = [
    { label: "Privacy", to: "/privacy", active: type === "privacy" },
    { label: "Terms", to: "/terms", active: type === "terms" },
    { label: "Refunds", to: "/refund-policy", active: type === "refund" },
  ];

  return (
    <main className="kh-legal-page">
      <header className="kh-legal-header">
        <Link to="/" className="kh-legal-brand" aria-label="Khaavio home">
          <img src={khaavioIcon} alt="" width="42" height="42" />
          <span>Khaa<span>vio</span></span>
        </Link>
        <Link to="/" className="kh-legal-back">
          <ArrowLeft size={16} /> Back to Khaavio
        </Link>
      </header>

      <section className="kh-legal-hero">
        <span className="kh-legal-eyebrow"><ShieldCheck size={14} /> {page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <div className="kh-legal-meta">Last updated: {LAST_UPDATED}</div>
      </section>

      <nav className="kh-legal-tabs" aria-label="Legal pages">
        {otherLinks.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={item.active ? "is-active" : ""}
            aria-current={item.active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="kh-legal-operator" aria-label="Legal operator and grievance contact">
        <div className="kh-legal-operator-heading">
          <span className="kh-legal-eyebrow"><ShieldCheck size={14} /> OPERATOR &amp; GRIEVANCE CONTACT</span>
          <h2>Who operates Khaavio?</h2>
          <p>For privacy requests, subscription concerns or consumer complaints, use the contact details below.</p>
        </div>
        <dl className="kh-legal-operator-details">
          <div><dt>Legal operator</dt><dd>Kaushal Kumar</dd></div>
          <div><dt>Principal business address</dt><dd>Patna, Bihar – 800011, India</dd></div>
          <div><dt>Grievance Officer</dt><dd>Kaushal Kumar (Platform Operator)</dd></div>
          <div><dt>Phone</dt><dd><a href="tel:+919471640485">+91 9471640485</a></dd></div>
          <div><dt>Grievance email</dt><dd><a href="mailto:kaushalpzti@gmail.com">kaushalpzti@gmail.com</a></dd></div>
        </dl>
        <p className="kh-legal-operator-timing">We aim to acknowledge consumer complaints within 48 hours and redress them within 30 days of receipt, or sooner where applicable law requires.</p>
      </section>

      <article className="kh-legal-document">
        {page.sections.map((section) => (
          <section className="kh-legal-section" key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}

        <aside className="kh-legal-contact">
          <div className="kh-legal-contact-icon"><Mail size={20} /></div>
          <div>
            <h2>Support &amp; grievance contact</h2>
            <p>For privacy requests, subscription questions or consumer complaints, contact Khaavio Support. We aim to acknowledge consumer complaints within 48 hours and address them within 30 days, or sooner where applicable law requires.</p>
            <div className="kh-legal-contact-actions">
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL} <ArrowUpRight size={14} /></a>
              <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer">WhatsApp support <ArrowUpRight size={14} /></a>
            </div>
          </div>
        </aside>
      </article>

      <footer className="kh-legal-footer">
        <span>© {new Date().getFullYear()} Khaavio. Every Table, Digitally Connected.</span>
        <div className="kh-legal-footer-links"><Link to="/about">About Khaavio</Link><Link to="/">Back to homepage <ArrowUpRight size={14} /></Link></div>
      </footer>
    </main>
  );
}
