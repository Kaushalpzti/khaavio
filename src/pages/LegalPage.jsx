import { ArrowLeft, ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import khaavioIcon from "../assets/icon.png";
import "./LegalPage.css";

const SUPPORT_EMAIL = "khaavioqr@gmail.com";
const GRIEVANCE_EMAIL = "kaushalpzti@gmail.com";
const SUPPORT_WHATSAPP = "917324883263";
const OPERATOR_PHONE = "+919471640485";
const LAST_UPDATED = "30 October 2026";

const LEGAL_CONTENT = {
  privacy: {
    eyebrow: "YOUR DATA, TREATED WITH CARE",
    title: "Privacy Policy",
    description:
      "What information Khaavio handles, why it is used, and how restaurant teams and guests can contact us about privacy.",
    intro:
      "This policy explains how Khaavio handles information when you visit khaavio.in, create a restaurant workspace, send us an enquiry, or use Khaavio-powered menus, QR ordering, bookings and order tracking.",
    sections: [
      {
        title: "1. Who this policy applies to",
        paragraphs: [
          "Khaavio is a software platform for restaurant digital menus, table QR codes, order requests, order tracking, kitchen workflows, bookings, table-service requests and subscription access. This policy applies to the Khaavio website and services operated by Khaavio.",
          "When a guest uses a restaurant's Khaavio-powered menu, order or booking flow, the restaurant generally determines why it collects the guest's information and how it uses it. Khaavio provides technology to process and display that information so the restaurant can manage its service. For a request about a restaurant's own use of guest information, contact that restaurant first; we will help route requests where appropriate.",
        ],
      },
      {
        title: "2. Information we may handle",
        bullets: [
          "Account and authentication information: name, email address, authentication identifiers, account status and access permissions.",
          "Restaurant workspace information: business name, menu slug, contact details, address, opening hours, menu items, prices, photos, logos, table settings and content uploaded by the restaurant team.",
          "Guest order and booking information: name, mobile number, email if supplied, party size, requested date and time, order items, notes, order or booking status, reference identifiers and related service requests. Khaavio requires a mobile number for public menu orders so the restaurant can process the order and provide order-related updates.",
          "Loyalty information: a random browser token used to reopen a guest's Perks card on the same browser, an optional restaurant loyalty phone contact, stamp balance, reward status and the customer's separate promotional preference. The phone number is not OTP-verified and is not sufficient by itself to access a Perks card or recover it on another device.",
          "Website enquiries: name, phone number, business name and type, city, optional email, preferred demo time, enquiry category and message submitted through the Khaavio demo or contact forms."
          "Subscription and support information: selected plan, trial and subscription status, billing cycle, payment amount, Razorpay transaction and subscription references, mandate status, renewal and cancellation records, and support correspondence.",
          "Technical and security information: basic browser/device information, request and diagnostic records, and information needed to protect, troubleshoot and maintain the service.",
        ],
      },
      {
        title: "3. How we use information",
        bullets: [
          "Create, authenticate and secure accounts and restaurant workspaces.",
          "Publish restaurant menus and deliver order, booking and service requests to the relevant restaurant workspace.",
          "Provide order tracking, kitchen updates, receipts, table sessions, subscription administration and support.",
          "Process and verify subscription payments through Razorpay, manage subscription access and authorised recurring mandates, prevent misuse, resolve payment questions and maintain appropriate business records.",
          "Understand repeat-visit and order trends for the relevant restaurant where the product feature uses guest-provided identifiers. Where relevant, submitting an order is not marketing consent and does not, by itself, authorise promotional marketing messages.",
          "Troubleshoot errors, maintain service reliability, protect users and meet applicable legal obligations.",
        ],
        paragraphs: [
          "We use information for the purposes described in this policy or explained when it is collected. Where applicable law requires consent or another notice, we will follow the requirements that apply to the relevant processing.",
        ],
      },
      {
        title: "4. Restaurant responsibilities for guest information",
        paragraphs: [
          "Restaurant owners and authorised team members can access the information needed to manage their menus, orders, bookings and table-service requests. Restaurants are responsible for limiting staff access, keeping their own notices and practices appropriate, and using guest information only for legitimate purposes and in accordance with applicable law.",
          "If you are a guest and want a restaurant to correct or delete details it collected, contact that restaurant. Khaavio can assist when the request concerns platform systems or information for which Khaavio is responsible.",
        ],
      },
      {
        title: "5. Sharing and service providers",
        paragraphs: [
          "We share guest order or booking details with the restaurant that needs those details to respond to the guest. We use technology providers, including Supabase for authentication and database services, Vercel for website hosting, Razorpay for payment and subscription processing, and Groq for the Khaavio AI menu assistant when a guest chooses to use it. Google Analytics 4 may process website usage information only after the visitor allows analytics through the privacy choices control. These providers may process relevant information under their applicable terms and safeguards."
          "We may disclose information where reasonably necessary to comply with law or valid legal process, protect the rights and security of users or the service, investigate abuse, or manage a permitted business reorganisation. We do not sell personal information as a business model.",
        ],
      },
      {
        title: "6. Website forms, email and browser storage",
        paragraphs: [
          "The Book a Free Demo and Contact Us forms submit the details you enter to Khaavio's website API. The enquiry is stored in a restricted lead table in the Khaavio Supabase project so the team can review and respond. Submission does not automatically book a calendar slot. Do not include passwords, OTPs, card numbers or payment credentials.",
          "Khaavio uses essential browser storage for account sessions, settings and guest workflows. The Perks browser token is a random identifier stored on the device and is used to access that browser's loyalty card; a phone number alone cannot retrieve a card. If the visitor allows analytics, Khaavio loads Google Analytics 4 and stores the analytics choice in browser local storage. Visitors can reject optional analytics or reopen Privacy choices at any time. If analytics are not configured or consent is not granted, the GA4 script is not loaded."
        ],
      },
      {
        title: "7. Retention and security",
        paragraphs: [
          "We retain information for as long as reasonably necessary to provide the service, maintain security and business records, resolve disputes, enforce agreements or meet legal obligations. Retention varies by data type, purpose and the restaurant's settings and obligations. Information removed from an active system may remain in backups or records that must be retained for a legitimate or legal reason for a limited period.",
          "We use reasonable technical and organisational safeguards designed to protect information. No online service or method of transmission can be guaranteed completely secure. Keep credentials confidential, use strong authentication where available and restrict workspace access to people who need it.",
        ],
      },
      {
        title: "8. Your choices and privacy requests",
        paragraphs: [
          "You can contact us to ask about Khaavio account information, request correction or deletion where appropriate, or raise a privacy concern. Email the address below and identify the relevant account or request. We may ask for reasonable information to verify your identity. Some records may need to be retained where permitted or required by law, for security or to resolve disputes.",
          "Where processing is handled on behalf of a restaurant, the restaurant may need to decide or respond to the request. We will assist with routing the request where appropriate and handle platform-side requests according to applicable law.",
        ],
      },
      {
        title: "9. Children and sensitive information",
        paragraphs: [
          "Khaavio restaurant workspaces are intended for business operators and authorised team members, not for children to create business accounts. Please do not send passwords, card PINs, banking passwords or one-time passwords (OTPs) to Khaavio. Restaurants must handle guest information lawfully, including any requirements that apply to children or guardians.",
        ],
      },
      {
        title: "10. Indian privacy law and policy updates",
        paragraphs: [
          "Khaavio reviews its data-handling practices against applicable Indian privacy law, including the Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025. The notified framework has phased commencement dates. We will implement and update the notices and workflows required as the relevant provisions applicable to the service come into effect; this policy does not state that a provision is in force before its applicable commencement date.",
          "We may update this policy when the service, our providers or applicable requirements change. The latest version and update date will be published on this page. Material changes may also be communicated through the platform or another reasonable channel where appropriate.",
        ],
      },
    ],
  },
  terms: {
    eyebrow: "A CLEAR WAY TO WORK TOGETHER",
    title: "Terms & Conditions",
    description:
      "The terms that apply to access and use of Khaavio's restaurant software, digital menus, QR ordering, bookings and subscription services.",
    intro:
      "These Terms govern your access to the Khaavio website and platform. By creating an account or using the service, you agree to these Terms. If you use Khaavio for a restaurant or business, you confirm that you are authorised to act for that business.",
    sections: [
      {
        title: "1. The Khaavio service",
        paragraphs: [
          "Khaavio provides digital tools that may include restaurant-branded menus, restaurant and table QR codes, QR-based order requests, order tracking, kitchen updates, table-side service requests, bookings, receipts, analytics and subscription management. Available features, limits and eligibility depend on the plan and the functionality available at the time.",
          "Khaavio is a technology provider, not a restaurant, food manufacturer, delivery provider or agent of a restaurant. The restaurant remains responsible for its food, menu descriptions, prices, availability, hygiene, allergen information, order acceptance and fulfilment, booking decisions, guest service and restaurant-side charges or refunds.",
        ],
      },
      {
        title: "2. Accounts and authorised access",
        bullets: [
          "Provide accurate account and restaurant details and update them when they change.",
          "Keep passwords and authentication methods confidential and tell us promptly if you suspect unauthorised access.",
          "Only grant workspace access to team members who are authorised to use it, and remove access when no longer needed.",
          "Do not impersonate another person, bypass access controls or use another person's account without permission.",
          "You are responsible for activity through your account except where applicable law provides otherwise.",
        ],
      },
      {
        title: "3. Free trial, plans and subscription access",
        paragraphs: [
          "Khaavio offers a 7-day free trial without requiring a payment card or AutoPay mandate. The trial does not automatically convert into a paid subscription, and no subscription charge is initiated merely because the trial ends. After the trial, the restaurant owner may independently choose to purchase a paid plan.",
          "Plan names, features, limits, billing periods, prices and promotional offers are shown on the website or communicated by Khaavio. Prices are stated in Indian rupees (INR). Applicable taxes, if any, will be communicated before payment where required.",
          "A paid subscription is purchased through Razorpay Checkout. Before recurring payments can be collected, the restaurant owner must explicitly authorise the applicable AutoPay mandate and review the plan, billing cycle and payment terms presented during checkout. Recurring payment attempts are made only under the mandate authorised by the owner and according to its terms. Trial expiry alone does not create a paid subscription or authorise a charge.",
          "Changes to price or features apply prospectively and do not remove rights applicable law gives you for a paid period already purchased. Offers, including founding offers, are subject to the eligibility and duration displayed when they are offered.",
        ],
      },
      {
        title: "4. Restaurant duties and customer information",
        bullets: [
          "Keep menu items, prices, opening hours, stock or availability, booking rules and business details accurate and lawful.",
          "Handle food safety, allergens, preparation, order acceptance, fulfilment, cancellations, guest complaints and restaurant-side refunds.",
          "Use guest information only for legitimate restaurant operations, protect it from unauthorised access and comply with privacy obligations that apply to your business.",
          "Only upload logos, images, descriptions and other material you have the right to use and display.",
        ],
      },
      {
        title: "5. Guest orders, service requests and bookings",
        paragraphs: [
          "A guest order or booking request through a Khaavio-powered page is directed to the relevant restaurant. The restaurant determines availability, accepts or rejects requests, prepares and fulfils orders, handles guest service and communicates its own payment, cancellation and refund terms. Guests should contact the restaurant about food, fulfilment, allergens, reservation changes or restaurant charges.",
        ],
      },
      {
        title: "6. Content and intellectual property",
        paragraphs: [
          "You retain rights you hold in content you upload. You permit Khaavio to host, process, display and transmit that content only as reasonably needed to provide, maintain, secure and support the service. You remain responsible for the accuracy and legality of your content and for respecting third-party rights.",
          "Do not misuse the service, attempt unauthorised access, interfere with security, upload unlawful or deceptive material, submit malicious code, disrupt other users or use Khaavio to violate another person's rights. Where reasonably necessary, we may remove content or restrict access to protect users, the platform or compliance with law.",
        ],
      },
      {
        title: "7. Availability and third-party services",
        paragraphs: [
          "We aim to keep Khaavio useful and reliable, but uninterrupted or error-free operation cannot be guaranteed. Maintenance, internet or device issues, third-party service failures and events outside our reasonable control may affect access. We may update or discontinue features when reasonably necessary and will take reasonable steps to communicate material changes to affected users where appropriate.",
          "The platform relies on third-party infrastructure and services that may have their own terms and availability. This does not exclude responsibilities Khaavio has under applicable law.",
        ],
      },
      {
        title: "8. Cancellation, suspension and account closure",
        paragraphs: [
          "You may request cancellation of a paid subscription or account closure by contacting support using the details on this page. Submit your cancellation request before the next scheduled renewal and ask us to confirm its effective date. Cancellation will stop future subscription renewals once processed. Any payment mandate should also be cancelled through the applicable payment-provider process where available. Charges already validly processed before cancellation are handled under the refund policy and applicable law.",
          "We may suspend or restrict access when reasonably necessary to address security risks, unlawful use, non-payment, a material breach of these Terms or a serious risk to the service or other users. Where appropriate, we will provide notice and an opportunity to resolve the issue. Records may be retained as permitted or required by law, and terms that by their nature should continue will survive account closure.",
        ],
      },
      {
        title: "9. Disclaimers and liability",
        paragraphs: [
          "Khaavio is provided on an as-available basis, subject to warranties and rights that cannot be excluded under applicable law. To the maximum extent permitted by law, Khaavio is not responsible for losses caused by a restaurant's own food, pricing, availability, bookings, fulfilment or business decisions. Nothing in these Terms excludes or limits liability or consumer rights that cannot lawfully be excluded or limited.",
        ],
      },
      {
        title: "10. Complaints, governing law and contact",
        paragraphs: [
          "For complaints about Khaavio software, account access or subscription billing, email the grievance contact displayed on this page with your account email, a clear description and relevant dates or payment references. Do not include passwords, card PINs, banking passwords or OTPs. We aim to acknowledge consumer complaints within 48 hours and redress them within 30 days of receipt, or sooner where applicable law requires.",
          "These Terms are governed by the laws of India, subject to mandatory consumer protections and jurisdictional rights available under applicable law. If a provision is unenforceable, the remaining provisions continue to the extent permitted by law. We may update these Terms as the service changes; the current version and update date will be published on this page.",
        ],
      },
    ],
  },
  refund: {
    eyebrow: "STRAIGHTFORWARD BILLING, CLEAR EXPECTATIONS",
    title: "Cancellation & Refund Policy",
    description:
      "How to cancel Khaavio subscription access, request a subscription refund and raise billing concerns.",
    intro:
      "This policy covers payments made to Khaavio for its software subscriptions. It does not replace a restaurant's own policy for food orders, table bookings, deposits or other restaurant charges.",
    sections: [
      {
        title: "1. Free trial and current billing setup",
        paragraphs: [
          "Khaavio offers a 7-day free trial without requiring a payment card or AutoPay mandate. The trial does not automatically convert into a paid subscription, and no charge is initiated merely because the trial ends. There is no trial payment to refund where no fee was collected.",
          "Paid subscriptions are purchased through Razorpay Checkout. Recurring payments are enabled only after the restaurant owner explicitly authorises the applicable AutoPay mandate. Renewal payment attempts follow the authorised billing cycle and mandate terms. Trial expiry alone does not activate a paid plan or authorise a payment.",
        ],
      },
      {
        title: "2. How to cancel a subscription",
        paragraphs: [
          "To cancel a paid subscription or close your account, email the support contact below from the email address associated with your workspace. Include the restaurant name, account email, plan and requested cancellation date. Ask us to confirm the cancellation and effective access end date. Submit the request before the next scheduled renewal to help prevent the next renewal payment.",
          "After a paid subscription is purchased and its AutoPay mandate is explicitly authorised, renewal payment attempts may occur according to the selected billing cycle and mandate terms. Once a cancellation is processed, future renewals will stop. Contact support if you need help confirming cancellation or subscription status. The free trial itself never automatically converts into a paid subscription.",
        ],
      },
      {
        title: "3. When a subscription refund may be approved",
        paragraphs: [
          "Refund requests are reviewed individually and verified before a decision is made. Subject to applicable law, a refund may be considered for duplicate payments, incorrect or unauthorised charges, a payment collected after a valid cancellation took effect, or a verified subscription payment where access was not activated because of a Khaavio-side issue and we cannot resolve the activation problem within five business days after you notify support. We will also consider refunds required by law or expressly approved by Khaavio in writing.",
          "A partial-period or pro-rata refund is not automatic after subscription access has been activated. Unused days, low usage, a restaurant's decision to stop using the platform or a change in business plans do not by themselves guarantee a refund, subject always to rights that cannot lawfully be excluded.",
        ],
      },
      {
        title: "4. How to request a refund",
        bullets: [
          "Email khaavioqr@gmail.com from the email associated with the account.",
          "Include the restaurant name, account email, plan, payment date, amount and payment reference/UTR if applicable.",
          "Explain the reason for the request and attach a receipt or payment confirmation if available.",
          "Never send passwords, card PINs, banking passwords or OTPs. We may request reasonable additional information to verify the payment and prevent fraud.",
        ],
      },
      {
        title: "5. Review and refund processing time",
        paragraphs: [
          "We aim to review complete refund requests within five business days. If approved, we aim to initiate a refund within 7–10 business days using the original payment method where possible, or another verified method agreed with you. A bank or payment provider may need additional time to credit the amount. We will explain the outcome if a request is declined.",
          "These are service targets, not a reduction of any shorter deadline or right that applies under law or the payment method used. A refund may require payment verification and may be delayed while we reasonably investigate an unclear or potentially fraudulent transaction.",
        ],
      },
      {
        title: "6. Restaurant guest orders and bookings",
        paragraphs: [
          "Khaavio provides ordering and booking technology and does not prepare or deliver restaurant food. Refunds or cancellations for food, incorrect dishes, restaurant deposits, no-shows, restaurant bookings or amounts collected by a restaurant must be requested from that restaurant. The restaurant is responsible for its guest-facing policy and applicable obligations. Khaavio can help with technical issues involving the platform but cannot promise a restaurant-side refund.",
        ],
      },
      {
        title: "7. Complaints, legal rights and updates",
        paragraphs: [
          "For subscription billing complaints, email the grievance contact displayed on this page. We aim to acknowledge consumer complaints within 48 hours and redress them within 30 days of receipt, or sooner where applicable law requires. Include relevant dates, the account email and payment reference where applicable.",
          "Nothing in this policy limits a cancellation, refund or consumer right that cannot lawfully be excluded, including any statutory right or remedy that cannot lawfully be excluded. If a mandatory legal requirement conflicts with this policy, the mandatory requirement takes precedence. We may update this policy as billing workflows or applicable requirements change; the latest version and update date will be published here.",
        ],
      },
    ],
  },
};

export default function LegalPage({ type }) {
  const page = LEGAL_CONTENT[type] || LEGAL_CONTENT.privacy;
  const links = [
    { label: "Privacy Policy", to: "/privacy", active: type === "privacy" },
    { label: "Terms & Conditions", to: "/terms", active: type === "terms" },
    { label: "Cancellation & Refund", to: "/refund-policy", active: type === "refund" },
  ];

  return (
    <main className="kh-legal-page">
      <header className="kh-legal-header">
        <Link to="/" className="kh-legal-brand" aria-label="Khaavio home">
          <img src={khaavioIcon} alt="" width="42" height="42" />
          <span>Khaa<span>vio</span></span>
        </Link>
        <Link to="/" className="kh-legal-back"><ArrowLeft size={16} /> Back to Khaavio</Link>
      </header>

      <section className="kh-legal-hero">
        <span className="kh-legal-eyebrow"><ShieldCheck size={14} /> {page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <div className="kh-legal-meta">Last updated: {LAST_UPDATED}</div>
      </section>

      <nav className="kh-legal-tabs" aria-label="Legal pages">
        {links.map((item) => (
          <Link key={item.to} to={item.to} className={item.active ? "is-active" : ""} aria-current={item.active ? "page" : undefined}>
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
          <div><dt>Phone</dt><dd><a href={`tel:${OPERATOR_PHONE}`}>+91 9471640485</a></dd></div>
          <div><dt>Grievance email</dt><dd><a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a></dd></div>
          <div><dt>Support email</dt><dd><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></dd></div>
        </dl>
        <p className="kh-legal-operator-timing">We aim to acknowledge consumer complaints within 48 hours and redress them within 30 days of receipt, or sooner where applicable law requires.</p>
      </section>

      <article className="kh-legal-document">
        {page.sections.map((section) => (
          <section className="kh-legal-section" key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
        ))}
        <aside className="kh-legal-contact">
          <div className="kh-legal-contact-icon"><Mail size={20} /></div>
          <div>
            <h2>Support &amp; grievance contact</h2>
            <p>For privacy requests, cancellation questions, subscription billing or consumer complaints, contact Khaavio. Please do not send passwords, card PINs, banking passwords or OTPs.</p>
            <div className="kh-legal-contact-actions">
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL} <ArrowUpRight size={14} /></a>
              <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer">WhatsApp support <ArrowUpRight size={14} /></a>
            </div>
          </div>
        </aside>
      </article>

      <footer className="kh-legal-footer">
        <span>© {new Date().getFullYear()} Khaavio. Every Table, Digitally Connected.</span>
        <div className="kh-legal-footer-links">
          <Link to="/about">About Khaavio</Link>
          <Link to="/contact">Contact Us</Link>
          <Link to="/">Back to homepage <ArrowUpRight size={14} /></Link>
        </div>
      </footer>
    </main>
  );
}
