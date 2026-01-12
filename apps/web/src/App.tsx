import { useCallback, useEffect, useState } from 'react';
import { SearchPage } from './components/SearchPage';
import { SeriesDetail } from './components/SeriesDetail';
import { BookDetail } from './components/BookDetail';
import styles from './App.module.css';

// ============================================================================
// Routing Types
// ============================================================================

type View = 
  | { type: 'search'; query?: string | undefined }
  | { type: 'series'; slug: string }
  | { type: 'book'; isbn: string; slug?: string | undefined };

type Theme = 'light' | 'dark' | 'system';

// ============================================================================
// URL Helpers
// ============================================================================

function parseUrl(url: URL): View {
  const path = url.pathname;
  
  // /series/:slug
  if (path.startsWith('/series/')) {
    const slug = decodeURIComponent(path.slice('/series/'.length));
    return { type: 'series', slug };
  }
  
  // /books/:isbn or /books/:isbn/:slug
  if (path.startsWith('/books/')) {
    const rest = path.slice('/books/'.length);
    const parts = rest.split('/');
    const isbn = parts[0] ?? '';
    const slug = parts[1] ? decodeURIComponent(parts[1]) : undefined;
    return { type: 'book', isbn, slug };
  }
  
  // /search?q=query or / (root)
  const query = url.searchParams.get('q') ?? undefined;
  return { type: 'search', query };
}

function viewToUrl(view: View): string {
  switch (view.type) {
    case 'search':
      return view.query ? `/search?q=${encodeURIComponent(view.query)}` : '/';
    case 'series':
      return `/series/${encodeURIComponent(view.slug)}`;
    case 'book':
      return view.slug 
        ? `/books/${view.isbn}/${encodeURIComponent(view.slug)}`
        : `/books/${view.isbn}`;
  }
}

// ============================================================================
// App Component
// ============================================================================

export function App(): JSX.Element {
  // Initialize view from current URL
  const [view, setView] = useState<View>(() => parseUrl(new URL(window.location.href)));
  const [theme, setTheme] = useState<Theme>('system');

  // Theme handling
  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setView(parseUrl(new URL(window.location.href)));
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      if (current === 'system') return 'light';
      if (current === 'light') return 'dark';
      return 'system';
    });
  }, []);

  const themeLabel = theme === 'system' ? '◐' : theme === 'light' ? '☀' : '☾';

  // Navigation - updates URL and state
  const navigate = useCallback((newView: View) => {
    const url = viewToUrl(newView);
    window.history.pushState(null, '', url);
    setView(newView);
    window.scrollTo(0, 0);
  }, []);

  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  const handleSelectSeries = useCallback((slug: string) => {
    navigate({ type: 'series', slug });
  }, [navigate]);

  const handleSelectBook = useCallback((isbn: string, slug?: string) => {
    navigate({ type: 'book', isbn, slug });
  }, [navigate]);

  const handleBackToSearch = useCallback(() => {
    navigate({ type: 'search' });
  }, [navigate]);

  const handleSearch = useCallback((query: string) => {
    navigate({ type: 'search', query });
  }, [navigate]);

  return (
    <div className={styles.app}>
      <button
        type="button"
        className={styles.themeToggle}
        onClick={toggleTheme}
        title={`Theme: ${theme}`}
      >
        {themeLabel}
      </button>

      {view.type === 'search' && (
        <SearchPage
          initialQuery={view.query}
          onSelectSeries={handleSelectSeries}
          onSelectBook={handleSelectBook}
          onSearch={handleSearch}
        />
      )}

      {view.type === 'series' && (
        <SeriesDetail
          seriesSlug={view.slug}
          onBack={goBack}
          onSelectBook={handleSelectBook}
        />
      )}

      {view.type === 'book' && (
        <BookDetail
          isbn={view.isbn}
          onBack={goBack}
          onSelectSeries={handleSelectSeries}
        />
      )}

      {view.type !== 'search' && (
        <button
          type="button"
          className={styles.homeButton}
          onClick={handleBackToSearch}
          title="Back to search"
        >
          🏠
        </button>
      )}
    </div>
  );
}
