export type ThemeOption = {
  accent: string;
  background: string;
  id: string;
  label: string;
  themeColor: string;
};

export const themeStorageKey = "carbon-flow-theme";
export const defaultTheme = "green-dark";

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
  }
];

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

export function getThemeOption(themeId: string | null | undefined) {
  return themes.find((item) => item.id === themeId) ?? themes[4]!;
}
