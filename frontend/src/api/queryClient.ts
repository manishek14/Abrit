import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // API errors with a response (4xx/5xx) were already decided
        // server-side — retrying them is pointless. Network-level
        // failures get a couple of chances.
        if (error instanceof AxiosError && error.response !== undefined) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
