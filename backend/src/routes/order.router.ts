import { Router } from "express";
import { placeOrder, cancelOrder, getOrders, getFills, getBalance,deposit } from "../controllers/order.controller.js";
import { authenticate } from "../middlewares/auth.js";

const router = Router();
router.use(authenticate); // all order routes are protected

router.post  ("/",        placeOrder);
router.delete("/:id",     cancelOrder);
router.get   ("/",        getOrders);
router.get   ("/fills",   getFills);
router.get   ("/balance", getBalance);
router.post  ("/deposit", deposit);

export default router;