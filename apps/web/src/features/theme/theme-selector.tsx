"use client";

import { Palette } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  defaultTheme,
  getThemeOption,
  isThemeId,
  themes,
  themeStorageKey
} from "@/lib/theme-options";

type ThemeSelectorProps = {
  className?: string;
  variant?: "panel" | "icon";
};

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

export function ThemeSelector({
  className,
  variant = "panel"
}: ThemeSelectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [theme, setTheme] = useState(defaultTheme);
  const [isOpen, setIsOpen] = useState(false);

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

  useEffect(() => {
    if (variant !== "icon" || !isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, variant]);

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

  if (variant === "icon") {
    return (
      <div
        className={["relative", className].filter(Boolean).join(" ")}
        ref={containerRef}
      >
        <button
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label="Alterar aparência"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel-strong)] text-[var(--muted-foreground)] shadow-lg shadow-[color:var(--shadow-color)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          onClick={() => setIsOpen((current) => !current)}
          title="Aparência"
          type="button"
        >
          <Palette className="h-4 w-4" aria-hidden="true" />
        </button>

        {isOpen ? (
          <div
            className="absolute right-0 top-12 z-50 w-64 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] p-2 shadow-2xl shadow-[color:var(--shadow-color)]"
            role="menu"
          >
            <p className="px-2 pb-2 pt-1 text-xs font-medium text-[var(--muted-foreground)]">
              Aparência
            </p>
            <div className="grid gap-1">
              {themes.map((item) => {
                const isSelected = item.id === theme;

                return (
                  <button
                    className={[
                      "flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition",
                      isSelected
                        ? "bg-[var(--primary-active)] text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                    ].join(" ")}
                    key={item.id}
                    onClick={() => {
                      handleThemeChange(item.id);
                      setIsOpen(false);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-md border border-[var(--border)]"
                      style={{
                        background: `linear-gradient(135deg, ${item.background} 0 50%, ${item.accent} 50% 100%)`
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {isSelected ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <label
      className={[
        "mt-4 grid gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted-foreground)]",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
