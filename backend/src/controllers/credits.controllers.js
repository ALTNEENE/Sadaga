import pool from "../config/db.config.js";
import { HTTPSTATUS } from "../config/http.config.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { verifyPaymentProof } from "../utils/payment-verification.js";
import { CREDITS_CONFIG } from "../config/credits.config.js";

/**
 * Get current credit balance for logged-in technician
 * GET /api/credits/balance
 */
export const getCreditBalanceController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT credits FROM users WHERE id = $1`,
            [userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "المستخدم غير موجود" });
        }

        return res.status(HTTPSTATUS.OK).json({
            credits: result.rows[0].credits || 0,
        });
    } catch (error) {
        console.error("Error fetching credit balance:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم",
        });
    }
});

/**
 * Get available credit packages
 * GET /api/credits/packages
 */
export const getCreditPackagesController = asyncHandler(async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, credits, price, is_active 
             FROM credit_packages 
             WHERE is_active = true 
             ORDER BY credits ASC`
        );

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching credit packages:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم",
        });
    }
});

/**
 * Submit payment proof for credit purchase
 * POST /api/credits/purchase
 * Requires file upload middleware
 */
export const requestCreditPurchaseController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { packageId, transactionId, transactionDate } = req.body;
    const paymentProof = req.file;

    if (!paymentProof) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
            message: "يرجى تحميل إثبات الدفع",
        });
    }

    if (!packageId) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
            message: "يرجى اختيار الباقة",
        });
    }

    try {
        // Get package details
        const packageResult = await pool.query(
            `SELECT * FROM credit_packages WHERE id = $1 AND is_active = true`,
            [packageId]
        );

        if (!packageResult.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({
                message: "الباقة غير موجودة",
            });
        }

        const selectedPackage = packageResult.rows[0];

        // Verify payment proof using OCR
        const verification = await verifyPaymentProof(
            paymentProof.buffer,
            parseFloat(selectedPackage.price)
        );

        // Store payment proof image (in production, upload to cloud storage like Cloudinary)
        // For now, we'll store as base64 in database (not recommended for production)
        const paymentProofUrl = `data:${paymentProof.mimetype};base64,${paymentProof.buffer.toString('base64')}`;

        // Create purchase request
        const purchaseResult = await pool.query(
            `INSERT INTO credit_purchase_requests (
                user_id, 
                package_id, 
                amount, 
                credits, 
                payment_proof_url,
                transaction_id,
                transaction_date,
                extracted_amount,
                extracted_recipient,
                extracted_transaction_id,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                userId,
                packageId,
                selectedPackage.price,
                selectedPackage.credits,
                paymentProofUrl,
                transactionId || null,
                transactionDate || null,
                verification.extracted?.amount || null,
                verification.extracted?.recipient || null,
                verification.extracted?.transactionId || null,
                verification.success ? 'approved' : (verification.requiresManualReview ? 'pending' : 'rejected')
            ]
        );

        const purchaseRequest = purchaseResult.rows[0];

        // If auto-approved, add credits immediately
        if (verification.success && !verification.requiresManualReview) {
            await approveInternalPurchase(purchaseRequest.id, userId);

            return res.status(HTTPSTATUS.CREATED).json({
                message: "تم شراء الرصيد بنجاح",
                status: "approved",
                purchaseRequest: purchaseRequest,
                verification: verification,
            });
        }

        // If requires manual review
        if (verification.requiresManualReview) {
            return res.status(HTTPSTATUS.CREATED).json({
                message: "تم استلام طلبك. يتطلب مراجعة يدوية",
                status: "pending",
                purchaseRequest: purchaseRequest,
                verification: verification,
            });
        }

        // If rejected
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
            message: verification.message || "فشل التحقق من إثبات الدفع",
            status: "rejected",
            purchaseRequest: purchaseRequest,
            verification: verification,
        });

    } catch (error) {
        console.error("Error processing credit purchase:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في معالجة الطلب",
        });
    }
});

/**
 * Get purchase history for logged-in user
 * GET /api/credits/history
 */
export const getPurchaseHistoryController = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT 
                cpr.id, 
                cpr.amount, 
                cpr.credits, 
                cpr.status,
                cpr.rejection_reason,
                cpr.created_at,
                cpr.verified_at,
                cp.name as package_name
             FROM credit_purchase_requests cpr
             JOIN credit_packages cp ON cpr.package_id = cp.id
             WHERE cpr.user_id = $1
             ORDER BY cpr.created_at DESC`,
            [userId]
        );

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching purchase history:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم",
        });
    }
});

/**
 * Get specific purchase request details
 * GET /api/credits/purchase/:id
 */
export const getPurchaseRequestController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const purchaseId = req.params.id;

    try {
        const result = await pool.query(
            `SELECT 
                cpr.*,
                cp.name as package_name,
                u.name as verified_by_name
             FROM credit_purchase_requests cpr
             JOIN credit_packages cp ON cpr.package_id = cp.id
             LEFT JOIN users u ON cpr.verified_by = u.id
             WHERE cpr.id = $1 AND cpr.user_id = $2`,
            [purchaseId, userId]
        );

        if (!result.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({
                message: "الطلب غير موجود",
            });
        }

        return res.status(HTTPSTATUS.OK).json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching purchase request:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم",
        });
    }
});

