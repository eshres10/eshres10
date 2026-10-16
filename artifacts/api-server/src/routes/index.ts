import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studioRouter from "./studio";
import storageRouter from "./storage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(studioRouter);
router.use(storageRouter);

export default router;
