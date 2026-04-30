const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function getAdminToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const headerToken = request.headers.get('X-Admin-Token');
  if (headerToken) return headerToken.trim();

  const url = new URL(request.url);
  return (url.searchParams.get('token') || '').trim();
}

export function requireAdmin(context) {
  const configuredToken = context.env.ADMIN_TOKEN;

  if (!configuredToken) {
    return jsonResponse({
      ok: false,
      errors: ['Admin access is not configured.'],
    }, 500);
  }

  if (getAdminToken(context.request) !== configuredToken) {
    return jsonResponse({
      ok: false,
      errors: ['Admin token is invalid.'],
    }, 401);
  }

  return null;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...JSON_HEADERS,
      Allow: 'GET, POST, OPTIONS',
    },
  });
}
