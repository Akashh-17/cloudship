import { User as CloudshipUser } from "./user";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends CloudshipUser {}
  }
}

export {};
