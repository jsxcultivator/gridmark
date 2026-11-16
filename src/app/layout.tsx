import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

// Jost is drawn from circles and straight lines, the same parts every grid
// here is made of.
const font = Jost({ subsets: ["latin"], variable: "--font-ui" });

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
// A stored choice wins; otherwise follow the system. "paper" and "blueprint"
// are the names an earlier version stored.
const themeScript = `try{var t=localStorage.getItem("gridmark:theme");if(t==="paper")t="light";if(t==="blueprint")t="dark";if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={font.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
