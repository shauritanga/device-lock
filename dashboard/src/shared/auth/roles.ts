import type { Role } from '../api/types';
import type { AppId } from '../config';

/** Platform staff. These accounts have no tenant and work across companies. */
export const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'COLLECTIONS_ADMIN', 'COLLECTOR'];

/** Seller staff. Always scoped to one tenant (shop). */
export const CLIENT_ROLES: readonly Role[] = ['OWNER', 'MANAGER', 'AGENT'];

/** Admin roles that may run commercial operations (subscriptions, invoices, staffing). */
export const PLATFORM_ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'COLLECTIONS_ADMIN'];

/** Seller roles that may see commercial screens (billing, staff, subscription). */
export const SELLER_ADMIN_ROLES: readonly Role[] = ['OWNER'];

export const ROLES_BY_APP: Record<AppId, readonly Role[]> = {
  admin: ADMIN_ROLES,
  client: CLIENT_ROLES,
};

export function roleAllowed(role: Role | undefined, allow?: readonly Role[]): boolean {
  if (!allow) return true;
  return role != null && allow.includes(role);
}

/** Which console a role belongs to, or null if it maps to neither. */
export function homeAppFor(role: Role): AppId | null {
  if (ADMIN_ROLES.includes(role)) return 'admin';
  if (CLIENT_ROLES.includes(role)) return 'client';
  return null;
}
