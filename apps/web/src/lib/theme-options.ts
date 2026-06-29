export type ThemeOption = {
  accent: string;
  background: string;
  id: string;
  label: string;
  specialLabel?: string;
  themeColor: string;
};

export const themeStorageKey = "carbon-flow-theme";
export const brazil2026ThemeId = "brazil-2026";
export const brazil2026BlueThemeId = "brazil-2026-blue";
export const brazil2026ThemeIds = [brazil2026ThemeId, brazil2026BlueThemeId];
export const brazil2026ThemeUnlockStorageKey =
  "carbon-flow-theme-brazil-2026-unlocked";
export const brazil2026ThemeUnlockEndsAt = "2026-07-21T03:00:00.000Z";
export const defaultDarkTheme = "carbon-dark";
export const defaultLightTheme = "carbon-light";
export const defaultTheme = defaultDarkTheme;

export const themes: ThemeOption[] = [
  {
    accent: "#d7dee8",
    background: "#090b0f",
    id: "carbon-dark",
    label: "Dark mode",
    themeColor: "#090b0f"
  },
  {
    accent: "#334155",
    background: "#f5f7fb",
    id: "carbon-light",
    label: "Light mode",
    themeColor: "#f5f7fb"
  },
  {
    accent: "#0284c7",
    background: "#f3f9ff",
    id: "blue-light",
    label: "Azul futurista / branco",
    themeColor: "#f3f9ff"
  },
  {
    accent: "#38bdf8",
    background: "#050b14",
    id: "blue-dark",
    label: "Azul futurista / preto",
    themeColor: "#050b14"
  },
  {
    accent: "#9ff3c4",
    background: "#080a0b",
    id: "green-dark",
    label: "Verde / preto",
    themeColor: "#080a0b"
  },
  {
    accent: "#119b68",
    background: "#f4fff8",
    id: "green-light",
    label: "Verde / branco",
    themeColor: "#f4fff8"
  },
  {
    accent: "#ffdf00",
    background: "#001b44",
    id: brazil2026ThemeId,
    label: "Torcida brasileira 2026",
    specialLabel: "Especial",
    themeColor: "#001b44"
  },
  {
    accent: "#7ddfd3",
    background: "#003da5",
    id: brazil2026BlueThemeId,
    label: "Seleção brasileira 2026 azul",
    specialLabel: "Especial",
    themeColor: "#003da5"
  }
];

export const specialThemeAccessById: Record<
  string,
  {
    storageKey: string;
    unlockEndsAt: string;
  }
> = {
  [brazil2026ThemeId]: {
    storageKey: brazil2026ThemeUnlockStorageKey,
    unlockEndsAt: brazil2026ThemeUnlockEndsAt
  },
  [brazil2026BlueThemeId]: {
    storageKey: brazil2026ThemeUnlockStorageKey,
    unlockEndsAt: brazil2026ThemeUnlockEndsAt
  }
};

export const themeColorById = themes.reduce<Record<string, string>>(
  (colors, theme) => {
    colors[theme.id] = theme.themeColor;
    return colors;
  },
  {}
);

export function isThemeId(value: string | null | undefined): value is string {
  return themes.some((item) => item.id === value);
}

export function isSpecialThemeId(value: string | null | undefined) {
  return Boolean(value && specialThemeAccessById[value]);
}

export function getLocallyUnlockedSpecialThemes() {
  if (typeof window === "undefined") {
    return [];
  }

  return Object.entries(specialThemeAccessById)
    .filter(
      ([, access]) => window.localStorage.getItem(access.storageKey) === "true"
    )
    .map(([themeId]) => themeId);
}

export function isThemeAvailable(
  themeId: string | null | undefined,
  unlockedSpecialThemes: readonly string[]
) {
  if (!isThemeId(themeId)) {
    return false;
  }

  return !isSpecialThemeId(themeId) || unlockedSpecialThemes.includes(themeId);
}

export function getVisibleThemes(unlockedSpecialThemes: readonly string[]) {
  return themes.filter((theme) =>
    isThemeAvailable(theme.id, unlockedSpecialThemes)
  );
}

export function getThemeOption(themeId: string | null | undefined) {
  return themes.find((item) => item.id === themeId) ?? themes[4]!;
}
