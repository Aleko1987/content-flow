const VIDEO_NAME_REGEX = /^hk(\d+)m(\d+)cta(\d+)([A-Za-z]+)?$/;

export type ParsedVideoFilename = {
  hookNumber: number;
  meatNumber: number;
  ctaNumber: number;
  variant: string | null;
};

export const normalizeVideoFilename = (value: string): string => {
  const trimmed = value.trim();
  const withoutPath = trimmed.split(/[\\/]/).pop() || trimmed;
  const withoutExtension = withoutPath.replace(/\.[A-Za-z0-9]+$/, '');
  return withoutExtension.replace(/^\d+-/, '');
};

export const parseVideoFilename = (value: string): ParsedVideoFilename | null => {
  const normalized = normalizeVideoFilename(value);
  const match = VIDEO_NAME_REGEX.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    hookNumber: Number(match[1]),
    meatNumber: Number(match[2]),
    ctaNumber: Number(match[3]),
    variant: match[4] || null,
  };
};
