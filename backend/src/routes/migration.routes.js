import { Router } from "express";
import { runProfileMigration, runPushTokensMigration, runLocationFixMigration, runMessagesMigration, runCreditsMigration } from "../controllers/migration.controllers.js";

const router = Router();

// Migration endpoints (should be protected in production)
router.post("/profile-migration", runProfileMigration);
router.post("/push-tokens-migration", runPushTokensMigration);
router.post("/location-fix-migration", runLocationFixMigration);
router.post("/messages-migration", runMessagesMigration);
router.post("/credits-migration", runCreditsMigration);

export default router;
