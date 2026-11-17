// ServeGo — webhook do Mercado Pago.
// O status NUNCA é lido do corpo da notificação: o pagamento é sempre
// consultado de novo na API do gateway antes de liberar o atendimento.
// Publique com:  supabase functions deploy payment-webhook --no-verify-jwt
import { admin, json, mp } from "../_shared/mp.ts";

async function validSignature(req: Request, dataId: string) {
  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secret) return true; // sem segredo configurado, a consulta à API é a proteção
  const sig = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=")));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === parts.v1;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    if (type !== "payment" || !dataId) return json({ ignored: true });
    if (!(await validSignature(req, dataId))) return json({ error: "assinatura inválida" }, 401);

    const p = await mp(`/v1/payments/${dataId}`);
    const paymentId = p.external_reference;
    if (!paymentId) return json({ ignored: true });

    const db = admin();
    const { data: pay } = await db.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (!pay) return json({ ignored: true });

    // confere valor: nunca libera se o pago for menor que o cobrado
    if (Number(p.transaction_amount) + 0.001 < Number(pay.amount)) {
      console.error("valor divergente", p.transaction_amount, pay.amount);
      return json({ error: "valor divergente" }, 409);
    }

    await db.from("payments").update({ provider_ref: String(p.id), updated_at: new Date().toISOString() })
      .eq("id", pay.id);

    if (p.status === "approved") {
      const { error } = await db.rpc("confirm_payment", { p_payment_id: pay.id });
      if (error) throw error;
    } else if (["rejected", "cancelled"].includes(p.status)) {
      await db.from("payments").update({ status: "failed" }).eq("id", pay.id).eq("status", "pending");
    } else if (["refunded", "charged_back"].includes(p.status)) {
      await db.from("payments").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", pay.id);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    // 500 faz o Mercado Pago reenviar a notificação mais tarde
    return json({ error: (e as Error).message }, 500);
  }
});
