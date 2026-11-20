import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export type ConfirmOptions = {
  title: string;
  /** What will happen, in plain words. Name the thing being changed. */
  message: ReactNode;
  confirmLabel?: string;
  /** Red button, for deletes and anything hard to undo. */
  danger?: boolean;
};

/**
 * Asks "are you sure?" before an action runs.
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   onClick={async () => { if (await confirm({ title, message })) doIt(); }}
 *   ...
 *   {dialog}
 *
 * Esc, the backdrop and Cancel all answer "no", so a stray click or key press
 * can never run the action.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setState(options);
      }),
    [],
  );

  const answer = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  };

  const dialog = (
    <Modal
      open={!!state}
      onClose={() => answer(false)}
      title={state?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button type="button" variant={state?.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
            {state?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-soft">{state?.message}</div>
    </Modal>
  );

  return { confirm, dialog };
}
