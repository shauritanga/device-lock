import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, RefreshCw } from '@/shared/icons';
import { Button } from '@/shared/components/ui/Button';
import { canvasToFile } from '../lib/face';

/**
 * Takes one photo with the live camera. There is deliberately no way to pick a
 * file from the gallery: the picture has to be taken here and now.
 */
export function CameraCapture({
  facing,
  title,
  hint,
  guide,
  busy,
  error,
  onUse,
}: {
  facing: 'environment' | 'user';
  title: string;
  hint: string;
  /** Draws a card-shaped frame to line the ID up in. */
  guide?: boolean;
  busy?: boolean;
  error?: string;
  /** The person is happy with the shot. */
  onUse: (file: File, canvas: HTMLCanvasElement) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [blocked, setBlocked] = useState('');
  const [still, setStill] = useState<{ url: string; file: File; canvas: HTMLCanvasElement } | null>(null);

  async function start() {
    setBlocked('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
    } catch {
      setBlocked('The camera is blocked. Allow camera access for this page in the browser settings, then try again.');
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    start();
    return stop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (still) URL.revokeObjectURL(still.url); }, [still]);

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    const file = await canvasToFile(canvas, 'photo.jpg');
    stop();
    setStill({ url: URL.createObjectURL(file), file, canvas });
  }

  function retake() {
    setStill(null);
    start();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/5 px-3 py-2.5 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}

      {blocked ? (
        <div className="space-y-3">
          <p className="text-sm text-rose-700">{blocked}</p>
          <Button onClick={start}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {still ? (
              <img src={still.url} alt="Your photo" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className={`aspect-[4/3] w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
              />
            )}
            {guide && !still ? (
              <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/70" />
            ) : null}
          </div>

          {still ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={retake} disabled={busy}>
                <RefreshCw className="h-4 w-4" /> Retake
              </Button>
              <Button onClick={() => onUse(still.file, still.canvas)} disabled={busy}>
                {busy ? 'Checking…' : 'Use this photo'}
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={snap}>
              <Camera className="h-4 w-4" /> Take photo
            </Button>
          )}
        </>
      )}
    </div>
  );
}
