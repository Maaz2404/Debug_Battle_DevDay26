import { Router } from 'express';
import {
  endRound,
  pauseRound,
  resumeRound,
  startRound,
} from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/adminOnly.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/round/:roundNumber/start', requireAuth, requireAdmin, startRound);
router.post('/round/:roundNumber/pause', requireAuth, requireAdmin, pauseRound);
router.post('/round/:roundNumber/resume', requireAuth, requireAdmin, resumeRound);
router.post('/round/:roundNumber/end', requireAuth, requireAdmin, endRound);

export default router;
