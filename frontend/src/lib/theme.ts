const THEME_KEY = "thefold_theme";

export type Theme = "dark" | "light";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme(): Theme {
  const theme = getStoredTheme();
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}
