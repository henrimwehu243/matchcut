import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MatchCut — Cahier de Cinéma & Découverte",
  description: "Revue éditoriale de cinéma, séries, animés et séances partagées.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#101112",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${cormorantGaramond.variable} ${plusJakartaSans.variable}`}>
      <body className="min-h-screen bg-[#101112] font-sans text-[#EAE6DE] antialiased selection:bg-[#C49A58]/30 selection:text-[#EAE6DE]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}