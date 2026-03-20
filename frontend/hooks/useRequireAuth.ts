"use client";

import { useEffect } from "react";
import { createDemoLoginResponse } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/useAppStore";

export function useRequireAuth() {
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const setCompetition = useAppStore((state) => state.setCompetition);
  const resetQuestionState = useAppStore((state) => state.resetQuestionState);

  useEffect(() => {
    if (!user?.token) {
      const demo = createDemoLoginResponse();
      setUser(demo.session);
      setCompetition(demo.competition);
      resetQuestionState(demo.currentQuestion);
    }
  }, [resetQuestionState, setCompetition, setUser, user?.token]);

  return user;
}
