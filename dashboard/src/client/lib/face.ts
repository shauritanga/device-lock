/** Face detection helpers for the phone verification flow. The library and its models load only when used. */
type FaceApi = typeof import('@vladmandic/face-api');

let faceApiPromise: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
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

type Source = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/** The 128-number fingerprint of the single face in an image, or null when no face is found. */
export async function describeFace(
  faceapi: FaceApi,
  el: Source,
  inputSize: number,
  scoreThreshold: number,
) {
  return faceapi
    .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
}

/** Eye aspect ratio from six eye landmarks: drops sharply when the eye closes. */
export function eyeRatio(pts: Array<{ x: number; y: number }>) {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(pts[1], pts[5]) + d(pts[2], pts[4])) / (2 * d(pts[0], pts[3]));
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string, quality = 0.9): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(new File([b], name, { type: 'image/jpeg' })) : reject(new Error('Could not read the camera'))),
      'image/jpeg',
      quality,
    ),
  );
}
