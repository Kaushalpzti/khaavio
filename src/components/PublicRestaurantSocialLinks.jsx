import { AtSign, ExternalLink, Facebook, Globe, Instagram, MessageCircle, Music2, Youtube } from "lucide-react";
import { normalizeSocialLinks, SOCIAL_LINK_FIELDS } from "../lib/restaurantSocialLinks.js";

const ICONS = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Music2,
  x: AtSign,
  whatsapp: MessageCircle,
  website: Globe,
};

export default function PublicRestaurantSocialLinks({ restaurantName, socialLinks }) {
  const normalized = normalizeSocialLinks(socialLinks);
  const links = SOCIAL_LINK_FIELDS.map((field) => ({ ...field, url: normalized[field.key] })).filter((field) => Boolean(field.url));
  if (!links.length) return null;

  return (
    <section className="public-reviews-social" aria-label={(restaurantName || "Restaurant") + " social links"}>
      <div className="public-reviews-social-heading">
        <span className="public-reviews-social-eyebrow">FOLLOW ALONG</span>
        <h3>Find {restaurantName || "us"} online</h3>
      </div>
      <div className="public-reviews-social-links">
        {links.map((link) => {
          const Icon = ICONS[link.key] || Globe;
          const label = link.key === "website" ? "Website" : link.key === "whatsapp" ? "WhatsApp" : link.label;
          return (
            <a
              key={link.key}
              className={"public-reviews-social-link is-" + link.key}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={"Open " + link.label + " for " + (restaurantName || "this restaurant")}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
