import { Router } from 'express';
import { getState } from '../controllers/competitionController.js';
import { checkRedis } from '../controllers/infraController.js';
import { runCode } from '../controllers/runController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/competition/:compId/state', requireAuth, getState);
router.get('/infra/redis', requireAuth, checkRedis);
router.post('/run', requireAuth, runCode);

export default router;
