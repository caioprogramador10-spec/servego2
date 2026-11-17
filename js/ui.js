/* ==========================================================================
   ServeGo — UI kit em JavaScript
   Helpers de DOM, formatação, toasts, modais, skeletons e microinterações.
   ========================================================================== */
(function (SG) {
  var cfg = SG.config.app;

  var ui = {};

  /* ---- DOM -------------------------------------------------------------- */
  ui.$ = function (sel, root) { return (root || document).querySelector(sel); };
  ui.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  ui.esc = function (s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  ui.frag = function (html) {
    var t = document.createElement("template");
    t.innerHTML = String(html).trim();
    return t.content;
  };

  ui.node = function (html) {
    return ui.frag(html).firstElementChild;
  };

  /** Delegação de eventos: ui.on(root, 'click', '[data-x]', handler) */
  ui.on = function (root, type, selector, handler) {
    root.addEventListener(type, function (ev) {
      var t = ev.target.closest(selector);
      if (t && root.contains(t)) handler(ev, t);
    });
  };

  /* ---- Formatação ------------------------------------------------------- */
  var moneyFmt = new Intl.NumberFormat(cfg.locale, { style: "currency", currency: cfg.currency });
  var moneyCompact = new Intl.NumberFormat(cfg.locale, { style: "currency", currency: cfg.currency, maximumFractionDigits: 0 });

  ui.money = function (v, compact) {
    var n = Number(v || 0);
    return (compact ? moneyCompact : moneyFmt).format(n);
  };

  ui.num = function (v) { return new Intl.NumberFormat(cfg.locale).format(Number(v || 0)); };

  ui.date = function (v, opts) {
    if (!v) return "—";
    return new Date(v).toLocaleDateString(cfg.locale, opts || { day: "2-digit", month: "short", year: "numeric" });
  };

  ui.time = function (v) {
    if (!v) return "";
    return new Date(v).toLocaleTimeString(cfg.locale, { hour: "2-digit", minute: "2-digit" });
  };

  ui.dateTime = function (v) {
    if (!v) return "—";
    return ui.date(v, { day: "2-digit", month: "short" }) + " às " + ui.time(v);
  };

  ui.timeAgo = function (v) {
    if (!v) return "";
    var diff = (Date.now() - new Date(v).getTime()) / 1000;
    if (diff < 45) return "agora";
    if (diff < 3600) return Math.round(diff / 60) + " min";
    if (diff < 86400) return Math.round(diff / 3600) + " h";
    if (diff < 604800) return Math.round(diff / 86400) + " d";
    return ui.date(v, { day: "2-digit", month: "short" });
  };

  ui.dayLabel = function (v) {
    var d = new Date(v); var today = new Date();
    var same = function (a, b) { return a.toDateString() === b.toDateString(); };
    var y = new Date(today); y.setDate(y.getDate() - 1);
    if (same(d, today)) return "Hoje";
    if (same(d, y)) return "Ontem";
    return d.toLocaleDateString(cfg.locale, { day: "2-digit", month: "long" });
  };

  ui.initials = function (name) {
    if (!name) return "?";
    var p = String(name).trim().split(/\s+/);
    return ((p[0] || "")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  };

  /** "agora mesmo" | "há 3 h" — evita o esquisito "agora atrás". */
  ui.since = function (v) {
    var t = ui.timeAgo(v);
    return t === "agora" ? "agora mesmo" : "há " + t;
  };

  ui.rating = function (v) {
    return (Math.round(Number(v || 0) * 10) / 10).toFixed(1).replace(".", ",");
  };

  /** Plural simples: ui.plural(3, "profissional", "profissionais") */
  ui.plural = function (n, one, many) {
    return Number(n) === 1 ? one : many;
  };

  ui.km = function (v) {
    if (v === null || v === undefined) return "—";
    var n = Number(v);
    return n < 1 ? Math.round(n * 1000) + " m" : n.toFixed(1).replace(".", ",") + " km";
  };

  ui.eta = function (min) {
    if (!min) return "—";
    if (min < 60) return "~" + Math.round(min) + " min";
    return "~" + Math.round(min / 60) + " h";
  };

  /* ---- Blocos visuais reutilizáveis -------------------------------------- */
  ui.avatar = function (person, size, showStatus) {
    // profissionais verificados ganham aro dourado automaticamente
    var cls = "sg-avatar" + (size ? " sg-avatar--" + size : "") +
      (person && person.verified ? " sg-avatar--gold" : "");
    var src = person && (person.avatar_url || person.avatarUrl);
    var name = (person && (person.full_name || person.name)) || "";
    var status = showStatus
      ? '<span class="sg-avatar__status' + (person && person.is_available ? " sg-avatar__status--on" : "") + '"></span>'
      : "";
    return '<span class="' + cls + '">' +
      (src ? '<img src="' + ui.esc(src) + '" alt="' + ui.esc(name) + '" loading="lazy">' : ui.esc(ui.initials(name))) +
      status + "</span>";
  };

  ui.stars = function (rating, size) {
    var r = Number(rating || 0);
    var out = "";
    for (var i = 1; i <= 5; i++) out += SG.starIcon(i <= Math.round(r), size || 14);
    return '<span class="sg-stars' + (size && size > 16 ? " sg-stars--lg" : "") + '">' + out + "</span>";
  };

  ui.skeletonCard = function (n) {
    var out = "";
    for (var i = 0; i < (n || 3); i++) {
      out +=
        '<div class="sg-card"><div class="sg-row sg-row--top">' +
        '<div class="sg-skel sg-skel--avatar"></div>' +
        '<div style="flex:1"><div class="sg-skel sg-skel--title"></div>' +
        '<div class="sg-skel sg-skel--line" style="margin-top:10px;width:72%"></div>' +
        '<div class="sg-skel sg-skel--line" style="margin-top:8px;width:44%"></div></div></div></div>';
    }
    return '<div class="sg-stack">' + out + "</div>";
  };

  ui.empty = function (icon, title, text, actionHtml) {
    return '<div class="sg-empty"><div class="sg-empty__icon">' + (icon || "✦") + "</div>" +
      '<div class="sg-empty__title">' + ui.esc(title) + "</div>" +
      (text ? '<p class="sg-empty__text">' + ui.esc(text) + "</p>" : "") +
      (actionHtml ? '<div style="margin-top:20px">' + actionHtml + "</div>" : "") + "</div>";
  };

  /* ---- Toasts ------------------------------------------------------------ */
  function toastHost() {
    var host = ui.$(".sg-toasts");
    if (!host) {
      host = document.createElement("div");
      host.className = "sg-toasts";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    return host;
  }

  ui.toast = function (title, opts) {
    opts = opts || {};
    var type = opts.type || "info";
    var iconName = type === "success" ? "checkCircle" : type === "error" ? "alert" : "sparkle";
    var node = ui.node(
      '<div class="sg-toast sg-toast--' + type + '">' +
      '<span class="sg-toast__icon">' + SG.icon(iconName, 18) + "</span>" +
      '<div><div class="sg-toast__title">' + ui.esc(title) + "</div>" +
      (opts.text ? '<div class="sg-toast__text">' + ui.esc(opts.text) + "</div>" : "") + "</div></div>"
    );
    toastHost().appendChild(node);
    setTimeout(function () {
      node.classList.add("is-out");
      setTimeout(function () { node.remove(); }, 220);
    }, opts.duration || 3600);
    return node;
  };

  /* ---- Modal ------------------------------------------------------------- */
  ui.modal = function (opts) {
    opts = opts || {};
    var overlay = ui.node(
      '<div class="sg-overlay">' +
      '<div class="sg-modal ' + (opts.size ? "sg-modal--" + opts.size : "") + '" role="dialog" aria-modal="true">' +
      (opts.title
        ? '<div class="sg-modal__head"><h3>' + ui.esc(opts.title) + "</h3>" +
          '<button class="app-iconbtn" data-close aria-label="Fechar">' + SG.icon("x", 18) + "</button></div>"
        : "") +
      '<div class="sg-modal__body">' + (opts.body || "") + "</div>" +
      (opts.footer ? '<div class="sg-modal__foot">' + opts.footer + "</div>" : "") +
      "</div></div>"
    );
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    function close() {
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", onKey);

    var api = { el: overlay, body: ui.$(".sg-modal__body", overlay), close: close };
    if (opts.onMount) opts.onMount(api);
    return api;
  };

  ui.confirm = function (opts) {
    return new Promise(function (resolve) {
      var m = ui.modal({
        title: opts.title || "Confirmar",
        body: '<p class="sg-muted">' + ui.esc(opts.text || "") + "</p>",
        footer:
          '<button class="sg-btn sg-btn--ghost" data-close>' + ui.esc(opts.cancelText || "Cancelar") + "</button>" +
          '<button class="sg-btn ' + (opts.danger ? "sg-btn--danger" : "sg-btn--primary") + '" data-ok>' +
          ui.esc(opts.okText || "Confirmar") + "</button>",
        onClose: function () { resolve(false); }
      });
      m.el.querySelector("[data-ok]").addEventListener("click", function () {
        resolve(true);
        m.el.remove();
        document.body.style.overflow = "";
      });
    });
  };

  /* ---- Popover (fecha ao clicar fora) ------------------------------------ */
  ui.popover = function (anchor, html) {
    ui.closePopovers();
    var pop = ui.node(html);
    anchor.style.position = anchor.style.position || "relative";
    anchor.appendChild(pop);
    setTimeout(function () {
      document.addEventListener("click", handler, { once: false });
    }, 0);
    function handler(e) {
      if (!pop.contains(e.target) && !anchor.contains(e.target)) ui.closePopovers();
    }
    pop._cleanup = function () { document.removeEventListener("click", handler); };
    return pop;
  };

  ui.closePopovers = function () {
    ui.$$(".notif-pop, .menu-pop").forEach(function (p) {
      if (p._cleanup) p._cleanup();
      p.remove();
    });
  };

  /* ---- Botão em carregamento --------------------------------------------- */
  ui.busy = function (btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-loading", !!on);
    btn.disabled = !!on;
  };

  /* ---- Reveal por scroll -------------------------------------------------- */
  ui.observeReveal = function (root) {
    var els = ui.$$("[data-reveal]", root || document);
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var delay = parseInt(en.target.getAttribute("data-reveal-delay") || "0", 10);
          setTimeout(function () { en.target.classList.add("is-visible"); }, delay);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px" });
    els.forEach(function (e) { io.observe(e); });
  };

  /* ---- Utilidades --------------------------------------------------------- */
  ui.debounce = function (fn, wait) {
    var t;
    return function () {
      var a = arguments, c = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(c, a); }, wait || 250);
    };
  };

  ui.scrollTop = function (el) {
    (el || window).scrollTo({ top: 0, behavior: "smooth" });
  };

  ui.copy = function (text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
    return Promise.resolve();
  };

  /* ---- Rótulos de domínio -------------------------------------------------- */
  ui.labels = {
    urgency: { now: "Agora", today: "Hoje", tomorrow: "Amanhã", scheduled: "Agendado" },
    requestStatus: {
      open: "Aberta", matching: "Chamando profissional", awaiting_payment: "Aguardando pagamento",
      no_professional: "Sem profissional disponível", assigned: "Pago · profissional a caminho",
      in_progress: "Em andamento", completed: "Concluída", cancelled: "Cancelada"
    },
    bookingStatus: {
      accepted: "Profissional aceitou", on_the_way: "A caminho", arrived: "Chegou ao local",
      in_progress: "Serviço em andamento", awaiting_confirmation: "Aguardando confirmação do cliente",
      disputed: "Em disputa · pagamento retido", completed: "Serviço concluído", cancelled: "Cancelado"
    },
    offerStatus: { pending: "Aguardando", accepted: "Aceito", rejected: "Recusado", withdrawn: "Retirado" },
    verification: { pending: "Em análise", approved: "Aprovado", rejected: "Rejeitado" }
  };

  ui.statusTone = function (status) {
    if (["completed", "accepted", "approved"].indexOf(status) >= 0) return "success";
    if (["cancelled", "rejected", "blocked", "no_professional", "refunded"].indexOf(status) >= 0) return "danger";
    if (["in_progress", "on_the_way", "arrived", "matching", "awaiting_payment", "assigned", "awaiting_confirmation"].indexOf(status) >= 0) return "brand";
    if (status === "disputed") return "danger";
    if (["pending", "open"].indexOf(status) >= 0) return "info";
    return "";
  };

  ui.statusBadge = function (status, dict) {
    var label = (dict || ui.labels.bookingStatus)[status] || status;
    var tone = ui.statusTone(status);
    return '<span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' + ui.esc(label) + "</span>";
  };

  /** Atualiza o número ao lado de cada opção de um filtro segmentado (.sg-seg).
      count(valor) devolve quantos itens aquela opção mostraria. */
  ui.segCounts = function (host, attr, count) {
    if (typeof host === "string") host = document.getElementById(host);
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll("[" + attr + "]"), function (b) {
      var el = b.querySelector(".sg-seg__count");
      if (!el) { el = document.createElement("span"); el.className = "sg-seg__count"; b.appendChild(el); }
      el.textContent = ui.num(count(b.getAttribute(attr)));
    });
  };

  /** Junta busca (.adm-toolbar) e filtros (.sg-seg-wrap) vizinhos num só cartão
      (.filterbar), com cada filtro numa linha rotulada. Roda em toda tela. */
  ui.groupFilters = function (root) {
    if (!root) return;
    var kids = Array.prototype.slice.call(root.children);
    var isPart = function (el) {
      return el && (el.classList.contains("adm-toolbar") ||
        (el.classList.contains("sg-seg-wrap") && el.querySelector(".sg-chip[data-chip], .sg-chip[data-f]")));
    };
    for (var i = 0; i < kids.length; i++) {
      if (!isPart(kids[i])) continue;
      var run = [kids[i]];
      while (isPart(kids[i + 1])) run.push(kids[++i]);
      var bar = document.createElement("div");
      bar.className = "filterbar";
      run[0].parentNode.insertBefore(bar, run[0]);
      run.forEach(function (el) {
        if (el.classList.contains("sg-seg-wrap")) {
          var row = document.createElement("div");
          row.className = "filterbar__row";
          var label = el.getAttribute("data-label");
          if (label) row.innerHTML = '<span class="filterbar__label">' + ui.esc(label) + "</span>";
          row.appendChild(el);
          bar.appendChild(row);
        } else {
          el.classList.add("filterbar__top");
          bar.appendChild(el);
        }
      });
      if (bar.children.length === 1 && bar.firstChild.classList.contains("filterbar__row")) bar.classList.add("filterbar--single");
    }
  };

  /* ---- Barra de pesquisa ---------------------------------------------------
     Um único componente para todas as buscas: ícone, botão limpar, Esc limpa
     e "/" foca a busca da página. O input dispara "input" normalmente. */
  ui.searchBar = function (opts) {
    opts = opts || {};
    var val = opts.value || "";
    return (
      '<div class="sg-search' + (opts.size === "lg" ? " sg-search--lg" : "") +
        (val ? " has-value" : "") + (opts.cls ? " " + opts.cls : "") + '" role="search"' +
        (opts.style ? ' style="' + opts.style + '"' : "") + ">" +
        '<span class="sg-search__icon">' + SG.icon("search", opts.size === "lg" ? 19 : 17) + "</span>" +
        '<input class="sg-search__input" id="' + opts.id + '" type="search" value="' + ui.esc(val) + '" ' +
          'placeholder="' + ui.esc(opts.placeholder || "Buscar…") + '" aria-label="' + ui.esc(opts.label || opts.placeholder || "Buscar") + '" ' +
          'autocomplete="off" spellcheck="false" enterkeyhint="search">' +
        '<kbd class="sg-search__kbd" aria-hidden="true">/</kbd>' +
        '<button class="sg-search__clear" type="button" aria-label="Limpar busca" tabindex="-1">' + SG.icon("x", 14) + "</button>" +
        (opts.after || "") +
      "</div>"
    );
  };

  function clearSearch(input) {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  document.addEventListener("input", function (e) {
    var box = e.target.closest && e.target.closest(".sg-search");
    if (box && e.target.classList.contains("sg-search__input")) box.classList.toggle("has-value", !!e.target.value);
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".sg-search__clear");
    if (btn) clearSearch(btn.parentNode.querySelector(".sg-search__input"));
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (e.key === "Escape" && t.classList && t.classList.contains("sg-search__input") && t.value) {
      e.preventDefault();
      clearSearch(t);
      return;
    }
    // "/" leva para a busca da tela, exceto quando já se está digitando
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
      var input = document.querySelector(".sg-modal .sg-search__input") || document.querySelector(".sg-search__input");
      if (input && input.offsetParent !== null) { e.preventDefault(); input.focus(); input.select(); }
    }
  });

  SG.ui = ui;
})(window.SG);
