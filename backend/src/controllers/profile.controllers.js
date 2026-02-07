import pool from "../config/db.config.js";
import { HTTPSTATUS } from "../config/http.config.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";

/**
 * Get user profile with extended info including balance and rating
 * GET /api/profile
 */
export const getProfileController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT id, name, email, phone, profession, role, address, balance, rating, credits, created_at
             FROM users WHERE id = $1`,
            [userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "المستخدم غير موجود" });
        }

        return res.status(HTTPSTATUS.OK).json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching profile:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Update user profile fields
 * PUT /api/profile
 */
export const updateProfileController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, phone, email, profession, address } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users 
             SET name = COALESCE($1, name),
                 phone = COALESCE($2, phone),
                 email = COALESCE($3, email),
                 profession = COALESCE($4, profession),
                 address = COALESCE($5, address),
                 updated_at = NOW()
             WHERE id = $6
             RETURNING id, name, email, phone, profession, role, address, balance, rating`,
            [name, phone, email, profession, address, userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "المستخدم غير موجود" });
        }

        return res.status(HTTPSTATUS.OK).json({
            message: "تم تحديث الملف الشخصي بنجاح",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Error updating profile:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Get portfolio images for a technician
 * GET /api/profile/portfolio
 */
export const getPortfolioController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT id, image_url, title, created_at
             FROM portfolio_images 
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching portfolio:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Upload a portfolio image
 * POST /api/profile/portfolio
 */
export const uploadPortfolioController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { imageUrl, title } = req.body;

    if (!imageUrl) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "رابط الصورة مطلوب" });
    }

    try {
        const result = await pool.query(
            `INSERT INTO portfolio_images (user_id, image_url, title)
             VALUES ($1, $2, $3)
             RETURNING id, image_url, title, created_at`,
            [userId, imageUrl, title || null]
        );

        return res.status(HTTPSTATUS.CREATED).json({
            message: "تمت إضافة الصورة بنجاح",
            image: result.rows[0]
        });
    } catch (error) {
        console.error("Error uploading portfolio image:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});

/**
 * Delete a portfolio image
 * DELETE /api/profile/portfolio/:id
 */
export const deletePortfolioController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const imageId = req.params.id;

    try {
        const result = await pool.query(
            `DELETE FROM portfolio_images 
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [imageId, userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "الصورة غير موجودة" });
        }

        return res.status(HTTPSTATUS.OK).json({ message: "تم حذف الصورة بنجاح" });
    } catch (error) {
        console.error("Error deleting portfolio image:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم"
        });
    }
});
