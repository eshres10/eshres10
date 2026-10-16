import { Router, type IRouter } from "express";
import healthRouter from "./health";
import publicRouter from "./public";
import profileRouter from "./profile";
import studioRouter from "./studio";
import visibilityRouter from "./visibility";
import storageRouter, { objectReadRouter } from "./storage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Open to everyone, signed in or not. Each route checks access itself.
router.use(healthRouter);
router.use(publicRouter);
router.use(objectReadRouter);

// Everything below needs a signed-in user.
router.use(requireAuth);
router.use(profileRouter);
router.use(studioRouter);
router.use(visibilityRouter);
router.use(storageRouter);

export default router;
