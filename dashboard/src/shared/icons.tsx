/**
 * App icons — Hugeicons (https://hugeicons.com), free core set, MIT licensed.
 *
 * Every icon the dashboards use is exported here under a stable name, so pages
 * import from one place and swapping an icon is a one-line change. Icons size and
 * colour from CSS (`className="h-4 w-4 text-muted"`) like any inline SVG.
 */
import { type ComponentType, type SVGProps } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon,
  Alert02Icon,
  AlertCircleIcon,
  ArrowLeft02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  BookOpen01Icon,
  Briefcase01Icon,
  Building03Icon,
  Calendar03Icon,
  CalendarCheck01Icon,
  Call02Icon,
  CallIcon,
  Camera01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChartBarLineIcon,
  ChattingIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  CreditCardIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  Download01Icon,
  EraserIcon,
  File02Icon,
  FileEditIcon,
  FolderOpenIcon,
  HeadphonesIcon,
  HourglassIcon,
  InboxIcon,
  Invoice01Icon,
  Key01Icon,
  LinkSquare02Icon,
  ListViewIcon,
  Loading03Icon,
  Location01Icon,
  Logout01Icon,
  MapsIcon,
  Message01Icon,
  Message02Icon,
  Money03Icon,
  Moon02Icon,
  Notification01Icon,
  PackageIcon,
  PencilEdit01Icon,
  PrinterIcon,
  QrCodeIcon,
  RefreshIcon,
  Search01Icon,
  SecurityCheckIcon,
  SecurityLockIcon,
  SentIcon,
  Settings02Icon,
  SidebarLeftIcon,
  SmartPhone01Icon,
  SourceCodeIcon,
  SparklesIcon,
  SquareLock01Icon,
  SquareUnlock01Icon,
  Sun03Icon,
  Target01Icon,
  Task01Icon,
  Tick02Icon,
  Upload01Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  UserCircleIcon,
  UserIcon,
  UserMultiple02Icon,
  UserSettings01Icon,
  ViewIcon,
  ViewOffIcon,
  Wallet01Icon,
  Wallet03Icon,
  WebhookIcon,
} from '@hugeicons/core-free-icons';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: string | number; strokeWidth?: number };
/** Any icon component from this module (what nav items and cards accept). */
export type AppIcon = ComponentType<IconProps>;

function make(icon: IconSvgElement): AppIcon {
  return function Icon(props: IconProps) {
    return <HugeiconsIcon icon={icon} size={24} {...props} />;
  };
}

export const AlertCircle = make(AlertCircleIcon);
export const AlertTriangle = make(Alert02Icon);
export const ArrowLeft = make(ArrowLeft02Icon);
export const ArrowRight = make(ArrowRight02Icon);
export const Banknote = make(Money03Icon);
export const BarChart3 = make(ChartBarLineIcon);
export const Bell = make(Notification01Icon);
export const BookOpen = make(BookOpen01Icon);
export const Briefcase = make(Briefcase01Icon);
export const Building2 = make(Building03Icon);
export const CalendarCheck = make(CalendarCheck01Icon);
export const CalendarClock = make(Calendar03Icon);
export const Camera = make(Camera01Icon);
export const Check = make(Tick02Icon);
export const CheckCircle2 = make(CheckmarkCircle02Icon);
export const ChevronRight = make(ArrowRight01Icon);
export const ChevronLeft = make(ArrowLeft01Icon);
export const Clock = make(Clock01Icon);
export const Code2 = make(SourceCodeIcon);
export const Copy = make(Copy01Icon);
export const CreditCard = make(CreditCardIcon);
export const Download = make(Download01Icon);
export const Eraser = make(EraserIcon);
export const ExternalLink = make(LinkSquare02Icon);
export const Eye = make(ViewIcon);
export const EyeOff = make(ViewOffIcon);
export const FileSignature = make(FileEditIcon);
export const FileText = make(File02Icon);
export const FolderOpen = make(FolderOpenIcon);
export const Headphones = make(HeadphonesIcon);
export const Hourglass = make(HourglassIcon);
export const Inbox = make(InboxIcon);
export const KeyRound = make(Key01Icon);
export const LayoutDashboard = make(DashboardSquare01Icon);
export const List = make(ListViewIcon);
export const Loader2 = make(Loading03Icon);
export const Lock = make(SquareLock01Icon);
export const LockOpen = make(SquareUnlock01Icon);
export const LogOut = make(Logout01Icon);
export const Map = make(MapsIcon);
export const MapPin = make(Location01Icon);
export const MessageCircle = make(Message01Icon);
export const MessageSquare = make(Message02Icon);
export const MessagesSquare = make(ChattingIcon);
export const Moon = make(Moon02Icon);
export const Package = make(PackageIcon);
export const PanelLeft = make(SidebarLeftIcon);
export const Pencil = make(PencilEdit01Icon);
export const Phone = make(Call02Icon);
export const PhoneCall = make(CallIcon);
export const Plus = make(Add01Icon);
export const Printer = make(PrinterIcon);
export const QrCode = make(QrCodeIcon);
export const ReceiptText = make(Invoice01Icon);
export const RefreshCw = make(RefreshIcon);
export const ScrollText = make(Task01Icon);
export const Search = make(Search01Icon);
export const Send = make(SentIcon);
export const Settings = make(Settings02Icon);
export const ShieldAlert = make(SecurityLockIcon);
export const ShieldCheck = make(SecurityCheckIcon);
export const Smartphone = make(SmartPhone01Icon);
export const Sparkles = make(SparklesIcon);
export const Sun = make(Sun03Icon);
export const Target = make(Target01Icon);
export const Trash2 = make(Delete02Icon);
export const Unlock = make(SquareUnlock01Icon);
export const Upload = make(Upload01Icon);
export const User = make(UserIcon);
export const UserCheck = make(UserCheck01Icon);
export const UserCog = make(UserSettings01Icon);
export const UserPlus = make(UserAdd01Icon);
export const UserRound = make(UserCircleIcon);
export const Users = make(UserMultiple02Icon);
export const Wallet = make(Wallet01Icon);
export const WalletCards = make(Wallet03Icon);
export const Webhook = make(WebhookIcon);
export const X = make(Cancel01Icon);
export const XCircle = make(CancelCircleIcon);
