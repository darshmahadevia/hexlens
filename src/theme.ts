export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hexlens-theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function initializeTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
  const theme = saved === 'light' || saved === 'dark' ? saved : systemTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  return theme;
}

export function toggleTheme(): Theme {
  const theme: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The preference still applies for the current page when storage is blocked.
  }
  syncThemeControls();
  return theme;
}

export function syncThemeControls(): void {
  const theme = currentTheme();
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.dataset.themeState = theme;
  });
}

export function renderThemeToggle(): string {
  const theme = currentTheme();
  return `<button class="theme-toggle" type="button" data-theme-toggle data-theme-state="${theme}" aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode" aria-pressed="${theme === 'dark'}"><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.25v2.1M12 19.65v2.1M2.25 12h2.1M19.65 12h2.1M5.1 5.1l1.48 1.48M17.42 17.42l1.48 1.48M18.9 5.1l-1.48 1.48M6.58 17.42 5.1 18.9"></path></svg><svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.25 15.2A8.7 8.7 0 0 1 8.8 3.75a8.72 8.72 0 1 0 11.45 11.45Z"></path></svg></button>`;
}
