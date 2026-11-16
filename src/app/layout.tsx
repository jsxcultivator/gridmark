import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const font = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui" });

export const metadata: Metadata = {
  title: "Gridmark, an open-source grid logo maker",
  description:
    "Fill cells on geometric construction grids to draw logo marks, then export clean SVG or PNG. Free, open source, runs in your browser.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Set the theme before first paint so the page never flashes the wrong one.
const themeScript = `try{var t=localStorage.getItem("gridmark:theme");document.documentElement.dataset.theme=t==="paper"?"paper":"blueprint"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="blueprint" className={font.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
