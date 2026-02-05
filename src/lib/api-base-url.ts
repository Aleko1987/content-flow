const getEnvApiBaseUrl = (): string | undefined => {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  return envBaseUrl ? String(envBaseUrl).trim() || undefined : undefined;
};

export const getApiBaseUrl = (): string => {
  const envBaseUrl = getEnvApiBaseUrl();
  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // Fallback for non-browser contexts
  return 'https://content-flow-ouru.onrender.com';
};

