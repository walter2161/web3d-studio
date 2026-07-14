import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
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
        // 3ds Max R3 (Win9x) tokens
        win: {
          face: "hsl(var(--win-face))",
          "face-2": "hsl(var(--win-face-2))",
          light: "hsl(var(--win-face-light))",
          shadow: "hsl(var(--win-face-shadow))",
          dark: "hsl(var(--win-face-dark))",
          text: "hsl(var(--win-text))",
          "text-disabled": "hsl(var(--win-text-disabled))",
          title: "hsl(var(--win-title))",
          "title-2": "hsl(var(--win-title-2))",
          "title-fg": "hsl(var(--win-title-fg))",
          "title-inactive": "hsl(var(--win-title-inactive))",
        },
        viewport: {
          DEFAULT: "hsl(var(--viewport-bg))",
          border: "hsl(var(--viewport-border))",
          active: "hsl(var(--viewport-active))",
          label: "hsl(var(--viewport-label))",
        },
        menu: {
          DEFAULT: "hsl(var(--menu-bg))",
          hover: "hsl(var(--menu-hover))",
          "hover-fg": "hsl(var(--menu-hover-fg))",
          active: "hsl(var(--menu-active))",
        },
        panel: {
          DEFAULT: "hsl(var(--panel-bg))",
          header: "hsl(var(--panel-header))",
          border: "hsl(var(--panel-border))",
        },
        timeline: {
          DEFAULT: "hsl(var(--timeline-bg))",
          track: "hsl(var(--timeline-track))",
          keyframe: "hsl(var(--timeline-keyframe))",
          current: "hsl(var(--timeline-current))",
        },
        gizmo: {
          x: "hsl(var(--gizmo-x))",
          y: "hsl(var(--gizmo-y))",
          z: "hsl(var(--gizmo-z))",
        },
        grid: {
          primary: "hsl(var(--grid-primary))",
          secondary: "hsl(var(--grid-secondary))",
        },

      },
      backgroundImage: {
        'gradient-panel': 'var(--gradient-panel)',
        'gradient-button': 'var(--gradient-button)',
        'gradient-viewport': 'var(--gradient-viewport)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
