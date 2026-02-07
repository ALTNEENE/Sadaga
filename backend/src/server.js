import express from 'express'
import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import http from 'http'

import authRoutes from './routes/auth.routes.js'
import servicesRoutes from './routes/services.routes.js'
import techRoutes from './routes/techs.routes.js'
import profileRoutes from './routes/profile.routes.js'
import requestsRoutes from './routes/requests.routes.js'
import notificationsRoutes from './routes/notifications.routes.js'
import migrationRoutes from './routes/migration.routes.js'
import creditsRoutes from './routes/credits.routes.js'

import pool from './config/db.config.js'
import { initSocket } from './socket/index.js'
import { AuthMiddleware } from './middlewares/auth.middleware.js'

const BASE_URL = process.env.BASE_URL || "/api"

const app = express()
const server = http.createServer(app) // 👈 REQUIRED for Socket.IO

app.use(express.json({ limit: "5mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}))

// Health check
app.get(`${BASE_URL}/`, (req, res) => {
    res.send("Server is running")
})

// Routes
app.use(`${BASE_URL}/auth`, authRoutes)
app.use(`${BASE_URL}/services`, servicesRoutes)
app.use(`${BASE_URL}/techs`, techRoutes)
app.use(`${BASE_URL}/profile`, AuthMiddleware, profileRoutes)
app.use(`${BASE_URL}/requests`, AuthMiddleware, requestsRoutes)
app.use(`${BASE_URL}/notifications`, AuthMiddleware, notificationsRoutes)
app.use(`${BASE_URL}/credits`, creditsRoutes)
app.use(`${BASE_URL}/migrations`, migrationRoutes)

// 🔌 Init Socket.IO
initSocket(server)

// Start server
const PORT = process.env.PORT || 5000

server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`)

    // Test DB connection
    const result = await pool.query("SELECT PostGIS_Version()")
    console.log("Connected to Neon:", result.rows[0])
})
