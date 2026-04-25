import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface ApiError {
  error: string;
  details?: unknown;
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  if (err instanceof Error && err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Invalid request payload',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }

  if (err && typeof err === 'object' && 'error' in err) {
    return res.status(400).json(err);
  }

  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : undefined,
  });
};

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown> | unknown;

export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
