import { pino, type Logger } from "pino";

// Never log tokens or keys. Redaction covers request logs; call sites must not log them either.
export function createLogger(level: string, name: string): Logger {
  return pino({
    name,
    level,
    redact: {
      paths: ["req.headers.authorization", 'req.headers["x-admin-token"]', "token", "*.token", "apiKey"],
      censor: "[redacted]",
    },
  });
}
