/**
 * Native app entrypoint.
 * Sets up the app shell and renders the router.
 */

import { Router } from '../../modules/routing/native/Router';

export function App(): JSX.Element {
  return <Router />;
}
