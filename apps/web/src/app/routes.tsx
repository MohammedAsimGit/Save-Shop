import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { RootLayout } from '../layouts/RootLayout';
import { AdminPage } from '../pages/AdminPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PremiumPage } from '../pages/PremiumPage';
import { ProductPage } from '../pages/ProductPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RouteErrorPage } from '../pages/RouteErrorPage';
import { SearchPage } from '../pages/SearchPage';
import { SignInPage } from '../pages/SignInPage';
import { TrackingPage } from '../pages/TrackingPage';

/**
 * Route table.
 *
 * Kept as a plain array so tests can build a memory router from the same
 * definitions instead of duplicating the tree.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'product/:productId', element: <ProductPage /> },
      { path: 'tracking', element: <TrackingPage /> },
      { path: 'premium', element: <PremiumPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'signin', element: <SignInPage /> },
      // Unlisted on purpose: administration is not part of the shopper journey and
      // every request behind it is authorised by the API, not by this route.
      { path: 'admin', element: <AdminPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
