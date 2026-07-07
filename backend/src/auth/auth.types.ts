import { UserRole } from '@prisma/client';

/** Decoded access-token payload. */
export interface JwtPayload {
  sub: string; // user id
  tenantId: string | null; // null for SUPER_ADMIN
  role: UserRole;
  type: 'access';
}

/** Refresh-token payload (rotation tracked via jti -> RefreshToken row). */
export interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

/** What guards attach to the request and expose via @CurrentUser(). */
export interface AuthUser {
  userId: string;
  tenantId: string | null;
  role: UserRole;
}
