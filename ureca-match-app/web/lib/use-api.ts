"use client";
/** Tiny data hook: `const { data, loading, error, reload } = useApi((api) => api.browse(), [])`. */
import { useCallback, useEffect, useState } from "react";
import { getClient, type ApiClient } from "./api/client";
import { ApiError } from "./api/models";
import { touchSession } from "./session";

export function useApi<T>(fn: (api: ApiClient) => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    getClient().then((api) => { if (alive) setLoading(true); return fn(api); }).then((d) => { if (alive) { setData(d); setError(null); touchSession(); } })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e : new ApiError(0, "network", String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload, setData };
}

/** For mutations: `const call = useCall(); await call((api) => api.apply(body))`. */
export function useCall() {
  return useCallback(async <T,>(fn: (api: ApiClient) => Promise<T>) => { const r = await fn(await getClient()); touchSession(); return r; }, []);
}
