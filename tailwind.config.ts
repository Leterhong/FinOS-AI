import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: "#05070A",
        surface: {
          DEFAULT: "#11151B",
          elevated: "#1A1F27",
          glass: "rgba(255,255,255,0.05)",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.16)",
        },
        brand: {
          electric: "#0EA5E9",
          electricGlow: "rgba(14,165,233,0.35)",
          purple: "#00D68F",
          purpleGlow: "rgba(0,214,143,0.35)",
        },
        semantic: {
          success: "#00D68F",
          successGlow: "rgba(0,214,143,0.25)",
          risk: "#EF4444",
          riskGlow: "rgba(239,68,68,0.25)",
          warn: "#F59E0B",
          warnGlow: "rgba(245,158,11,0.25)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jb-mono)", "JetBrains Mono", "monospace"],
      },
      animation: {
        shimmer: "shimmer 2.5s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "gradient-shift": "gradientShift 8s ease infinite",
        "fade-up": "fadeUp 0.5s ease-out forwards",
        "ping-slow": "pingSlow 3s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        gradientShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pingSlow: {
          "75%, 100%": { transform: "scale(2)", opacity: "0" },
        },
      },
      boxShadow: {
        "glow-blue": "0 0 40px rgba(14,165,233,0.15), 0 0 80px rgba(14,165,233,0.05)",
        "glow-purple": "0 0 40px rgba(0,214,143,0.15), 0 0 80px rgba(0,214,143,0.05)",
        "glow-success": "0 0 40px rgba(0,214,143,0.15)",
        "glow-risk": "0 0 40px rgba(239,68,68,0.15)",
        glass: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #00D68F 0%, #0EA5E9 100%)",
        "gradient-brand-soft": "linear-gradient(135deg, rgba(0,214,143,0.1) 0%, rgba(14,165,233,0.1) 100%)",
        "gradient-mesh":
          "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(0,214,143,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(14,165,233,0.10) 0%, transparent 60%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
