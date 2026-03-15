import { Router } from 'express';
import { getState } from '../controllers/competitionController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/competition/:compId/state', requireAuth, getState);

export default router;
