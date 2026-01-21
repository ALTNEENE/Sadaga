import { Server } from "socket.io"
import jwt from "jsonwebtoken"
import pool from "../config/db.config.js"
import Redis from "ioredis"
import { createNotification } from "../controllers/notifications.controllers.js"

const redis = new Redis(process.env.REDIS_URL)

// Store connected technician sockets by ID
const technicianSockets = new Map()
// Store auto-rejection timers by request ID
const autoRejectionTimers = new Map()
let io;

export function initSocket(server) {
  console.log("Initializing Socket.IO server")
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  })

  console.log("Socket.IO server initialized")

  // 🔐 Socket Auth
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token
      const user = jwt.verify(token, process.env.JWT_SECRET)
      socket.user = user
      console.log("Socket.IO server authorized")
      console.log("User: ", user)
      next()
    } catch {
      // next(new Error("Unauthorized"))
      throw new Error("Unauthorized")
    }
  })


  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.user.id)

    if (socket.user.role === "TECHNICIAN") {
      handleTechnician(socket, io)
    }

    socket.on("request:join", ({ requestId }) => {
      socket.join(`request:${requestId}`)
      console.log(`User ${socket.user.id} joined request room ${requestId}`)
    })

    // Handle chat messages
    socket.on("request:message:send", async ({ requestId, message }) => {
      try {
        // Verify user is part of this request
        const { rows } = await pool.query(
          `SELECT * FROM service_requests 
           WHERE id = $1 AND (user_id = $2 OR technician_id = $2)`,
          [requestId, socket.user.id]
        )

        if (!rows[0]) {
          socket.emit("error", { message: "غير مصرح" })
          return
        }

        // Store message in database
        const result = await pool.query(
          `INSERT INTO request_messages (request_id, sender_id, message)
           VALUES ($1, $2, $3)
           RETURNING id, request_id, sender_id, message, created_at`,
          [requestId, socket.user.id, message]
        )

        const savedMessage = result.rows[0]

        // Get sender info
        const senderInfo = await pool.query(
          `SELECT name, role FROM users WHERE id = $1`,
          [socket.user.id]
        )

        // Broadcast message to all participants in the request room
        io.to(`request:${requestId}`).emit("request:message:received", {
          ...savedMessage,
          senderName: senderInfo.rows[0].name,
          senderRole: senderInfo.rows[0].role
        })

        console.log(`Message sent in request ${requestId} by ${socket.user.id}`)
      } catch (error) {
        console.error("Error sending message:", error)
        socket.emit("error", { message: "فشل في إرسال الرسالة" })
      }
    })

    // Handle request rejection
    socket.on("request:reject", async ({ requestId, reason }) => {
      try {
        const { rows } = await pool.query(
          `UPDATE service_requests
           SET status = 'cancelled', rejection_reason = $3
           WHERE id = $1 AND technician_id = $2
           RETURNING *`,
          [requestId, socket.user.id, reason || null]
        )

        const request = rows[0]
        if (!request) {
          socket.emit("error", { message: "الطلب غير موجود" })
          return
        }

        // Clear auto-rejection timer if exists
        if (autoRejectionTimers.has(requestId)) {
          clearTimeout(autoRejectionTimers.get(requestId))
          autoRejectionTimers.delete(requestId)
          console.log(`Cleared auto-rejection timer for request ${requestId}`)
        }

        // Notify all participants
        io.to(`request:${requestId}`).emit("request:status:update", {
          requestId,
          status: 'cancelled',
          rejectionReason: reason
        })

        // Leave the room
        socket.leave(`request:${requestId}`)
        console.log(`Request ${requestId} rejected by technician ${socket.user.id}`)
      } catch (error) {
        console.error("Error rejecting request:", error)
        socket.emit("error", { message: "فشل في رفض الطلب" })
      }
    })

    socket.on("request:accept", async ({ requestId }) => {
      try {
        const { rows } = await pool.query(
          `UPDATE service_requests
           SET status = 'accepted', accepted_at = NOW()
           WHERE id = $1 AND technician_id = $2
           RETURNING *`,
          [requestId, socket.user.id]
        );

        const request = rows[0];
        if (!request) {
          socket.emit("error", { message: "الطلب غير موجود" })
          return
        }

        // Clear auto-rejection timer
        if (autoRejectionTimers.has(requestId)) {
          clearTimeout(autoRejectionTimers.get(requestId))
          autoRejectionTimers.delete(requestId)
          console.log(`Cleared auto-rejection timer for request ${requestId}`)
        }

        socket.activeRequest = requestId;
        socket.join(`request:${requestId}`);

        // Notify all participants
        io.to(`request:${requestId}`).emit("request:status:update", {
          requestId,
          status: 'accepted',
        });

        console.log(`Request ${requestId} accepted by technician ${socket.user.id}`)
      } catch (err) {
        console.error("Error accepting request:", err)
        socket.emit("error", { message: "فشل في قبول الطلب" });
      }
    });

    socket.on("request:start", async ({ requestId }) => {
      try {
        await pool.query(
          `UPDATE service_requests
           SET status = 'on_the_way'
           WHERE id = $1 AND technician_id = $2`,
          [requestId, socket.user.id]
        );

        io.to(`request:${requestId}`).emit("request:status:update", {
          requestId,
          status: 'on_the_way',
        });

        console.log(`Request ${requestId} status updated to on_the_way`)
      } catch (error) {
        console.error("Error starting request:", error)
      }
    });

    // Handle request completion
    // socket.on("request:complete", async ({ requestId }) => {
    //   try {
    //     await pool.query(
    //       `UPDATE service_requests 
    //        SET status = 'completed', completed_at = NOW()
    //        WHERE id = $1`,
    //       [requestId]
    //     )

    //     io.to(`request:${requestId}`).emit("request:status:update", {
    //       requestId,
    //       status: 'completed'
    //     })

    //     console.log(`Request ${requestId} completed`)
    //   } catch (error) {
    //     console.error("Error completing request:", error)
    //   }
    // })

    socket.on("request:complete", async ({ requestId }) => {
      await pool.query(
        `
    UPDATE service_requests
    SET status = 'completed', completed_at = NOW()
    WHERE id = $1 AND technician_id = $2
    `,
        [requestId, socket.user.id]
      );

      io.to(`request:${requestId}`).emit("request:status:update", {
        requestId,
        status: 'completed',
      });

      socket.leave(`request:${requestId}`);
      socket.activeRequest = null;
    });


    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", socket.user.id)

      if (socket.user.role === "TECHNICIAN") {
        try {
          // Check if technician has an active request
          if (socket.activeRequest) {
            const { rows } = await pool.query(
              `SELECT status FROM service_requests WHERE id = $1`,
              [socket.activeRequest]
            )

            if (rows[0] && (rows[0].status === 'accepted' || rows[0].status === 'on_the_way')) {
              // Notify client that technician went offline
              io.to(`request:${socket.activeRequest}`).emit("tech:offline", {
                requestId: socket.activeRequest,
                technicianId: socket.user.id
              })
              console.log(`Technician ${socket.user.id} went offline during active request ${socket.activeRequest}`)
            }
          }

          // Update database
          await pool.query(
            `UPDATE technician_status
             SET is_online = false
             WHERE technician_id = $1`,
            [socket.user.id]
          )

          // Broadcast technician is now offline
          io.emit("tech:status:update", {
            techId: socket.user.id,
            isOnline: false
          })

          // Clean up Redis location data
          await redis.del(`tech:${socket.user.id}`)

          console.log(`Technician ${socket.user.id} went offline`)
        } catch (error) {
          console.error("Error handling technician disconnect:", error)
        }
      }
    })
  })

  // 🔄 Redis → PostgreSQL sync
  setInterval(async () => {
    const keys = await redis.keys("tech:*")

    for (const key of keys) {
      const techId = key.split(":")[1]
      const { lat, lng } = JSON.parse(await redis.get(key))
      await pool.query(
        `UPDATE users
         SET location = ST_MakePoint($1, $2)::geography, latitude = $2, longitude = $1
         WHERE id = $3`,
        [lng, lat, techId]
      )
      console.log("Location Updated and Async")
    }
  }, 30000)
}

