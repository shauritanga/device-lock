import {
  CreditCard,
  FileSignature,
  Banknote,
  Code2,
  Headphones,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  WalletCards,
} from '@/shared/icons';
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
        subtitle: 'Credit sales — customer, phone, loan, contract and repayment status',
      },
      {
        to: '/devices',
        label: 'Devices',
        icon: Smartphone,
        subtitle: 'Enrolled phones — status, lock/unlock, and enrollment QR',
      },
      {
        to: '/customers',
        label: 'Customers',
        icon: Users,
        subtitle: 'People financing devices with you',
      },
      {
        to: '/payments',
        label: 'Payments',
        icon: CreditCard,
        subtitle: 'Collections and reconciliation across loans',
      },
      {
        to: '/payouts',
        label: 'Payouts',
        icon: Banknote,
        subtitle: 'Instalments collected for you and paid out to your mobile-money account',
        roles: ['OWNER', 'MANAGER'],
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
        to: '/agreement',
        label: 'Agreement',
        icon: FileSignature,
        subtitle: 'Your service agreement with the platform — review and sign',
        roles: ['OWNER', 'MANAGER'],
      },
      {
        to: '/developers',
        label: 'Developers',
        icon: Code2,
        subtitle: 'API keys, webhooks, request log and integration docs',
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
