import { AtSign, Camera, Globe, MessageCircle, Music2, PlayCircle, Users } from "lucide-react";
import { normalizeSocialLinks, SOCIAL_LINK_FIELDS } from "../lib/restaurantSocialLinks.js";

const ICONS = {
  instagram: Camera,
  facebook: Users,
  youtube: PlayCircle,
  tiktok: Music2,
  x: AtSign,
  whatsapp: MessageCircle,
  website: Globe,
};

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
      {links.map((link) => {
        const Icon = ICONS[link.key] || Globe;
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
            <Icon size={20} strokeWidth={2.1} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
