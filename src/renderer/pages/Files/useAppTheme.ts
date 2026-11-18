import { useEffect, useState } from 'react';

export type AppTheme = 'dark' | 'light';

function readTheme(): AppTheme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Follows document.documentElement.dataset.theme, which the app shell (P3) keeps up to date. */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    setTheme(readTheme());
    return () => observer.disconnect();
  }, []);
  return theme;
}
