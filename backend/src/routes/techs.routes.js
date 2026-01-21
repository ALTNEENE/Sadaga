import Router from 'express'
import { getAllTechsController, getTechsByProfssionController } from '../controllers/techs.controllers.js'

const routes = Router()

routes.get("/", getAllTechsController)
routes.get("/:profession", getTechsByProfssionController)
// routes.post("/add")
// routes.post("/request")

export default routes
