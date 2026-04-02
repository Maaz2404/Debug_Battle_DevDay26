import { Router } from 'express';
import {
  addQuestion,
  addTeam,
  editQuestion,
  editTeam,
  endRound,
  getQuestions,
  getRounds,
  getTeams,
  pauseRound,
  resetTeamsPassword,
  resetRound,
  removeQuestion,
  removeTeam,
  resumeRound,
  startRound,
} from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/adminOnly.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/rounds', requireAuth, requireAdmin, getRounds);
router.post('/round/:roundNumber/start', requireAuth, requireAdmin, startRound);
router.post('/round/:roundNumber/pause', requireAuth, requireAdmin, pauseRound);
router.post('/round/:roundNumber/resume', requireAuth, requireAdmin, resumeRound);
router.post('/round/:roundNumber/end', requireAuth, requireAdmin, endRound);
router.post('/round/:roundNumber/reset', requireAuth, requireAdmin, resetRound);

router.get('/teams', requireAuth, requireAdmin, getTeams);
router.post('/teams', requireAuth, requireAdmin, addTeam);
router.post('/teams/reset-password', requireAuth, requireAdmin, resetTeamsPassword);
router.patch('/teams/:teamId', requireAuth, requireAdmin, editTeam);
router.delete('/teams/:teamId', requireAuth, requireAdmin, removeTeam);

router.get('/questions', requireAuth, requireAdmin, getQuestions);
router.post('/questions', requireAuth, requireAdmin, addQuestion);
router.patch('/questions/:questionId', requireAuth, requireAdmin, editQuestion);
router.delete('/questions/:questionId', requireAuth, requireAdmin, removeQuestion);

export default router;
