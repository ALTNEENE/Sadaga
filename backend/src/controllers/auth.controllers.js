import pool from "../config/db.config.js";
import { HTTPSTATUS } from "../config/http.config.js";
import { compare, generateToken, hashPassword, setCookie } from "../lib/utils.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import Customer from '../models/customer.model.js'

export const loginController = asyncHandler(
    async (req, res) => {
        const { email, password } = req.body
        console.log(email, password)
        try {

            if (!email || !password) {
                return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Enter all the fileds" })
            }

            // const customer = await Customer.findOne({email})

            const customer = await pool.query(
                `SELECT * FROM users WHERE email = $1`,
                [email]
            )

            if (!customer.rows[0]) return res.status(HTTPSTATUS.NOT_FOUND).json({ message: "No customer found." })

            // const isMatched = customer?.comparePassword(password)

            const isMatched = await compare(password, customer.rows[0].password_hash)

            if (!isMatched) return res.status(HTTPSTATUS.FORBIDDEN).json({ message: "Invalid password" })

            // customer.lastLogin = new Date()

            customer.rows[0].lastLogin = new Date()

            const accessToken = await generateToken(customer.rows[0])

            setCookie(res, accessToken)

            return res.status(HTTPSTATUS.OK).json({ token: accessToken, customer: customer.rows[0] })

        } catch (error) {
            console.log(error)
            return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
                message: "Internal server error"
            })
        }

    }
)

export const registerController = asyncHandler(
    async (req, res) => {
        console.log(req.body)
        const { name, email, phone, profession, password, latitude, longitude } = req.body

        let role = req.body.userType

        if (!profession) {
            role = 'USER'
        } else {
            role = 'TECHNICIAN'
        }
        try {

            if (!name || !email || !phone || !password) {
                return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Enter all the fileds" })
            }

            const existing = await pool.query(
                `SELECT * FROM users WHERE email = $1`,
                [email]
            )

            console.log(role)

            if (existing.rows[0]) return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Email already exist" })

            const hashedPassword = await hashPassword(password)

            // For technicians, store location if provided
            let newCustomer;
            if (role === 'TECHNICIAN' && latitude && longitude) {
                newCustomer = await pool.query(
                    `INSERT INTO users (name, email, phone, profession, role, password_hash, location, longitude, latitude, rating)
                     VALUES ($1, $2, $3, $4, $5, $6, ST_MakePoint($7, $8)::geography, $9, $10, 0.00)
                     RETURNING *`,
                    [name, email, phone, profession, role, hashedPassword, longitude, latitude, Number(longitude), Number(latitude)]
                )
                console.log(`✅ Technician registered with initial location: (${latitude}, ${longitude})`);
            } else {
                newCustomer = await pool.query(
                    `INSERT INTO users (name, email, phone, profession, role, password_hash, rating)
                     VALUES ($1, $2, $3, $4, $5, $6, 0.00)
                     RETURNING *`,
                    [name, email, phone, profession, role, hashedPassword]
                )
            }

            if (!newCustomer.rows[0]) return res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "User not created" })

            return res.status(HTTPSTATUS.CREATED).json({
                message: "User created successfully.",
                user: {
                    id: newCustomer.rows[0].id,
                    name: newCustomer.rows[0].name,
                    email: newCustomer.rows[0].email,
                    role: newCustomer.rows[0].role
                }
            })

        } catch (error) {
            console.log(error)
            return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
                message: "Internal server error"
            })
        }

    }
)

export const meController = asyncHandler(async (req, res) => {
    // req.user is set by auth middleware
    return res.status(HTTPSTATUS.OK).json(req.user);
})

