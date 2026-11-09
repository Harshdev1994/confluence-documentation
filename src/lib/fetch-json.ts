export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** Fetches JSON from this app's API. Sends the user to reconnect if their Confluence token stopped working. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const code = body.error ?? "error";
    if (res.status === 401 && typeof window !== "undefined") {
      if (code === "unauthenticated") window.location.href = "/login";
      else window.location.href = "/settings/token?reason=expired";
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}
