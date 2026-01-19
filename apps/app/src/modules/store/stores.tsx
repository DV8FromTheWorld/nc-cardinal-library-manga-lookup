/**
 * Central store registration.
 *
 * Import this file early in the app to register all store initializers.
 * This must be imported BEFORE calling useStoreInit().
 *
 * Usage in Router or App:
 *   import '../store/stores'; // Register all initializers
 *   import { useStoreInit } from '../store/useStoreInit';
 */

// Import and register all store initializers
import { initialize as initializeAuth } from '../authentication/store';
import { registerInitializer } from './registry';

registerInitializer(initializeAuth);

// Future stores can be registered here:
// import { initialize as initializeAccount } from '../account-detail/store';
// registerInitializer(initializeAccount);
