import {
  BarChart3,
  Building2,
  Headphones,
  Inbox,
  LayoutDashboard,
  PhoneCall,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import type { NavGroup, ShellBrand } from '@/shared/layout/AppShell';
import { PLATFORM_ADMIN_ROLES, STAFFING_ADMIN_ROLES } from '@/shared/auth/roles';
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
        label: 'Dashboard',
        icon: LayoutDashboard,
        end: true,
        subtitle: 'Network KPIs — companies, cases, collectors, and leads',
      },
      {
        to: '/cases',
        label: 'Cases',
        icon: Headphones,
        subtitle: 'Managed collections cases — auto-assigned up to 55 per collector per day',
      },
      {
        to: '/call-centre',
        label: 'Call Centre',
        icon: PhoneCall,
        subtitle: 'Collector performance — follow-ups, calls, PTPs, and time on task',
        roles: STAFFING_ADMIN_ROLES,
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
        to: '/demo-requests',
        label: 'Demo requests',
        icon: Inbox,
        subtitle: 'Inbound leads from the linda.co.tz demo form',
      },
      {
        to: '/companies',
        label: 'Companies',
        icon: Building2,
        subtitle: 'Seller companies — open one for subscription and invoices',
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
