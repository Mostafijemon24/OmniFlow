const TTL_MS = 30_000;

type Entry = {
  at: number;
  data: unknown;
  inflight?: Promise<unknown>;
};

const store = new Map<string, Entry>();

export const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/auto-dm",
  "/dashboard/orders",
  "/dashboard/analytics",
  "/dashboard/connections",
  "/dashboard/plans",
  "/dashboard/billing",
  "/dashboard/checkout",
  "/dashboard/admin",
  "/dashboard/admin/payments",
];

export const DASHBOARD_API_URLS = [
  "/api/profile",
  "/api/products",
  "/api/orders?status=ALL",
  "/api/auto-dm",
  "/api/analytics?days=30",
  "/api/meta/accounts",
  "/api/account/social",
  "/api/payments/manual",
];

export function peekCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry || entry.data === undefined) return undefined;
  return entry.data as T;
}

export function setCache(key: string, data: unknown) {
  store.set(key, { at: Date.now(), data });
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of Array.from(store.keys())) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
}

export function prefetchJson(url: string) {
  void cachedJson(url);
}

export function cachedJson<T = unknown>(url: string, ttl = TTL_MS): Promise<T> {
  const entry = store.get(url);
  if (entry && Date.now() - entry.at < ttl && entry.data !== undefined) {
    return Promise.resolve(entry.data as T);
  }
  if (entry?.inflight) return entry.inflight as Promise<T>;

  const inflight = fetch(url)
    .then(async (res) => {
      const data = await res.json();
      store.set(url, { at: Date.now(), data });
      return data as T;
    })
    .finally(() => {
      const current = store.get(url);
      if (current) delete current.inflight;
    });

  store.set(url, { at: entry?.at ?? 0, data: entry?.data, inflight });
  return inflight;
}
