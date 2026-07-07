import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/db.js";

// Extend Express Request to carry user
declare global {
  namespace Express {
    interface Request {
      user?: { id: number; username: string };
    }
  }
}

export const authenticate = async (
  req:  Request,
  res:  Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.jwt;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No Token Provided" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      return res.status(401).json({ message: "Unauthorized - Invalid Token" });
    }

    const user = await prisma.user.findUnique({
      where:  { id: decoded.sub },
      select: { id: true, username: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};