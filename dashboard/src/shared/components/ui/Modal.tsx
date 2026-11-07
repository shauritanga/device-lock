import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/shared/icons';
import { cn } from '../../lib/cn';
import { Button } from './Button';

type Size = 'sm' | 'md' | 'lg' | 'xl';

/** Content widths (the dialog never exceeds the viewport minus a small margin). */
const SIZES: Record<Size, string> = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[920px]',
};

/**
 * Form dialog in the rucky-rentals style.
 *
 * - Fixed header (title, optional subtitle, close), scrolling body, and an
 *   optional pinned `footer` for the actions, right-aligned.
 * - Esc and the close button close it. A click on the backdrop or Esc asks
 *   "Close without saving?" when `dirty` is set, so a stray click can't throw
 *   away someone's work; the close button always closes straight away.
 * - On phones it becomes a bottom sheet.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dirty = false,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Pinned action row under the body (buttons are right-aligned). */
  footer?: ReactNode;
  size?: Size;
  /** Unsaved input: backdrop clicks and Esc ask before closing. */
  dirty?: boolean;
  className?: string;
  /** Extra classes for the scrollable body (use `!p-0` for full-bleed content). */
  bodyClassName?: string;
}) {
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Ask first when there is unsaved input; otherwise close straight away.
  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) {
      setAsking(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (asking) setAsking(false);
      else requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, asking, requestClose]);

  // Move focus into the dialog so keyboard users land in the form.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), select, textarea',
      );
      (el ?? ref.current)?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
      <div
        className="modal-overlay-in absolute inset-0 bg-black/55 backdrop-blur-[4px]"
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'modal-in relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop outline-none sm:max-h-[90vh] sm:rounded-2xl',
          SIZES[size],
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line-soft px-4 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-ink">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-faint">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-elevated text-muted transition hover:bg-hover hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-3.5 sm:px-6 [&>button]:max-sm:flex-1">
            {footer}
          </div>
        ) : null}

        {asking ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-5">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="Close without saving?"
              className="modal-in w-full max-w-[400px] rounded-2xl border border-line bg-surface shadow-pop"
            >
              <div className="border-b border-line-soft px-5 pb-3 pt-4">
                <h4 className="text-base font-semibold text-ink">Close without saving?</h4>
              </div>
              <p className="px-5 py-4 text-sm leading-relaxed text-muted">
                What you have entered will be lost. Do you want to keep editing?
              </p>
              <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3.5">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Discard
                </Button>
                <Button type="button" onClick={() => setAsking(false)} autoFocus>
                  Keep editing
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
