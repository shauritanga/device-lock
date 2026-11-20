import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Camera, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Customer } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { PhotoCapture } from './PersonFields';

type FaceApi = typeof import('@vladmandic/face-api');
type Phase = 'id' | 'live' | 'checking' | 'result';

let faceApiPromise: Promise<FaceApi> | null = null;
/** Loads the face library and its models once, only when verification is used. */
function loadFaceApi(): Promise<FaceApi> {
  faceApiPromise ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]);
    return faceapi;
  })().catch((e) => {
    faceApiPromise = null;
    throw e;
  });
  return faceApiPromise;
}

/** Eye aspect ratio from six eye landmarks: drops sharply when the eye closes. */
function eyeRatio(pts: Array<{ x: number; y: number }>) {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(pts[1], pts[5]) + d(pts[2], pts[4])) / (2 * d(pts[0], pts[3]));
}

const BLINK_TIMEOUT_MS = 20_000;

/**
 * Identity check for a customer: the ID-card photo, then a live camera session
 * where the person must blink (so a held-up photo is not enough), then a face
 * match between the live frame and the ID photo. The server adds the ID-number
 * format, duplicate-ID and photo checks and decides the final status.
 */
export function VerifyIdentity({
  customer,
  onComplete,
}: {
  customer: Customer;
  onComplete: (c: Customer) => void;
}) {
  const [phase, setPhase] = useState<Phase>('id');
  const [idCard, setIdCard] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [result, setResult] = useState<Customer | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      stopCamera();
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const submit = useMutation({
    mutationFn: async (input: { selfie: File; livenessPassed: boolean; distance: number }) => {
      const body = new FormData();
      body.append('photo', input.selfie);
      body.append('idCard', idCard as File);
      await api.post(`/customers/${customer.id}/photos`, body);
      return (
        await api.post<Customer>(`/customers/${customer.id}/verify`, {
          faceDistance: input.distance,
          livenessPassed: input.livenessPassed,
        })
      ).data;
    },
    onSuccess: (c) => {
      setResult(c);
      setPhase('result');
      onComplete(c);
    },
    onError: (e) => {
      setError(apiErrorMessage(e, 'Could not save the verification'));
      setPhase('id');
    },
  });

  /** Descriptor for the face in an image element, or null when none is found. */
  async function describe(faceapi: FaceApi, el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, size: number, score: number) {
    return faceapi
      .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: score }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
  }

  async function startLive() {
    if (!idCard) return;
    setError('');
    setHint('Loading the face checker…');
    setPhase('live');
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
        setCameraBlocked(true);
        setHint('');
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setHint('Look at the camera and blink once');

      const frame = await waitForBlink(faceapi, video);
      stopCamera();
      if (cancelled.current) return;
      setPhase('checking');
      await match(faceapi, frame.canvas, frame.live);
    } catch (e) {
      stopCamera();
      setError(e instanceof Error ? e.message : 'Verification failed');
      setPhase('id');
    }
  }

  /** Watches the camera until the eyes close and reopen, then returns an open-eyed frame. */
  async function waitForBlink(faceapi: FaceApi, video: HTMLVideoElement) {
    const started = Date.now();
    let baseline = 0;
    let closed = false;
    let lastOpen: HTMLCanvasElement | null = null;
    while (Date.now() - started < BLINK_TIMEOUT_MS) {
      if (cancelled.current) throw new Error('Cancelled');
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true);
      if (det) {
        const pts = det.landmarks.positions;
        const ratio = (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2;
        baseline = Math.max(baseline * 0.995, ratio);
        if (!closed && ratio > baseline * 0.85) {
          lastOpen = snapshot(video);
        }
        if (baseline > 0 && ratio < baseline * 0.7) closed = true;
        else if (closed && ratio > baseline * 0.85 && lastOpen) {
          return { canvas: lastOpen, live: true };
        }
      }
      await new Promise((r) => setTimeout(r, 90));
    }
    // No blink seen: still hand back a frame so a manager can review it.
    return { canvas: snapshot(video), live: false };
  }

  function snapshot(video: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas;
  }

  async function match(faceapi: FaceApi, selfie: HTMLCanvasElement | File, live: boolean) {
    setHint('Comparing the live face with the ID photo…');
    const selfieFile =
      selfie instanceof File
        ? selfie
        : await new Promise<File>((resolve, reject) =>
            selfie.toBlob(
              (b) => (b ? resolve(new File([b], 'selfie.jpg', { type: 'image/jpeg' })) : reject(new Error('Could not read the camera'))),
              'image/jpeg',
              0.9,
            ),
          );
    const selfieImg = await faceapi.bufferToImage(selfieFile);
    const idImg = await faceapi.bufferToImage(idCard as File);
    const [a, b] = [
      await describe(faceapi, selfieImg, 416, 0.4),
      await describe(faceapi, idImg, 608, 0.3),
    ];
    if (!a) throw new Error('No face found in the live photo. Try again in better light.');
    if (!b) throw new Error('No face found on the ID photo. Retake it closer, flat and in focus.');
    const distance = faceapi.euclideanDistance(a.descriptor, b.descriptor);
    submit.mutate({ selfie: selfieFile, livenessPassed: live, distance });
  }

  /** Camera not available: upload a selfie instead. It cannot pass liveness, so it goes to review. */
  async function onFallbackSelfie(file: File | null) {
    if (!file || !idCard) return;
    setError('');
    setPhase('checking');
    try {
      const faceapi = await loadFaceApi();
      await match(faceapi, file, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
      setPhase('id');
    }
  }

  const statusTone = {
    VERIFIED: 'text-emerald-600',
    NEEDS_REVIEW: 'text-amber-600',
    FAILED: 'text-rose-600',
    UNVERIFIED: 'text-muted',
  } as const;

  if (phase === 'result' && result) {
    const c = result.verificationChecks;
    const rows: Array<[string, boolean | undefined, string?]> = c
      ? [
          ['ID number is valid', c.idFormat.passed, c.idFormat.reason ?? undefined],
          ['ID is not used by another customer', c.duplicateId.passed, c.duplicateId.matches ? `Already registered to ${c.duplicateId.matches}` : undefined],
          ['ID and selfie photos on file', c.photos.passed],
          ['Live person (blinked on camera)', c.liveness.passed],
          ['Face matches the ID photo', c.face.passed, `Distance ${c.face.distance.toFixed(2)} (match below ${c.face.matchBelow})`],
        ]
      : [];
    const status = result.verificationStatus ?? 'UNVERIFIED';
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${statusTone[status]}`} />
          <span className={`text-sm font-semibold ${statusTone[status]}`}>
            {status === 'VERIFIED'
              ? 'Identity verified'
              : status === 'NEEDS_REVIEW'
                ? 'Needs a manager to review'
                : 'Verification failed'}
          </span>
        </div>
        <ul className="space-y-2">
          {rows.map(([label, ok, note]) => (
            <li key={label} className="flex items-start gap-2 text-sm">
              {ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span className="text-ink">
                {label}
                {note ? <span className="block text-xs text-muted">{note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {status !== 'VERIFIED' ? (
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setIdCard(null);
              setPhase('id');
            }}
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/5 px-3 py-2.5 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}

      {phase === 'id' ? (
        <>
          <PhotoCapture label="Photo of the ID card (face side)" file={idCard} onChange={setIdCard} />
          <p className="text-xs text-muted">
            Lay the ID flat in good light so the face and number are readable. Next, the customer looks at the
            camera and blinks once.
          </p>
          <Button onClick={startLive} disabled={!idCard}>
            <Camera className="h-4 w-4" /> Start live check
          </Button>
        </>
      ) : null}

      {phase === 'live' ? (
        <div className="space-y-3">
          {cameraBlocked ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                The camera is not available. Upload a clear selfie instead; without the live blink check it will
                be sent to a manager for review.
              </p>
              <PhotoCapture label="Selfie" file={null} onChange={onFallbackSelfie} />
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-[4/3] w-full max-w-sm -scale-x-100 rounded-xl bg-black object-cover"
              />
              <p className="flex items-center gap-2 text-sm text-ink">
                <Loader2 className="h-4 w-4 animate-spin" /> {hint}
              </p>
            </>
          )}
        </div>
      ) : null}

      {phase === 'checking' ? (
        <p className="flex items-center gap-2 text-sm text-ink">
          <Loader2 className="h-4 w-4 animate-spin" /> {hint || 'Saving the result…'}
        </p>
      ) : null}
    </div>
  );
}