// -------------------------

async function handleTechnician(socket, io) {
  const techId = socket.user.id
  const techName = socket.user.name

  // Track this technician's socket
  technicianSockets.set(techId, socket.id)

  try {
    await pool.query(
      `INSERT INTO technician_status (technician_id, is_online, socket_id)
       VALUES ($1, true, $2)
       ON CONFLICT (technician_id)
       DO UPDATE SET is_online = true, socket_id = $2`,
      [techId, socket.id]
    )

    // Broadcast that technician is now online
    io.emit("tech:status:update", {
      techId,
      isOnline: true
    })

    console.log(`Technician ${techId} is now online`)
  } catch (error) {
    console.error("Error setting technician online:", error)
  }

  // Listen for location updates from technician
  socket.on("location:update", async ({ lat, lng }) => {
    try {
      // Validate location data
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.error(`Invalid location data type from technician ${techId}`);
        return;
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.error(`Invalid location bounds from technician ${techId}: lat=${lat}, lng=${lng}`);
        return;
      }

      // Cache in Redis with 15 second expiration
      await redis.set(
        `tech:${techId}`,
        JSON.stringify({ lat, lng }),
        "EX",
        15
      )

      // Broadcast location to all clients watching this tech
      io.emit("tech:location:update", {
        id: techId,
        name: techName,
        lat,
        lng
      })

      // Also send to active request room if exists
      if (socket.activeRequest) {
        socket.to(`request:${socket.activeRequest}`)
          .emit("tech:location", { lat, lng })
      }
    } catch (error) {
      console.error("Error updating technician location:", error)
    }
  })

  socket.on("request:join", ({ requestId }) => {
    socket.activeRequest = requestId
    socket.join(`request:${requestId}`)
  })

  // Clean up on disconnect
  socket.on("disconnect", () => {
    technicianSockets.delete(techId)
  })
}

