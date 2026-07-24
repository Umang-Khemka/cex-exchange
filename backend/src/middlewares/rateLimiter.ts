import rateLimit from "express-rate-limit";

// all routes — 100 requests per 15 min
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { message: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders:   false,
});

// auth routes — 10 attempts per 15 min
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { message: "Too many auth attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders:   false,
});

// order placement — 10 orders per second
export const orderLimiter = rateLimit({
  windowMs: 1000,
  max:      10,
  message:  { message: "Order rate limit exceeded, slow down" },
  standardHeaders: true,
  legacyHeaders:   false,
});

// deposit — 5 per hour
export const depositLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      5,
  message:  { message: "Too many deposit attempts, try again later" },
  standardHeaders: true,
  legacyHeaders:   false,
});