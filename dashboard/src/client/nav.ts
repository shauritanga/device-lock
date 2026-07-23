import {
  CreditCard,
  FileText,
  Headphones,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  WalletCards,
} from 'lucide-react';
import type { NavGroup, ShellBrand } from '@/shared/layout/AppShell';
import { SELLER_ADMIN_ROLES } from '@/shared/auth/roles';
import { BRAND_NAME } from '@/shared/config';

export const CLIENT_BRAND: ShellBrand = {
  name: BRAND_NAME,
  tag: 'Seller console',
  icon: ShieldCheck,
};

export const CLIENT_NAV: NavGroup[] = [
  {
    label: 'Main menu',
    items: [
      {
        to: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        end: true,
        subtitle: 'Overview of your financed fleet and collections',
      },
      {
        to: '/sales',
        label: 'Sales',
        icon: ReceiptText,
        subtitle: 'Credit sales from customer assignment to repayment',
      },
      {
        to: '/devices',
        label: 'Devices',
        icon: Smartphone,
        subtitle: 'Enrolled devices and their lock status',
      },
      {
        to: '/customers',
        label: 'Customers',
        icon: Users,
        subtitle: 'People financing devices with you',
      },
      {
        to: '/loans',
        label: 'Loans',
        icon: FileText,
        subtitle: 'Financing agreements and repayment schedules',
      },
      {
        to: '/payments',
        label: 'Payments',
        icon: CreditCard,
        subtitle: 'Collections and reconciliation across loans',
      },
    ],
  },
  {
    label: 'Services',
    items: [
      {
        to: '/collections-service',
        label: 'Collections',
        icon: Headphones,
        subtitle: 'Your managed follow-up subscription and what collectors did',
        roles: ['OWNER', 'MANAGER'],
      },
    ],
  },
  {
    label: 'Account management',
    roles: SELLER_ADMIN_ROLES,
    items: [
      {
        to: '/billing',
        label: 'Billing',
        icon: WalletCards,
        subtitle: 'Subscription plan, usage bundles, and monthly invoices',
      },
      {
        to: '/staff',
        label: 'Staff',
        icon: UserCog,
        subtitle: 'Team members with access to this console',
      },
    ],
  },
];
