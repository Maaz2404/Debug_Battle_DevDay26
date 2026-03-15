import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginRateLimit, login);
router.post('/logout', requireAuth, logout);

export default router;
