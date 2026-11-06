import { RouterProvider } from 'react-router-dom';

import { ThemeProvider } from '../theme/ThemeProvider';
import { router } from './routes';

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
