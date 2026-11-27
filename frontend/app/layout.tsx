import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nutrify",
  description: "Bloc de notas para contar calorías y proteína",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/nutrify-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Nutrify", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // El teclado de Android achica el viewport en lugar de tapar el contenido
  interactiveWidget: "resizes-content",
  themeColor: "#F6F3C8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={jakarta.variable}>
      <body className="min-h-dvh overflow-x-hidden font-sans text-ink antialiased">
        <div className="app-bg" aria-hidden />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
