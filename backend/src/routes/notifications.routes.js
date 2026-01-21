import { Router } from "express";
import {
    getNotificationsController,
    getUnreadCountController,
    markAsReadController,
    markAllAsReadController,
    registerPushTokenController
} from "../controllers/notifications.controllers.js";

const router = Router();

// Notification routes (auth middleware applied at server level)
router.get("/", getNotificationsController);
router.get("/unread-count", getUnreadCountController);
router.put("/read-all", markAllAsReadController);
router.put("/:id/read", markAsReadController);
router.post("/register-token", registerPushTokenController);

export default router;

