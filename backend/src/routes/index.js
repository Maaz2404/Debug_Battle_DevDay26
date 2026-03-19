import { Router } from 'express';
import adminRoutes from './admin.js';
import authRoutes from './auth.js';
import participantRoutes from './participant.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/', participantRoutes);

export default router;
