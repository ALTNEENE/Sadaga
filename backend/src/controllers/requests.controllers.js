import pool from "../config/db.config.js";
import { HTTPSTATUS } from "../config/http.config.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { notifyTechnicianOfNewRequest } from "../socket/index.js";
import { deductCredits } from "./credits.controllers.js";
import { CREDITS_CONFIG } from "../config/credits.config.js";

/**
 * Get all requests for a user with optional status filter
 * GET /api/requests?status=completed|in_progress|pending
 */
export const getAllRequestsController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status } = req.query;

    try {
        let query;
        let params;

        // Different queries based on user role
        if (userRole === 'TECHNICIAN') {
            // Technicians see requests assigned to them
            query = `
                SELECT r.id, r.service_type, r.status, r.user_note, r.created_at,
                       r.accepted_at, r.completed_at,
                       u.name as client_name, u.phone as client_phone
                FROM service_requests r
                JOIN users u ON r.user_id = u.id
                WHERE r.technician_id = $1
            `;
            params = [userId];
        } else {
            // Clients see their own requests
            query = `
                SELECT r.id, r.service_type, r.status, r.user_note, r.created_at,
                       r.accepted_at, r.completed_at,
                       t.name as technician_name, t.phone as technician_phone
                FROM service_requests r
                LEFT JOIN users t ON r.technician_id = t.id
                WHERE r.user_id = $1
            `;
            params = [userId];
        }

        // Add status filter if provided
        if (status && status !== 'all') {
            query += ` AND r.status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY r.created_at DESC`;

        const result = await pool.query(query, params);

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching requests:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Get specific request details
 * GET /api/requests/:id
 */
export const getRequestByIdController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const requestId = req.params.id;

    try {
        const result = await pool.query(
            `SELECT r.*, 
                    c.name as client_name, c.phone as client_phone, c.email as client_email,
                    t.name as technician_name, t.phone as technician_phone, t.email as technician_email,
                    ST_X(r.pickup_location::geometry) as pickup_longitude,
                    ST_Y(r.pickup_location::geometry) as pickup_latitude,
                    ST_X(r.dropoff_location::geometry) as dropoff_longitude,
                    ST_Y(r.dropoff_location::geometry) as dropoff_latitude
             FROM service_requests r
             JOIN users c ON r.user_id = c.id
             LEFT JOIN users t ON r.technician_id = t.id
             WHERE r.id = $1 AND (r.user_id = $2 OR r.technician_id = $2)`,
            [requestId, userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "الطلب غير موجود" });
        }

        return res.status(HTTPSTATUS.OK).json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching request:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Create a new service request
 * POST /api/requests
 */
export const createRequestController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { serviceType, userNote, technicianId, pickupLocation, dropoffLocation } = req.body;

    console.log(technicianId, userId)
    if (userId === technicianId) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "لا يمكن إنشاء طلب لفني بنفسه" });
    }

    console.log("Pickup Location: ", pickupLocation)
    console.log("Dropoff Location: ", dropoffLocation)

    if (!serviceType) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "نوع الخدمة مطلوب" });
    }

    try {
        // Build query based on provided location data
        let query;
        let params;

        if (pickupLocation || dropoffLocation) {
            query = `
                INSERT INTO service_requests (user_id, technician_id, service_type, user_note, pickup_location, dropoff_location)
                VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), ST_SetSRID(ST_MakePoint($7, $8), 4326))
                RETURNING *
            `;
            params = [
                userId,
                technicianId || null,
                serviceType,
                userNote || null,
                pickupLocation.longitude,
                pickupLocation.latitude,
                dropoffLocation.longitude,
                dropoffLocation.latitude
            ];
        } else {
            query = `
                INSERT INTO service_requests (user_id, technician_id, service_type, user_note)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            params = [userId, technicianId || null, serviceType, userNote || null];
        }

        const result = await pool.query(query, params);

        // Notify technician if one was assigned
        if (technicianId) {
            notifyTechnicianOfNewRequest(technicianId, result.rows[0], req.user.name);
        }

        return res.status(HTTPSTATUS.CREATED).json({
            message: "تم إنشاء الطلب بنجاح",
            request: result.rows[0]
        });
    } catch (error) {
        console.error("Error creating request:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Update request status
 * PUT /api/requests/:id/status
 */
export const updateRequestStatusController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const requestId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['pending', 'accepted', 'on_the_way', 'arrived', 'completed', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
            message: "حالة غير صالحة",
            validStatuses
        });
    }

    try {
        // If technician is accepting the request, check and deduct credits first
        if (status === 'accepted') {
            // Verify request exists and get technician ID
            const requestCheck = await pool.query(
                `SELECT * FROM service_requests WHERE id = $1`,
                [requestId]
            );

            if (!requestCheck.rows[0]) {
                return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "الطلب غير موجود" });
            }

            const request = requestCheck.rows[0];

            // Only deduct credits if user is the technician
            if (request.technician_id === userId || req.user.role === 'TECHNICIAN') {
                // Deduct credits
                const deductionResult = await deductCredits(
                    userId,
                    CREDITS_CONFIG.CREDITS_PER_REQUEST,
                    requestId
                );

                if (!deductionResult.success) {
                    return res.status(HTTPSTATUS.BAD_REQUEST).json({
                        message: deductionResult.message || "رصيد غير كافٍ",
                    });
                }

                console.log(`Credits deducted for user ${userId}. New balance: ${deductionResult.newBalance}`);
            }
        }

        // Update appropriate timestamp based on status
        let query;
        if (status === 'accepted') {
            query = `
                UPDATE service_requests 
                SET status = $1, accepted_at = NOW()
                WHERE id = $2 AND (user_id = $3 OR technician_id = $3)
                RETURNING *
            `;
        } else if (status === 'completed') {
            query = `
                UPDATE service_requests 
                SET status = $1, completed_at = NOW()
                WHERE id = $2 AND (user_id = $3 OR technician_id = $3)
                RETURNING *
            `;
        } else {
            query = `
                UPDATE service_requests 
                SET status = $1
                WHERE id = $2 AND (user_id = $3 OR technician_id = $3)
                RETURNING *
            `;
        }

        const result = await pool.query(query, [status, requestId, userId]);

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "الطلب غير موجود" });
        }

        return res.status(HTTPSTATUS.OK).json({
            message: "تم تحديث حالة الطلب",
            request: result.rows[0]
        });
    } catch (error) {
        console.error("Error updating request status:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Get messages for a specific request
 * GET /api/requests/:id/messages
 */
export const getRequestMessagesController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const requestId = req.params.id;

    try {
        // Verify user is part of this request
        const requestCheck = await pool.query(
            `SELECT * FROM service_requests 
             WHERE id = $1 AND (user_id = $2 OR technician_id = $2)`,
            [requestId, userId]
        );

        if (!requestCheck.rows[0]) {
            return res.status(HTTPSTATUS.FORBIDDEN).json({
                message: "غير مصرح بالوصول لهذا الطلب"
            });
        }

        // Fetch all messages for this request
        const result = await pool.query(
            `SELECT 
                m.id, 
                m.request_id, 
                m.sender_id, 
                m.message, 
                m.created_at,
                u.name as sender_name,
                u.role as sender_role
             FROM request_messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.request_id = $1
             ORDER BY m.created_at ASC`,
            [requestId]
        );

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching request messages:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});
