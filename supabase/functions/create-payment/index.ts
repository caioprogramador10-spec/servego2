// ServeGo — cria a cobrança do serviço (cliente paga ANTES do atendimento).
// POST { request_id, method: "pix" | "card" }  (com o JWT do cliente)
// → { payment }  com QR Pix (copia e cola + imagem) ou checkout_url (cartão)
import { admin, cors, currentUser, json, mp, webhookUrl } from "../_shared/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const user = await currentUser(req);
    if (!user) return json({ error: "Faça login para pagar." }, 401);

    const { request_id, method } = await req.json();
    if (!["pix", "card"].includes(method)) return json({ error: "Forma de pagamento inválida." }, 400);

    const db = admin();
    const { data: r } = await db.from("service_requests")
      .select("id, client_id, professional_id, title, price, status, payment_due_at")
      .eq("id", request_id).maybeSingle();

    if (!r || r.client_id !== user.id) return json({ error: "Solicitação não encontrada." }, 404);
    if (r.status !== "awaiting_payment" || !r.price) {
      return json({ error: "Esta solicitação não está aguardando pagamento." }, 409);
    }
    if (r.payment_due_at && new Date(r.payment_due_at) < new Date()) {
      await db.rpc("expire_unpaid", { p_request_id: r.id });
      return json({ error: "O prazo para pagar acabou. Faça uma nova solicitação." }, 410);
    }

    // reaproveita a cobrança pendente do mesmo método (evita cobrar duas vezes)
    const { data: existing } = await db.from("payments").select("*")
      .eq("request_id", r.id).eq("method", method).eq("status", "pending")
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (existing) return json({ payment: existing });

    const { data: feePct } = await db.rpc("platform_fee_percent");
    const amount = Number(r.price);
    const fee = Math.round(amount * Number(feePct ?? 10)) / 100;
    const expiresAt = new Date(Math.min(
      Date.now() + 15 * 60_000,
      r.payment_due_at ? new Date(r.payment_due_at).getTime() : Infinity,
    ));

    const { data: pay, error } = await db.from("payments").insert({
      request_id: r.id, client_id: r.client_id, professional_id: r.professional_id,
      amount, platform_fee: fee, method, provider: "mercadopago", expires_at: expiresAt.toISOString(),
    }).select().single();
    if (error) throw error;

    const [{ data: profile }, { data: priv }] = await Promise.all([
      db.from("profiles").select("full_name, email").eq("id", user.id).single(),
      db.from("profile_private").select("cpf").eq("user_id", user.id).maybeSingle(),
    ]);
    const [firstName, ...rest] = String(profile?.full_name ?? "Cliente").split(" ");
    const description = `ServeGo · ${r.title}`.slice(0, 120);

    let patch: Record<string, unknown>;
    if (method === "pix") {
      const p = await mp("/v1/payments", {
        method: "POST",
        idempotencyKey: pay.id,
        body: JSON.stringify({
          transaction_amount: amount,
          description,
          payment_method_id: "pix",
          external_reference: pay.id,
          notification_url: webhookUrl(),
          date_of_expiration: expiresAt.toISOString().replace("Z", "-00:00"),
          payer: {
            email: profile?.email ?? user.email,
            first_name: firstName,
            last_name: rest.join(" ") || firstName,
            ...(priv?.cpf ? { identification: { type: "CPF", number: priv.cpf } } : {}),
          },
        }),
      });
      const tx = p.point_of_interaction?.transaction_data ?? {};
      patch = { provider_ref: String(p.id), pix_qr_code: tx.qr_code, pix_qr_base64: tx.qr_code_base64 };
    } else {
      const appUrl = Deno.env.get("APP_URL") ?? "";
      const pref = await mp("/checkout/preferences", {
        method: "POST",
        idempotencyKey: pay.id,
        body: JSON.stringify({
          items: [{ title: description, quantity: 1, unit_price: amount, currency_id: "BRL" }],
          external_reference: pay.id,
          notification_url: webhookUrl(),
          expires: true,
          expiration_date_to: expiresAt.toISOString().replace("Z", "-00:00"),
          payer: { email: profile?.email ?? user.email, name: firstName },
          payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], installments: 12 },
          back_urls: {
            success: `${appUrl}/app.html#/solicitacao/${r.id}`,
            pending: `${appUrl}/app.html#/solicitacao/${r.id}`,
            failure: `${appUrl}/app.html#/solicitacao/${r.id}`,
          },
          auto_return: "approved",
        }),
      });
      patch = { checkout_url: pref.init_point };
    }

    const { data: saved } = await db.from("payments").update(patch).eq("id", pay.id).select().single();
    return json({ payment: saved });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Falha ao criar o pagamento." }, 500);
  }
});
