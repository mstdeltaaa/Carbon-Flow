import type { Metadata } from "next";
import "./globals.css";

import { CookieConsent } from "@/features/privacy/cookie-consent";

import {
  defaultDarkTheme,
  defaultLightTheme,
  defaultTheme,
  specialThemeAccessById,
  themeColorById,
  themeStorageKey
} from "@/lib/theme-options";

export const metadata: Metadata = {
  title: "Carbon Flow",
  description: "Gestão de produção, custos, estoque, orçamentos e vendas.",
  icons: {
    icon: [
      {
        media: "(prefers-color-scheme: dark)",
        type: "image/png",
        url: "/brand/carbon-flow-logo-on-dark-v2.png"
      },
      {
        media: "(prefers-color-scheme: light)",
        type: "image/png",
        url: "/brand/carbon-flow-logo-on-light-v2.png"
      }
    ],
    apple: [
      { url: "/brand/carbon-flow-logo-on-light-v2.png", type: "image/png" }
    ]
  }
};

const themeScript = `
(() => {
  const defaultTheme = ${JSON.stringify(defaultTheme)};
  const defaultDarkTheme = ${JSON.stringify(defaultDarkTheme)};
  const defaultLightTheme = ${JSON.stringify(defaultLightTheme)};
  const storageKey = ${JSON.stringify(themeStorageKey)};
  const themeColors = ${JSON.stringify(themeColorById)};
  const specialThemeAccess = ${JSON.stringify(specialThemeAccessById)};
  const getSystemTheme = () =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? defaultLightTheme
      : defaultDarkTheme;
  const hasThemeAccess = (theme) => {
    const access = specialThemeAccess[theme];

    if (!access) {
      return true;
    }

    return window.localStorage.getItem(access.storageKey) === "true";
  };
  const setThemeColor = (theme) => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }

    meta.setAttribute("content", themeColors[theme] || themeColors[defaultTheme]);
  };

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    const theme = Object.prototype.hasOwnProperty.call(themeColors, storedTheme) && hasThemeAccess(storedTheme)
      ? storedTheme
      : getSystemTheme();

    document.documentElement.dataset.theme = theme;
    setThemeColor(theme);
  } catch {
    document.documentElement.dataset.theme = defaultTheme;
    setThemeColor(defaultTheme);
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme={defaultTheme} lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta content={themeColorById[defaultTheme]} name="theme-color" />
        <meta content="dark light" name="color-scheme" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
