/**
 * Web app entrypoint.
 * Sets up the app shell and renders the router.
 */

import { Router } from '../../modules/routing/web/Router';
import '../../styles/variables.css';

export function App(): JSX.Element {
  return <Router />;
}
