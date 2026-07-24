import { Request, Response } from "express";
import crypto                from "crypto";
import { razorpay }          from "../lib/razorpay.js";
import { prisma }            from "../lib/db.js";
import { store }             from "../lib/store.js";

// INR to USD conversion rate (in production fetch from live API)
const INR_TO_USD = 0.012;

// POST /api/payments/create-order
export const createOrder = async (req: Request, res: Response) => {
  const { amount } = req.body; // amount in INR
  const userId = req.user!.id;

  try {
    if (!amount || amount < 100) {
      return res.status(400).json({ message: "Minimum deposit is ₹100" });
    }

    // create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount:   amount * 100, // Razorpay expects paise (1 INR = 100 paise)
      currency: "INR",
      receipt:  `receipt_${userId}_${Date.now()}`,
    });

    // save payment record in DB with PENDING status
    await prisma.payment.create({
      data: {
        userId,
        razorpayOrderId: razorpayOrder.id,
        amount,
        currency:        "INR",
        status:          "PENDING",
        asset:           "USD",
      },
    });

    res.status(201).json({
      orderId:  razorpayOrder.id,
      amount,
      currency: "INR",
      keyId:    process.env.RAZORPAY_KEY_ID,
    });
  } catch (error: any) {
    console.log("Error in createOrder controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/payments/verify
// called from frontend after user completes payment
export const verifyPayment = async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const userId = req.user!.id;

  try {
    // verify signature — this is the security check
    // signature = HMAC-SHA256(order_id + "|" + payment_id, secret)
    const body      = razorpay_order_id + "|" + razorpay_payment_id;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    // find the pending payment
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: razorpay_order_id },
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    if (payment.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (payment.status === "COMPLETED") {
      return res.status(400).json({ message: "Payment already processed" });
    }

    // convert INR to USD
    const usdAmount = Number(payment.amount) * INR_TO_USD;

    // update payment status in DB
    await prisma.payment.update({
      where: { razorpayOrderId: razorpay_order_id },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        status:            "COMPLETED",
      },
    });

    // credit USD balance in DB
    await prisma.balance.upsert({
      where:  { userId_asset: { userId, asset: "USD" } },
      update: { available: { increment: usdAmount } },
      create: { userId, asset: "USD", available: usdAmount, locked: 0 },
    });

    // credit USD balance in RAM
    store.initUserBalance(userId, "USD", 0);
    const bal = store.getBalance(userId, "USD");
    bal.available += usdAmount;

    res.status(200).json({
      message:   "Payment successful",
      usdCredited: usdAmount,
      balance:   store.getBalance(userId, "USD"),
    });
  } catch (error: any) {
    console.log("Error in verifyPayment controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/payments/webhook
// Razorpay calls this directly — backup in case frontend verify fails
export const webhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;

    // verify webhook signature
    const body     = JSON.stringify(req.body);
    const expected = crypto
      .createHmac("sha256", process.env.WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = req.body.event;

    // only handle successful payments
    if (event === "payment.captured") {
      const paymentData   = req.body.payload.payment.entity;
      const razorpayOrderId = paymentData.order_id;
      const razorpayPaymentId = paymentData.id;

      // find the payment
      const payment = await prisma.payment.findUnique({
        where: { razorpayOrderId },
      });

      if (!payment || payment.status === "COMPLETED") {
        return res.status(200).json({ message: "Already processed" });
      }

      // convert INR to USD
      const usdAmount = Number(payment.amount) * INR_TO_USD;

      // update payment
      await prisma.payment.update({
        where: { razorpayOrderId },
        data:  { razorpayPaymentId, status: "COMPLETED" },
      });

      // credit balance in DB
      await prisma.balance.upsert({
        where:  { userId_asset: { userId: payment.userId, asset: "USD" } },
        update: { available: { increment: usdAmount } },
        create: { userId: payment.userId, asset: "USD", available: usdAmount, locked: 0 },
      });

      // credit balance in RAM
      store.initUserBalance(payment.userId, "USD", 0);
      const bal = store.getBalance(payment.userId, "USD");
      bal.available += usdAmount;

      console.log(`✅ Payment credited: $${usdAmount} USD to user ${payment.userId}`);
    }

    if (event === "payment.failed") {
      const paymentData     = req.body.payload.payment.entity;
      const razorpayOrderId = paymentData.order_id;

      await prisma.payment.update({
        where: { razorpayOrderId },
        data:  { status: "FAILED" },
      });

      console.log(`❌ Payment failed for order ${razorpayOrderId}`);
    }

    res.status(200).json({ message: "Webhook processed" });
  } catch (error: any) {
    console.log("Error in webhook controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/payments/history
export const getPaymentHistory = async (req: Request, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      where:   { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take:    20,
    });
    res.status(200).json(payments);
  } catch (error: any) {
    console.log("Error in getPaymentHistory controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};