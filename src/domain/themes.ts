export const themes = [

{
  id: "glass",
  name: "Liquid Glass",
  description: "Vidro, luz e transparência.",
  bg: "#e9e9f2",
  panel: "#ffffff",
  accent: "#514b85",
},

  {
    id: "amoled",
    name: "AMOLED",
    description: "Preto absoluto. Som em primeiro plano.",
    bg: "#000000",
    panel: "#101110",
    accent: "#eeeeed",
  },
  {
    id: "dynamic",
    name: "Capa Dinâmica",
    description: "Cores da capa em luz ambiente.",
    bg: "#08090b",
    panel: "#111317",
    accent: "#f1f1f1",
  },
  {
    id: "neon",
    name: "Gaming Neon",
    description: "Luzes acesas, mundo desligado.",
    bg: "#100b20",
    panel: "#1c1432",
    accent: "#c6a2ff",
  },
  {
    id: "anime",
    name: "Anime Night",
    description: "Índigo, névoa e luz de cerejeira.",
    bg: "#0b1020",
    panel: "#151b2d",
    accent: "#ffb9c9",
  },
  {
    id: "retro",
    name: "Retro Arcade",
    description: "Geometria pixel, âmbar e scanlines suaves.",
    bg: "#131c21",
    panel: "#1d2b32",
    accent: "#ffd28c",
  },
  {
    id: "album",
    name: "Album Immersive",
    description: "A cor da capa, em luz ambiente.",
    bg: "#090b0e",
    panel: "#15171b",
    accent: "#e3e5ec",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Escolhe a tua própria combinação.",
    bg: "#101b1a",
    panel: "#172724",
    accent: "#a2e5d3",
  },
] as const;
export type ThemeId = (typeof themes)[number]["id"];
export interface ThemePreferences {
  id: ThemeId;
  background: string;
  accent: string;
  backgroundImage?: string;
}
const defaults: ThemePreferences = {
  id: "amoled",
  background: "#101b1a",
  accent: "#a2e5d3",
};
export function readTheme(): ThemePreferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("my-music-theme") ?? "null",
    ) as ThemePreferences | null;
    if (
      value &&
      themes.some((theme) => theme.id === value.id) &&
      /^#[\da-f]{6}$/i.test(value.background) &&
      /^#[\da-f]{6}$/i.test(value.accent)
    )
      return { ...value, backgroundImage: typeof value.backgroundImage === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value.backgroundImage) ? value.backgroundImage : undefined };
  } catch {
    /* A blocked localStorage must not prevent startup. */
  }
  return defaults;
}

export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const parts = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
