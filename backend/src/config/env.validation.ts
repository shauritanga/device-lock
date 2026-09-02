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

  // Voice/IVR provider. Generic JSON POST integration; unset => dev stub.
  VOICE_CALL_URL: z.string().url().optional(),
  VOICE_API_KEY: z.string().optional(),
  VOICE_SENDER_ID: z.string().default('SimuLinda'),

  // Staff/customer bridge calls for call-centre verification. Unset => self-reported attempts.
  CALL_PROVIDER_URL: z.string().url().optional(),
  CALL_PROVIDER_API_KEY: z.string().optional(),
  CALL_PROVIDER_NAME: z.string().default('GENERIC'),

  // Transactional email (Resend). Unset => stub / log only.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Seller (client) console URL used in welcome emails.
  CLIENT_APP_URL: z.string().url().optional(),

  // Zero-touch / QR provisioning of the DPC agent.
  // Public base URL of THIS backend, used to build the APK download link the
  // setup wizard fetches (must be reachable by a factory-fresh device).
  PUBLIC_BASE_URL: z.string().optional(),
  // The DeviceAdminReceiver the setup wizard makes device-owner.
  PROVISIONING_ADMIN_COMPONENT: z
    .string()
    .default('com.devicelock.agent/.LockAdminReceiver'),
  // Where the wizard downloads the agent APK. Defaults to this server's
  // /v1/provisioning/agent.apk when unset.
  PROVISIONING_APK_URL: z.string().optional(),
  // Local APK file to serve at /v1/provisioning/agent.apk. Defaults to the
  // android-dpc release build output.
  PROVISIONING_APK_PATH: z.string().optional(),
  // base64url SHA-256 of the APK signing certificate. Must match the release
  // keystore used to sign the APK served at /v1/provisioning/agent.apk.
  PROVISIONING_SIGNATURE_CHECKSUM: z.string().optional(),

  // Firebase service-account JSON (raw or file path). Required for instant
  // lock/unlock; without it commands stay QUEUED until the phone checks in.
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
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
