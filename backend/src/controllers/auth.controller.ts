import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { store } from "../lib/store.js";

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  const { username, password,email } = req.body;

  try {
    if (!username || !password || !email) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] }
    });
    if (existing?.username === username) {
      return res.status(400).json({ message: "Username already taken" });
    }
    if (existing?.email === email) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const salt         = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: { username, password: passwordHash, email },
    });

    // Seed $1500 USD starting balance
    await prisma.balance.create({
      data: { userId: user.id, asset: "USD", available: 1500, locked: 0 },
    });
    store.initUserBalance(user.id, "USD", 1500);

    res.status(201).json({
      message: "Registered successfully",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error: any) {
    console.log("Error in register controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  const { password, email } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.cookie("jwt", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      message: "Login successful",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error: any) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/auth/logout
export const logout = (_req: Request, res: Response) => {
  res.clearCookie("jwt", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ message: "Logged out successfully" });
};

// GET /api/auth/me
export const getMe = (req: Request, res: Response) => {
  res.status(200).json({ user: req.user });
};