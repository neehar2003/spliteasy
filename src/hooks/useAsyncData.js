import { useEffect, useState } from 'react';

/**
 * Runs an async fetch whenever `deps` changes, tracking loading/error state.
 * Reads now go over the network (Supabase), so pages can no longer compute
 * data synchronously the way they could with the old in-browser SQLite.
 */
export function useAsyncData(fetchFn, deps, initialValue = null) {
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFn()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}
