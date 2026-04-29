"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { HeaderBar } from "@/components/HeaderBar";
import {
  apiClient,
  type AdminQuestionInfo,
  type AdminRoundInfo,
  type AdminTeamInfo,
} from "@/lib/api/client";
import { ApiError } from "@/lib/api/http";
import { useAppStore } from "@/lib/store/useAppStore";
import type { Language, RoundStatus } from "@/lib/types";
import styles from "./page.module.css";

const navItems = ["Overview", "Round 1", "Round 2", "Round 3", "Teams", "Questions"];
const supportedLanguages: Language[] = ["javascript", "python", "cpp"];

type TeamDraft = {
  name: string;
};

type QuestionDraft = {
  round_number: number;
  position: number;
  title: string;
  description: string;
  language: Language;
  codeJavascript: string;
  codePython: string;
  codeCpp: string;
  time_limit_seconds: number;
  base_score: number;
  testCaseText: string;
};

function extractCodeBlock(description: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp("```(?:" + label + ")\\s*([\\s\\S]*?)```", "i");
    const match = description.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return "";
}

function stripStarterCodeBlocks(description: string) {
  const pattern = /```(?:javascript|js|python|py|cpp|c\+\+)\s*[\s\S]*?```/gi;
  return description
    .replace(pattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getCodeByLanguage(draft: Pick<QuestionDraft, "language" | "codeJavascript" | "codePython" | "codeCpp">) {
  if (draft.language === "python") {
    return draft.codePython;
  }
  if (draft.language === "cpp") {
    return draft.codeCpp;
  }
  return draft.codeJavascript;
}

function setCodeByLanguage(draft: QuestionDraft, code: string): QuestionDraft {
  if (draft.language === "python") {
    return { ...draft, codePython: code };
  }
  if (draft.language === "cpp") {
    return { ...draft, codeCpp: code };
  }
  return { ...draft, codeJavascript: code };
}

function buildDescriptionWithStarterCode(
  description: string,
  codes: { javascript: string; python: string; cpp: string },
) {
  const base = stripStarterCodeBlocks(description);
  const blocks: string[] = [];

  if (codes.javascript.trim()) {
    blocks.push(["```javascript", codes.javascript.trimEnd(), "```"].join("\n"));
  }
  if (codes.python.trim()) {
    blocks.push(["```python", codes.python.trimEnd(), "```"].join("\n"));
  }
  if (codes.cpp.trim()) {
    blocks.push(["```cpp", codes.cpp.trimEnd(), "```"].join("\n"));
  }

  if (blocks.length === 0) {
    return base;
  }

  return [base, "Starter code:", ...blocks].filter(Boolean).join("\n\n");
}

function parseRoundFromNav(value: string) {
  const match = value.match(/^Round\s+(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatClock(endsAt: number | null, now: number) {
  if (!endsAt) return "00:00";
  const total = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = Math.floor(total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseTestCasesText(input: string) {
  const rows = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return rows.map((line) => {
    const arrowIndex = line.indexOf("=>");
    if (arrowIndex === -1) {
      return { input: line, expected_output: "" };
    }
    return {
      input: line.slice(0, arrowIndex).trim(),
      expected_output: line.slice(arrowIndex + 2).trim(),
    };
  });
}

function stringifyTestCases(testCases: Array<{ input: string; expected_output: string }> | null | undefined) {
  return (testCases || []).map((row) => `${row.input} => ${row.expected_output}`).join("\n");
}

export default function AdminPage() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState(navItems[0]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [startInSeconds, setStartInSeconds] = useState(10);
  const [roundPanels, setRoundPanels] = useState<AdminRoundInfo[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [teams, setTeams] = useState<AdminTeamInfo[]>([]);
  const [teamDrafts, setTeamDrafts] = useState<Record<string, TeamDraft>>({});
  const [teamName, setTeamName] = useState("");
  const [teamPassword, setTeamPassword] = useState("");
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [showTeamsPanel, setShowTeamsPanel] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [revealCreatePassword, setRevealCreatePassword] = useState(false);
  const [defaultTeamPassword, setDefaultTeamPassword] = useState("");
  const [revealDefaultPassword, setRevealDefaultPassword] = useState(false);
  const [teamBulkActionMessage, setTeamBulkActionMessage] = useState<string | null>(null);

  const [questions, setQuestions] = useState<AdminQuestionInfo[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, QuestionDraft>>({});
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionFilterRound, setQuestionFilterRound] = useState<number>(1);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [showCreateQuestion, setShowCreateQuestion] = useState(false);
  const [newQuestionDraft, setNewQuestionDraft] = useState<QuestionDraft>({
    round_number: 1,
    position: 0,
    title: "",
    description: "",
    language: "javascript",
    codeJavascript: "",
    codePython: "",
    codeCpp: "",
    time_limit_seconds: 150,
    base_score: 100,
    testCaseText: "sample input => sample output",
  });

  const competition = useAppStore((state) => state.competition);
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  const setCompetition = useAppStore((state) => state.setCompetition);
  const resetQuestionState = useAppStore((state) => state.resetQuestionState);
  const clearSession = useAppStore((state) => state.clearSession);
  const setUser = useAppStore((state) => state.setUser);
  const user = useAppStore((state) => state.user);
  const isAdmin = Boolean(user?.isAdmin);

  const stateLabel = useMemo<RoundStatus>(() => competition?.status ?? "IDLE", [competition?.status]);
  const selectedRound = useMemo(() => parseRoundFromNav(activeNav), [activeNav]);
  const selectedRoundNumber = selectedRound ?? (competition?.round ?? 1);
  const isRoundTab = selectedRound !== null;

  const selectedRoundInfo = useMemo(
    () => roundPanels.find((entry) => entry.round_number === selectedRoundNumber),
    [roundPanels, selectedRoundNumber],
  );

  const selectedRoundStatus = useMemo<RoundStatus>(() => {
    if (selectedRoundInfo?.status) return selectedRoundInfo.status;
    if (competition?.round === selectedRoundNumber) return stateLabel;
    return "IDLE";
  }, [competition?.round, selectedRoundInfo?.status, selectedRoundNumber, stateLabel]);

  const hasBlockingActiveRound = useMemo(
    () => roundPanels.some((entry) => entry.round_number !== selectedRoundNumber && (entry.status === "ACTIVE" || entry.status === "PAUSED")),
    [roundPanels, selectedRoundNumber],
  );

  const remainingSeconds = useMemo(() => {
    if (!competition?.roundEndsAt) return 0;
    return Math.max(0, Math.ceil((competition.roundEndsAt - now) / 1000));
  }, [competition?.roundEndsAt, now]);

  const selectedRoundRemainingSeconds = useMemo(() => {
    if (competition?.round !== selectedRoundNumber) return 0;
    return remainingSeconds;
  }, [competition?.round, remainingSeconds, selectedRoundNumber]);

  const isRoundScheduled = useMemo(
    () => selectedRoundStatus === "IDLE" && competition?.round === selectedRoundNumber && Boolean(competition?.nextQuestionAt) && (competition?.nextQuestionAt ?? 0) > now,
    [selectedRoundStatus, competition?.round, competition?.nextQuestionAt, selectedRoundNumber, now],
  );

  const scheduledStartInSeconds = useMemo(() => {
    if (!competition?.nextQuestionAt) return 0;
    return Math.max(0, Math.ceil((competition.nextQuestionAt - now) / 1000));
  }, [competition?.nextQuestionAt, now]);

  const canStart = isAdmin && !busy && selectedRoundStatus === "IDLE" && !isRoundScheduled && !hasBlockingActiveRound;
  const canPause = isAdmin && !busy && selectedRoundStatus === "ACTIVE" && competition?.round === selectedRoundNumber && selectedRoundRemainingSeconds > 0;
  const canResume = isAdmin && !busy && selectedRoundStatus === "PAUSED" && competition?.round === selectedRoundNumber && selectedRoundRemainingSeconds > 0;
  const canEnd = isAdmin && !busy && (selectedRoundStatus === "ACTIVE" || selectedRoundStatus === "PAUSED") && competition?.round === selectedRoundNumber && selectedRoundRemainingSeconds > 0;
  const canReset = isAdmin && !busy && selectedRoundStatus === "ENDED";

  const canStartOrEnd = canStart || canEnd;
  const canPauseOrResume = canPause || canResume;

  const getAdminActionErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.status === 403) return "Admin privileges are required for this action.";
      if (error.status === 409) return error.message;
    }
    return error instanceof Error ? error.message : fallback;
  };

  const handleAdminUnauthorized = () => {
    clearSession();
    setActionError(null);
    setTeamsError(null);
    setQuestionsError(null);
    router.replace("/admin");
  };

  const startDisabledReason = !canStart
    ? (!isAdmin
      ? "Sign in as admin to start the round."
      : busy
        ? "Another admin action is in progress."
        : hasBlockingActiveRound
          ? "Another round is currently ACTIVE or PAUSED. End it before starting this round."
          : isRoundScheduled
            ? `Round ${selectedRoundNumber} is already scheduled to start in ${scheduledStartInSeconds}s.`
            : `Start is only available when Round ${selectedRoundNumber} is IDLE.`)
    : null;

  const pauseDisabledReason = !canPause
    ? (!isAdmin
      ? "Sign in as admin to pause the round."
      : busy
        ? "Another admin action is in progress."
        : competition?.round !== selectedRoundNumber
          ? `Pause is only available on the currently active round (${competition?.round ?? "-"}).`
          : selectedRoundStatus !== "ACTIVE"
            ? "Pause is only available while selected round status is ACTIVE."
            : "Cannot pause when timer has reached 00:00.")
    : null;

  const resumeDisabledReason = !canResume
    ? (!isAdmin
      ? "Sign in as admin to resume the round."
      : busy
        ? "Another admin action is in progress."
        : competition?.round !== selectedRoundNumber
          ? `Resume is only available on the currently paused round (${competition?.round ?? "-"}).`
          : selectedRoundStatus !== "PAUSED"
            ? "Resume is only available while selected round status is PAUSED."
            : "Cannot resume when no time remains.")
    : null;

  const endDisabledReason = !canEnd
    ? (!isAdmin
      ? "Sign in as admin to end the round."
      : busy
        ? "Another admin action is in progress."
        : competition?.round !== selectedRoundNumber
          ? `End is only available on the currently running round (${competition?.round ?? "-"}).`
          : (selectedRoundStatus !== "ACTIVE" && selectedRoundStatus !== "PAUSED")
            ? "End is only available while selected round status is ACTIVE or PAUSED."
            : "Cannot end when timer has reached 00:00.")
    : null;

  const resetDisabledReason = !canReset
    ? (!isAdmin
      ? "Sign in as admin to reset the round."
      : busy
        ? "Another admin action is in progress."
        : "Reset is available only when selected round status is ENDED.")
    : null;

  const startOrEndDisabledReason = canStart
    ? startDisabledReason
    : canEnd
      ? endDisabledReason
      : startDisabledReason ?? endDisabledReason;

  const pauseOrResumeDisabledReason = canPause
    ? pauseDisabledReason
    : canResume
      ? resumeDisabledReason
      : pauseDisabledReason ?? resumeDisabledReason;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAdmin || !user?.token) return;

    let disposed = false;
    const syncState = () => {
      Promise.all([apiClient.getState(user.token), apiClient.getAdminRounds(user.token)])
        .then(([snapshot, rounds]) => {
          if (!disposed) {
            setCompetition(snapshot.competition);
            setRoundPanels(rounds);
          }
        })
        .catch((error) => {
          if (disposed) {
            return;
          }

          if (error instanceof ApiError && error.status === 401) {
            handleAdminUnauthorized();
            return;
          }

          setActionError("Failed to refresh round state from server.");
        });
    };

    syncState();
    const refresh = window.setInterval(syncState, 2000);
    return () => {
      disposed = true;
      window.clearInterval(refresh);
    };
  }, [isAdmin, setCompetition, user?.token]);

  const seedTeamDrafts = (rows: AdminTeamInfo[]) => {
    setTeamDrafts((previous) => {
      const next: Record<string, TeamDraft> = { ...previous };
      for (const row of rows) {
        if (!next[row.id]) {
          next[row.id] = { name: row.name || "" };
        }
      }
      return next;
    });
  };

  const seedQuestionDrafts = (rows: AdminQuestionInfo[]) => {
    setQuestionDrafts((previous) => {
      const next: Record<string, QuestionDraft> = { ...previous };
      for (const row of rows) {
        if (!next[row.id]) {
          next[row.id] = {
            round_number: Number(row.round_number || 1),
            position: Number(row.position || 0),
            title: row.title || "",
            description: stripStarterCodeBlocks(row.description || ""),
            language: ((row.language || "javascript") as Language),
            codeJavascript: extractCodeBlock(row.description || "", ["javascript", "js"]),
            codePython: extractCodeBlock(row.description || "", ["python", "py"]),
            codeCpp: extractCodeBlock(row.description || "", ["cpp", "c\\+\\+"]),
            time_limit_seconds: Number(row.time_limit_seconds || 150),
            base_score: Number(row.base_score || 100),
            testCaseText: stringifyTestCases(row.test_cases),
          };

          const normalizedLanguage = (String(row.language || "javascript").toLowerCase() as Language);
          if (normalizedLanguage === "javascript" && !next[row.id].codeJavascript) {
            next[row.id].codeJavascript = row.code || "";
          }
          if (normalizedLanguage === "python" && !next[row.id].codePython) {
            next[row.id].codePython = row.code || "";
          }
          if (normalizedLanguage === "cpp" && !next[row.id].codeCpp) {
            next[row.id].codeCpp = row.code || "";
          }
        }
      }
      return next;
    });
  };

  const loadTeams = async (token: string) => {
    try {
      const items = await apiClient.getAdminTeams(token);
      setTeams(items);
      seedTeamDrafts(items);
      setSelectedTeamId((previous) => {
        if (previous && items.some((entry) => entry.id === previous)) {
          return previous;
        }
        return items[0]?.id || "";
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }

      throw error;
    }
  };

  const loadQuestions = async (token: string, roundNumber?: number) => {
    try {
      const items = await apiClient.getAdminQuestions(token, roundNumber);
      setQuestions(items);
      seedQuestionDrafts(items);
      if (items.length > 0) {
        setSelectedQuestionId((previous) => {
          if (previous && items.some((entry) => entry.id === previous)) {
            return previous;
          }
          return items[0].id;
        });
      } else {
        setSelectedQuestionId(null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }

      throw error;
    }
  };

  useEffect(() => {
    if (!isAdmin || !user?.token) return;

    if (activeNav === "Teams") {
      loadTeams(user.token).catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          handleAdminUnauthorized();
          return;
        }
        setTeamsError(error instanceof Error ? error.message : "Failed to load teams.");
      });
    }

    if (activeNav === "Questions") {
      loadQuestions(user.token, questionFilterRound).catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          handleAdminUnauthorized();
          return;
        }
        setQuestionsError(error instanceof Error ? error.message : "Failed to load questions.");
      });
    }
  }, [activeNav, isAdmin, user?.token, questionFilterRound]);

  const filteredQuestions = useMemo(() => {
    const rows = [...questions];
    rows.sort((a, b) => {
      const ra = Number(a.round_number || 0);
      const rb = Number(b.round_number || 0);
      if (ra !== rb) return ra - rb;
      return Number(a.position || 0) - Number(b.position || 0);
    });
    return rows;
  }, [questions]);

  const selectedQuestionDraft = selectedQuestionId ? questionDrafts[selectedQuestionId] : null;
  const selectedTeam = useMemo(() => teams.find((team) => team.id === selectedTeamId) || null, [teams, selectedTeamId]);

  const handleAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    setBusy(true);
    setAuthError(null);
    try {
      const response = await apiClient.loginAdmin(email.trim(), password);
      setUser(response.session);
      setCompetition(response.competition);
      resetQuestionState(response.currentQuestion);
      const rounds = await apiClient.getAdminRounds(response.session.token);
      setRoundPanels(rounds);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Admin login failed.");
    } finally {
      setBusy(false);
    }
  };

  const refreshAdminRoundState = async () => {
    if (!user?.token) return;
    const [snapshot, rounds] = await Promise.all([
      apiClient.getState(user.token),
      apiClient.getAdminRounds(user.token),
    ]);
    setCompetition(snapshot.competition);
    setRoundPanels(rounds);
  };

  const startRound = async () => {
    if (!canStart) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.startRound(user?.token ?? "mock-admin-token", selectedRoundNumber, startInSeconds);
      await refreshAdminRoundState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setActionError(getAdminActionErrorMessage(error, "Failed to start round."));
    } finally {
      setBusy(false);
    }
  };

  const pauseRound = async () => {
    if (!canPause) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.pauseRound(user?.token ?? "", selectedRoundNumber);
      await refreshAdminRoundState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setActionError(getAdminActionErrorMessage(error, "Failed to pause round."));
    } finally {
      setBusy(false);
    }
  };

  const resumeRound = async () => {
    if (!canResume) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.resumeRound(user?.token ?? "", selectedRoundNumber);
      await refreshAdminRoundState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setActionError(getAdminActionErrorMessage(error, "Failed to resume round."));
    } finally {
      setBusy(false);
    }
  };

  const endRound = async () => {
    if (!canEnd) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.endRound(user?.token ?? "", selectedRoundNumber);
      await refreshAdminRoundState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setActionError(getAdminActionErrorMessage(error, "Failed to end round."));
    } finally {
      setBusy(false);
    }
  };

  const startOrEndRound = async () => {
    if (canStart) {
      await startRound();
      return;
    }

    if (canEnd) {
      await endRound();
    }
  };

  const pauseOrResumeRound = async () => {
    if (canPause) {
      await pauseRound();
      return;
    }

    if (canResume) {
      await resumeRound();
    }
  };

  const resetRound = async () => {
    if (!canReset) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.resetRound(user?.token ?? "", selectedRoundNumber);
      await refreshAdminRoundState();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setActionError(getAdminActionErrorMessage(error, "Failed to reset round."));
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!user?.token) return;
    setBusy(true);
    setTeamsError(null);
    setTeamBulkActionMessage(null);
    try {
      await apiClient.createAdminTeam(user.token, { name: teamName, password: teamPassword });
      setTeamName("");
      setTeamPassword("");
      await loadTeams(user.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setTeamsError(error instanceof Error ? error.message : "Failed to create team.");
    } finally {
      setBusy(false);
    }
  };

  const updateTeam = async (teamId: string) => {
    if (!user?.token) return;
    const draft = teamDrafts[teamId];
    if (!draft) return;

    setBusy(true);
    setTeamsError(null);
    setTeamBulkActionMessage(null);
    try {
      const payload: { name?: string } = {};
      if (draft.name.trim()) payload.name = draft.name.trim();
      await apiClient.updateAdminTeam(user.token, teamId, payload);
      await loadTeams(user.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setTeamsError(error instanceof Error ? error.message : "Failed to update team.");
    } finally {
      setBusy(false);
    }
  };

  const deleteTeam = async (teamId: string) => {
    if (!user?.token) return;
    setBusy(true);
    setTeamsError(null);
    setTeamBulkActionMessage(null);
    try {
      await apiClient.deleteAdminTeam(user.token, teamId);
      await loadTeams(user.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setTeamsError(error instanceof Error ? error.message : "Failed to delete team.");
    } finally {
      setBusy(false);
    }
  };

  const resetAllTeamsPassword = async () => {
    if (!user?.token) return;
    if (!defaultTeamPassword.trim()) {
      setTeamsError("Default password is required.");
      return;
    }

    setBusy(true);
    setTeamsError(null);
    setTeamBulkActionMessage(null);
    try {
      const result = await apiClient.resetAllTeamsPassword(user.token, defaultTeamPassword.trim());
      setTeamBulkActionMessage(`Updated ${result.updated}/${result.total} teams. Failed: ${result.failed}.`);
      setDefaultTeamPassword("");
      await loadTeams(user.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setTeamsError(error instanceof Error ? error.message : "Failed to reset all team passwords.");
    } finally {
      setBusy(false);
    }
  };

  const createQuestion = async () => {
    if (!user?.token) return;
    const selectedLanguageCode = getCodeByLanguage(newQuestionDraft).trim();
    if (!selectedLanguageCode) {
      setQuestionsError(`Code is required for ${newQuestionDraft.language.toUpperCase()}.`);
      return;
    }

    setBusy(true);
    setQuestionsError(null);
    try {
      await apiClient.createAdminQuestion(user.token, {
        round_number: newQuestionDraft.round_number,
        position: newQuestionDraft.position,
        title: newQuestionDraft.title,
        description: buildDescriptionWithStarterCode(newQuestionDraft.description, {
          javascript: newQuestionDraft.codeJavascript,
          python: newQuestionDraft.codePython,
          cpp: newQuestionDraft.codeCpp,
        }),
        code: selectedLanguageCode,
        language: newQuestionDraft.language,
        time_limit_seconds: newQuestionDraft.time_limit_seconds,
        base_score: newQuestionDraft.base_score,
        test_cases: parseTestCasesText(newQuestionDraft.testCaseText),
      });
      setNewQuestionDraft({
        round_number: newQuestionDraft.round_number,
        position: 0,
        title: "",
        description: "",
        language: "javascript",
        codeJavascript: "",
        codePython: "",
        codeCpp: "",
        time_limit_seconds: 150,
        base_score: 100,
        testCaseText: "sample input => sample output",
      });
      setShowCreateQuestion(false);
      await loadQuestions(user.token, questionFilterRound);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setQuestionsError(error instanceof Error ? error.message : "Failed to create question.");
    } finally {
      setBusy(false);
    }
  };

  const updateQuestion = async () => {
    if (!user?.token || !selectedQuestionId || !selectedQuestionDraft) return;
    const selectedLanguageCode = getCodeByLanguage(selectedQuestionDraft).trim();
    if (!selectedLanguageCode) {
      setQuestionsError(`Code is required for ${selectedQuestionDraft.language.toUpperCase()}.`);
      return;
    }

    setBusy(true);
    setQuestionsError(null);
    try {
      await apiClient.updateAdminQuestion(user.token, selectedQuestionId, {
        round_number: selectedQuestionDraft.round_number,
        position: selectedQuestionDraft.position,
        title: selectedQuestionDraft.title,
        description: buildDescriptionWithStarterCode(selectedQuestionDraft.description, {
          javascript: selectedQuestionDraft.codeJavascript,
          python: selectedQuestionDraft.codePython,
          cpp: selectedQuestionDraft.codeCpp,
        }),
        code: selectedLanguageCode,
        language: selectedQuestionDraft.language,
        time_limit_seconds: selectedQuestionDraft.time_limit_seconds,
        base_score: selectedQuestionDraft.base_score,
        test_cases: parseTestCasesText(selectedQuestionDraft.testCaseText),
      });
      await loadQuestions(user.token, questionFilterRound);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setQuestionsError(error instanceof Error ? error.message : "Failed to update question.");
    } finally {
      setBusy(false);
    }
  };

  const deleteQuestion = async () => {
    if (!user?.token || !selectedQuestionId) return;
    setBusy(true);
    setQuestionsError(null);
    try {
      await apiClient.deleteAdminQuestion(user.token, selectedQuestionId);
      const currentId = selectedQuestionId;
      setSelectedQuestionId(null);
      setQuestionDrafts((previous) => {
        const next = { ...previous };
        delete next[currentId];
        return next;
      });
      await loadQuestions(user.token, questionFilterRound);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      setQuestionsError(error instanceof Error ? error.message : "Failed to delete question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <HeaderBar left={<BrandLogo href="/admin" compact withImage />} right={<ConnectionStatusBadge status={connectionStatus} />} />

      {!isAdmin ? (
        <main className={styles.main}>
          <section className={styles.card}>
            <p className={styles.cardLabel}>Admin Access</p>
            <h1 className={styles.pageTitle}>Sign in as Admin</h1>
            <form className={styles.adminForm} onSubmit={handleAdminLogin}>
              <label className={styles.fieldLabel} htmlFor="adminEmail">Email</label>
              <input id="adminEmail" className={styles.fieldInput} value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@ex.com" />

              <label className={styles.fieldLabel} htmlFor="adminPassword">Password</label>
              <input id="adminPassword" className={styles.fieldInput} value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Your admin password" />

              {authError ? <p className={styles.authError}>{authError}</p> : null}

              <button type="submit" disabled={busy} className={styles.start}>{busy ? "Signing in..." : "Sign in"}</button>
            </form>
          </section>
        </main>
      ) : null}

      {isAdmin ? (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <BrandLogo href="/admin" compact={false} />
            <nav className={styles.nav}>
              {navItems.map((item) => (
                <button key={item} onClick={() => setActiveNav(item)} className={clsx(styles.navButton, activeNav === item && styles.navActive)}>
                  {item}
                </button>
              ))}
            </nav>
          </aside>

          <main className={styles.main}>
            <h1 className={styles.pageTitle}>Admin Dashboard</h1>

            {activeNav === "Overview" ? (
              <section className={styles.card}>
                <p className={styles.cardLabel}>Current Round State</p>
                <div className={styles.stateRow}>
                  <span className={styles.stateBadge}>{stateLabel}</span>
                  <span className={styles.roundBadge}>Round {competition?.round ?? 1}</span>
                  <span className={styles.roundBadge}>Time Left {formatClock(competition?.roundEndsAt ?? null, now)}</span>
                </div>
                <p className={styles.roundHint}>Use Round 1, Round 2, or Round 3 tabs for direct control panels.</p>
              </section>
            ) : null}

            {isRoundTab ? (
              <section className={styles.card}>
                <p className={styles.cardLabel}>Round {selectedRoundNumber} Control Panel</p>
                <div className={styles.stateRow}>
                  <span className={styles.stateBadge}>{selectedRoundStatus}</span>
                  <span className={styles.roundBadge}>Round {selectedRoundNumber}</span>
                  <span className={styles.roundBadge}>Time Left {formatClock(competition?.round === selectedRoundNumber ? (competition?.roundEndsAt ?? null) : null, now)}</span>
                </div>

                {actionError ? <p className={styles.authError}>{actionError}</p> : null}

                <div className={styles.adminForm}>
                  <label className={styles.fieldLabel} htmlFor="roundStartInSeconds">Start In (seconds)</label>
                  <input id="roundStartInSeconds" className={styles.fieldInput} value={startInSeconds} onChange={(event) => setStartInSeconds(Math.max(1, Number(event.target.value) || 1))} type="number" min={1} max={600} step={1} />
                </div>

                <div className={styles.actions}>
                  <div className={styles.actionControl}>
                    <button onClick={startOrEndRound} disabled={!canStartOrEnd} title={startOrEndDisabledReason ?? undefined} className={styles.start}>
                      {busy ? (canStart ? "Starting..." : canEnd ? "Ending..." : "Working...") : (canStart ? "Start Round" : "End Round")}
                    </button>
                    {startOrEndDisabledReason ? <p className={styles.actionHint}>{startOrEndDisabledReason}</p> : null}
                  </div>
                  <div className={styles.actionControl}>
                    <button onClick={pauseOrResumeRound} disabled={!canPauseOrResume} title={pauseOrResumeDisabledReason ?? undefined} className={styles.pause}>
                      {busy ? (canPause ? "Pausing..." : canResume ? "Resuming..." : "Working...") : (canPause ? "Pause" : "Resume")}
                    </button>
                    {pauseOrResumeDisabledReason ? <p className={styles.actionHint}>{pauseOrResumeDisabledReason}</p> : null}
                  </div>
                  <div className={styles.actionControl}>
                    <button onClick={resetRound} disabled={!canReset} title={resetDisabledReason ?? undefined} className={styles.reset}>Reset Round</button>
                    {resetDisabledReason ? <p className={styles.actionHint}>{resetDisabledReason}</p> : null}
                  </div>
                </div>
              </section>
            ) : null}

            {activeNav === "Teams" ? (
              <section className={styles.card}>
                <div className={styles.questionToolbar}>
                  <p className={styles.cardLabel}>Teams</p>
                  <button className={styles.start} type="button" onClick={() => setShowTeamsPanel((value) => !value)}>
                    {showTeamsPanel ? "Hide Teams" : "Show Teams"}
                  </button>
                </div>
                <p className={styles.roundHint}>Total teams: {teams.length}</p>

                <div className={styles.adminForm}>
                  <label className={styles.fieldLabel} htmlFor="newTeamName">Team Name</label>
                  <input id="newTeamName" className={styles.fieldInput} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team Alpha" />

                  <label className={styles.fieldLabel} htmlFor="newTeamPassword">Password</label>
                  <div className={styles.passwordRow}>
                    <input
                      id="newTeamPassword"
                      className={styles.fieldInput}
                      value={teamPassword}
                      onChange={(event) => setTeamPassword(event.target.value)}
                      type={revealCreatePassword ? "text" : "password"}
                      placeholder="Set team password"
                    />
                    <button className={styles.pause} type="button" onClick={() => setRevealCreatePassword((value) => !value)}>
                      {revealCreatePassword ? "Hide" : "Show"}
                    </button>
                  </div>

                  <button onClick={createTeam} disabled={busy} className={styles.start} type="button">Add Team</button>
                </div>

                <div className={styles.adminForm}>
                  <label className={styles.fieldLabel} htmlFor="defaultTeamPassword">Set Default Password For All Teams</label>
                  <div className={styles.passwordRow}>
                    <input
                      id="defaultTeamPassword"
                      className={styles.fieldInput}
                      value={defaultTeamPassword}
                      onChange={(event) => setDefaultTeamPassword(event.target.value)}
                      type={revealDefaultPassword ? "text" : "password"}
                      placeholder="Enter new default password"
                    />
                    <button className={styles.pause} type="button" onClick={() => setRevealDefaultPassword((value) => !value)}>
                      {revealDefaultPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <button onClick={resetAllTeamsPassword} disabled={busy} className={styles.reset} type="button">
                    Change Default Password (All Teams)
                  </button>
                </div>

                {teamsError ? <p className={styles.authError}>{teamsError}</p> : null}
                {teamBulkActionMessage ? <p className={styles.roundHint}>{teamBulkActionMessage}</p> : null}

                {showTeamsPanel ? (
                  <div className={styles.dataItem}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Select Team</label>
                      <select className={styles.fieldInput} value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    </div>

                    {selectedTeam ? (
                      <>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Team Name</label>
                          <input
                            className={styles.fieldInput}
                            value={(teamDrafts[selectedTeam.id] || { name: selectedTeam.name }).name}
                            onChange={(event) => setTeamDrafts((previous) => ({
                              ...previous,
                              [selectedTeam.id]: {
                                ...(previous[selectedTeam.id] || { name: selectedTeam.name }),
                                name: event.target.value,
                              },
                            }))}
                          />
                        </div>
                        <div className={styles.actions}>
                          <button onClick={() => updateTeam(selectedTeam.id)} disabled={busy} className={styles.start} type="button">Update</button>
                          <button onClick={() => deleteTeam(selectedTeam.id)} disabled={busy} className={styles.reset} type="button">Delete</button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.roundHint}>No teams available.</p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeNav === "Questions" ? (
              <section className={styles.cardWide}>
                <div className={styles.questionToolbar}>
                  <p className={styles.cardLabel}>Questions</p>
                  <div className={styles.toolbarControls}>
                    <select
                      className={styles.fieldInput}
                      value={questionFilterRound}
                      onChange={(event) => setQuestionFilterRound(Number(event.target.value) || 0)}
                    >
                      <option value={0}>All Rounds</option>
                      <option value={1}>Round 1</option>
                      <option value={2}>Round 2</option>
                      <option value={3}>Round 3</option>
                    </select>
                    <button className={styles.start} type="button" onClick={() => setShowCreateQuestion((value) => !value)}>
                      {showCreateQuestion ? "Close New" : "New Question"}
                    </button>
                  </div>
                </div>

                {showCreateQuestion ? (
                  <div className={styles.questionCreatePanel}>
                    <div className={styles.fieldRow}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Round</label>
                        <select className={styles.fieldInput} value={newQuestionDraft.round_number} onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, round_number: Number(event.target.value) || 1 }))}>
                          <option value={1}>Round 1</option>
                          <option value={2}>Round 2</option>
                          <option value={3}>Round 3</option>
                        </select>
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Position</label>
                        <input className={styles.fieldInput} type="number" min={0} value={newQuestionDraft.position} onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, position: Math.max(0, Number(event.target.value) || 0) }))} />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Language</label>
                        <select className={styles.fieldInput} value={newQuestionDraft.language} onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, language: event.target.value as Language }))}>
                          {supportedLanguages.map((option) => (
                            <option key={option} value={option}>
                              {option.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Time Limit</label>
                        <input className={styles.fieldInput} type="number" min={1} value={newQuestionDraft.time_limit_seconds} onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, time_limit_seconds: Math.max(1, Number(event.target.value) || 1) }))} />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Base Score</label>
                        <input className={styles.fieldInput} type="number" min={0} value={newQuestionDraft.base_score} onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, base_score: Math.max(0, Number(event.target.value) || 0) }))} />
                      </div>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Title</label>
                      <input className={styles.fieldInput} value={newQuestionDraft.title} placeholder="Question title" onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, title: event.target.value }))} />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Description</label>
                      <textarea className={styles.textArea} value={newQuestionDraft.description} placeholder="Description" onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, description: event.target.value }))} />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Code ({newQuestionDraft.language.toUpperCase()})</label>
                      <textarea
                        className={styles.textArea}
                        value={getCodeByLanguage(newQuestionDraft)}
                        placeholder={`${newQuestionDraft.language.toUpperCase()} starter code`}
                        onChange={(event) => setNewQuestionDraft((previous) => setCodeByLanguage(previous, event.target.value))}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Test Cases</label>
                      <textarea className={styles.textArea} value={newQuestionDraft.testCaseText} placeholder="input => expected (one per line)" onChange={(event) => setNewQuestionDraft((previous) => ({ ...previous, testCaseText: event.target.value }))} />
                    </div>
                    <button className={styles.start} type="button" disabled={busy} onClick={createQuestion}>Create Question</button>
                  </div>
                ) : null}

                {questionsError ? <p className={styles.authError}>{questionsError}</p> : null}

                <div className={styles.questionWorkspace}>
                  <div className={styles.questionEditor}>
                    <div className={styles.fieldRow}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Question</label>
                        <select
                          className={styles.fieldInput}
                          value={selectedQuestionId ?? ""}
                          onChange={(event) => setSelectedQuestionId(event.target.value || null)}
                        >
                          {filteredQuestions.map((question) => (
                            <option key={question.id} value={question.id}>
                              {`Q${question.position} - ${question.title || "Untitled"}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {selectedQuestionId && selectedQuestionDraft ? (
                      <>
                        <div className={styles.fieldRow}>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Round</label>
                            <select className={styles.fieldInput} value={selectedQuestionDraft.round_number} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, round_number: Number(event.target.value) || 1 } }))}>
                              <option value={1}>Round 1</option>
                              <option value={2}>Round 2</option>
                              <option value={3}>Round 3</option>
                            </select>
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Position</label>
                            <input className={styles.fieldInput} type="number" min={0} value={selectedQuestionDraft.position} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, position: Math.max(0, Number(event.target.value) || 0) } }))} />
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Language</label>
                            <select className={styles.fieldInput} value={selectedQuestionDraft.language} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, language: event.target.value as Language } }))}>
                              {supportedLanguages.map((option) => (
                                <option key={option} value={option}>
                                  {option.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Time Limit</label>
                            <input className={styles.fieldInput} type="number" min={1} value={selectedQuestionDraft.time_limit_seconds} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, time_limit_seconds: Math.max(1, Number(event.target.value) || 1) } }))} />
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Base Score</label>
                            <input className={styles.fieldInput} type="number" min={0} value={selectedQuestionDraft.base_score} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, base_score: Math.max(0, Number(event.target.value) || 0) } }))} />
                          </div>
                        </div>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Title</label>
                          <input className={styles.fieldInput} value={selectedQuestionDraft.title} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, title: event.target.value } }))} />
                        </div>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Description</label>
                          <textarea className={styles.textArea} value={selectedQuestionDraft.description} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, description: event.target.value } }))} />
                        </div>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Code ({selectedQuestionDraft.language.toUpperCase()})</label>
                          <textarea
                            className={styles.textArea}
                            value={getCodeByLanguage(selectedQuestionDraft)}
                            placeholder={`${selectedQuestionDraft.language.toUpperCase()} starter code`}
                            onChange={(event) => setQuestionDrafts((previous) => ({
                              ...previous,
                              [selectedQuestionId]: setCodeByLanguage(selectedQuestionDraft, event.target.value),
                            }))}
                          />
                        </div>
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Test Cases</label>
                          <textarea className={styles.textArea} value={selectedQuestionDraft.testCaseText} onChange={(event) => setQuestionDrafts((previous) => ({ ...previous, [selectedQuestionId]: { ...selectedQuestionDraft, testCaseText: event.target.value } }))} />
                        </div>
                        <div className={styles.questionActions}>
                          <button className={styles.start} type="button" disabled={busy} onClick={updateQuestion}>Update</button>
                          <button className={styles.reset} type="button" disabled={busy} onClick={deleteQuestion}>Delete</button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.roundHint}>Select a question from the left list to edit.</p>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      ) : null}
    </div>
  );
}
