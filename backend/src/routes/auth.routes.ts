import { Router } from "express";
import { register, login, logout, getMe } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login",    login);
router.post("/logout",   logout);
router.get("/me",        authenticate, getMe);

export default router;