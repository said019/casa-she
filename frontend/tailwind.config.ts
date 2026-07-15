import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
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
        heading: ["var(--font-heading)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        script: ["var(--font-script)", "cursive"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        // Casa Shé brand palette (keys kept for backwards-compat with existing bmb-*/balance-* classes)
        balance: {
          dark: "#16261A",   // verde casa profundo — secciones oscuras
          olive: "#2A4E36",  // Verde Casa — primario (logo)
          cream: "#F2E8DF",  // Nude avena — background
          gold: "#B66049",   // Terracota — acción cálida
          sand: "#DCC9BA",   // Arena rosada — superficies suaves
        },
        bmb: {
          gold: "#B66049",     // Terracota — acento primario
          deepgold: "#9F4F3D", // Terracota profundo — hover/activo
          cream: "#F2E8DF",    // Nude avena — fondo
          paper: "#FBF7F2",    // Marfil — tarjetas
          taupe: "#DCC9BA",    // Arena rosada
          mauve: "#8C6A57",    // arcilla apagada
          rose: "#C9B7A0",     // arena cálida
          blush: "#EAD8CB",    // nude rosado
          leaf: "#2A4E36",     // Verde Casa
          moss: "#B6A43C",     // Musgo — mostaza de marca (acento decorativo)
          clay: "#B66049",     // Terracota
          dark: "#16261A",     // verde casa profundo
          // `ink` es alias semántico para texto/editorial.
          ink: "#2E1B22",      // Ciruela — texto
        },
        // Casa Shé — tokens canónicos del sistema visual (preferir estos de aquí en adelante)
        casa: {
          verde: "#2A4E36",    // Verde Casa — primario
          profundo: "#16261A", // Verde profundo — secciones oscuras
          avena: "#F2E8DF",    // Nude avena — fondo
          musgo: "#6C8424",    // Musgo — éxito / disciplina
          ciruela: "#2E1B22",  // Ciruela — texto
          arcilla: "#B66049",  // Terracota — acento cálido
          arena: "#DCC9BA",    // Arena rosada — bordes / superficies
          mostaza: "#B4A248",  // Mostaza — oro / aviso
        },
        arcilla: "#B66049",    // acento de marca (distinto del semántico destructive)
        mostaza: "#B4A248",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      letterSpacing: {
        cap: "0.22em",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "now-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "week-flip-in": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "week-flip-in-back": {
          from: { opacity: "0", transform: "translateX(-24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "page-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
        "now-pulse": "now-pulse 0.8s ease-in-out",
        "week-flip-in": "week-flip-in 0.26s cubic-bezier(0.22, 1, 0.36, 1)",
        "week-flip-in-back": "week-flip-in-back 0.26s cubic-bezier(0.22, 1, 0.36, 1)",
        "page-in": "page-in 0.22s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
