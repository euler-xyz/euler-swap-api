import type { Request } from "express"
import { rateLimit } from "express-rate-limit"
import { EXAMPLE_API_KEY } from "../constants"

const rateLimiter = rateLimit({
  legacyHeaders: true,
  limit: (req: Request) =>
    req.headers["x-api-key"] === EXAMPLE_API_KEY
      ? 1
      : Number(process.env.COMMON_RATE_LIMIT_MAX_REQUESTS || 20),
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  windowMs: Number(process.env.COMMON_RATE_LIMIT_WINDOW_MS || 1000),
  keyGenerator: (req: Request) => req.headers["x-api-key"] as string,
})

export default rateLimiter
