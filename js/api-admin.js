/* ==========================================================================
   ServeGo — Camada de dados do painel admin (controle total)
   Ficha 360° de usuários e pedidos, conversas, chamadas, equipe, notas
   internas, moderação de avaliações e busca global. Mesmo padrão de
   js/api.js: cada função tem a versão demo (memória) e a do Supabase.
   ========================================================================== */
(function (SG) {
  var api = SG.api;
  var K = api._kit;
  var db = K.db, DEMO = K.DEMO;
  var clone = K.clone, delay = K.delay, uid = K.uid, nowIso = K.nowIso;
  var A = api.admin;

  function sb() { return K.sb(); }
  function unwrap(r) { return K.unwrap(r); }
  function me() { var s = K.readDemoSession(); return s ? K.findProfile(s.user_id) : null; }
  function byDate(desc) {
    return function (a, b) { return desc ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at); };
  }
  /** Supabase: professional_id aponta para professionals; traz o nome do perfil. */
  var PRO_JOIN = "professional:professionals(id, profile:profiles!professionals_id_fkey(id, full_name, avatar_url))";
  function flatPro(rows) {
    (Array.isArray(rows) ? rows : [rows]).forEach(function (r) {
      if (r && r.professional && r.professional.profile) {
        r.professional = Object.assign({ id: r.professional.id }, r.professional.profile);
      }
    });
    return rows;
  }
  function log(action, type, id, details) { return A.log(action, type, id, details || {}); }
  function name(id) { var p = K.findProfile(id); return p ? p.full_name : null; }
  function slim(id) {
    var p = K.findProfile(id);
    return p ? { id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url, role: p.role } : null;
  }

  /** Papéis da equipe e o que cada um enxerga no painel. */
  A.ROLES = {
    owner: { label: "Dono", desc: "Acesso total, inclusive equipe, taxa e anonimização." },
    finance: { label: "Financeiro", desc: "Métricas, financeiro, pedidos, relatórios e auditoria." },
    moderation: { label: "Moderação", desc: "Identidades, usuários, avaliações, denúncias, disputas e conversas." },
    support: { label: "Suporte", desc: "Usuários, pedidos, conversas, disputas e comunicados." },
    ops: { label: "Operação", desc: "Pedidos, chamadas, profissionais e categorias." }
  };
  A.PERMS = {
    owner: "*",
    finance: ["/admin", "/admin/financeiro", "/admin/solicitacoes", "/admin/relatorios", "/admin/auditoria", "/admin/usuarios"],
    moderation: ["/admin", "/admin/verificacoes", "/admin/usuarios", "/admin/profissionais", "/admin/avaliacoes",
      "/admin/disputas", "/admin/denuncias", "/admin/conversas", "/admin/reengajamento"],
    support: ["/admin", "/admin/usuarios", "/admin/solicitacoes", "/admin/conversas", "/admin/disputas",
      "/admin/comunicados", "/admin/reengajamento"],
    ops: ["/admin", "/admin/solicitacoes", "/admin/chamadas", "/admin/profissionais", "/admin/categorias", "/admin/conversas"]
  };
  /** A rota é permitida para o papel? (owner ou sem papel = tudo) */
  A.can = function (adminRole, path) {
    var p = A.PERMS[adminRole || "owner"];
    if (!p || p === "*") return true;
    return p.some(function (base) { return path === base || (base !== "/admin" && path.indexOf(base + "/") === 0); });
  };

  /* ==========================================================================
     NOTAS INTERNAS
     ========================================================================== */
  A.notes = {
    list: function (type, id) {
      if (DEMO) {
        return delay(120).then(function () {
          return db.admin_notes.filter(function (n) { return n.target_type === type && n.target_id === id; })
            .sort(byDate(true)).map(function (n) { var o = clone(n); o.author = slim(n.author_id); return o; });
        });
      }
      return sb().from("admin_notes").select("*, author:profiles!admin_notes_author_id_fkey(id, full_name, avatar_url)")
        .eq("target_type", type).eq("target_id", id).order("created_at", { ascending: false }).then(unwrap);
    },
    add: function (type, id, body) {
      body = String(body || "").trim();
      if (!body) return Promise.reject(new Error("Escreva a nota."));
      if (DEMO) {
        return delay(160).then(function () {
          var n = { id: uid("note"), target_type: type, target_id: id, body: body, author_id: me() && me().id, created_at: nowIso() };
          db.admin_notes.unshift(n);
          K.persistDemo();
          return clone(n);
        });
      }
      return sb().from("admin_notes").insert({ target_type: type, target_id: id, body: body }).select().single().then(unwrap);
    },
    remove: function (noteId) {
      if (DEMO) {
        return delay(120).then(function () {
          db.admin_notes = db.admin_notes.filter(function (n) { return n.id !== noteId; });
          K.persistDemo();
        });
      }
      return sb().from("admin_notes").delete().eq("id", noteId).then(unwrap);
    }
  };

  /* ==========================================================================
     USUÁRIO 360°
     ========================================================================== */
  A.userFull = function (id) {
    if (DEMO) {
      return delay(260).then(function () {
        var p = K.findProfile(id);
        if (!p) return null;
        var u = clone(p);
        if (u.role === "professional") u.professional = K.hydrateProfessional(id);
        u.verification = clone(db.identity_verifications.filter(function (v) { return v.user_id === id; }).sort(byDate(true))[0] || null);
        u.requests = db.service_requests.filter(function (r) { return r.client_id === id || r.professional_id === id; })
          .map(K.hydrateRequest).sort(byDate(true));
        u.bookings = db.bookings.filter(function (b) { return b.client_id === id || b.professional_id === id; }).map(clone);
        u.payments = db.payments.filter(function (x) { return x.client_id === id || x.professional_id === id; }).map(clone).sort(byDate(true));
        u.transactions = db.transactions.filter(function (t) { return t.client_id === id || t.professional_id === id; })
          .map(clone).sort(byDate(true));
        u.reviewsGiven = db.reviews.filter(function (r) { return r.client_id === id; }).map(function (r) {
          var o = clone(r); o.professional = slim(r.professional_id); return o;
        });
        u.reviewsReceived = db.reviews.filter(function (r) { return r.professional_id === id; }).map(function (r) {
          var o = clone(r); o.client = slim(r.client_id); return o;
        });
        u.reportsAgainst = db.reports.filter(function (r) { return r.target_user_id === id; }).map(clone);
        u.reportsBy = db.reports.filter(function (r) { return r.reporter_id === id; }).map(clone);
        u.disputes = db.disputes.filter(function (d) { return d.client_id === id || d.professional_id === id; }).map(clone);
        var threads = {};
        db.messages.forEach(function (m) {
          if (m.sender_id !== id && m.recipient_id !== id) return;
          var t = threads[m.request_id] || (threads[m.request_id] = { request_id: m.request_id, count: 0, last: null, masked: 0 });
          t.count++;
          if (/\[(contato|link) oculto\]/.test(m.content || "")) t.masked++;
          if (!t.last || new Date(m.created_at) > new Date(t.last.created_at)) t.last = clone(m);
        });
        u.threads = Object.keys(threads).map(function (k) {
          var t = threads[k];
          var r = db.service_requests.filter(function (x) { return x.id === k; })[0];
          t.title = r ? r.title : "Conversa";
          var other = t.last.sender_id === id ? t.last.recipient_id : t.last.sender_id;
          t.other = slim(other);
          return t;
        }).sort(function (a, b) { return new Date(b.last.created_at) - new Date(a.last.created_at); });
        u.audit = db.audit_log.filter(function (a) { return a.target_id === id; }).map(clone).sort(byDate(true));
        u.notifications = db.notifications.filter(function (n) { return n.user_id === id; }).slice(0, 20).map(clone);
        return u;
      });
    }
    var or = "client_id.eq." + id + ",professional_id.eq." + id;
    return Promise.all([
      A.userDetail(id),
      sb().from("service_requests").select("*, category:categories(*), client:profiles!service_requests_client_id_fkey(id, full_name)")
        .or("client_id.eq." + id + ",professional_id.eq." + id).order("created_at", { ascending: false }).limit(100).then(unwrap),
      sb().from("payments").select("*").or(or).order("created_at", { ascending: false }).limit(100).then(unwrap),
      sb().from("transactions").select("*").or(or).order("created_at", { ascending: false }).limit(200).then(unwrap),
      sb().from("reviews").select("*, " + PRO_JOIN).eq("client_id", id).then(unwrap).then(flatPro),
      sb().from("reviews").select("*, client:profiles!reviews_client_id_fkey(id, full_name)").eq("professional_id", id).then(unwrap),
      sb().from("reports").select("*").eq("target_user_id", id).then(unwrap),
      sb().from("reports").select("*").eq("reporter_id", id).then(unwrap),
      sb().from("disputes").select("*").or(or).then(unwrap),
      sb().from("messages").select("id, request_id, sender_id, recipient_id, content, created_at")
        .or("sender_id.eq." + id + ",recipient_id.eq." + id).order("created_at", { ascending: false }).limit(500).then(unwrap),
      sb().from("admin_audit_log").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(50).then(unwrap),
      sb().from("notifications").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20).then(unwrap),
      id ? sb().from("professionals").select("id").eq("id", id).maybeSingle().then(unwrap) : null
    ]).then(function (r) {
      var u = r[0];
      if (!u) return null;
      u.requests = r[1]; u.payments = r[2]; u.transactions = r[3];
      u.reviewsGiven = r[4]; u.reviewsReceived = r[5]; u.reportsAgainst = r[6]; u.reportsBy = r[7];
      u.disputes = r[8]; u.audit = r[10]; u.notifications = r[11];
      var threads = {};
      r[9].forEach(function (m) {
        var t = threads[m.request_id] || (threads[m.request_id] = { request_id: m.request_id, count: 0, last: m, masked: 0 });
        t.count++;
        if (/\[(contato|link) oculto\]/.test(m.content || "")) t.masked++;
      });
      u.threads = Object.keys(threads).map(function (k) {
        var t = threads[k];
        var req = u.requests.filter(function (x) { return x.id === k; })[0];
        t.title = req ? req.title : "Conversa";
        return t;
      });
      var proP = u.role === "professional" ? api.professionals.get(id).then(function (p) { u.professional = p; }) : Promise.resolve();
      return proP.then(function () { return u; });
    });
  };

  /** Edita dados cadastrais (nome, celular, cidade, UF). */
  A.updateProfile = function (id, patch) {
    var allowed = {};
    ["full_name", "phone", "city", "state"].forEach(function (k) { if (patch[k] !== undefined) allowed[k] = patch[k] || null; });
    if (DEMO) {
      return delay(220).then(function () {
        Object.assign(K.findProfile(id), allowed);
        K.persistDemo();
        return log("user.edited", "profile", id, { campos: Object.keys(allowed).join(", ") });
      });
    }
    return sb().from("profiles").update(allowed).eq("id", id).then(unwrap)
      .then(function () { return log("user.edited", "profile", id, { campos: Object.keys(allowed).join(", ") }); });
  };

  /** Edita o perfil profissional (vitrine, preço, raio, online, destaque). */
  A.updateProfessional = function (id, patch) {
    var allowed = {};
    ["headline", "bio", "base_price", "hourly_rate", "service_radius_km", "experience_years", "is_available", "featured"]
      .forEach(function (k) { if (patch[k] !== undefined) allowed[k] = patch[k]; });
    var detail = { campos: Object.keys(allowed).join(", ") };
    if (DEMO) {
      return delay(220).then(function () {
        Object.assign(K.findPro(id), allowed);
        K.persistDemo();
        return log(allowed.featured !== undefined && Object.keys(allowed).length === 1
          ? (allowed.featured ? "professional.featured" : "professional.unfeatured") : "professional.edited", "profile", id, detail);
      });
    }
    return sb().from("professionals").update(allowed).eq("id", id).then(unwrap)
      .then(function () { return log("professional.edited", "profile", id, detail); });
  };

  A.setProfessionalCategories = function (id, categoryIds) {
    return api.professionals.setCategories(id, categoryIds).then(function () {
      if (DEMO) K.persistDemo();
      return log("professional.categories", "profile", id, { total: categoryIds.length });
    });
  };

  /** Suspende até uma data (null = remove a suspensão). */
  A.suspend = function (id, untilIso, reason) {
    var action = untilIso ? "user.suspended" : "user.unsuspended";
    var details = untilIso ? { ate: untilIso, motivo: reason || null } : {};
    var note = function () {
      if (!untilIso) return null;
      return A.notifyUser(id, "Sua conta foi suspensa temporariamente",
        "Até " + new Date(untilIso).toLocaleDateString(SG.config.app.locale) + (reason ? ". Motivo: " + reason : "."), "#/ajuda", true);
    };
    if (DEMO) {
      return delay(220).then(function () {
        K.findProfile(id).suspended_until = untilIso;
        K.persistDemo();
        return Promise.all([log(action, "profile", id, details), note()]);
      });
    }
    return sb().from("profiles").update({ suspended_until: untilIso }).eq("id", id).then(unwrap)
      .then(function () { return Promise.all([log(action, "profile", id, details), note()]); });
  };

  /** Troca o papel (cliente, profissional, admin) e o papel na equipe. Só o dono. */
  A.setRole = function (id, role, adminRole) {
    var patch = { role: role, admin_role: role === "admin" ? (adminRole || "support") : null };
    if (DEMO) {
      return delay(260).then(function () {
        var m = me();
        if (!m || (m.admin_role || "owner") !== "owner") throw new Error("Apenas o dono da plataforma pode alterar papéis e permissões.");
        var p = K.findProfile(id);
        if (p.admin_role === "owner" && patch.admin_role !== "owner" &&
            db.profiles.filter(function (x) { return x.admin_role === "owner" && x.id !== id; }).length === 0) {
          throw new Error("A plataforma precisa de pelo menos um dono.");
        }
        var old = p.role + (p.admin_role ? "/" + p.admin_role : "");
        Object.assign(p, patch);
        if (role === "professional" && !K.findPro(id)) {
          db.professionals.push({ id: id, headline: null, bio: null, base_price: null, service_radius_km: 10, is_available: false,
            verified: false, verification_status: "pending", rating: 0, reviews_count: 0, jobs_count: 0, created_at: nowIso() });
        }
        K.persistDemo();
        return log("team.role", "profile", id, { de: old, para: role + (patch.admin_role ? "/" + patch.admin_role : "") });
      });
    }
    return sb().from("profiles").update(patch).eq("id", id).then(unwrap)
      .then(function () { return log("team.role", "profile", id, { para: role + (patch.admin_role ? "/" + patch.admin_role : "") }); });
  };

  A.team = function () {
    if (DEMO) {
      return delay(160).then(function () {
        return db.profiles.filter(function (p) { return p.role === "admin"; }).map(clone);
      });
    }
    return sb().from("profiles").select("*").eq("role", "admin").order("created_at").then(unwrap);
  };

  /* ---- Contas da equipe (criadas pelo dono) ------------------------------- */
  function demoTempPassword() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789", out = "";
    var bytes = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(12)) : [];
    for (var i = 0; i < 12; i++) out += abc[(bytes[i] !== undefined ? bytes[i] : Math.floor(Math.random() * 256)) % abc.length];
    return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8, 12);
  }
  function callStaffFn(body) {
    return sb().functions.invoke("admin-create-user", { body: body }).then(function (res) {
      if (res.error) {
        // a função devolve { error } no corpo; o SDK embrulha em FunctionsHttpError
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === "function") {
          return ctx.json().then(function (j) { throw new Error((j && j.error) || res.error.message); });
        }
        throw res.error;
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      return res.data;
    });
  }

  A.staff = {
    /** Cria a conta já dentro da equipe. mode: "invite" (e-mail) ou "password" (senha temporária). */
    create: function (p) {
      var email = String(p.email || "").trim().toLowerCase();
      var name = String(p.full_name || "").trim();
      if (name.length < 3) return Promise.reject(new Error("Informe o nome completo."));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.reject(new Error("E-mail inválido."));
      if (!A.ROLES[p.admin_role] || p.admin_role === "owner") return Promise.reject(new Error("Escolha o papel."));
      if (DEMO) {
        return delay(500).then(function () {
          var m = me();
          if (!m || (m.admin_role || "owner") !== "owner") throw new Error("Apenas o dono da plataforma cria contas da equipe.");
          if (db.profiles.some(function (x) { return (x.email || "").toLowerCase() === email; })) {
            throw new Error("Já existe uma conta com esse e-mail. Use a tela Permissões para dar acesso a ela.");
          }
          var id = uid("user");
          db.profiles.push({ id: id, full_name: name, email: email, phone: p.phone || null, avatar_url: null,
            city: null, state: null, role: "admin", admin_role: p.admin_role, status: "active", identity_status: "approved",
            created_at: nowIso(), invited_at: nowIso(), invited_by: m.id, last_seen_at: null });
          K.persistDemo();
          var pass = p.mode === "password" ? demoTempPassword() : null;
          return log("staff.created", "profile", id, { papel: p.admin_role, acesso: pass ? "senha temporária" : "convite por e-mail" })
            .then(function () { return { user_id: id, temp_password: pass }; });
        });
      }
      return callStaffFn({ action: "create", full_name: name, email: email, phone: p.phone || null, admin_role: p.admin_role, mode: p.mode });
    },
    /** Gera uma nova senha temporária (mostrada uma vez). */
    tempPassword: function (userId) {
      if (DEMO) {
        return delay(400).then(function () {
          return log("staff.password", "profile", userId).then(function () { return { temp_password: demoTempPassword() }; });
        });
      }
      return callStaffFn({ action: "temp_password", user_id: userId });
    },
    /** Envia por e-mail o link para a pessoa criar/redefinir a senha. */
    sendAccessLink: function (u) {
      var p = DEMO ? delay(300) : api.auth.resetPassword(u.email);
      return p.then(function () { return log("staff.link", "profile", u.id, { email: u.email }); });
    }
  };

  A.findUserByEmail = function (email) {
    email = String(email || "").trim().toLowerCase();
    if (DEMO) {
      return delay(160).then(function () {
        return clone(db.profiles.filter(function (p) { return (p.email || "").toLowerCase() === email; })[0] || null);
      });
    }
    return sb().from("profiles").select("*").ilike("email", email).maybeSingle().then(unwrap);
  };

  /** Notificação direta para um usuário. */
  A.notifyUser = function (id, title, body, link, silent) {
    if (DEMO) {
      return delay(160).then(function () {
        K.notify(id, "admin", title, body, link || null);
        K.persistDemo();
        return silent ? null : log("notification.sent", "profile", id, { titulo: title });
      });
    }
    return sb().from("notifications").insert({ user_id: id, type: "admin", title: title, body: body, link: link || null })
      .then(unwrap).then(function () { return silent ? null : log("notification.sent", "profile", id, { titulo: title }); });
  };

  /** LGPD: apaga dados pessoais e bloqueia a conta (só o dono). */
  A.anonymize = function (id) {
    if (DEMO) {
      return delay(300).then(function () {
        var m = me();
        if (!m || (m.admin_role || "owner") !== "owner") throw new Error("Apenas o dono da plataforma pode anonimizar contas.");
        if (m.id === id) throw new Error("Você não pode anonimizar a própria conta.");
        var p = K.findProfile(id);
        Object.assign(p, {
          full_name: "Usuário removido", email: "removido+" + id.slice(0, 8) + "@servego.invalid",
          phone: null, avatar_url: null, city: null, state: null, cpf: null, birth_date: null,
          status: "blocked", anonymized_at: nowIso()
        });
        var pro = K.findPro(id);
        if (pro) Object.assign(pro, { bio: null, headline: null, is_available: false });
        K.persistDemo();
        return log("user.anonymized", "profile", id);
      });
    }
    return sb().rpc("admin_anonymize_user", { p_user_id: id }).then(unwrap);
  };

  /** Todos os dados de uma conta (pedido de acesso/portabilidade da LGPD). */
  A.exportUser = function (id) {
    return A.userFull(id).then(function (u) {
      return Promise.resolve(DEMO ? null : sb().from("profile_private").select("*").eq("user_id", id).maybeSingle().then(unwrap))
        .then(function (priv) {
          return {
            gerado_em: nowIso(),
            conta: u,
            dados_privados: DEMO ? { cpf: u.cpf || null, birth_date: u.birth_date || null } : priv
          };
        });
    });
  };

  /* ==========================================================================
     PEDIDO 360°
     ========================================================================== */
  A.requestFull = function (id) {
    if (DEMO) {
      return delay(260).then(function () {
        var raw = db.service_requests.filter(function (x) { return x.id === id; })[0];
        if (!raw) return null;
        var r = K.hydrateRequest(raw);
        r.offers = db.dispatch_offers.filter(function (o) { return o.request_id === id; }).sort(byDate(false)).map(function (o) {
          var c = clone(o); c.professional = slim(o.professional_id); return c;
        });
        r.payments = db.payments.filter(function (x) { return x.request_id === id; }).map(clone).sort(byDate(true));
        var bk = db.bookings.filter(function (b) { return b.request_id === id; })[0];
        r.booking = bk ? clone(bk) : null;
        r.events = bk ? db.booking_events.filter(function (e) { return e.booking_id === bk.id; }).map(clone).sort(byDate(false)) : [];
        r.messages = db.messages.filter(function (m) { return m.request_id === id; }).sort(byDate(false)).map(function (m) {
          var c = clone(m); c.sender = slim(m.sender_id); return c;
        });
        r.review = bk ? clone(db.reviews.filter(function (x) { return x.booking_id === bk.id; })[0] || null) : null;
        r.dispute = bk ? clone(db.disputes.filter(function (d) { return d.booking_id === bk.id; })[0] || null) : null;
        r.transaction = bk ? clone(db.transactions.filter(function (t) { return t.booking_id === bk.id; })[0] || null) : null;
        r.audit = db.audit_log.filter(function (a) { return a.target_id === id || (bk && a.target_id === bk.id); }).map(clone).sort(byDate(true));
        r.pro = r.professional_id ? slim(r.professional_id) : null;
        return r;
      });
    }
    return sb().from("service_requests")
      .select("*, category:categories(*), client:profiles!service_requests_client_id_fkey(id, full_name, email, phone, avatar_url), photos:service_photos(*)")
      .eq("id", id).maybeSingle().then(unwrap).then(function (r) {
        if (!r) return null;
        return Promise.all([
          sb().from("dispatch_offers").select("*, " + PRO_JOIN)
            .eq("request_id", id).order("created_at").then(unwrap).then(flatPro),
          sb().from("payments").select("*").eq("request_id", id).order("created_at", { ascending: false }).then(unwrap),
          sb().from("bookings").select("*").eq("request_id", id).maybeSingle().then(unwrap),
          sb().from("messages").select("*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)")
            .eq("request_id", id).order("created_at").then(unwrap),
          sb().from("admin_audit_log").select("*").eq("target_id", id).order("created_at", { ascending: false }).then(unwrap),
          r.professional_id ? sb().from("profiles").select("id, full_name, email, avatar_url").eq("id", r.professional_id).maybeSingle().then(unwrap) : null
        ]).then(function (x) {
          r.offers = x[0]; r.payments = x[1]; r.payment = x[1][0] || null; r.booking = x[2]; r.messages = x[3]; r.audit = x[4]; r.pro = x[5];
          if (!r.booking) { r.events = []; r.review = null; r.dispute = null; r.transaction = null; return r; }
          var bid = r.booking.id;
          return Promise.all([
            sb().from("booking_events").select("*").eq("booking_id", bid).order("created_at").then(unwrap),
            sb().from("reviews").select("*").eq("booking_id", bid).maybeSingle().then(unwrap),
            sb().from("disputes").select("*").eq("booking_id", bid).maybeSingle().then(unwrap),
            sb().from("transactions").select("*").eq("booking_id", bid).maybeSingle().then(unwrap)
          ]).then(function (y) { r.events = y[0]; r.review = y[1]; r.dispute = y[2]; r.transaction = y[3]; return r; });
        });
      });
  };

  /** Relança a chamada: cancela a oferta pendente e chama o próximo. */
  A.redispatch = function (requestId) {
    if (DEMO) {
      return delay(300).then(function () {
        var req = db.service_requests.filter(function (r) { return r.id === requestId; })[0];
        if (!req) throw new Error("Solicitação não encontrada.");
        if (["open", "matching", "no_professional"].indexOf(req.status) < 0) {
          throw new Error("Só dá para relançar pedidos que ainda procuram profissional.");
        }
        db.dispatch_offers.forEach(function (o) {
          if (o.request_id === requestId && o.status === "pending") { o.status = "cancelled"; o.responded_at = nowIso(); }
        });
        req.status = "matching";
        var o = K.dispatchNext(req);
        if (!o) req.status = "no_professional";
        K.persistDemo();
        return log("request.redispatch", "request", requestId).then(function () { return o ? K.hydrateDispatch(o) : null; });
      });
    }
    return sb().rpc("admin_redispatch", { p_request_id: requestId }).then(unwrap);
  };

  /** Cancela o pedido; se pago, estorna (gateway via Edge Function). */
  A.cancelRequest = function (requestId, reason, refund) {
    if (DEMO) {
      return delay(320).then(function () {
        var req = db.service_requests.filter(function (r) { return r.id === requestId; })[0];
        if (!req) throw new Error("Solicitação não encontrada.");
        if (req.status === "completed") throw new Error("O serviço já foi concluído. Use a disputa ou o estorno no Financeiro.");
        db.dispatch_offers.forEach(function (o) {
          if (o.request_id === requestId && o.status === "pending") { o.status = "cancelled"; o.responded_at = nowIso(); }
        });
        var bk = db.bookings.filter(function (b) { return b.request_id === requestId; })[0];
        if (bk && ["completed", "cancelled"].indexOf(bk.status) < 0) {
          bk.status = "cancelled"; bk.cancelled_at = nowIso(); bk.cancel_reason = reason || null;
          db.booking_events.push({ id: uid("ev"), booking_id: bk.id, status: "cancelled", note: "Cancelado pela equipe: " + (reason || ""), created_at: nowIso() });
        }
        var refunded = false;
        if (refund) {
          db.payments.forEach(function (p) {
            if (p.request_id === requestId && p.status === "paid") {
              p.status = "refunded"; p.refunded_at = nowIso(); p.refund_amount = p.amount; refunded = true;
            }
          });
        }
        req.status = "cancelled";
        K.notify(req.client_id, "request", "Pedido cancelado pela equipe ServeGo",
          (reason || "Entre em contato com o suporte se tiver dúvidas.") + (refunded ? " O valor será estornado." : ""), "#/solicitacao/" + req.id);
        if (req.professional_id) K.notify(req.professional_id, "request", "Serviço cancelado pela equipe ServeGo", reason || req.title, "#/servicos");
        K.persistDemo();
        return Promise.all([
          log("request.cancelled", "request", requestId, { motivo: reason || null }),
          refunded ? log("payment.refunded", "request", requestId, { motivo: reason || null }) : null
        ]);
      });
    }
    var refundStep = Promise.resolve();
    if (refund) {
      refundStep = sb().from("bookings").select("id").eq("request_id", requestId).maybeSingle().then(unwrap).then(function (b) {
        if (!b) return null;
        return api.bookings.cancel(b.id, reason);   // Edge Function refund-payment (admin pode sempre)
      });
    }
    return refundStep.then(function () {
      return sb().rpc("admin_cancel_request", { p_request_id: requestId, p_reason: reason || null }).then(unwrap);
    });
  };

  /** Força a situação do serviço (corrige casos travados). */
  A.setBookingStatus = function (bookingId, status, reason) {
    if (DEMO) {
      return delay(260).then(function () {
        var b = db.bookings.filter(function (x) { return x.id === bookingId; })[0];
        if (!b) throw new Error("Serviço não encontrado.");
        var old = b.status;
        b.status = status; b.updated_at = nowIso();
        if (status === "completed") {
          b.completed_at = nowIso(); b.confirmed_at = nowIso(); b.confirmed_by = "admin";
          var req = db.service_requests.filter(function (r) { return r.id === b.request_id; })[0];
          if (req) req.status = "completed";
          if (!db.transactions.some(function (t) { return t.booking_id === b.id; })) {
            var fee = Math.round(Number(b.price || 0) * SG.config.app.platformFeePercent) / 100;
            db.transactions.unshift({ id: uid("tx"), booking_id: b.id, professional_id: b.professional_id, client_id: b.client_id,
              amount: Number(b.price || 0), platform_fee: fee, net_amount: Number(b.price || 0) - fee, status: "pending", created_at: nowIso() });
          }
        }
        db.booking_events.push({ id: uid("ev"), booking_id: b.id, status: status, note: "Alterado pela equipe" + (reason ? ": " + reason : ""), created_at: nowIso() });
        K.persistDemo();
        return log("booking.status", "booking", bookingId, { de: old, para: status, motivo: reason || null });
      });
    }
    return sb().from("bookings").update({ status: status }).eq("id", bookingId).then(unwrap).then(function () {
      return sb().from("booking_events").insert({ booking_id: bookingId, status: status, note: "Alterado pela equipe" + (reason ? ": " + reason : "") });
    }).then(function () { return log("booking.status", "booking", bookingId, { para: status, motivo: reason || null }); });
  };

  /* ==========================================================================
     CONVERSAS
     ========================================================================== */
  A.conversations = function () {
    if (DEMO) {
      return delay(220).then(function () {
        var by = {};
        db.messages.forEach(function (m) {
          var t = by[m.request_id] || (by[m.request_id] = { request_id: m.request_id, count: 0, masked: 0, images: 0, last: null, people: {} });
          t.count++;
          if (/\[(contato|link) oculto\]/.test(m.content || "")) t.masked++;
          if (m.image_url) t.images++;
          t.people[m.sender_id] = 1; t.people[m.recipient_id] = 1;
          if (!t.last || new Date(m.created_at) > new Date(t.last.created_at)) t.last = clone(m);
        });
        return Object.keys(by).map(function (k) {
          var t = by[k];
          var r = db.service_requests.filter(function (x) { return x.id === k; })[0];
          t.request = r ? { id: r.id, title: r.title, status: r.status, category_id: r.category_id } : null;
          t.category = r ? clone(K.findCat(r.category_id)) : null;
          t.client = r ? slim(r.client_id) : null;
          var proId = Object.keys(t.people).filter(function (p) { return !r || p !== r.client_id; })[0];
          t.professional = slim(proId);
          var bk = r && db.bookings.filter(function (b) { return b.request_id === r.id; })[0];
          t.disputed = !!(bk && db.disputes.some(function (d) { return d.booking_id === bk.id; }));
          delete t.people;
          return t;
        }).sort(function (a, b) { return new Date(b.last.created_at) - new Date(a.last.created_at); });
      });
    }
    return sb().from("messages")
      .select("id, request_id, sender_id, recipient_id, content, image_url, created_at, request:service_requests(id, title, status, client_id, category:categories(*))")
      .order("created_at", { ascending: false }).limit(2000).then(unwrap).then(function (rows) {
        var by = {}, ids = {};
        rows.forEach(function (m) {
          var t = by[m.request_id] || (by[m.request_id] = { request_id: m.request_id, count: 0, masked: 0, images: 0, last: m,
            request: m.request, category: m.request && m.request.category, people: {} });
          t.count++;
          if (/\[(contato|link) oculto\]/.test(m.content || "")) t.masked++;
          if (m.image_url) t.images++;
          t.people[m.sender_id] = 1; t.people[m.recipient_id] = 1;
          ids[m.sender_id] = 1; ids[m.recipient_id] = 1;
        });
        return sb().from("profiles").select("id, full_name, email, avatar_url, role").in("id", Object.keys(ids)).then(unwrap).then(function (ps) {
          var map = {};
          ps.forEach(function (p) { map[p.id] = p; });
          return Object.keys(by).map(function (k) {
            var t = by[k];
            var clientId = t.request && t.request.client_id;
            t.client = map[clientId] || null;
            t.professional = map[Object.keys(t.people).filter(function (p) { return p !== clientId; })[0]] || null;
            t.disputed = false;
            delete t.people;
            return t;
          });
        });
      });
  };

  /* ==========================================================================
     CHAMADAS (despacho)
     ========================================================================== */
  A.dispatchOffers = function () {
    if (DEMO) {
      return delay(220).then(function () {
        return db.dispatch_offers.map(function (o) {
          var c = clone(o);
          c.professional = slim(o.professional_id);
          var r = db.service_requests.filter(function (x) { return x.id === o.request_id; })[0];
          c.request = r ? { id: r.id, title: r.title, status: r.status, urgency: r.urgency, category: clone(K.findCat(r.category_id)) } : null;
          return c;
        }).sort(byDate(true));
      });
    }
    return sb().from("dispatch_offers")
      .select("*, " + PRO_JOIN + ", request:service_requests(id, title, status, urgency, category:categories(*))")
      .order("created_at", { ascending: false }).limit(1000).then(unwrap).then(flatPro);
  };

  /* ==========================================================================
     AVALIAÇÕES
     ========================================================================== */
  /* No demo a nota semeada representa centenas de avaliações que não existem
     na base; então só tiramos (ou devolvemos) o peso da avaliação alterada.
     No Supabase o banco recalcula a média inteira (refresh_professional_rating). */
  function demoRecalc(review, hidden) {
    var pro = K.findPro(review.professional_id);
    if (!pro) return;
    var n = Number(pro.reviews_count || 0), avg = Number(pro.rating || 0), r = Number(review.rating);
    if (hidden) {
      pro.reviews_count = Math.max(0, n - 1);
      pro.rating = n > 1 ? Math.round((avg * n - r) / (n - 1) * 100) / 100 : 0;
    } else {
      pro.reviews_count = n + 1;
      pro.rating = Math.round((avg * n + r) / (n + 1) * 100) / 100;
    }
  }

  A.setReviewHidden = function (id, hidden, reason) {
    var action = hidden ? "review.hidden" : "review.restored";
    if (DEMO) {
      return delay(200).then(function () {
        var r = db.reviews.filter(function (x) { return x.id === id; })[0];
        if (!!r.hidden !== !!hidden) demoRecalc(r, hidden);
        r.hidden = hidden; r.hidden_reason = hidden ? (reason || null) : null;
        K.persistDemo();
        return log(action, "review", id, hidden ? { motivo: reason || null } : {});
      });
    }
    return sb().from("reviews").update({ hidden: hidden, hidden_reason: hidden ? (reason || null) : null }).eq("id", id).then(unwrap)
      .then(function () { return log(action, "review", id, hidden ? { motivo: reason || null } : {}); });
  };

  A.removeReply = function (id) {
    if (DEMO) {
      return delay(180).then(function () {
        var r = db.reviews.filter(function (x) { return x.id === id; })[0];
        r.reply = null; r.replied_at = null;
        K.persistDemo();
        return log("review.reply_removed", "review", id);
      });
    }
    return sb().from("reviews").update({ reply: null, replied_at: null }).eq("id", id).then(unwrap)
      .then(function () { return log("review.reply_removed", "review", id); });
  };

  /* ==========================================================================
     BUSCA GLOBAL
     ========================================================================== */
  A.search = function (q) {
    q = String(q || "").trim().toLowerCase();
    var digits = q.replace(/\D/g, "");
    if (q.length < 2) return Promise.resolve({ users: [], requests: [], payments: [], disputes: [] });
    if (DEMO) {
      return delay(120).then(function () {
        var has = function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; };
        var users = db.profiles.filter(function (p) {
          return has(p.full_name) || has(p.email) || has(p.phone) || has(p.id) ||
            (digits.length >= 3 && String(p.cpf || "").replace(/\D/g, "").indexOf(digits) >= 0);
        }).slice(0, 8).map(clone);
        var requests = db.service_requests.filter(function (r) {
          var c = K.findProfile(r.client_id) || {};
          return has(r.title) || has(r.address) || has(r.id) || has(c.full_name);
        }).slice(0, 8).map(function (r) { var o = clone(r); o.client = slim(r.client_id); o.category = clone(K.findCat(r.category_id)); return o; });
        var payments = db.payments.filter(function (p) { return has(p.id) || has(p.provider_ref) || has(p.request_id); })
          .slice(0, 5).map(clone);
        var disputes = db.disputes.filter(function (d) { return has(d.id) || has(d.reason) || has(d.booking_id); }).slice(0, 5).map(clone);
        return { users: users, requests: requests, payments: payments, disputes: disputes };
      });
    }
    var like = "%" + q.replace(/[%_,()]/g, " ") + "%";
    return Promise.all([
      sb().from("profiles").select("id, full_name, email, phone, role, status, avatar_url")
        .or("full_name.ilike." + like + ",email.ilike." + like + ",phone.ilike." + like).limit(8).then(unwrap),
      digits.length >= 3
        ? sb().from("profile_private").select("user_id").like("cpf", "%" + digits + "%").limit(5).then(unwrap)
        : Promise.resolve([]),
      sb().from("service_requests").select("id, title, status, address, client_id, category:categories(*)")
        .or("title.ilike." + like + ",address.ilike." + like).limit(8).then(unwrap),
      sb().from("payments").select("*").ilike("provider_ref", like).limit(5).then(unwrap),
      sb().from("disputes").select("*").ilike("reason", like).limit(5).then(unwrap)
    ]).then(function (r) {
      var extra = r[1].map(function (x) { return x.user_id; }).filter(function (id) {
        return !r[0].some(function (u) { return u.id === id; });
      });
      var more = extra.length ? sb().from("profiles").select("id, full_name, email, phone, role, status, avatar_url").in("id", extra).then(unwrap) : Promise.resolve([]);
      return more.then(function (m) { return { users: r[0].concat(m), requests: r[2], payments: r[3], disputes: r[4] }; });
    });
  };

  /* ==========================================================================
     RELATÓRIOS — dados brutos para exportação
     ========================================================================== */
  A.dataset = function (table) {
    var demoMap = {
      profiles: function () { return db.profiles; },
      professionals: function () { return db.professionals.map(function (p) { return Object.assign({ full_name: name(p.id) }, p); }); },
      service_requests: function () { return db.service_requests; },
      bookings: function () { return db.bookings; },
      payments: function () { return db.payments; },
      transactions: function () { return db.transactions; },
      reviews: function () { return db.reviews; },
      reports: function () { return db.reports; },
      disputes: function () { return db.disputes; },
      dispatch_offers: function () { return db.dispatch_offers; },
      messages: function () { return db.messages; },
      admin_audit_log: function () { return db.audit_log; },
      categories: function () { return db.categories; }
    };
    if (DEMO) return delay(120).then(function () { return clone((demoMap[table] || function () { return []; })()); });
    return sb().from(table).select("*").order("created_at", { ascending: false }).limit(10000).then(unwrap);
  };
})(window.SG);
