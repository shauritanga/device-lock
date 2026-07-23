import { BarChart3, Building2, Headphones, PhoneCall, ShieldCheck, UserCog } from 'lucide-react';
import type { NavGroup, ShellBrand } from '@/shared/layout/AppShell';
import { PLATFORM_ADMIN_ROLES } from '@/shared/auth/roles';
import { BRAND_NAME } from '@/shared/config';

export const ADMIN_BRAND: ShellBrand = {
  name: BRAND_NAME,
  tag: 'Admin console',
  icon: ShieldCheck,
};

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Collections',
    items: [
      {
        to: '/',
        label: 'Work queue',
        icon: Headphones,
        end: true,
        subtitle: 'Managed collections cases, always tagged with the seller company',
      },
      {
        to: '/call-centre',
        label: 'Call Centre',
        icon: PhoneCall,
        subtitle: 'Overdue call queue, promises to pay, and escalation tracking',
        roles: PLATFORM_ADMIN_ROLES,
      },
      {
        to: '/reports',
        label: 'Reports',
        icon: BarChart3,
        subtitle: 'Collector performance, promises, and paid cases by period',
      },
    ],
  },
  {
    label: 'Platform',
    roles: PLATFORM_ADMIN_ROLES,
    items: [
      {
        to: '/companies',
        label: 'Companies',
        icon: Building2,
        subtitle: 'Subscriptions, packages, and collections invoices',
      },
      {
        to: '/collectors',
        label: 'Collectors',
        icon: UserCog,
        subtitle: 'Platform staff who follow up, and their BYOD numbers',
      },
    ],
  },
];
