import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Revenus",
  description: "Suivi mensuel des revenus par activité.",
  applicationName: "Revenus",
  appleWebApp: {
    capable: true,
    title: "Revenus",
    // « default » et pas « black-translucent » : le mode translucide
    // écrit l'heure et la batterie en blanc quel que soit le thème, ce
    // qui les rend invisibles sur le fond clair. Ici la barre d'état
    // prend la couleur déclarée par `themeColor`, différente en clair
    // et en sombre, et iOS y choisit un texte lisible.
    statusBarStyle: "default",
  },
  other: {
    // Next 16 n'émet plus que `mobile-web-app-capable`. iOS ne
    // s'ouvre en plein écran sans barre d'adresse que s'il trouve
    // AUSSI l'ancienne balise, ou un manifeste en `display:
    // standalone` — et seulement depuis iOS 16.4. Les deux coûtent une
    // ligne ; l'écran plein coûte plus cher à rater.
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

/**
 * Applique le thème avant le premier rendu. Sans ça, une app en mode
 * sombre ouverte depuis l'écran d'accueil affiche un éclair blanc.
 */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
