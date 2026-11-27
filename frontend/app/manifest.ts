import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nutrify",
    short_name: "Nutrify",
    description: "Contá calorías y proteína escribiendo lo que comiste",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F3C8",
    theme_color: "#F6F3C8",
    lang: "es-AR",
    icons: [
      { src: "/nutrify-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A sangre (sin bordes transparentes): Android lo recorta con su forma y no le agrega fondo blanco
      { src: "/nutrify-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/nutrify-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
