"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is pushed fresh by live sync later; avoid refetching on every focus.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => count < 2 && !(err instanceof Error && /40[134]/.test(err.message)),
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
