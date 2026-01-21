import pool from '../config/db.config.js'
import { asyncHandler } from '../middlewares/asyncHandler.middleware.js'

export const requestService = asyncHandler(
    async (req, res) => {
        try {
            const { service, address, latitude, longitude } = req.body

            if (!service || !address || !latitude || !longitude) {
                return res.status(HTTPSTATUS.BAD_REQUEST).json({
                    message: "الرجاء ادخال جميع البيانات"
                })
            }

            const user = await pool.query(
                `SELECT * FROM users WHERE id = $1`,
                [req.user.id]
            )

            if (!user.rows.length) {
                return res.status(HTTPSTATUS.NOT_FOUND).json({
                    message: "المستخدم غير موجود"
                })
            }

            const serviceRes = await pool.query(
                `SELECT * FROM services WHERE name = $1`,
                [service]
            )

            if (!serviceRes.rows.length) {
                return res.status(HTTPSTATUS.NOT_FOUND).json({
                    message: "الخدمة غير موجودة"
                })
            }

            const serviceId = service.rows[0].id

            const serviceRequest = await pool.query(
                `INSERT INTO service_requests (user_id, service_id, address, latitude, longitude) VALUES ($1, $2, $3, $4, $5)`,
                [user.rows[0].id, serviceId, address, latitude, longitude]
            )

            return res.status(HTTPSTATUS.OK).json({
                message: "تم طلب الخدمة بنجاح"
            })
        } catch (error) {

        }
    }
)