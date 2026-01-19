/**
 * Web app entrypoint.
 * Sets up the app shell and renders the router.
 */

import '../../styles/variables.css';

import { Router } from '../../modules/routing/web/Router';

export function App(): JSX.Element {
  return <Router />;
}
