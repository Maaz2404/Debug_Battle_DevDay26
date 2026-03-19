import {
  endRoundByNumber as endRoundWithEngine,
  pauseRoundByNumber as pauseRoundWithEngine,
  resumeRoundByNumber as resumeRoundWithEngine,
  startRoundByNumber as startRoundWithEngine,
} from './competitionEngine.js';

export async function startRoundByNumber(roundNumber) {
  return startRoundWithEngine(roundNumber);
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
