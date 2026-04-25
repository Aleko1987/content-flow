type ThrottleKey = `${string}:${string}`;

type ThrottleState = {
  windowStartMs: number;
  count: number;
};

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export class InMemoryPlatformActionThrottle {
  private readonly state = new Map<ThrottleKey, ThrottleState>();
  private readonly windowMs: number;
  private readonly maxPerWindow: number;

  constructor(params?: { windowMs?: number; maxPerWindow?: number }) {
    this.windowMs = Math.max(1_000, params?.windowMs ?? Number(process.env.DO_SOCIALS_THROTTLE_WINDOW_MS || 60_000));
    this.maxPerWindow = Math.max(1, params?.maxPerWindow ?? Number(process.env.DO_SOCIALS_THROTTLE_MAX_PER_WINDOW || 30));
  }

  allow(platform: string, actionType: string): ThrottleDecision {
    const now = Date.now();
    const key: ThrottleKey = `${platform}:${actionType}`;
    const existing = this.state.get(key);

    if (!existing || now - existing.windowStartMs >= this.windowMs) {
      this.state.set(key, { windowStartMs: now, count: 1 });
      return { allowed: true };
    }

    if (existing.count >= this.maxPerWindow) {
      const remainingMs = Math.max(0, this.windowMs - (now - existing.windowStartMs));
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }

    existing.count += 1;
    this.state.set(key, existing);
    return { allowed: true };
  }
}

export const socialsThrottle = new InMemoryPlatformActionThrottle();
