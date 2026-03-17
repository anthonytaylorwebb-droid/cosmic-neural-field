/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "ui-sans-serif", "system-ui"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        surface: {
          950: "#050816",
          900: "#0b1020",
          800: "#121a2d",
          700: "#1a2238",
        },
        accent: {
          500: "#7dd3fc",
          400: "#38bdf8",
          300: "#93c5fd",
        },
      },
      boxShadow: {
        panel: "0 20px 50px rgba(3, 7, 18, 0.45)",
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px)",
      },
      keyframes: {
        pulseLine: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.28", transform: "scale(0.96)" },
          "50%": { opacity: "0.72", transform: "scale(1.04)" },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseLine: "pulseLine 1.4s ease-in-out infinite",
        pulseSlow: "pulseSlow 3.2s ease-in-out infinite",
        riseIn: "riseIn 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
