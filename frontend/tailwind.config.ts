import type { Config } from "tailwindcss";

// Paleta "Mango y menta" (ver prompt de estilos)
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#14322A", // texto principal
        ink2: "#3F5F55", // texto secundario
        accent: "#12684A", // etiquetas, "revisar", tab activa
        mango: "#F0A22E", // proteína / inicio del degradé
        mint: "#1F9D6B", // carbos / fin del degradé
        sage: "#8CA39A", // grasas
      },
      boxShadow: {
        glass: "0 8px 24px rgba(18,104,74,0.12)",
        nav: "0 10px 28px rgba(18,104,74,0.20)",
        fab: "0 8px 20px rgba(31,157,107,0.40)",
      },
      borderRadius: {
        glass: "22px",
      },
    },
  },
  plugins: [],
};

export default config;
