import { Router }          from "express";
import { createOrder, verifyPayment, webhook, getPaymentHistory } from "../controllers/payment.controller.js";
import { authenticate }    from "../middlewares/auth.js";

const router = Router();

router.post("/webhook", webhook);

router.use(authenticate);

router.post("/create-order",  createOrder);
router.post("/verify",        verifyPayment);
router.get("/history",        getPaymentHistory);

export default router;