/**
 * Admin: Manually verify/approve a purchase request
 * PUT /api/credits/purchase/:id/verify
 * Requires admin role
 */
export const verifyCreditPurchaseController = asyncHandler(async (req, res) => {
    const adminId = req.user.id;
    const purchaseId = req.params.id;
    const { approved, rejectionReason } = req.body;

    // TODO: Add admin role check
    // if (req.user.role !== 'ADMIN') {
    //     return res.status(HTTPSTATUS.FORBIDDEN).json({ message: "غير مصرح" });
    // }

    try {
        // Get purchase request
        const purchaseResult = await pool.query(
            `SELECT * FROM credit_purchase_requests WHERE id = $1`,
            [purchaseId]
        );

        if (!purchaseResult.rows[0]) {
            return res.status(HTTPSTATUS.NOT_FOUND).json({
                message: "الطلب غير موجود",
            });
        }

        const purchaseRequest = purchaseResult.rows[0];

        if (purchaseRequest.status !== 'pending') {
            return res.status(HTTPSTATUS.BAD_REQUEST).json({
                message: "هذا الطلب تمت معالجته بالفعل",
            });
        }

        if (approved) {
            // Approve and add credits
            await approveInternalPurchase(purchaseId, adminId);

            return res.status(HTTPSTATUS.OK).json({
                message: "تم الموافقة على الطلب بنجاح",
            });
        } else {
            // Reject
            await pool.query(
                `UPDATE credit_purchase_requests 
                 SET status = 'rejected', 
                     rejection_reason = $1,
                     verified_by = $2,
                     verified_at = NOW()
                 WHERE id = $3`,
                [rejectionReason || 'غير محدد', adminId, purchaseId]
            );

            return res.status(HTTPSTATUS.OK).json({
                message: "تم رفض الطلب",
            });
        }
    } catch (error) {
        console.error("Error verifying purchase request:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم",
        });
    }
});

/**
 * Internal function to approve purchase and add credits
 * @param {string} purchaseId - Purchase request ID
 * @param {string} verifierId - ID of user who verified (admin or system)
 */
async function approveInternalPurchase(purchaseId, verifierId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get purchase request
        const purchaseResult = await client.query(
            `SELECT * FROM credit_purchase_requests WHERE id = $1`,
            [purchaseId]
        );
        const purchase = purchaseResult.rows[0];

        // Get current user credits
        const userResult = await client.query(
            `SELECT credits FROM users WHERE id = $1`,
            [purchase.user_id]
        );
        const currentCredits = userResult.rows[0].credits || 0;
        const newCredits = currentCredits + purchase.credits;

        // Update user credits
        await client.query(
            `UPDATE users SET credits = $1 WHERE id = $2`,
            [newCredits, purchase.user_id]
        );

        // Update purchase request status
        await client.query(
            `UPDATE credit_purchase_requests 
             SET status = 'approved', 
                 verified_by = $1,
                 verified_at = NOW()
             WHERE id = $2`,
            [verifierId, purchaseId]
        );

        // Record transaction
        await client.query(
            `INSERT INTO credit_transactions (
                user_id, 
                amount, 
                type, 
                reference_id, 
                description,
                balance_before,
                balance_after
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                purchase.user_id,
                purchase.credits,
                'purchase',
                purchaseId,
                `شراء ${purchase.credits} رصيد`,
                currentCredits,
                newCredits
            ]
        );

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Internal function to deduct credits (used when accepting requests)
 * @param {string} userId - User ID
 * @param {number} amount - Credits to deduct
 * @param {string} referenceId - Reference to service request
 * @returns {Promise<boolean>} Success status
 */
export const deductCredits = async (userId, amount, referenceId) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get current credits
        const userResult = await client.query(
            `SELECT credits FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );

        const currentCredits = userResult.rows[0]?.credits || 0;

        if (currentCredits < amount) {
            await client.query('ROLLBACK');
            return {
                success: false,
                message: 'رصيد غير كافٍ',
            };
        }

        const newCredits = currentCredits - amount;

        // Update user credits
        await client.query(
            `UPDATE users SET credits = $1 WHERE id = $2`,
            [newCredits, userId]
        );

        // Record transaction
        await client.query(
            `INSERT INTO credit_transactions (
                user_id, 
                amount, 
                type, 
                reference_id, 
                description,
                balance_before,
                balance_after
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                userId,
                -amount,
                'deduction',
                referenceId,
                `خصم ${amount} رصيد لقبول طلب`,
                currentCredits,
                newCredits
            ]
        );

        await client.query('COMMIT');

        return {
            success: true,
            newBalance: newCredits,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deducting credits:', error);
        return {
            success: false,
            message: 'خطأ في خصم الرصيد',
        };
    } finally {
        client.release();
    }
};

/**
 * Get credit transaction history
 * GET /api/credits/transactions
 */
export const getCreditTransactionsController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { type, limit = 50 } = req.query;

    try {
        let query = `
            SELECT 
                id,
                amount,
                type,
                description,
                balance_before,
                balance_after,
                created_at
            FROM credit_transactions
            WHERE user_id = $1
        `;
        const params = [userId];

        if (type) {
            query += ` AND type = $2`;
            params.push(type);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        return res.status(HTTPSTATUS.OK).json(result.rows);
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
            message: "خطأ في الخادم",
        });
    }
});
