const fallbackApiBase = "http://localhost:3000/api";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL || fallbackApiBase;
export const API_BASE_URL = stripTrailingSlash(configuredBase);

export const endpoints = {
  auth: {
    login: `${API_BASE_URL}/auth/login`,
    adminLogin: `${API_BASE_URL}/auth/admin/login`,
    logout: `${API_BASE_URL}/auth/logout`,
  },
  competition: {
    state: (compId: string) => `${API_BASE_URL}/competition/${compId}/state`,
  },
  participant: {
    run: `${API_BASE_URL}/run`,
    submit: `${API_BASE_URL}/submit`,
    submissionStatus: (submissionId: string) => `${API_BASE_URL}/submissions/${submissionId}`,
  },
  admin: {
    rounds: `${API_BASE_URL}/admin/rounds`,
    startRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/start`,
    pauseRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/pause`,
    resumeRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/resume`,
    endRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/end`,
    resetRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/reset`,
    teams: `${API_BASE_URL}/admin/teams`,
    resetTeamsPassword: `${API_BASE_URL}/admin/teams/reset-password`,
    teamById: (teamId: string) => `${API_BASE_URL}/admin/teams/${teamId}`,
    questions: `${API_BASE_URL}/admin/questions`,
    questionById: (questionId: string) => `${API_BASE_URL}/admin/questions/${questionId}`,
  },
};
