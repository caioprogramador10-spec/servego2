// ServeGo — contas da equipe (somente o dono da plataforma).
// POST { action: "create", full_name, email, phone?, admin_role, mode: "invite" | "password" }
//   → cria o login e já entra na equipe com o papel escolhido.
//     invite:   o Supabase envia um e-mail para a pessoa criar a própria senha.
//     password: devolve uma senha temporária (mostrada uma única vez no painel).
// POST { action: "temp_password", user_id } → gera nova senha temporária para um membro.
// Requer sql/13_staff_accounts.sql e o secret APP_URL (link do convite).
import { admin, cors, currentUser, json } from "../_shared/mp.ts";

const ROLES = ["finance", "moderation", "support", "ops"];

function tempPassword() {
  // sem caracteres ambíguos (0/O, 1/l/I)
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += abc[b % abc.length];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8, 12);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await currentUser(req);
    if (!me) return json({ error: "Faça login novamente." }, 401);
    const db = admin();
    const { data: caller } = await db.from("profiles").select("id, role, admin_role").eq("id", me.id).single();
    if (!caller || caller.role !== "admin" || (caller.admin_role ?? "owner") !== "owner") {
      return json({ error: "Apenas o dono da plataforma cria contas da equipe." }, 403);
    }

    const body = await req.json();

    if (body.action === "temp_password") {
      const { data: target } = await db.from("profiles").select("id, role, admin_role, full_name").eq("id", body.user_id).single();
      if (!target || target.role !== "admin" || target.admin_role === "owner") {
        return json({ error: "Só dá para gerar senha para membros da equipe (exceto o dono)." }, 400);
      }
      const password = tempPassword();
      const { error } = await db.auth.admin.updateUserById(target.id, { password });
      if (error) return json({ error: error.message }, 400);
      await db.from("admin_audit_log").insert({ admin_id: me.id, action: "staff.password", target_type: "profile", target_id: target.id, details: {} });
      return json({ ok: true, temp_password: password });
    }

    // ---- criar conta ----------------------------------------------------
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim() || null;
    const admin_role = String(body.admin_role ?? "support");
    const mode = body.mode === "password" ? "password" : "invite";
    if (full_name.length < 3) return json({ error: "Informe o nome completo." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
    if (!ROLES.includes(admin_role)) return json({ error: "Papel inválido." }, 400);

    const { data: exists } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (exists) return json({ error: "Já existe uma conta com esse e-mail. Use a tela Permissões para dar acesso a ela." }, 409);

    // autoriza o e-mail (vale mesmo com cadastros fechados)
    await db.from("staff_invites").upsert({ email, admin_role, created_by: me.id });

    const meta = { full_name, phone, role: "client" };
    let userId: string;
    let password: string | null = null;
    if (mode === "invite") {
      const redirectTo = (Deno.env.get("APP_URL") ?? "") + "/app.html";
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo });
      if (error) return json({ error: error.message }, 400);
      userId = data.user.id;
    } else {
      password = tempPassword();
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
      if (error) return json({ error: error.message }, 400);
      userId = data.user.id;
    }

    // entra na equipe (service_role + e-mail em staff_invites)
    const { error: upErr } = await db.from("profiles").update({
      role: "admin", admin_role, full_name, phone, invited_at: new Date().toISOString(), invited_by: me.id,
      identity_status: "approved",
    }).eq("id", userId);
    if (upErr) return json({ error: "Login criado, mas não foi possível dar acesso: " + upErr.message }, 500);

    await db.from("admin_audit_log").insert({
      admin_id: me.id, action: "staff.created", target_type: "profile", target_id: userId,
      details: { papel: admin_role, acesso: mode === "invite" ? "convite por e-mail" : "senha temporária" },
    });
    return json({ ok: true, user_id: userId, temp_password: password });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro inesperado." }, 500);
  }
});
