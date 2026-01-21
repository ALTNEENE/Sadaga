import { Router } from "express";

const router = Router()

router.get("/", getAllUsersController)
router.get("/:id", getUserByIdController)
router.put("/:id", updateUserController)
router.delete("/:id", deleteUserController)

export default router