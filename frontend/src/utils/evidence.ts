/**
 * Resolves an evidence URL to a displayable image source.
 * - If url is falsy, returns null.
 * - If url is already an absolute HTTP/HTTPS URL, returns it directly.
 * - If a remote backend URL is configured via VITE_API_URL (non-localhost), prepends the clean backend origin.
 * - Otherwise (standalone/demo mode, Vercel deployments, or local static files), returns the relative path
 *   (e.g., `/evidence/...`) so the browser fetches it directly from the static public directory
 *   without triggering mixed-content HTTPS blocks or localhost connection errors.
 */
const SUPABASE_STORAGE_BASE = (import.meta.env.VITE_SUPABASE_STORAGE_URL as string | undefined)?.trim()
  || 'https://xuoavkdaiejmqnbadvli.supabase.co/storage/v1/object/public/evidence';

export function getEvidenceUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Automatically normalize any legacy BUS-03 filename references to real BUS-01 files
  const cleanUrl = url.replace(/evt_BUS-03_/g, 'evt_BUS-01_');
  const filename = cleanUrl.replace(/^\/?evidence\/?/, '');

  // Serve directly from Supabase Cloud Storage
  if (SUPABASE_STORAGE_BASE && filename) {
    return `${SUPABASE_STORAGE_BASE.replace(/\/+$/, '')}/${filename}`;
  }

  const normalizedPath = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;

  const rawApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (rawApi) {
    const isLocalhost = rawApi.includes('localhost') || rawApi.includes('127.0.0.1');
    if (!isLocalhost && (rawApi.startsWith('http://') || rawApi.startsWith('https://'))) {
      const cleanApi = rawApi.replace(/\/+$/, '').replace(/\/api$/, '');
      return `${cleanApi}${normalizedPath}`;
    }
  }

  return normalizedPath;
}
