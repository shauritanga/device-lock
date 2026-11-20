import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from '@/shared/icons';
import { Button } from '@/shared/components/ui/Button';
import { canvasToFile, describeFace, eyeRatio, loadFaceApi } from '../lib/face';

type FaceApi = typeof import('@vladmandic/face-api');
type Stats = {
  frames: number;
  faceFrames: number;
  minRatio: number;
  maxRatio: number;
  baseline: number;
  attempts: number;
  ms: number;
};
const ATTEMPT_MS = 14_000;
const MAX_ATTEMPTS = 2;
/** A blink is an eye-opening ratio that dips below this share of the person's own open-eye level. */
const CLOSED_BELOW = 0.78;
const REOPENED_ABOVE = 0.88;
const BASELINE_FRAMES = 6;

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

export type LiveResult = {
  selfie: File;
  livenessPassed: boolean;
  distance: number;
  /** What the detector saw, kept with the result so a failed blink can be diagnosed. */
  info: Record<string, number | boolean>;
};

/**
 * The live check on its own screen: the person looks at the front camera and
 * blinks once (so a held-up photo is not enough), then the live face is compared
 * with the face on the front of the ID.
 */
export function LiveCheck({
  idDescriptor,
  onDone,
}: {
  idDescriptor: Float32Array;
  onDone: (r: LiveResult) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const [hint, setHint] = useState('Loading the face checker…');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    cancelled.current = false;
    run();
    return () => {
      cancelled.current = true;
      stop();
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function snapshot(video: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas;
  }

  /**
   * Watches for one blink. Samples as fast as the phone can run the detector
   * (a blink lasts about 150 ms, so a slow, sleep-paced loop misses it), and
   * compares each frame with the person's own recent open-eye level instead of a
   * single best-ever value that one noisy frame could inflate.
   */
  async function waitForBlink(faceapi: FaceApi, video: HTMLVideoElement, stats: Stats) {
    const started = Date.now();
    const open: number[] = [];
    let dipped = false;
    let lastOpen: HTMLCanvasElement | null = null;
    while (Date.now() - started < ATTEMPT_MS) {
      if (cancelled.current) throw new Error('cancelled');
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true);
      stats.frames++;
      if (det) {
        stats.faceFrames++;
        setHint('Face found. Blink once, slowly');
        const pts = det.landmarks.positions;
        const ratio = (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2;
        stats.minRatio = Math.min(stats.minRatio, ratio);
        stats.maxRatio = Math.max(stats.maxRatio, ratio);
        if (open.length < BASELINE_FRAMES) {
          open.push(ratio);
          lastOpen = snapshot(video);
        } else {
          const baseline = median(open);
          if (ratio < baseline * CLOSED_BELOW) {
            dipped = true; // eyes closing: do not let this frame pollute the baseline
          } else {
            if (dipped && ratio >= baseline * REOPENED_ABOVE) {
              stats.baseline = baseline;
              return { canvas: snapshot(video), live: true };
            }
            if (!dipped) {
              open.push(ratio);
              if (open.length > 15) open.shift();
              lastOpen = snapshot(video);
            }
          }
        }
      } else {
        setHint("Can't see your face. Face the camera in good light");
      }
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return { canvas: lastOpen ?? snapshot(video), live: false };
  }

  async function run() {
    setError('');
    setHint('Loading the face checker…');
    try {
      const faceapi = await loadFaceApi();
      if (cancelled.current) return;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 } },
          audio: false,
        });
      } catch {
        throw new Error('The camera is blocked. Allow camera access for this page, then try again.');
      }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setHint('Look at the camera and blink once');

      const stats: Stats = { frames: 0, faceFrames: 0, minRatio: 9, maxRatio: 0, baseline: 0, attempts: 0, ms: 0 };
      const t0 = Date.now();
      let frame = { canvas: snapshot(video), live: false };
      for (let i = 1; i <= MAX_ATTEMPTS && !frame.live; i++) {
        stats.attempts = i;
        if (i > 1) setHint("We didn't see a blink. Try once more, blink slowly");
        frame = await waitForBlink(faceapi, video, stats);
      }
      stats.ms = Date.now() - t0;
      stop();
      if (cancelled.current) return;
      setHint('Comparing with the ID photo…');
      const face = await describeFace(faceapi, frame.canvas, 416, 0.4);
      if (!face) throw new Error('No face found. Try again in better light, face the camera.');
      const distance = faceapi.euclideanDistance(face.descriptor, idDescriptor);
      onDone({
        selfie: await canvasToFile(frame.canvas, 'selfie.jpg'),
        livenessPassed: frame.live,
        distance,
        info: {
          attempts: stats.attempts,
          frames: stats.frames,
          faceFrames: stats.faceFrames,
          fps: stats.ms ? Math.round((stats.frames / stats.ms) * 1000) : 0,
          minRatio: Number(stats.minRatio.toFixed(3)),
          maxRatio: Number(stats.maxRatio.toFixed(3)),
          baseline: Number(stats.baseline.toFixed(3)),
          blinkSeen: frame.live,
        },
      });
    } catch (e) {
      if (cancelled.current) return;
      stop();
      setError(e instanceof Error ? e.message : 'The live check failed');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Live check</h2>
        <p className="mt-1 text-sm text-muted">The customer looks at the camera and blinks once.</p>
      </div>
      {error ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/5 px-3 py-2.5 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
          <Button onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[4/3] w-full -scale-x-100 rounded-2xl bg-black object-cover"
          />
          <p className="flex items-center gap-2 text-sm text-ink">
            <Loader2 className="h-4 w-4 animate-spin" /> {hint}
          </p>
        </>
      )}
    </div>
  );
}
