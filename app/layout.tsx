import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "MatchCut",
  description: "Soirées ciné, séries et animés entre amis.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MatchCut",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${serif.variable} ${sans.variable}`}>
      <body className="bg-[#09090b] font-sans text-[#f4f1ea] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}