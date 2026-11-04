// Theme colors live in CSS variables (lib/themes.ts); these keep the usual Tailwind names
// rgba with commas: older TV browsers (Chromium < 65) drop the space-separated syntax
const themed = (name: string) => `rgba(var(--c-${name}), <alpha-value>)`;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const ramp = (name: string) => Object.fromEntries(SHADES.map((s) => [s, themed(`${name}-${s}`)]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // The class name stays from the old font; it now carries the body face
        "product-sans": ["'Zen Kaku Gothic New'", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
        sans: ["'Zen Kaku Gothic New'", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
        display: ["'Dela Gothic One'", "'Zen Kaku Gothic New'", "system-ui", "sans-serif"],
      },
      colors: {
        // Themed: neutrals follow the theme's ink and paper, red its accent, amber/yellow its second accent
        white: themed("paper"),
        black: themed("ink"),
        zinc: ramp("zinc"),
        red: ramp("accent"),
        amber: ramp("second"),
        yellow: ramp("second"),
        ink: { DEFAULT: themed("ink"), 2: themed("ink2"), 3: themed("ink3") },
        line: themed("line"),
        paper: { DEFAULT: themed("paper"), 2: themed("paper2") },
        accent2: themed("second"),
        brand: themed("accent"),
        border: "hsl(var(--border, 0, 0%, 14.9%))",
        input: "hsl(var(--input, 0, 0%, 14.9%))",
        ring: "hsl(var(--ring, 0, 0%, 83.1%))",
        background: "hsl(var(--background, 0, 0%, 0%))",
        foreground: "hsl(var(--foreground, 0, 0%, 98%))",
        primary: {
          DEFAULT: "hsl(var(--primary, 0, 0%, 98%))",
          foreground: "hsl(var(--primary-foreground, 0, 0%, 9%))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary, 0, 0%, 9.4%))",
          foreground: "hsl(var(--secondary-foreground, 0, 0%, 98%))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive, 0, 62.8%, 30.6%))",
          foreground: "hsl(var(--destructive-foreground, 0, 0%, 98%))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted, 0, 0%, 9.4%))",
          foreground: "hsl(var(--muted-foreground, 0, 0%, 63.9%))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent, 0, 0%, 9.4%))",
          foreground: "hsl(var(--accent-foreground, 0, 0%, 98%))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover, 0, 0%, 4.7%))",
          foreground: "hsl(var(--popover-foreground, 0, 0%, 98%))",
        },
        card: {
          DEFAULT: "hsl(var(--card, 0, 0%, 1.2%))",
          foreground: "hsl(var(--card-foreground, 0, 0%, 98%))",
        },
        "shad-canvas": "#000000",
        "shad-card": "#030303",
        "shad-track": "#0C0C0C",
        "shad-active": "#181818",
        "shad-hover": "#141414",
      },
      borderRadius: {
        lg: "var(--radius, 0.75rem)",
        md: "calc(var(--radius, 0.75rem) - 2px)",
        sm: "calc(var(--radius, 0.75rem) - 4px)",
      },
      zIndex: {
        '25': '25',
      },
    },
  },
  plugins: [
    // Library screens shared by both interfaces: `tv:text-2xl` applies only inside the TV
    // layout (data-ui="tv" on its root), so the unprefixed class is the web size
    ({ addVariant }: { addVariant: (name: string, selector: string) => void }) => {
      addVariant("tv", '[data-ui="tv"] &');
      addVariant("web", '[data-ui="web"] &');
      // Player: phones and tablets swap hover controls for big touch targets. These sort before
      // sm/md/lg, so they're paired as `mouse:sm:…` rather than set against a breakpoint class
      addVariant("touch", "@media (pointer: coarse)");
      addVariant("mouse", "@media (pointer: fine)");
      // Landscape phones: the pause screen drops to its compact size below this height
      addVariant("tall", "@media (min-height: 521px)");
    },
  ],
};
