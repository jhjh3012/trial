import { Router, type IRouter } from "express";
import healthRouter from "./health";
import licenceTransfersRouter from "./licence-transfers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(licenceTransfersRouter);

export default router;
