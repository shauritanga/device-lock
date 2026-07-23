/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Absolute URL of the seller console, used to redirect misrouted sign-ins. */
  readonly VITE_CLIENT_URL?: string;
  /** Absolute URL of the platform admin console. */
  readonly VITE_ADMIN_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
