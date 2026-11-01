export const DEFAULT_PUBLIC_MENU_THEME_ID = "original";

export const PUBLIC_MENU_THEMES = [
  {
    id: "mint",
    name: "Mint",
    description: "Fresh, light and welcoming.",
    swatches: ["#0B3D3B", "#14B8A6", "#99F6E4", "#E6FFFB", "#F8FFFE"],
    colors: {
      primary: "#0B3D3B", secondary: "#99F6E4", accent: "#14B8A6",
      surface: "#E6FFFB", background: "#F8FFFE", text: "#103B39",
      muted: "#41615E", border: "#D2F1EA", onPrimary: "#FFFFFF", onAccent: "#062B28",
    },
  },
  {
    id: "ocean-blue",
    name: "Ocean Blue",
    description: "Clean, calm and professional.",
    swatches: ["#0B1F3B", "#2563EB", "#60A5FA", "#DBEAFE", "#F0F7FF"],
    colors: {
      primary: "#0B1F3B", secondary: "#60A5FA", accent: "#2563EB",
      surface: "#DBEAFE", background: "#F0F7FF", text: "#142B46",
      muted: "#536B85", border: "#C9DDF4", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Soft, creative and elegant.",
    swatches: ["#0D0B2D", "#5B4BFF", "#A78BFA", "#E6E0FF", "#F7F8FF"],
    colors: {
      primary: "#0D0B2D", secondary: "#A78BFA", accent: "#5B4BFF",
      surface: "#E6E0FF", background: "#F7F8FF", text: "#221E4C",
      muted: "#625C86", border: "#DED8F7", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "violet",
    name: "Violet",
    description: "Bold, futuristic and expressive.",
    swatches: ["#5B21B6", "#8B5CF6", "#C7B3FF", "#EDE9FE", "#FAF9FF"],
    colors: {
      primary: "#5B21B6", secondary: "#C7B3FF", accent: "#8B5CF6",
      surface: "#EDE9FE", background: "#FAF9FF", text: "#31165D",
      muted: "#6D5B85", border: "#E3DDF6", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Warm, vibrant and expressive.",
    swatches: ["#6D0D3F", "#EC4899", "#F9A8D4", "#FCE7F3", "#FFF9FB"],
    colors: {
      primary: "#6D0D3F", secondary: "#F9A8D4", accent: "#EC4899",
      surface: "#FCE7F3", background: "#FFF9FB", text: "#52112F",
      muted: "#8C536F", border: "#F5D3E4", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm, energetic and welcoming.",
    swatches: ["#1F1D2B", "#FF7A00", "#FFA94D", "#FFE4C7", "#FFF8EF"],
    colors: {
      primary: "#1F1D2B", secondary: "#FFA94D", accent: "#FF7A00",
      surface: "#FFE4C7", background: "#FFF8EF", text: "#2D211B",
      muted: "#7B5B45", border: "#F4D7B5", onPrimary: "#FFFFFF", onAccent: "#241306",
    },
  },
  {
    id: "slate",
    name: "Slate",
    description: "Minimal, modern and balanced.",
    swatches: ["#263445", "#64748B", "#CBD5E1", "#E2E8F0", "#F8FAFC"],
    colors: {
      primary: "#263445", secondary: "#CBD5E1", accent: "#64748B",
      surface: "#E2E8F0", background: "#F8FAFC", text: "#1F2937",
      muted: "#596579", border: "#D9E1EB", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "amber",
    name: "Amber",
    description: "Bright, comforting and classic.",
    swatches: ["#713F12", "#D97706", "#FCD34D", "#FEF3C7", "#FFFBEB"],
    colors: {
      primary: "#713F12", secondary: "#FCD34D", accent: "#D97706",
      surface: "#FEF3C7", background: "#FFFBEB", text: "#422006",
      muted: "#81633C", border: "#F4E4B2", onPrimary: "#FFFFFF", onAccent: "#1F170B",
    },
  },
  {
    id: "warm-mocha",
    name: "Warm Mocha",
    description: "Earthy, rich and premium.",
    swatches: ["#1A120E", "#3A2418", "#6B4A2E", "#A88462", "#D5C4AE", "#4A4A46"],
    colors: {
      primary: "#1A120E", secondary: "#A88462", accent: "#6B4A2E",
      surface: "#E8D9C6", background: "#F5EDE3", text: "#241A14",
      muted: "#4A4A46", border: "#D2BCA3", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "midnight-pop",
    name: "Midnight Pop",
    description: "Dark, confident with a vivid accent.",
    swatches: ["#121212", "#1F2937", "#334155", "#64748B", "#F1F5F9", "#EC4899"],
    colors: {
      primary: "#121212", secondary: "#334155", accent: "#EC4899",
      surface: "#F1F5F9", background: "#FAFCFF", text: "#121826",
      muted: "#64748B", border: "#DDE3EA", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "forest-sage",
    name: "Forest Sage",
    description: "Natural, grounded and calm.",
    swatches: ["#0F1F17", "#1E3A2E", "#3E5A3F", "#6B7F67", "#C7CBB8", "#3D4337"],
    colors: {
      primary: "#0F1F17", secondary: "#3E5A3F", accent: "#6B7F67",
      surface: "#C7CBB8", background: "#F1F2E8", text: "#172319",
      muted: "#3D4337", border: "#D8DDCC", onPrimary: "#FFFFFF", onAccent: "#FFFFFF",
    },
  },
  {
    id: "royal-berry",
    name: "Royal Berry",
    description: "Rich, expressive and playful.",
    swatches: ["#1A0F2E", "#3B1B4F", "#7A2E6F", "#D6598F", "#F4D7D4", "#FF6B6B"],
    colors: {
      primary: "#1A0F2E", secondary: "#7A2E6F", accent: "#FF6B6B",
      surface: "#F4D7D4", background: "#FFF6F5", text: "#2D183C",
      muted: "#744B6D", border: "#EDCBD0", onPrimary: "#FFFFFF", onAccent: "#1A0F2E",
    },
  },
];

const THEME_BY_ID = new Map(PUBLIC_MENU_THEMES.map((theme) => [theme.id, theme]));

export function isValidPublicMenuThemeId(themeId) {
  return themeId === DEFAULT_PUBLIC_MENU_THEME_ID || THEME_BY_ID.has(themeId);
}

export function getPublicMenuTheme(themeId) {
  return THEME_BY_ID.get(themeId) || null;
}

export function getPublicMenuThemeStyle(themeId) {
  const theme = getPublicMenuTheme(themeId);
  if (!theme) return undefined;

  const { colors } = theme;
  return {
    "--pm-ink": colors.text,
    "--pm-muted": colors.muted,
    "--pm-line": colors.border,
    "--pm-paper": colors.surface,
    "--pm-sage": colors.secondary,
    "--pm-sage-deep": colors.primary,
    "--pm-mint": colors.secondary,
    "--pm-peach": colors.surface,
    "--pm-blush": colors.background,
    "--pm-butter": colors.surface,
    "--pm-coral": colors.accent,
    "--pm-shadow": "0 18px 46px rgba(20, 28, 40, 0.10)",
    "--khaavio-cream": colors.background,
    "--khaavio-paper": colors.surface,
    "--khaavio-ink": colors.text,
    "--khaavio-muted": colors.muted,
    "--khaavio-line": colors.border,
    "--khaavio-terracotta": colors.accent,
    "--khaavio-terracotta-dark": colors.primary,
    "--khaavio-soft-orange": colors.secondary,
    "--khaavio-green": "#28734E",
    "--khaavio-menu-primary": colors.primary,
    "--khaavio-menu-secondary": colors.secondary,
    "--khaavio-menu-accent": colors.accent,
    "--khaavio-menu-surface": colors.surface,
    "--khaavio-menu-background": colors.background,
    "--khaavio-menu-text": colors.text,
    "--khaavio-menu-muted": colors.muted,
    "--khaavio-menu-border": colors.border,
    "--khaavio-menu-on-primary": colors.onPrimary,
    "--khaavio-menu-on-accent": colors.onAccent,
  };
}
