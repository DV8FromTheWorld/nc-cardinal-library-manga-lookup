import { useCallback, useEffect, useState } from 'react';
import styles from './App.module.css';

type Theme = 'light' | 'dark' | 'system';

export function App(): JSX.Element {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      if (current === 'system') {
        return 'light';
      }
      if (current === 'light') {
        return 'dark';
      }
      return 'system';
    });
  }, []);

  const themeLabel = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>NC Cardinal Manga</h1>
      <p className={styles.subtitle}>Manga series lookup powered by NC Cardinal &amp; LibraryThing</p>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Getting Started</h2>
        <ul className={styles.featureList}>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>✓</span>
            CSS Modules configured
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>✓</span>
            Design system with CSS variables
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>✓</span>
            Light &amp; dark theme support
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>✓</span>
            Strict TypeScript enabled
          </li>
        </ul>
      </div>

      <button type="button" className={styles.themeToggle} onClick={toggleTheme}>
        Theme: {themeLabel}
      </button>
    </div>
  );
}
