import {
  endRoundByNumber as endRoundWithEngine,
  listRounds as listRoundsWithEngine,
  pauseRoundByNumber as pauseRoundWithEngine,
  resetRoundByNumber as resetRoundWithEngine,
  resumeRoundByNumber as resumeRoundWithEngine,
  startRoundByNumber as startRoundWithEngine,
} from './competitionEngine.js';
import {
  createQuestion as createQuestionWithData,
  createTeam as createTeamWithData,
  deleteQuestion as deleteQuestionWithData,
  deleteTeam as deleteTeamWithData,
  listQuestions as listQuestionsWithData,
  listTeams as listTeamsWithData,
  resetAllTeamPasswords as resetAllTeamPasswordsWithData,
  updateQuestion as updateQuestionWithData,
  updateTeam as updateTeamWithData,
} from './adminDataService.js';

export async function startRoundByNumber(roundNumber, options = {}) {
  return startRoundWithEngine(roundNumber, options);
}

export async function pauseRoundByNumber(roundNumber) {
  return pauseRoundWithEngine(roundNumber);
}

export async function resumeRoundByNumber(roundNumber) {
  return resumeRoundWithEngine(roundNumber);
}

export async function endRoundByNumber(roundNumber) {
  return endRoundWithEngine(roundNumber);
}

export async function listRounds() {
  return listRoundsWithEngine();
}

export async function resetRoundByNumber(roundNumber) {
  return resetRoundWithEngine(roundNumber);
}

export async function listTeams() {
  return listTeamsWithData();
}

export async function createTeam(payload) {
  return createTeamWithData(payload);
}

export async function updateTeam(teamId, payload) {
  return updateTeamWithData(teamId, payload);
}

export async function deleteTeam(teamId) {
  return deleteTeamWithData(teamId);
}

export async function resetAllTeamPasswords(payload) {
  return resetAllTeamPasswordsWithData(payload);
}

export async function listQuestions(roundNumber) {
  return listQuestionsWithData(roundNumber);
}

export async function createQuestion(payload) {
  return createQuestionWithData(payload);
}

export async function updateQuestion(questionId, payload) {
  return updateQuestionWithData(questionId, payload);
}

export async function deleteQuestion(questionId) {
  return deleteQuestionWithData(questionId);
}
