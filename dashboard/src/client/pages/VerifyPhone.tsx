import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from '@/shared/icons';
import { API_BASE_URL } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { Button } from '@/shared/components/ui/Button';
import { CameraCapture } from '../components/CameraCapture';
import { LiveCheck, type LiveResult } from '../components/LiveCheck';
import { describeFace, loadFaceApi } from '../lib/face';

type Step = 'loading' | 'invalid' | 'intro' | 'front' | 'back' | 'live' | 'saving' | 'done';

const pub = axios.create({ baseURL: API_BASE_URL });
const STEP_NUMBER: Partial<Record<Step, number>> = { front: 1, back: 2, live: 3 };

/**
 * Opened on the staff member's phone from the QR code on the computer. No login:
 * the link itself is the credential, it works once, and it expires quickly.
 * Three screens: ID front, ID back, then the live check on its own.
 */
export default function VerifyPhone() {
  const { token = '' } = useParams();
  const [step, setStep] = useState<Step>('loading');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const idDescriptor = useRef<Float32Array | null>(null);
  const storeKey = `verify:${token}`;

  useEffect(() => {
    pub
      .get<{ customerName: string }>(`/verify/${token}`)
      .then((r) => {
        setName(r.data.customerName);
        try {
          const saved = sessionStorage.getItem(storeKey);
          if (saved) idDescriptor.current = new Float32Array(JSON.parse(saved));
        } catch {
          /* no saved descriptor */
        }
        setStep('intro');
      })
      .catch((e) => {
        setMessage(apiErrorMessage(e, 'This link is not valid.'));
        setStep('invalid');
      });
  }, [token, storeKey]);

  async function upload(path: string, file: File, extra: Record<string, string> = {}) {
    const body = new FormData();
    body.append('photo', file);
    for (const [k, v] of Object.entries(extra)) body.append(k, v);
    return (await pub.post(`/verify/${token}/${path}`, body)).data;
  }

  async function useFront(file: File, canvas: HTMLCanvasElement) {
    setBusy(true);
    setError('');
    try {
      const faceapi = await loadFaceApi();
      const face = await describeFace(faceapi, canvas, 608, 0.3);
      if (!face) {
        setError('No face found on the ID. Retake it closer, flat and in focus, with the photo side up.');
        return;
      }
      await upload('id-front', file);
      idDescriptor.current = face.descriptor;
      sessionStorage.setItem(storeKey, JSON.stringify(Array.from(face.descriptor)));
      setStep('back');
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save the photo. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function useBack(file: File) {
    setBusy(true);
    setError('');
    try {
      await upload('id-back', file);
      setStep(idDescriptor.current ? 'live' : 'front');
      if (!idDescriptor.current) setError('Please retake the front of the ID once more.');
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save the photo. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function finish(r: LiveResult) {
    setStep('saving');
    try {
      const out = await upload('complete', r.selfie, {
        faceDistance: String(r.distance),
        livenessPassed: String(r.livenessPassed),
      });
      sessionStorage.removeItem(storeKey);
      setResult(out.status);
      setStep('done');
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save the result. Try again.'));
      setStep('live');
    }
  }

  const n = STEP_NUMBER[step];

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 text-ink">
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          <span className="font-medium text-ink">Verify customer</span>
          {name ? <span className="truncate">· {name}</span> : null}
          {n ? <span className="ml-auto shrink-0">Step {n} of 3</span> : null}
        </header>

        {step === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening…
          </p>
        ) : null}

        {step === 'invalid' ? (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
            </p>
            <p className="text-sm text-muted">Go back to the computer and choose “Start verification” again.</p>
          </div>
        ) : null}

        {step === 'intro' ? (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">Verifying {name}</h1>
            <ol className="space-y-2 text-sm text-ink-soft">
              <li>1. Photograph the front of the ID card</li>
              <li>2. Photograph the back of the ID card</li>
              <li>3. Live check: the customer looks at the camera and blinks</li>
            </ol>
            <p className="text-sm text-muted">
              Photos are taken here with the camera. Have the customer and their ID card ready.
            </p>
            <Button className="w-full" onClick={() => setStep('front')}>
              Start
            </Button>
          </div>
        ) : null}

        {step === 'front' ? (
          <CameraCapture
            key="front"
            facing="environment"
            guide
            title="Front of the ID"
            hint="Lay the card flat in good light, photo side up, and fill the frame."
            busy={busy}
            error={error}
            onUse={(file, canvas) => useFront(file, canvas)}
          />
        ) : null}

        {step === 'back' ? (
          <CameraCapture
            key="back"
            facing="environment"
            guide
            title="Back of the ID"
            hint="Turn the card over and photograph the back the same way."
            busy={busy}
            error={error}
            onUse={(file) => useBack(file)}
          />
        ) : null}

        {step === 'live' && idDescriptor.current ? (
          <>
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <LiveCheck idDescriptor={idDescriptor.current} onDone={finish} />
          </>
        ) : null}

        {step === 'saving' ? (
          <p className="flex items-center gap-2 text-sm text-ink">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving the result…
          </p>
        ) : null}

        {step === 'done' ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" /> All steps done
            </p>
            <p className="text-sm text-muted">
              {result === 'VERIFIED'
                ? 'The customer is verified.'
                : result === 'NEEDS_REVIEW'
                  ? 'The result needs a manager to review it.'
                  : 'The checks did not pass.'}{' '}
              The details are on the computer. You can close this page.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
