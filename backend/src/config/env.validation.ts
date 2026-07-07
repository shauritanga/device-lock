import { z } from 'zod';

/**
 * Single source of truth for environment variables. The app refuses to boot
 * with an invalid/incomplete environment, so misconfiguration fails fast.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  // Non-superuser RLS connection — used by the tenant-isolation test/hardening.
  RLS_DATABASE_URL: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  REDIS_URL: z.string().optional(),

  // ClickPesa (mobile money)
  CLICKPESA_BASE_URL: z
    .string()
    .url()
    .default('https://api.clickpesa.com/third-parties'),
  CLICKPESA_CLIENT_ID: z.string().optional(),
  CLICKPESA_API_KEY: z.string().optional(),
  CLICKPESA_CHECKSUM_KEY: z.string().optional(),

  // Beem (SMS)
  BEEM_SEND_URL: z.string().url().default('https://apisms.beem.africa/v1/send'),
  BEEM_API_KEY: z.string().optional(),
  BEEM_SECRET_KEY: z.string().optional(),
  BEEM_SENDER_ID: z.string().default('INFO'),

  // Zero-touch / QR provisioning of the DPC agent.
  // Public base URL of THIS backend, used to build the APK download link the
  // setup wizard fetches (must be reachable by a factory-fresh device).
  PUBLIC_BASE_URL: z.string().optional(),
  // The DeviceAdminReceiver the setup wizard makes device-owner.
  PROVISIONING_ADMIN_COMPONENT: z
    .string()
    .default('com.devicelock.agent/com.devicelock.agent.LockAdminReceiver'),
  // Where the wizard downloads the agent APK. Defaults to this server's
  // /v1/provisioning/agent.apk when unset.
  PROVISIONING_APK_URL: z.string().optional(),
  // Local APK file to serve at /v1/provisioning/agent.apk. Defaults to the
  // android-dpc debug build output.
  PROVISIONING_APK_PATH: z.string().optional(),
  // base64url SHA-256 of the APK signing certificate. Default is the debug
  // signing cert; a release build MUST override this with its own.
  PROVISIONING_SIGNATURE_CHECKSUM: z
    .string()
    .default('UQ5XskBHO8lfumfO_3ELysm9uyG_5JTVkiZNV-ezi9A'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by @nestjs/config `validate`. Throws (with details) on bad config. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
