import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light workspace (data surfaces)
        ink: {
          DEFAULT: "#0F172A",
          soft: "#1E293B",
          line: "#334155",
        },
        harbor: "#1D4ED8",
        // Crossrate carry-over — dark shell + acid accent
        shell: {
          DEFAULT: "#080b0a",
          panel: "#111714",
          soft: "#0d1210",
          line: "rgba(213, 233, 221, 0.12)",
          ink: "#edf6f0",
          muted: "#85948d",
        },
        acid: {
          DEFAULT: "#37e5a5",
          dim: "rgba(55, 229, 165, 0.14)",
        },
        // Shipment health system — the functional accent set
        ontrack: "#059669",
        atrisk: "#D97706",
        delayed: "#E11D48",
        delivered: "#64748B",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        acid: "0 0 24px rgba(55, 229, 165, 0.12)",
      },
      backgroundImage: {
        "shell-grid":
          "radial-gradient(circle at 85% 4%, rgba(55, 229, 165, 0.08), transparent 25%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        "workspace-grid":
          "linear-gradient(rgba(15, 23, 42, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.03) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "36px 36px",
      },
    },
  },
  plugins: [],
};

export default config;
