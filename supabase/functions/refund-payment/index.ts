// ServeGo — cancelamento com estorno.
// POST { booking_id, reason }  (JWT do cliente, do profissional ou do admin)
// Regra: estorno integral enquanto o profissional não saiu ("a caminho").
// Depois disso o cancelamento vira disputa e é tratado pelo admin.
import { admin, cors, currentUser, json, mp } from "../_shared/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const user = await currentUser(req);
    if (!user) return json({ error: "Faça login." }, 401);
    const { booking_id, reason } = await req.json();

    const db = admin();
    const { data: bk } = await db.from("bookings").select("*").eq("id", booking_id).maybeSingle();
    if (!bk) return json({ error: "Serviço não encontrado." }, 404);

    const { data: me } = await db.from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = me?.role === "admin";
    if (!isAdmin && user.id !== bk.client_id && user.id !== bk.professional_id) {
      return json({ error: "Acesso negado." }, 403);
    }
    if (!isAdmin && bk.status !== "accepted") {
      return json({ error: "O profissional já está a caminho. Abra uma disputa pelo suporte." }, 409);
    }

    const { data: pay } = await db.from("payments").select("*").eq("id", bk.payment_id).maybeSingle();
    if (pay?.status === "paid" && pay.provider_ref) {
      await mp(`/v1/payments/${pay.provider_ref}/refunds`, {
        method: "POST",
        idempotencyKey: `refund-${pay.id}`,
        body: JSON.stringify({}),
      });
      await db.from("payments").update({
        status: "refunded", refunded_at: new Date().toISOString(), refund_amount: pay.amount,
      }).eq("id", pay.id);
    }

    const by = user.id === bk.client_id ? "cliente" : user.id === bk.professional_id ? "profissional" : "suporte";
    await db.from("bookings").update({
      status: "cancelled", cancelled_at: new Date().toISOString(),
      cancel_reason: reason || `Cancelado pelo ${by}`,
    }).eq("id", bk.id);
    await db.from("service_requests").update({ status: "cancelled" }).eq("id", bk.request_id);
    // disputa decidida a favor do cliente: fecha a disputa com a justificativa
    if (isAdmin && bk.status === "disputed") {
      await db.from("disputes").update({
        status: "resolved_refund", decision_reason: reason || "Estorno integral ao cliente.",
        decided_by: user.id, decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("booking_id", bk.id);
    }
    await db.from("reports").update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("booking_id", bk.id).in("status", ["open", "reviewing"]);

    const other = user.id === bk.client_id ? bk.professional_id : bk.client_id;
    await db.rpc("notify", {
      p_user_id: other, p_type: "status", p_title: "Serviço cancelado",
      p_body: pay?.status === "paid" ? "O pagamento foi estornado integralmente ao cliente." : "O atendimento foi cancelado.",
      p_link: "#/inicio",
    });
    return json({ ok: true, refunded: pay?.status === "paid" });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
