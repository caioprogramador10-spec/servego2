/* ==========================================================================
   ServeGo — Fluxo de solicitação de serviço (6 etapas)
   A solicitação é tratada como uma "ordem de serviço": um ticket picotado
   que se preenche ao vivo ao lado do formulário e vira a peça central
   na etapa de revisão.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api, app = SG.app;
  SG.views = SG.views || {};

  var STEPS = [
    { key: "category", label: "Serviço", title: "O que você precisa?", sub: "Escolha a categoria mais próxima do seu problema." },
    { key: "describe", label: "Detalhes", title: "Conte o que aconteceu", sub: "Quanto mais claro, mais rápido o profissional resolve." },
    { key: "location", label: "Local", title: "Onde será o serviço?", sub: "Usamos o endereço para encontrar profissionais próximos." },
    { key: "photos", label: "Fotos", title: "Adicione fotos", sub: "Opcional, mas reduz muito o vai e vem com o profissional." },
    { key: "when", label: "Quando", title: "Quando você precisa?", sub: "Urgências são priorizadas para profissionais de plantão." },
    { key: "review", label: "Revisão", title: "Revise sua solicitação", sub: "Confira os dados antes de chamar o profissional mais próximo." }
  ];
  var STEP_INDEX = {};
  STEPS.forEach(function (s, i) { STEP_INDEX[s.key] = i; });

  var WHEN = [
    ["now", "Agora", "Emergência — priorizamos profissionais de plantão", "⚡"],
    ["today", "Ainda hoje", "Atendimento no mesmo dia", "🕐"],
    ["tomorrow", "Amanhã", "Você combina o horário no chat", "📅"],
    ["scheduled", "Escolher data", "Agende para o dia que preferir", "🗓"]
  ];
  var STAMP = { now: "Urgente", today: "Hoje", tomorrow: "Amanhã", scheduled: "Agendado" };
  var MAX_PHOTOS = 5;

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  SG.views.requestFlow = function (params, query) {
    var step = 0;
    var reached = 0;         // etapa mais avançada já visitada
    var stampFresh = false;  // anima o carimbo só quando a urgência muda
    var catQuery = "";
    var files = [];
    var previews = [];
    var serial = "SG-" + Date.now().toString(36).slice(-6).toUpperCase();
    var form = {
      category_id: (query && query.cat) || null,
      title: "", description: "",
      address: "",
      address_complement: "",
      urgency: "today", scheduled_for: null, scheduled_local: ""
    };
    var categories = [];

    app.setHeader("Solicitar serviço", "Passo a passo");
    app.view('<div id="flowRoot">' + ui.skeletonCard(2) + "</div>");

    api.categories.list().then(function (cats) {
      categories = cats;
      if (form.category_id) step = reached = 1;
      render();
    });

    function currentCat() {
      return categories.filter(function (c) { return c.id === form.category_id; })[0] || null;
    }

    function goTo(i) {
      step = i;
      if (i > reached) reached = i;
      render();
      window.scrollTo({ top: 0 });
    }

    /* ---- Trilho de etapas ------------------------------------------------ */
    function rail() {
      return '<nav class="flow-rail" aria-label="Etapas da solicitação">' + STEPS.map(function (s, i) {
        var state = i === step ? "is-active" : i < step ? "is-done" : (i <= reached ? "is-seen" : "");
        var canJump = i !== step && i <= reached;
        return '<button type="button" class="flow-rail__seg ' + state + '" ' +
          (canJump ? 'data-goto="' + i + '"' : "disabled") +
          (i === step ? ' aria-current="step"' : "") + ">" +
          '<span class="flow-rail__num">' + (i < step ? SG.icon("check", 12) : pad(i + 1)) + "</span>" +
          '<span class="flow-rail__label">' + s.label + "</span></button>";
      }).join("") + "</nav>";
    }

    /* ---- Ticket: a ordem de serviço --------------------------------------- */
    function blank(w) { return '<span class="ticket__blank" style="width:' + w + '%"></span>'; }

    function row(key, label, valueHtml, filled, full, quiet) {
      var active = !full && !quiet && STEPS[step].key === key;
      return '<div class="ticket__row' + (active ? " is-active" : "") + (filled ? "" : " is-empty") + '">' +
        '<div class="ticket__label">' + label + "</div>" +
        '<div class="ticket__value">' + valueHtml + "</div>" +
        (full ? '<button type="button" class="ticket__edit" data-goto="' + STEP_INDEX[key] + '">Editar</button>' : "") +
        "</div>";
    }

    function ticket(full) {
      var cat = currentCat();
      var showWhen = reached >= STEP_INDEX.when;
      var whenText = ui.labels.urgency[form.urgency] +
        (form.urgency === "scheduled" && form.scheduled_for ? " · " + ui.dateTime(form.scheduled_for) : "");
      var addr = form.address
        ? ui.esc(form.address) + (form.address_complement ? '<span class="ticket__soft"> · ' + ui.esc(form.address_complement) + "</span>" : "")
        : "";
      var photos = previews.length
        ? '<div class="ticket__photos">' + previews.map(function (src) {
            return '<img src="' + src + '" alt="">';
          }).join("") + '<span class="ticket__soft">' + previews.length + (previews.length > 1 ? " fotos" : " foto") + "</span></div>"
        : "";

      var stamp = "";
      if (showWhen) {
        stamp = '<span class="ticket__stamp ticket__stamp--' + form.urgency + (stampFresh ? " is-fresh" : "") + '">' +
          STAMP[form.urgency] + "</span>";
      }

      return '<div class="ticket-wrap' + (full ? " ticket-wrap--full" : "") + '">' +
        '<article class="ticket' + (full ? " ticket--full" : "") + '">' +
          '<div class="ticket__body">' +
            '<header class="ticket__head">' +
              '<span class="ticket__kicker">Ordem de serviço</span>' +
              '<span class="ticket__serial">Nº ' + serial + "</span>" +
            "</header>" +
            '<div class="ticket__hero">' +
              '<span class="ticket__icon">' + SG.catIcon(cat, 26) + "</span>" +
              '<div class="ticket__heading">' +
                '<div class="ticket__title">' + (form.title ? ui.esc(form.title) : (cat ? ui.esc(cat.name) : blank(70))) + "</div>" +
                '<div class="ticket__cat">' + (cat ? ui.esc(cat.name) : "Escolha um serviço") + "</div>" +
              "</div>" + stamp +
            "</div>" +
            '<div class="ticket__rows">' +
              row("describe", "Descrição",
                form.description
                  ? '<span class="' + (full ? "ticket__text" : "ticket__text sg-clamp-3") + '">' + ui.esc(form.description) + "</span>"
                  : blank(92) + blank(58), !!form.description, full) +
              row("location", "Endereço", addr || blank(74), !!addr, full) +
              row("photos", "Fotos", photos || (reached >= STEP_INDEX.photos ? '<span class="ticket__soft">Nenhuma</span>' : blank(36)),
                !!photos || reached >= STEP_INDEX.photos, full) +
              row("when", "Quando", showWhen ? ui.esc(whenText) : blank(44), showWhen, full) +
              row("category", "Preço estimado", priceRange(cat) || blank(30), !!cat, full, true) +
            "</div>" +
          "</div>" +
          '<footer class="ticket__stub">' +
            (full
              ? '<div class="ticket__code"><span class="ticket__barcode"></span>' +
                  '<span class="ticket__serial">' + serial + " · via do cliente</span></div>" +
                '<button class="sg-btn sg-btn--primary sg-btn--lg" id="btnNext">Chamar profissional' +
                  SG.icon("arrowRight", 16) + "</button>"
              : '<div><div class="ticket__kicker">Rascunho</div>' +
                  '<div class="ticket__progress"><b>' + pad(step + 1) + "</b> / " + pad(STEPS.length) +
                  " · " + STEPS[step].label + "</div></div>" +
                '<span class="ticket__barcode"></span>') +
          "</footer>" +
        "</article></div>";
    }

    /** Faixa da categoria + adicional de urgência; o valor exato vem quando o profissional aceita. */
    function priceRange(cat) {
      if (!cat || !cat.price_from) return "";
      var pct = form.urgency === "now" ? Number((SG.config.payments || {}).urgencySurchargePercent || 0) : 0;
      var k = 1 + pct / 100;
      return ui.money(cat.price_from * k, true) + " – " + ui.money(cat.price_to * k, true) +
        '<span class="ticket__soft"> · valor fechado antes de pagar</span>';
    }

    function refreshTicket() {
      var host = ui.$("#flowTicket");
      if (host) host.innerHTML = ticket(false);
    }

    /* ---- Render ---------------------------------------------------------- */
    function render() {
      var s = STEPS[step];
      var review = s.key === "review";
      ui.$("#flowRoot").innerHTML =
        '<div class="flow' + (review ? " flow--review" : "") + '">' +
          '<div class="flow__top">' + rail() + "</div>" +
          '<div class="flow__main">' +
            '<div class="app-page-head flow__head"><h1>' + s.title + "</h1><p>" + s.sub + "</p></div>" +
            '<div id="stepBody" class="sg-anim">' + body() + "</div>" +
            '<div class="flow__actions">' +
              '<button class="sg-btn sg-btn--ghost" id="btnBack" ' + (step === 0 ? "disabled" : "") + ">" +
                SG.icon("arrowLeft", 16) + "Voltar</button>" +
              (review ? "" :
                '<button class="sg-btn sg-btn--primary sg-btn--lg" id="btnNext">Continuar' +
                  SG.icon("arrowRight", 16) + "</button>") +
            "</div>" +
          "</div>" +
          '<aside class="flow__aside">' +
            (review ? nextSteps() : '<div id="flowTicket">' + ticket(false) + "</div>" +
              '<p class="flow__aside-note">Sua ordem de serviço se preenche conforme você avança.</p>') +
          "</aside>" +
        "</div>";
      stampFresh = false;
      bind();
    }

    function nextSteps() {
      var items = [
        ["Chamamos o mais próximo", "O profissional verificado e disponível mais perto de você recebe a chamada."],
        ["Você paga pelo app", "Preço fechado, Pix ou cartão. O valor fica retido até o serviço terminar."],
        ["Ele vai até você", "Acompanhe em tempo real. Cancelou antes de ele sair? Estorno integral."]
      ];
      return '<div class="flow-next">' +
        '<div class="flow-next__title">' + SG.icon("zap", 16) + "O que acontece agora</div>" +
        '<ol class="flow-next__list">' + items.map(function (it, i) {
          return '<li class="flow-next__item"><span class="flow-next__dot">' + (i + 1) + "</span>" +
            "<div><strong>" + it[0] + "</strong><span>" + it[1] + "</span></div></li>";
        }).join("") + "</ol></div>";
    }

    function catTiles() {
      var q = catQuery.toLowerCase();
      var list = categories.filter(function (c) {
        return !q || (c.name + " " + (c.description || "")).toLowerCase().indexOf(q) > -1;
      });
      if (!list.length) return '<p class="flow__empty">Nenhum serviço encontrado para “' + ui.esc(catQuery) + "”.</p>";
      return list.map(function (c) {
        return '<button class="cat-tile ' + (form.category_id === c.id ? "is-selected" : "") + '" data-cat="' + c.id + '">' +
          '<span class="cat-tile__ic">' + SG.catIcon(c, 24) + "</span>" +
          '<span><span class="cat-tile__name" style="display:block">' + ui.esc(c.name) + "</span>" +
          '<span class="cat-tile__price">' + ui.money(c.price_from, true) + " – " + ui.money(c.price_to, true) + "</span></span></button>";
      }).join("");
    }

    function descMeter(len) {
      var level = len < 12 ? 0 : len < 60 ? 1 : len < 140 ? 2 : 3;
      var text = ["Conte um pouco mais para continuar", "Bom começo — detalhes ajudam no preço", "Ótimo nível de detalhe", "Perfeito: o profissional chega preparado"][level];
      return '<span class="flow-meter" data-level="' + level + '"><i></i><i></i><i></i></span><span>' + text + "</span>";
    }

    function body() {
      var s = STEPS[step].key;
      var cat = currentCat() || {};

      if (s === "category") {
        return ui.searchBar({
            id: "fCatSearch", value: catQuery, cls: "flow__search",
            placeholder: "Buscar serviço — ex.: vazamento, tomada, pintura"
          }) +
          '<div class="cat-grid" id="catGrid">' + catTiles() + "</div>";
      }

      if (s === "describe") {
        return '<button type="button" class="flow-chip" data-goto="0">' +
            '<span class="flow-chip__ic">' + SG.catIcon(cat, 20) + "</span>" +
            "<span><strong>" + ui.esc(cat.name || "") + "</strong>" +
            '<span class="flow-chip__sub">' + ui.esc(cat.description || "") + "</span></span>" +
            '<span class="flow-chip__action">Trocar</span></button>' +
          '<div class="sg-field"><div class="flow__labelrow"><label class="sg-field__label" for="fTitle">Resumo do serviço</label>' +
            '<span class="flow__count" id="cTitle">' + form.title.length + "/90</span></div>" +
            '<input class="sg-input" id="fTitle" maxlength="90" value="' + ui.esc(form.title) + '" ' +
            'placeholder="Ex.: Tomadas da cozinha sem energia"></div>' +
          '<div class="sg-field" style="margin-top:18px"><label class="sg-field__label" for="fDesc">Descrição detalhada</label>' +
            '<textarea class="sg-textarea" id="fDesc" maxlength="2000" style="min-height:150px" ' +
            'placeholder="Descreva o problema, o que já tentou, marca/modelo do equipamento…">' + ui.esc(form.description) + "</textarea>" +
            '<div class="flow__meterrow" id="descMeter">' + descMeter(form.description.length) + "</div>" +
            '<span class="sg-field__hint">Dica: cite se o material será por sua conta ou do profissional.</span></div>' +
          '<div class="flow__aside-note" style="margin-top:18px">' + SG.icon("wallet", 14) + " Preço fechado: " +
            (priceRange(cat) || "definido pelo profissional") + "</div>";
      }

      if (s === "location") {
        return '<div class="sg-field"><label class="sg-field__label" for="fAddress">Endereço do serviço</label>' +
            '<div class="sg-input-group"><span class="sg-input-group__icon">' + SG.icon("pin", 17) + "</span>" +
            '<input class="sg-input" id="fAddress" maxlength="200" value="' + ui.esc(form.address) + '" ' +
            'placeholder="Rua, número, bairro, cidade"></div></div>' +
          '<div class="sg-field" style="margin-top:18px"><label class="sg-field__label" for="fComp">Complemento / referência</label>' +
            '<input class="sg-input" id="fComp" maxlength="120" value="' + ui.esc(form.address_complement) + '" ' +
            'placeholder="Apto, bloco, ponto de referência"></div>' +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="btnGeo" style="margin-top:14px">' +
            SG.icon("globe", 15) + "Usar minha localização atual</button>" +
          '<div class="sg-map" style="height:250px;margin-top:20px">' +
            '<div class="sg-map__grid"></div>' +
            '<div class="sg-map__badge">' + SG.icon("pin", 12) + " Área de atendimento</div>" +
            '<div class="sg-map__radar"></div><div class="sg-map__radar sg-map__radar--2"></div>' +
            '<div class="sg-map__radar sg-map__radar--3"></div>' +
            '<div class="sg-map__pin sg-map__pin--me" style="left:50%;top:52%">' +
              '<div class="sg-map__pin-dot">' + SG.icon("home", 15) + "</div>" +
              '<div class="sg-map__pin-label" id="mapLabel">' + (form.lat ? "Localização capturada" : "Seu endereço") + "</div></div>" +
          "</div>" +
          '<p class="sg-xs sg-faint" style="margin-top:12px">Mapa ilustrativo. A arquitetura já está preparada para Mapbox ou Google Maps — basta preencher <b>config.maps</b>.</p>';
      }

      if (s === "photos") {
        var slots = "";
        for (var i = 0; i < MAX_PHOTOS; i++) {
          slots += previews[i]
            ? '<div class="sg-thumb"><img src="' + previews[i] + '" alt="">' +
              '<button class="sg-thumb__remove" data-rm="' + i + '" aria-label="Remover foto">✕</button></div>'
            : '<div class="flow-slot">' + (i + 1) + "</div>";
        }
        return '<div class="sg-dropzone" id="drop">' +
            '<div class="flow-drop__ic">' + SG.icon("camera", 24) + "</div>" +
            '<strong class="sg-md">Arraste fotos aqui ou clique para escolher</strong>' +
            '<div class="sg-xs sg-dim" style="margin-top:6px">JPG ou PNG · ' + previews.length + " de " + MAX_PHOTOS + " fotos</div>" +
            '<input type="file" id="fFiles" accept="image/*" multiple hidden></div>' +
          '<div class="flow-slots" id="thumbs">' + slots + "</div>" +
          '<p class="sg-xs sg-faint" style="margin-top:16px">Fotos são enviadas para o Supabase Storage no bucket <b>' +
            SG.config.buckets.servicePhotos + "</b> e ficam visíveis apenas para você e os profissionais da solicitação.</p>";
      }

      if (s === "when") {
        return '<div class="when-grid">' + WHEN.map(function (o) {
          return '<button class="when-card ' + (form.urgency === o[0] ? "is-selected" : "") + '" data-urg="' + o[0] + '">' +
            '<span class="when-card__ic">' + o[3] + "</span>" +
            '<span class="when-card__title">' + o[1] + "</span>" +
            '<span class="when-card__sub">' + o[2] + "</span>" +
            '<span class="when-card__check">' + SG.icon("check", 13) + "</span></button>";
        }).join("") + "</div>" +
          (form.urgency === "scheduled"
            ? '<div class="sg-field sg-anim" style="margin-top:18px"><label class="sg-field__label" for="fWhen">Data e hora</label>' +
              '<input class="sg-input" id="fWhen" type="datetime-local" value="' + ui.esc(form.scheduled_local) + '"></div>'
            : "");
      }

      // review — o ticket completo, com o envio no canhoto
      return ticket(true);
    }

    function collect() {
      var s = STEPS[step].key;
      if (s === "describe") {
        form.title = (ui.$("#fTitle").value || "").trim();
        form.description = (ui.$("#fDesc").value || "").trim();
      }
      if (s === "location") {
        form.address = (ui.$("#fAddress").value || "").trim();
        form.address_complement = (ui.$("#fComp").value || "").trim();
      }
      if (s === "when") {
        var w = ui.$("#fWhen");
        if (form.urgency === "scheduled" && w) {
          form.scheduled_local = w.value || "";
          form.scheduled_for = w.value ? new Date(w.value).toISOString() : null;
        } else if (form.urgency !== "scheduled") {
          form.scheduled_for = null;
        }
      }
    }

    function validate() {
      var s = STEPS[step].key;
      if (s === "category" && !form.category_id) { ui.toast("Escolha uma categoria", { type: "error" }); return false; }
      if (s === "describe") {
        if (!form.title) { ui.toast("Dê um título ao serviço", { type: "error" }); return false; }
        if (form.description.length < 12) { ui.toast("Descreva um pouco mais o problema", { type: "error" }); return false; }
      }
      if (s === "location" && form.address.length < 8) { ui.toast("Informe o endereço do serviço", { type: "error" }); return false; }
      if (s === "when" && form.urgency === "scheduled" && !form.scheduled_for) {
        ui.toast("Escolha a data e a hora", { type: "error" }); return false;
      }
      return true;
    }

    function next(btn) {
      collect();
      if (!validate()) return;
      if (step < STEPS.length - 1) { goTo(step + 1); return; }
      submit(btn);
    }

    function bindCats() {
      ui.$$("[data-cat]").forEach(function (b) {
        b.addEventListener("click", function () {
          form.category_id = b.getAttribute("data-cat");
          catQuery = "";
          goTo(1);
        });
      });
    }

    function bind() {
      bindCats();

      // trilho, "Trocar" e "Editar" pulam para etapas já visitadas
      ui.$$("[data-goto]").forEach(function (b) {
        b.addEventListener("click", function () { collect(); goTo(+b.getAttribute("data-goto")); });
      });

      var search = ui.$("#fCatSearch");
      if (search) {
        search.addEventListener("input", function () {
          catQuery = search.value.trim();
          ui.$("#catGrid").innerHTML = catTiles();
          bindCats();
        });
      }

      // o ticket acompanha a digitação
      ["#fTitle", "#fDesc", "#fAddress", "#fComp", "#fWhen"].forEach(function (sel) {
        var el = ui.$(sel);
        if (!el) return;
        el.addEventListener("input", function () {
          collect();
          if (sel === "#fTitle") ui.$("#cTitle").textContent = el.value.length + "/90";
          if (sel === "#fDesc") ui.$("#descMeter").innerHTML = descMeter(form.description.length);
          refreshTicket();
        });
        if (el.tagName === "INPUT") {
          el.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); next(ui.$("#btnNext")); }
          });
        }
      });

      ui.$$("[data-urg]").forEach(function (b) {
        b.addEventListener("click", function () {
          collect();
          stampFresh = form.urgency !== b.getAttribute("data-urg");
          form.urgency = b.getAttribute("data-urg");
          render();
        });
      });

      var geo = ui.$("#btnGeo");
      if (geo) {
        geo.addEventListener("click", function () {
          if (!navigator.geolocation) return ui.toast("Geolocalização indisponível neste navegador", { type: "error" });
          ui.busy(geo, true);
          navigator.geolocation.getCurrentPosition(function (pos) {
            ui.busy(geo, false);
            form.lat = pos.coords.latitude; form.lng = pos.coords.longitude;
            var label = ui.$("#mapLabel");
            if (label) label.textContent = "Localização capturada";
            ui.toast("Localização capturada", { type: "success", text: "Coordenadas salvas com a solicitação." });
          }, function () {
            ui.busy(geo, false);
            ui.toast("Não conseguimos obter sua localização", { type: "error", text: "Digite o endereço manualmente." });
          });
        });
      }

      var drop = ui.$("#drop");
      if (drop) {
        var input = ui.$("#fFiles");
        drop.addEventListener("click", function () { input.click(); });
        drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("is-over"); });
        drop.addEventListener("dragleave", function () { drop.classList.remove("is-over"); });
        drop.addEventListener("drop", function (e) {
          e.preventDefault(); drop.classList.remove("is-over");
          addFiles(e.dataTransfer.files);
        });
        input.addEventListener("change", function () { addFiles(input.files); });
        ui.$$("[data-rm]").forEach(function (b) {
          b.addEventListener("click", function () {
            var i = +b.getAttribute("data-rm");
            files.splice(i, 1); previews.splice(i, 1);
            render();
          });
        });
      }

      ui.$("#btnBack").addEventListener("click", function () {
        if (step === 0) return;
        collect(); goTo(step - 1);
      });
      ui.$("#btnNext").addEventListener("click", function () { next(this); });
    }

    function addFiles(list) {
      Array.prototype.slice.call(list).slice(0, MAX_PHOTOS - files.length).forEach(function (f) {
        if (!/^image\//.test(f.type)) return;
        files.push(f);
        var fr = new FileReader();
        fr.onload = function () { previews.push(fr.result); render(); };
        fr.readAsDataURL(f);
      });
    }

    function submit(btn) {
      ui.busy(btn, true);
      var payload = {
        client_id: app.state.me.id,
        category_id: form.category_id,
        title: form.title,
        description: form.description,
        address: form.address,
        address_complement: form.address_complement || null,
        urgency: form.urgency,
        scheduled_for: form.scheduled_for,
        status: "matching"
      };
      if (form.lat) { payload.lat = form.lat; payload.lng = form.lng; }

      api.requests.create(payload).then(function (req) {
        if (!files.length) return req;
        return api.photos.upload(req.id, app.state.me.id, files).then(function () { return req; });
      }).then(function (req) {
        return api.dispatch.start(req.id).then(function () { return req; });
      }).then(function (req) {
        ui.toast("Pedido enviado!", { type: "success", text: "Chamando o profissional mais próximo." });
        SG.router.go("/solicitacao/" + req.id);
      }).catch(function (e) {
        ui.busy(btn, false);
        ui.toast(SG.explainError(e), { type: "error" });
      });
    }
  };
})(window.SG);
