/**
 * Web router implementation using react-router-dom.
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SearchPage } from '../../search/web/SearchPage';
import { SeriesPage } from '../../series/web/SeriesPage';
import { BookPage } from '../../book/web/BookPage';

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
]);

export function Router(): JSX.Element {
  return <RouterProvider router={router} />;
}
