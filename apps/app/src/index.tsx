/**
 * Web entry point.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { validateEnv } from './config/env';
import { App } from './entrypoints/web/App';
import './styles/variables.css';

// Validate environment variables at startup
validateEnv();

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
