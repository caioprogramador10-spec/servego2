/* ==========================================================================
   ServeGo — Controle total do admin
   Ficha 360° do usuário, central do pedido, conversas, monitor de chamadas,
   equipe e permissões, controles do app, relatórios e busca global (Ctrl+K).
   Reaproveita os utilitários de js/views/admin.js (SG.adminKit).
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api, app = SG.app;
  var A = api.admin;
  SG.views = SG.views || {};

  function K() { return SG.adminKit; }
  function D() { return SG.dash; }
  function myAdminRole() { return (app.state.me && app.state.me.admin_role) || "owner"; }
  function isOwner() { return myAdminRole() === "owner"; }
  function fail(err) { ui.toast(SG.explainError(err), { type: "error" }); }
  function money(v) { return ui.money(Number(v || 0)); }
  function sum(list, fn) { return (list || []).reduce(function (s, x) { return s + Number(fn(x) || 0); }, 0); }

  function back(href, label) {
    return '<a class="adm-back" href="' + href + '">' + SG.icon("chevronLeft", 15) + ui.esc(label) + "</a>";
  }
  function card(title, sub, body, tools) {
    return '<section class="dash-card">' +
      '<div class="dash-card__head"><div><h3 class="dash-card__title">' + title + "</h3>" +
        (sub ? '<div class="dash-card__sub">' + sub + "</div>" : "") + "</div>" + (tools || "") + "</div>" +
      body + "</section>";
  }
  function tabs(id, items, active) {
    return '<div class="sg-seg-wrap"><div class="sg-seg" role="tablist" id="' + id + '">' +
      items.map(function (t) {
        return '<button class="sg-chip' + (t[0] === active ? " is-active" : "") + '" data-tab="' + t[0] + '" role="tab">' +
          ui.esc(t[1]) + (t[2] !== undefined ? '<span class="sg-seg__count">' + ui.num(t[2]) + "</span>" : "") + "</button>";
      }).join("") + "</div></div>";
  }
  function bindTabs(id, onChange) {
    ui.on(ui.$("#" + id), "click", "[data-tab]", function (e, el) {
      ui.$$("#" + id + " [data-tab]").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      onChange(el.getAttribute("data-tab"));
    });
  }
  function empty(text) {
    return '<div class="dash-empty dash-tone--green"><span class="dash-ic">' + SG.icon("check", 16) + "</span>" + ui.esc(text) + "</div>";
  }
  function person(p, role) {
    if (!p) return '<div class="sg-sm sg-dim">—</div>';
    return '<a class="adm-person" href="#/admin/usuarios/' + ui.esc(p.id) + '">' + ui.avatar(p, "sm") +
      '<div style="min-width:0"><div class="sg-md sg-strong sg-truncate">' + ui.esc(p.full_name || "—") + "</div>" +
      '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(role || p.email || "") + "</div></div>" +
      SG.icon("chevronRight", 15) + "</a>";
  }
  function auditList(list) {
    var L = K().AUDIT_LABEL;
    return list && list.length
      ? '<ul class="dash-timeline">' + list.slice(0, 12).map(function (a) {
          var d = a.details || {};
          var extra = d.motivo || d.titulo || d.campos || d.para || "";
          return '<li class="dash-tone--gold"><span class="dash-ic">' + SG.icon("activity", 14) + "</span>" +
            '<div class="dash-timeline__body"><div class="dash-timeline__title">' + ui.esc(L[a.action] || a.action) + "</div>" +
            '<div class="dash-timeline__meta">' + ui.esc(extra ? String(extra) + " · " : "") + ui.dateTime(a.created_at) + "</div></div></li>";
        }).join("") + "</ul>"
      : empty("Nenhuma ação administrativa registrada.");
  }

  /* ---- Notas internas (bloco reutilizável) -------------------------------- */
  function notesBlock(hostId, type, id) {
    var host = ui.$("#" + hostId);
    if (!host) return;
    host.innerHTML =
      '<div class="adm-note-new"><textarea class="sg-textarea" rows="2" id="' + hostId + 'Txt" placeholder="Anote algo para a equipe (o usuário não vê)…"></textarea>' +
      '<button class="sg-btn sg-btn--primary sg-btn--sm" id="' + hostId + 'Add">' + SG.icon("plus", 14) + "Adicionar nota</button></div>" +
      '<div id="' + hostId + 'List">' + ui.skeletonCard(1) + "</div>";
    function load() {
      A.notes.list(type, id).then(function (list) {
        ui.$("#" + hostId + "List").innerHTML = list.length
          ? '<div class="adm-notes">' + list.map(function (n) {
              return '<div class="adm-note"><div class="adm-note__head">' +
                '<b>' + ui.esc((n.author && n.author.full_name) || "Equipe") + "</b>" +
                '<span>' + ui.dateTime(n.created_at) + "</span>" +
                '<button class="adm-note__del" data-del="' + ui.esc(n.id) + '" title="Apagar nota">' + SG.icon("x", 13) + "</button></div>" +
                '<p class="sg-break">' + ui.esc(n.body) + "</p></div>";
            }).join("") + "</div>"
          : '<p class="sg-sm sg-dim" style="margin-top:12px">Nenhuma nota ainda.</p>';
      });
    }
    load();
    ui.$("#" + hostId + "Add").addEventListener("click", function () {
      var b = this, t = ui.$("#" + hostId + "Txt");
      ui.busy(b, true);
      A.notes.add(type, id, t.value).then(function () { t.value = ""; ui.busy(b, false); load(); })
        .catch(function (e) { ui.busy(b, false); fail(e); });
    });
    ui.on(host, "click", "[data-del]", function (e, b) {
      A.notes.remove(b.getAttribute("data-del")).then(load).catch(fail);
    });
  }

  /* ---- Notificação direta ----------------------------------------------------- */
  function openNotify(user) {
    var m = ui.modal({
      title: "Notificar " + (user.full_name || "usuário"),
      body:
        '<div class="sg-field"><label class="sg-field__label" for="ntTitle">Título</label>' +
          '<input class="sg-input" id="ntTitle" maxlength="80" placeholder="Ex.: Precisamos de uma informação"></div>' +
        '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="ntBody">Mensagem</label>' +
          '<textarea class="sg-textarea" id="ntBody" rows="4" maxlength="500"></textarea></div>' +
        '<p class="sg-xs sg-dim" style="margin-top:10px">Aparece no sino de notificações do app e fica registrada na auditoria.</p>',
      footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button><button class="sg-btn sg-btn--primary" data-ok>' +
        SG.icon("send", 15) + "Enviar</button>"
    });
    m.el.querySelector("[data-ok]").addEventListener("click", function () {
      var b = this, t = ui.$("#ntTitle", m.el).value.trim(), body = ui.$("#ntBody", m.el).value.trim();
      if (!t || !body) { ui.toast("Preencha título e mensagem", { type: "error" }); return; }
      ui.busy(b, true);
      A.notifyUser(user.id, t, body).then(function () { m.close(); ui.toast("Notificação enviada", { type: "success" }); })
        .catch(function (e) { ui.busy(b, false); fail(e); });
    });
  }

  /* ==========================================================================
     1. FICHA 360° DO USUÁRIO
     ========================================================================== */
  SG.views.adminUser360 = function (params) {
    var id = params.id;
    app.setHeader("Ficha do usuário", "Tudo sobre a conta em um só lugar");
    app.view('<div id="u360">' + ui.skeletonCard(3) + "</div>", { className: "app-view--wide" });
    var tab = "resumo", u = null;

    function load() {
      return A.userFull(id).then(function (data) {
        u = data;
        if (!u) { ui.$("#u360").innerHTML = ui.empty("🔍", "Usuário não encontrado", "", '<a class="sg-btn sg-btn--primary" href="#/admin/usuarios">Voltar</a>'); return; }
        render();
      }).catch(function (e) { ui.$("#u360").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });
    }

    function render() {
      var k = K(), pro = u.professional;
      var suspended = u.suspended_until && new Date(u.suspended_until) > new Date();
      var paid = (u.payments || []).filter(function (p) { return p.status === "paid" || p.status === "refunded"; });
      var gasto = sum(paid.filter(function (p) { return p.client_id === u.id && p.status === "paid"; }), function (p) { return p.amount; });
      var faturado = sum((u.transactions || []).filter(function (t) { return t.professional_id === u.id && t.status !== "refunded"; }), function (t) { return t.net_amount; });

      var kpis = u.role === "professional"
        ? k.metricCard("Serviços", ui.num((u.bookings || []).filter(function (b) { return b.professional_id === u.id; }).length), "como profissional", null, "briefcase", "violet") +
          k.metricCard("Recebeu (líquido)", money(faturado), ui.num((u.transactions || []).length) + " repasses", null, "wallet", "gold") +
          k.metricCard("Nota", ui.rating((pro && pro.rating) || 0) + '<small class="dash-kpi__unit">/5</small>', ui.num((u.reviewsReceived || []).length) + " avaliações", null, "star", "blue") +
          k.metricCard("Denúncias recebidas", ui.num((u.reportsAgainst || []).length), ui.num((u.disputes || []).length) + " disputa(s)", null, "flag", (u.reportsAgainst || []).length ? "red" : "green")
        : k.metricCard("Pedidos", ui.num((u.requests || []).length), ui.num((u.requests || []).filter(function (r) { return r.status === "completed"; }).length) + " concluídos", null, "layers", "blue") +
          k.metricCard("Total pago", money(gasto), ui.num(paid.length) + " pagamento(s)", null, "wallet", "gold") +
          k.metricCard("Avaliações feitas", ui.num((u.reviewsGiven || []).length), "sobre profissionais", null, "star", "violet") +
          k.metricCard("Denúncias recebidas", ui.num((u.reportsAgainst || []).length), ui.num((u.disputes || []).length) + " disputa(s)", null, "flag", (u.reportsAgainst || []).length ? "red" : "green");

      ui.$("#u360").innerHTML =
        back("#/admin/usuarios", "Usuários") +
        '<div class="adm-hero">' +
          '<div class="adm-hero__id">' + ui.avatar(u, "xl") +
            '<div style="min-width:0"><h1 class="adm-hero__name">' + ui.esc(u.full_name || "—") + "</h1>" +
            '<div class="sg-sm sg-dim">' + ui.esc(u.email || "") + (u.phone ? " · " + ui.esc(u.phone) : "") + "</div>" +
            '<div class="sg-row sg-row--wrap" style="gap:6px;margin-top:10px">' +
              '<span class="sg-badge">' + ui.esc(k.ROLE_LABEL[u.role] || u.role) +
                (u.role === "admin" && A.ROLES[u.admin_role || "owner"] ? " · " + A.ROLES[u.admin_role || "owner"].label : "") + "</span>" +
              k.accountBadge(u.status) + k.identityBadge(u.identity_status) +
              (pro ? k.verificationBadge(pro.verification_status) : "") +
              (pro && pro.featured ? '<span class="sg-badge sg-badge--brand">' + SG.icon("sparkle", 12) + "Destaque</span>" : "") +
              (suspended ? '<span class="sg-badge sg-badge--danger">Suspenso até ' + ui.date(u.suspended_until) + "</span>" : "") +
              (u.anonymized_at ? '<span class="sg-badge sg-badge--danger">Anonimizado</span>' : "") +
            "</div></div></div>" +
          '<div class="adm-hero__tools">' +
            '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="uNotify">' + SG.icon("bell", 14) + "Notificar</button>" +
            '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="uEdit">' + SG.icon("settings", 14) + "Editar dados</button>" +
            (u.role === "professional" ? '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/profissional/' + ui.esc(u.id) + '">' + SG.icon("eye", 14) + "Perfil público</a>" : "") +
          "</div>" +
        "</div>" +
        k.kpiRow(kpis) +
        tabs("uTabs", [
          ["resumo", "Resumo"], ["pedidos", "Pedidos", (u.requests || []).length], ["financeiro", "Financeiro", (u.payments || []).length + (u.transactions || []).length],
          ["conversas", "Conversas", (u.threads || []).length], ["avaliacoes", "Avaliações", (u.reviewsGiven || []).length + (u.reviewsReceived || []).length],
          ["seguranca", "Denúncias e disputas", (u.reportsAgainst || []).length + (u.reportsBy || []).length + (u.disputes || []).length],
          ["notas", "Notas internas"], ["historico", "Histórico"]
        ], tab) +
        '<div id="uTab"></div>';

      bindTabs("uTabs", function (t) { tab = t; paintTab(); });
      ui.$("#uNotify").addEventListener("click", function () { openNotify(u); });
      ui.$("#uEdit").addEventListener("click", openEdit);
      paintTab();
    }

    function paintTab() {
      var host = ui.$("#uTab"), k = K();
      if (tab === "resumo") {
        var pro = u.professional, v = u.verification, age = k.ageFrom(u.birth_date);
        host.innerHTML = '<div class="dash-grid dash-grid--main">' +
          '<div style="display:grid;gap:var(--sg-5);min-width:0">' +
            card("Dados cadastrais", "Informações da conta", '<div class="adm-kvs adm-kvs--2">' +
              k.kv("Nome", ui.esc(u.full_name || "—")) + k.kv("E-mail", ui.esc(u.email || "—")) +
              k.kv("Celular", ui.esc(u.phone || "—")) + k.kv("CPF", k.cpfCell(u.cpf)) +
              k.kv("Nascimento", u.birth_date ? ui.date(u.birth_date) + (age !== null ? " · " + age + " anos" : "") : "—") +
              k.kv("Cidade", ui.esc((u.city || "—") + (u.state ? " · " + u.state : ""))) +
              k.kv("Cadastro", ui.dateTime(u.created_at)) +
              k.kv("Último acesso", u.last_seen_at ? ui.timeAgo(u.last_seen_at) : "—") +
              k.kv("ID", '<code class="adm-code">' + ui.esc(u.id) + "</code>") +
            "</div>") +
            card("Identidade", "Documento com foto e selfie",
              v ? '<div class="sg-row sg-row--between sg-row--wrap" style="gap:12px"><div class="sg-sm">' + k.identityBadge(v.status) +
                    '<div class="sg-xs sg-dim" style="margin-top:6px">' + ui.esc(k.DOC_LABEL[v.doc_type] || v.doc_type || "") + " · enviado " + ui.timeAgo(v.created_at) + "</div>" +
                    (v.rejection_reason ? '<div class="sg-xs" style="color:var(--sg-danger);margin-top:4px">' + ui.esc(v.rejection_reason) + "</div>" : "") + "</div>" +
                  '<button class="sg-btn sg-btn--outline sg-btn--sm" id="uKyc">' + SG.icon("eye", 14) + (v.status === "pending" ? "Analisar agora" : "Ver documentos") + "</button></div>"
                : '<p class="sg-sm sg-dim">Nenhum documento enviado ainda.</p>') +
            (pro ? proCard(pro) : "") +
          "</div>" +
          '<div style="display:grid;gap:var(--sg-5);align-content:start;min-width:0">' + controlCard() +
            card("Notificações recentes", "O que esta conta recebeu", (u.notifications || []).length
              ? '<div class="adm-mini-list">' + u.notifications.slice(0, 6).map(function (n) {
                  return '<div><b>' + ui.esc(n.title) + '</b><span>' + ui.timeAgo(n.created_at) + (n.read_at ? " · lida" : " · não lida") + "</span></div>";
                }).join("") + "</div>"
              : '<p class="sg-sm sg-dim">Nenhuma notificação.</p>') +
          "</div></div>";
        bindResumo();
      } else if (tab === "pedidos") {
        host.innerHTML = card("Pedidos", "Como cliente e como profissional", (u.requests || []).length
          ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Serviço</th><th>Papel</th><th>Situação</th><th>Valor</th><th>Criado</th></tr></thead><tbody>' +
            u.requests.map(function (r) {
              return '<tr class="adm-clickable" onclick="location.hash=\'#/admin/solicitacoes/' + ui.esc(r.id) + '\'">' +
                '<td><div class="sg-row" style="min-width:0"><span class="sg-avatar sg-avatar--sm sg-avatar--cat">' + SG.catIcon(r.category, 16) + "</span>" +
                '<span class="sg-md sg-strong sg-truncate">' + ui.esc(r.title) + "</span></div></td>" +
                "<td>" + (r.client_id === u.id ? "Cliente" : "Profissional") + "</td>" +
                "<td>" + ui.statusBadge(r.status, ui.labels.requestStatus) + "</td>" +
                '<td class="sg-md">' + (r.price ? money(r.price) : "—") + "</td>" +
                '<td class="sg-md sg-dim">' + ui.timeAgo(r.created_at) + "</td></tr>";
            }).join("") + "</tbody></table></div>"
          : empty("Nenhum pedido."));
      } else if (tab === "financeiro") {
        var PS = K().PAY_STATUS;
        host.innerHTML = '<div style="display:grid;gap:var(--sg-5)">' +
          card("Pagamentos", "Cobranças feitas pelo app", (u.payments || []).length
            ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Data</th><th>Método</th><th>Valor</th><th>Situação</th><th>Pedido</th></tr></thead><tbody>' +
              u.payments.map(function (p) {
                return "<tr><td>" + ui.dateTime(p.created_at) + "</td><td>" + (p.method === "pix" ? "Pix" : "Cartão") + "</td>" +
                  '<td class="sg-strong">' + money(p.amount) + "</td><td>" + ui.esc(PS[p.status] || p.status) + "</td>" +
                  '<td><a class="dash-link" href="#/admin/solicitacoes/' + ui.esc(p.request_id) + '">Abrir</a></td></tr>';
              }).join("") + "</tbody></table></div>"
            : empty("Nenhum pagamento.")) +
          card("Repasses", "Transações geradas por serviços concluídos", (u.transactions || []).length
            ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Data</th><th>Valor</th><th>Comissão</th><th>Líquido</th><th>Situação</th></tr></thead><tbody>' +
              u.transactions.slice(0, 100).map(function (t) {
                return "<tr><td>" + ui.date(t.created_at) + "</td><td>" + money(t.amount) + '</td><td class="sg-dim">' + money(t.platform_fee) +
                  '</td><td class="sg-strong">' + money(t.net_amount) + "</td><td>" + K().txBadge(t.status) + "</td></tr>";
              }).join("") + "</tbody></table></div>" +
              (u.transactions.length > 100 ? '<p class="sg-xs sg-dim" style="margin-top:8px">Mostrando 100 de ' + ui.num(u.transactions.length) + ". Exporte em Relatórios para ver tudo.</p>" : "")
            : empty("Nenhum repasse.")) +
        "</div>";
      } else if (tab === "conversas") {
        host.innerHTML = card("Conversas", "Chats em que a conta participou (somente leitura)", (u.threads || []).length
          ? '<div class="dash-queue">' + u.threads.map(function (t) {
              return '<a class="dash-queue__item dash-tone--blue" href="#" data-thread="' + ui.esc(t.request_id) + '">' +
                '<span class="dash-ic">' + SG.icon("chat", 16) + "</span>" +
                '<div class="dash-queue__body"><div class="dash-queue__title">' + ui.esc(t.title) + "</div>" +
                '<div class="dash-queue__meta">' + ui.num(t.count) + " mensagens · " + ui.timeAgo(t.last.created_at) +
                  (t.masked ? " · " + t.masked + " contato(s) oculto(s)" : "") + "</div></div>" +
                '<span class="dash-queue__cta">Ler</span></a>';
            }).join("") + "</div>"
          : empty("Nenhuma conversa."));
        ui.on(host, "click", "[data-thread]", function (e, el) { e.preventDefault(); openThread(el.getAttribute("data-thread")); });
      } else if (tab === "avaliacoes") {
        var row = function (r, who) {
          return '<div class="review"><div class="sg-row sg-row--between sg-row--wrap" style="gap:8px">' +
            '<span class="sg-md"><b>' + ui.esc(who) + "</b></span>" +
            '<span class="sg-row" style="gap:8px">' + ui.stars(r.rating, 13) + '<span class="sg-xs sg-faint">' + ui.date(r.created_at) + "</span></span></div>" +
            (r.comment ? '<p class="sg-sm sg-muted" style="margin-top:8px">' + ui.esc(r.comment) + "</p>" : "") +
            (r.hidden ? '<div class="adm-hidden-note">' + SG.icon("eye", 13) + "Oculta no app</div>" : "") + "</div>";
        };
        host.innerHTML = '<div class="dash-grid dash-grid--half">' +
          card("Recebidas", "Avaliações de clientes", (u.reviewsReceived || []).length
            ? u.reviewsReceived.map(function (r) { return row(r, "De " + ((r.client && r.client.full_name) || "cliente")); }).join("") : empty("Nenhuma.")) +
          card("Feitas", "Avaliações que a conta escreveu", (u.reviewsGiven || []).length
            ? u.reviewsGiven.map(function (r) { return row(r, "Para " + ((r.professional && r.professional.full_name) || "profissional")); }).join("") : empty("Nenhuma.")) +
          '</div><p class="sg-xs sg-dim" style="margin-top:10px">Para ocultar uma avaliação, use <a class="dash-link" href="#/admin/avaliacoes">Moderação → Avaliações</a>.</p>';
      } else if (tab === "seguranca") {
        var RS = K().REPORT_STATUS;
        var rep = function (r) {
          return '<div class="adm-mini-list__row"><b>' + ui.esc(r.reason) + "</b><span>" + ui.esc(RS[r.status] || r.status) + " · " + ui.timeAgo(r.created_at) + "</span></div>";
        };
        host.innerHTML = '<div class="dash-grid dash-grid--3">' +
          card("Denúncias contra a conta", "", (u.reportsAgainst || []).length ? '<div class="adm-mini-list">' + u.reportsAgainst.map(rep).join("") + "</div>" : empty("Nenhuma.")) +
          card("Denúncias feitas", "", (u.reportsBy || []).length ? '<div class="adm-mini-list">' + u.reportsBy.map(rep).join("") + "</div>" : empty("Nenhuma.")) +
          card("Disputas", "", (u.disputes || []).length ? '<div class="dash-queue">' + u.disputes.map(function (d) {
            return '<a class="dash-queue__item dash-tone--red" href="#/admin/disputas/' + ui.esc(d.id) + '"><span class="dash-ic">' + SG.icon("alert", 15) + "</span>" +
              '<div class="dash-queue__body"><div class="dash-queue__title">' + ui.esc(d.reason) + '</div><div class="dash-queue__meta">' +
              ui.timeAgo(d.created_at) + " · " + money(d.amount) + '</div></div><span class="dash-queue__cta">Abrir</span></a>';
          }).join("") + "</div>" : empty("Nenhuma.")) +
          "</div>";
      } else if (tab === "notas") {
        host.innerHTML = card("Notas internas", "Visíveis só para a equipe", '<div id="uNotes"></div>');
        notesBlock("uNotes", "profile", u.id);
      } else {
        host.innerHTML = card("Histórico administrativo", "Tudo o que a equipe fez nesta conta", auditList(u.audit));
      }
    }

    function proCard(pro) {
      var cats = (pro.categories || []).map(function (c) { return c.id; });
      return card("Perfil profissional", "Vitrine, preço, raio e especialidades",
        '<div class="sg-grid sg-grid--2" style="gap:14px">' +
          field("pHeadline", "Chamada do perfil", pro.headline, "text") +
          field("pBase", "Preço base (R$)", pro.base_price, "number") +
          field("pRadius", "Raio de atendimento (km)", pro.service_radius_km, "number") +
          field("pExp", "Anos de experiência", pro.experience_years, "number") +
        "</div>" +
        '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="pBio">Sobre</label>' +
          '<textarea class="sg-textarea" id="pBio" rows="3">' + ui.esc(pro.bio || "") + "</textarea></div>" +
        '<div class="adm-toggles">' +
          toggle("pAvail", "Online para receber chamadas", pro.is_available) +
          toggle("pFeat", "Destaque (aparece primeiro nas chamadas)", pro.featured) +
        "</div>" +
        '<div class="sg-field" style="margin-top:14px"><span class="sg-field__label">Especialidades</span>' +
          '<div class="sg-row sg-row--wrap" style="gap:6px" id="pCats"><span class="sg-xs sg-dim">Carregando…</span></div></div>' +
        '<div class="sg-row sg-row--wrap" style="gap:8px;margin-top:18px;justify-content:space-between">' +
          '<div class="sg-row" style="gap:6px">' +
            (pro.verification_status !== "approved" ? '<button class="sg-btn sg-btn--outline sg-btn--sm" data-verify="approved">' + SG.icon("check", 14) + "Aprovar cadastro</button>" : "") +
            (pro.verification_status !== "rejected" ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-verify="rejected">' + SG.icon("x", 14) + "Rejeitar</button>" : "") +
          "</div>" +
          '<button class="sg-btn sg-btn--primary sg-btn--sm" id="pSave">' + SG.icon("check", 14) + "Salvar perfil profissional</button>" +
        "</div>" +
        '<input type="hidden" id="pCatsInit" value="' + ui.esc(cats.join(",")) + '">');
    }
    function field(id, label, val, type) {
      return '<div class="sg-field"><label class="sg-field__label" for="' + id + '">' + ui.esc(label) + "</label>" +
        '<input class="sg-input" id="' + id + '" type="' + type + '" value="' + ui.esc(val === null || val === undefined ? "" : val) + '"></div>';
    }
    function toggle(id, label, on) {
      return '<label class="adm-toggle"><button type="button" class="sg-switch ' + (on ? "is-on" : "") + '" id="' + id + '" role="switch" aria-checked="' + !!on + '">' +
        '<span class="sg-switch__track"><span class="sg-switch__thumb"></span></span></button><span>' + ui.esc(label) + "</span></label>";
    }

    function controlCard() {
      var blocked = u.status === "blocked";
      var suspended = u.suspended_until && new Date(u.suspended_until) > new Date();
      var self = app.state.me && app.state.me.id === u.id;
      return card("Controle da conta", "Acesso, papel e dados pessoais",
        (self ? '<p class="sg-sm sg-dim">Esta é a sua conta. Algumas ações ficam bloqueadas.</p>' : "") +
        '<div class="adm-ctrl">' +
          '<div class="adm-ctrl__row"><div><b>Acesso</b><span>' + (blocked ? "Bloqueado — não consegue entrar" : suspended ? "Suspenso até " + ui.dateTime(u.suspended_until) : "Ativo") + "</span></div>" +
            (self ? "" : '<button class="sg-btn ' + (blocked ? "sg-btn--outline" : "sg-btn--danger") + ' sg-btn--sm" id="uBlock">' + (blocked ? "Desbloquear" : "Bloquear") + "</button>") + "</div>" +
          '<div class="adm-ctrl__row"><div><b>Suspensão temporária</b><span>Não pede serviços nem manda mensagens até a data</span></div>' +
            (self ? "" : '<button class="sg-btn sg-btn--outline sg-btn--sm" id="uSuspend">' + (suspended ? "Remover" : "Suspender") + "</button>") + "</div>" +
          '<div class="adm-ctrl__row"><div><b>Papel na plataforma</b><span>' + (isOwner() ? "Cliente, profissional ou equipe" : "Só o dono da plataforma altera") + "</span></div>" +
            (isOwner() && !self ? '<button class="sg-btn sg-btn--outline sg-btn--sm" id="uRole">Alterar</button>' : "") + "</div>" +
          '<div class="adm-ctrl__row"><div><b>Exportar dados (LGPD)</b><span>Arquivo com tudo o que guardamos desta conta</span></div>' +
            '<button class="sg-btn sg-btn--outline sg-btn--sm" id="uExport">' + SG.icon("doc", 14) + "Baixar</button></div>" +
          '<div class="adm-ctrl__row adm-ctrl__row--danger"><div><b>Anonimizar conta</b><span>Apaga nome, contato e CPF. Não dá para desfazer.</span></div>' +
            (isOwner() && !self && !u.anonymized_at ? '<button class="sg-btn sg-btn--danger sg-btn--sm" id="uAnon">Anonimizar</button>' : "") + "</div>" +
        "</div>");
    }

    function bindResumo() {
      var k = K(), pro = u.professional;
      var kyc = ui.$("#uKyc");
      if (kyc) kyc.addEventListener("click", function () {
        var v = Object.assign({}, u.verification, { user: u });
        k.openVerificationReview(v, { onDecided: load });
      });
      ui.$$(".sg-switch[role=switch]").forEach(function (sw) {
        sw.addEventListener("click", function () {
          sw.classList.toggle("is-on");
          sw.setAttribute("aria-checked", sw.classList.contains("is-on"));
        });
      });
      if (pro) {
        api.categories.listAll().then(function (cats) {
          var sel = (ui.$("#pCatsInit").value || "").split(",").filter(Boolean);
          ui.$("#pCats").innerHTML = cats.map(function (c) {
            return '<button type="button" class="sg-chip' + (sel.indexOf(c.id) >= 0 ? " is-active" : "") + '" data-catid="' + ui.esc(c.id) + '">' +
              SG.catIcon(c, 14) + ui.esc(c.name) + "</button>";
          }).join("");
        });
        ui.on(ui.$("#pCats"), "click", "[data-catid]", function (e, b) { b.classList.toggle("is-active"); });
        ui.$("#pSave").addEventListener("click", function () {
          var b = this;
          var patch = {
            headline: ui.$("#pHeadline").value.trim() || null,
            bio: ui.$("#pBio").value.trim() || null,
            base_price: ui.$("#pBase").value === "" ? null : Number(ui.$("#pBase").value),
            service_radius_km: Number(ui.$("#pRadius").value || 10),
            experience_years: Number(ui.$("#pExp").value || 0),
            is_available: ui.$("#pAvail").classList.contains("is-on"),
            featured: ui.$("#pFeat").classList.contains("is-on")
          };
          var cats = ui.$$("#pCats [data-catid].is-active").map(function (x) { return x.getAttribute("data-catid"); });
          ui.busy(b, true);
          A.updateProfessional(u.id, patch).then(function () { return A.setProfessionalCategories(u.id, cats); })
            .then(function () { ui.toast("Perfil profissional salvo", { type: "success" }); return load(); })
            .catch(function (e) { ui.busy(b, false); fail(e); });
        });
        ui.$$("[data-verify]").forEach(function (b) {
          b.addEventListener("click", function () {
            var st = b.getAttribute("data-verify");
            ui.busy(b, true);
            api.admin.setVerification(u.id, st).then(function () {
              ui.toast(st === "approved" ? "Cadastro aprovado" : "Cadastro rejeitado", { type: st === "approved" ? "success" : "info" });
              return load();
            }).catch(function (e) { ui.busy(b, false); fail(e); });
          });
        });
      }
      var bl = ui.$("#uBlock");
      if (bl) bl.addEventListener("click", function () {
        var blocked = u.status === "blocked";
        ui.confirm({ title: blocked ? "Desbloquear conta?" : "Bloquear conta?", text: blocked ? u.full_name + " poderá entrar novamente." : u.full_name + " perde o acesso imediatamente.",
          okText: blocked ? "Desbloquear" : "Bloquear", danger: !blocked }).then(function (ok) {
          if (!ok) return;
          api.admin.setUserStatus(u.id, blocked ? "active" : "blocked").then(function () {
            ui.toast(blocked ? "Conta desbloqueada" : "Conta bloqueada", { type: "success" }); load();
          }).catch(fail);
        });
      });
      var sus = ui.$("#uSuspend");
      if (sus) sus.addEventListener("click", function () {
        var active = u.suspended_until && new Date(u.suspended_until) > new Date();
        if (active) {
          A.suspend(u.id, null).then(function () { ui.toast("Suspensão removida", { type: "success" }); load(); }).catch(fail);
          return;
        }
        var m = ui.modal({
          title: "Suspender " + (u.full_name || "conta"),
          body: '<div class="sg-seg-wrap"><div class="sg-seg" id="susDays">' + [1, 3, 7, 15, 30].map(function (d, i) {
              return '<button class="sg-chip' + (i === 2 ? " is-active" : "") + '" data-d="' + d + '">' + d + (d === 1 ? " dia" : " dias") + "</button>";
            }).join("") + "</div></div>" +
            '<div class="sg-field"><label class="sg-field__label" for="susReason">Motivo (a pessoa recebe por notificação)</label>' +
            '<input class="sg-input" id="susReason" placeholder="Ex.: tentativa de pagamento por fora do app"></div>',
          footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button><button class="sg-btn sg-btn--danger" data-ok>Suspender</button>'
        });
        ui.on(ui.$("#susDays", m.el), "click", "[data-d]", function (e, el) {
          ui.$$("#susDays [data-d]", m.el).forEach(function (x) { x.classList.toggle("is-active", x === el); });
        });
        m.el.querySelector("[data-ok]").addEventListener("click", function () {
          var reason = ui.$("#susReason", m.el).value.trim();
          if (!reason) { ui.toast("Informe o motivo", { type: "error" }); return; }
          var days = Number(ui.$("#susDays .is-active", m.el).getAttribute("data-d"));
          var until = new Date(Date.now() + days * 864e5).toISOString();
          A.suspend(u.id, until, reason).then(function () { m.close(); ui.toast("Conta suspensa por " + days + " dia(s)", { type: "success" }); load(); }).catch(fail);
        });
      });
      var role = ui.$("#uRole");
      if (role) role.addEventListener("click", function () { openRoleModal(u, load); });
      ui.$("#uExport").addEventListener("click", function () {
        var b = this;
        ui.busy(b, true);
        A.exportUser(u.id).then(function (data) {
          ui.busy(b, false);
          downloadJson("servego-dados-" + (u.full_name || "conta").toLowerCase().replace(/\s+/g, "-"), data);
          api.admin.log("user.exported", "profile", u.id);
        }).catch(function (e) { ui.busy(b, false); fail(e); });
      });
      var an = ui.$("#uAnon");
      if (an) an.addEventListener("click", function () {
        var m = ui.modal({
          title: "Anonimizar conta?",
          body: '<p class="sg-sm">Nome, e-mail, celular, cidade, CPF e data de nascimento de <b>' + ui.esc(u.full_name) + "</b> serão apagados e a conta será bloqueada. " +
            "Pedidos, pagamentos e avaliações continuam (sem identificar a pessoa). <b>Não dá para desfazer.</b></p>" +
            '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="anConfirm">Digite ANONIMIZAR para confirmar</label>' +
            '<input class="sg-input" id="anConfirm" autocomplete="off"></div>',
          footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button><button class="sg-btn sg-btn--danger" data-ok>Anonimizar</button>'
        });
        m.el.querySelector("[data-ok]").addEventListener("click", function () {
          if (ui.$("#anConfirm", m.el).value.trim().toUpperCase() !== "ANONIMIZAR") { ui.toast("Digite ANONIMIZAR para confirmar", { type: "error" }); return; }
          A.anonymize(u.id).then(function () { m.close(); ui.toast("Conta anonimizada", { type: "success" }); load(); }).catch(fail);
        });
      });
    }

    function openEdit() {
      var m = ui.modal({
        title: "Editar dados de " + (u.full_name || "usuário"),
        body: '<div class="sg-grid sg-grid--2" style="gap:14px">' +
          field("eName", "Nome completo", u.full_name, "text") + field("ePhone", "Celular", u.phone, "tel") +
          field("eCity", "Cidade", u.city, "text") + field("eState", "UF", u.state, "text") + "</div>" +
          '<p class="sg-xs sg-dim" style="margin-top:12px">E-mail e CPF não são editáveis por aqui: o e-mail é o login e o CPF é validado na verificação de identidade.</p>',
        footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button><button class="sg-btn sg-btn--primary" data-ok>Salvar</button>'
      });
      m.el.querySelector("[data-ok]").addEventListener("click", function () {
        var b = this;
        var patch = { full_name: ui.$("#eName", m.el).value.trim(), phone: ui.$("#ePhone", m.el).value.trim(),
          city: ui.$("#eCity", m.el).value.trim(), state: ui.$("#eState", m.el).value.trim().toUpperCase().slice(0, 2) };
        if (!patch.full_name) { ui.toast("Informe o nome", { type: "error" }); return; }
        ui.busy(b, true);
        A.updateProfile(u.id, patch).then(function () { m.close(); ui.toast("Dados atualizados", { type: "success" }); load(); })
          .catch(function (e) { ui.busy(b, false); fail(e); });
      });
    }

    load();
  };

  function openRoleModal(u, done) {
    var cur = u.role === "admin" ? "admin:" + (u.admin_role || "owner") : u.role;
    var opts = [["client", "Cliente"], ["professional", "Profissional"]].concat(Object.keys(A.ROLES).map(function (k) {
      return ["admin:" + k, "Equipe · " + A.ROLES[k].label];
    }));
    var m = ui.modal({
      title: "Papel de " + (u.full_name || "usuário"),
      body: '<div class="adm-roles">' + opts.map(function (o) {
          var desc = o[0].indexOf("admin:") === 0 ? A.ROLES[o[0].split(":")[1]].desc
            : o[0] === "client" ? "Pede serviços e paga pelo app." : "Recebe chamadas e presta serviços.";
          return '<label class="adm-role"><input type="radio" name="role" value="' + o[0] + '"' + (o[0] === cur ? " checked" : "") + ">" +
            "<span><b>" + ui.esc(o[1]) + "</b><small>" + ui.esc(desc) + "</small></span></label>";
        }).join("") + "</div>",
      footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button><button class="sg-btn sg-btn--primary" data-ok>Salvar papel</button>'
    });
    m.el.querySelector("[data-ok]").addEventListener("click", function () {
      var v = (m.el.querySelector("input[name=role]:checked") || {}).value;
      if (!v || v === cur) { m.close(); return; }
      var parts = v.split(":");
      A.setRole(u.id, parts[0], parts[1] || null).then(function () {
        m.close(); ui.toast("Papel atualizado", { type: "success" }); if (done) done();
      }).catch(fail);
    });
  }

  function downloadJson(name, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---- Leitura de uma conversa (somente leitura) ------------------------------ */
  function openThread(requestId) {
    var m = ui.modal({ title: "Conversa", size: "lg", body: '<div id="thBody">' + ui.skeletonCard(2) + "</div>",
      footer: '<button class="sg-btn sg-btn--ghost" data-close>Fechar</button><a class="sg-btn sg-btn--secondary" href="#/admin/solicitacoes/' +
        ui.esc(requestId) + '" data-close>' + SG.icon("layers", 14) + "Abrir pedido</a>" });
    A.requestFull(requestId).then(function (r) {
      var msgs = (r && r.messages) || [];
      ui.$("#thBody", m.el).innerHTML =
        '<div class="sg-xs sg-dim" style="margin-bottom:12px">' + ui.esc((r && r.title) || "") + " · " + ui.num(msgs.length) +
          " mensagens · telefones, e-mails e links são ocultados automaticamente</div>" +
        (msgs.length ? '<div class="adm-thread">' + msgs.map(function (x) {
          var isClient = r && x.sender_id === r.client_id;
          var flagged = /\[(contato|link) oculto\]/.test(x.content || "");
          return '<div class="adm-msg' + (isClient ? "" : " adm-msg--pro") + (flagged ? " adm-msg--flag" : "") + '">' +
            '<div class="adm-msg__who">' + ui.esc((x.sender && x.sender.full_name) || "—") + " · " + ui.dateTime(x.created_at) + "</div>" +
            (x.image_url ? '<img class="adm-msg__img" src="' + ui.esc(x.image_url) + '" alt="Imagem enviada">' : "") +
            (x.content ? '<div class="adm-msg__txt">' + ui.esc(x.content) + "</div>" : "") +
            (flagged ? '<div class="adm-msg__flag">' + SG.icon("shield", 12) + "Tentativa de contato fora do app bloqueada</div>" : "") +
          "</div>";
        }).join("") + "</div>" : empty("Nenhuma mensagem."));
    }).catch(fail);
  }
  SG.adminOpenThread = openThread;

  /* ==========================================================================
     2. CENTRAL DO PEDIDO (360°)
     ========================================================================== */
  var OFFER_LABEL = { pending: "Aguardando resposta", accepted: "Aceitou", declined: "Recusou", expired: "Não respondeu", cancelled: "Cancelada" };

  SG.views.adminRequest360 = function (params) {
    var id = params.id;
    app.setHeader("Central do pedido", "Linha do tempo e controle do serviço");
    app.view('<div id="r360">' + ui.skeletonCard(3) + "</div>", { className: "app-view--wide" });
    var r = null;

    function load() {
      return A.requestFull(id).then(function (data) {
        r = data;
        if (!r) { ui.$("#r360").innerHTML = ui.empty("🔍", "Pedido não encontrado", ""); return; }
        render();
      }).catch(function (e) { ui.$("#r360").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });
    }

    function timeline() {
      var ev = [];
      var push = function (at, icon, tone, title, meta) { if (at) ev.push({ at: at, icon: icon, tone: tone, title: title, meta: meta || "" }); };
      push(r.created_at, "plus", "blue", "Pedido criado", (r.client && r.client.full_name) || "");
      (r.offers || []).forEach(function (o) {
        var who = (o.professional && o.professional.full_name) || "profissional";
        push(o.created_at, "zap", "gold", "Chamada enviada a " + who, (o.distance_km ? Number(o.distance_km).toFixed(1).replace(".", ",") + " km · " : "") + (o.price ? money(o.price) : ""));
        if (o.responded_at && o.status !== "pending") {
          push(o.responded_at, o.status === "accepted" ? "check" : "x", o.status === "accepted" ? "green" : "red", who + ": " + (OFFER_LABEL[o.status] || o.status));
        }
      });
      (r.payments || []).forEach(function (p) {
        push(p.created_at, "wallet", "blue", "Cobrança gerada (" + (p.method === "pix" ? "Pix" : "cartão") + ")", money(p.amount));
        push(p.paid_at, "checkCircle", "green", "Pagamento confirmado", money(p.amount) + " retido");
        push(p.refunded_at, "refresh", "red", "Pagamento estornado", money(p.refund_amount || p.amount));
      });
      (r.events || []).forEach(function (e) {
        push(e.created_at, "activity", "violet", ui.labels.bookingStatus[e.status] || e.status, e.note || "");
      });
      if (r.review) push(r.review.created_at, "star", "gold", "Avaliação: " + r.review.rating + " estrela(s)", r.review.comment || "");
      if (r.dispute) push(r.dispute.created_at, "alert", "red", "Disputa aberta", r.dispute.reason);
      ev.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
      return ev.length ? '<ul class="dash-timeline">' + ev.map(function (e) {
        return '<li class="dash-tone--' + e.tone + '"><span class="dash-ic">' + SG.icon(e.icon, 14) + "</span>" +
          '<div class="dash-timeline__body"><div class="dash-timeline__title">' + ui.esc(e.title) + "</div>" +
          '<div class="dash-timeline__meta">' + ui.esc(e.meta ? e.meta + " · " : "") + ui.dateTime(e.at) + "</div></div></li>";
      }).join("") + "</ul>" : empty("Sem eventos.");
    }

    function render() {
      var k = K(), b = r.booking, pay = r.payment || (r.payments || [])[0];
      var open = ["open", "matching", "no_professional"].indexOf(r.status) >= 0;
      var cancellable = ["completed", "cancelled"].indexOf(r.status) < 0;
      var photos = (r.photos || []).filter(function (p) { return p && p.url; });
      var masked = (r.messages || []).filter(function (x) { return /\[(contato|link) oculto\]/.test(x.content || ""); }).length;

      ui.$("#r360").innerHTML =
        back("#/admin/solicitacoes", "Solicitações") +
        '<div class="adm-hero">' +
          '<div class="adm-hero__id"><span class="sg-avatar sg-avatar--xl sg-avatar--cat">' + SG.catIcon(r.category, 40) + "</span>" +
            '<div style="min-width:0"><h1 class="adm-hero__name">' + ui.esc(r.title) + "</h1>" +
            '<div class="sg-sm sg-dim">' + ui.esc((r.category && r.category.name) || "") + " · " + ui.esc(r.address || "") + "</div>" +
            '<div class="sg-row sg-row--wrap" style="gap:6px;margin-top:10px">' + ui.statusBadge(r.status, ui.labels.requestStatus) +
              (b ? ui.statusBadge(b.status) : "") +
              '<span class="sg-badge">' + ui.esc(ui.labels.urgency[r.urgency] || r.urgency || "") + "</span>" +
              (r.dispute ? '<a class="sg-badge sg-badge--danger" href="#/admin/disputas/' + ui.esc(r.dispute.id) + '">Ver disputa ' + SG.icon("arrowRight", 11) + "</a>" : "") +
            "</div></div></div>" +
          '<div class="adm-hero__tools">' +
            (open ? '<button class="sg-btn sg-btn--primary sg-btn--sm" id="rRedispatch">' + SG.icon("zap", 14) + "Relançar chamada</button>" : "") +
            (b && cancellable ? '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="rStatus">' + SG.icon("activity", 14) + "Alterar situação</button>" : "") +
            (cancellable ? '<button class="sg-btn sg-btn--danger sg-btn--sm" id="rCancel">' + SG.icon("ban", 14) + "Cancelar pedido</button>" : "") +
          "</div>" +
        "</div>" +
        k.kpiRow(
          k.metricCard("Valor", r.price ? money(r.price) : "—", r.price ? "preço fechado" : "ainda sem preço", null, "tag", "gold") +
          k.metricCard("Pagamento", pay ? (k.PAY_STATUS[pay.status] || pay.status) : "—", pay ? (pay.method === "pix" ? "Pix" : "Cartão") + " · " + money(pay.amount) : "ainda não cobrado", null, "wallet", pay && pay.status === "paid" ? "green" : "blue") +
          k.metricCard("Chamadas", ui.num((r.offers || []).length), (r.offers || []).filter(function (o) { return o.status === "declined" || o.status === "expired"; }).length + " recusada(s) ou sem resposta", null, "zap", "violet") +
          k.metricCard("Mensagens", ui.num((r.messages || []).length), masked ? masked + " contato(s) oculto(s)" : "nenhum contato oculto", null, "chat", masked ? "red" : "blue")) +
        '<div class="dash-grid dash-grid--main">' +
          '<div style="display:grid;gap:var(--sg-5);min-width:0">' +
            card("Linha do tempo", "Tudo o que aconteceu, em ordem", timeline()) +
            card("Detalhes", "O que o cliente pediu",
              (r.description ? '<p class="sg-md sg-muted sg-break">' + ui.esc(r.description) + "</p>" : '<p class="sg-sm sg-dim">Sem descrição.</p>') +
              (photos.length ? '<div class="sg-thumbs" style="margin-top:14px">' + photos.map(function (p, i) {
                return '<button class="sg-thumb" data-photo="' + i + '"><img src="' + ui.esc(p.url) + '" alt="Foto ' + (i + 1) + '"></button>';
              }).join("") + "</div>" : "") +
              '<div class="adm-kvs adm-kvs--2" style="margin-top:16px">' +
                k.kv("Endereço", ui.esc(r.address || "—")) + k.kv("Complemento", ui.esc(r.address_complement || r.complement || "—")) +
                k.kv("Quando", ui.esc(ui.labels.urgency[r.urgency] || "—") + (r.scheduled_for ? " · " + ui.dateTime(r.scheduled_for) : "")) +
                k.kv("Criado", ui.dateTime(r.created_at)) + k.kv("ID", '<code class="adm-code">' + ui.esc(r.id) + "</code>") +
              "</div>") +
            card("Chamadas enviadas", "Quem foi chamado, em que ordem e o que respondeu", (r.offers || []).length
              ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>#</th><th>Profissional</th><th>Distância</th><th>Preço</th><th>Resposta</th><th>Em</th></tr></thead><tbody>' +
                r.offers.map(function (o) {
                  var secs = o.responded_at ? Math.round((new Date(o.responded_at) - new Date(o.created_at)) / 1000) : null;
                  return "<tr><td>" + (o.rank || "") + "</td><td>" + ui.esc((o.professional && o.professional.full_name) || "—") + "</td>" +
                    "<td>" + (o.distance_km ? Number(o.distance_km).toFixed(1).replace(".", ",") + " km" : "—") + "</td><td>" + (o.price ? money(o.price) : "—") + "</td>" +
                    "<td>" + ui.esc(OFFER_LABEL[o.status] || o.status) + "</td><td>" + (secs !== null ? secs + " s" : "—") + "</td></tr>";
                }).join("") + "</tbody></table></div>"
              : empty("Nenhuma chamada enviada.")) +
            card("Conversa", "Somente leitura", (r.messages || []).length
              ? '<button class="sg-btn sg-btn--outline sg-btn--sm" id="rThread">' + SG.icon("chat", 14) + "Ler as " + ui.num(r.messages.length) + " mensagens</button>"
              : '<p class="sg-sm sg-dim">Nenhuma mensagem trocada.</p>') +
          "</div>" +
          '<div style="display:grid;gap:var(--sg-5);align-content:start;min-width:0">' +
            card("Pessoas", "", '<div style="display:grid;gap:8px">' + person(r.client, "Cliente") + person(r.pro || r.professional, "Profissional") + "</div>" +
              '<div class="sg-row" style="gap:6px;margin-top:12px;flex-wrap:wrap">' +
                '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-notify="client">' + SG.icon("bell", 13) + "Notificar cliente</button>" +
                (r.professional_id ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-notify="pro">' + SG.icon("bell", 13) + "Notificar profissional</button>" : "") +
              "</div>") +
            card("Dinheiro", "Pagamento do cliente e repasse",
              '<div class="adm-kvs">' +
                k.kv("Cobrado", pay ? money(pay.amount) + " · " + ui.esc(k.PAY_STATUS[pay.status] || pay.status) : "—") +
                k.kv("Comissão", r.transaction ? money(r.transaction.platform_fee) : "—") +
                k.kv("Repasse", r.transaction ? money(r.transaction.net_amount) + " · " + ui.esc(k.TX_STATUS[r.transaction.status] || r.transaction.status) : "—") +
              "</div>" +
              '<a class="dash-link" href="#/admin/financeiro" style="margin-top:12px">Liberar ou estornar no Financeiro ' + SG.icon("arrowRight", 13) + "</a>") +
            (r.review ? card("Avaliação", "", ui.stars(r.review.rating, 16) + (r.review.comment ? '<p class="sg-sm sg-muted" style="margin-top:8px">' + ui.esc(r.review.comment) + "</p>" : "") +
              (r.review.hidden ? '<div class="adm-hidden-note">' + SG.icon("eye", 13) + "Oculta no app</div>" : "")) : "") +
            card("Notas internas", "Visíveis só para a equipe", '<div id="rNotes"></div>') +
            card("Ações da equipe", "", auditList(r.audit)) +
          "</div>" +
        "</div>";

      ui.$$("[data-photo]").forEach(function (bt) {
        bt.addEventListener("click", function () { k.openImage(photos[Number(bt.getAttribute("data-photo"))].url, "Foto do pedido"); });
      });
      var th = ui.$("#rThread");
      if (th) th.addEventListener("click", function () { openThread(r.id); });
      ui.$$("[data-notify]").forEach(function (bt) {
        bt.addEventListener("click", function () {
          var who = bt.getAttribute("data-notify") === "client" ? r.client : (r.pro || r.professional);
          if (who) openNotify(who);
        });
      });
      notesBlock("rNotes", "request", r.id);

      var rd = ui.$("#rRedispatch");
      if (rd) rd.addEventListener("click", function () {
        ui.busy(rd, true);
        A.redispatch(r.id).then(function (o) {
          ui.toast(o ? "Chamada relançada" : "Nenhum profissional disponível agora", {
            type: o ? "success" : "info", text: o ? "Enviada a " + ((o.professional && o.professional.full_name) || "o próximo da fila") : "O pedido ficou como sem profissional."
          });
          load();
        }).catch(function (e) { ui.busy(rd, false); fail(e); });
      });
      var cn = ui.$("#rCancel");
      if (cn) cn.addEventListener("click", function () {
        var paid = pay && pay.status === "paid";
        var m = ui.modal({
          title: "Cancelar este pedido?",
          body: '<p class="sg-sm">O cliente e o profissional são avisados por notificação.</p>' +
            (paid ? '<label class="adm-check"><input type="checkbox" id="cnRefund" checked> Estornar ' + money(pay.amount) + " ao cliente</label>" : "") +
            '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="cnReason">Motivo</label>' +
            '<input class="sg-input" id="cnReason" placeholder="Ex.: profissional não compareceu"></div>',
          footer: '<button class="sg-btn sg-btn--ghost" data-close>Voltar</button><button class="sg-btn sg-btn--danger" data-ok>Cancelar pedido</button>'
        });
        m.el.querySelector("[data-ok]").addEventListener("click", function () {
          var reason = ui.$("#cnReason", m.el).value.trim();
          if (!reason) { ui.toast("Informe o motivo", { type: "error" }); return; }
          var refund = paid && ui.$("#cnRefund", m.el).checked;
          var bt = this;
          ui.busy(bt, true);
          A.cancelRequest(r.id, reason, refund).then(function () {
            m.close(); ui.toast("Pedido cancelado", { type: "success", text: refund ? "Estorno solicitado." : "" }); load();
          }).catch(function (e) { ui.busy(bt, false); fail(e); });
        });
      });
      var st = ui.$("#rStatus");
      if (st) st.addEventListener("click", function () {
        var steps = ["accepted", "on_the_way", "arrived", "in_progress", "awaiting_confirmation", "completed"];
        var m = ui.modal({
          title: "Alterar a situação do serviço",
          body: '<p class="sg-sm sg-dim">Use para destravar casos parados. Marcar como <b>concluído</b> gera o repasse ao profissional.</p>' +
            '<div class="adm-roles" style="margin-top:12px">' + steps.map(function (s) {
              return '<label class="adm-role"><input type="radio" name="bst" value="' + s + '"' + (b.status === s ? " checked" : "") + "><span><b>" +
                ui.esc(ui.labels.bookingStatus[s] || s) + "</b></span></label>";
            }).join("") + "</div>" +
            '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="bstReason">Motivo</label><input class="sg-input" id="bstReason"></div>',
          footer: '<button class="sg-btn sg-btn--ghost" data-close>Voltar</button><button class="sg-btn sg-btn--primary" data-ok>Salvar</button>'
        });
        m.el.querySelector("[data-ok]").addEventListener("click", function () {
          var v = (m.el.querySelector("input[name=bst]:checked") || {}).value;
          var reason = ui.$("#bstReason", m.el).value.trim();
          if (!v || v === b.status) { m.close(); return; }
          if (!reason) { ui.toast("Informe o motivo", { type: "error" }); return; }
          A.setBookingStatus(b.id, v, reason).then(function () { m.close(); ui.toast("Situação atualizada", { type: "success" }); load(); }).catch(fail);
        });
      });
    }

    load();
  };

  /* ==========================================================================
     3. CONVERSAS
     ========================================================================== */
  SG.views.adminConversations = function () {
    var k = K();
    app.setHeader("Conversas", "Chats entre clientes e profissionais");
    app.view(
      '<div class="app-page-head"><h1>Conversas</h1>' +
        "<p>Leia qualquer chat do app (somente leitura) e veja onde houve tentativa de combinar pagamento ou contato por fora.</p></div>" +
      '<div id="cvStats">' + k.kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      k.toolbar(k.searchBox("cvSearch", "Buscar por serviço, cliente ou profissional…"), k.exportBtn("cvCsv")) +
      k.chipRow("cvFilters", [["all", "Todas"], ["masked", "Com contato oculto"], ["images", "Com fotos"], ["disputed", "Em disputa"]], "all") +
      '<div id="cvList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" });

    var all = [], filter = "all", query = "";
    function passes(t, f) {
      if (f === "masked" && !t.masked) return false;
      if (f === "images" && !t.images) return false;
      if (f === "disputed" && !t.disputed) return false;
      if (!query) return true;
      return [(t.request && t.request.title), (t.client && t.client.full_name), (t.professional && t.professional.full_name)].join(" ").toLowerCase().indexOf(query) >= 0;
    }
    function paint() {
      k.chipCounts("cvFilters", function (v) { return all.filter(function (t) { return passes(t, v); }).length; });
      var list = all.filter(function (t) { return passes(t, filter); });
      ui.$("#cvList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Serviço</th><th>Cliente</th><th>Profissional</th><th>Mensagens</th><th>Alertas</th><th>Última</th></tr></thead><tbody>' +
          list.map(function (t) {
            return '<tr class="adm-clickable" data-th="' + ui.esc(t.request_id) + '">' +
              '<td><div class="sg-row" style="min-width:0"><span class="sg-avatar sg-avatar--sm sg-avatar--cat">' + SG.catIcon(t.category, 16) + "</span>" +
                '<div style="min-width:0"><div class="sg-md sg-strong sg-truncate">' + ui.esc((t.request && t.request.title) || "Conversa") + "</div>" +
                '<div class="sg-xs sg-dim sg-truncate">' + ui.esc((t.last && t.last.content) || (t.last && t.last.image_url ? "📷 Foto" : "")) + "</div></div></div></td>" +
              '<td class="sg-md">' + ui.esc((t.client && t.client.full_name) || "—") + "</td>" +
              '<td class="sg-md">' + ui.esc((t.professional && t.professional.full_name) || "—") + "</td>" +
              '<td class="sg-md">' + ui.num(t.count) + "</td>" +
              "<td>" + (t.masked ? '<span class="sg-badge sg-badge--danger">' + t.masked + " contato(s)</span> " : "") +
                (t.disputed ? '<span class="sg-badge sg-badge--brand">Disputa</span>' : "") + (!t.masked && !t.disputed ? '<span class="sg-xs sg-faint">—</span>' : "") + "</td>" +
              '<td class="sg-md sg-dim">' + ui.timeAgo(t.last.created_at) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : ui.empty("💬", "Nenhuma conversa neste filtro", "Troque o filtro ou a busca.");
    }
    A.conversations().then(function (list) {
      all = list;
      var msgs = sum(all, function (t) { return t.count; });
      var masked = sum(all, function (t) { return t.masked; });
      ui.$("#cvStats").innerHTML = k.kpiRow(
        k.metricCard("Conversas", ui.num(all.length), "uma por pedido", null, "chat", "blue") +
        k.metricCard("Mensagens", ui.num(msgs), all.length ? "média de " + Math.round(msgs / all.length) + " por conversa" : "", null, "send", "violet") +
        k.metricCard("Contatos bloqueados", ui.num(masked), "telefones, e-mails e links ocultados", null, "shield", masked ? "red" : "green") +
        k.metricCard("Em disputa", ui.num(all.filter(function (t) { return t.disputed; }).length), "conversas com disputa aberta", "#/admin/disputas", "alert", "gold"));
      paint();
    }).catch(function (e) { ui.$("#cvList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });
    k.bindChips("cvFilters", function (v) { filter = v; paint(); });
    k.bindSearch("cvSearch", function (q) { query = q; paint(); });
    ui.on(ui.$("#cvList"), "click", "[data-th]", function (e, tr) { openThread(tr.getAttribute("data-th")); });
    ui.$("#cvCsv").addEventListener("click", function () {
      k.downloadCsv("servego-conversas", [
        ["Serviço", function (t) { return t.request && t.request.title; }],
        ["Cliente", function (t) { return t.client && t.client.full_name; }],
        ["Profissional", function (t) { return t.professional && t.professional.full_name; }],
        ["Mensagens", function (t) { return t.count; }],
        ["Contatos ocultos", function (t) { return t.masked; }],
        ["Última mensagem", function (t) { return ui.dateTime(t.last.created_at); }]
      ], all.filter(function (t) { return passes(t, filter); }));
    });
  };

  /* ==========================================================================
     4. MONITOR DE CHAMADAS (despacho)
     ========================================================================== */
  SG.views.adminDispatch = function () {
    var k = K();
    app.setHeader("Chamadas", "Despacho por proximidade em tempo real");
    app.view(
      '<div class="app-page-head"><h1>Chamadas</h1>' +
        "<p>Acompanhe cada chamada enviada aos profissionais, quem aceita e quem deixa passar, e destrave pedidos parados.</p></div>" +
      '<div id="dpStats">' + k.kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      '<div class="dash-grid dash-grid--main">' +
        '<div id="dpWaiting"></div><div id="dpRank"></div>' +
      "</div>" +
      k.chipRow("dpFilters", [["all", "Todas"], ["pending", "Aguardando"], ["accepted", "Aceitas"], ["declined", "Recusadas"], ["expired", "Sem resposta"]], "all") +
      '<div id="dpList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" });

    var offers = [], reqs = [], filter = "all";
    function load() {
      return Promise.all([A.dispatchOffers(), api.requests.listAll()]).then(function (r) {
        offers = r[0]; reqs = r[1]; paintAll();
      }).catch(function (e) { ui.$("#dpList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });
    }
    function paintAll() {
      var answered = offers.filter(function (o) { return o.status !== "pending" && o.status !== "cancelled"; });
      var acc = offers.filter(function (o) { return o.status === "accepted"; });
      var times = answered.filter(function (o) { return o.responded_at; }).map(function (o) { return (new Date(o.responded_at) - new Date(o.created_at)) / 1000; });
      var avg = times.length ? Math.round(times.reduce(function (s, x) { return s + x; }, 0) / times.length) : null;
      var waiting = reqs.filter(function (r) { return ["open", "matching", "no_professional"].indexOf(r.status) >= 0; });
      ui.$("#dpStats").innerHTML = k.kpiRow(
        k.metricCard("Chamadas enviadas", ui.num(offers.length), ui.num(offers.filter(function (o) { return o.status === "pending"; }).length) + " aguardando agora", null, "zap", "blue") +
        k.metricCard("Taxa de aceite", (answered.length ? Math.round(acc.length / answered.length * 100) : 0) + "%", ui.num(acc.length) + " aceitas de " + ui.num(answered.length), null, "checkCircle", "green") +
        k.metricCard("Tempo de resposta", avg === null ? "—" : avg + " s", "média até aceitar ou recusar", null, "clock", "gold") +
        k.metricCard("Pedidos esperando", ui.num(waiting.length), ui.num(waiting.filter(function (r) { return r.status === "no_professional"; }).length) + " sem profissional", null, "alert", waiting.length ? "red" : "green"));

      ui.$("#dpWaiting").innerHTML = card("Pedidos procurando profissional", "Relance a chamada para destravar",
        waiting.length ? '<div class="dash-queue">' + waiting.map(function (r) {
          return '<div class="dash-queue__item dash-tone--' + (r.status === "no_professional" ? "red" : "gold") + '">' +
            '<span class="dash-ic">' + SG.catIcon(r.category, 16) + "</span>" +
            '<div class="dash-queue__body"><a class="dash-queue__title" href="#/admin/solicitacoes/' + ui.esc(r.id) + '" style="color:inherit">' + ui.esc(r.title) + "</a>" +
            '<div class="dash-queue__meta">' + ui.esc(ui.labels.requestStatus[r.status] || r.status) + " · " + ui.timeAgo(r.created_at) + "</div></div>" +
            '<button class="sg-btn sg-btn--outline sg-btn--sm" data-redo="' + ui.esc(r.id) + '">' + SG.icon("zap", 13) + "Relançar</button></div>";
        }).join("") + "</div>" : empty("Nenhum pedido parado."));

      var by = {};
      offers.forEach(function (o) {
        var p = by[o.professional_id] || (by[o.professional_id] = { name: (o.professional && o.professional.full_name) || "—", n: 0, acc: 0 });
        p.n++; if (o.status === "accepted") p.acc++;
      });
      var rank = Object.keys(by).map(function (k2) { return by[k2]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
      ui.$("#dpRank").innerHTML = card("Quem mais recebe chamadas", "e quantas aceita",
        rank.length ? D().barList(rank.map(function (p) {
          return { label: p.name, value: p.n, display: p.acc + "/" + p.n + " aceitas" };
        })) : empty("Nenhuma chamada ainda."));
      paintList();
    }
    function paintList() {
      k.chipCounts("dpFilters", function (v) { return offers.filter(function (o) { return v === "all" || o.status === v; }).length; });
      var list = offers.filter(function (o) { return filter === "all" || o.status === filter; });
      ui.$("#dpList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Pedido</th><th>Profissional</th><th>Distância</th><th>Preço</th><th>Resposta</th><th>Tempo</th><th>Enviada</th></tr></thead><tbody>' +
          list.slice(0, 200).map(function (o) {
            var secs = o.responded_at ? Math.round((new Date(o.responded_at) - new Date(o.created_at)) / 1000) : null;
            var tone = { accepted: "success", declined: "danger", expired: "danger", pending: "brand" }[o.status] || "";
            return '<tr class="adm-clickable" onclick="location.hash=\'#/admin/solicitacoes/' + ui.esc(o.request_id) + '\'">' +
              '<td><div class="sg-row" style="min-width:0"><span class="sg-avatar sg-avatar--sm sg-avatar--cat">' + SG.catIcon(o.request && o.request.category, 16) + "</span>" +
              '<span class="sg-md sg-strong sg-truncate">' + ui.esc((o.request && o.request.title) || "—") + "</span></div></td>" +
              '<td class="sg-md">' + ui.esc((o.professional && o.professional.full_name) || "—") + "</td>" +
              '<td class="sg-md">' + (o.distance_km ? Number(o.distance_km).toFixed(1).replace(".", ",") + " km" : "—") + "</td>" +
              '<td class="sg-md">' + (o.price ? money(o.price) : "—") + "</td>" +
              '<td><span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' + ui.esc(OFFER_LABEL[o.status] || o.status) + "</span></td>" +
              '<td class="sg-md">' + (secs !== null ? secs + " s" : "—") + "</td>" +
              '<td class="sg-md sg-dim">' + ui.timeAgo(o.created_at) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : ui.empty("📡", "Nenhuma chamada neste filtro", "As chamadas aparecem quando um cliente pede um serviço.");
    }
    load();
    k.bindChips("dpFilters", function (v) { filter = v; paintList(); });
    ui.on(ui.$("#dpWaiting"), "click", "[data-redo]", function (e, b) {
      ui.busy(b, true);
      A.redispatch(b.getAttribute("data-redo")).then(function (o) {
        ui.toast(o ? "Chamada relançada" : "Nenhum profissional disponível agora", { type: o ? "success" : "info" });
        load();
      }).catch(function (err) { ui.busy(b, false); fail(err); });
    });
  };

  /* ==========================================================================
     5. EQUIPE E PERMISSÕES
     ========================================================================== */
  SG.views.adminTeam = function () {
    var k = K();
    app.setHeader("Equipe", "Quem administra o ServeGo e o que cada um acessa");
    app.view(
      '<div class="app-page-head"><h1>Equipe e permissões</h1>' +
        "<p>Dê acesso ao painel para outras pessoas com um papel definido. Só o dono da plataforma altera a equipe.</p></div>" +
      '<div id="tmStats"></div>' +
      '<div class="dash-grid dash-grid--main"><div id="tmList">' + ui.skeletonCard(2) + '</div><div id="tmAdd"></div></div>' +
      '<div id="tmMatrix"></div>',
      { className: "app-view--wide" });

    function load() {
      A.team().then(function (list) {
        var count = function (r) { return list.filter(function (p) { return (p.admin_role || "owner") === r; }).length; };
        ui.$("#tmStats").innerHTML = k.kpiRow(
          k.metricCard("Pessoas na equipe", ui.num(list.length), "com acesso ao painel", null, "users", "blue") +
          k.metricCard("Donos", ui.num(count("owner")), "acesso total", null, "shield", "gold") +
          k.metricCard("Moderação e suporte", ui.num(count("moderation") + count("support")), "atendem usuários", null, "chat", "violet") +
          k.metricCard("Financeiro e operação", ui.num(count("finance") + count("ops")), "dinheiro e chamadas", null, "wallet", "green"));
        ui.$("#tmList").innerHTML = card("Membros", "Clique no nome para abrir a ficha",
          '<div class="adm-team">' + list.map(function (p) {
            var r = p.admin_role || "owner";
            var self = app.state.me && app.state.me.id === p.id;
            return '<div class="adm-team__row">' + person(p, (A.ROLES[r] || {}).label + (self ? " · você" : "")) +
              (isOwner() && !self
                ? '<div class="sg-row" style="gap:6px"><select class="sg-select sg-select--sm" data-role="' + ui.esc(p.id) + '">' +
                    Object.keys(A.ROLES).map(function (x) { return '<option value="' + x + '"' + (x === r ? " selected" : "") + ">" + A.ROLES[x].label + "</option>"; }).join("") +
                  '</select><button class="sg-btn sg-btn--ghost sg-btn--sm" data-remove="' + ui.esc(p.id) + '" title="Remover da equipe">' + SG.icon("x", 14) + "</button></div>"
                : "") + "</div>";
          }).join("") + "</div>");
      }).catch(fail);
    }

    ui.$("#tmAdd").innerHTML = card("Adicionar à equipe", "A pessoa precisa ter uma conta no app",
      (isOwner()
        ? '<div class="sg-field"><label class="sg-field__label" for="tmEmail">E-mail da conta</label><input class="sg-input" id="tmEmail" type="email" placeholder="nome@empresa.com.br"></div>' +
          '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="tmRole">Papel</label><select class="sg-select" id="tmRole">' +
            Object.keys(A.ROLES).map(function (x) { return '<option value="' + x + '"' + (x === "support" ? " selected" : "") + ">" + A.ROLES[x].label + " — " + A.ROLES[x].desc + "</option>"; }).join("") +
          "</select></div>" +
          '<button class="sg-btn sg-btn--primary sg-btn--block" id="tmGo" style="margin-top:14px">' + SG.icon("plus", 15) + "Dar acesso</button>"
        : '<p class="sg-sm sg-dim">Só o dono da plataforma adiciona ou remove pessoas da equipe.</p>'));

    var paths = [["/admin", "Métricas"], ["/admin/solicitacoes", "Pedidos"], ["/admin/chamadas", "Chamadas"], ["/admin/conversas", "Conversas"],
      ["/admin/financeiro", "Financeiro"], ["/admin/verificacoes", "Identidades"], ["/admin/usuarios", "Usuários"], ["/admin/profissionais", "Profissionais"],
      ["/admin/avaliacoes", "Avaliações"], ["/admin/disputas", "Disputas"], ["/admin/categorias", "Categorias"], ["/admin/comunicados", "Comunicados"],
      ["/admin/relatorios", "Relatórios"], ["/admin/configuracoes", "Configurações"], ["/admin/equipe", "Equipe"]];
    ui.$("#tmMatrix").innerHTML = card("O que cada papel acessa", "As telas fora do papel somem do menu",
      '<div class="sg-table-wrap"><table class="sg-table adm-matrix"><thead><tr><th>Tela</th>' +
        Object.keys(A.ROLES).map(function (r) { return "<th>" + A.ROLES[r].label + "</th>"; }).join("") + "</tr></thead><tbody>" +
        paths.map(function (p) {
          return "<tr><td>" + p[1] + "</td>" + Object.keys(A.ROLES).map(function (r) {
            return "<td>" + (A.can(r, p[0]) ? '<span class="adm-yes">' + SG.icon("check", 14) + "</span>" : '<span class="adm-no">—</span>') + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>");

    var go = ui.$("#tmGo");
    if (go) go.addEventListener("click", function () {
      var email = ui.$("#tmEmail").value.trim(), role = ui.$("#tmRole").value;
      if (!email) { ui.toast("Informe o e-mail", { type: "error" }); return; }
      ui.busy(go, true);
      A.findUserByEmail(email).then(function (p) {
        if (!p) throw new Error("Nenhuma conta com esse e-mail. Peça para a pessoa se cadastrar no app primeiro.");
        return A.setRole(p.id, "admin", role).then(function () { return p; });
      }).then(function (p) {
        ui.busy(go, false); ui.$("#tmEmail").value = "";
        ui.toast(p.full_name + " agora faz parte da equipe", { type: "success" }); load();
      }).catch(function (e) { ui.busy(go, false); fail(e); });
    });
    ui.on(ui.$("#tmList"), "change", "[data-role]", function (e, sel) {
      A.setRole(sel.getAttribute("data-role"), "admin", sel.value).then(function () { ui.toast("Papel atualizado", { type: "success" }); load(); }).catch(function (err) { fail(err); load(); });
    });
    ui.on(ui.$("#tmList"), "click", "[data-remove]", function (e, b) {
      ui.confirm({ title: "Remover da equipe?", text: "A pessoa volta a ser cliente e perde o acesso ao painel.", okText: "Remover", danger: true }).then(function (ok) {
        if (!ok) return;
        A.setRole(b.getAttribute("data-remove"), "client", null).then(function () { ui.toast("Acesso removido", { type: "success" }); load(); }).catch(fail);
      });
    });
    load();
  };

  /* ==========================================================================
     5b. EQUIPE DE SUPORTE — criar contas para quem trabalha no app
     ========================================================================== */
  SG.views.adminStaff = function () {
    var k = K();
    app.setHeader("Equipe de suporte", "Crie as contas de quem atende no ServeGo");
    if (!isOwner()) {
      app.view(ui.empty("🔒", "Só o dono da plataforma cria contas da equipe", "Peça ao dono para criar a sua conta ou a de um colega."));
      return;
    }
    var roleOpts = Object.keys(A.ROLES).filter(function (r) { return r !== "owner"; });
    app.view(
      '<div class="app-page-head"><h1>Equipe de suporte</h1>' +
        "<p>Crie a conta de quem vai trabalhar no atendimento. A pessoa já entra no painel com o papel escolhido e só vê as telas desse papel.</p></div>" +
      '<div id="stStats">' + k.kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      '<div class="dash-grid dash-grid--main">' +
        '<div id="stList">' + ui.skeletonCard(2) + "</div>" +
        card("Criar conta", "Os dados de acesso nunca ficam no navegador",
          '<form id="stForm" novalidate>' +
            '<div class="sg-field"><label class="sg-field__label" for="stName">Nome completo</label>' +
              '<input class="sg-input" id="stName" autocomplete="off" placeholder="Ex.: Ana Ribeiro"></div>' +
            '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="stEmail">E-mail de trabalho</label>' +
              '<input class="sg-input" id="stEmail" type="email" autocomplete="off" placeholder="ana@servego.com.br"></div>' +
            '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="stPhone">Celular (opcional)</label>' +
              '<input class="sg-input" id="stPhone" type="tel" autocomplete="off" placeholder="(11) 90000-0000"></div>' +
            '<div class="sg-field" style="margin-top:12px"><span class="sg-field__label">Papel</span><div class="adm-roles">' +
              roleOpts.map(function (r) {
                return '<label class="adm-role"><input type="radio" name="stRole" value="' + r + '"' + (r === "support" ? " checked" : "") + ">" +
                  "<span><b>" + ui.esc(A.ROLES[r].label) + "</b><small>" + ui.esc(A.ROLES[r].desc) + "</small></span></label>";
              }).join("") + "</div></div>" +
            '<div class="sg-field" style="margin-top:12px"><span class="sg-field__label">Primeiro acesso</span><div class="adm-roles">' +
              '<label class="adm-role"><input type="radio" name="stMode" value="invite" checked><span><b>Convite por e-mail (recomendado)</b>' +
                "<small>A pessoa recebe um link e cria a própria senha. Ninguém mais conhece a senha.</small></span></label>" +
              '<label class="adm-role"><input type="radio" name="stMode" value="password"><span><b>Senha temporária</b>' +
                "<small>Geramos uma senha que aparece uma única vez para você repassar. Peça para trocar no primeiro acesso.</small></span></label>" +
            "</div></div>" +
            '<button class="sg-btn sg-btn--primary sg-btn--block" type="submit" id="stGo" style="margin-top:16px">' + SG.icon("plus", 15) + "Criar conta</button>" +
          "</form>") +
      "</div>",
      { className: "app-view--wide" });

    function statusOf(p) {
      if (p.status === "blocked") return ["Bloqueada", "danger"];
      if (p.invited_at && !p.last_seen_at) return ["Aguardando 1º acesso", "brand"];
      return ["Ativa", "success"];
    }

    function load() {
      A.team().then(function (list) {
        var staff = list.filter(function (p) { return (p.admin_role || "owner") !== "owner"; })
          .sort(function (a, b) { return new Date(b.invited_at || b.created_at) - new Date(a.invited_at || a.created_at); });
        var pending = staff.filter(function (p) { return p.invited_at && !p.last_seen_at && p.status !== "blocked"; }).length;
        ui.$("#stStats").innerHTML = k.kpiRow(
          k.metricCard("Pessoas na equipe", ui.num(staff.length), "sem contar o dono", "#/admin/equipe", "users", "blue") +
          k.metricCard("No suporte", ui.num(staff.filter(function (p) { return p.admin_role === "support"; }).length), "atendem clientes e profissionais", null, "chat", "violet") +
          k.metricCard("Aguardando 1º acesso", ui.num(pending), pending ? "ainda não entraram" : "todos já entraram", null, "clock", "gold") +
          k.metricCard("Bloqueadas", ui.num(staff.filter(function (p) { return p.status === "blocked"; }).length), "sem acesso ao painel", null, "ban", "red"));

        ui.$("#stList").innerHTML = card("Contas da equipe", "Gerencie o acesso de cada pessoa",
          staff.length ? '<div class="st-list">' + staff.map(function (p) {
            var st = statusOf(p), blocked = p.status === "blocked";
            return '<div class="st-row">' +
              person(p, (A.ROLES[p.admin_role] || {}).label) +
              '<div class="st-row__meta"><span class="sg-badge sg-badge--' + st[1] + '">' + st[0] + "</span>" +
                '<span class="sg-xs sg-dim">' + (p.last_seen_at ? "último acesso " + ui.timeAgo(p.last_seen_at) : "criada " + ui.timeAgo(p.invited_at || p.created_at)) + "</span></div>" +
              '<div class="st-row__acts">' +
                '<select class="sg-select sg-select--sm" data-st-role="' + ui.esc(p.id) + '" aria-label="Papel de ' + ui.esc(p.full_name) + '">' +
                  roleOpts.map(function (r) { return '<option value="' + r + '"' + (r === p.admin_role ? " selected" : "") + ">" + A.ROLES[r].label + "</option>"; }).join("") +
                "</select>" +
                '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-st-link="' + ui.esc(p.id) + '" title="Enviar por e-mail o link para criar ou trocar a senha">' + SG.icon("mail", 14) + "Link de acesso</button>" +
                '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-st-pass="' + ui.esc(p.id) + '" title="Gerar uma nova senha temporária">' + SG.icon("lock", 14) + "Nova senha</button>" +
                '<button class="sg-btn ' + (blocked ? "sg-btn--outline" : "sg-btn--ghost") + ' sg-btn--sm" data-st-block="' + ui.esc(p.id) + '">' +
                  SG.icon(blocked ? "check" : "ban", 14) + (blocked ? "Desbloquear" : "Bloquear") + "</button>" +
                '<button class="sg-btn sg-btn--ghost sg-btn--sm st-remove" data-st-remove="' + ui.esc(p.id) + '" title="Tirar do painel (a conta vira cliente)">' + SG.icon("x", 14) + "</button>" +
              "</div></div>";
          }).join("") + "</div>"
          : empty("Ninguém na equipe ainda. Crie a primeira conta ao lado."));
        all = staff;
      }).catch(fail);
    }
    var all = [];
    function find(id) { return all.filter(function (p) { return p.id === id; })[0]; }

    function showPassword(p, pass, title) {
      var m = ui.modal({
        title: title,
        body: '<p class="sg-sm">Envie estes dados para <b>' + ui.esc(p.full_name) + "</b> por um canal seguro. " +
          "<b>A senha aparece só agora</b> — depois não dá para ver de novo (só gerar outra).</p>" +
          '<div class="st-cred"><div><span>E-mail</span><b>' + ui.esc(p.email) + "</b></div>" +
            '<div><span>Senha temporária</span><b class="st-cred__pass">' + ui.esc(pass) + "</b></div>" +
            '<div><span>Endereço</span><b>' + ui.esc(location.origin + location.pathname) + "</b></div></div>" +
          '<p class="sg-xs sg-dim" style="margin-top:10px">Peça para a pessoa trocar a senha em <b>Meu perfil</b> no primeiro acesso.</p>',
        footer: '<button class="sg-btn sg-btn--secondary" data-copy>' + SG.icon("doc", 15) + "Copiar dados</button>" +
          '<button class="sg-btn sg-btn--primary" data-close>Já anotei</button>'
      });
      m.el.querySelector("[data-copy]").addEventListener("click", function () {
        ui.copy("ServeGo — acesso ao painel\nE-mail: " + p.email + "\nSenha temporária: " + pass + "\nEndereço: " + location.origin + location.pathname +
          "\nTroque a senha em Meu perfil no primeiro acesso.");
        ui.toast("Dados copiados", { type: "success" });
      });
    }

    ui.$("#stForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var b = ui.$("#stGo");
      var data = {
        full_name: ui.$("#stName").value.trim(), email: ui.$("#stEmail").value.trim(), phone: ui.$("#stPhone").value.trim(),
        admin_role: (ui.$("input[name=stRole]:checked") || {}).value, mode: (ui.$("input[name=stMode]:checked") || {}).value
      };
      ui.busy(b, true);
      A.staff.create(data).then(function (res) {
        ui.busy(b, false);
        ui.$("#stForm").reset();
        var p = { full_name: data.full_name, email: data.email.toLowerCase() };
        if (res && res.temp_password) showPassword(p, res.temp_password, "Conta criada");
        else ui.toast("Convite enviado", { type: "success", text: data.full_name + " vai receber um e-mail para criar a senha." });
        load();
      }).catch(function (err) { ui.busy(b, false); fail(err); });
    });

    var list = ui.$("#stList");
    ui.on(list, "change", "[data-st-role]", function (e, sel) {
      A.setRole(sel.getAttribute("data-st-role"), "admin", sel.value).then(function () { ui.toast("Papel atualizado", { type: "success" }); load(); })
        .catch(function (err) { fail(err); load(); });
    });
    ui.on(list, "click", "[data-st-link]", function (e, b) {
      var p = find(b.getAttribute("data-st-link"));
      ui.busy(b, true);
      A.staff.sendAccessLink(p).then(function () {
        ui.busy(b, false); ui.toast("Link enviado", { type: "success", text: "Para " + p.email });
      }).catch(function (err) { ui.busy(b, false); fail(err); });
    });
    ui.on(list, "click", "[data-st-pass]", function (e, b) {
      var p = find(b.getAttribute("data-st-pass"));
      ui.confirm({ title: "Gerar nova senha para " + p.full_name + "?", text: "A senha atual deixa de funcionar na hora.", okText: "Gerar senha" })
        .then(function (ok) {
          if (!ok) return;
          A.staff.tempPassword(p.id).then(function (res) { showPassword(p, res.temp_password, "Nova senha temporária"); }).catch(fail);
        });
    });
    ui.on(list, "click", "[data-st-block]", function (e, b) {
      var p = find(b.getAttribute("data-st-block")), blocked = p.status === "blocked";
      ui.confirm({ title: (blocked ? "Desbloquear " : "Bloquear ") + p.full_name + "?",
        text: blocked ? "A pessoa volta a entrar no painel." : "A pessoa perde o acesso imediatamente.", okText: blocked ? "Desbloquear" : "Bloquear", danger: !blocked })
        .then(function (ok) {
          if (!ok) return;
          api.admin.setUserStatus(p.id, blocked ? "active" : "blocked").then(function () { ui.toast(blocked ? "Acesso liberado" : "Acesso bloqueado", { type: "success" }); load(); }).catch(fail);
        });
    });
    ui.on(list, "click", "[data-st-remove]", function (e, b) {
      var p = find(b.getAttribute("data-st-remove"));
      ui.confirm({ title: "Tirar " + p.full_name + " da equipe?", text: "A conta continua existindo, mas vira cliente e perde o acesso ao painel.", okText: "Tirar da equipe", danger: true })
        .then(function (ok) {
          if (!ok) return;
          A.setRole(p.id, "client", null).then(function () { ui.toast("Acesso ao painel removido", { type: "success" }); load(); }).catch(fail);
        });
    });
    load();
  };

  /* ==========================================================================
     6. CONTROLES DO APP
     ========================================================================== */
  SG.views.adminControls = function () {
    var k = K();
    app.setHeader("Controles do app", "Liga/desliga, regras de operação e textos");
    app.view('<div id="ctBody">' + ui.skeletonCard(3) + "</div>", { className: "app-view--wide" });

    api.settings.load().then(function (s) {
      var bool = function (key, def) { return s[key] === undefined ? def : s[key] === true || s[key] === "true"; };
      var val = function (key, def) { return s[key] === undefined || s[key] === null ? def : s[key]; };
      var pc = SG.config.payments || {};
      ui.$("#ctBody").innerHTML =
        '<div class="app-page-head"><h1>Controles do app</h1>' +
          "<p>Tudo o que muda o comportamento do ServeGo para clientes e profissionais. Cada alteração fica na auditoria.</p></div>" +
        (bool("maintenance_mode", false) ? '<div class="idnotice idnotice--danger" style="margin-bottom:20px">' + SG.icon("alert", 18) +
          '<div class="sg-sm"><b>Modo manutenção ligado.</b> Clientes e profissionais estão vendo a tela de manutenção. Só a equipe acessa o app.</div></div>' : "") +
        '<div class="dash-grid dash-grid--half">' +
          card("Estado do app", "Chaves gerais",
            '<div class="adm-toggles adm-toggles--stack">' +
              sw("maintenance_mode", "Modo manutenção", "Tira o app do ar para clientes e profissionais. A equipe continua entrando.", bool("maintenance_mode", false)) +
              sw("signups_open", "Cadastros abertos", "Desligue para pausar a entrada de novas contas.", bool("signups_open", true)) +
              sw("require_identity", "Exigir documento e selfie", "Sem identidade aprovada, a conta não pede nem aceita serviços.", bool("require_identity", true)) +
            "</div>" +
            '<div class="sg-field" style="margin-top:16px"><label class="sg-field__label" for="ct_maintenance_message">Mensagem da manutenção</label>' +
              '<input class="sg-input" id="ct_maintenance_message" data-ct="maintenance_message" value="' + ui.esc(val("maintenance_message", "")) + '"></div>' +
            saveBtn("state")) +
          card("Operação", "Chamadas, pagamento e preço",
            '<div class="sg-grid sg-grid--2" style="gap:14px">' +
              num("dispatch_radius_km", "Raio de busca", "km", val("dispatch_radius_km", 30), 1, 200) +
              num("dispatch_timeout_seconds", "Tempo para aceitar", "seg", val("dispatch_timeout_seconds", pc.dispatchTimeoutSeconds || 45), 15, 300) +
              num("payment_timeout_minutes", "Prazo para pagar", "min", val("payment_timeout_minutes", pc.paymentTimeoutMinutes || 15), 5, 120) +
              num("urgency_surcharge_percent", "Adicional de urgência", "%", val("urgency_surcharge_percent", pc.urgencySurchargePercent || 0), 0, 100) +
              num("completion_auto_confirm_hours", "Confirmação automática", "h", val("completion_auto_confirm_hours", pc.completionAutoConfirmHours || 24), 1, 168) +
              num("min_order_value", "Valor mínimo do pedido", "R$", val("min_order_value", 50), 0, 5000) +
            "</div>" +
            '<p class="sg-xs sg-dim" style="margin-top:10px">A taxa da plataforma fica em <a class="dash-link" href="#/admin/configuracoes">Configurações</a>.</p>' +
            saveBtn("ops")) +
          card("Suporte", "Onde clientes e profissionais falam com a equipe",
            '<div class="sg-field"><label class="sg-field__label" for="ct_support_email">E-mail de suporte</label>' +
              '<input class="sg-input" id="ct_support_email" type="email" data-ct="support_email" value="' + ui.esc(val("support_email", "")) + '"></div>' +
            '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="ct_support_whatsapp">WhatsApp de suporte (com DDD)</label>' +
              '<input class="sg-input" id="ct_support_whatsapp" data-ct="support_whatsapp" placeholder="11999999999" value="' + ui.esc(val("support_whatsapp", "")) + '"></div>' +
            saveBtn("support")) +
          card("Textos legais", "Aparecem em Ajuda e suporte",
            '<div class="sg-field"><label class="sg-field__label" for="ct_terms_text">Termos de uso</label>' +
              '<textarea class="sg-textarea" id="ct_terms_text" data-ct="terms_text" rows="5">' + ui.esc(val("terms_text", "")) + "</textarea></div>" +
            '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="ct_privacy_text">Política de privacidade</label>' +
              '<textarea class="sg-textarea" id="ct_privacy_text" data-ct="privacy_text" rows="5">' + ui.esc(val("privacy_text", "")) + "</textarea></div>" +
            saveBtn("legal")) +
        "</div>";

      ui.$$("#ctBody .sg-switch[data-ct]").forEach(function (b) {
        b.addEventListener("click", function () { b.classList.toggle("is-on"); b.setAttribute("aria-checked", b.classList.contains("is-on")); });
      });
      ui.$$("#ctBody [data-save]").forEach(function (b) {
        b.addEventListener("click", function () {
          var section = b.closest(".dash-card");
          var fields = Array.prototype.slice.call(section.querySelectorAll("[data-ct]"));
          var changes = [];
          fields.forEach(function (f) {
            var key = f.getAttribute("data-ct"), v;
            if (f.classList.contains("sg-switch")) v = f.classList.contains("is-on");
            else if (f.type === "number") {
              v = Number(f.value);
              var mn = Number(f.min), mx = Number(f.max);
              if (f.value === "" || isNaN(v) || v < mn || v > mx) { changes.err = f.closest(".sg-field").querySelector("label").textContent + ": use entre " + mn + " e " + mx; return; }
            } else v = f.value.trim();
            var old = s[key];
            if (String(old) !== String(v)) changes.push([key, v]);
          });
          if (changes.err) { ui.toast(changes.err, { type: "error" }); return; }
          if (!changes.length) { ui.toast("Nada mudou nesta seção", { type: "info" }); return; }
          ui.busy(b, true);
          changes.reduce(function (p, c) {
            return p.then(function () { return api.settings.set(c[0], c[1]); }).then(function () { s[c[0]] = c[1]; });
          }, Promise.resolve()).then(function () {
            ui.busy(b, false);
            ui.toast("Alterações salvas", { type: "success", text: changes.length + " configuração(ões)" });
            if (changes.some(function (c) { return c[0] === "maintenance_mode"; })) SG.views.adminControls();
          }).catch(function (e) { ui.busy(b, false); fail(e); });
        });
      });
    }).catch(function (e) { ui.$("#ctBody").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });

    function sw(key, label, hint, on) {
      return '<div class="adm-ctrl__row"><div><b>' + ui.esc(label) + "</b><span>" + ui.esc(hint) + "</span></div>" +
        '<button type="button" class="sg-switch ' + (on ? "is-on" : "") + '" data-ct="' + key + '" role="switch" aria-checked="' + !!on + '" aria-label="' + ui.esc(label) + '">' +
        '<span class="sg-switch__track"><span class="sg-switch__thumb"></span></span></button></div>';
    }
    function num(key, label, unit, v, min, max) {
      return '<div class="sg-field"><label class="sg-field__label" for="ct_' + key + '">' + ui.esc(label) + "</label>" +
        '<div class="fee-input"><input class="sg-input" style="width:110px;font-size:1rem" id="ct_' + key + '" data-ct="' + key + '" type="number" min="' + min + '" max="' + max + '" value="' + ui.esc(v) + '">' +
        '<span style="font-size:.95rem">' + ui.esc(unit) + "</span></div></div>";
    }
    function saveBtn(id) {
      return '<div class="sg-row" style="justify-content:flex-end;margin-top:16px"><button class="sg-btn sg-btn--primary sg-btn--sm" data-save="' + id + '">' +
        SG.icon("check", 14) + "Salvar</button></div>";
    }
  };

  /* ==========================================================================
     7. RELATÓRIOS E EXPORTAÇÕES
     ========================================================================== */
  var DATASETS = [
    ["profiles", "Usuários", "users", "Todas as contas (clientes, profissionais e equipe)"],
    ["professionals", "Profissionais", "briefcase", "Perfil, nota, preço e verificação"],
    ["service_requests", "Pedidos", "layers", "Tudo o que os clientes pediram"],
    ["bookings", "Serviços", "activity", "Serviços contratados e situação"],
    ["dispatch_offers", "Chamadas", "zap", "Cada chamada enviada e a resposta"],
    ["payments", "Pagamentos", "wallet", "Cobranças Pix e cartão"],
    ["transactions", "Repasses", "trending", "Comissão e valor líquido por serviço"],
    ["reviews", "Avaliações", "star", "Notas e comentários"],
    ["reports", "Denúncias", "flag", "Relatos de usuários"],
    ["disputes", "Disputas", "alert", "Casos analisados e decisões"],
    ["messages", "Mensagens", "chat", "Todo o conteúdo dos chats"],
    ["admin_audit_log", "Auditoria", "lock", "Ações da equipe no painel"],
    ["categories", "Categorias", "grid", "Catálogo de serviços"]
  ];

  SG.views.adminExports = function () {
    var k = K();
    app.setHeader("Relatórios", "Exporte qualquer dado do app");
    app.view(
      '<div class="dash-head"><div><h1>Relatórios</h1><p>Baixe os dados em CSV (abre no Excel e no Google Planilhas) ou faça um backup completo em JSON.</p></div>' +
        '<div class="dash-head__tools"><div class="sg-seg-wrap"><div class="sg-seg" id="exPeriod">' +
          [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["all", "Tudo"]].map(function (p) {
            return '<button class="sg-chip' + (p[0] === "all" ? " is-active" : "") + '" data-p="' + p[0] + '">' + p[1] + "</button>";
          }).join("") + "</div></div>" +
          '<button class="sg-btn sg-btn--primary sg-btn--sm" id="exAll">' + SG.icon("doc", 14) + "Backup completo (JSON)</button></div></div>" +
      '<div class="adm-exports">' + DATASETS.map(function (d) {
        return '<div class="adm-export dash-tone--gold"><span class="dash-ic">' + SG.icon(d[2], 18) + "</span>" +
          '<div style="min-width:0;flex:1"><b>' + d[1] + '</b><span>' + d[3] + "</span>" +
          '<small id="exN_' + d[0] + '">…</small></div>' +
          '<button class="sg-btn sg-btn--outline sg-btn--sm" data-ex="' + d[0] + '">' + SG.icon("doc", 13) + "CSV</button></div>";
      }).join("") + "</div>",
      { className: "app-view--wide" });

    var period = "all", cache = {};
    function inPeriod(rows) {
      if (period === "all") return rows;
      var from = Date.now() - Number(period) * 864e5;
      return rows.filter(function (r) { return !r.created_at || new Date(r.created_at).getTime() >= from; });
    }
    function get(name) { return cache[name] ? Promise.resolve(cache[name]) : A.dataset(name).then(function (rows) { cache[name] = rows || []; return cache[name]; }); }
    function counts() {
      DATASETS.forEach(function (d) {
        get(d[0]).then(function (rows) { var el = ui.$("#exN_" + d[0]); if (el) el.textContent = ui.num(inPeriod(rows).length) + " registro(s)"; })
          .catch(function () { var el = ui.$("#exN_" + d[0]); if (el) el.textContent = "indisponível"; });
      });
    }
    counts();
    ui.on(ui.$("#exPeriod"), "click", "[data-p]", function (e, b) {
      period = b.getAttribute("data-p");
      ui.$$("#exPeriod [data-p]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      counts();
    });
    function flat(v) {
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    }
    ui.on(document.querySelector(".adm-exports"), "click", "[data-ex]", function (e, b) {
      var name = b.getAttribute("data-ex");
      ui.busy(b, true);
      get(name).then(function (rows) {
        rows = inPeriod(rows);
        var keys = {};
        rows.forEach(function (r) { Object.keys(r).forEach(function (x) { keys[x] = 1; }); });
        k.downloadCsv("servego-" + name + (period === "all" ? "" : "-" + period + "d"),
          Object.keys(keys).map(function (x) { return [x, function (r) { return flat(r[x]); }]; }), rows);
        ui.busy(b, false);
        api.admin.log("report.exported", "settings", null, { tabela: name, registros: rows.length });
      }).catch(function (err) { ui.busy(b, false); fail(err); });
    });
    ui.$("#exAll").addEventListener("click", function () {
      var b = this;
      ui.busy(b, true);
      Promise.all(DATASETS.map(function (d) { return get(d[0]).catch(function () { return []; }); })).then(function (all) {
        var out = { gerado_em: new Date().toISOString(), periodo: period };
        DATASETS.forEach(function (d, i) { out[d[0]] = inPeriod(all[i]); });
        downloadJson("servego-backup-" + new Date().toISOString().slice(0, 10), out);
        ui.busy(b, false);
        api.admin.log("report.backup", "settings", null, { periodo: period });
      }).catch(function (err) { ui.busy(b, false); fail(err); });
    });
  };

  /* ==========================================================================
     8. BUSCA GLOBAL (Ctrl+K)
     ========================================================================== */
  function openSearch() {
    if (document.querySelector(".adm-search-modal")) return;
    var m = ui.modal({
      size: "lg",
      body: '<div class="adm-search-modal">' +
        ui.searchBar({ id: "gsInput", size: "lg", placeholder: "Buscar pessoa, CPF, e-mail, pedido, pagamento ou disputa…" }) +
        '<div id="gsResults" class="adm-gs"><p class="sg-sm sg-dim">Digite ao menos 2 letras. Dica: <kbd>Ctrl</kbd> + <kbd>K</kbd> abre esta busca de qualquer tela.</p></div></div>'
    });
    var input = ui.$("#gsInput", m.el);
    setTimeout(function () { input.focus(); }, 30);
    var seq = 0;
    function go(href) { m.close(); SG.router.go(href.replace(/^#/, "")); }
    input.addEventListener("input", ui.debounce(function () {
      var my = ++seq;
      A.search(input.value).then(function (r) {
        if (my !== seq) return;
        var k = K(), html = "";
        var group = function (title, items) { return items.length ? '<div class="adm-gs__group"><div class="adm-gs__title">' + title + "</div>" + items.join("") + "</div>" : ""; };
        html += group("Pessoas", r.users.map(function (u) {
          return '<a class="adm-gs__item" href="#/admin/usuarios/' + ui.esc(u.id) + '">' + ui.avatar(u, "sm") +
            '<span><b>' + ui.esc(u.full_name || "—") + "</b><small>" + ui.esc((k.ROLE_LABEL[u.role] || "") + " · " + (u.email || "")) + "</small></span></a>";
        }));
        html += group("Pedidos", r.requests.map(function (x) {
          return '<a class="adm-gs__item" href="#/admin/solicitacoes/' + ui.esc(x.id) + '"><span class="sg-avatar sg-avatar--sm sg-avatar--cat">' + SG.catIcon(x.category, 15) + "</span>" +
            '<span><b>' + ui.esc(x.title) + "</b><small>" + ui.esc((ui.labels.requestStatus[x.status] || x.status) + (x.client ? " · " + x.client.full_name : "")) + "</small></span></a>";
        }));
        html += group("Pagamentos", r.payments.map(function (p) {
          return '<a class="adm-gs__item" href="#/admin/solicitacoes/' + ui.esc(p.request_id) + '"><span class="dash-ic">' + SG.icon("wallet", 15) + "</span>" +
            '<span><b>' + money(p.amount) + " · " + ui.esc(k.PAY_STATUS[p.status] || p.status) + "</b><small>" + ui.esc(p.provider_ref || p.id) + "</small></span></a>";
        }));
        html += group("Disputas", r.disputes.map(function (d) {
          return '<a class="adm-gs__item" href="#/admin/disputas/' + ui.esc(d.id) + '"><span class="dash-ic">' + SG.icon("alert", 15) + "</span>" +
            '<span><b>' + ui.esc(d.reason) + "</b><small>" + money(d.amount) + " · " + ui.timeAgo(d.created_at) + "</small></span></a>";
        }));
        ui.$("#gsResults", m.el).innerHTML = html || (input.value.trim().length >= 2
          ? '<p class="sg-sm sg-dim">Nada encontrado para “' + ui.esc(input.value.trim()) + "”.</p>"
          : '<p class="sg-sm sg-dim">Digite ao menos 2 letras.</p>');
      }).catch(fail);
    }, 180));
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var first = ui.$(".adm-gs__item", m.el); if (first) go(first.getAttribute("href")); }
    });
    ui.on(m.el, "click", ".adm-gs__item", function (e, a) { e.preventDefault(); go(a.getAttribute("href")); });
  }
  SG.adminSearch = openSearch;

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K") && app.state && app.state.role === "admin") {
      e.preventDefault();
      openSearch();
    }
  });
})(window.SG);
