import type { Request, Response, NextFunction } from 'express';

export interface ApiError {
  error: string;
  details?: unknown;
}

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  if ('error' in err) {
    return res.status(400).json(err);
  }

  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};


