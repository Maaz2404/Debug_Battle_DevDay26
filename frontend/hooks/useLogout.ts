"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/useAppStore";

export function useLogout() {
  const router = useRouter();
  const userToken = useAppStore((state) => state.user?.token);
  const clearSession = useAppStore((state) => state.clearSession);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await apiClient.logout(userToken);
    } finally {
      clearSession();
      router.replace("/");
      setLoggingOut(false);
    }
  }, [clearSession, loggingOut, router, userToken]);

  return {
    logout,
    loggingOut,
  };
}
