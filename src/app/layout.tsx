import type { Metadata } from "next";
import { Cinzel, EB_Garamond } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Tavern — D&D 5e Character Builder",
  description:
    "Build, save, and play D&D 5e characters for free. All SRD content, no paywalls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${ebGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-tavern-bg text-tavern-text font-body">
        <Header />
        {children}
      </body>
    </html>
  );
}
