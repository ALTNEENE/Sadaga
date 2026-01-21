import jwt from "jsonwebtoken";
import { HTTPSTATUS } from "../config/http.config.js";
import { asyncHandler } from "./asyncHandler.middleware.js";
import pool from "../config/db.config.js";

// Auth middleware to protect routes and attach the authenticated user to req.user
export const requireAuth = asyncHandler(async (req, res, next) => {
  // Read token from Authorization header or cookie
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  const token = req.cookies?.token || bearerToken;

  if (!token) {
    return res
      .status(HTTPSTATUS.UNAUTHORIZED)
      .json({ message: "Unauthorized - No token provided" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await pool.query(
      `SELECT * FROM users WHERE id = $1`,
      [payload.id]
    );

    if (!user.rows[0]) {
      return res
        .status(HTTPSTATUS.UNAUTHORIZED)
        .json({ message: "Unauthorized - User not found" });
    }

    req.user = user.rows[0];
    req.token = token;
    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res
      .status(HTTPSTATUS.UNAUTHORIZED)
      .json({ message: "Unauthorized - Invalid token" });
  }
});

// Optional alias if you prefer this name elsewhere
export const AuthMiddleware = requireAuth;


