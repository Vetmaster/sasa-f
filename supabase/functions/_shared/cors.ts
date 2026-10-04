const ALLOWED_WEB_ORIGINS = new Set([
  'https://sasa-f.com',
  'https://www.sasa-f.com'
]);

const DEFAULT_ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info';

export function corsHeadersForRequest(
  request: Request,
  allowedHeaders = DEFAULT_ALLOWED_HEADERS
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_WEB_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function handleCorsPreflight(
  request: Request,
  allowedHeaders = DEFAULT_ALLOWED_HEADERS
): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = request.headers.get('Origin');
  const headers = corsHeadersForRequest(request, allowedHeaders);
  if (origin && !ALLOWED_WEB_ORIGINS.has(origin)) {
    return new Response('Origin not allowed', { status: 403, headers });
  }
  return new Response(null, { status: 204, headers });
}
