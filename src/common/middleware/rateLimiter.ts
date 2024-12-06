import type { Request } from "express"
import { rateLimit } from "express-rate-limit"

const rateLimiter = rateLimit({
  legacyHeaders: true,
  limit: Number(process.env.COMMON_RATE_LIMIT_MAX_REQUESTS || 20),
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  windowMs: Number(process.env.COMMON_RATE_LIMIT_WINDOW_MS || 1000),
  keyGenerator: (req: Request) => req.ip as string,
})

export default rateLimiter
