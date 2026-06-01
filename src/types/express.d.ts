import type { TokenPayload } from "../lib/access-token-service";

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload & { token: string };
    }
  }
}

export {};
