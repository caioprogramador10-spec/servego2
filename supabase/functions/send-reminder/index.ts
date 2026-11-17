// ServeGo — lembrete para contas inativas (somente admin).
// POST { user_ids: string[], title, body, email: boolean }
// Sempre cria a notificação no app; com email=true também envia e-mail via Resend.
//   supabase secrets set RESEND_API_KEY=re_... REMINDER_FROM="ServeGo <oi@seu-dominio.com.br>" APP_URL=https://seu-dominio
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, cors, json } from "../_shared/mp.ts";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { user_ids, title, body, email } = await req.json();
    if (!Array.isArray(user_ids) || !user_ids.length) return json({ error: "Selecione ao menos uma conta." }, 400);
    if (user_ids.length > 500) return json({ error: "Envie no máximo 500 lembretes por vez." }, 400);

    // Executa como o próprio admin: a função do banco confere is_admin()
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: notified, error } = await asUser.rpc("admin_send_reminder", {
      p_user_ids: user_ids, p_title: title, p_body: body,
    });
    if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 400);

    const key = Deno.env.get("RESEND_API_KEY");
    let emailed = 0;
    if (email && key) {
      const { data: people } = await admin().from("profiles")
        .select("full_name, email").in("id", user_ids).neq("role", "admin").eq("status", "active");
      const from = Deno.env.get("REMINDER_FROM") ?? "ServeGo <onboarding@resend.dev>";
      const appUrl = Deno.env.get("APP_URL") ?? "";
      for (const p of people ?? []) {
        if (!p.email) continue;
        const first = String(p.full_name ?? "").split(" ")[0];
        const t = String(title).replaceAll("{nome}", first);
        const b = String(body).replaceAll("{nome}", first);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from, to: p.email, subject: t,
            html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">` +
              `<p>${esc(b).replaceAll("\n", "<br>")}</p>` +
              (appUrl ? `<p><a href="${appUrl}/app.html" style="background:#ffc31a;color:#111;padding:10px 18px;` +
                `border-radius:8px;text-decoration:none;font-weight:bold">Abrir o ServeGo</a></p>` : "") +
              `<p style="color:#888;font-size:12px">Você recebeu este e-mail porque tem uma conta no ServeGo.</p></div>`,
          }),
        });
        if (res.ok) emailed++;
        else console.error("Resend", res.status, await res.text());
      }
    }
    return json({ notified, emailed, email_configured: !!key });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
