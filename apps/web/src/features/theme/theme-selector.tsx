"use client";

import { Palette } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  defaultTheme,
  getThemeOption,
  isThemeId,
  themes,
  themeStorageKey
} from "@/lib/theme-options";

function applyTheme(themeId: string) {
  document.documentElement.dataset.theme = themeId;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.content = getThemeOption(themeId).themeColor;
}

export function ThemeSelector() {
  const [theme, setTheme] = useState(defaultTheme);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    const documentTheme = document.documentElement.dataset.theme;
    const initialTheme = isThemeId(storedTheme)
      ? storedTheme
      : isThemeId(documentTheme)
        ? documentTheme
        : defaultTheme;

    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const selectedTheme = useMemo(
    () =>
      themes.find((item) => item.id === theme) ?? getThemeOption(defaultTheme),
    [theme]
  );

  function handleThemeChange(nextTheme: string) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  }

  return (
    <label className="mt-4 grid gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted-foreground)]">
      <span className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
        Aparência
      </span>
      <span className="flex items-center gap-2">
        <span
          className="h-5 w-5 shrink-0 rounded-md border border-[var(--border)]"
          style={{
            background: `linear-gradient(135deg, ${selectedTheme.background} 0 50%, ${selectedTheme.accent} 50% 100%)`
          }}
        />
        <select
          className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)]"
          onChange={(event) => handleThemeChange(event.target.value)}
          value={theme}
        >
          {themes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
