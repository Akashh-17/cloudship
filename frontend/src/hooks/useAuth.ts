import { useCallback, useEffect, useState } from "react";
import { cloudshipApi, User } from "../api/cloudship";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await cloudshipApi.getMe();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await cloudshipApi.logout();
    setUser(null);
  }, []);

  return { user, loading, isAuthenticated: !!user, refresh, logout };
}
