// ServeGo — utilitários compartilhados das Edge Functions de pagamento.
// Gateway: Mercado Pago (Pix + cartão via Checkout Pro). As chaves ficam
// SOMENTE nos secrets do Supabase, nunca no front-end:
//   supabase secrets set MP_ACCESS_TOKEN=APP_USR-... MP_WEBHOOK_SECRET=... APP_URL=https://seu-dominio
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Cliente com service_role: ignora RLS. Use só depois de validar o usuário. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Usuário dono do JWT da requisição (ou null). */
export async function currentUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

const MP = "https://api.mercadopago.com";

export async function mp(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado nos secrets do Supabase.");
  const res = await fetch(MP + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Mercado Pago", res.status, body);
    throw new Error(body?.message ?? `Mercado Pago respondeu ${res.status}`);
  }
  return body;
}

export const webhookUrl = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`;
