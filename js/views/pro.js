/* ==========================================================================
   ServeGo — Telas do profissional
   Painel, chamadas (modelo Uber), serviços, ganhos e avaliações.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api, app = SG.app;
  SG.views = SG.views || {};

  function firstName(n) { return String(n || "").split(" ")[0]; }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }

  /* ==========================================================================
     PAINEL DO PROFISSIONAL
     ========================================================================== */
  SG.views.proHome = function () {
    var me = app.state.me;
    var pro = me.professional || {};
    app.setHeader("Painel", greeting() + ", " + firstName(me.full_name));

    app.view(
      '<div class="dash-head">' +
        "<div><h1>" + greeting() + ", " + ui.esc(firstName(me.full_name)) + ".</h1>" +
        "<p>" + (pro.is_available ? '<span class="dash-live">Online</span>' : "") +
          '<span id="availText">' + (pro.is_available
          ? "Você está disponível para novos serviços."
          : "Você está offline — ative a disponibilidade para receber solicitações.") + "</span></p></div>" +
        '<div class="dash-head__tools"><a class="sg-btn sg-btn--secondary sg-btn--sm" href="#/ganhos">' +
          SG.icon("wallet", 14) + "Ver ganhos</a></div>" +
      "</div>" +
      (pro.verification_status !== "approved"
        ? '<div class="sg-card sg-card--brand" style="margin-bottom:24px"><div class="sg-row">' +
          SG.icon("shield", 20) + "<div><strong>Cadastro em análise</strong>" +
          '<div class="sg-sm sg-dim">Assim que aprovarmos seus documentos, você passa a aparecer nas buscas com o selo Verificado.</div>' +
          "</div></div></div>"
        : "") +
      '<div class="dash-kpis" id="proMetrics">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="sg-grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:24px;margin-top:24px" id="proGrid">' +
        '<div><div class="app-section-title"><h3>Últimas chamadas</h3>' +
          '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/chamadas">Ver todas</a></div>' +
          '<div id="proOpps">' + ui.skeletonCard(2) + "</div></div>" +
        '<div><div class="app-section-title"><h3>Sua agenda</h3></div>' +
          '<div id="proAgenda">' + ui.skeletonCard(1) + "</div>" +
          '<div class="app-section-title"><h3>Mapa de chamadas</h3></div>' +
          '<div class="sg-map" style="height:262px">' +
            '<div class="sg-map__grid"></div>' +
            '<div class="sg-map__badge">' + SG.icon("zap", 12) + ' <span id="mapCount">0</span> chamadas hoje</div>' +
            '<div class="sg-map__radar"></div><div class="sg-map__radar sg-map__radar--2"></div>' +
            '<div class="sg-map__pin sg-map__pin--me" style="left:48%;top:54%">' +
              '<div class="sg-map__pin-dot">' + SG.icon("briefcase", 14) + "</div>" +
              '<div class="sg-map__pin-label">Você</div></div>' +
            '<div class="sg-map__pin" style="left:24%;top:32%"><div class="sg-map__pin-dot">' + SG.catIcon({ slug: "eletricista" }, 14) + '</div>' +
              '<div class="sg-map__pin-label">1,8 km</div></div>' +
            '<div class="sg-map__pin" style="left:76%;top:38%"><div class="sg-map__pin-dot">' + SG.catIcon({ slug: "encanador" }, 14) + '</div>' +
              '<div class="sg-map__pin-label">3,2 km</div></div>' +
            '<div class="sg-map__pin" style="left:64%;top:66%"><div class="sg-map__pin-dot">' + SG.catIcon({ slug: "ar-condicionado" }, 14) + '</div>' +
              '<div class="sg-map__pin-label">4,5 km</div></div>' +
          "</div></div>" +
      "</div>",
      { className: "app-view--wide" }
    );
    if (window.innerWidth < 1000) ui.$("#proGrid").style.gridTemplateColumns = "minmax(0,1fr)";

    Promise.all([
      api.earnings.get(me.id),
      api.dispatch.listMine(me.id),
      api.bookings.listForUser(me.id, "professional")
    ]).then(function (res) {
      var earn = res[0], calls = res[1], bks = res[2];
      var todayKey = new Date().toDateString();
      var callsToday = calls.filter(function (o) { return new Date(o.created_at).toDateString() === todayKey; });
      var today = bks.filter(function (b) {
        return ["accepted", "on_the_way", "arrived", "in_progress", "awaiting_confirmation", "disputed"].indexOf(b.status) >= 0;
      });

      var D = SG.dash;
      var week = (earn.ultimos_7_dias || []).map(function (d) { return d.valor; });
      ui.$("#proMetrics").innerHTML =
        D.kpi({ label: "Ganhos do mês", value: ui.money(earn.mes), icon: "wallet", tone: "gold", href: "#/ganhos",
          hint: "líquido, após a taxa", spark: week.length ? week : null }) +
        D.kpi({ label: "Esta semana", value: ui.money(earn.semana), icon: "trending", tone: "green", href: "#/ganhos",
          hint: ui.money(earn.a_receber || 0) + " a liberar" }) +
        D.kpi({ label: "Chamadas hoje", value: ui.num(callsToday.length), icon: "zap", tone: "blue", href: "#/chamadas",
          hint: callsToday.length ? "recebidas por proximidade" : "fique online para receber" }) +
        D.kpi({ label: "Sua nota", value: ui.rating(pro.rating || 0) + '<small class="dash-kpi__unit">/5</small>', icon: "star", tone: "violet", href: "#/avaliacoes",
          hint: ui.num(pro.reviews_count || 0) + " avaliações · " + ui.num(today.length) + " serviço(s) ativo(s)" });

      ui.$("#mapCount").textContent = callsToday.length;

      ui.$("#proOpps").innerHTML = calls.length
        ? '<div class="sg-stack">' + calls.slice(0, 3).map(callCard).join("") + "</div>"
        : ui.empty("📭", "Nenhuma chamada ainda",
            pro.is_available
              ? "Quando você for o profissional disponível mais próximo de um cliente, a chamada aparece na tela."
              : "Ative sua disponibilidade no topo da tela para receber chamadas.");
      ui.on(ui.$("#proOpps"), "click", "[data-open-call]", function (e, el) {
        var o = calls.filter(function (x) { return x.id === el.getAttribute("data-open-call"); })[0];
        if (o) SG.proCalls.show(o);
      });

      ui.$("#proAgenda").innerHTML = today.length
        ? '<div class="sg-stack-sm">' + today.map(function (b) {
            return '<a class="sg-card sg-card--tight sg-card--hover" href="#/servico/' + b.id + '" style="display:block">' +
              // o selo de status desce para a linha de baixo quando não cabe
              '<div class="sg-row sg-row--between" style="flex-wrap:wrap;gap:8px"><div class="sg-row" style="min-width:0;flex:1 1 180px">' +
              ui.avatar(b.client, "sm") + '<div style="min-width:0">' +
              '<div class="sg-sm sg-strong sg-truncate">' + ui.esc(b.request.title) + "</div>" +
              '<div class="sg-xs sg-dim">' + ui.esc(b.client.full_name) + "</div></div></div>" +
              ui.statusBadge(b.status) + "</div></a>";
          }).join("") + "</div>"
        : '<div class="sg-card"><p class="sg-sm sg-dim">Nenhum serviço ativo. Fique online para receber chamadas.</p></div>';
    });
  };

  /* ==========================================================================
     CHAMADAS (modelo Uber): o profissional mais próximo recebe a chamada,
     tem alguns segundos para aceitar, e só sai depois que o cliente paga.
     ========================================================================== */
  var DISPATCH_LABEL = {
    pending: "Aguardando sua resposta", accepted: "Aceita", declined: "Recusada",
    expired: "Expirou", cancelled: "Cancelada pelo cliente"
  };

  function netOf(price) {
    return price * (1 - SG.config.app.platformFeePercent / 100);
  }

  function callStage(o) {
    var r = o.request || {};
    if (o.status !== "accepted") return { label: DISPATCH_LABEL[o.status] || o.status, tone: ui.statusTone(o.status === "expired" ? "cancelled" : o.status) };
    if (r.booking) return { label: "Pago · " + (ui.labels.bookingStatus[r.booking.status] || ""), tone: "success" };
    if (r.status === "awaiting_payment") return { label: "Aguardando pagamento do cliente", tone: "brand" };
    if (r.status === "cancelled") return { label: "Cliente não pagou", tone: "danger" };
    return { label: "Aceita", tone: "success" };
  }

  function callCard(o) {
    var r = o.request || {};
    var st = callStage(o);
    var bk = r.booking;
    return '<div class="sg-card">' +
      '<div class="sg-row sg-row--between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">' +
        '<div class="sg-row" style="min-width:0">' +
          '<span class="sg-avatar sg-avatar--lg sg-avatar--cat">' + SG.catIcon(r.category, 22) + "</span>" +
          '<div style="min-width:0"><div class="sg-strong sg-truncate">' + ui.esc(r.title || "Chamada") + "</div>" +
            '<div class="sg-xs sg-dim" style="margin-top:3px">' + ui.timeAgo(o.created_at) + " · " + ui.km(o.distance_km) +
            (r.urgency === "now" ? " · ⚡ Agora" : "") + "</div></div></div>" +
        '<span class="sg-badge' + (st.tone ? " sg-badge--" + st.tone : "") + '">' + ui.esc(st.label) + "</span>" +
      "</div>" +
      '<div class="sg-row sg-row--between" style="margin-top:14px;gap:12px;flex-wrap:wrap">' +
        '<div><div class="sg-xs sg-faint">Você recebe</div><div class="sg-strong">' + ui.money(netOf(o.price)) + "</div></div>" +
        (o.status === "pending"
          ? '<button class="sg-btn sg-btn--primary sg-btn--sm" data-open-call="' + ui.esc(o.id) + '">Responder</button>'
          : bk ? '<a class="sg-btn sg-btn--secondary sg-btn--sm" href="#/servico/' + ui.esc(bk.id) + '">Abrir serviço</a>' : "") +
      "</div></div>";
  }

  /** Alerta de chamada (aparece em qualquer tela). */
  var openCall = null;
  function showIncoming(o) {
    if (!o || o.status !== "pending" || new Date(o.expires_at) <= new Date()) return;
    if (openCall && openCall.id === o.id) return;
    if (openCall) openCall.modal.close();
    var r = o.request || {};
    var photos = (r.photos || []).slice(0, 3);
    var total = Math.max(1, Math.round((new Date(o.expires_at) - new Date(o.created_at)) / 1000));
    var m = ui.modal({
      title: "Nova chamada",
      body:
        '<div class="call">' +
          '<div class="call__ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" class="call__track"/>' +
            '<circle cx="18" cy="18" r="16" class="call__arc" id="callArc"/></svg>' +
            '<span class="call__sec" id="callSec">' + total + "</span></div>" +
          '<div class="call__main">' +
            '<div class="sg-row" style="gap:10px"><span class="sg-avatar sg-avatar--lg" style="font-size:22px">' +
              SG.catIcon(r.category, 22) + "</span>" +
              '<div style="min-width:0"><div class="sg-strong">' + ui.esc(r.title || "") + "</div>" +
              '<div class="sg-xs sg-dim">' + ui.esc((r.category && r.category.name) || "") +
              (r.urgency === "now" ? ' · <b class="sg-brand-text">⚡ Agora</b>' : " · " + ui.esc(ui.labels.urgency[r.urgency] || "")) +
              "</div></div></div>" +
            '<p class="sg-sm sg-muted sg-clamp-3" style="margin-top:12px">' + ui.esc(r.description || "") + "</p>" +
            (photos.length ? '<div class="sg-row" style="gap:6px;margin-top:10px">' + photos.map(function (p) {
              return '<img src="' + ui.esc(p.url) + '" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px">';
            }).join("") + "</div>" : "") +
            '<div class="call__facts">' +
              "<div><span>Distância</span><b>" + ui.km(o.distance_km) + "</b></div>" +
              "<div><span>Chegada</span><b>" + ui.eta(o.eta_minutes) + "</b></div>" +
              "<div><span>Você recebe</span><b class=\"sg-brand-text\">" + ui.money(netOf(o.price)) + "</b></div>" +
            "</div>" +
            '<div class="sg-xs sg-faint" style="margin-top:10px">' + SG.icon("pin", 12) + " " +
              ui.esc(String(r.address || "").split("—").pop().trim() || "Endereço completo após o pagamento") +
              " · o cliente paga " + ui.money(o.price) + " pelo app antes de você sair.</div>" +
          "</div>" +
        "</div>",
      footer:
        '<button class="sg-btn sg-btn--ghost" data-decline>Recusar</button>' +
        '<button class="sg-btn sg-btn--primary sg-btn--lg" data-accept>' + SG.icon("check", 16) + "Aceitar chamada</button>",
      onClose: function () { if (openCall && openCall.id === o.id) openCall = null; }
    });
    openCall = { id: o.id, modal: m };

    var arc = m.el.querySelector("#callArc"), sec = m.el.querySelector("#callSec");
    var timer = setInterval(function () {
      var left = Math.max(0, (new Date(o.expires_at) - Date.now()) / 1000);
      if (sec) sec.textContent = Math.ceil(left);
      if (arc) arc.style.strokeDashoffset = String(100.5 * (1 - left / total));
      if (left <= 0) {
        clearInterval(timer);
        m.close();
        ui.toast("Chamada expirou", { type: "info", text: "Ela foi passada ao próximo profissional." });
      }
    }, 250);

    function respond(accept, btn) {
      ui.busy(btn, true);
      api.dispatch.respond(o.id, accept).then(function () {
        clearInterval(timer);
        m.close();
        if (accept) {
          ui.toast("Chamada aceita!", { type: "success", text: "Assim que o cliente pagar pelo app, você é avisado para sair." });
          if (location.hash.indexOf("/chamadas") >= 0) SG.views.proCalls(); else SG.router.go("/chamadas");
        } else {
          ui.toast("Chamada recusada", { type: "info" });
          if (location.hash.indexOf("/chamadas") >= 0) SG.views.proCalls();
        }
      }).catch(function (e) {
        clearInterval(timer);
        m.close();
        ui.toast(SG.explainError(e), { type: "error" });
      });
    }
    m.el.querySelector("[data-accept]").addEventListener("click", function () { respond(true, this); });
    m.el.querySelector("[data-decline]").addEventListener("click", function () { respond(false, this); });
  }

  /** Liga o alerta de chamadas para o profissional logado (chamado pelo shell). */
  SG.proCalls = {
    watch: function (me) {
      api.dispatch.listMine(me.id).then(function (list) {
        list.filter(function (o) { return o.status === "pending"; }).slice(0, 1).forEach(showIncoming);
      });
      return api.dispatch.subscribeIncoming(me.id, function (o) {
        if (!o) {
          if (location.hash.indexOf("/chamadas") >= 0) SG.views.proCalls();
          return;
        }
        if (o.status === "pending") return showIncoming(o);
        if (openCall && openCall.id === o.id) openCall.modal.close();
        if (location.hash.indexOf("/chamadas") >= 0) SG.views.proCalls();
      });
    },
    show: showIncoming
  };

  SG.views.proCalls = function () {
    var me = app.state.me;
    var pro = me.professional || {};
    app.setHeader("Chamadas", "Pedidos enviados a você por proximidade");
    app.view(
      '<div class="app-page-head"><h1>Chamadas</h1>' +
        "<p>Você recebe chamadas quando é o profissional disponível mais próximo. O cliente paga pelo app antes de você sair.</p></div>" +
      '<div class="sg-card ' + (pro.is_available ? "sg-card--brand" : "") + '" style="margin-bottom:20px">' +
        '<div class="sg-row sg-row--between" style="gap:12px;flex-wrap:wrap">' +
          '<div class="sg-row"><span class="sg-dot ' + (pro.is_available ? "sg-dot--live" : "sg-dot--off") + '"></span>' +
            "<div><strong>" + (pro.is_available ? "Você está online" : "Você está offline") + "</strong>" +
            '<div class="sg-sm sg-dim">' + (pro.is_available
              ? "Mantenha o app aberto: as chamadas aparecem na tela com alguns segundos para aceitar."
              : "Ative o botão Online no topo para começar a receber chamadas.") + "</div></div></div>" +
          (api.isDemo ? '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="callDemo">' + SG.icon("zap", 14) + "Simular uma chamada</button>" : "") +
        "</div></div>" +
      '<div class="dash-kpis" id="callStats">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="sg-seg-wrap"><div class="sg-seg" role="tablist" id="callFilters">' +
        '<button class="sg-chip is-active" data-f="all">Todas</button>' +
        '<button class="sg-chip" data-f="accepted">Aceitas</button>' +
        '<button class="sg-chip" data-f="missed">Recusadas / expiradas</button>' +
      "</div></div>" +
      '<div id="callList">' + ui.skeletonCard(3) + "</div>"
    );

    var all = [], f = "all";
    function passes(o, f) {
      if (f === "accepted") return o.status === "accepted";
      if (f === "missed") return ["declined", "expired"].indexOf(o.status) >= 0;
      return true;
    }
    function paint() {
      ui.segCounts("callFilters", "data-f", function (v) { return all.filter(function (o) { return passes(o, v); }).length; });
      var answered = all.filter(function (o) { return o.status !== "pending"; });
      var accepted = all.filter(function (o) { return o.status === "accepted"; }).length;
      var todayKey = new Date().toDateString();
      ui.$("#callStats").innerHTML =
        SG.dash.kpi({ label: "Chamadas recebidas", value: ui.num(all.length), icon: "zap", tone: "blue",
          hint: ui.num(all.filter(function (o) { return new Date(o.created_at).toDateString() === todayKey; }).length) + " hoje" }) +
        SG.dash.kpi({ label: "Aceitas", value: ui.num(accepted), icon: "checkCircle", tone: "green", hint: "viraram serviço" }) +
        SG.dash.kpi({ label: "Taxa de aceite", value: (answered.length ? Math.round(accepted / answered.length * 100) : 100) + "%", icon: "trending", tone: "gold",
          hint: "quem aceita mais recebe mais" }) +
        SG.dash.kpi({ label: "Recusadas / expiradas", value: ui.num(answered.length - accepted), icon: "x", tone: "red",
          hint: "responda rápido para não perder" });
      var list = all.filter(function (o) { return passes(o, f); });
      ui.$("#callList").innerHTML =
        (list.length
          ? '<div class="sg-stack">' + list.map(callCard).join("") + "</div>"
          : ui.empty("📭", "Nenhuma chamada aqui", "Fique online para receber chamadas de clientes por perto."));
    }
    function load() {
      api.dispatch.listMine(me.id).then(function (list) { all = list; paint(); });
    }
    load();

    ui.on(ui.$("#callFilters"), "click", "[data-f]", function (e, el) {
      ui.$$("#callFilters .sg-chip").forEach(function (c) { c.classList.remove("is-active"); });
      el.classList.add("is-active");
      f = el.getAttribute("data-f");
      paint();
    });
    ui.on(ui.$("#callList"), "click", "[data-open-call]", function (e, el) {
      var o = all.filter(function (x) { return x.id === el.getAttribute("data-open-call"); })[0];
      if (o) showIncoming(o);
    });
    var demo = ui.$("#callDemo");
    if (demo) demo.addEventListener("click", function () {
      ui.busy(demo, true);
      api.dispatch.demoIncoming(me.id).then(function () { ui.busy(demo, false); load(); })
        .catch(function (e) { ui.busy(demo, false); ui.toast(SG.explainError(e), { type: "error" }); });
    });
  };

  /* ==========================================================================
     SERVIÇOS DO PROFISSIONAL
     ========================================================================== */
  SG.views.proBookings = function () {
    app.setHeader("Serviços", "Contratos ativos e histórico");
    app.view('<div class="app-page-head"><h1>Meus serviços</h1>' +
      "<p>Tudo o que você já executou ou está executando pelo ServeGo.</p></div>" +
      '<div class="dash-kpis" id="bkStats">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="sg-seg-wrap"><div class="sg-seg" role="tablist" id="bkFilters">' +
        '<button class="sg-chip is-active" data-f="active">Ativos</button>' +
        '<button class="sg-chip" data-f="completed">Concluídos</button>' +
        '<button class="sg-chip" data-f="all">Todos</button></div></div>' +
      '<div id="bkList">' + ui.skeletonCard(3) + "</div>");

    var all = [];
    function passes(b, f) {
      if (f === "active") return ["accepted", "on_the_way", "arrived", "in_progress", "awaiting_confirmation", "disputed"].indexOf(b.status) >= 0;
      if (f === "completed") return b.status === "completed";
      return true;
    }
    function paint(f) {
      ui.segCounts("bkFilters", "data-f", function (v) { return all.filter(function (b) { return passes(b, v); }).length; });
      var done = all.filter(function (b) { return b.status === "completed"; });
      var net = function (b) { return Number(b.price || 0) * (1 - SG.config.app.platformFeePercent / 100); };
      var waiting = all.filter(function (b) { return b.status === "awaiting_confirmation"; }).length;
      ui.$("#bkStats").innerHTML =
        SG.dash.kpi({ label: "Ativos", value: ui.num(all.filter(function (b) { return passes(b, "active"); }).length), icon: "activity", tone: "blue",
          hint: waiting ? waiting + " aguardando confirmação do cliente" : "em andamento agora" }) +
        SG.dash.kpi({ label: "Concluídos", value: ui.num(done.length), icon: "checkCircle", tone: "green", hint: "confirmados pelo cliente" }) +
        SG.dash.kpi({ label: "Você recebeu", value: ui.money(done.reduce(function (s, b) { return s + net(b); }, 0)), icon: "wallet", tone: "gold",
          hint: "líquido dos concluídos", href: "#/ganhos" }) +
        SG.dash.kpi({ label: "Em disputa", value: ui.num(all.filter(function (b) { return b.status === "disputed"; }).length), icon: "alert", tone: "red",
          hint: "valor retido até a decisão" });
      var list = all.filter(function (b) { return passes(b, f); });
      ui.$("#bkList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(function (b) {
            return '<a class="sg-card sg-card--hover" href="#/servico/' + b.id + '" style="display:block">' +
              '<div class="sg-row sg-row--between" style="gap:16px;flex-wrap:wrap">' +
                '<div class="sg-row" style="min-width:0">' + ui.avatar(b.client, "lg") +
                  '<div style="min-width:0"><div class="sg-strong sg-truncate">' + ui.esc(b.request.title) + "</div>" +
                  '<div class="sg-xs sg-dim">' + ui.esc(b.client.full_name) + " · " + ui.dateTime(b.accepted_at) + "</div></div></div>" +
                '<div class="sg-row" style="gap:16px">' +
                  '<div style="text-align:right"><div class="sg-xs sg-faint">Você recebe</div>' +
                    '<div class="sg-strong">' + ui.money(b.price * (1 - SG.config.app.platformFeePercent / 100)) + "</div></div>" +
                  ui.statusBadge(b.status) + "</div></div></a>";
          }).join("") + "</div>"
        : ui.empty("🧰", "Nenhum serviço nesta aba", "Aceite chamadas para conseguir novos serviços.");
    }

    api.bookings.listForUser(app.state.me.id, "professional").then(function (list) { all = list; paint("active"); });
    ui.on(ui.$("#bkFilters"), "click", "[data-f]", function (e, el) {
      ui.$$("#bkFilters .sg-chip").forEach(function (c) { c.classList.remove("is-active"); });
      el.classList.add("is-active");
      paint(el.getAttribute("data-f"));
    });
  };

  /* ==========================================================================
     GANHOS
     ========================================================================== */
  SG.views.proEarnings = function () {
    app.setHeader("Ganhos", "Sua carteira no ServeGo");
    app.view('<div class="app-page-head"><h1>Ganhos</h1>' +
      "<p>Valores líquidos, já descontada a taxa de " + SG.config.app.platformFeePercent + "%.</p></div>" +
      '<div class="dash-kpis" id="earnMetrics">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="dash-grid dash-grid--main" id="earnGrid">' +
        '<section class="dash-card"><div class="dash-card__head"><div><h3 class="dash-card__title">Seus ganhos</h3>' +
          '<div class="dash-card__sub">Valor líquido por dia · últimos 30 dias</div>' +
          '<div class="dash-card__big"><b id="earnMonthTotal">—</b></div></div></div>' +
          '<div id="earnChart"><div class="sg-skel sg-skel--block"></div></div></section>' +
        '<section class="dash-card"><div class="dash-card__head"><div><h3 class="dash-card__title">Resumo</h3>' +
          '<div class="dash-card__sub">Sua carteira no ServeGo</div></div></div>' +
          '<div id="earnSummary">' + ui.skeletonCard(1) + "</div></section>" +
      "</div>" +
      '<div class="app-section-title"><h3>Lançamentos</h3></div>' +
      '<div id="earnTx">' + ui.skeletonCard(2) + "</div>",
      { className: "app-view--wide" });
    Promise.all([api.earnings.get(app.state.me.id), api.earnings.transactions(app.state.me.id)])
      .then(function (res) {
        var e = res[0], tx = res[1];
        var D = SG.dash;
        var serie = last30(tx);
        var week = (e.ultimos_7_dias || []).map(function (d) { return Number(d.valor) || 0; });
        ui.$("#earnMetrics").innerHTML =
          D.kpi({ label: "Hoje", value: ui.money(e.hoje), icon: "clock", tone: "blue", hint: "líquido do dia" }) +
          D.kpi({ label: "Esta semana", value: ui.money(e.semana), icon: "trending", tone: "green",
            hint: "desde segunda-feira", spark: week.length ? week : null }) +
          D.kpi({ label: "Este mês", value: ui.money(e.mes), icon: "wallet", tone: "gold",
            hint: ui.money(e.a_receber || 0) + " a liberar", spark: serie.map(function (d) { return d.valor; }) }) +
          D.kpi({ label: "Serviços concluídos", value: ui.num(e.servicos_concluidos), icon: "checkCircle", tone: "violet",
            hint: "confirmados pelos clientes" });

        var total30 = serie.reduce(function (a, d) { return a + d.valor; }, 0);
        ui.$("#earnMonthTotal").textContent = ui.money(total30);
        ui.$("#earnChart").innerHTML = D.areaChart(serie, {
          format: function (v) { return ui.money(v); }, axis: D.moneyAxis, label: "Ganhos dos últimos 30 dias"
        });

        ui.$("#earnSummary").innerHTML =
          row("Total recebido", ui.money(e.total)) +
          row("A receber", ui.money(e.a_receber)) +
          row("Taxa ServeGo", SG.config.app.platformFeePercent + "%") +
          '<div class="sg-divider"></div>' +
          '<p class="sg-xs sg-faint">Os repasses são liberados em até 2 dias úteis após a conclusão do serviço. ' +
          "A estrutura já está pronta para integrar um provedor de pagamentos (split, antecipação e assinatura).</p>";

        ui.$("#earnTx").innerHTML = tx.length
          ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            "<th>Data</th><th>Serviço</th><th>Valor</th><th>Taxa</th><th>Líquido</th><th>Status</th>" +
            "</tr></thead><tbody>" + tx.map(function (t) {
              return "<tr><td>" + ui.date(t.created_at) + "</td>" +
                "<td>" + ui.esc(t.booking_id) + "</td>" +
                "<td>" + ui.money(t.amount) + "</td>" +
                '<td class="sg-dim">− ' + ui.money(t.platform_fee) + "</td>" +
                '<td class="sg-strong">' + ui.money(t.net_amount) + "</td>" +
                '<td><span class="sg-badge sg-badge--' + (t.status === "released" ? "success" : "info") + '">' +
                  (t.status === "released" ? "Liberado" : t.status === "pending" ? "Pendente" : "Estornado") +
                "</span></td></tr>";
            }).join("") + "</tbody></table></div>"
          : ui.empty("💳", "Sem lançamentos ainda", "Conclua um serviço para ver seus repasses aqui.");
      });

    /** Valor líquido por dia nos últimos 30 dias (estornos fora). */
    function last30(tx) {
      var by = {};
      tx.forEach(function (t) {
        if (t.status === "refunded") return;
        var k = new Date(t.created_at).toDateString();
        by[k] = (by[k] || 0) + Number(t.net_amount || 0);
      });
      var out = [];
      for (var i = 29; i >= 0; i--) {
        var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
        out.push({
          rotulo: d.toLocaleDateString(SG.config.app.locale, { day: "2-digit", month: "short" }).replace(".", ""),
          dica: d.toLocaleDateString(SG.config.app.locale, { weekday: "short", day: "2-digit", month: "short" }),
          valor: by[d.toDateString()] || 0
        });
      }
      return out;
    }

    function row(label, value) {
      return '<div class="sg-row sg-row--between" style="padding:9px 0">' +
        '<span class="sg-md sg-dim">' + label + '</span><span class="sg-md sg-strong">' + value + "</span></div>";
    }
  };

  /* ==========================================================================
     AVALIAÇÕES RECEBIDAS
     ========================================================================== */
  SG.views.proReviews = function () {
    var me = app.state.me;
    var pro = me.professional || {};
    app.setHeader("Avaliações", "O que os clientes dizem");
    app.view('<div class="app-page-head"><h1>Suas avaliações</h1>' +
      "<p>Responder avaliações aumenta sua taxa de contratação.</p></div>" +
      '<div class="dash-kpis" id="revStats">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="sg-grid" style="grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:24px" id="revGrid">' +
        '<div><section class="dash-card" id="revSummary">' + ui.skeletonCard(1) + "</section></div>" +
        '<div id="revList">' + ui.skeletonCard(3) + "</div>" +
      "</div>", { className: "app-view--wide" });
    if (window.innerWidth < 900) ui.$("#revGrid").style.gridTemplateColumns = "minmax(0,1fr)";

    api.reviews.listByProfessional(me.id).then(function (list) {
      var d = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      list.forEach(function (r) { d[r.rating] = (d[r.rating] || 0) + 1; });
      var total = list.length || 1;
      var avg = list.length
        ? Math.round((list.reduce(function (s, r) { return s + r.rating; }, 0) / list.length) * 100) / 100
        : (pro.rating || 0);

      var D = SG.dash;
      var answered = list.filter(function (r) { return r.reply; }).length;
      ui.$("#revStats").innerHTML =
        D.kpi({ label: "Sua nota", value: ui.rating(avg) + '<small class="dash-kpi__unit">/5</small>', icon: "star", tone: "gold",
          hint: ui.num(list.length) + " avaliações" }) +
        D.kpi({ label: "5 estrelas", value: (list.length ? Math.round(d[5] / total * 100) : 0) + "%", icon: "heart", tone: "green",
          hint: ui.num(d[5]) + " clientes encantados" }) +
        D.kpi({ label: "Respondidas", value: (list.length ? Math.round(answered / total * 100) : 0) + "%", icon: "chat", tone: "blue",
          hint: ui.num(list.length - answered) + " aguardando sua resposta" }) +
        D.kpi({ label: "Notas baixas (≤ 3)", value: ui.num(d[1] + d[2] + d[3]), icon: "alert", tone: "red",
          hint: d[1] + d[2] + d[3] ? "responda com cuidado" : "nenhuma até agora" });
      ui.$("#revSummary").innerHTML =
        '<div class="dash-card__head"><div><h3 class="dash-card__title">Distribuição</h3>' +
          '<div class="dash-card__sub">Quantas avaliações em cada nota</div></div>' + ui.stars(avg, 16) + "</div>" +
        D.barList([5, 4, 3, 2, 1].map(function (n) {
          return { label: n + " estrela" + (n === 1 ? "" : "s"), value: d[n],
            display: ui.num(d[n]) + " · " + Math.round((d[n] / total) * 100) + "%" };
        }), { rank: false });

      ui.$("#revList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(function (r) {
            return '<div class="sg-card" data-review="' + r.id + '">' +
              '<div class="sg-row sg-row--between">' +
                '<div class="sg-row">' + ui.avatar(r.client, "sm") +
                  '<div><div class="sg-sm sg-strong">' + ui.esc((r.client && r.client.full_name) || "Cliente") + "</div>" +
                  '<div class="sg-xs sg-faint">' + ui.date(r.created_at) + "</div></div></div>" +
                ui.stars(r.rating, 14) + "</div>" +
              (r.comment ? '<p class="sg-md sg-muted sg-break" style="margin-top:12px">' + ui.esc(r.comment) + "</p>" : "") +
              (r.reply
                ? '<div style="margin-top:12px;padding:12px;border-left:2px solid var(--sg-brand-line);background:var(--sg-surface-2);border-radius:0 8px 8px 0">' +
                  '<div class="sg-xs sg-brand-text sg-strong">Sua resposta</div>' +
                  '<div class="sg-sm sg-muted" style="margin-top:4px">' + ui.esc(r.reply) + "</div></div>"
                : '<button class="sg-btn sg-btn--ghost sg-btn--sm" style="margin-top:12px" data-reply="' + r.id + '">' +
                  SG.icon("chat", 15) + "Responder</button>") +
              "</div>";
          }).join("") + "</div>"
        : ui.empty("⭐", "Nenhuma avaliação ainda", "Conclua serviços para começar a construir sua reputação.");

      ui.$$("[data-reply]").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-reply");
          var m = ui.modal({
            title: "Responder avaliação",
            body: '<div class="sg-field"><label class="sg-field__label">Sua resposta pública</label>' +
              '<textarea class="sg-textarea" id="replyText" placeholder="Agradeça e esclareça o que for necessário."></textarea></div>',
            footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button>' +
              '<button class="sg-btn sg-btn--primary" data-send>Publicar resposta</button>'
          });
          m.el.querySelector("[data-send]").addEventListener("click", function () {
            var text = ui.$("#replyText").value.trim();
            if (!text) return;
            ui.busy(this, true);
            api.reviews.reply(id, text).then(function () {
              m.close();
              ui.toast("Resposta publicada", { type: "success" });
              SG.views.proReviews();
            });
          });
        });
      });
    });
  };
})(window.SG);
