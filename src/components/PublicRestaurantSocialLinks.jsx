import { Globe } from "lucide-react";
import { normalizeSocialLinks, SOCIAL_LINK_FIELDS } from "../lib/restaurantSocialLinks.js";

function SocialBrandIcon({ platform }) {
  const common = { viewBox: "0 0 24 24", width: 20, height: 20, fill: "currentColor", "aria-hidden": true };
  switch (platform) {
    case "instagram":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.6" cy="6.6" r="1.2" /></svg>;
    case "facebook":
      return <svg {...common}><path d="M13.4 21v-8.2h2.8l.4-3.2h-3.2V7.55c0-.93.26-1.55 1.58-1.55h1.69V3.14c-.29-.04-1.3-.14-2.48-.14-2.45 0-4.13 1.49-4.13 4.23V9.6H7.25v3.2h2.81V21h3.34Z" /></svg>;
    case "youtube":
      return <svg {...common}><path d="M23.5 6.2a3 3 0 0 0-2.1-2.12C19.55 3.56 12 3.56 12 3.56s-7.55 0-9.4.52A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.12c1.85.52 9.4.52 9.4.52s7.55 0 9.4-.52a3 3 0 0 0 2.1-2.12A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.55 15.6V8.4L15.8 12l-6.25 3.6Z" /></svg>;
    case "tiktok":
      return <svg {...common}><path d="M19.6 6.7a5.1 5.1 0 0 1-3.8-4.3V2h-3.7v13.7a2.9 2.9 0 1 1-2-2.8v-3.8a6.6 6.6 0 1 0 5.7 6.5V8.7a8.7 8.7 0 0 0 5.1 1.7V6.7h-1.3Z" /></svg>;
    case "x":
      return <svg {...common}><path d="M18.9 1.2h3.7l-8.1 9.2L24 22.9h-7.6l-5.9-7.6-6.6 7.6H.2l8.7-9.9L0 1.2h7.8l5.3 6.9 5.8-6.9Zm-1.3 19.5h2L6.4 3.3H4.3l13.3 17.4Z" /></svg>;
    case "whatsapp":
      return <svg {...common}><path d="M12 2a9.8 9.8 0 0 0-8.4 14.9L2.3 22l5.2-1.4A9.8 9.8 0 1 0 12 2Zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1 1 12 19.8Zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1s-.6.8-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.5.2-.4c.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4a9.7 9.7 0 0 0 3.7 3.3c.5.2.8.4 1.1.4.5.2 1 .1 1.3.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.5-.3Z" /></svg>;
    default:
      return <Globe size={20} strokeWidth={2.1} aria-hidden="true" />;
  }
}

export default function PublicRestaurantSocialLinks({ restaurantName, socialLinks }) {
  const normalized = normalizeSocialLinks(socialLinks);
  const links = SOCIAL_LINK_FIELDS
    .map((field) => ({ ...field, url: normalized[field.key] }))
    .filter((field) => Boolean(field.url));

  if (!links.length) return null;

  return (
    <div
      className="public-reviews-social-icons"
      role="group"
      aria-label={(restaurantName || "Restaurant") + " social profiles"}
    >
      <span className="public-reviews-social-label">Find us online</span>
      {links.map((link) => {
        return (
          <a
            key={link.key}
            className={"public-reviews-social-icon is-" + link.key}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={link.label}
            aria-label={"Open " + link.label + " for " + (restaurantName || "this restaurant")}
          >
            <SocialBrandIcon platform={link.key} />
          </a>
        );
      })}
    </div>
  );
}
