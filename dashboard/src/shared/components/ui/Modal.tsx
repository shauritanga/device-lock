import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Extra classes for the scrollable body under the title. */
  bodyClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-xl2',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6 sm:py-4">
          <h3 className="min-w-0 truncate text-base font-semibold text-ink sm:text-lg">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5',
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
