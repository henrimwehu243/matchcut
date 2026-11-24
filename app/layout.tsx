import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MatchCut",
  description: "Choisissez vos films, séries et séances ensemble.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${plusJakartaSans.variable}`}>
      <body className="min-h-screen bg-[var(--mc-bg,#09090b)] font-sans text-[#f4f1ea] antialiased selection:bg-amber-400/30 selection:text-amber-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}