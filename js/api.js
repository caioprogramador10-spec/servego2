/* ==========================================================================
   ServeGo — Camada de dados
   --------------------------------------------------------------------------
   Cada função tem duas implementações: Supabase (produção) e base em memória
   (modo demo). As telas consomem SEMPRE esta camada — nunca o SDK direto.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui;
  var api = {};
  var DEMO = SG.isDemo();
  var db = SG.mock.data;

  /* Persistência leve do modo demo: cadastros, verificações de identidade e
     ações do admin sobrevivem ao recarregar a página (a troca de perfil e o
     "Sair" recarregam). Sem localStorage, tudo continua só em memória. */
  var DEMO_KEY = "servego.demo.db.v1";
  var DEMO_TABLES = ["profiles", "professionals", "identity_verifications", "audit_log",
    "notifications", "professional_documents", "reports", "transactions", "app_settings", "platform_fee_history",
    "service_requests", "bookings", "booking_events", "dispatch_offers", "payments", "reviews", "messages",
    "disputes", "dispute_entries", "categories", "professional_categories", "admin_notes"];
  (function restoreDemo() {
    if (!DEMO) return;
    try {
      var saved = JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
      if (!saved) return;
      DEMO_TABLES.forEach(function (t) { if (Array.isArray(saved[t])) db[t] = saved[t]; });
    } catch (e) { /* armazenamento indisponível */ }
  })();
  function persistDemo() {
    if (!DEMO) return;
    var snap = {};
    DEMO_TABLES.forEach(function (t) { snap[t] = db[t]; });
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(snap)); }
    catch (e) { console.warn("[ServeGo] Não foi possível salvar a base demo:", e); }
  }
  api.resetDemo = function () {
    try { localStorage.removeItem(DEMO_KEY); } catch (e) {}
  };

  /* ---- Infra ------------------------------------------------------------- */
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms === undefined ? 240 : ms); }); }
  function uid(p) { return SG.mock.uid(p); }
  function nowIso() { return new Date().toISOString(); }

  var bus = {
    map: {},
    on: function (evt, fn) {
      (this.map[evt] = this.map[evt] || []).push(fn);
      var self = this;
      return function () { self.map[evt] = self.map[evt].filter(function (f) { return f !== fn; }); };
    },
    emit: function (evt, payload) { (this.map[evt] || []).forEach(function (f) { try { f(payload); } catch (e) { console.error(e); } }); }
  };
  api.bus = bus;
  api.isDemo = DEMO;

  function sb() {
    if (!SG.supabase) throw new Error("Supabase não inicializado.");
    return SG.supabase;
  }
  function unwrap(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  /* Armazenamento leve da sessão demo (degrada para memória) ---------------- */
  var memSession = null;
  function saveDemoSession(v) {
    memSession = v;
    try { localStorage.setItem("servego.demo.session", JSON.stringify(v)); } catch (e) { /* modo privado */ }
  }
  function readDemoSession() {
    if (memSession) return memSession;
    try {
      var raw = localStorage.getItem("servego.demo.session");
      memSession = raw ? JSON.parse(raw) : null;
    } catch (e) { memSession = null; }
    return memSession;
  }
  function clearDemoSession() {
    memSession = null;
    try { localStorage.removeItem("servego.demo.session"); } catch (e) {}
  }

  function findProfile(id) { return db.profiles.filter(function (p) { return p.id === id; })[0]; }
  function findPro(id) { return db.professionals.filter(function (p) { return p.id === id; })[0]; }
  function findCat(id) { return db.categories.filter(function (c) { return c.id === id; })[0]; }

  function hydrateRequest(r) {
    var out = clone(r);
    out.category = clone(findCat(r.category_id));
    out.client = clone(findProfile(r.client_id));
    out.photos = db.service_photos.filter(function (p) { return p.request_id === r.id; }).map(clone);
    out.professional = r.professional_id ? hydrateProfessional(r.professional_id) : null;
    out.payment = clone(db.payments.filter(function (p) { return p.request_id === r.id; })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })[0] || null);
    var bk = db.bookings.filter(function (b) { return b.request_id === r.id; })[0];
    out.booking = bk ? clone(bk) : null;
    return out;
  }

  function hydrateProfessional(id) {
    var pro = findPro(id), prof = findProfile(id);
    if (!pro || !prof) return null;
    var out = clone(pro);
    out.full_name = prof.full_name;
    out.avatar_url = prof.avatar_url;
    out.email = prof.email;
    out.phone = prof.phone;
    out.status = prof.status;
    out.categories = db.professional_categories
      .filter(function (pc) { return pc.professional_id === id; })
      .map(function (pc) { return clone(findCat(pc.category_id)); })
      .filter(Boolean);
    out.portfolio = clone(db.portfolio[id] || []);
    return out;
  }

  /* ==========================================================================
     AUTENTICAÇÃO
     ========================================================================== */
  api.auth = {};

  /* O cadastro público só cria cliente ou profissional. O papel de admin nunca
     vem do formulário: quem define é o banco (sql/05_admin.sql), que promove
     apenas o e-mail proprietário configurado em js/config.js. */
  function publicRole(role) {
    return role === "professional" ? "professional" : "client";
  }

  api.auth.signUp = function (payload) {
    payload = Object.assign({}, payload, { role: publicRole(payload.role) });
    if (DEMO) {
      return delay(600).then(function () {
        var exists = db.profiles.filter(function (p) { return p.email === payload.email; })[0];
        if (exists) throw new Error("Este e-mail já possui conta no ServeGo.");
        var cpfTaken = payload.cpf && db.profiles.some(function (p) { return p.cpf === payload.cpf; });
        if (cpfTaken) throw new Error("Este CPF já possui conta no ServeGo.");
        var id = uid("user");
        var profile = {
          id: id, full_name: payload.full_name, email: payload.email, phone: payload.phone || null,
          cpf: payload.cpf || null, birth_date: payload.birth_date || null,
          avatar_url: null, city: payload.city || "São Paulo", state: payload.state || "SP",
          role: payload.role || "client", status: "active", identity_status: "not_submitted",
          created_at: nowIso()
        };
        db.profiles.push(profile);
        if (profile.role === "professional") {
          db.professionals.push({
            id: id, headline: payload.headline || "Profissional ServeGo", bio: "",
            experience_years: 0, base_price: 120, hourly_rate: 80, service_radius_km: 15,
            lat: -23.55, lng: -46.63, city: profile.city, state: profile.state,
            is_available: false, verified: false, verification_status: "pending",
            rating: 0, reviews_count: 0, jobs_count: 0, response_time_min: 15,
            completion_rate: 100, neighborhood: "", distance_km: 0, created_at: nowIso()
          });
        }
        saveDemoSession({ user_id: id });
        persistDemo();
        return { user: clone(profile), session: { user: { id: id } } };
      });
    }
    return sb().auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.full_name,
          phone: payload.phone || null,
          cpf: payload.cpf || null,
          birth_date: payload.birth_date || null,
          role: payload.role || "client"
        }
      }
    }).then(unwrap);
  };

  api.auth.signIn = function (email, password) {
    if (DEMO) {
      return delay(520).then(function () {
        var mail = String(email).toLowerCase().trim();
        var profile = db.profiles.filter(function (p) { return String(p.email).toLowerCase().trim() === mail; })[0];
        if (!profile) {
          // No modo demo não existe senha: só o e-mail identifica a conta fictícia.
          throw new Error(
            "Esta conta não existe na base de demonstração. Use " +
            SG.config.owner.email + " para entrar como administrador, " +
            "ou os atalhos Cliente / Profissional."
          );
        }
        // No modo demo o painel administrativo só abre para a conta proprietária.
        if (profile.role === "admin" && mail !== String(SG.config.owner.email).toLowerCase()) {
          throw new Error("Acesso administrativo restrito.");
        }
        if (profile.status === "blocked") throw new Error("Esta conta está bloqueada. Fale com o suporte.");
        saveDemoSession({ user_id: profile.id });
        return clone(profile);
      });
    }
    return sb().auth.signInWithPassword({ email: email, password: password }).then(unwrap);
  };

  /** Atalho do modo demo: entra direto como cliente, profissional ou admin. */
  api.auth.demoLogin = function (kind) {
    var acc = SG.mock.accounts[kind] || SG.mock.accounts.client;
    return api.auth.signIn(acc.email, "demo");
  };

  api.auth.signOut = function () {
    if (DEMO) { clearDemoSession(); return delay(180); }
    return sb().auth.signOut().then(function (r) { if (r && r.error) throw r.error; });
  };

  api.auth.currentUserId = function () {
    if (DEMO) {
      var s = readDemoSession();
      return Promise.resolve(s ? s.user_id : null);
    }
    return sb().auth.getSession().then(function (r) {
      return r.data && r.data.session ? r.data.session.user.id : null;
    });
  };

  api.auth.me = function () {
    return api.auth.currentUserId().then(function (id) {
      if (!id) return null;
      return api.profiles.get(id);
    });
  };

  api.auth.resetPassword = function (email) {
    if (DEMO) return delay(500);
    return sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(unwrap);
  };

  /* ==========================================================================
     PERFIS
     ========================================================================== */
  api.profiles = {};

  api.profiles.get = function (id) {
    if (DEMO) {
      return delay(150).then(function () {
        var p = clone(findProfile(id));
        if (p && p.role === "professional") p.professional = hydrateProfessional(id);
        return p;
      });
    }
    return sb().from("profiles").select("*").eq("id", id).maybeSingle().then(unwrap).then(function (p) {
      if (!p) return null;
      if (p.role !== "professional") return p;
      return sb().from("professionals").select("*").eq("id", id).maybeSingle().then(unwrap).then(function (pro) {
        p.professional = pro;
        return p;
      });
    });
  };

  /** Registra o último acesso (no máximo a cada 10 min; a hora vem do servidor). */
  api.profiles.touchLastSeen = function (id) {
    if (DEMO) {
      var p = findProfile(id);
      if (p && (!p.last_seen_at || Date.now() - new Date(p.last_seen_at) > 10 * 60000)) {
        p.last_seen_at = nowIso();
        persistDemo();
      }
      return Promise.resolve();
    }
    return sb().rpc("touch_last_seen").then(function () {}, function () {});
  };

  api.profiles.update = function (id, patch) {
    if (DEMO) {
      return delay(300).then(function () {
        var p = findProfile(id);
        Object.assign(p, patch, { updated_at: nowIso() });
        persistDemo();
        return clone(p);
      });
    }
    return sb().from("profiles").update(patch).eq("id", id).select().single().then(unwrap);
  };

  /* ==========================================================================
     CATEGORIAS
     ========================================================================== */
  api.categories = {};

  api.categories.list = function () {
    if (DEMO) {
      return delay(120).then(function () {
        return clone(db.categories.filter(function (c) { return c.active; })
          .sort(function (a, b) { return a.sort_order - b.sort_order; }));
      });
    }
    return sb().from("categories").select("*").eq("active", true).order("sort_order").then(unwrap);
  };

  /** Admin: catálogo completo, inclusive as categorias desativadas. */
  api.categories.listAll = function () {
    if (DEMO) {
      return delay(120).then(function () {
        return clone(db.categories.slice().sort(function (a, b) { return a.sort_order - b.sort_order; }));
      });
    }
    return sb().from("categories").select("*").order("sort_order").then(unwrap);
  };

  api.categories.upsert = function (payload) {
    if (DEMO) {
      return delay(260).then(function () {
        var existing = payload.id && findCat(payload.id);
        if (existing) { Object.assign(existing, payload); return clone(existing); }
        var c = Object.assign({ id: uid("cat"), active: true, sort_order: db.categories.length + 1, created_at: nowIso() }, payload);
        db.categories.push(c);
        return clone(c);
      });
    }
    return sb().from("categories").upsert(payload).select().single().then(unwrap);
  };

  api.categories.setActive = function (id, active) {
    if (DEMO) {
      return delay(200).then(function () { findCat(id).active = active; });
    }
    return sb().from("categories").update({ active: active }).eq("id", id).then(unwrap);
  };

  /* ==========================================================================
     PROFISSIONAIS
     ========================================================================== */
  api.professionals = {};

  api.professionals.get = function (id) {
    if (DEMO) return delay(220).then(function () { return hydrateProfessional(id); });
    return sb().from("professionals")
      .select("*, profile:profiles!professionals_id_fkey(full_name, avatar_url, city, state, status), professional_categories(category:categories(*))")
      .eq("id", id).maybeSingle().then(unwrap).then(function (p) {
        if (!p) return null;
        p.full_name = p.profile && p.profile.full_name;
        p.avatar_url = p.profile && p.profile.avatar_url;
        p.categories = (p.professional_categories || []).map(function (pc) { return pc.category; });
        return p;
      });
  };

  api.professionals.search = function (opts) {
    opts = opts || {};
    if (DEMO) {
      return delay(500).then(function () {
        var ids = db.professional_categories
          .filter(function (pc) { return !opts.category_id || pc.category_id === opts.category_id; })
          .map(function (pc) { return pc.professional_id; });
        var seen = {};
        var list = ids.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; })
          .map(hydrateProfessional)
          .filter(function (p) { return p && p.status === "active" && p.verification_status === "approved"; })
          .map(function (p) {
            var pc = db.professional_categories.filter(function (x) {
              return x.professional_id === p.id && (!opts.category_id || x.category_id === opts.category_id);
            })[0];
            p.price_from = (pc && pc.price_from) || p.base_price;
            p.eta_minutes = Math.round(8 + p.distance_km * 3);
            return p;
          })
          .filter(function (p) { return p.distance_km <= (opts.radius_km || SG.config.app.defaultRadiusKm); })
          .sort(function (a, b) {
            if (opts.sort === "price") return a.price_from - b.price_from;
            if (opts.sort === "distance") return a.distance_km - b.distance_km;
            return b.rating - a.rating || a.distance_km - b.distance_km;
          });
        return clone(list.slice(0, opts.limit || 20));
      });
    }
    return sb().rpc("search_professionals", {
      p_category_id: opts.category_id,
      p_lat: opts.lat, p_lng: opts.lng,
      p_radius_km: opts.radius_km || SG.config.app.defaultRadiusKm,
      p_limit: opts.limit || 20
    }).then(unwrap);
  };

  api.professionals.update = function (id, patch) {
    if (DEMO) {
      return delay(300).then(function () {
        Object.assign(findPro(id), patch);
        return hydrateProfessional(id);
      });
    }
    return sb().from("professionals").update(patch).eq("id", id).select().single().then(unwrap);
  };

  api.professionals.setAvailability = function (id, available) {
    return api.professionals.update(id, { is_available: available });
  };

  api.professionals.setCategories = function (id, categoryIds, basePrice) {
    if (DEMO) {
      return delay(280).then(function () {
        db.professional_categories = db.professional_categories.filter(function (pc) { return pc.professional_id !== id; });
        categoryIds.forEach(function (c) {
          db.professional_categories.push({ professional_id: id, category_id: c, price_from: basePrice || findPro(id).base_price });
        });
      });
    }
    return sb().from("professional_categories").delete().eq("professional_id", id).then(function () {
      if (!categoryIds.length) return null;
      return sb().from("professional_categories").insert(categoryIds.map(function (c) {
        return { professional_id: id, category_id: c, price_from: basePrice || null };
      })).then(unwrap);
    });
  };

  api.professionals.listAll = function (filter) {
    if (DEMO) {
      return delay(260).then(function () {
        return db.professionals.map(function (p) { return hydrateProfessional(p.id); })
          .filter(function (p) { return !filter || !filter.status || p.verification_status === filter.status; });
      });
    }
    var q = sb().from("professionals").select("*, profile:profiles!professionals_id_fkey(full_name, email, phone, status)");
    if (filter && filter.status) q = q.eq("verification_status", filter.status);
    return q.order("created_at", { ascending: false }).then(unwrap).then(function (rows) {
      return rows.map(function (r) { r.full_name = r.profile && r.profile.full_name; return r; });
    });
  };

  /* ==========================================================================
     SOLICITAÇÕES
     ========================================================================== */
  api.requests = {};

  api.requests.create = function (payload) {
    if (DEMO) {
      return delay(600).then(function () {
        var r = Object.assign({
          id: uid("req"), status: "matching", created_at: nowIso(), updated_at: nowIso(),
          scheduled_for: null, budget_hint: null, lat: -23.578, lng: -46.634
        }, payload);
        db.service_requests.unshift(r);
        return hydrateRequest(r);
      });
    }
    return sb().from("service_requests").insert(payload).select().single().then(unwrap);
  };

  api.requests.get = function (id) {
    if (DEMO) return delay(220).then(function () {
      var r = db.service_requests.filter(function (x) { return x.id === id; })[0];
      return r ? hydrateRequest(r) : null;
    });
    return sb().from("service_requests")
      .select("*, category:categories(*), client:profiles!service_requests_client_id_fkey(id, full_name, avatar_url, phone), photos:service_photos(*)")
      .eq("id", id).maybeSingle().then(unwrap);
  };

  api.requests.listMine = function (clientId) {
    if (DEMO) {
      return delay(240).then(function () {
        return db.service_requests.filter(function (r) { return r.client_id === clientId; }).map(hydrateRequest);
      });
    }
    return sb().from("service_requests")
      .select("*, category:categories(*), booking:bookings(*), payment:payments(status, method, amount)")
      .eq("client_id", clientId).order("created_at", { ascending: false }).then(unwrap);
  };

  api.requests.updateStatus = function (id, status) {
    if (DEMO) {
      return delay(240).then(function () {
        var r = db.service_requests.filter(function (x) { return x.id === id; })[0];
        r.status = status; r.updated_at = nowIso();
        return hydrateRequest(r);
      });
    }
    return sb().from("service_requests").update({ status: status }).eq("id", id).select().single().then(unwrap);
  };

  api.requests.cancel = function (id) {
    if (DEMO) {
      db.dispatch_offers.forEach(function (d) {
        if (d.request_id === id && d.status === "pending") { d.status = "cancelled"; bus.emit("incoming:" + d.professional_id, hydrateDispatch(d)); }
      });
      db.payments.forEach(function (p) { if (p.request_id === id && p.status === "pending") p.status = "expired"; });
    }
    return api.requests.updateStatus(id, "cancelled");
  };

  api.requests.listAll = function () {
    if (DEMO) return delay(260).then(function () { return db.service_requests.map(hydrateRequest); });
    return sb().from("service_requests")
      .select("*, category:categories(*), client:profiles!service_requests_client_id_fkey(full_name, email, phone), photos:service_photos(url), " +
        "professional:professionals!service_requests_professional_id_fkey(id, profile:profiles!professionals_id_fkey(full_name)), " +
        "payments(status, method, created_at)")
      .order("created_at", { ascending: false }).limit(500).then(unwrap).then(function (rows) {
        rows.forEach(function (r) {
          if (r.professional && r.professional.profile) r.professional.full_name = r.professional.profile.full_name;
          r.payment = (r.payments || []).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })[0] || null;
        });
        return rows;
      });
  };

  /* ---- Fotos -------------------------------------------------------------- */
  api.photos = {};

  api.photos.upload = function (requestId, userId, files) {
    if (DEMO) {
      return Promise.all(Array.prototype.map.call(files, function (f) {
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = function () { resolve(SG.mock.photo(3, "📷")); };
          fr.readAsDataURL(f);
        });
      })).then(function (urls) {
        return urls.map(function (url) {
          var rec = { id: uid("ph"), request_id: requestId, uploaded_by: userId, storage_path: "demo", url: url, created_at: nowIso() };
          db.service_photos.push(rec);
          return clone(rec);
        });
      });
    }
    var bucket = SG.config.buckets.servicePhotos;
    return Promise.all(Array.prototype.map.call(files, function (file) {
      var path = userId + "/" + requestId + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]/g, "_");
      return sb().storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false })
        .then(function (res) {
          if (res.error) throw res.error;
          var pub = sb().storage.from(bucket).getPublicUrl(path);
          return { request_id: requestId, uploaded_by: userId, storage_path: path, url: pub.data.publicUrl };
        });
    })).then(function (rows) {
      return sb().from("service_photos").insert(rows).select().then(unwrap);
    });
  };

  api.photos.uploadChatImage = function (userId, file) {
    if (DEMO) {
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.readAsDataURL(file);
      });
    }
    var bucket = SG.config.buckets.chatImages;
    var path = userId + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]/g, "_");
    return sb().storage.from(bucket).upload(path, file).then(function (res) {
      if (res.error) throw res.error;
      return sb().storage.from(bucket).getPublicUrl(path).data.publicUrl;
    });
  };

  api.photos.uploadAvatar = function (userId, file) {
    if (DEMO) {
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.readAsDataURL(file);
      });
    }
    var bucket = SG.config.buckets.avatars;
    var path = userId + "/avatar-" + Date.now() + "." + (file.name.split(".").pop() || "jpg");
    return sb().storage.from(bucket).upload(path, file, { upsert: true }).then(function (res) {
      if (res.error) throw res.error;
      return sb().storage.from(bucket).getPublicUrl(path).data.publicUrl;
    });
  };

  /* ==========================================================================
     CONTRATOS (BOOKINGS)
     ========================================================================== */
  api.bookings = {};

  function hydrateBooking(b) {
    var out = clone(b);
    var req = db.service_requests.filter(function (r) { return r.id === b.request_id; })[0];
    out.request = req ? hydrateRequest(req) : null;
    out.professional = hydrateProfessional(b.professional_id);
    out.client = clone(findProfile(b.client_id));
    out.events = db.booking_events.filter(function (e) { return e.booking_id === b.id; })
      .sort(function (a, b2) { return new Date(a.created_at) - new Date(b2.created_at); }).map(clone);
    out.review = db.reviews.filter(function (r) { return r.booking_id === b.id; })[0] || null;
    out.payment = clone(db.payments.filter(function (p) { return p.id === b.payment_id; })[0] || null);
    return out;
  }

  api.bookings.get = function (id) {
    if (DEMO) return delay(240).then(function () {
      demoAutoConfirm();
      var b = db.bookings.filter(function (x) { return x.id === id; })[0];
      return b ? hydrateBooking(b) : null;
    });
    return sb().from("bookings")
      .select("*, request:service_requests(*, category:categories(*), photos:service_photos(*)), " +
        "professional:professionals(*, profile:profiles!professionals_id_fkey(full_name, avatar_url)), " +
        "client:profiles!bookings_client_id_fkey(full_name, avatar_url), events:booking_events(*), review:reviews(*), payment:payments!bookings_payment_id_fkey(*)")
      .eq("id", id).maybeSingle().then(unwrap);
  };

  api.bookings.listForUser = function (userId, role) {
    if (DEMO) {
      return delay(260).then(function () {
        demoAutoConfirm();
        return db.bookings.filter(function (b) {
          return role === "professional" ? b.professional_id === userId : b.client_id === userId;
        }).map(hydrateBooking);
      });
    }
    var col = role === "professional" ? "professional_id" : "client_id";
    return sb().from("bookings")
      .select("*, request:service_requests(*, category:categories(*)), " +
        "professional:professionals(*, profile:profiles!professionals_id_fkey(full_name, avatar_url)), " +
        "client:profiles!bookings_client_id_fkey(full_name, avatar_url), review:reviews(*)")
      .eq(col, userId).order("created_at", { ascending: false }).then(unwrap);
  };

  /* Conclusão em duas etapas: o profissional marca "awaiting_confirmation" e o
     cliente confirma (ou contesta). Só "completed" libera o repasse. */
  var PRO_NEXT = { accepted: "on_the_way", on_the_way: "arrived", arrived: "in_progress", in_progress: "awaiting_confirmation" };

  function demoSetStatus(b, status, note) {
    b.status = status; b.updated_at = nowIso();
    if (status === "on_the_way") b.started_at = b.started_at || nowIso();
    if (status === "arrived") b.arrived_at = nowIso();
    if (status === "awaiting_confirmation") {
      var hours = Number((SG.config.payments || {}).completionAutoConfirmHours || 24);
      b.pro_completed_at = nowIso();
      b.confirm_deadline = new Date(Date.now() + hours * 3600e3).toISOString();
      pushDemoNotification(b.client_id, "status", "O profissional concluiu o serviço",
        "Confirme se está tudo certo. Só então o pagamento é liberado a ele.", "#/acompanhar/" + b.id);
    }
    if (status === "completed") {
      b.completed_at = nowIso();
      b.confirmed_at = nowIso();
      var req = db.service_requests.filter(function (r) { return r.id === b.request_id; })[0];
      if (req) req.status = "completed";
      var pro = findPro(b.professional_id);
      if (pro) pro.jobs_count += 1;
      var fee = Math.round(b.price * (SG.config.app.platformFeePercent / 100) * 100) / 100;
      db.transactions.unshift({
        id: uid("tx"), booking_id: b.id, professional_id: b.professional_id, client_id: b.client_id,
        amount: b.price, platform_fee: fee, net_amount: b.price - fee, status: "pending",
        payment_id: b.payment_id || null, created_at: nowIso()
      });
      pushDemoNotification(b.professional_id, "booking",
        b.confirmed_by === "auto" ? "Serviço confirmado automaticamente" : "Cliente confirmou a conclusão",
        "O pagamento foi liberado para repasse.", "#/ganhos");
    }
    if (status === "in_progress") {
      var reqq = db.service_requests.filter(function (r) { return r.id === b.request_id; })[0];
      if (reqq) reqq.status = "in_progress";
    }
    db.booking_events.push({ id: uid("ev"), booking_id: b.id, status: status, note: note || null, created_at: nowIso() });
    if (status !== "awaiting_confirmation" && status !== "completed") {
      pushDemoNotification(b.client_id, "status", ui.labels.bookingStatus[status], "", "#/acompanhar/" + b.id);
    }
    bus.emit("booking:" + b.id, hydrateBooking(b));
    return hydrateBooking(b);
  }

  /** Confirma sozinho o que passou do prazo sem resposta do cliente. */
  function demoAutoConfirm() {
    db.bookings.forEach(function (b) {
      if (b.status === "awaiting_confirmation" && b.confirm_deadline && new Date(b.confirm_deadline) < new Date()) {
        b.confirmed_by = "auto";
        demoSetStatus(b, "completed", "Confirmado automaticamente");
      }
    });
  }

  /** Profissional avança o atendimento (até "concluí", nunca direto para "completed"). */
  api.bookings.updateStatus = function (id, status, note) {
    if (DEMO) {
      return delay(340).then(function () {
        var b = db.bookings.filter(function (x) { return x.id === id; })[0];
        if (PRO_NEXT[b.status] !== status) {
          throw new Error("Não é possível mudar o serviço de " + b.status + " para " + status + ".");
        }
        return demoSetStatus(b, status, note);
      });
    }
    return sb().from("bookings").update({ status: status }).eq("id", id).select().single().then(unwrap);
  };

  /** Cliente confirma que o serviço foi concluído → libera o repasse. */
  api.bookings.confirmCompletion = function (id) {
    if (DEMO) {
      return delay(420).then(function () {
        var b = db.bookings.filter(function (x) { return x.id === id; })[0];
        if (!b || b.status !== "awaiting_confirmation") throw new Error("Este serviço não está aguardando confirmação.");
        var s = readDemoSession();
        var me = s && findProfile(s.user_id);
        b.confirmed_by = me && me.role === "admin" ? "admin" : "client";
        return demoSetStatus(b, "completed", "Conclusão confirmada pelo cliente");
      });
    }
    return sb().rpc("confirm_completion", { p_booking_id: id }).then(unwrap);
  };

  /** Cliente contesta ("tive um problema"): provas obrigatórias; o pagamento fica retido e o admin decide. */
  api.bookings.openDispute = function (id, reason, description, attachments) {
    attachments = attachments || [];
    if (DEMO) {
      return delay(420).then(function () {
        var b = db.bookings.filter(function (x) { return x.id === id; })[0];
        if (!b || ["awaiting_confirmation", "in_progress", "arrived"].indexOf(b.status) < 0) {
          throw new Error("Não é possível abrir disputa neste momento.");
        }
        if (!reason || !description || description.length < 10) throw new Error("Informe o motivo e descreva o problema.");
        if (!attachments.length) throw new Error("Envie ao menos uma foto ou vídeo do problema.");
        var d = {
          id: uid("dis"), booking_id: b.id, client_id: b.client_id, professional_id: b.professional_id, amount: b.price,
          reason: reason, status: "open", info_requested_from: null, info_request: null, admin_notes: "",
          decision_reason: null, decided_by: null, decided_at: null, created_at: nowIso(), updated_at: nowIso()
        };
        db.disputes.unshift(d);
        db.dispute_entries.push({ id: uid("de"), dispute_id: d.id, author_id: b.client_id, party: "client",
          note: description, attachments: attachments, created_at: nowIso() });
        pushDemoNotification(b.professional_id, "status", "O cliente abriu uma disputa",
          "Envie sua versão com fotos ou vídeos. O pagamento fica retido até a análise.", "#/servico/" + b.id);
        pushDemoNotification("user-admin", "status", "Nova disputa para analisar", reason, "#/admin/disputas/" + d.id);
        demoSetStatus(b, "disputed", reason);
        return clone(d);
      });
    }
    return sb().rpc("open_dispute", {
      p_booking_id: id, p_reason: reason, p_description: description || null, p_attachments: attachments
    }).then(unwrap);
  };

  /** Confirma os serviços cujo prazo do cliente venceu (o banco também faz isso via pg_cron). */
  api.bookings.autoConfirmDue = function () {
    if (DEMO) return Promise.resolve(demoAutoConfirm());
    return sb().rpc("auto_confirm_completions").then(unwrap).catch(function () { return 0; });
  };

  /** Cancela o serviço. Estorno integral enquanto o profissional não saiu (status "accepted"). */
  api.bookings.cancel = function (id, reason) {
    if (DEMO) {
      return delay(340).then(function () {
        var b = db.bookings.filter(function (x) { return x.id === id; })[0];
        var s = readDemoSession();
        var me = s && findProfile(s.user_id);
        if (b.status !== "accepted" && !(me && me.role === "admin")) {
          throw new Error("O profissional já está a caminho. Abra uma disputa pelo suporte.");
        }
        var pay = db.payments.filter(function (p) { return p.id === b.payment_id; })[0];
        if (pay && pay.status === "paid") {
          pay.status = "refunded"; pay.refunded_at = nowIso(); pay.refund_amount = pay.amount;
        }
        b.status = "cancelled"; b.cancelled_at = nowIso(); b.cancel_reason = reason || null;
        var req = db.service_requests.filter(function (r) { return r.id === b.request_id; })[0];
        if (req) req.status = "cancelled";
        db.booking_events.push({ id: uid("ev"), booking_id: id, status: "cancelled", note: reason, created_at: nowIso() });
        return hydrateBooking(b);
      });
    }
    return sb().functions.invoke("refund-payment", { body: { booking_id: id, reason: reason || null } })
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.error) throw new Error(res.data.error);
        return res.data;
      });
  };

  api.bookings.subscribe = function (id, cb) {
    if (DEMO) return bus.on("booking:" + id, cb);
    var ch = sb().channel("booking-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: "id=eq." + id }, function () {
        api.bookings.get(id).then(cb);
      }).subscribe();
    return function () { sb().removeChannel(ch); };
  };

  /* ==========================================================================
     DESPACHO "ESTILO UBER"
     O cliente pede → o profissional disponível mais próximo recebe a chamada
     → aceita (ou recusa, e a chamada passa ao próximo) → o cliente paga no app.
     ========================================================================== */
  api.dispatch = {};

  function payCfg() { return SG.config.payments || {}; }

  /** Preço fechado: preço do profissional na categoria + adicional de urgência. */
  function demoQuote(proId, req) {
    var pc = db.professional_categories.filter(function (x) {
      return x.professional_id === proId && x.category_id === req.category_id;
    })[0];
    var pro = findPro(proId) || {};
    var cat = findCat(req.category_id) || {};
    var base = Number((pc && pc.price_from) || pro.base_price || cat.price_from || 120);
    var surcharge = req.urgency === "now" ? Number(payCfg().urgencySurchargePercent || 0) : 0;
    return Math.round(base * (1 + surcharge / 100) * 100) / 100;
  }

  function hydrateDispatch(o) {
    var out = clone(o);
    out.professional = hydrateProfessional(o.professional_id);
    var req = db.service_requests.filter(function (r) { return r.id === o.request_id; })[0];
    out.request = req ? hydrateRequest(req) : null;
    return out;
  }

  function proBusy(proId) {
    return db.bookings.some(function (b) {
      return b.professional_id === proId && ["accepted", "on_the_way", "arrived", "in_progress"].indexOf(b.status) >= 0;
    });
  }

  /** Chama o próximo profissional mais próximo (demo). */
  function demoDispatchNext(req) {
    if (["open", "matching", "no_professional"].indexOf(req.status) < 0) return null;
    db.dispatch_offers.forEach(function (d) {
      if (d.request_id === req.id && d.status === "pending" && new Date(d.expires_at) <= new Date()) {
        d.status = "expired"; d.responded_at = nowIso();
      }
    });
    var live = db.dispatch_offers.filter(function (d) {
      return d.request_id === req.id && d.status === "pending";
    })[0];
    if (live) return live;

    var called = db.dispatch_offers.filter(function (d) { return d.request_id === req.id; })
      .map(function (d) { return d.professional_id; });
    var cand = db.professional_categories
      .filter(function (pc) { return pc.category_id === req.category_id; })
      .map(function (pc) { return findPro(pc.professional_id); })
      .filter(function (p) {
        var prof = p && findProfile(p.id);
        return p && prof && prof.status === "active" && p.is_available && p.verification_status === "approved" &&
          called.indexOf(p.id) < 0 && !proBusy(p.id);
      })
      .sort(function (a, b) { return a.distance_km - b.distance_km || b.rating - a.rating; })[0];

    if (!cand) {
      req.status = "no_professional"; req.updated_at = nowIso();
      pushDemoNotification(req.client_id, "request", "Nenhum profissional disponível agora",
        "Tente novamente em alguns minutos.", "#/solicitacao/" + req.id);
      bus.emit("dispatch:" + req.id, null);
      return null;
    }

    var timeout = Number(payCfg().dispatchTimeoutSeconds || 45);
    var offer = {
      id: uid("dsp"), request_id: req.id, professional_id: cand.id, rank: called.length + 1,
      distance_km: cand.distance_km, eta_minutes: Math.round(8 + cand.distance_km * 3),
      price: demoQuote(cand.id, req), status: "pending",
      expires_at: new Date(Date.now() + timeout * 1000).toISOString(), responded_at: null, created_at: nowIso()
    };
    db.dispatch_offers.push(offer);
    req.status = "matching"; req.updated_at = nowIso();
    pushDemoNotification(cand.id, "dispatch", "Nova chamada perto de você",
      req.title + " · " + ui.km(cand.distance_km), "#/inicio");
    bus.emit("dispatch:" + req.id, hydrateDispatch(offer));
    bus.emit("incoming:" + cand.id, hydrateDispatch(offer));

    // expira sozinha se ninguém responder
    setTimeout(function () {
      if (offer.status !== "pending") return;
      offer.status = "expired"; offer.responded_at = nowIso();
      bus.emit("incoming:" + cand.id, hydrateDispatch(offer));
      demoDispatchNext(req);
    }, timeout * 1000 + 50);

    // Na demonstração, profissionais que não são você respondem sozinhos.
    var s = readDemoSession();
    if (!s || s.user_id !== cand.id) {
      setTimeout(function () {
        if (offer.status !== "pending") return;
        demoRespond(offer, true);
      }, 2600 + Math.random() * 1600);
    }
    return offer;
  }

  function demoRespond(offer, accept) {
    var req = db.service_requests.filter(function (r) { return r.id === offer.request_id; })[0];
    if (offer.status !== "pending") throw new Error("Esta chamada não está mais disponível.");
    if (!req || req.status !== "matching") {
      offer.status = "cancelled";
      throw new Error("O cliente cancelou este pedido.");
    }
    if (new Date(offer.expires_at) <= new Date()) {
      offer.status = "expired";
      demoDispatchNext(req);
      throw new Error("O tempo para aceitar esta chamada acabou.");
    }
    offer.responded_at = nowIso();
    if (!accept) {
      offer.status = "declined";
      bus.emit("dispatch:" + req.id, hydrateDispatch(offer));
      setTimeout(function () { demoDispatchNext(req); }, 700);
      return hydrateDispatch(offer);
    }
    offer.status = "accepted";
    req.status = "awaiting_payment";
    req.price = offer.price;
    req.professional_id = offer.professional_id;
    req.payment_due_at = new Date(Date.now() + Number(payCfg().paymentTimeoutMinutes || 15) * 60000).toISOString();
    req.updated_at = nowIso();
    pushDemoNotification(req.client_id, "dispatch", "Profissional encontrado!",
      "Pague " + ui.money(offer.price) + " no app para confirmar o atendimento.", "#/solicitacao/" + req.id);
    bus.emit("dispatch:" + req.id, hydrateDispatch(offer));
    return hydrateDispatch(offer);
  }

  /** Começa (ou retoma) a busca pelo profissional mais próximo. */
  api.dispatch.start = function (requestId) {
    if (DEMO) {
      return delay(300).then(function () {
        var req = db.service_requests.filter(function (r) { return r.id === requestId; })[0];
        var o = req ? demoDispatchNext(req) : null;
        return o ? hydrateDispatch(o) : null;
      });
    }
    return sb().rpc("dispatch_next", { p_request_id: requestId }).then(unwrap)
      .then(function (o) { return o && o.id ? api.dispatch.current(requestId) : null; });
  };

  /** Chamada mais recente da solicitação (com o profissional). */
  api.dispatch.current = function (requestId) {
    if (DEMO) {
      return delay(120).then(function () {
        var list = db.dispatch_offers.filter(function (d) { return d.request_id === requestId; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        return list[0] ? hydrateDispatch(list[0]) : null;
      });
    }
    return sb().from("dispatch_offers")
      .select("*, professional:professionals(*, profile:profiles!professionals_id_fkey(full_name, avatar_url))")
      .eq("request_id", requestId).order("created_at", { ascending: false }).limit(1)
      .then(unwrap).then(function (rows) {
        var o = rows[0];
        if (o && o.professional && o.professional.profile) {
          o.professional.full_name = o.professional.profile.full_name;
          o.professional.avatar_url = o.professional.profile.avatar_url;
        }
        return o || null;
      });
  };

  /** Chamadas do profissional (pendentes primeiro). */
  api.dispatch.listMine = function (proId) {
    if (DEMO) {
      return delay(160).then(function () {
        return db.dispatch_offers.filter(function (d) { return d.professional_id === proId; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
          .map(hydrateDispatch);
      });
    }
    return sb().from("dispatch_offers")
      .select("*, request:service_requests(*, category:categories(*), photos:service_photos(*), booking:bookings(id, status))")
      .eq("professional_id", proId).order("created_at", { ascending: false }).limit(60).then(unwrap)
      .then(function (rows) {
        rows.forEach(function (o) {
          if (o.request && Array.isArray(o.request.booking)) o.request.booking = o.request.booking[0] || null;
        });
        return rows;
      });
  };

  api.dispatch.respond = function (offerId, accept) {
    if (DEMO) {
      return delay(260).then(function () {
        var o = db.dispatch_offers.filter(function (d) { return d.id === offerId; })[0];
        if (!o) throw new Error("Chamada não encontrada.");
        return demoRespond(o, accept);
      });
    }
    return sb().rpc("respond_dispatch", { p_offer_id: offerId, p_accept: accept }).then(unwrap);
  };

  /** Mudanças na chamada de uma solicitação (lado do cliente). */
  api.dispatch.subscribe = function (requestId, cb) {
    if (DEMO) return bus.on("dispatch:" + requestId, cb);
    var ch = sb().channel("dispatch-" + requestId)
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_offers", filter: "request_id=eq." + requestId },
        function () { api.dispatch.current(requestId).then(cb); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests", filter: "id=eq." + requestId },
        function () { api.dispatch.current(requestId).then(cb); })
      .subscribe();
    return function () { sb().removeChannel(ch); };
  };

  /** Chamadas que chegam para o profissional (lado do profissional). */
  api.dispatch.subscribeIncoming = function (proId, cb) {
    if (DEMO) return bus.on("incoming:" + proId, cb);
    var ch = sb().channel("incoming-" + proId)
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_offers", filter: "professional_id=eq." + proId },
        function (p) {
          sb().from("dispatch_offers")
            .select("*, request:service_requests(*, category:categories(*), photos:service_photos(*))")
            .eq("id", p.new.id).maybeSingle().then(unwrap).then(cb);
        })
      .subscribe();
    return function () { sb().removeChannel(ch); };
  };

  /** Demonstração: cria uma chamada de outro cliente para o profissional logado. */
  api.dispatch.demoIncoming = function (proId) {
    if (!DEMO) return Promise.reject(new Error("Disponível só no modo demonstração."));
    return delay(300).then(function () {
      var pc = db.professional_categories.filter(function (x) { return x.professional_id === proId; })[0];
      if (!pc) throw new Error("Cadastre ao menos uma especialidade no seu perfil.");
      var pro = findPro(proId);
      if (pro && !pro.is_available) throw new Error("Fique online para receber chamadas.");
      var cat = findCat(pc.category_id) || {};
      var req = {
        id: uid("req"), client_id: "user-other-2", category_id: pc.category_id,
        title: (cat.name || "Serviço") + " — atendimento rápido",
        description: "Preciso de um " + (cat.name || "profissional").toLowerCase() + " para resolver um problema em casa ainda hoje.",
        address: "Rua Domingos de Morais, 300 — Vila Mariana, São Paulo/SP",
        lat: -23.588, lng: -46.638, urgency: "now", scheduled_for: null, status: "matching",
        created_at: nowIso(), updated_at: nowIso()
      };
      db.service_requests.unshift(req);
      var timeout = Number(payCfg().dispatchTimeoutSeconds || 45);
      var offer = {
        id: uid("dsp"), request_id: req.id, professional_id: proId, rank: 1, distance_km: 1.4, eta_minutes: 12,
        price: demoQuote(proId, req), status: "pending",
        expires_at: new Date(Date.now() + timeout * 1000).toISOString(), responded_at: null, created_at: nowIso()
      };
      db.dispatch_offers.push(offer);
      setTimeout(function () {
        if (offer.status === "pending") { offer.status = "expired"; bus.emit("incoming:" + proId, hydrateDispatch(offer)); }
      }, timeout * 1000 + 50);
      bus.emit("incoming:" + proId, hydrateDispatch(offer));
      // o cliente simulado paga alguns segundos depois do aceite
      var off = bus.on("dispatch:" + req.id, function (o) {
        if (!o || o.status !== "accepted") return;
        off();
        setTimeout(function () {
          api.payments.create(req.id, "pix").then(function (p) { demoConfirmPayment(p.id); });
        }, 3500);
      });
      return hydrateDispatch(offer);
    });
  };

  /* ==========================================================================
     PAGAMENTOS — sempre dentro da plataforma, ANTES do atendimento
     ========================================================================== */
  api.payments = {};

  function fakePixCode(id, amount) {
    return "00020126580014BR.GOV.BCB.PIX0136servego-demo-" + id.slice(-10) +
      "520400005303986540" + String(amount.toFixed(2)).length + amount.toFixed(2) +
      "5802BR5907SERVEGO6009SAO PAULO62070503***6304DEMO";
  }

  function demoConfirmPayment(paymentId) {
    var p = db.payments.filter(function (x) { return x.id === paymentId; })[0];
    if (!p) throw new Error("Pagamento não encontrado.");
    if (p.status === "paid" && p.booking_id) {
      return clone(db.bookings.filter(function (b) { return b.id === p.booking_id; })[0]);
    }
    var req = db.service_requests.filter(function (r) { return r.id === p.request_id; })[0];
    p.status = "paid"; p.paid_at = nowIso(); p.updated_at = nowIso();
    var bk = {
      id: uid("bk"), request_id: req.id, offer_id: null, payment_id: p.id, client_id: req.client_id,
      professional_id: req.professional_id, price: p.amount, status: "accepted",
      accepted_at: nowIso(), started_at: null, arrived_at: null, completed_at: null,
      cancelled_at: null, cancel_reason: null, created_at: nowIso(), updated_at: nowIso()
    };
    db.bookings.unshift(bk);
    p.booking_id = bk.id;
    req.status = "assigned"; req.updated_at = nowIso();
    db.booking_events.push({ id: uid("ev"), booking_id: bk.id, status: "accepted", note: "Pagamento confirmado", created_at: nowIso() });
    pushDemoNotification(req.professional_id, "booking", "Pagamento confirmado — pode ir!", req.title, "#/servico/" + bk.id);
    pushDemoNotification(req.client_id, "booking", "Pagamento aprovado", "O profissional já foi avisado.", "#/acompanhar/" + bk.id);
    bus.emit("payment:" + req.id, clone(p));
    bus.emit("incoming:" + req.professional_id, null);
    var s = readDemoSession();
    if (!s || s.user_id !== req.professional_id) scheduleDemoBookingProgress(bk);
    return clone(bk);
  }

  /** Cria (ou reaproveita) a cobrança. method: "pix" | "card". */
  api.payments.create = function (requestId, method) {
    if (DEMO) {
      return delay(700).then(function () {
        var req = db.service_requests.filter(function (r) { return r.id === requestId; })[0];
        if (!req || req.status !== "awaiting_payment") throw new Error("Esta solicitação não está aguardando pagamento.");
        if (req.payment_due_at && new Date(req.payment_due_at) < new Date()) {
          req.status = "cancelled";
          throw new Error("O prazo para pagar acabou. Faça uma nova solicitação.");
        }
        var existing = db.payments.filter(function (p) {
          return p.request_id === requestId && p.method === method && p.status === "pending";
        })[0];
        if (existing) return clone(existing);
        var fee = Math.round(req.price * SG.config.app.platformFeePercent) / 100;
        var p = {
          id: uid("pay"), request_id: req.id, booking_id: null, client_id: req.client_id,
          professional_id: req.professional_id, amount: req.price, platform_fee: fee, method: method,
          provider: "demo", provider_ref: null, status: "pending",
          pix_qr_code: null, pix_qr_base64: null, checkout_url: null,
          expires_at: req.payment_due_at, paid_at: null, refunded_at: null, refund_amount: null,
          created_at: nowIso(), updated_at: nowIso()
        };
        if (method === "pix") p.pix_qr_code = fakePixCode(p.id, req.price);
        db.payments.unshift(p);
        return clone(p);
      });
    }
    return sb().functions.invoke("create-payment", { body: { request_id: requestId, method: method } })
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.error) throw new Error(res.data.error);
        return res.data.payment;
      });
  };

  api.payments.forRequest = function (requestId) {
    if (DEMO) {
      return delay(100).then(function () {
        return db.payments.filter(function (p) { return p.request_id === requestId; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).map(clone);
      });
    }
    return sb().from("payments").select("*").eq("request_id", requestId)
      .order("created_at", { ascending: false }).then(unwrap);
  };

  /** Demonstração: simula o webhook do banco aprovando o pagamento. */
  api.payments.demoConfirm = function (paymentId) {
    if (!DEMO) return Promise.reject(new Error("Disponível só no modo demonstração."));
    return delay(900).then(function () { return demoConfirmPayment(paymentId); });
  };

  api.payments.subscribe = function (requestId, cb) {
    if (DEMO) return bus.on("payment:" + requestId, cb);
    var ch = sb().channel("payment-" + requestId)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: "request_id=eq." + requestId },
        function (p) { cb(p.new); })
      .subscribe();
    return function () { sb().removeChannel(ch); };
  };

  /** Admin: todos os pagamentos. */
  api.payments.listAll = function () {
    if (DEMO) {
      return delay(200).then(function () {
        return db.payments.map(function (p) {
          var o = clone(p);
          o.client = clone(findProfile(p.client_id));
          o.professional = clone(findProfile(p.professional_id));
          var r = db.service_requests.filter(function (x) { return x.id === p.request_id; })[0];
          o.request = r ? { title: r.title } : null;
          return o;
        }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      });
    }
    return sb().from("payments")
      .select("*, client:profiles!payments_client_id_fkey(full_name, email), request:service_requests(title), professional:professionals(id, profile:profiles!professionals_id_fkey(full_name))")
      .order("created_at", { ascending: false }).limit(500).then(unwrap).then(function (rows) {
        rows.forEach(function (p) { if (p.professional && p.professional.profile) p.professional = p.professional.profile; });
        return rows;
      });
  };

  /* ==========================================================================
     MENSAGENS
     ========================================================================== */
  api.messages = {};

  api.messages.listConversations = function (userId) {
    if (DEMO) {
      return delay(240).then(function () {
        var byReq = {};
        db.messages.forEach(function (m) {
          if (m.sender_id !== userId && m.recipient_id !== userId) return;
          var other = m.sender_id === userId ? m.recipient_id : m.sender_id;
          var key = m.request_id;
          if (!byReq[key] || new Date(m.created_at) > new Date(byReq[key].last.created_at)) {
            byReq[key] = { request_id: key, other_id: other, last: m, unread: 0 };
          }
        });
        Object.keys(byReq).forEach(function (k) {
          byReq[k].unread = db.messages.filter(function (m) {
            return m.request_id === k && m.recipient_id === userId && !m.read_at;
          }).length;
          var r = db.service_requests.filter(function (x) { return x.id === k; })[0];
          byReq[k].request = r ? hydrateRequest(r) : null;
          var other = findProfile(byReq[k].other_id);
          byReq[k].other = other ? clone(other) : null;
          var pro = findPro(byReq[k].other_id);
          if (pro && byReq[k].other) byReq[k].other.is_available = pro.is_available;
        });
        return Object.keys(byReq).map(function (k) { return byReq[k]; })
          .sort(function (a, b) { return new Date(b.last.created_at) - new Date(a.last.created_at); });
      });
    }
    return sb().from("messages")
      .select("*, request:service_requests(id, title, category:categories(icon, name))")
      .or("sender_id.eq." + userId + ",recipient_id.eq." + userId)
      .order("created_at", { ascending: false }).limit(200).then(unwrap).then(function (rows) {
        var byReq = {};
        rows.forEach(function (m) {
          if (byReq[m.request_id]) return;
          byReq[m.request_id] = {
            request_id: m.request_id, request: m.request,
            other_id: m.sender_id === userId ? m.recipient_id : m.sender_id,
            last: m, unread: 0
          };
        });
        rows.forEach(function (m) {
          if (m.recipient_id === userId && !m.read_at && byReq[m.request_id]) byReq[m.request_id].unread++;
        });
        var list = Object.keys(byReq).map(function (k) { return byReq[k]; });
        var ids = list.map(function (c) { return c.other_id; });
        if (!ids.length) return list;
        return sb().from("profiles").select("id, full_name, avatar_url").in("id", ids).then(unwrap)
          .then(function (people) {
            list.forEach(function (c) {
              c.other = people.filter(function (p) { return p.id === c.other_id; })[0] || null;
            });
            return list;
          });
      });
  };

  api.messages.list = function (requestId) {
    if (DEMO) {
      return delay(200).then(function () {
        return db.messages.filter(function (m) { return m.request_id === requestId; })
          .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); }).map(clone);
      });
    }
    return sb().from("messages").select("*").eq("request_id", requestId)
      .order("created_at", { ascending: true }).then(unwrap);
  };

  /** Telefone, e-mail, links e "chave pix" ficam ocultos: pagamento só pelo app. */
  function maskContact(text) {
    if (!text) return text;
    return String(text)
      .replace(/(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[\s.-]?\d{4}/g, "[contato oculto]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[contato oculto]")
      .replace(/(https?:\/\/|www\.|wa\.me\/|chave\s*pix)\S*/gi, "[link oculto]");
  }
  api.maskContact = maskContact;

  api.messages.send = function (payload) {
    payload = Object.assign({}, payload, { content: maskContact(payload.content) });
    if (DEMO) {
      return delay(180).then(function () {
        var m = Object.assign({ id: uid("msg"), image_url: null, read_at: null, created_at: nowIso() }, payload);
        db.messages.push(m);
        bus.emit("messages:" + payload.request_id, clone(m));
        scheduleDemoReply(m);
        return clone(m);
      });
    }
    return sb().from("messages").insert(payload).select().single().then(unwrap);
  };

  api.messages.markRead = function (requestId, userId) {
    if (DEMO) {
      return delay(80).then(function () {
        db.messages.forEach(function (m) {
          if (m.request_id === requestId && m.recipient_id === userId && !m.read_at) m.read_at = nowIso();
        });
      });
    }
    return sb().from("messages").update({ read_at: nowIso() })
      .eq("request_id", requestId).eq("recipient_id", userId).is("read_at", null).then(unwrap);
  };

  api.messages.subscribe = function (requestId, cb) {
    if (DEMO) return bus.on("messages:" + requestId, cb);
    var ch = sb().channel("chat-" + requestId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "request_id=eq." + requestId },
        function (p) { cb(p.new); })
      .subscribe();
    return function () { sb().removeChannel(ch); };
  };

  /** Indicador "digitando…" via broadcast (não persiste no banco). */
  api.messages.typingChannel = function (requestId, onTyping) {
    if (DEMO) {
      return { send: function () {}, close: bus.on("typing:" + requestId, onTyping) };
    }
    var ch = sb().channel("typing-" + requestId, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, function (p) { onTyping(p.payload); })
      .subscribe();
    return {
      send: function (userId) { ch.send({ type: "broadcast", event: "typing", payload: { user_id: userId } }); },
      close: function () { sb().removeChannel(ch); }
    };
  };

  api.messages.unreadCount = function (userId) {
    if (DEMO) {
      return delay(60).then(function () {
        return db.messages.filter(function (m) { return m.recipient_id === userId && !m.read_at; }).length;
      });
    }
    return sb().from("messages").select("id", { count: "exact", head: true })
      .eq("recipient_id", userId).is("read_at", null)
      .then(function (r) { if (r.error) throw r.error; return r.count || 0; });
  };

  /* ==========================================================================
     AVALIAÇÕES
     ========================================================================== */
  api.reviews = {};

  api.reviews.listByProfessional = function (professionalId) {
    if (DEMO) {
      return delay(240).then(function () {
        var s = readDemoSession(), me = s && findProfile(s.user_id);
        var canSeeHidden = me && (me.role === "admin" || me.id === professionalId);
        return db.reviews.filter(function (r) { return r.professional_id === professionalId && (!r.hidden || canSeeHidden); })
          .map(function (r) { var o = clone(r); o.client = clone(findProfile(r.client_id)); return o; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      });
    }
    return sb().from("reviews")
      .select("*, client:profiles!reviews_client_id_fkey(full_name, avatar_url)")
      .eq("professional_id", professionalId).order("created_at", { ascending: false }).then(unwrap);
  };

  api.reviews.create = function (payload) {
    if (DEMO) {
      return delay(420).then(function () {
        var r = Object.assign({ id: uid("rv"), reply: null, replied_at: null, created_at: nowIso() }, payload);
        db.reviews.unshift(r);
        var pro = findPro(payload.professional_id);
        if (pro) {
          var all = db.reviews.filter(function (x) { return x.professional_id === pro.id; });
          pro.reviews_count = all.length;
          pro.rating = Math.round((all.reduce(function (s, x) { return s + x.rating; }, 0) / all.length) * 100) / 100;
        }
        pushDemoNotification(payload.professional_id, "review", "Você recebeu uma avaliação",
          payload.rating + " estrelas", "#/avaliacoes");
        return clone(r);
      });
    }
    return sb().from("reviews").insert(payload).select().single().then(unwrap);
  };

  api.reviews.reply = function (id, reply) {
    if (DEMO) {
      return delay(280).then(function () {
        var r = db.reviews.filter(function (x) { return x.id === id; })[0];
        r.reply = reply; r.replied_at = nowIso();
        return clone(r);
      });
    }
    return sb().from("reviews").update({ reply: reply, replied_at: nowIso() }).eq("id", id).select().single().then(unwrap);
  };

  /* ==========================================================================
     NOTIFICAÇÕES
     ========================================================================== */
  api.notifications = {};

  function pushDemoNotification(userId, type, title, body, link) {
    var n = { id: uid("nt"), user_id: userId, type: type, title: title, body: body, link: link, read_at: null, created_at: nowIso() };
    db.notifications.unshift(n);
    bus.emit("notifications:" + userId, clone(n));
    return n;
  }
  api._notify = pushDemoNotification;

  api.notifications.list = function (userId) {
    if (DEMO) {
      return delay(160).then(function () {
        return db.notifications.filter(function (n) { return n.user_id === userId; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
          .slice(0, 30).map(clone);
      });
    }
    return sb().from("notifications").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(30).then(unwrap);
  };

  api.notifications.markAllRead = function (userId) {
    if (DEMO) {
      return delay(120).then(function () {
        db.notifications.forEach(function (n) { if (n.user_id === userId) n.read_at = nowIso(); });
      });
    }
    return sb().from("notifications").update({ read_at: nowIso() })
      .eq("user_id", userId).is("read_at", null).then(unwrap);
  };

  api.notifications.subscribe = function (userId, cb) {
    if (DEMO) return bus.on("notifications:" + userId, cb);
    var ch = sb().channel("notif-" + userId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + userId },
        function (p) { cb(p.new); })
      .subscribe();
    return function () { sb().removeChannel(ch); };
  };

  /* ==========================================================================
     FAVORITOS
     ========================================================================== */
  api.favorites = {};

  api.favorites.list = function (clientId) {
    if (DEMO) {
      return delay(180).then(function () {
        return db.favorites.filter(function (f) { return f.client_id === clientId; })
          .map(function (f) { return hydrateProfessional(f.professional_id); }).filter(Boolean);
      });
    }
    return sb().from("favorites")
      .select("professional:professionals(*, profile:profiles!professionals_id_fkey(full_name, avatar_url))")
      .eq("client_id", clientId).then(unwrap).then(function (rows) {
        return rows.map(function (r) {
          var p = r.professional;
          if (p && p.profile) { p.full_name = p.profile.full_name; p.avatar_url = p.profile.avatar_url; }
          return p;
        });
      });
  };

  api.favorites.toggle = function (clientId, professionalId) {
    if (DEMO) {
      return delay(180).then(function () {
        var i = db.favorites.findIndex(function (f) { return f.client_id === clientId && f.professional_id === professionalId; });
        if (i >= 0) { db.favorites.splice(i, 1); return false; }
        db.favorites.push({ client_id: clientId, professional_id: professionalId, created_at: nowIso() });
        return true;
      });
    }
    return sb().from("favorites").select("client_id").eq("client_id", clientId)
      .eq("professional_id", professionalId).maybeSingle().then(unwrap).then(function (row) {
        if (row) {
          return sb().from("favorites").delete().eq("client_id", clientId)
            .eq("professional_id", professionalId).then(function () { return false; });
        }
        return sb().from("favorites").insert({ client_id: clientId, professional_id: professionalId })
          .then(function () { return true; });
      });
  };

  api.favorites.has = function (clientId, professionalId) {
    if (DEMO) {
      return delay(60).then(function () {
        return db.favorites.some(function (f) { return f.client_id === clientId && f.professional_id === professionalId; });
      });
    }
    return sb().from("favorites").select("client_id").eq("client_id", clientId)
      .eq("professional_id", professionalId).maybeSingle().then(unwrap).then(Boolean);
  };

  /* ==========================================================================
     GANHOS / FINANCEIRO
     ========================================================================== */
  api.earnings = {};

  api.earnings.get = function (professionalId) {
    if (DEMO) {
      return delay(300).then(function () {
        var tx = db.transactions.filter(function (t) { return t.professional_id === professionalId && t.status !== "refunded"; });
        var startOf = function (unit) {
          var d = new Date();
          d.setHours(0, 0, 0, 0);
          if (unit === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          if (unit === "month") d.setDate(1);
          return d;
        };
        var sum = function (from) {
          return tx.filter(function (t) { return new Date(t.created_at) >= from; })
            .reduce(function (s, t) { return s + t.net_amount; }, 0);
        };
        var serie = [];
        for (var i = 6; i >= 0; i--) {
          var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
          var next = new Date(d); next.setDate(next.getDate() + 1);
          serie.push({
            dia: d.toISOString().slice(0, 10),
            valor: tx.filter(function (t) { var c = new Date(t.created_at); return c >= d && c < next; })
              .reduce(function (s, t) { return s + t.net_amount; }, 0)
          });
        }
        return {
          hoje: sum(startOf("day")), semana: sum(startOf("week")), mes: sum(startOf("month")),
          total: tx.reduce(function (s, t) { return s + t.net_amount; }, 0),
          a_receber: tx.filter(function (t) { return t.status === "pending"; })
            .reduce(function (s, t) { return s + t.net_amount; }, 0),
          servicos_concluidos: db.bookings.filter(function (b) {
            return b.professional_id === professionalId && b.status === "completed";
          }).length + tx.filter(function (t) { return /^bk-hist/.test(t.booking_id) && t.status === "released"; }).length,
          ultimos_7_dias: serie
        };
      });
    }
    return sb().rpc("professional_earnings", { p_professional_id: professionalId }).then(unwrap);
  };

  api.earnings.transactions = function (professionalId) {
    if (DEMO) {
      return delay(200).then(function () {
        return db.transactions.filter(function (t) { return t.professional_id === professionalId; }).map(clone)
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      });
    }
    return sb().from("transactions").select("*").eq("professional_id", professionalId)
      .order("created_at", { ascending: false }).limit(50).then(unwrap);
  };

  /* ==========================================================================
     ADMINISTRAÇÃO
     ========================================================================== */
  api.admin = {};

  api.admin.metrics = function () {
    if (DEMO) {
      return delay(320).then(function () {
        var completed = db.bookings.filter(function (b) { return b.status === "completed"; }).length;
        return {
          total_usuarios: db.profiles.length,
          total_clientes: db.profiles.filter(function (p) { return p.role === "client"; }).length,
          total_profissionais: db.professionals.length,
          profissionais_pendentes: db.professionals.filter(function (p) { return p.verification_status === "pending"; }).length,
          identidades_pendentes: db.identity_verifications.filter(function (v) { return v.status === "pending"; }).length,
          usuarios_bloqueados: db.profiles.filter(function (p) { return p.status === "blocked"; }).length,
          denuncias_abertas: db.reports.filter(function (r) { return r.status === "open" || r.status === "reviewing"; }).length,
          receita_prevista: db.transactions.filter(function (t) { return t.status === "pending"; })
            .reduce(function (s, t) { return s + t.platform_fee; }, 0),
          novos_usuarios_7d: db.profiles.filter(function (p) { return Date.now() - new Date(p.created_at) < 7 * 864e5; }).length,
          total_solicitacoes: db.service_requests.length,
          solicitacoes_abertas: db.service_requests.filter(function (r) { return ["open", "matching"].indexOf(r.status) >= 0; }).length,
          servicos_concluidos: completed + db.transactions.filter(function (t) { return /^bk-hist/.test(t.booking_id) && t.status === "released"; }).length,
          volume_transacionado: db.transactions.reduce(function (s, t) { return t.status === "refunded" ? s : s + t.amount; }, 0),
          receita_plataforma: db.transactions.reduce(function (s, t) { return t.status === "refunded" ? s : s + t.platform_fee; }, 0),
          taxa_conclusao: db.bookings.length ? Math.round((completed / db.bookings.length) * 1000) / 10 : 0
        };
      });
    }
    return sb().rpc("admin_metrics").then(unwrap);
  };

  api.admin.listUsers = function (filter) {
    if (DEMO) {
      return delay(240).then(function () {
        return db.profiles.filter(function (p) {
          if (filter && filter.role && p.role !== filter.role) return false;
          if (filter && filter.q) {
            var q = filter.q.toLowerCase();
            return (p.full_name || "").toLowerCase().indexOf(q) >= 0 || (p.email || "").toLowerCase().indexOf(q) >= 0;
          }
          return true;
        }).map(clone);
      });
    }
    var q = sb().from("profiles").select("*, private:profile_private(cpf)")
      .order("created_at", { ascending: false }).limit(500);
    if (filter && filter.role) q = q.eq("role", filter.role);
    return q.then(unwrap).then(function (rows) { return rows.map(flattenPrivate); });
  };

  /* ---- Trilha de auditoria ------------------------------------------------
     Toda decisão do admin vira uma linha em admin_audit_log. Falhar ao
     registrar nunca desfaz a ação principal. */
  api.admin.log = function (action, targetType, targetId, details) {
    if (DEMO) {
      var s = readDemoSession();
      db.audit_log.unshift({
        id: uid("au"), admin_id: s && s.user_id, action: action, target_type: targetType,
        target_id: targetId || null, details: details || null, created_at: nowIso()
      });
      persistDemo();
      return Promise.resolve();
    }
    return api.auth.currentUserId().then(function (adminId) {
      return sb().from("admin_audit_log").insert({
        admin_id: adminId, action: action, target_type: targetType,
        target_id: targetId || null, details: details || null
      });
    }).catch(function (e) { console.warn("[ServeGo] auditoria:", e); });
  };

  api.admin.listAudit = function () {
    if (DEMO) {
      return delay(200).then(function () {
        return db.audit_log.map(function (a) {
          var o = clone(a);
          o.admin = clone(findProfile(a.admin_id));
          o.target = a.target_type === "profile" ? clone(findProfile(a.target_id)) : null;
          return o;
        });
      });
    }
    return sb().from("admin_audit_log")
      .select("*, admin:profiles!admin_audit_log_admin_id_fkey(full_name, email)")
      .order("created_at", { ascending: false }).limit(300).then(unwrap)
      .then(function (rows) {
        var ids = rows.filter(function (r) { return r.target_type === "profile" && r.target_id; })
          .map(function (r) { return r.target_id; });
        if (!ids.length) return rows;
        return sb().from("profiles").select("id, full_name, email").in("id", ids).then(unwrap).then(function (ps) {
          var byId = {};
          ps.forEach(function (p) { byId[p.id] = p; });
          rows.forEach(function (r) { if (r.target_type === "profile") r.target = byId[r.target_id] || null; });
          return rows;
        });
      });
  };

  api.admin.setUserStatus = function (id, status) {
    if (DEMO) {
      return delay(240).then(function () {
        findProfile(id).status = status;
        persistDemo();
        return api.admin.log(status === "blocked" ? "user.blocked" : "user.unblocked", "profile", id);
      });
    }
    return sb().from("profiles").update({ status: status }).eq("id", id).then(unwrap).then(function () {
      return api.admin.log(status === "blocked" ? "user.blocked" : "user.unblocked", "profile", id);
    });
  };

  api.admin.setVerification = function (professionalId, status) {
    if (DEMO) {
      return delay(280).then(function () {
        var p = findPro(professionalId);
        p.verification_status = status;
        p.verified = status === "approved";
        pushDemoNotification(professionalId, "verification",
          status === "approved" ? "Cadastro aprovado" : "Cadastro reprovado",
          status === "approved" ? "Você já pode receber solicitações." : "Revise seus documentos.", "#/perfil");
        persistDemo();
        return api.admin.log("professional." + status, "profile", professionalId);
      });
    }
    return sb().from("professionals")
      .update({ verification_status: status, verified: status === "approved" })
      .eq("id", professionalId).then(unwrap).then(function () {
        return api.admin.log("professional." + status, "profile", professionalId);
      });
  };

  /* ---- Verificação de identidade (documento + selfie) --------------------- */
  /** CPF e nascimento vivem em profile_private (só dono + admin); traz para o perfil. */
  function flattenPrivate(p) {
    if (!p) return p;
    var priv = Array.isArray(p.private) ? p.private[0] : p.private;
    p.cpf = priv ? priv.cpf : (p.cpf || null);
    p.birth_date = priv ? priv.birth_date : (p.birth_date || null);
    delete p.private;
    return p;
  }

  function hydrateVerification(v) {
    var o = clone(v);
    o.user = clone(findProfile(v.user_id));
    return o;
  }

  api.admin.listVerifications = function (filter) {
    if (DEMO) {
      return delay(220).then(function () {
        return db.identity_verifications
          .filter(function (v) { return !filter || !filter.status || v.status === filter.status; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
          .map(hydrateVerification);
      });
    }
    var q = sb().from("identity_verifications")
      .select("*, user:profiles!identity_verifications_user_id_fkey(id, full_name, email, phone, role, status, identity_status, avatar_url, city, state, created_at, private:profile_private(cpf, birth_date))");
    if (filter && filter.status) q = q.eq("status", filter.status);
    return q.order("created_at", { ascending: false }).limit(300).then(unwrap).then(function (rows) {
      rows.forEach(function (v) { flattenPrivate(v.user); });
      return rows;
    });
  };

  /** URLs temporárias (10 min) das imagens no bucket privado. */
  api.admin.verificationImages = function (v) {
    if (DEMO) return Promise.resolve({ front: v.front_url, back: v.back_url, selfie: v.selfie_url });
    var bucket = SG.config.buckets.identity;
    var paths = [v.front_path, v.back_path, v.selfie_path];
    return sb().storage.from(bucket).createSignedUrls(paths, 600).then(function (res) {
      if (res.error) throw res.error;
      var urls = res.data.map(function (d) { return d.signedUrl; });
      return { front: urls[0], back: urls[1], selfie: urls[2] };
    });
  };

  api.admin.reviewVerification = function (id, status, reason) {
    var action = "identity." + status;
    if (DEMO) {
      return delay(320).then(function () {
        var v = db.identity_verifications.filter(function (x) { return x.id === id; })[0];
        var s = readDemoSession();
        v.status = status;
        v.rejection_reason = status === "rejected" ? (reason || null) : null;
        v.reviewed_by = s && s.user_id;
        v.reviewed_at = nowIso();
        var p = findProfile(v.user_id);
        if (p) p.identity_status = status;
        pushDemoNotification(v.user_id, "verification",
          status === "approved" ? "Identidade verificada" : "Verificação de identidade recusada",
          status === "approved" ? "Seu cadastro foi liberado. Bem-vindo ao ServeGo!" : (reason || "Envie novas fotos."),
          "#/inicio");
        persistDemo();
        return api.admin.log(action, "profile", v.user_id, reason ? { motivo: reason } : null);
      });
    }
    return api.auth.currentUserId().then(function (adminId) {
      return sb().from("identity_verifications").update({
        status: status,
        rejection_reason: status === "rejected" ? (reason || null) : null,
        reviewed_by: adminId,
        reviewed_at: nowIso()
      }).eq("id", id).select("user_id").single().then(unwrap);
    }).then(function (row) {
      return api.admin.log(action, "profile", row.user_id, reason ? { motivo: reason } : null);
    });
  };

  /** Ficha completa de um usuário para o painel lateral do admin. */
  api.admin.userDetail = function (id) {
    if (DEMO) {
      return delay(260).then(function () {
        var p = clone(findProfile(id));
        if (!p) return null;
        if (p.role === "professional") p.professional = hydrateProfessional(id);
        var vs = db.identity_verifications.filter(function (v) { return v.user_id === id; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        p.verification = vs[0] ? clone(vs[0]) : null;
        p.stats = {
          solicitacoes: db.service_requests.filter(function (r) { return r.client_id === id; }).length,
          servicos: db.bookings.filter(function (b) { return b.client_id === id || b.professional_id === id; }).length,
          avaliacoes: db.reviews.filter(function (r) { return r.client_id === id || r.professional_id === id; }).length,
          denuncias: db.reports.filter(function (r) { return r.target_user_id === id; }).length
        };
        p.history = db.audit_log.filter(function (a) { return a.target_id === id; }).map(clone);
        return p;
      });
    }
    function count(table, col) {
      return sb().from(table).select("id", { count: "exact", head: true }).eq(col, id)
        .then(function (r) { return r.count || 0; });
    }
    return Promise.all([
      api.profiles.get(id),
      sb().from("identity_verifications").select("*").eq("user_id", id)
        .order("created_at", { ascending: false }).limit(1).then(unwrap),
      count("service_requests", "client_id"),
      Promise.all([count("bookings", "client_id"), count("bookings", "professional_id")]),
      Promise.all([count("reviews", "client_id"), count("reviews", "professional_id")]),
      count("reports", "target_user_id"),
      sb().from("admin_audit_log").select("*").eq("target_id", id)
        .order("created_at", { ascending: false }).limit(20).then(unwrap),
      sb().from("profile_private").select("cpf, birth_date").eq("user_id", id).maybeSingle().then(unwrap)
    ]).then(function (r) {
      var p = r[0];
      if (!p) return null;
      p.private = r[7];
      flattenPrivate(p);
      p.verification = r[1][0] || null;
      p.stats = {
        solicitacoes: r[2],
        servicos: r[3][0] + r[3][1],
        avaliacoes: r[4][0] + r[4][1],
        denuncias: r[5]
      };
      p.history = r[6];
      return p;
    });
  };

  /* ---- Financeiro --------------------------------------------------------- */
  api.admin.listTransactions = function () {
    if (DEMO) {
      return delay(240).then(function () {
        return db.transactions.map(function (t) {
          var o = clone(t);
          o.professional = clone(findProfile(t.professional_id));
          o.client = clone(findProfile(t.client_id));
          return o;
        }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      });
    }
    return sb().from("transactions")
      .select("*, client:profiles!transactions_client_id_fkey(full_name, email), professional:professionals(id, profile:profiles!professionals_id_fkey(full_name, email))")
      .order("created_at", { ascending: false }).limit(500).then(unwrap)
      .then(function (rows) {
        rows.forEach(function (t) {
          if (t.professional && t.professional.profile) t.professional = t.professional.profile;
        });
        return rows;
      });
  };

  api.admin.setTransactionStatus = function (id, status) {
    if (DEMO) {
      return delay(220).then(function () {
        var t = db.transactions.filter(function (x) { return x.id === id; })[0];
        t.status = status;
        return api.admin.log("transaction." + status, "transaction", id, { valor: t.amount });
      });
    }
    return sb().from("transactions").update({ status: status }).eq("id", id).then(unwrap).then(function () {
      return api.admin.log("transaction." + status, "transaction", id);
    });
  };

  /* ---- Comunicados -------------------------------------------------------- */
  api.admin.broadcast = function (audience, title, body) {
    if (DEMO) {
      return delay(400).then(function () {
        var targets = db.profiles.filter(function (p) {
          if (p.role === "admin" || p.status === "blocked") return false;
          return audience === "all" || p.role === audience;
        });
        targets.forEach(function (p) { pushDemoNotification(p.id, "broadcast", title, body, "#/inicio"); });
        persistDemo();
        api.admin.log("broadcast.sent", "broadcast", null, { publico: audience, titulo: title, enviados: targets.length });
        return targets.length;
      });
    }
    return sb().rpc("admin_broadcast", { p_audience: audience, p_title: title, p_body: body }).then(unwrap)
      .then(function (n) {
        api.admin.log("broadcast.sent", "broadcast", null, { publico: audience, titulo: title, enviados: n });
        return n;
      });
  };

  /* ---- Reengajamento ----------------------------------------------------- */
  /** Lembrete para contas inativas: notificação no app (+ e-mail opcional). {nome} vira o primeiro nome. */
  api.admin.sendReminder = function (userIds, title, body, email) {
    var log = function (res) {
      api.admin.log("reminder.sent", "reminder", null, {
        titulo: title, enviados: res.notified, emails: res.emailed || 0, publico: userIds.length + " conta(s)"
      });
      return res;
    };
    if (DEMO) {
      return delay(500).then(function () {
        var n = 0, mails = 0;
        userIds.forEach(function (id) {
          var p = findProfile(id);
          if (!p || p.role === "admin" || p.status !== "active") return;
          var first = String(p.full_name || "").split(" ")[0];
          pushDemoNotification(id, "reminder", title.split("{nome}").join(first), body.split("{nome}").join(first), "#/inicio");
          p.last_reminded_at = nowIso();
          n++;
          if (email && p.email) mails++;
        });
        persistDemo();
        return log({ notified: n, emailed: mails, email_configured: true });
      });
    }
    return sb().functions.invoke("send-reminder", { body: { user_ids: userIds, title: title, body: body, email: !!email } })
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.error) throw new Error(res.data.error);
        return log(res.data);
      });
  };

  api.admin.listBroadcasts = function () {
    return api.admin.listAudit().then(function (list) {
      return list.filter(function (a) { return a.action === "broadcast.sent"; });
    });
  };

  /* ---- Documentos complementares do profissional -------------------------- */
  api.admin.setDocumentStatus = function (docId, status) {
    if (DEMO) {
      return delay(220).then(function () {
        var d = db.professional_documents.filter(function (x) { return x.id === docId; })[0];
        d.status = status; d.reviewed_at = nowIso();
        persistDemo();
        return api.admin.log("document." + status, "profile", d.professional_id, { documento: d.doc_type });
      });
    }
    return api.auth.currentUserId().then(function (adminId) {
      return sb().from("professional_documents")
        .update({ status: status, reviewed_by: adminId, reviewed_at: nowIso() })
        .eq("id", docId).select("professional_id, doc_type").single().then(unwrap);
    }).then(function (d) {
      return api.admin.log("document." + status, "profile", d.professional_id, { documento: d.doc_type });
    });
  };

  api.admin.documentUrl = function (doc) {
    if (DEMO) return Promise.resolve(doc.url || SG.mock.photo(5, "📄"));
    return sb().storage.from(SG.config.buckets.documents).createSignedUrl(doc.storage_path, 600)
      .then(function (res) { if (res.error) throw res.error; return res.data.signedUrl; });
  };

  /* ==========================================================================
     CONFIGURAÇÕES DA PLATAFORMA (app_settings)
     ========================================================================== */
  api.settings = {};

  /** Lê as configurações e aplica em SG.config (todas as telas leem de lá). */
  api.settings.load = function () {
    var p = DEMO
      ? delay(60).then(function () { return clone(db.app_settings); })
      : sb().from("app_settings").select("key, value").then(unwrap);
    return p.then(function (rows) {
      var out = {};
      (rows || []).forEach(function (r) { out[r.key] = r.value; });
      SG.settings = Object.assign(SG.settings || {}, out);
      var fee = Number(out.platform_fee_percent);
      if (!isNaN(fee) && out.platform_fee_percent !== undefined) SG.config.app.platformFeePercent = fee;
      var pc = SG.config.payments = SG.config.payments || {};
      [["dispatch_timeout_seconds", "dispatchTimeoutSeconds"], ["payment_timeout_minutes", "paymentTimeoutMinutes"],
       ["urgency_surcharge_percent", "urgencySurchargePercent"],
       ["completion_auto_confirm_hours", "completionAutoConfirmHours"],
       ["dispatch_radius_km", "dispatchRadiusKm"], ["min_order_value", "minOrderValue"]].forEach(function (k) {
        if (out[k[0]] !== undefined && !isNaN(Number(out[k[0]]))) pc[k[1]] = Number(out[k[0]]);
      });
      return out;
    });
  };

  api.settings.setPlatformFee = function (percent) {
    percent = Math.round(Number(percent) * 100) / 100;
    if (isNaN(percent) || percent < 0 || percent > 50) {
      return Promise.reject(new Error("A taxa da plataforma deve ficar entre 0% e 50%."));
    }
    var old = SG.config.app.platformFeePercent;
    var done = function () {
      SG.config.app.platformFeePercent = percent;
      return api.admin.log("settings.fee", "settings", null, { de: old, para: percent }).then(function () { return percent; });
    };
    if (DEMO) {
      return delay(280).then(function () {
        var row = db.app_settings.filter(function (r) { return r.key === "platform_fee_percent"; })[0];
        var s = readDemoSession();
        if (row) row.value = percent; else db.app_settings.push({ key: "platform_fee_percent", value: percent });
        db.platform_fee_history.unshift({
          id: uid("fee"), old_percent: old, new_percent: percent, changed_by: s && s.user_id, created_at: nowIso()
        });
        persistDemo();
        return done();
      });
    }
    return sb().from("app_settings").upsert({ key: "platform_fee_percent", value: percent }).then(unwrap).then(done);
  };

  /** Grava uma configuração (admin): número, texto ou liga/desliga. */
  api.settings.set = function (key, value) {
    if (typeof value !== "boolean" && typeof value !== "string") {
      value = Number(value);
      if (isNaN(value) || value < 0) return Promise.reject(new Error("Valor inválido."));
    }
    var done = function () {
      return api.settings.load().then(function () {
        return api.admin.log("settings." + key, "settings", null, { valor: value });
      });
    };
    if (DEMO) {
      return delay(200).then(function () {
        var row = db.app_settings.filter(function (r) { return r.key === key; })[0];
        if (row) row.value = value; else db.app_settings.push({ key: key, value: value });
        persistDemo();
        return done();
      });
    }
    return sb().from("app_settings").upsert({ key: key, value: value }).then(unwrap).then(done);
  };

  api.settings.feeHistory = function () {
    if (DEMO) {
      return delay(150).then(function () {
        return db.platform_fee_history.map(function (h) {
          var o = clone(h);
          o.admin = clone(findProfile(h.changed_by));
          return o;
        });
      });
    }
    return sb().from("platform_fee_history")
      .select("*, admin:profiles!platform_fee_history_changed_by_fkey(full_name)")
      .order("created_at", { ascending: false }).limit(50).then(unwrap);
  };

  /* ==========================================================================
     DISPUTAS — provas (fotos/vídeos), relatos das partes e decisão do admin
     ========================================================================== */
  api.disputes = {};

  var EVIDENCE_BUCKET = "dispute-evidence";
  var MAX_VIDEO_MB = 50;
  var DISPUTE_COLS = "id, booking_id, client_id, professional_id, amount, reason, status, info_requested_from, " +
    "info_request, decision_reason, decided_by, decided_at, created_at, updated_at";

  /** Envia fotos/vídeos de prova. Fotos são comprimidas; vídeos até 50 MB. */
  api.disputes.upload = function (bookingId, files) {
    files = Array.prototype.slice.call(files || []);
    var bad = files.filter(function (f) { return !/^(image|video)\//.test(f.type); })[0];
    if (bad) return Promise.reject(new Error("Envie apenas fotos ou vídeos (" + bad.name + ")."));
    var big = files.filter(function (f) { return /^video\//.test(f.type) && f.size > MAX_VIDEO_MB * 1048576; })[0];
    if (big) return Promise.reject(new Error("Vídeo muito grande: " + big.name + " (máx. " + MAX_VIDEO_MB + " MB)."));

    return api.auth.currentUserId().then(function (uidNow) {
      return Promise.all(files.map(function (f, i) {
        var isVideo = /^video\//.test(f.type);
        var prep = isVideo || !SG.identity ? Promise.resolve(f) : SG.identity.compress(f, 1600, 0.85).catch(function () { return f; });
        return prep.then(function (blob) {
          var kind = isVideo ? "video" : "image";
          var mime = blob.type || f.type;
          if (DEMO) {
            var url = isVideo ? URL.createObjectURL(blob) : null;
            var done = function (u) { return { kind: kind, mime: mime, size: blob.size, path: "demo/" + uid("ev"), url: u }; };
            if (url) return done(url);
            return blobToDataUrl(blob).then(done);
          }
          var ext = (f.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
          var path = uidNow + "/" + bookingId + "/" + Date.now() + "-" + i + "." + (isVideo ? ext : "jpg");
          return sb().storage.from(EVIDENCE_BUCKET).upload(path, blob, { contentType: mime, upsert: false })
            .then(function (res) {
              if (res.error) throw res.error;
              return { kind: kind, mime: mime, size: blob.size, path: path };
            });
        });
      }));
    });
  };

  /** Links temporários (1 h) para os anexos privados. */
  function signEntries(entries) {
    if (DEMO) return Promise.resolve(entries);
    var paths = [];
    entries.forEach(function (e) { (e.attachments || []).forEach(function (a) { paths.push(a.path); }); });
    if (!paths.length) return Promise.resolve(entries);
    return sb().storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 3600).then(function (res) {
      if (res.error) throw res.error;
      var byPath = {};
      res.data.forEach(function (d) { byPath[d.path] = d.signedUrl; });
      entries.forEach(function (e) { (e.attachments || []).forEach(function (a) { a.url = byPath[a.path]; }); });
      return entries;
    });
  }

  function demoEntries(disputeId) {
    return db.dispute_entries.filter(function (e) { return e.dispute_id === disputeId; })
      .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); })
      .map(function (e) { var o = clone(e); o.author = clone(findProfile(e.author_id)); return o; });
  }

  function hydrateDispute(d, withNotes) {
    var o = clone(d);
    if (!withNotes) delete o.admin_notes;
    o.client = clone(findProfile(d.client_id));
    o.professional = clone(findProfile(d.professional_id));
    var b = db.bookings.filter(function (x) { return x.id === d.booking_id; })[0];
    var r = b && db.service_requests.filter(function (x) { return x.id === b.request_id; })[0];
    o.request = r ? { id: r.id, title: r.title, category: clone(findCat(r.category_id)) } : null;
    var entries = db.dispute_entries.filter(function (e) { return e.dispute_id === d.id; });
    o.entries_count = entries.length;
    o.evidence_count = entries.reduce(function (n, e) { return n + (e.attachments || []).length; }, 0);
    o.pro_answered = entries.some(function (e) { return e.party === "professional"; });
    return o;
  }

  /** Disputa de um serviço (para cliente e profissional; sem as notas internas). */
  api.disputes.forBooking = function (bookingId) {
    if (DEMO) {
      return delay(150).then(function () {
        var d = db.disputes.filter(function (x) { return x.booking_id === bookingId; })[0];
        return d ? { dispute: hydrateDispute(d, false), entries: demoEntries(d.id) } : null;
      });
    }
    return sb().from("disputes").select(DISPUTE_COLS).eq("booking_id", bookingId).maybeSingle().then(unwrap)
      .then(function (d) {
        if (!d) return null;
        return sb().from("dispute_entries").select("*, author:profiles!dispute_entries_author_id_fkey(full_name, avatar_url)")
          .eq("dispute_id", d.id).order("created_at").then(unwrap).then(signEntries)
          .then(function (entries) { return { dispute: d, entries: entries }; });
      });
  };

  /** Cliente ou profissional envia relato e provas. */
  api.disputes.addEntry = function (disputeId, note, attachments) {
    if (DEMO) {
      return delay(400).then(function () {
        var d = db.disputes.filter(function (x) { return x.id === disputeId; })[0];
        var s = readDemoSession();
        var me = s && s.user_id;
        var party = me === d.client_id ? "client" : me === d.professional_id ? "professional" : null;
        if (!party) throw new Error("Acesso negado.");
        if (["open", "awaiting_info"].indexOf(d.status) < 0) throw new Error("Esta disputa já foi decidida.");
        if (!note && !(attachments || []).length) throw new Error("Escreva um relato ou anexe provas.");
        var e = { id: uid("de"), dispute_id: d.id, author_id: me, party: party, note: note || null, attachments: attachments || [], created_at: nowIso() };
        db.dispute_entries.push(e);
        if (d.status === "awaiting_info" && d.info_requested_from === party) {
          d.status = "open"; d.info_requested_from = null; d.info_request = null;
        }
        d.updated_at = nowIso();
        pushDemoNotification("user-admin", "status", "Nova prova em disputa",
          (party === "client" ? "O cliente" : "O profissional") + " enviou informações.", "#/admin/disputas/" + d.id);
        return clone(e);
      });
    }
    return sb().rpc("add_dispute_entry", { p_dispute_id: disputeId, p_note: note || null, p_attachments: attachments || [] }).then(unwrap);
  };

  /* ---- Admin -------------------------------------------------------------- */
  api.disputes.list = function () {
    if (DEMO) {
      return delay(200).then(function () {
        return db.disputes.map(function (d) { return hydrateDispute(d, false); })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      });
    }
    return sb().from("disputes")
      .select(DISPUTE_COLS + ", client:profiles!disputes_client_id_fkey(full_name, avatar_url), " +
        "professional:profiles!disputes_professional_id_fkey(full_name, avatar_url), " +
        "booking:bookings(request:service_requests(id, title, category:categories(name, icon))), entries:dispute_entries(party, attachments)")
      .order("created_at", { ascending: false }).limit(300).then(unwrap).then(function (rows) {
        rows.forEach(function (d) {
          d.request = d.booking && d.booking.request;
          var es = d.entries || [];
          d.entries_count = es.length;
          d.evidence_count = es.reduce(function (n, e) { return n + (e.attachments || []).length; }, 0);
          d.pro_answered = es.some(function (e) { return e.party === "professional"; });
        });
        return rows;
      });
  };

  /** Caso completo para análise: disputa, relatos, serviço, linha do tempo, chat e notas internas. */
  api.disputes.get = function (id) {
    if (DEMO) {
      return delay(260).then(function () {
        var d = db.disputes.filter(function (x) { return x.id === id; })[0];
        if (!d) return null;
        var b = db.bookings.filter(function (x) { return x.id === d.booking_id; })[0];
        var out = { dispute: hydrateDispute(d, true), entries: demoEntries(d.id), booking: b ? hydrateBooking(b) : null };
        out.messages = b ? db.messages.filter(function (m) { return m.request_id === b.request_id; })
          .sort(function (x, y) { return new Date(x.created_at) - new Date(y.created_at); }).map(clone) : [];
        return out;
      });
    }
    return sb().from("disputes").select(DISPUTE_COLS).eq("id", id).maybeSingle().then(unwrap).then(function (d) {
      if (!d) return null;
      return Promise.all([
        sb().from("dispute_entries").select("*, author:profiles!dispute_entries_author_id_fkey(full_name, avatar_url)")
          .eq("dispute_id", id).order("created_at").then(unwrap).then(signEntries),
        api.bookings.get(d.booking_id),
        sb().rpc("dispute_admin_notes", { p_dispute_id: id }).then(unwrap),
        sb().from("profiles").select("id, full_name, avatar_url, email, phone").in("id", [d.client_id, d.professional_id]).then(unwrap)
      ]).then(function (r) {
        var people = {};
        r[3].forEach(function (p) { people[p.id] = p; });
        d.admin_notes = r[2] || "";
        d.client = people[d.client_id];
        d.professional = people[d.professional_id];
        var bk = r[1];
        if (bk && bk.professional && bk.professional.profile) {
          bk.professional.full_name = bk.professional.profile.full_name;
        }
        d.request = bk && bk.request;
        return sb().from("messages").select("*").eq("request_id", bk.request_id).order("created_at").then(unwrap)
          .then(function (msgs) { return { dispute: d, entries: r[0], booking: bk, messages: msgs }; });
      });
    });
  };

  api.disputes.setNotes = function (id, notes) {
    if (DEMO) {
      return delay(200).then(function () {
        db.disputes.filter(function (x) { return x.id === id; })[0].admin_notes = notes;
      });
    }
    return sb().rpc("dispute_set_notes", { p_dispute_id: id, p_notes: notes }).then(unwrap);
  };

  api.disputes.requestInfo = function (id, party, message) {
    var log = function () { return api.admin.log("dispute.info", "dispute", id, { motivo: message }); };
    if (DEMO) {
      return delay(300).then(function () {
        var d = db.disputes.filter(function (x) { return x.id === id; })[0];
        if (["open", "awaiting_info"].indexOf(d.status) < 0) throw new Error("Esta disputa já foi decidida.");
        d.status = "awaiting_info"; d.info_requested_from = party; d.info_request = message; d.updated_at = nowIso();
        var s = readDemoSession();
        db.dispute_entries.push({ id: uid("de"), dispute_id: d.id, author_id: s && s.user_id, party: "admin",
          note: "Pedido de informações: " + message, attachments: [], created_at: nowIso() });
        pushDemoNotification(party === "client" ? d.client_id : d.professional_id, "status",
          "A equipe ServeGo precisa de mais informações", message, "#/inicio");
        return log();
      });
    }
    return sb().rpc("dispute_request_info", { p_dispute_id: id, p_party: party, p_message: message }).then(unwrap).then(log);
  };

  /** Decisão: "refund" (estorno integral ao cliente) ou "release" (paga o profissional). */
  api.disputes.decide = function (id, outcome, reason) {
    if (!reason || reason.trim().length < 10) return Promise.reject(new Error("Escreva a justificativa da decisão."));
    var bookingIdOf = DEMO
      ? Promise.resolve((db.disputes.filter(function (x) { return x.id === id; })[0] || {}).booking_id)
      : sb().from("disputes").select("booking_id").eq("id", id).single().then(unwrap).then(function (d) { return d.booking_id; });
    return bookingIdOf.then(function (bookingId) {
      var log = function () { return api.admin.log("dispute." + outcome, "dispute", id, { motivo: reason }); };
      if (!DEMO) {
        var p = outcome === "refund"
          ? sb().functions.invoke("refund-payment", { body: { booking_id: bookingId, reason: reason } }).then(function (res) {
              if (res.error) throw res.error;
              if (res.data && res.data.error) throw new Error(res.data.error);
            })
          : sb().rpc("resolve_dispute_release", { p_booking_id: bookingId, p_reason: reason }).then(unwrap);
        return p.then(log);
      }
      var d = db.disputes.filter(function (x) { return x.id === id; })[0];
      var b = db.bookings.filter(function (x) { return x.id === bookingId; })[0];
      if (!b || b.status !== "disputed") return Promise.reject(new Error("Este serviço não está em disputa."));
      var s = readDemoSession();
      var finish = function (status) {
        d.status = status; d.decision_reason = reason; d.decided_by = s && s.user_id; d.decided_at = nowIso(); d.updated_at = nowIso();
        return log();
      };
      if (outcome === "refund") {
        return api.bookings.cancel(bookingId, "Disputa decidida a favor do cliente: " + reason).then(function () {
          pushDemoNotification(b.client_id, "status", "Disputa decidida a seu favor", "Estorno integral de " + ui.money(b.price) + ". " + reason, "#/acompanhar/" + b.id);
          pushDemoNotification(b.professional_id, "status", "Disputa decidida", "O pagamento foi estornado ao cliente. " + reason, "#/servico/" + b.id);
          return finish("resolved_refund");
        });
      }
      return delay(320).then(function () {
        b.confirmed_by = "admin";
        demoSetStatus(b, "completed", "Disputa decidida a favor do profissional");
        pushDemoNotification(b.client_id, "status", "Disputa decidida", "O pagamento foi liberado ao profissional. " + reason, "#/acompanhar/" + b.id);
        return finish("resolved_release");
      });
    });
  };

  /* ==========================================================================
     IDENTIDADE (lado do usuário)
     ========================================================================== */
  api.identity = {};

  api.identity.mine = function (userId) {
    if (DEMO) {
      return delay(160).then(function () {
        var vs = db.identity_verifications.filter(function (v) { return v.user_id === userId; })
          .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        return vs[0] ? clone(vs[0]) : null;
      });
    }
    return sb().from("identity_verifications").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1).then(unwrap)
      .then(function (rows) { return rows[0] || null; });
  };

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /** Envia documento (frente e verso) e selfie. payload: { doc_type, front, back, selfie } (Blobs). */
  api.identity.submit = function (userId, payload) {
    if (DEMO) {
      return Promise.all([blobToDataUrl(payload.front), blobToDataUrl(payload.back), blobToDataUrl(payload.selfie)])
        .then(function (urls) {
          var v = {
            id: uid("idv"), user_id: userId, doc_type: payload.doc_type,
            front_url: urls[0], back_url: urls[1], selfie_url: urls[2],
            status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null, created_at: nowIso()
          };
          db.identity_verifications.unshift(v);
          var p = findProfile(userId);
          if (p) p.identity_status = "pending";
          persistDemo();
          return delay(500).then(function () { return clone(v); });
        });
    }
    var bucket = SG.config.buckets.identity;
    var stamp = Date.now();
    var parts = [["front", payload.front], ["back", payload.back], ["selfie", payload.selfie]];
    return Promise.all(parts.map(function (p) {
      var path = userId + "/" + stamp + "-" + p[0] + ".jpg";
      return sb().storage.from(bucket).upload(path, p[1], { contentType: p[1].type || "image/jpeg", upsert: false })
        .then(function (res) { if (res.error) throw res.error; return path; });
    })).then(function (paths) {
      return sb().from("identity_verifications").insert({
        user_id: userId, doc_type: payload.doc_type,
        front_path: paths[0], back_path: paths[1], selfie_path: paths[2]
      }).select().single().then(unwrap);
    });
  };

  api.admin.listReports = function () {
    if (DEMO) {
      return delay(200).then(function () {
        return db.reports.map(function (r) {
          var o = clone(r);
          o.reporter = clone(findProfile(r.reporter_id));
          o.target = clone(findProfile(r.target_user_id));
          var b = r.booking_id && db.bookings.filter(function (x) { return x.id === r.booking_id; })[0];
          o.booking = b ? { id: b.id, status: b.status, price: b.price } : null;
          return o;
        });
      });
    }
    return sb().from("reports")
      .select("*, reporter:profiles!reports_reporter_id_fkey(full_name), target:profiles!reports_target_user_id_fkey(full_name), booking:bookings(id, status, price)")
      .order("created_at", { ascending: false }).then(unwrap);
  };

  api.admin.resolveReport = function (id, status) {
    if (DEMO) {
      return delay(220).then(function () {
        var r = db.reports.filter(function (x) { return x.id === id; })[0];
        r.status = status; r.resolved_at = nowIso();
        persistDemo();
        return api.admin.log("report." + status, "report", id, { motivo: r.reason });
      });
    }
    return sb().from("reports").update({ status: status, resolved_at: nowIso() }).eq("id", id).then(unwrap)
      .then(function () { return api.admin.log("report." + status, "report", id); });
  };

  api.admin.listDocuments = function () {
    if (DEMO) {
      return delay(200).then(function () {
        return db.professional_documents.map(function (d) {
          var o = clone(d);
          o.professional = hydrateProfessional(d.professional_id);
          return o;
        });
      });
    }
    return sb().from("professional_documents")
      .select("*, professional:professionals(id, profile:profiles!professionals_id_fkey(full_name))")
      .order("created_at", { ascending: false }).then(unwrap);
  };

  api.admin.listReviews = function () {
    if (DEMO) {
      return delay(200).then(function () {
        return db.reviews.map(function (r) {
          var o = clone(r);
          o.client = clone(findProfile(r.client_id));
          o.professional = hydrateProfessional(r.professional_id);
          return o;
        });
      });
    }
    return sb().from("reviews")
      .select("*, client:profiles!reviews_client_id_fkey(full_name), professional:professionals(id, profile:profiles!professionals_id_fkey(full_name))")
      .order("created_at", { ascending: false }).limit(100).then(unwrap);
  };

  /* ==========================================================================
     DENÚNCIAS
     ========================================================================== */
  api.reports = {};

  api.reports.create = function (payload) {
    if (DEMO) {
      return delay(320).then(function () {
        var r = Object.assign({ id: uid("rp"), status: "open", created_at: nowIso() }, payload);
        db.reports.unshift(r);
        return clone(r);
      });
    }
    return sb().from("reports").insert(payload).select().single().then(unwrap);
  };

  /* ==========================================================================
     SIMULAÇÕES DO MODO DEMO
     Fazem o marketplace parecer vivo: chamadas sendo aceitas, respostas no chat,
     profissional avançando o status do serviço.
     ========================================================================== */
  function scheduleDemoBookingProgress(bk) {
    if (!DEMO) return;
    var steps = ["on_the_way", "arrived", "in_progress", "awaiting_confirmation"];
    steps.forEach(function (s, i) {
      setTimeout(function () {
        var live = db.bookings.filter(function (b) { return b.id === bk.id; })[0];
        if (!live || live.status === "cancelled" || live.status === "completed") return;
        if (["on_the_way", "arrived", "in_progress", "awaiting_confirmation"].indexOf(live.status) > i) return;
        if (live.status === "disputed") return;
        live.status = s; live.updated_at = nowIso();
        if (s === "arrived") live.arrived_at = nowIso();
        if (s === "on_the_way") live.started_at = nowIso();
        db.booking_events.push({ id: uid("ev"), booking_id: bk.id, status: s, note: null, created_at: nowIso() });
        pushDemoNotification(bk.client_id, "status", ui.labels.bookingStatus[s],
          "Acompanhe em tempo real", "#/acompanhar/" + bk.id);
        bus.emit("booking:" + bk.id, hydrateBooking(live));
      }, 9000 + i * 12000);
    });
  }

  function scheduleDemoReply(msg) {
    if (!DEMO) return;
    var responder = msg.recipient_id;
    if (!findProfile(responder)) return;
    bus.emit("typing:" + msg.request_id, { user_id: responder });
    setTimeout(function () {
      var replies = [
        "Perfeito, anotado!",
        "Certo. Já estou organizando aqui e te aviso assim que sair.",
        "Combinado. Qualquer mudança eu aviso por aqui.",
        "Obrigado pela informação, isso ajuda bastante."
      ];
      var m = {
        id: uid("msg"), request_id: msg.request_id, booking_id: msg.booking_id,
        sender_id: responder, recipient_id: msg.sender_id,
        content: replies[Math.floor(Math.random() * replies.length)],
        image_url: null, read_at: null, created_at: nowIso()
      };
      db.messages.push(m);
      bus.emit("messages:" + msg.request_id, clone(m));
      pushDemoNotification(msg.sender_id, "message", "Nova mensagem", m.content, "#/mensagens/" + msg.request_id);
    }, 2400 + Math.random() * 2200);
  }

  /* Peças internas para os módulos que estendem a camada (js/api-admin.js). */
  api._kit = {
    db: db, DEMO: DEMO, sb: sb, unwrap: unwrap, delay: delay, clone: clone, uid: uid, nowIso: nowIso,
    persistDemo: persistDemo, findProfile: findProfile, findPro: findPro, findCat: findCat,
    hydrateRequest: hydrateRequest, hydrateProfessional: hydrateProfessional, hydrateBooking: hydrateBooking,
    readDemoSession: readDemoSession, notify: pushDemoNotification, bus: bus,
    dispatchNext: demoDispatchNext, hydrateDispatch: hydrateDispatch
  };

  SG.api = api;
})(window.SG);
