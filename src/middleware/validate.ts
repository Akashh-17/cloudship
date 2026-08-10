import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../utils/AppError";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const parsedResult = schema.safeParse(req.body);

    if (!parsedResult.success) {
      // Create a readable error message from Zod issues
      const errorMessage = parsedResult.error.issues
        .map((err: any) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
        
      return next(new AppError(400, `Validation failed: ${errorMessage}`));
    }

    // Replace req.body with the sanitized and validated data
    req.body = parsedResult.data;
    next();
  };
