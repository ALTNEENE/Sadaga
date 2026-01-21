import { Router } from "express";
import {
    getAllRequestsController,
    getRequestByIdController,
    createRequestController,
    updateRequestStatusController,
    getRequestMessagesController
} from "../controllers/requests.controllers.js";

const router = Router();

// Requests routes
router.get("/", getAllRequestsController);
router.get("/:id", getRequestByIdController);
router.get("/:id/messages", getRequestMessagesController);
router.post("/", createRequestController);
router.put("/:id/status", updateRequestStatusController);

export default router;
