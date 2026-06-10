import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Platform } from 'react-native';

import { AdminAuthProvider } from '@/src/contexts/AdminAuthContext';
import { ThemeProvider } from '@/src/contexts/ThemeContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: Platform.OS !== 'web',
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
