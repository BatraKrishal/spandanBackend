import { Router } from "express";
import { registerParticipant } from "../controllers/participant.controller";
import requireAuth from "../middleware/requireAuth";

const router = Router();

router.post("/register", requireAuth, registerParticipant);

export default router;
