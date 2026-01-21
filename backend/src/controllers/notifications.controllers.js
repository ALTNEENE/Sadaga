import pool from "../config/db.config.js";
import { HTTPSTATUS } from "../config/http.config.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { Expo } from 'expo-server-sdk';

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Get all notifications for the authenticated user
 * GET /api/notifications
 */
export const getNotificationsController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT id, title, body, is_read, created_at
             FROM notifications 
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId]
        );

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
export const getUnreadCountController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT COUNT(*) as count
             FROM notifications 
             WHERE user_id = $1 AND is_read = false`,
            [userId]
        );

        return res.status(HTTPSTATUS.OK).json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error("Error fetching unread count:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Mark a notification as read
 * PUT /api/notifications/:id/read
 */
export const markAsReadController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const notificationId = req.params.id;

    try {
        const result = await pool.query(
            `UPDATE notifications 
             SET is_read = true
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [notificationId, userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "الإشعار غير موجود" });
        }

        return res.status(HTTPSTATUS.OK).json({ message: "تم تحديث الإشعار" });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
export const markAllAsReadController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        await pool.query(
            `UPDATE notifications 
             SET is_read = true
             WHERE user_id = $1`,
            [userId]
        );

        return res.status(HTTPSTATUS.OK).json({ message: "تم تحديث جميع الإشعارات" });
    } catch (error) {
        console.error("Error marking all as read:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Create a notification (internal use)
 * This is typically called from socket handlers or other services
 */
export const createNotification = async ({ userId, title, body }) => {
    try {
        const result = await pool.query(
            `INSERT INTO notifications (user_id, title, body)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, title, body]
        );

        const notification = result.rows[0];

        // Send push notification if user has a push token
        await sendPushNotification(userId, title, body);

        return notification;
    } catch (error) {
        console.error("Error creating notification:", error);
        return null;
    }
};

/**
 * Register a push notification token for a user
 * POST /api/notifications/register-token
 */
export const registerPushTokenController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { pushToken } = req.body;

    if (!pushToken) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Push token is required" });
    }

    // Validate the push token format
    if (!Expo.isExpoPushToken(pushToken)) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid Expo push token" });
    }

    try {
        await pool.query(
            `INSERT INTO push_tokens (user_id, token)
             VALUES ($1, $2)
             ON CONFLICT (user_id) 
             DO UPDATE SET token = $2, updated_at = NOW()`,
            [userId, pushToken]
        );

        return res.status(HTTPSTATUS.OK).json({ message: "Push token registered successfully" });
    } catch (error) {
        console.error("Error registering push token:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Send a push notification to a user
 * Internal helper function
 */
async function sendPushNotification(userId, title, body) {
    try {
        // Get user's push token from database
        const result = await pool.query(
            `SELECT token FROM push_tokens WHERE user_id = $1`,
            [userId]
        );

        if (!result.rows[0]) {
            console.log(`No push token found for user ${userId}`);
            return;
        }

        const pushToken = result.rows[0].token;

        // Check that the token is valid
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`Invalid push token for user ${userId}: ${pushToken}`);
            return;
        }

        // Construct the message
        const message = {
            to: pushToken,
            sound: 'default',
            title: title,
            body: body,
            data: { userId },
        };

        // Send the notification
        const chunks = expo.chunkPushNotifications([message]);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('Error sending push notification chunk:', error);
            }
        }

        console.log(`✅ Push notification sent to user ${userId}`);
        return tickets;
    } catch (error) {
        console.error("Error sending push notification:", error);
        return null;
    }
}

