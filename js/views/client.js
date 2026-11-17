/* ==========================================================================
   ServeGo — Telas do cliente
   Início, categorias, atividade, matching de profissionais, acompanhamento.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api, app = SG.app;
  SG.views = SG.views || {};

  function firstName(n) { return String(n || "").split(" ")[0]; }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }

  /* ---- Cartão de categoria ------------------------------------------------ */
  function catTile(c) {
    return '<a class="cat-tile" href="#/solicitar?cat=' + c.id + '">' +
      '<span class="cat-tile__ic">' + SG.catIcon(c, 24) + "</span>" +
      '<span><span class="cat-tile__name" style="display:block">' + ui.esc(c.name) + "</span>" +
      '<span class="cat-tile__price">a partir de ' + ui.money(c.price_from, true) + "</span></span></a>";
  }

  /* ---- Cartão de solicitação ---------------------------------------------- */
  function requestCard(r) {
    var link = r.booking ? "#/acompanhar/" + r.booking.id : "#/solicitacao/" + r.id;
    var status = r.booking ? ui.statusBadge(r.booking.status) : ui.statusBadge(r.status, ui.labels.requestStatus);
    return '<a class="sg-card sg-card--hover" href="' + link + '" style="display:block">' +
      // o selo de status quebra para a linha de baixo quando não cabe ao lado do título
      '<div class="sg-row sg-row--between" style="align-items:flex-start;flex-wrap:wrap;gap:10px">' +
        '<div class="sg-row" style="min-width:0;flex:1 1 200px">' +
          '<span class="sg-avatar sg-avatar--lg sg-avatar--cat">' + SG.catIcon(r.category, 22) + "</span>" +
          '<div style="min-width:0">' +
            '<div class="sg-strong sg-truncate">' + ui.esc(r.title) + "</div>" +
            '<div class="sg-xs sg-dim" style="margin-top:3px">' +
              ui.esc((r.category && r.category.name) || "") + " · " + ui.timeAgo(r.created_at) + "</div>" +
          "</div></div>" +
        status +
      "</div>" +
      '<div class="sg-row sg-row--between" style="margin-top:16px">' +
        '<div class="sg-row" style="gap:16px">' +
          (r.price ? badgeMini("wallet", ui.money(r.price) + (r.payment && r.payment.status === "paid" ? " · pago" : "")) : "") +
          badgeMini("clock", ui.labels.urgency[r.urgency] || "") +
        "</div>" +
        '<span class="sg-row sg-xs sg-brand-text sg-strong">Abrir ' + SG.icon("chevronRight", 14) + "</span>" +
      "</div></a>";
  }

  function badgeMini(icon, text) {
    return '<span class="sg-row sg-xs sg-dim" style="gap:5px">' + SG.icon(icon, 13) + ui.esc(text) + "</span>";
  }

  /* ==========================================================================
     INÍCIO DO CLIENTE
     ========================================================================== */
  SG.views.clientHome = function () {
    var me = app.state.me;
    app.setHeader("Início", greeting() + ", " + firstName(me.full_name));
    app.view(
      '<div class="app-page-head">' +
        '<h1>' + greeting() + ", " + ui.esc(firstName(me.full_name)) + ' 👋</h1>' +
        "<p>O que você precisa resolver hoje?</p>" +
      "</div>" +
      ui.searchBar({
        id: "homeSearch", size: "lg", cls: "home-search",
        placeholder: "Busque por serviço: elétrica, vazamento, pintura…",
        after: '<div id="searchResults"></div>'
      }) +
      '<div id="homeActive"></div>' +
      '<div class="app-section-title"><h3>Categorias</h3>' +
        '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/categorias">Ver todas ' + SG.icon("chevronRight", 14) + "</a></div>" +
      '<div class="cat-grid" id="homeCats">' + ui.skeletonCard(1) + "</div>" +
      '<div id="homeRecommended"></div>' +
      '<div id="homeHistory"></div>'
    );

    // categorias
    api.categories.list().then(function (cats) {
      app.state.categories = cats;
      ui.$("#homeCats").innerHTML = cats.slice(0, 10).map(catTile).join("") +
        '<a class="cat-tile" href="#/categorias" style="justify-content:center;align-items:center;text-align:center">' +
        '<span class="cat-tile__ic" style="margin:0 auto">' + SG.icon("grid", 18) + "</span>" +
        '<span class="cat-tile__name">Ver todas</span></a>';

      var input = ui.$("#homeSearch");
      input.addEventListener("input", ui.debounce(function () {
        var q = input.value.toLowerCase().trim();
        var box = ui.$("#searchResults");
        if (!q) { box.innerHTML = ""; return; }
        var hits = cats.filter(function (c) {
          return (c.name + " " + c.description).toLowerCase().indexOf(q) >= 0;
        }).slice(0, 5);
        box.innerHTML = hits.length
          ? '<div class="sg-search__results">' +
            hits.map(function (c) {
              return '<a class="sg-list__item" href="#/solicitar?cat=' + c.id + '">' +
                '<span class="sg-catchip">' + SG.catIcon(c, 18) + "</span><span>" + ui.esc(c.name) +
                '<span class="sg-xs sg-dim" style="display:block">' + ui.esc(c.description) + "</span></span></a>";
            }).join("") + "</div>"
          : '<div class="sg-search__results"><div class="sg-search__none">Nenhum serviço encontrado para “' +
            ui.esc(input.value.trim()) + '”. <a href="#/solicitar">Descrever o problema</a></div></div>';
      }, 180));
      // as sugestões fecham ao sair da busca e voltam ao focar de novo
      input.addEventListener("blur", function () {
        setTimeout(function () { ui.$("#searchResults").innerHTML = ""; }, 160);
      });
      input.addEventListener("focus", function () {
        if (input.value.trim()) input.dispatchEvent(new Event("input"));
      });
    });

    // serviços em andamento
    api.requests.listMine(me.id).then(function (list) {
      var active = list.filter(function (r) {
        return ["matching", "open", "assigned", "in_progress"].indexOf(r.status) >= 0;
      });
      var host = ui.$("#homeActive");
      if (!active.length) { host.innerHTML = ""; return; }
      host.innerHTML =
        '<div class="app-section-title"><h3>Em andamento</h3>' +
        '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/atividade">Ver tudo</a></div>' +
        '<div class="sg-grid sg-grid--2">' + active.slice(0, 2).map(requestCard).join("") + "</div>";
    });

    // recomendados + favoritos
    api.favorites.list(me.id).then(function (favs) {
      if (!favs.length) return;
      ui.$("#homeRecommended").innerHTML =
        '<div class="app-section-title"><h3>Seus profissionais de confiança</h3>' +
        '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/favoritos">Ver favoritos</a></div>' +
        '<div class="sg-grid sg-grid--3">' + favs.slice(0, 3).map(miniProCard).join("") + "</div>";
    });

    // repetir serviço
    api.bookings.listForUser(me.id, "client").then(function (bks) {
      var done = bks.filter(function (b) { return b.status === "completed"; });
      if (!done.length) return;
      ui.$("#homeHistory").innerHTML =
        '<div class="app-section-title"><h3>Repetir um serviço</h3></div>' +
        '<div class="sg-grid sg-grid--2">' + done.slice(0, 2).map(function (b) {
          return '<div class="sg-card sg-row sg-row--between">' +
            '<div class="sg-row" style="min-width:0">' + ui.avatar(b.professional, "lg") +
            '<div style="min-width:0"><div class="sg-strong sg-truncate">' + ui.esc(b.request.title) + "</div>" +
            '<div class="sg-xs sg-dim">' + ui.esc(b.professional.full_name) + " · " + ui.date(b.completed_at) + "</div></div></div>" +
            '<a class="sg-btn sg-btn--outline sg-btn--sm" href="#/solicitar?cat=' + b.request.category_id + '">Repetir</a></div>';
        }).join("") + "</div>";
    });
  };

  function miniProCard(p) {
    return '<a class="sg-card sg-card--hover" href="#/profissional/' + p.id + '" style="display:block">' +
      '<div class="sg-row">' + ui.avatar(p, "lg") +
      '<div style="min-width:0"><div class="sg-strong sg-truncate">' + ui.esc(p.full_name) + "</div>" +
      '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(p.headline || "") + "</div></div></div>" +
      '<div class="sg-row sg-row--between" style="margin-top:14px">' +
      '<span class="sg-row sg-xs" style="gap:6px">' + ui.stars(p.rating) +
      '<span class="sg-dim">' + ui.rating(p.rating) + "</span></span>" +
      '<span class="sg-xs sg-dim">' + ui.num(p.jobs_count) + " serviços</span></div></a>";
  }

  /* ==========================================================================
     TODAS AS CATEGORIAS
     ========================================================================== */
  SG.views.categories = function () {
    app.setHeader("Categorias", "Escolha o tipo de serviço");
    app.view('<div class="app-page-head"><h1>Todas as categorias</h1>' +
      "<p>Profissionais verificados em 14 especialidades.</p></div>" +
      '<div class="cat-grid" id="allCats">' + ui.skeletonCard(1) + "</div>");
    api.categories.list().then(function (cats) {
      ui.$("#allCats").innerHTML = cats.map(catTile).join("");
    });
  };

  /* ==========================================================================
     MINHAS SOLICITAÇÕES
     ========================================================================== */
  SG.views.clientActivity = function () {
    app.setHeader("Minhas solicitações", "Histórico e serviços em andamento");
    app.view('<div class="app-page-head"><h1>Minhas solicitações</h1>' +
      "<p>Acompanhe tudo o que você pediu no ServeGo.</p></div>" +
      '<div class="dash-kpis" id="actStats">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="sg-seg-wrap"><div class="sg-seg" role="tablist" id="actFilters">' +
        chip("all", "Todas", true) + chip("active", "Em andamento") +
        chip("completed", "Concluídas") + chip("cancelled", "Canceladas") + "</div></div>" +
      '<div id="actList">' + ui.skeletonCard(3) + "</div>");

    var all = [];
    function passes(r, filter) {
      if (filter === "active") return ["open", "matching", "awaiting_payment", "assigned", "in_progress"].indexOf(r.status) >= 0;
      if (filter === "completed") return r.status === "completed";
      if (filter === "cancelled") return r.status === "cancelled";
      return true;
    }
    function paint(filter) {
      ui.segCounts("actFilters", "data-chip", function (v) { return all.filter(function (r) { return passes(r, v); }).length; });
      var paid = all.filter(function (r) { return r.payment && r.payment.status === "paid"; });
      var active = all.filter(function (r) { return passes(r, "active"); }).length;
      ui.$("#actStats").innerHTML =
        SG.dash.kpi({ label: "Solicitações", value: ui.num(all.length), icon: "layers", tone: "blue", hint: "desde que você entrou" }) +
        SG.dash.kpi({ label: "Em andamento", value: ui.num(active), icon: "activity", tone: "gold", hint: active ? "acompanhe pelo app" : "nada pendente" }) +
        SG.dash.kpi({ label: "Concluídas", value: ui.num(all.filter(function (r) { return r.status === "completed"; }).length), icon: "checkCircle", tone: "green",
          hint: "serviços resolvidos" }) +
        SG.dash.kpi({ label: "Total pago", value: ui.money(paid.reduce(function (s, r) { return s + Number(r.price || 0); }, 0)), icon: "wallet", tone: "violet",
          hint: "pagamentos protegidos pelo app" });
      var list = all.filter(function (r) { return passes(r, filter); });
      ui.$("#actList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(requestCard).join("") + "</div>"
        : ui.empty("📋", "Nenhuma solicitação por aqui",
            "Quando você pedir um serviço, ele aparece nesta lista.",
            '<a class="sg-btn sg-btn--primary" href="#/solicitar">Solicitar um serviço</a>');
    }

    api.requests.listMine(app.state.me.id).then(function (list) {
      all = list;
      paint("all");
    });

    ui.on(ui.$("#actFilters"), "click", "[data-chip]", function (e, el) {
      ui.$$("#actFilters .sg-chip").forEach(function (c) { c.classList.remove("is-active"); });
      el.classList.add("is-active");
      paint(el.getAttribute("data-chip"));
    });
  };

  function chip(value, label, active) {
    return '<button class="sg-chip ' + (active ? "is-active" : "") + '" data-chip="' + value + '">' + label + "</button>";
  }

  /* ==========================================================================
     SOLICITAÇÃO: CHAMANDO O PROFISSIONAL MAIS PRÓXIMO → PAGAMENTO NO APP
     Como no Uber: o sistema chama o profissional disponível mais próximo;
     quando ele aceita, o cliente vê o preço fechado e PAGA ANTES, aqui mesmo.
     ========================================================================== */

  /** QR "desenhado" para o modo demo (o real vem do gateway em base64). */
  function demoQrSvg(text) {
    var n = 29, cells = "", h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    function rnd() { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }
    function finder(x, y) {
      return '<rect x="' + x + '" y="' + y + '" width="7" height="7" fill="#111"/>' +
        '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#fff"/>' +
        '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" fill="#111"/>';
    }
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
        if (!inFinder && rnd() > 0.52) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    return '<svg viewBox="-2 -2 ' + (n + 4) + " " + (n + 4) + '" width="200" height="200" shape-rendering="crispEdges" aria-label="QR Code Pix">' +
      '<rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/>' +
      '<g fill="#111">' + cells + "</g>" + finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7) + "</svg>";
  }

  function countdown(el, iso, onEnd) {
    var timer = setInterval(tick, 1000);
    function tick() {
      if (!el.isConnected) return clearInterval(timer);
      var s = Math.max(0, Math.round((new Date(iso) - Date.now()) / 1000));
      el.textContent = Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
      if (s <= 0) { clearInterval(timer); if (onEnd) onEnd(); }
    }
    tick();
    return function () { clearInterval(timer); };
  }

  SG.views.requestDetail = function (params) {
    var id = params.id;
    var req = null;
    var stopTimers = [];
    app.setHeader("Solicitação", "Chamando profissional");
    app.view(ui.skeletonCard(3));
    app.track(function () { stopTimers.forEach(function (f) { f(); }); });

    function load() {
      return api.requests.get(id).then(function (r) {
        if (!r) return SG.router.go("/atividade", true);
        if (r.booking) return SG.router.go("/acompanhar/" + r.booking.id, true);
        req = r;
        app.setHeader(r.title, ui.labels.requestStatus[r.status] || "");
        if (!ui.$("#dispatchArea")) {
          app.view(
            '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/atividade" style="margin-bottom:16px">' +
              SG.icon("arrowLeft", 15) + "Minhas solicitações</a>" +
            '<div class="sg-grid adm-split" id="reqGrid">' +
              '<div id="dispatchArea"></div>' +
              '<div id="reqSummary"></div>' +
            "</div>",
            { className: "app-view--wide" }
          );
        }
        renderSummary(r);
        return api.dispatch.current(r.id).then(render);
      });
    }

    function render(offer) {
      stopTimers.forEach(function (f) { f(); });
      stopTimers = [];
      var area = ui.$("#dispatchArea");
      if (!area) return;
      if (req.status === "cancelled") return paintCancelled(area);
      if (req.status === "no_professional") return paintNoPro(area);
      if (req.status === "awaiting_payment" && offer && offer.status === "accepted") return paintPayment(area, offer);
      return paintSearching(area, offer);
    }

    /* ---- 1. Procurando ----------------------------------------------------- */
    function paintSearching(area, offer) {
      var calling = offer && offer.status === "pending";
      var p = calling ? offer.professional || {} : null;
      area.innerHTML =
        '<div class="sg-card sg-card--pad-lg dispatch">' +
          '<div class="radar">' +
            '<span class="radar__wave"></span><span class="radar__wave"></span>' +
            '<span class="radar__wave"></span><span class="radar__wave"></span>' +
            '<div class="radar__core">' + (calling ? ui.avatar(p, "lg") : SG.brandMark(40)) + "</div>" +
          "</div>" +
          "<h3>" + (calling ? "Chamando " + ui.esc(String(p.full_name || "").split(" ")[0]) + "…" : "Procurando o profissional mais próximo…") + "</h3>" +
          '<p class="sg-muted sg-md dispatch__text">' +
            (calling
              ? "Profissional verificado a " + ui.km(offer.distance_km) + " de você. Ele tem alguns segundos para aceitar; se não puder, chamamos o próximo mais perto."
              : "Estamos chamando os profissionais verificados disponíveis, do mais perto para o mais longe.") +
          "</p>" +
          (calling
            ? '<div class="dispatch__meta">' +
                '<span>' + ui.stars(p.rating, 13) + " " + ui.rating(p.rating || 0) + "</span>" +
                "<span>" + SG.icon("car", 13) + " chega em " + ui.eta(offer.eta_minutes) + "</span>" +
                "<span>" + SG.icon("clock", 13) + ' responde em <b id="dspTimer">—</b></span>' +
              "</div>" +
              (offer.rank > 1 ? '<div class="sg-xs sg-faint" style="margin-top:10px">' + (offer.rank - 1) +
                " profissional(is) mais próximo(s) não puderam atender agora.</div>" : "")
            : '<div class="sg-progress" style="max-width:280px;margin:24px auto 0"><div class="sg-progress__fill dispatch__bar"></div></div>') +
        "</div>" +
        payInfoCard();
      if (calling) {
        stopTimers.push(countdown(ui.$("#dspTimer"), offer.expires_at, function () {
          // a chamada venceu sem resposta: pede o próximo (o servidor confere o prazo)
          api.dispatch.start(req.id).then(function () { load(); });
        }));
      }
    }

    /* ---- 2. Ninguém disponível -------------------------------------------- */
    function paintNoPro(area) {
      area.innerHTML = '<div class="sg-card sg-card--pad-lg" style="text-align:center">' +
        '<div class="idstatus__icon idstatus__icon--danger" style="margin:0 auto 16px">' + SG.icon("alert", 28) + "</div>" +
        "<h3>Nenhum profissional disponível agora</h3>" +
        '<p class="sg-muted sg-md" style="margin-top:8px;max-width:44ch;margin-inline:auto">' +
          "Todos os profissionais da sua região estão ocupados ou offline. Você não foi cobrado.</p>" +
        '<div class="sg-row" style="gap:8px;justify-content:center;margin-top:20px">' +
          '<button class="sg-btn sg-btn--primary" id="dspRetry">' + SG.icon("refresh", 15) + "Tentar novamente</button>" +
        "</div></div>";
      ui.$("#dspRetry").addEventListener("click", function () {
        ui.busy(this, true);
        api.dispatch.start(req.id).then(load).catch(function (e) { ui.toast(SG.explainError(e), { type: "error" }); load(); });
      });
    }

    function paintCancelled(area) {
      area.innerHTML = '<div class="sg-card">' + ui.empty("🚫", "Solicitação cancelada",
        "Nada foi cobrado. Se precisar, faça um novo pedido.",
        '<a class="sg-btn sg-btn--primary" href="#/solicitar">Novo pedido</a>') + "</div>";
    }

    /* ---- 3. Profissional aceitou → pagar ---------------------------------- */
    function paintPayment(area, offer) {
      var p = offer.professional || {};
      var cat = req.category || {};
      var surchargePct = req.urgency === "now" ? Number((SG.config.payments || {}).urgencySurchargePercent || 0) : 0;
      var base = surchargePct ? Math.round(offer.price / (1 + surchargePct / 100) * 100) / 100 : offer.price;
      var methods = (SG.config.payments || {}).methods || ["pix", "card"];
      var method = methods[0];

      area.innerHTML =
        '<div class="sg-card pay-pro">' +
          '<div class="sg-row sg-row--between" style="gap:12px;flex-wrap:wrap">' +
            '<span class="sg-badge sg-badge--success">' + SG.icon("checkCircle", 12) + "Profissional encontrado</span>" +
            '<span class="sg-xs sg-dim">Pague em <b id="payTimer">—</b> para garantir o atendimento</span>' +
          "</div>" +
          '<div class="sg-row" style="gap:14px;margin-top:16px">' + ui.avatar(p, "lg") +
            '<div style="min-width:0">' +
              '<div class="sg-row" style="gap:8px"><span class="sg-strong">' + ui.esc(p.full_name || "") + "</span>" +
                (p.verified ? '<span class="sg-badge sg-badge--brand">' + SG.icon("verified", 12) + "Verificado</span>" : "") + "</div>" +
              '<div class="sg-xs sg-dim" style="margin-top:2px">' + ui.esc(p.headline || "") + "</div>" +
              '<div class="dispatch__meta" style="justify-content:flex-start;margin-top:8px">' +
                '<span>' + ui.stars(p.rating, 13) + " " + ui.rating(p.rating || 0) + "</span>" +
                "<span>" + SG.icon("briefcase", 13) + " " + ui.num(p.jobs_count) + " serviços</span>" +
                "<span>" + SG.icon("pin", 13) + " " + ui.km(offer.distance_km) + "</span>" +
                "<span>" + SG.icon("car", 13) + " chega em " + ui.eta(offer.eta_minutes) + "</span>" +
              "</div>" +
            "</div></div>" +
        "</div>" +

        '<div class="sg-card" style="margin-top:16px">' +
          '<div class="sg-card__head"><span class="sg-card__title">Pagamento</span>' +
            '<span class="sg-xs sg-dim">' + SG.icon("lock", 12) + " pago só pelo ServeGo</span></div>" +
          '<div class="pay-lines">' +
            '<div class="pay-line"><span>' + ui.esc(cat.name || "Serviço") + " · preço fechado</span><span>" + ui.money(base) + "</span></div>" +
            (surchargePct ? '<div class="pay-line"><span>Atendimento imediato (+' + surchargePct + "%)</span><span>" +
              ui.money(offer.price - base) + "</span></div>" : "") +
            '<div class="pay-line pay-line--total"><span>Total</span><span>' + ui.money(offer.price) + "</span></div>" +
          "</div>" +
          '<div class="sg-field__label" style="margin:18px 0 8px">Forma de pagamento</div>' +
          '<div class="pay-methods" id="payMethods">' +
            (methods.indexOf("pix") >= 0 ? methodBtn("pix", "Pix", "Aprovação na hora", "zap", method === "pix") : "") +
            (methods.indexOf("card") >= 0 ? methodBtn("card", "Cartão de crédito", "Em até 12x no checkout seguro", "wallet", method === "card") : "") +
          "</div>" +
          '<div id="payBody"></div>' +
        "</div>" +
        payInfoCard(true);

      stopTimers.push(countdown(ui.$("#payTimer"), req.payment_due_at, function () {
        ui.toast("O prazo para pagar acabou", { type: "error", text: "O profissional foi liberado. Faça um novo pedido." });
        load();
      }));

      function methodBtn(v, title, sub, icon, active) {
        return '<button class="sg-choice pay-method ' + (active ? "is-selected" : "") + '" data-method="' + v + '">' +
          '<span class="pay-method__ic">' + SG.icon(icon, 18) + "</span>" +
          '<span style="text-align:left"><span class="sg-choice__title" style="display:block">' + title + "</span>" +
          '<span class="sg-choice__sub">' + sub + "</span></span></button>";
      }

      function paintPayButton() {
        ui.$("#payBody").innerHTML =
          '<button class="sg-btn sg-btn--primary sg-btn--lg sg-btn--block" id="payGo" style="margin-top:18px">' +
            SG.icon("lock", 16) + "Pagar " + ui.money(offer.price) + (method === "pix" ? " com Pix" : " com cartão") + "</button>" +
          '<p class="sg-xs sg-faint" style="margin-top:10px;text-align:center">O valor fica retido pelo ServeGo e só é repassado ao profissional depois que o serviço for concluído.</p>';
        ui.$("#payGo").addEventListener("click", function () {
          var btn = this;
          ui.busy(btn, true);
          api.payments.create(req.id, method).then(function (pay) {
            if (method === "pix") paintPix(pay); else paintCard(pay);
          }).catch(function (e) {
            ui.busy(btn, false);
            ui.toast(SG.explainError(e), { type: "error" });
            load();
          });
        });
      }

      function paintPix(pay) {
        var img = pay.pix_qr_base64
          ? '<img src="data:image/png;base64,' + pay.pix_qr_base64 + '" width="200" height="200" alt="QR Code Pix">'
          : demoQrSvg(pay.pix_qr_code || pay.id);
        ui.$("#payBody").innerHTML =
          '<div class="pix">' +
            '<div class="pix__qr">' + img + "</div>" +
            '<div class="pix__info">' +
              '<div class="sg-strong">Escaneie o QR Code no app do seu banco</div>' +
              '<div class="sg-sm sg-dim" style="margin-top:4px">ou copie o código Pix:</div>' +
              '<div class="pix__code"><code id="pixCode">' + ui.esc(pay.pix_qr_code || "") + "</code></div>" +
              '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="pixCopy">' + SG.icon("doc", 14) + "Copiar código</button>" +
              '<div class="pix__wait">' + '<span class="sg-spinner"></span>' + "Aguardando a confirmação do banco…</div>" +
              (api.isDemo ? '<button class="sg-btn sg-btn--outline sg-btn--sm" id="pixDemo" style="margin-top:10px">' +
                SG.icon("check", 14) + "Simular pagamento aprovado (demo)</button>" : "") +
            "</div>" +
          "</div>";
        ui.$("#pixCopy").addEventListener("click", function () {
          ui.copy(pay.pix_qr_code || "");
          ui.toast("Código Pix copiado", { type: "success", text: "Cole no app do seu banco para pagar." });
        });
        bindDemoConfirm("#pixDemo", pay);
      }

      function paintCard(pay) {
        ui.$("#payBody").innerHTML =
          '<div class="pix" style="grid-template-columns:1fr">' +
            '<div class="pix__info">' +
              '<div class="sg-strong">Pague no checkout seguro</div>' +
              '<div class="sg-sm sg-dim" style="margin-top:4px">Os dados do cartão são digitados direto no ambiente do processador de pagamentos — o ServeGo nunca vê o número do seu cartão.</div>' +
              (pay.checkout_url
                ? '<a class="sg-btn sg-btn--primary" style="margin-top:14px" href="' + ui.esc(pay.checkout_url) + '" target="_blank" rel="noopener">' +
                  SG.icon("lock", 15) + "Abrir checkout seguro</a>"
                : "") +
              '<div class="pix__wait">' + '<span class="sg-spinner"></span>' + "Aguardando a aprovação do pagamento…</div>" +
              (api.isDemo ? '<button class="sg-btn sg-btn--outline sg-btn--sm" id="cardDemo" style="margin-top:10px">' +
                SG.icon("check", 14) + "Simular cartão aprovado (demo)</button>" : "") +
            "</div>" +
          "</div>";
        bindDemoConfirm("#cardDemo", pay);
      }

      function bindDemoConfirm(sel, pay) {
        var b = ui.$(sel);
        if (!b) return;
        b.addEventListener("click", function () {
          ui.busy(b, true);
          api.payments.demoConfirm(pay.id);
        });
      }

      ui.on(ui.$("#payMethods"), "click", "[data-method]", function (e, el) {
        method = el.getAttribute("data-method");
        ui.$$("#payMethods .pay-method").forEach(function (b) { b.classList.toggle("is-selected", b === el); });
        paintPayButton();
      });

      // já existe cobrança pendente? retoma de onde parou
      api.payments.forRequest(req.id).then(function (list) {
        var pending = list.filter(function (x) { return x.status === "pending"; })[0];
        if (!pending) return paintPayButton();
        method = pending.method;
        ui.$$("#payMethods .pay-method").forEach(function (b) {
          b.classList.toggle("is-selected", b.getAttribute("data-method") === method);
        });
        if (method === "pix") paintPix(pending); else paintCard(pending);
      });
    }

    function payInfoCard(compact) {
      return '<div class="sg-card" style="margin-top:16px">' +
        '<div class="sg-row" style="margin-bottom:10px">' + SG.icon("shield", 18) +
        '<strong class="sg-md">Pagamento protegido</strong></div>' +
        '<ul class="pay-rules">' +
          "<li>Você paga pelo app <b>antes</b> do atendimento — nada de dinheiro ou Pix direto ao profissional.</li>" +
          "<li>O valor fica retido e só é liberado ao profissional quando o serviço termina.</li>" +
          "<li>Cancelou antes de ele sair? <b>Estorno integral.</b></li>" +
          (compact ? "" : "<li>Você só paga depois que um profissional aceitar a chamada.</li>") +
        "</ul></div>";
    }

    function renderSummary(r) {
      ui.$("#reqSummary").innerHTML =
        '<div class="sg-card">' +
          '<div class="sg-row" style="margin-bottom:16px">' +
            '<span class="sg-avatar sg-avatar--lg sg-avatar--cat">' + SG.catIcon(r.category, 22) + "</span>" +
            "<div><div class=\"sg-strong\">" + ui.esc(r.category ? r.category.name : "") + "</div>" +
            '<div class="sg-xs sg-dim">Criada ' + ui.since(r.created_at) + "</div></div></div>" +
          '<p class="sg-md sg-muted sg-break">' + ui.esc(r.description) + "</p>" +
          '<div class="sg-divider"></div>' +
          infoRow("pin", "Local", r.address) +
          infoRow("clock", "Quando", ui.labels.urgency[r.urgency] +
            (r.scheduled_for ? " · " + ui.dateTime(r.scheduled_for) : "")) +
          (r.photos && r.photos.length
            ? '<div class="sg-divider"></div><div class="sg-field__label" style="margin-bottom:10px">Fotos enviadas</div>' +
              '<div class="sg-thumbs">' + r.photos.map(function (p) {
                return '<div class="sg-thumb"><img src="' + p.url + '" alt=""></div>';
              }).join("") + "</div>"
            : "") +
          (["matching", "awaiting_payment", "no_professional", "open"].indexOf(r.status) >= 0
            ? '<div class="sg-divider"></div>' +
              '<button class="sg-btn sg-btn--ghost sg-btn--sm sg-btn--block" data-cancel>Cancelar pedido</button>'
            : "") +
        "</div>";

      var c = ui.$("[data-cancel]");
      if (c) c.addEventListener("click", function () {
        ui.confirm({
          title: "Cancelar pedido?",
          text: "Você ainda não pagou nada, então não há cobrança.",
          okText: "Sim, cancelar", danger: true
        }).then(function (ok) {
          if (!ok) return;
          api.requests.cancel(req.id).then(function () {
            ui.toast("Pedido cancelado", { type: "info" });
            SG.router.go("/atividade");
          });
        });
      });
    }

    function infoRow(icon, label, value) {
      return '<div class="sg-row sg-row--top" style="margin-bottom:12px">' +
        '<span style="color:var(--sg-text-4);margin-top:2px">' + SG.icon(icon, 16) + "</span>" +
        '<div class="sg-break"><div class="sg-xs sg-faint">' + label + "</div>" +
        '<div class="sg-md">' + ui.esc(value || "—") + "</div></div></div>";
    }

    load().then(function () {
      // pedido recém-criado ou chamada vencida: garante que alguém está sendo chamado
      if (req && (req.status === "open" || req.status === "matching")) api.dispatch.start(req.id).then(load);
    });

    app.track(api.dispatch.subscribe(id, function () { load(); }));
    app.track(api.payments.subscribe(id, function (p) {
      if (!p || p.status !== "paid") return;
      ui.toast("Pagamento aprovado!", { type: "success", text: "O profissional já foi avisado." });
      load();
    }));
  };

  /* ==========================================================================
     PROVAS DE DISPUTA (fotos e vídeos)
     ========================================================================== */
  var MAX_EVIDENCE = 8;

  /** Seletor de fotos/vídeos com miniaturas. Devolve { files() }. */
  function evidencePicker(host, opts) {
    opts = opts || {};
    var files = [];
    function paint() {
      host.innerHTML =
        '<div class="ev-pick">' +
          files.map(function (f, i) {
            var url = URL.createObjectURL(f);
            return '<div class="ev-thumb">' +
              (/^video\//.test(f.type)
                ? '<video src="' + url + '" muted></video><span class="ev-thumb__tag">' + SG.icon("camera", 11) + " vídeo</span>"
                : '<img src="' + url + '" alt="">') +
              '<button type="button" class="sg-thumb__remove" data-rm="' + i + '" aria-label="Remover">✕</button></div>';
          }).join("") +
          (files.length < MAX_EVIDENCE
            ? '<label class="ev-add">' + SG.icon("camera", 22) + "<span>" + (files.length ? "Adicionar mais" : "Fotos ou vídeos") + "</span>" +
              '<input type="file" accept="image/*,video/*" multiple hidden></label>'
            : "") +
        "</div>" +
        '<div class="sg-xs sg-faint" style="margin-top:6px">' + files.length + " de " + MAX_EVIDENCE +
          " · fotos ou vídeos de até 50 MB" + (opts.required ? " · <b>obrigatório ao menos 1</b>" : "") + "</div>";
      var input = host.querySelector("input[type=file]");
      if (input) input.addEventListener("change", function () {
        Array.prototype.slice.call(input.files).forEach(function (f) {
          if (files.length >= MAX_EVIDENCE) return;
          if (!/^(image|video)\//.test(f.type)) return ui.toast("Envie apenas fotos ou vídeos", { type: "error" });
          if (/^video\//.test(f.type) && f.size > 50 * 1048576) return ui.toast("Vídeo acima de 50 MB", { type: "error", text: f.name });
          files.push(f);
        });
        paint();
      });
      ui.$$("[data-rm]", host).forEach(function (b) {
        b.addEventListener("click", function () { files.splice(+b.getAttribute("data-rm"), 1); paint(); });
      });
    }
    paint();
    return { files: function () { return files.slice(); } };
  }

  /** Galeria de anexos de um relato (abre em tela cheia ao clicar). */
  function evidenceGallery(list) {
    if (!list || !list.length) return "";
    return '<div class="ev-gallery">' + list.map(function (a) {
      return a.kind === "video"
        ? '<video class="ev-item" src="' + ui.esc(a.url || "") + '" controls preload="metadata"></video>'
        : '<a class="ev-item" href="' + ui.esc(a.url || "") + '" target="_blank" rel="noopener"><img src="' + ui.esc(a.url || "") + '" alt="Prova"></a>';
    }).join("") + "</div>";
  }
  SG.evidence = { picker: evidencePicker, gallery: evidenceGallery };

  var PARTY_LABEL = { client: "Cliente", professional: "Profissional", admin: "Equipe ServeGo" };
  var DISPUTE_STATUS = {
    open: "Em análise", awaiting_info: "Aguardando informações",
    resolved_refund: "Decidida: estorno ao cliente", resolved_release: "Decidida: pagamento ao profissional"
  };
  SG.disputeLabels = { party: PARTY_LABEL, status: DISPUTE_STATUS };

  /* ==========================================================================
     ACOMPANHAMENTO DO SERVIÇO (cliente e profissional)
     ========================================================================== */
  var TIMELINE = [
    { status: "created", label: "Solicitação criada" },
    { status: "matched", label: "Profissional encontrado" },
    { status: "accepted", label: "Profissional aceitou" },
    { status: "on_the_way", label: "A caminho" },
    { status: "arrived", label: "Chegou ao local" },
    { status: "in_progress", label: "Serviço em andamento" },
    { status: "awaiting_confirmation", label: "Profissional concluiu" },
    { status: "completed", label: "Conclusão confirmada pelo cliente" }
  ];

  SG.views.tracking = function (params) {
    var id = params.id;
    var isPro = app.state.role === "professional";
    app.setHeader("Acompanhamento", "Status em tempo real");
    app.view(ui.skeletonCard(2));

    var autoTried = false;
    function load() {
      api.bookings.get(id).then(function (bk) {
        if (!bk) return SG.router.go(isPro ? "/servicos" : "/atividade", true);
        // prazo do cliente vencido: confirma sozinho (o banco também faz via pg_cron)
        if (bk.status === "awaiting_confirmation" && bk.confirm_deadline &&
            new Date(bk.confirm_deadline) < new Date() && !autoTried) {
          autoTried = true;
          return api.bookings.autoConfirmDue().then(load);
        }
        render(bk);
      });
    }

    function stepIndex(bk) {
      var map = { accepted: 2, on_the_way: 3, arrived: 4, in_progress: 5, awaiting_confirmation: 6, disputed: 6, completed: 7, cancelled: 7 };
      return map[bk.status] !== undefined ? map[bk.status] : 2;
    }

    function render(bk) {
      var other = isPro ? bk.client : bk.professional;
      var idx = stepIndex(bk);
      var eventByStatus = {};
      (bk.events || []).forEach(function (e) { eventByStatus[e.status] = e; });

      app.setHeader(bk.request.title, ui.labels.bookingStatus[bk.status]);
      app.view(
        '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#' + (isPro ? "/servicos" : "/atividade") + '" style="margin-bottom:16px">' +
          SG.icon("arrowLeft", 15) + "Voltar</a>" +
        '<div class="sg-grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px" id="trkGrid">' +
          "<div>" +
            '<div class="sg-card" style="margin-bottom:16px">' +
              // o selo desce para baixo do título quando não cabe (celular)
              '<div class="sg-row sg-row--between" style="margin-bottom:20px;flex-wrap:wrap;gap:10px;align-items:flex-start">' +
                '<div class="sg-break" style="flex:1 1 200px;min-width:0">' +
                  '<div class="sg-eyebrow">' + ui.esc(bk.request.category ? bk.request.category.name : "") + "</div>" +
                  '<h3 style="margin-top:6px">' + ui.esc(bk.request.title) + "</h3>" +
                "</div>" + ui.statusBadge(bk.status) +
              "</div>" +
              '<div class="sg-map" style="height:220px;margin-bottom:20px">' +
                '<div class="sg-map__grid"></div>' +
                '<div class="sg-map__badge">' + SG.icon("pin", 12) + " " + ui.esc((bk.request.address || "").split("—")[0]) + "</div>" +
                (idx >= 4 ? "" : '<div class="sg-map__radar"></div><div class="sg-map__radar sg-map__radar--2"></div>') +
                '<div class="sg-map__pin sg-map__pin--me" style="left:34%;top:64%">' +
                  '<div class="sg-map__pin-dot">' + SG.icon("home", 15) + "</div>" +
                  '<div class="sg-map__pin-label">Você</div></div>' +
                '<div class="sg-map__pin" style="left:' + (idx >= 4 ? "58%" : "68%") + ';top:' + (idx >= 4 ? "40%" : "36%") + '">' +
                  '<div class="sg-map__pin-dot">' + SG.icon(isPro ? "user" : "wrench", 15) + "</div>" +
                  '<div class="sg-map__pin-label">' + ui.esc(String(other.full_name).split(" ")[0]) + "</div></div>" +
              "</div>" +
              '<div class="sg-timeline">' + TIMELINE.map(function (s, i) {
                var done = i < idx, current = i === idx;
                var ev = eventByStatus[s.status];
                return '<div class="sg-timeline__item ' + (done ? "is-done" : "") + (current ? " is-current" : "") + '">' +
                  '<div class="sg-timeline__title">' + s.label + "</div>" +
                  '<div class="sg-timeline__time">' +
                    (ev ? ui.dateTime(ev.created_at) : i === 0 ? ui.dateTime(bk.request.created_at) : done ? "concluído" : "aguardando") +
                  "</div></div>";
              }).join("") + "</div>" +
            "</div>" +
            '<div id="trkActions"></div>' +
          "</div>" +
          "<div>" +
            '<div class="sg-card">' +
              '<div class="sg-eyebrow" style="margin-bottom:14px">' + (isPro ? "Cliente" : "Profissional") + "</div>" +
              '<div class="sg-row">' + ui.avatar(other, "lg") +
                '<div style="min-width:0"><div class="sg-strong">' + ui.esc(other.full_name) + "</div>" +
                '<div class="sg-xs sg-dim">' + ui.esc(isPro ? (bk.request.address || "") : (other.headline || "")) + "</div></div></div>" +
              (!isPro ? '<div class="sg-row" style="gap:16px;margin-top:14px">' +
                '<span class="sg-row sg-xs sg-dim" style="gap:5px">' + ui.stars(other.rating, 12) + ui.rating(other.rating) + "</span>" +
                '<span class="sg-row sg-xs sg-dim" style="gap:5px">' + SG.icon("briefcase", 12) + ui.num(other.jobs_count) + " serviços</span></div>" : "") +
              '<div class="sg-row" style="gap:8px;margin-top:18px">' +
                '<a class="sg-btn sg-btn--secondary sg-btn--sm" style="flex:1" href="#/mensagens/' + bk.request_id + '">' +
                  SG.icon("chat", 15) + "Conversar</a>" +
                (!isPro ? '<a class="sg-btn sg-btn--outline sg-btn--sm" href="#/profissional/' + other.id + '">Perfil</a>' : "") +
              "</div>" +
              '<div class="sg-divider"></div>' +
              '<div class="sg-row sg-row--between"><span class="sg-md sg-dim">' + (isPro ? "Valor do serviço" : "Você pagou") + "</span>" +
                '<span class="sg-display" style="font-size:1.25rem">' + ui.money(bk.price) + "</span></div>" +
              payLine(bk.payment, bk) +
              (isPro ? '<div class="sg-row sg-row--between" style="margin-top:8px">' +
                '<span class="sg-sm sg-faint">Taxa ServeGo (' + SG.config.app.platformFeePercent + "%)</span>" +
                '<span class="sg-sm sg-faint">− ' + ui.money(bk.price * SG.config.app.platformFeePercent / 100) + "</span></div>" +
                '<div class="sg-row sg-row--between" style="margin-top:6px"><span class="sg-md sg-strong">Você recebe</span>' +
                '<span class="sg-md sg-strong sg-brand-text">' +
                ui.money(bk.price * (1 - SG.config.app.platformFeePercent / 100)) + "</span></div>" : "") +
            "</div>" +
            '<div class="sg-card" style="margin-top:16px">' +
              '<div class="sg-row" style="margin-bottom:10px">' + SG.icon("shield", 17) + '<strong class="sg-md">Segurança</strong></div>' +
              '<p class="sg-sm sg-dim">Combine tudo pelo chat do ServeGo e nunca pague por fora: telefones e chaves Pix enviados no chat ficam ocultos. Só pagamentos feitos pelo app têm garantia e estorno.</p>' +
              '<button class="sg-btn sg-btn--ghost sg-btn--sm sg-btn--block" style="margin-top:12px" data-report>' +
                SG.icon("flag", 15) + "Denunciar um problema</button>" +
            "</div>" +
          "</div>" +
        "</div>",
        { className: "app-view--wide" }
      );
      if (window.innerWidth < 1000) ui.$("#trkGrid").style.gridTemplateColumns = "minmax(0,1fr)";

      renderActions(bk);
      bindReport(bk);
    }

    function payLine(pay, bk) {
      if (!pay) return "";
      var released = bk && bk.status === "completed";
      var label = {
        paid: released
          ? (isPro ? "Pago · repasse liberado" : "Pago · liberado ao profissional")
          : isPro ? "Pago pelo cliente · liberado quando ele confirmar a conclusão"
                  : "Pago via " + (pay.method === "pix" ? "Pix" : "cartão") + " · retido até você confirmar a conclusão",
        refunded: "Estornado ao cliente",
        pending: "Aguardando pagamento"
      }[pay.status] || pay.status;
      var tone = pay.status === "paid" ? "success" : pay.status === "refunded" ? "danger" : "brand";
      return '<div class="sg-row" style="margin-top:10px"><span class="sg-badge sg-badge--' + tone + '">' +
        SG.icon(pay.status === "paid" ? "lock" : "wallet", 12) + ui.esc(label) + "</span></div>";
    }

    function renderActions(bk) {
      var host = ui.$("#trkActions");
      if (bk.status === "cancelled") {
        host.innerHTML = '<div class="sg-card"><div class="sg-row">' + SG.icon("ban", 18) +
          "<div><strong>Serviço cancelado</strong>" +
          (bk.cancel_reason ? '<div class="sg-sm sg-dim">' + ui.esc(bk.cancel_reason) + "</div>" : "") +
          "</div></div></div>";
        return;
      }

      var net = bk.price * (1 - SG.config.app.platformFeePercent / 100);
      if (bk.status === "disputed") {
        host.innerHTML = '<div class="sg-card">' + ui.skeletonCard(1) + "</div>";
        api.disputes.forBooking(bk.id).then(function (res) { renderDispute(host, bk, res); });
        return;
      }

      if (isPro && bk.status === "awaiting_confirmation") {
        host.innerHTML = '<div class="sg-card sg-card--brand"><div class="sg-row" style="gap:12px;align-items:flex-start">' +
          SG.icon("clock", 20) + "<div><strong>Aguardando o cliente confirmar</strong>" +
          '<div class="sg-sm sg-dim">Você recebe <b>' + ui.money(net) + "</b> assim que ele confirmar" +
          (bk.confirm_deadline ? ", ou automaticamente em " + ui.dateTime(bk.confirm_deadline) : "") + ".</div></div></div></div>";
        return;
      }

      if (isPro && bk.status === "completed") {
        host.innerHTML = '<div class="sg-card"><div class="sg-row" style="gap:12px">' + SG.icon("checkCircle", 20) +
          "<div><strong>Concluído e confirmado</strong>" +
          '<div class="sg-sm sg-dim">' + (bk.confirmed_by === "auto" ? "Confirmado automaticamente no fim do prazo. " : "") +
          ui.money(net) + " liberados para repasse — acompanhe em Ganhos.</div></div></div></div>";
        return;
      }

      if (!isPro && bk.status === "awaiting_confirmation") {
        host.innerHTML = '<div class="sg-card sg-card--brand confirm-card">' +
          '<div class="sg-row" style="gap:12px;align-items:flex-start">' + SG.icon("checkCircle", 22) +
            "<div><strong>" + ui.esc(String(other(bk).full_name || "O profissional").split(" ")[0]) + " marcou o serviço como concluído</strong>" +
            '<div class="sg-sm sg-dim" style="margin-top:4px">Confira se está tudo certo. O pagamento de <b>' + ui.money(bk.price) +
            "</b> só é liberado ao profissional depois da sua confirmação." +
            (bk.confirm_deadline ? " Sem resposta até <b>" + ui.dateTime(bk.confirm_deadline) + "</b>, confirmamos automaticamente." : "") +
            "</div></div></div>" +
          '<div class="sg-row" style="gap:8px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap">' +
            '<button class="sg-btn sg-btn--ghost" data-problem>' + SG.icon("alert", 15) + "Tive um problema</button>" +
            '<button class="sg-btn sg-btn--primary" data-confirm-done>' + SG.icon("check", 15) + "Confirmar conclusão</button>" +
          "</div></div>";
      } else if (isPro) {
        var next = { accepted: "on_the_way", on_the_way: "arrived", arrived: "in_progress", in_progress: "awaiting_confirmation" }[bk.status];
        var labels = {
          on_the_way: "Estou a caminho", arrived: "Cheguei ao local",
          in_progress: "Iniciar o serviço", awaiting_confirmation: "Concluir serviço"
        };
        host.innerHTML = '<div class="sg-card">' +
          '<div class="sg-row sg-row--between" style="gap:12px;flex-wrap:wrap">' +
            '<div><strong class="sg-md">Atualize o cliente</strong>' +
            '<div class="sg-sm sg-dim">Manter o status atualizado aumenta sua nota de confiança.</div></div>' +
            '<div class="sg-row" style="gap:8px">' +
              (next ? '<button class="sg-btn sg-btn--primary" data-next="' + next + '">' + labels[next] + "</button>" : "") +
              (bk.status === "accepted" ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-cancel>Cancelar</button>' : "") +
            "</div></div></div>";
      } else if (bk.status === "completed" && !bk.review) {
        host.innerHTML = '<div class="sg-card sg-card--brand">' +
          '<div class="sg-row sg-row--between" style="gap:12px;flex-wrap:wrap">' +
            "<div><strong>Como foi o serviço?</strong>" +
            '<div class="sg-sm sg-dim">Sua avaliação ajuda outros clientes a escolherem melhor.</div></div>' +
            '<button class="sg-btn sg-btn--primary" data-review>Avaliar profissional</button></div></div>';
      } else if (bk.status === "completed" && bk.review) {
        host.innerHTML = '<div class="sg-card"><div class="sg-row" style="gap:12px">' +
          ui.stars(bk.review.rating, 18) +
          '<span class="sg-md sg-muted sg-break">' + ui.esc(bk.review.comment || "Você já avaliou este serviço.") + "</span></div></div>";
      } else {
        host.innerHTML = '<div class="sg-card">' +
          '<div class="sg-row sg-row--between" style="gap:12px;flex-wrap:wrap">' +
            "<div><strong class=\"sg-md\">Precisa de algo?</strong>" +
            '<div class="sg-sm sg-dim">' + (bk.status === "accepted"
              ? "Ainda dá para cancelar com estorno integral: o profissional não saiu."
              : "O profissional já está a caminho. Para cancelar, abra uma disputa.") + "</div></div>" +
            '<div class="sg-row" style="gap:8px">' +
              '<a class="sg-btn sg-btn--secondary sg-btn--sm" href="#/mensagens/' + bk.request_id + '">Abrir chat</a>' +
              (bk.status === "accepted"
                ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-cancel>Cancelar e receber estorno</button>'
                : '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-dispute>Abrir disputa</button>') +
            "</div></div></div>";
      }

      var nextBtn = ui.$("[data-next]", host);
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          var to = nextBtn.getAttribute("data-next");
          var go = function () {
            ui.busy(nextBtn, true);
            api.bookings.updateStatus(bk.id, to).then(function () {
              ui.toast(to === "awaiting_confirmation" ? "Serviço marcado como concluído" : "Status atualizado", {
                type: "success",
                text: to === "awaiting_confirmation" ? "O cliente vai confirmar. Depois disso o pagamento é liberado a você." : ""
              });
              load();
            }).catch(function (e) {
              ui.busy(nextBtn, false);
              ui.toast(SG.explainError(e), { type: "error" });
            });
          };
          if (to !== "awaiting_confirmation") return go();
          ui.confirm({
            title: "Concluir o serviço?",
            text: "O cliente vai receber um aviso para confirmar. O pagamento é liberado a você quando ele confirmar.",
            okText: "Concluir serviço"
          }).then(function (ok) { if (ok) go(); });
        });
      }
      var cancelBtn = ui.$("[data-cancel]", host);
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function () {
          var paid = bk.payment && bk.payment.status === "paid";
          ui.confirm({
            title: "Cancelar este serviço?",
            text: (paid ? "O cliente recebe estorno integral de " + ui.money(bk.payment.amount) + ". " : "") +
              "Cancelamentos frequentes afetam a reputação no ServeGo.",
            okText: "Sim, cancelar", danger: true
          }).then(function (ok) {
            if (!ok) return;
            ui.busy(cancelBtn, true);
            api.bookings.cancel(bk.id, "Cancelado pelo " + (isPro ? "profissional" : "cliente")).then(function () {
              ui.toast("Serviço cancelado", { type: "info", text: paid ? "Estorno integral solicitado." : "" });
              load();
            }).catch(function (e) {
              ui.busy(cancelBtn, false);
              ui.toast(SG.explainError(e), { type: "error" });
            });
          });
        });
      }
      var disputeBtn = ui.$("[data-dispute]", host);
      if (disputeBtn) disputeBtn.addEventListener("click", function () {
        if (["arrived", "in_progress"].indexOf(bk.status) >= 0) openDispute(bk);
        else ui.$("[data-report]").click();
      });

      var doneBtn = ui.$("[data-confirm-done]", host);
      if (doneBtn) doneBtn.addEventListener("click", function () {
        ui.confirm({
          title: "Confirmar que o serviço foi concluído?",
          text: "Ao confirmar, " + ui.money(bk.price) + " são liberados ao profissional. Depois disso não é possível pedir estorno pelo app.",
          okText: "Sim, foi concluído"
        }).then(function (ok) {
          if (!ok) return;
          ui.busy(doneBtn, true);
          api.bookings.confirmCompletion(bk.id).then(function () {
            ui.toast("Conclusão confirmada", { type: "success", text: "Obrigado! Agora avalie o profissional." });
            load();
          }).catch(function (e) {
            ui.busy(doneBtn, false);
            ui.toast(SG.explainError(e), { type: "error" });
          });
        });
      });

      var problemBtn = ui.$("[data-problem]", host);
      if (problemBtn) problemBtn.addEventListener("click", function () { openDispute(bk); });
      var reviewBtn = ui.$("[data-review]", host);
      if (reviewBtn) reviewBtn.addEventListener("click", function () { openReview(bk); });
    }

    function other(bk) { return (isPro ? bk.client : bk.professional) || {}; }

    function openDispute(bk) {
      var m = ui.modal({
        title: "O que aconteceu?",
        size: "lg",
        body:
          '<p class="sg-sm sg-dim" style="margin-bottom:14px">O pagamento continua retido. Envie <b>fotos ou vídeos</b> do problema: ' +
            "é com eles que nossa equipe decide se o valor volta para você (estorno integral) ou vai para o profissional.</p>" +
          '<div class="sg-field"><label class="sg-field__label" for="dpReason">Motivo</label>' +
          '<select class="sg-select" id="dpReason">' +
            ["Serviço não foi concluído", "Serviço mal executado", "O problema voltou", "Cobrança diferente do combinado", "Danos no local", "Outro"]
              .map(function (r) { return "<option>" + r + "</option>"; }).join("") +
          "</select></div>" +
          '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="dpDesc">Conte os detalhes</label>' +
          '<textarea class="sg-textarea" id="dpDesc" placeholder="O que ficou faltando ou deu errado? Quando você percebeu?"></textarea></div>' +
          '<div class="sg-field" style="margin-top:14px"><div class="sg-field__label">Provas</div><div id="dpFiles"></div></div>',
        footer: '<button class="sg-btn sg-btn--ghost" data-close>Voltar</button>' +
          '<button class="sg-btn sg-btn--danger" data-send>Enviar para análise</button>'
      });
      var picker = evidencePicker(ui.$("#dpFiles", m.el), { required: true });
      m.el.querySelector("[data-send]").addEventListener("click", function () {
        var btn = this;
        var desc = ui.$("#dpDesc", m.el).value.trim();
        var files = picker.files();
        if (desc.length < 10) return ui.toast("Descreva o problema", { type: "error", text: "Isso ajuda nossa equipe a decidir rápido." });
        if (!files.length) return ui.toast("Envie ao menos uma foto ou vídeo", { type: "error", text: "Sem provas não é possível analisar o caso." });
        ui.busy(btn, true);
        api.disputes.upload(bk.id, files).then(function (att) {
          return api.bookings.openDispute(bk.id, ui.$("#dpReason", m.el).value, desc, att);
        }).then(function () {
          m.close();
          ui.toast("Disputa aberta", { type: "info", text: "Recebemos suas provas. O pagamento fica retido até a análise." });
          load();
        }).catch(function (e) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(e), { type: "error" });
        });
      });
    }

    /** Andamento da disputa: relatos, provas, pedido de informação e envio de nova prova. */
    function renderDispute(host, bk, res) {
      if (!res) {
        host.innerHTML = '<div class="sg-card">' + ui.empty("⚖️", "Disputa em análise", "O pagamento continua retido.") + "</div>";
        return;
      }
      var d = res.dispute, entries = res.entries || [];
      var myParty = isPro ? "professional" : "client";
      var asked = d.status === "awaiting_info" && d.info_requested_from === myParty;
      var proAnswered = entries.some(function (e) { return e.party === "professional"; });
      var canAdd = ["open", "awaiting_info"].indexOf(d.status) >= 0;

      host.innerHTML =
        '<div class="sg-card dispute-card">' +
          '<div class="sg-row sg-row--between" style="gap:10px;flex-wrap:wrap">' +
            '<div class="sg-row" style="gap:10px">' + SG.icon("alert", 20) +
              "<div><strong>Disputa: " + ui.esc(d.reason) + "</strong>" +
              '<div class="sg-xs sg-dim">' + ui.money(d.amount) + " retidos · aberta " + ui.timeAgo(d.created_at) + "</div></div></div>" +
            '<span class="sg-badge sg-badge--' + (asked ? "danger" : "brand") + '">' + ui.esc(DISPUTE_STATUS[d.status] || d.status) + "</span>" +
          "</div>" +
          (asked
            ? '<div class="idnotice idnotice--danger" style="margin:14px 0 0">' + SG.icon("alert", 18) +
              '<div><div class="sg-md sg-strong">A equipe ServeGo pediu mais informações a você</div><div class="sg-sm">' +
              ui.esc(d.info_request || "") + "</div></div></div>"
            : isPro && !proAnswered && canAdd
              ? '<div class="idnotice" style="margin:14px 0 0">' + SG.icon("shield", 18) +
                '<div class="sg-sm">O cliente relatou um problema e enviou provas. <b>Envie a sua versão</b> com fotos ou vídeos do serviço — ' +
                "isso pesa na decisão sobre o pagamento.</div></div>"
              : '<p class="sg-sm sg-dim" style="margin-top:12px">' + (isPro
                  ? "O pagamento fica retido até a equipe ServeGo analisar as provas dos dois lados."
                  : "Nossa equipe analisa em até 48 h. Se der razão a você, o estorno é integral.") + "</p>") +
          '<div class="dispute-feed">' + entries.map(function (e) {
            var mine = e.party === myParty;
            return '<div class="dispute-entry dispute-entry--' + e.party + '">' +
              '<div class="sg-xs sg-strong">' + (mine ? "Você" : PARTY_LABEL[e.party]) +
                ' <span class="sg-faint" style="font-weight:400">· ' + ui.dateTime(e.created_at) + "</span></div>" +
              (e.note ? '<p class="sg-sm sg-break" style="margin-top:4px">' + ui.esc(e.note) + "</p>" : "") +
              evidenceGallery(e.attachments) +
            "</div>";
          }).join("") + "</div>" +
          (canAdd
            ? '<button class="sg-btn ' + (asked || (isPro && !proAnswered) ? "sg-btn--primary" : "sg-btn--secondary") + ' sg-btn--sm" data-add-evidence style="margin-top:14px">' +
              SG.icon("camera", 14) + (isPro && !proAnswered ? "Enviar minha versão" : "Enviar mais provas") + "</button>"
            : "") +
        "</div>";

      var add = host.querySelector("[data-add-evidence]");
      if (add) add.addEventListener("click", function () {
        var m = ui.modal({
          title: isPro && !proAnswered ? "Sua versão do serviço" : "Enviar mais provas",
          size: "lg",
          body:
            (asked ? '<div class="idnotice" style="margin:0 0 14px">' + SG.icon("alert", 16) + '<div class="sg-sm">' + ui.esc(d.info_request || "") + "</div></div>" : "") +
            '<div class="sg-field"><label class="sg-field__label" for="evNote">Relato</label>' +
            '<textarea class="sg-textarea" id="evNote" placeholder="' + (isPro
              ? "O que foi feito, o que estava combinado, como ficou ao final…"
              : "Explique o que as fotos ou vídeos mostram…") + '"></textarea></div>' +
            '<div class="sg-field" style="margin-top:14px"><div class="sg-field__label">Fotos ou vídeos</div><div id="evFiles"></div></div>',
          footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button>' +
            '<button class="sg-btn sg-btn--primary" data-send>Enviar</button>'
        });
        var picker = evidencePicker(ui.$("#evFiles", m.el), { required: isPro && !proAnswered });
        m.el.querySelector("[data-send]").addEventListener("click", function () {
          var btn = this;
          var note = ui.$("#evNote", m.el).value.trim();
          var files = picker.files();
          if (isPro && !proAnswered && !files.length) return ui.toast("Envie ao menos uma foto ou vídeo do serviço", { type: "error" });
          if (!note && !files.length) return ui.toast("Escreva um relato ou anexe provas", { type: "error" });
          ui.busy(btn, true);
          api.disputes.upload(bk.id, files).then(function (att) {
            return api.disputes.addEntry(d.id, note, att);
          }).then(function () {
            m.close();
            ui.toast("Enviado para análise", { type: "success" });
            load();
          }).catch(function (e) {
            ui.busy(btn, false);
            ui.toast(SG.explainError(e), { type: "error" });
          });
        });
      });
    }

    function openReview(bk) {
      var rating = 5;
      var tags = [];
      var TAGS = ["Pontual", "Caprichoso", "Preço justo", "Educado", "Resolutivo", "Limpo"];
      var m = ui.modal({
        title: "Avaliar " + bk.professional.full_name,
        body:
          '<div style="text-align:center">' +
            '<div class="sg-rate" id="rateStars"></div>' +
            '<div class="sg-md sg-dim" id="rateLabel" style="margin-top:10px">Excelente</div>' +
          "</div>" +
          '<div class="sg-divider"></div>' +
          '<div class="sg-field__label" style="margin-bottom:10px">O que se destacou?</div>' +
          '<div class="sg-row sg-row--wrap" id="rateTags" style="gap:8px">' +
            TAGS.map(function (t) { return '<button class="sg-chip" data-tag="' + t + '">' + t + "</button>"; }).join("") +
          "</div>" +
          '<div class="sg-field" style="margin-top:20px"><label class="sg-field__label">Comentário (opcional)</label>' +
          '<textarea class="sg-textarea" id="rateComment" placeholder="Conte como foi o atendimento…"></textarea></div>',
        footer: '<button class="sg-btn sg-btn--ghost" data-close>Agora não</button>' +
          '<button class="sg-btn sg-btn--primary" data-send>Enviar avaliação</button>'
      });

      function paintStars() {
        ui.$("#rateStars").innerHTML = [1, 2, 3, 4, 5].map(function (i) {
          return '<button class="' + (i <= rating ? "is-on" : "") + '" data-star="' + i + '">' + SG.starIcon(i <= rating, 34) + "</button>";
        }).join("");
        var labels = { 1: "Ruim", 2: "Regular", 3: "Bom", 4: "Muito bom", 5: "Excelente" };
        ui.$("#rateLabel").textContent = labels[rating];
        ui.$$("#rateStars [data-star]").forEach(function (b) {
          b.addEventListener("click", function () { rating = +b.getAttribute("data-star"); paintStars(); });
        });
      }
      paintStars();

      ui.on(m.el, "click", "[data-tag]", function (e, el) {
        var t = el.getAttribute("data-tag");
        var i = tags.indexOf(t);
        if (i >= 0) { tags.splice(i, 1); el.classList.remove("is-active"); }
        else { tags.push(t); el.classList.add("is-active"); }
      });

      m.el.querySelector("[data-send]").addEventListener("click", function () {
        var btn = this;
        ui.busy(btn, true);
        api.reviews.create({
          booking_id: bk.id, request_id: bk.request_id, client_id: bk.client_id,
          professional_id: bk.professional_id, rating: rating,
          comment: ui.$("#rateComment").value.trim() || null, tags: tags
        }).then(function () {
          m.close();
          ui.toast("Avaliação enviada. Obrigado!", { type: "success" });
          load();
        });
      });
    }

    function bindReport(bk) {
      ui.$("[data-report]").addEventListener("click", function () {
        var m = ui.modal({
          title: "Denunciar um problema",
          body:
            '<div class="sg-field"><label class="sg-field__label">Motivo</label>' +
            '<select class="sg-select" id="rpReason">' +
              ["Não compareceu", "Serviço mal executado", "Cobrança indevida", "Comportamento inadequado", "Outro"]
                .map(function (r) { return "<option>" + r + "</option>"; }).join("") +
            "</select></div>" +
            '<div class="sg-field" style="margin-top:16px"><label class="sg-field__label">Descreva o que aconteceu</label>' +
            '<textarea class="sg-textarea" id="rpDesc" placeholder="Quanto mais detalhes, mais rápido conseguimos ajudar."></textarea></div>',
          footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button>' +
            '<button class="sg-btn sg-btn--danger" data-send>Enviar denúncia</button>'
        });
        m.el.querySelector("[data-send]").addEventListener("click", function () {
          ui.busy(this, true);
          api.reports.create({
            reporter_id: app.state.me.id,
            target_user_id: isPro ? bk.client_id : bk.professional_id,
            booking_id: bk.id,
            reason: ui.$("#rpReason").value,
            description: ui.$("#rpDesc").value.trim()
          }).then(function () {
            m.close();
            ui.toast("Denúncia registrada", { type: "success", text: "Nossa equipe vai analisar em até 24h." });
          });
        });
      });
    }

    load();
    app.track(api.bookings.subscribe(id, function () { load(); }));
  };

  /* ==========================================================================
     FAVORITOS
     ========================================================================== */
  SG.views.favorites = function () {
    app.setHeader("Favoritos", "Profissionais que você salvou");
    app.view('<div class="app-page-head"><h1>Profissionais favoritos</h1>' +
      "<p>Chame de novo quem já resolveu bem.</p></div>" +
      '<div id="favList">' + ui.skeletonCard(2) + "</div>");
    api.favorites.list(app.state.me.id).then(function (list) {
      ui.$("#favList").innerHTML = list.length
        ? '<div class="sg-grid sg-grid--3">' + list.map(miniProCard).join("") + "</div>"
        : ui.empty("♡", "Nenhum favorito ainda",
            "Salve um profissional no perfil dele para chamá-lo com um toque na próxima vez.",
            '<a class="sg-btn sg-btn--primary" href="#/categorias">Explorar categorias</a>');
    });
  };

  /* ==========================================================================
     AJUDA
     ========================================================================== */
  SG.views.help = function () {
    app.setHeader("Ajuda e suporte", "Estamos por aqui");
    // contatos e textos legais vêm de Admin → Controles do app
    var st = SG.settings || {};
    var supportEmail = st.support_email || SG.config.app.supportEmail;
    var whats = String(st.support_whatsapp || "").replace(/\D/g, "");
    var faqs = [
      ["Como funciona o pagamento?", "Como no Uber: você pede, o profissional verificado mais próximo aceita e você vê o preço fechado. Aí paga pelo app (Pix ou cartão) antes do atendimento. O valor fica retido e só é liberado ao profissional quando o serviço termina. A ServeGo retém " + SG.config.app.platformFeePercent + "% de cada serviço."],
      ["Posso pagar direto ao profissional?", "Não. Todo pagamento é feito pelo app — é isso que garante estorno, garantia e suporte. Telefones e chaves Pix enviados no chat ficam ocultos automaticamente."],
      ["E se eu cancelar?", "Se cancelar antes de o profissional sair para o atendimento, você recebe estorno integral. Depois disso, abra uma disputa pelo app e nossa equipe analisa."],
      ["E se o profissional não aparecer?", "Você pode cancelar sem custo e abrir uma denúncia. O profissional perde pontos de confiança e pode ser suspenso."],
      ["Como sei que o profissional é confiável?", "Todo profissional passa por verificação de documentos. O selo Verificado só aparece após aprovação da nossa equipe."],
      ["Posso remarcar um serviço?", "Sim. Combine a nova data pelo chat — o histórico fica registrado para sua segurança."],
      ["Como me torno um profissional ServeGo?", "Crie uma conta escolhendo “Sou profissional”, envie seus documentos e escolha suas especialidades."]
    ];
    app.view('<div class="app-page-head"><h1>Ajuda e suporte</h1><p>Dúvidas frequentes e canais de atendimento.</p></div>' +
      '<div class="sg-grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:24px">' +
        '<div class="sg-stack">' + faqs.map(function (f) {
          return '<div class="sg-card"><strong class="sg-md">' + f[0] + "</strong>" +
            '<p class="sg-sm sg-dim" style="margin-top:8px">' + f[1] + "</p></div>";
        }).join("") + "</div>" +
        '<div><div class="sg-card">' +
          '<div class="sg-row" style="margin-bottom:12px">' + SG.icon("mail", 18) + "<strong>Fale com a gente</strong></div>" +
          '<p class="sg-sm sg-dim">Respondemos em até 24 horas úteis.</p>' +
          '<a class="sg-btn sg-btn--primary sg-btn--block" style="margin-top:16px" href="mailto:' +
            ui.esc(supportEmail) + '">' + ui.esc(supportEmail) + "</a>" +
          (whats ? '<a class="sg-btn sg-btn--secondary sg-btn--block" style="margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/55' +
            ui.esc(whats) + '">' + SG.icon("chat", 15) + "WhatsApp do suporte</a>" : "") +
        "</div>" +
        '<div class="sg-card" style="margin-top:16px"><div class="sg-row" style="margin-bottom:12px">' +
          SG.icon("alert", 18) + "<strong>Emergência</strong></div>" +
          '<p class="sg-sm sg-dim">Para riscos imediatos (vazamento de gás, curto-circuito, alagamento), marque a urgência como “Agora” ao solicitar — priorizamos o envio para profissionais de plantão.</p></div>' +
        (st.terms_text || st.privacy_text
          ? '<div class="sg-card" style="margin-top:16px"><div class="sg-row" style="margin-bottom:12px">' + SG.icon("doc", 18) + "<strong>Termos e privacidade</strong></div>" +
            (st.terms_text ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-legal="terms_text">Termos de uso</button>' : "") +
            (st.privacy_text ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-legal="privacy_text">Política de privacidade</button>' : "") + "</div>"
          : "") +
        "</div>" +
      "</div>", { className: "app-view--wide" });

    ui.$$("[data-legal]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-legal");
        ui.modal({ title: key === "terms_text" ? "Termos de uso" : "Política de privacidade", size: "lg",
          body: '<div class="sg-sm sg-break" style="white-space:pre-wrap">' + ui.esc(st[key]) + "</div>",
          footer: '<button class="sg-btn sg-btn--primary" data-close>Fechar</button>' });
      });
    });
  };
})(window.SG);
