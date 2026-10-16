import { useState, useEffect, useCallback } from 'react';

export const THEME_STORAGE_KEY = 'anubadak_theme';

/**
 * Resolves the effective theme ('light' | 'dark') given a user preference and system state.
 *
 * @param {'system' | 'light' | 'dark'} preference
 * @param {'light' | 'dark'} systemTheme
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(preference, systemTheme) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemTheme === 'light' ? 'light' : 'dark';
}

function getInitialPreference() {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // In restricted or incognito environments, localStorage can throw
  }
  return 'system';
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/**
 * React hook to manage Anubadak's Dark / Light / System theme modes with persistence
 * and OS preference change synchronization.
 */
export function useTheme() {
  const [themePreference, setThemePreference] = useState(getInitialPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  const resolvedTheme = resolveTheme(themePreference, systemTheme);

  // Synchronize with OS changes when in 'system' mode
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const updateSystemTheme = (e) => {
      setSystemTheme(e.matches ? 'light' : 'dark');
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateSystemTheme);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(updateSystemTheme);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateSystemTheme);
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(updateSystemTheme);
      }
    };
  }, []);

  // Update DOM attributes, color-scheme, and mobile status bar
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    root.setAttribute('data-theme-setting', themePreference);
    root.style.colorScheme = resolvedTheme;

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute(
        'content',
        resolvedTheme === 'light' ? '#f0f4f9' : '#071426'
      );
    }
  }, [resolvedTheme, themePreference]);

  const selectTheme = useCallback((newTheme) => {
    if (newTheme !== 'light' && newTheme !== 'dark' && newTheme !== 'system') return;
    setThemePreference(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage write errors in restricted contexts
    }
  }, []);

  return {
    themePreference,
    resolvedTheme,
    selectTheme,
  };
}
