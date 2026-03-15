import { Router } from 'express';
import authRoutes from './auth.js';
import participantRoutes from './participant.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', participantRoutes);

export default router;
