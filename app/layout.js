import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono"
});

export const metadata = {
  title: "Insta-ntiate — your saved Instagram, searchable",
  description:
    "A personal archive layer for the reels, posts, and collections you've already saved on Instagram. Zero install — runs in your browser."
};

export const viewport = {
  themeColor: "#08070b",
  width: "device-width",
  initialScale: 1
};

const themeBootScript = `
  (function(){
    try {
      var stored = localStorage.getItem('instantiate-theme');
      var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      var theme = stored || (prefersLight ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', theme);
    } catch (_) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
`;

const swRegisterScript = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swRegisterScript }} />
      </body>
    </html>
  );
}
