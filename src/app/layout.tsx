import "./globals.css";

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Restaurante Cerro",
  description: "Menú del día — pide desde tu celular, paga en caja.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