// Export function to notify a technician of a new request
export async function notifyTechnicianOfNewRequest(technicianId, request, clientName) {
  try {
    if (!io) {
      console.error("Socket.io not initialized");
      return null;
    }
    // Create notification in database
    const notification = await createNotification({
      userId: technicianId,
      title: "طلب خدمة جديد",
      body: `لديك طلب خدمة ${request.service_type} جديد من ${clientName}`
    })

    // Get technician's socket ID
    const socketId = technicianSockets.get(technicianId)

    if (socketId && notification) {
      // Send real-time notification
      io.to(socketId).emit("notification:new", notification)
    }

    // Start auto-rejection timer (10 minutes)
    startAutoRejectionTimer(request.id)

    return notification
  } catch (error) {
    console.error("Error notifying technician:", error)
    return null
  }
}

// Start auto-rejection timer for a request (10 minutes)
function startAutoRejectionTimer(requestId) {
  const AUTO_REJECT_DELAY = 10 * 60 * 1000; // 10 minutes in milliseconds

  // Clear existing timer if any
  if (autoRejectionTimers.has(requestId)) {
    clearTimeout(autoRejectionTimers.get(requestId))
  }

  // Create new timer
  const timer = setTimeout(async () => {
    try {
      // Update request status to cancelled
      const { rows } = await pool.query(
        `UPDATE service_requests
         SET status = 'cancelled', rejection_reason = 'تم الرفض التلقائي بسبب انتهاء الوقت'
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [requestId]
      )

      if (rows[0]) {
        // Notify all participants in the request room
        io.to(`request:${requestId}`).emit("request:status:update", {
          requestId,
          status: 'cancelled',
          rejectionReason: 'تم الرفض التلقائي بسبب انتهاء الوقت',
          autoRejected: true
        })

        console.log(`Request ${requestId} auto-rejected after 10 minutes`)
      }

      // Remove timer from map
      autoRejectionTimers.delete(requestId)
    } catch (error) {
      console.error(`Error auto-rejecting request ${requestId}:`, error)
    }
  }, AUTO_REJECT_DELAY)

  // Store timer reference
  autoRejectionTimers.set(requestId, timer)
  console.log(`Auto-rejection timer started for request ${requestId} (10 minutes)`)
}
