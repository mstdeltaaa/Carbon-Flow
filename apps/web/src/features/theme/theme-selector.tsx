"use client";

import { ChevronDown, Palette, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  brazil2026ThemeId,
  brazil2026ThemeIds,
  defaultDarkTheme,
  defaultLightTheme,
  defaultTheme,
  getLocallyUnlockedSpecialThemes,
  getThemeOption,
  getVisibleThemes,
  isThemeAvailable,
  specialThemeAccessById,
  themeStorageKey
} from "@/lib/theme-options";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ThemeSelectorProps = {
  className?: string;
  variant?: "panel" | "icon";
};

function applyTheme(themeId: string) {
  document.documentElement.dataset.theme = themeId;

  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.content = getThemeOption(themeId).themeColor;
  window.dispatchEvent(
    new CustomEvent("carbon-flow-theme-change", { detail: themeId })
  );
}

function getPreferredTheme() {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return defaultLightTheme;
  }

  return defaultDarkTheme;
}

export function ThemeSelector({
  className,
  variant = "panel"
}: ThemeSelectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [theme, setTheme] = useState(defaultTheme);
  const [isOpen, setIsOpen] = useState(false);
  const [unlockedSpecialThemes, setUnlockedSpecialThemes] = useState<string[]>(
    []
  );

  useEffect(() => {
    const locallyUnlockedThemes = getLocallyUnlockedSpecialThemes();
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    const documentTheme = document.documentElement.dataset.theme;
    const initialTheme = isThemeAvailable(storedTheme, locallyUnlockedThemes)
      ? storedTheme!
      : isThemeAvailable(documentTheme, locallyUnlockedThemes)
        ? documentTheme!
        : getPreferredTheme();

    setUnlockedSpecialThemes(locallyUnlockedThemes);
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function syncSpecialThemeAccess() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        const locallyUnlockedThemes = new Set(
          getLocallyUnlockedSpecialThemes()
        );
        const brazilAccess = specialThemeAccessById[brazil2026ThemeId];
        let hasBrazilAccountAccess = false;

        if (
          brazilAccess &&
          Date.now() < Date.parse(brazilAccess.unlockEndsAt)
        ) {
          const { data, error } = await supabase.rpc(
            "unlock_brazil_2026_theme"
          );

          if (!error && data === true) {
            hasBrazilAccountAccess = true;
          }
        }

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("brazil_2026_theme_unlocked_at")
          .eq("id", session.user.id)
          .maybeSingle();

        if (
          brazilAccess &&
          !profileError &&
          profile?.brazil_2026_theme_unlocked_at
        ) {
          hasBrazilAccountAccess = true;
        }

        if (brazilAccess && hasBrazilAccountAccess) {
          window.localStorage.setItem(brazilAccess.storageKey, "true");
          brazil2026ThemeIds.forEach((themeId) =>
            locallyUnlockedThemes.add(themeId)
          );
        } else if (brazilAccess) {
          window.localStorage.removeItem(brazilAccess.storageKey);
          brazil2026ThemeIds.forEach((themeId) =>
            locallyUnlockedThemes.delete(themeId)
          );
        }

        if (isMounted) {
          setUnlockedSpecialThemes([...locallyUnlockedThemes]);
        }
      } catch {
        // The special theme stays hidden if the database migration is not active yet.
      }
    }

    void syncSpecialThemeAccess();

    return () => {
      isMounted = false;
    };
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

  const visibleThemes = useMemo(
    () => getVisibleThemes(unlockedSpecialThemes),
    [unlockedSpecialThemes]
  );
  const selectedTheme = useMemo(
    () =>
      visibleThemes.find((item) => item.id === theme) ??
      getThemeOption(defaultTheme),
    [theme, visibleThemes]
  );

  useEffect(() => {
    if (isThemeAvailable(theme, unlockedSpecialThemes)) {
      return;
    }

    const fallbackTheme = getPreferredTheme();

    setTheme(fallbackTheme);
    applyTheme(fallbackTheme);
    window.localStorage.setItem(themeStorageKey, fallbackTheme);
  }, [theme, unlockedSpecialThemes]);

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
            className="absolute right-0 top-12 z-50 w-64 rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-[color:var(--shadow-color)]"
            role="menu"
          >
            <p className="px-2 pb-2 pt-1 text-xs font-medium text-slate-400">
              Aparência
            </p>
            <div className="grid gap-1">
              {visibleThemes.map((item) => {
                const isSelected = item.id === theme;

                return (
                  <button
                    className={[
                      "flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition focus-visible:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
                      isSelected
                        ? "bg-slate-800 font-medium text-white ring-1 ring-[var(--primary)]"
                        : "text-slate-200 hover:bg-slate-900 hover:text-white"
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
                      className="h-5 w-5 shrink-0 rounded-md border border-slate-600"
                      style={{
                        background: `linear-gradient(135deg, ${item.background} 0 50%, ${item.accent} 50% 100%)`
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {item.specialLabel ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[0.625rem] font-medium text-slate-100 ring-1 ring-slate-700">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        {item.specialLabel}
                      </span>
                    ) : null}
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
      <span className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2">
        <span
          className="h-5 w-5 shrink-0 rounded-md border border-[var(--border)]"
          style={{
            background: `linear-gradient(135deg, ${selectedTheme.background} 0 50%, ${selectedTheme.accent} 50% 100%)`
          }}
        />
        <span className="relative min-w-0">
          <span className="flex h-9 min-w-0 items-center rounded-md border border-slate-300 bg-slate-50 px-2 pr-7 text-sm text-slate-950">
            <span className="min-w-0 truncate">{selectedTheme.label}</span>
          </span>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-700">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <select
            aria-label="Selecionar aparência"
            className="absolute inset-0 h-9 w-full cursor-pointer opacity-0"
            onChange={(event) => handleThemeChange(event.target.value)}
            value={theme}
          >
            {visibleThemes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.specialLabel
                  ? `${item.label} (${item.specialLabel})`
                  : item.label}
              </option>
            ))}
          </select>
        </span>
      </span>
    </label>
  );
}
