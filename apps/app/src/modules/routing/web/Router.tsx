/**
 * Web router implementation using react-router-dom.
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '../../store/stores'; // Register all store initializers
import { useStoreInit } from '../../store/useStoreInit';
import { SearchPage } from '../../search/web/SearchPage';
import { SeriesPage } from '../../series/web/SeriesPage';
import { BookPage } from '../../book/web/BookPage';
import { AccountPage } from '../../account-detail/web/AccountPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <SearchPage />,
  },
  {
    path: '/search',
    element: <SearchPage />,
  },
  {
    path: '/series/:slug',
    element: <SeriesPage />,
  },
  {
    path: '/books/:isbn',
    element: <BookPage />,
  },
  {
    path: '/books/:isbn/:slug',
    element: <BookPage />,
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
