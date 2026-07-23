export type AppId = 'client' | 'admin';

export const BRAND_NAME = 'Linda';

/**
 * The two consoles are deployed to separate origins. Each build needs the
 * other's URL so a user who signs in at the wrong one can be sent across
 * instead of hitting a dead end.
 */
export const APP_URLS: Record<AppId, string> = {
  client: import.meta.env.VITE_CLIENT_URL ?? 'https://client.linda.co.tz',
  admin: import.meta.env.VITE_ADMIN_URL ?? 'https://admin.linda.co.tz',
};

export const APP_LABELS: Record<AppId, string> = {
  client: `${BRAND_NAME} — Seller console`,
  admin: `${BRAND_NAME} — Admin console`,
};
