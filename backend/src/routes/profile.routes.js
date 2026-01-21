import { Router } from "express";
import {
    getProfileController,
    updateProfileController,
    getPortfolioController,
    uploadPortfolioController,
    deletePortfolioController
} from "../controllers/profile.controllers.js";

const router = Router();

// Profile routes
router.get("/", getProfileController);
router.put("/", updateProfileController);

// Portfolio routes
router.get("/portfolio", getPortfolioController);
router.post("/portfolio", uploadPortfolioController);
router.delete("/portfolio/:id", deletePortfolioController);

export default router;
