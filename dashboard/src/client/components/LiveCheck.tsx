import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from '@/shared/icons';
import { Button } from '@/shared/components/ui/Button';
import { canvasToFile, describeFace, eyeRatio, loadFaceApi } from '../lib/face';

type FaceApi = typeof import('@vladmandic/face-api');
const BLINK_TIMEOUT_MS = 20_000;

export type LiveResult = { selfie: File; livenessPassed: boolean; distance: number };

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

  async function waitForBlink(faceapi: FaceApi, video: HTMLVideoElement) {
    const started = Date.now();
    let baseline = 0;
    let closed = false;
    let lastOpen: HTMLCanvasElement | null = null;
    while (Date.now() - started < BLINK_TIMEOUT_MS) {
      if (cancelled.current) throw new Error('cancelled');
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true);
      if (det) {
        const pts = det.landmarks.positions;
        const ratio = (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2;
        baseline = Math.max(baseline * 0.995, ratio);
        if (!closed && ratio > baseline * 0.85) lastOpen = snapshot(video);
        if (baseline > 0 && ratio < baseline * 0.7) closed = true;
        else if (closed && ratio > baseline * 0.85 && lastOpen) return { canvas: lastOpen, live: true };
      }
      await new Promise((r) => setTimeout(r, 90));
    }
    // No blink seen: hand back a frame anyway so a manager can review it.
    return { canvas: snapshot(video), live: false };
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

      const frame = await waitForBlink(faceapi, video);
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
