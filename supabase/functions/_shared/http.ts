// Shared CORS headers for Edge Functions.
// 前端 invoke 时 supabase-js 会加 auth header —— 允许它过 preflight。
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}
