/**
 * Web router implementation using react-router-dom.
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '../../store/stores'; // Register all store initializers
import { useStoreInit } from '../../store/useStoreInit';
import { HomePage } from '../../search/web/HomePage';
import { SearchPage } from '../../search/web/SearchPage';
import { SeriesPage } from '../../series/web/SeriesPage';
import { VolumePage } from '../../book/web/VolumePage';
import { AccountPage } from '../../account-detail/web/AccountPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/search',
    element: <SearchPage />,
  },
  {
    path: '/series/:id',
    element: <SeriesPage />,
  },
  {
    path: '/volumes/:id',
    element: <VolumePage />,
  },
  {
    path: '/account',
    element: <AccountPage />,
  },
  {
    path: '/account/checkouts',
    element: <AccountPage />,
  },
  {
    path: '/account/history',
    element: <AccountPage />,
  },
  {
    path: '/account/holds',
    element: <AccountPage />,
  },
]);

export function Router(): JSX.Element {
  // Initialize all registered stores on app start
  useStoreInit();

  return <RouterProvider router={router} />;
}
