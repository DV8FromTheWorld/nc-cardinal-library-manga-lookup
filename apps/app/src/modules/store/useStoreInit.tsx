/**
 * Hook to initialize all registered stores on app start.
 *
 * Call this once in your app's root component (Router or App).
 * Make sure to import stores.tsx first to register initializers.
 *
 * Usage:
 *   import '../store/stores'; // Register all initializers
 *   
 *   function App() {
 *     useStoreInit();
 *     return <Router />;
 *   }
 */

import { useEffect, useState } from 'react';
import { initializeAll } from './registry';

/**
 * Initialize all registered stores on mount.
 */
export function useStoreInit(): { isInitialized: boolean } {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    void initializeAll().then(() => {
      setIsInitialized(true);
    });
  }, []);

  return { isInitialized };
}
