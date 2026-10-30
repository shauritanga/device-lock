import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { cn } from '../lib/cn';

const W = 480;
const H = 160;

type Mode = 'draw' | 'type';

/**
 * Captures a signature as a PNG data URL, either drawn or typed (rendered to the
 * same canvas, so the server stores one format). Calls onChange(null) when empty.
 */
export function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (png: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>('draw');
  const [typed, setTyped] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const clear = useCallback(() => {
    const c = canvas.current;
    c?.getContext('2d')?.clearRect(0, 0, W, H);
    onChange(null);
  }, [onChange]);

  // Typed mode: redraw the canvas whenever the text changes.
  useEffect(() => {
    if (mode !== 'type') return;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (!typed.trim()) return onChange(null);
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    let size = 64;
    do {
      ctx.font = `italic ${size}px "Snell Roundhand", "Brush Script MT", "Segoe Script", cursive`;
      size -= 4;
    } while (ctx.measureText(typed).width > W - 32 && size > 16);
    ctx.fillText(typed, 16, H / 2);
    onChange(c.toDataURL('image/png'));
  }, [typed, mode, onChange]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(e.currentTarget.toDataURL('image/png'));
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setTyped('');
    clear();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-line p-0.5 text-xs font-medium">
          {(['draw', 'type'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                'rounded-md px-3 py-1 capitalize transition',
                mode === m ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setTyped('');
            clear();
          }}
          disabled={!value}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {mode === 'type' ? (
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type your full name"
          className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
      ) : null}

      <canvas
        ref={canvas}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className={cn(
          'h-32 w-full rounded-xl border border-dashed border-line bg-white',
          mode === 'draw' ? 'cursor-crosshair touch-none' : 'pointer-events-none',
        )}
        aria-label="Signature area"
      />
      {mode === 'draw' && !value ? (
        <p className="text-xs text-muted">Sign inside the box using your mouse or finger.</p>
      ) : null}
    </div>
  );
}
