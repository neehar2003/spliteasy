import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initDatabase } from '../services/database/db';

const DatabaseContext = createContext(null);

export function DatabaseProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    initDatabase()
      .then(() => setStatus('ready'))
      .catch((err) => {
        setError(err);
        setStatus('error');
      });
  }, []);

  // Call after any mutation so pages depending on `version` re-fetch from SQLite.
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return <DatabaseContext.Provider value={{ status, error, version, refresh }}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabase must be used within a DatabaseProvider');
  return ctx;
}
