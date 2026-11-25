export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'candeia.theme';

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** The theme in effect: an explicit choice, or the phone's setting when automatic. */
export function effectiveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return choice === 'auto' ? (prefersDark ? 'dark' : 'light') : choice;
}

export function applyTheme(choice: ThemeChoice = readTheme()): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  const dark = effectiveTheme(choice, window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false) === 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1720' : '#171717');
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* still applies for this visit */
  }
  applyTheme(choice);
}
