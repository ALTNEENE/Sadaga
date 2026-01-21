import { Router } from "express";
import { loginController, registerController, meController } from "../controllers/auth.controllers.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const routes = Router()

routes.post("/login", loginController)
routes.post("/register", registerController)
routes.get("/me", requireAuth, meController)

export default routes