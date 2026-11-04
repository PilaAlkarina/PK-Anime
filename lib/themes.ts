/**
 * Color themes. Every theme fills the same CSS variables, and Tailwind's zinc / white / black /
 * red / amber / yellow read from them (tailwind.config.ts), so components keep their usual
 * classes and change palette with `data-theme` on <html>.
 *
 * Dependency-free: the root layout renders the CSS on the server.
 */

export type ThemeId = "tinta" | "sakura" | "neon" | "matcha" | "aizome" | "shibuya" | "oro";

interface Palette {
  /** Ground, panels, raised rows, hairlines */
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  /** Text: main, secondary, tertiary, faintest */
  paper: string;
  paper2: string;
  muted: string;
  faint: string;
  /** The one loud color (progress, active, primary buttons, focus shadow) */
  accent: string;
  /** Used sparingly: intro/ending, scores */
  second: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  palette: Palette;
}

export const DEFAULT_THEME: ThemeId = "tinta";

export const THEMES: Theme[] = [
  {
    id: "tinta",
    name: "Tinta y sello",
    description: "Bermellón de sello hanko y amarillo sobre tinta.",
    palette: {
      ink: "#0C0B10", ink2: "#15131B", ink3: "#1F1C27", line: "#2C2836",
      paper: "#F4F1EA", paper2: "#D9D4E0", muted: "#A8A2B4", faint: "#8A8496",
      accent: "#FF4A2E", second: "#FFD23F",
    },
  },
  {
    id: "sakura",
    name: "Sakura de noche",
    description: "Rosa sakura con menta, sobre una tinta ciruela.",
    palette: {
      ink: "#100B10", ink2: "#1A1219", ink3: "#251A23", line: "#3A2A36",
      paper: "#FBF3F5", paper2: "#E6D6DE", muted: "#B9A3B2", faint: "#957F90",
      accent: "#FF5C9A", second: "#8FE3CF",
    },
  },
  {
    id: "neon",
    name: "Neón de Akihabara",
    description: "Cian eléctrico y magenta sobre azul noche.",
    palette: {
      ink: "#080B14", ink2: "#0F1424", ink3: "#182035", line: "#26304A",
      paper: "#EEF4FF", paper2: "#CBD6EC", muted: "#94A3C2", faint: "#7686A6",
      accent: "#2EE6FF", second: "#FF3DA5",
    },
  },
  {
    id: "matcha",
    name: "Matcha",
    description: "Verde matcha y ámbar sobre un negro verdoso.",
    palette: {
      ink: "#0B0F0C", ink2: "#131A15", ink3: "#1C251F", line: "#2A372E",
      paper: "#F1F3EA", paper2: "#D3DBCF", muted: "#9FB0A3", faint: "#829386",
      accent: "#A6E35A", second: "#FFB547",
    },
  },
  {
    id: "aizome",
    name: "Aizome",
    description: "Azul índigo de tinte japonés con oro, sobre azul tinta.",
    palette: {
      ink: "#090C16", ink2: "#10152A", ink3: "#182038", line: "#26304F",
      paper: "#F2F0E8", paper2: "#D2D3DF", muted: "#9CA3BF", faint: "#7F87A6",
      accent: "#5B8CFF", second: "#F2C14E",
    },
  },
  {
    id: "shibuya",
    name: "Atardecer en Shibuya",
    description: "Naranja de neón y coral sobre un negro cálido.",
    palette: {
      ink: "#120B0C", ink2: "#1C1213", ink3: "#281A1B", line: "#3B2829",
      paper: "#FFF4EC", paper2: "#EBD7CC", muted: "#BFA49B", faint: "#9C847C",
      accent: "#FF8A1F", second: "#FF5E7E",
    },
  },
  {
    id: "oro",
    name: "Tinta y oro",
    description: "Casi monocromo: negro neutro, oro y un rojo de apoyo.",
    palette: {
      ink: "#0D0D0D", ink2: "#161616", ink3: "#212121", line: "#303030",
      paper: "#F5F2EA", paper2: "#D8D4CB", muted: "#A8A39A", faint: "#8A867E",
      accent: "#E8B54A", second: "#E5533D",
    },
  },
];

export const isThemeId = (value: unknown): value is ThemeId => THEMES.some((t) => t.id === value);

export const getTheme = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** `a` moved toward `b` by t (0–1) */
function mix(a: string, b: string, t: number): Rgb {
  const x = toRgb(a);
  const y = toRgb(b);
  return x.map((v, i) => Math.round(v + (y[i] - v) * t)) as Rgb;
}

// Comma-separated, for rgba(var(--c-…), a): the space-separated rgb(… / a) syntax is unknown to
// Chromium before 65, which the browsers of 2018–2019 Samsung TVs (Tizen 4–5) are built on
const channels = (rgb: Rgb) => rgb.join(", ");

/** Tailwind shade → color, so existing classes (text-zinc-400, bg-red-500…) keep their role */
function variables(p: Palette): Record<string, string> {
  const v: Record<string, string> = {
    ink: channels(toRgb(p.ink)),
    ink2: channels(toRgb(p.ink2)),
    ink3: channels(toRgb(p.ink3)),
    line: channels(toRgb(p.line)),
    paper: channels(toRgb(p.paper)),
    paper2: channels(toRgb(p.paper2)),
    muted: channels(toRgb(p.muted)),
    faint: channels(toRgb(p.faint)),
    accent: channels(toRgb(p.accent)),
    second: channels(toRgb(p.second)),
  };

  const zinc: Record<number, Rgb> = {
    50: toRgb(p.paper),
    100: toRgb(p.paper),
    200: toRgb(p.paper2),
    300: mix(p.paper2, p.muted, 0.5),
    400: toRgb(p.muted),
    500: toRgb(p.faint),
    600: mix(p.faint, p.line, 0.45),
    700: mix(p.line, p.faint, 0.25),
    800: mix(p.ink3, p.line, 0.5),
    900: toRgb(p.ink2),
    950: toRgb(p.ink),
  };
  for (const [shade, rgb] of Object.entries(zinc)) v[`zinc-${shade}`] = channels(rgb);

  // Accent and second accent ramps: lighter toward paper, darker toward ink
  const ramp = (color: string, name: string) => {
    const steps: Record<number, Rgb> = {
      50: mix(color, p.paper, 0.85),
      100: mix(color, p.paper, 0.72),
      200: mix(color, p.paper, 0.55),
      300: mix(color, p.paper, 0.35),
      400: mix(color, p.paper, 0.15),
      500: toRgb(color),
      600: mix(color, p.ink, 0.15),
      700: mix(color, p.ink, 0.32),
      800: mix(color, p.ink, 0.5),
      900: mix(color, p.ink, 0.65),
      950: mix(color, p.ink, 0.8),
    };
    for (const [shade, rgb] of Object.entries(steps)) v[`${name}-${shade}`] = channels(rgb);
  };
  ramp(p.accent, "accent");
  ramp(p.second, "second");
  return v;
}

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, value]) => `--c-${k}:${value}`)
    .join(";")}}`;

/** Every theme's variables; the default one also on :root, for pages without data-theme */
export function themeCss(): string {
  return THEMES.map((t) =>
    block(t.id === DEFAULT_THEME ? `:root,[data-theme="${t.id}"]` : `[data-theme="${t.id}"]`, variables(t.palette))
  ).join("\n");
}

/** Shade names Tailwind maps onto the variables */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Runs before the first paint, so a stored theme never flashes the default one */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem("pk_theme")||"null");var ids=${JSON.stringify(
  THEMES.map((t) => t.id)
)};if(ids.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
