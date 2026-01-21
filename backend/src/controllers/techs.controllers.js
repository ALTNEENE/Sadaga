import pool from "../config/db.config.js";
import { HTTPSTATUS } from "../config/http.config.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import Customer from "../models/customer.model.js";

export const getTechsByProfssionController = asyncHandler(
    async (req, res) => {
        const { profession } = req.params
        try {
            const techs = await pool.query(
                `SELECT * FROM users WHERE profession = $1`,
                [profession]
            )

            if (!techs) {
                return res.status(HTTPSTATUS.NOT_FOUND).json({
                    message: "لايوجد فنيين لهذا المجال"
                })
            }


            return res.status(HTTPSTATUS.OK).json({
                message: "تم تحميل الفنيين",
                techs: techs.rows
            })


        } catch (error) {
            console.log(error)
            return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
                message: "حدث خطأ في الخادم"
            })
        }
    }
)

export const getAllTechsController = asyncHandler(
    async (req, res) => {
        try {
            const techs = await pool.query(
                `SELECT * FROM users WHERE role = 'TECHNICIAN'`
            )

            if (!techs) {
                return res.status(HTTPSTATUS.NOT_FOUND).json({
                    message: "لايوجد فنيين لهذا المجال"
                })
            }

            return res.status(HTTPSTATUS.OK).json({
                message: "تم تحميل الفنيين",
                techs
            })
        } catch (error) {
            console.log(error)
            return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
                message: "حدث خطأ في الخادم"
            })
        }
    }
)

export const nearbyTechsController = asyncHandler(
    async (req, res) => {
        try {
            const { lat, lng } = req.params

            if (!lat || !lng) {
                return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "lat and lng are required" })
            }

            const { rows } = await pool.query(
                `
            SELECT u.id, u.name, u.profession
            FROM users u
            JOIN technician_status ts ON ts.technician_id = u.id
            WHERE u.role = 'TECHNICIAN'
            AND ts.is_online = true
            AND u.location IS NOT NULL
            AND ST_DWithin(
                u.location,
                ST_MakePoint($1, $2)::geography,
                5000
            )
        `,
                [lng, lat]
            )

            return res.status(HTTPSTATUS.OK).json({
                message: "تم تحميل الفنيين",
                techs: rows
            })
        } catch (error) {
            console.error(error)
            return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
                message: "حدث خطأ في الخادم"
            })
        }
    }
)

