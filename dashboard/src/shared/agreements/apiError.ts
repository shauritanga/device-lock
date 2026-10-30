import axios from 'axios';

/** Human-readable message from a failed API call (Nest returns string or string[]). */
export function apiErrorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(e)) {
    const m = e.response?.data?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string') return m;
  }
  return fallback;
}
