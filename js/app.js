/* ==========================================================================
   ServeGo — Shell da aplicação
   Sessão, navegação, notificações e montagem das telas.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api, router = SG.router;

  var app = {
    state: { me: null, role: "client", unread: 0, notifications: [], categories: [] },
    unsub: []
  };

  /* ---- Navegação por papel ------------------------------------------------ */
  var NAV = {
    client: [
      { group: "Principal", items: [
        { path: "/inicio", label: "Início", icon: "home" },
        { path: "/solicitar", label: "Solicitar serviço", icon: "plus" },
        { path: "/atividade", label: "Minhas solicitações", icon: "activity" },
        { path: "/mensagens", label: "Mensagens", icon: "chat", badge: "unread" }
      ]},
      { group: "Descobrir", items: [
        { path: "/categorias", label: "Categorias", icon: "grid" },
        { path: "/favoritos", label: "Favoritos", icon: "heart" }
      ]},
      { group: "Conta", items: [
        { path: "/perfil", label: "Meu perfil", icon: "user" },
        { path: "/ajuda", label: "Ajuda e suporte", icon: "shield" }
      ]}
    ],
    professional: [
      { group: "Operação", items: [
        { path: "/inicio", label: "Painel", icon: "home" },
        { path: "/chamadas", label: "Chamadas", icon: "zap" },
        { path: "/servicos", label: "Serviços", icon: "briefcase" },
        { path: "/mensagens", label: "Mensagens", icon: "chat", badge: "unread" }
      ]},
      { group: "Negócio", items: [
        { path: "/ganhos", label: "Ganhos", icon: "wallet" },
        { path: "/avaliacoes", label: "Avaliações", icon: "star" }
      ]},
      { group: "Conta", items: [
        { path: "/perfil", label: "Meu perfil", icon: "user" },
        { path: "/ajuda", label: "Ajuda e suporte", icon: "shield" }
      ]}
    ],
    admin: [
      { group: "Visão geral", items: [
        { path: "/admin", label: "Métricas", icon: "trending" },
        { path: "/admin/solicitacoes", label: "Pedidos", icon: "layers" },
        { path: "/admin/chamadas", label: "Chamadas", icon: "zap" },
        { path: "/admin/financeiro", label: "Financeiro", icon: "wallet" },
        { path: "/admin/relatorios", label: "Relatórios", icon: "doc" }
      ]},
      { group: "Pessoas", items: [
        { path: "/admin/verificacoes", label: "Verificações", icon: "verified", badge: "kyc" },
        { path: "/admin/usuarios", label: "Usuários", icon: "users" },
        { path: "/admin/profissionais", label: "Profissionais", icon: "briefcase" },
        { path: "/admin/reengajamento", label: "Inativos", icon: "activity" }
      ]},
      { group: "Moderação", items: [
        { path: "/admin/conversas", label: "Conversas", icon: "chat" },
        { path: "/admin/avaliacoes", label: "Avaliações", icon: "star" },
        { path: "/admin/disputas", label: "Disputas", icon: "alert", badge: "disputes" },
        { path: "/admin/denuncias", label: "Denúncias", icon: "flag", badge: "reports" }
      ]},
      { group: "Plataforma", items: [
        { path: "/admin/controles", label: "Controles do app", icon: "power" },
        { path: "/admin/configuracoes", label: "Taxa da plataforma", icon: "settings" },
        { path: "/admin/categorias", label: "Categorias", icon: "grid" },
        { path: "/admin/comunicados", label: "Comunicados", icon: "bell" },
        { path: "/admin/suporte", label: "Equipe de suporte", icon: "users" },
        { path: "/admin/equipe", label: "Permissões", icon: "shield" },
        { path: "/admin/auditoria", label: "Auditoria", icon: "lock" }
      ]},
      { group: "Conta", items: [
        { path: "/perfil", label: "Meu perfil", icon: "user" }
      ]}
    ]
  };

  var BOTTOM_NAV = {
    client: [
      { path: "/inicio", label: "Início", icon: "home" },
      { path: "/atividade", label: "Atividade", icon: "activity" },
      { path: "/solicitar", label: "Solicitar", icon: "plus", primary: true },
      { path: "/mensagens", label: "Mensagens", icon: "chat", badge: "unread" },
      { path: "/perfil", label: "Perfil", icon: "user" }
    ],
    professional: [
      { path: "/inicio", label: "Painel", icon: "home" },
      { path: "/chamadas", label: "Chamadas", icon: "zap" },
      { path: "/mensagens", label: "Mensagens", icon: "chat", badge: "unread" },
      { path: "/ganhos", label: "Ganhos", icon: "wallet" },
      { path: "/perfil", label: "Perfil", icon: "user" }
    ],
    admin: [
      { path: "/admin", label: "Métricas", icon: "trending" },
      { path: "/admin/verificacoes", label: "Verificar", icon: "verified", badge: "kyc" },
      { path: "/admin/usuarios", label: "Usuários", icon: "users" },
      { path: "/admin/denuncias", label: "Denúncias", icon: "flag", badge: "reports" },
      { path: "/perfil", label: "Perfil", icon: "user" }
    ]
  };

  /* ---- Montagem do shell -------------------------------------------------- */
  app.renderShell = function () {
    var role = app.state.role;
    var root = ui.$("#root");
    root.innerHTML =
      '<div class="app" id="appShell">' +
        '<aside class="app-sidebar">' +
          '<div class="app-sidebar__brand"><a href="#/inicio">' + SG.brandLogo() + "</a>" +
            '<span class="app-sidebar__env">' + SG.icon(role === "admin" ? "shield" : role === "professional" ? "briefcase" : "user", 12) +
            (role === "admin" ? "Painel admin" : role === "professional" ? "Área do profissional" : "Área do cliente") + "</span></div>" +
          '<nav class="app-nav" id="appNav"></nav>' +
          '<div class="app-sidebar__foot" id="sidebarFoot"></div>' +
        "</aside>" +
        '<header class="app-header">' +
          '<button class="app-iconbtn sg-only-md" id="btnDrawer" aria-label="Menu">' + SG.icon("menu", 20) + "</button>" +
          '<div style="min-width:0"><div class="app-header__title sg-truncate" id="pageTitle">ServeGo</div>' +
          '<div class="app-header__sub sg-truncate" id="pageSub"></div></div>' +
          '<div class="app-header__actions">' +
            (role === "professional" ? '<div id="availabilitySwitch"></div>' : "") +
            (role === "admin" ? '<button class="app-searchbtn" id="btnSearch" aria-label="Busca global">' + SG.icon("search", 16) +
              '<span class="sg-only-desktop">Buscar no app…</span><kbd class="sg-only-desktop">Ctrl K</kbd></button>' : "") +
            '<div id="themeSlot" style="display:flex"></div>' +
            '<div style="position:relative"><button class="app-iconbtn" id="btnNotif" aria-label="Notificações">' +
              SG.icon("bell", 19) + '<span class="app-iconbtn__dot sg-hide" id="notifDot"></span></button></div>' +
            '<div style="position:relative"><button class="app-iconbtn" id="btnUser" aria-label="Conta" style="width:auto;padding:0 4px;gap:8px">' +
              ui.avatar(app.state.me, "sm") + "</button></div>" +
          "</div>" +
        "</header>" +
        '<main class="app-main" id="main"></main>' +
      "</div>" +
      '<nav class="app-bottomnav" id="bottomNav"></nav>';

    renderNav();
    renderBottomNav();
    renderSidebarFoot();
    bindShell();
    if (role === "professional") renderAvailability();
    if (api.isDemo) renderDemoBar();
  };

  function renderNav() {
    var nav = ui.$("#appNav");
    var closed = navClosed();
    nav.innerHTML = (NAV[app.state.role] || NAV.client).map(function (g) {
      var items = g.items.filter(function (it) { return canSee(it.path); });
      if (!items.length) return "";
      var key = app.state.role + ":" + g.group;
      return '<div class="app-nav__group' + (closed[key] ? " is-closed" : "") + '" data-group="' + ui.esc(key) + '">' +
        '<button type="button" class="app-nav__label" aria-expanded="' + !closed[key] + '">' +
          "<span>" + ui.esc(g.group) + "</span>" +
          '<span class="app-nav__dot" aria-hidden="true"></span>' + SG.icon("chevronDown", 13) + "</button>" +
        '<div class="app-nav__items"><div>' +
        items.map(function (it) {
          return '<a class="app-nav__item" href="#' + it.path + '" data-path="' + it.path + '" title="' + ui.esc(it.label) + '">' +
            '<span class="app-nav__ic">' + SG.icon(it.icon, 17) + "</span>" +
            '<span class="app-nav__text">' + ui.esc(it.label) + "</span>" +
            (it.badge ? '<span class="app-nav__count sg-hide" data-badge="' + it.badge + '">0</span>' : "") +
            "</a>";
        }).join("") + "</div></div></div>";
    }).join("");

    // abre/fecha o grupo e lembra a escolha (só neste navegador)
    ui.on(nav, "click", ".app-nav__label", function (e, btn) {
      var g = btn.parentNode, k = g.getAttribute("data-group");
      var isClosed = g.classList.toggle("is-closed");
      btn.setAttribute("aria-expanded", !isClosed);
      var st = navClosed();
      if (isClosed) st[k] = 1; else delete st[k];
      try { localStorage.setItem("servego.nav.closed", JSON.stringify(st)); } catch (err) { /* sem storage */ }
    });
    nav.addEventListener("scroll", navShadows);
    highlightNav();
    navShadows();
  }

  function navClosed() {
    try { return JSON.parse(localStorage.getItem("servego.nav.closed") || "{}") || {}; } catch (e) { return {}; }
  }

  /* esmaece o topo/rodapé do menu quando há itens escondidos pela rolagem */
  function navShadows() {
    var nav = ui.$("#appNav");
    if (!nav) return;
    nav.classList.toggle("is-scrolled-top", nav.scrollTop > 4);
    nav.classList.toggle("is-scrolled-bottom", nav.scrollTop + nav.clientHeight < nav.scrollHeight - 4);
  }

  /** A equipe só vê as telas do próprio papel (o dono vê tudo). */
  function canSee(path) {
    if (app.state.role !== "admin" || path.indexOf("/admin") !== 0) return true;
    return api.admin.can(app.state.me && app.state.me.admin_role, path);
  }
  app.canSee = canSee;

  function renderBottomNav() {
    var nav = ui.$("#bottomNav");
    nav.innerHTML = (BOTTOM_NAV[app.state.role] || BOTTOM_NAV.client).filter(function (it) { return canSee(it.path); }).map(function (it) {
      return '<a class="app-bottomnav__item' + (it.primary ? " app-bottomnav__item--primary" : "") +
        '" href="#' + it.path + '" data-path="' + it.path + '">' +
        SG.icon(it.icon, 21) + "<span>" + ui.esc(it.label) + "</span>" +
        (it.badge ? '<span class="app-bottomnav__badge sg-hide" data-badge="' + it.badge + '">0</span>' : "") +
        "</a>";
    }).join("");
  }

  function renderSidebarFoot() {
    var me = app.state.me;
    var sub = roleLabel(app.state.role);
    if (app.state.role === "admin" && me.admin_role && api.admin.ROLES[me.admin_role]) sub += " · " + api.admin.ROLES[me.admin_role].label;
    ui.$("#sidebarFoot").innerHTML =
      '<div class="app-user">' +
        '<a class="app-user__id" href="#/perfil" data-path="/perfil">' + ui.avatar(me, "sm") +
          '<span class="app-user__txt"><b>' + ui.esc(me.full_name || "Usuário") + "</b><small>" + ui.esc(sub) + "</small></span></a>" +
        '<button class="app-user__out" id="sideLogout" title="Sair" aria-label="Sair">' + SG.icon("logout", 16) + "</button>" +
      "</div>";
    ui.$("#sideLogout").addEventListener("click", function () {
      api.auth.signOut().then(function () { location.reload(); });
    });
  }

  /** Reflete no shell (lateral e botão da conta) mudanças feitas no perfil. */
  app.refreshIdentity = function () {
    if (ui.$("#sidebarFoot")) renderSidebarFoot();
    var btn = ui.$("#btnUser");
    if (btn) btn.innerHTML = ui.avatar(app.state.me, "sm");
  };

  function roleLabel(r) {
    return r === "professional" ? "Profissional" : r === "admin" ? "Administrador" : "Cliente";
  }

  function highlightNav() {
    var path = (location.hash || "#/inicio").replace(/^#/, "").split("?")[0];
    ui.$$("[data-path]").forEach(function (a) {
      var p = a.getAttribute("data-path");
      var active = path === p || (p !== "/inicio" && p !== "/admin" && path.indexOf(p) === 0);
      a.classList.toggle("is-active", active);
    });
    // o grupo da tela atual nunca fica recolhido
    ui.$$(".app-nav__group").forEach(function (g) {
      g.classList.toggle("has-active", !!g.querySelector(".app-nav__item.is-active"));
    });
  }

  function bindShell() {
    var shell = ui.$("#appShell");
    if (SG.theme) SG.theme.mount("#themeSlot", "app-iconbtn");
    var drawer = ui.$("#btnDrawer");
    if (drawer) {
      drawer.addEventListener("click", function () {
        shell.classList.add("is-drawer-open");
        var scrim = ui.node('<div class="app-scrim"></div>');
        shell.appendChild(scrim);
        scrim.addEventListener("click", function () {
          shell.classList.remove("is-drawer-open");
          scrim.remove();
        });
      });
    }
    ui.on(document, "click", "[data-path]", function () {
      var shellEl = ui.$("#appShell");
      if (shellEl) shellEl.classList.remove("is-drawer-open");
      var scrim = ui.$(".app-scrim"); if (scrim) scrim.remove();
    });
    window.addEventListener("hashchange", highlightNav);

    var gs = ui.$("#btnSearch");
    if (gs) gs.addEventListener("click", function () { if (SG.adminSearch) SG.adminSearch(); });
    ui.$("#btnNotif").addEventListener("click", function (e) {
      e.stopPropagation();
      openNotifications(this.parentNode);
    });
    ui.$("#btnUser").addEventListener("click", function (e) {
      e.stopPropagation();
      openUserMenu(this.parentNode);
    });
  }

  function renderDemoBar() {
    var main = ui.$("#main");
    var bar = ui.node(
      '<div class="demo-bar">' + SG.icon("sparkle", 15) +
      "<span>Modo demonstração — dados fictícios em memória. Configure <b>js/config.js</b> com sua URL e anon key do Supabase para conectar o banco real.</span>" +
      '<button class="demo-bar__close" aria-label="Fechar">' + SG.icon("x", 15) + "</button></div>"
    );
    bar.querySelector("button").addEventListener("click", function () { bar.remove(); });
    main.parentNode.insertBefore(bar, main);
  }

  /* ---- Disponibilidade do profissional ------------------------------------ */
  function renderAvailability() {
    var host = ui.$("#availabilitySwitch");
    if (!host) return;
    var pro = app.state.me.professional || {};
    function paint() {
      host.innerHTML =
        '<button class="sg-switch ' + (pro.is_available ? "is-on" : "") + '" title="Disponibilidade">' +
        '<span class="sg-badge ' + (pro.is_available ? "sg-badge--success" : "") + ' sg-hide-sm">' +
        '<span class="sg-dot ' + (pro.is_available ? "sg-dot--live" : "sg-dot--off") + '"></span>' +
        (pro.is_available ? "Online" : "Offline") + "</span>" +
        '<span class="sg-switch__track"><span class="sg-switch__thumb"></span></span></button>';
      host.querySelector("button").addEventListener("click", function () {
        var next = !pro.is_available;
        pro.is_available = next;
        paint();
        api.professionals.setAvailability(app.state.me.id, next).then(function () {
          ui.toast(next ? "Você está online" : "Você está offline", {
            type: next ? "success" : "info",
            text: next ? "Novas solicitações da sua região vão aparecer aqui." : "Você não receberá novas solicitações."
          });
        });
      });
    }
    paint();
  }

  /* ---- Notificações ------------------------------------------------------- */
  function openNotifications(anchor) {
    var list = app.state.notifications;
    var html =
      '<div class="notif-pop">' +
      '<div class="sg-row sg-row--between" style="padding:12px 16px;border-bottom:1px solid var(--sg-line)">' +
      '<strong class="sg-md">Notificações</strong>' +
      '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-readall>Marcar como lidas</button></div>' +
      '<div style="max-height:400px;overflow:auto">' +
      (list.length ? list.map(function (n) {
        return '<a class="notif-item ' + (n.read_at ? "" : "is-unread") + '" href="' + (n.link || "#/inicio") + '">' +
          '<span class="notif-item__ic">' + notifIcon(n.type) + "</span>" +
          '<span style="min-width:0"><span class="sg-md sg-strong" style="display:block">' + ui.esc(n.title) + "</span>" +
          (n.body ? '<span class="sg-xs sg-dim sg-clamp-2">' + ui.esc(n.body) + "</span>" : "") +
          '<span class="sg-xs sg-faint" style="display:block;margin-top:3px">' + ui.timeAgo(n.created_at) + "</span></span></a>";
      }).join("") : ui.empty("🔔", "Tudo em dia", "Você não tem notificações novas.")) +
      "</div></div>";
    var pop = ui.popover(anchor, html);
    pop.querySelector("[data-readall]").addEventListener("click", function (e) {
      e.stopPropagation();
      api.notifications.markAllRead(app.state.me.id).then(function () {
        app.state.notifications.forEach(function (n) { n.read_at = new Date().toISOString(); });
        updateNotifDot();
        ui.closePopovers();
      });
    });
  }

  function notifIcon(type) {
    var map = { offer: "💰", message: "💬", status: "🚚", review: "⭐", booking: "✅", request: "⚡", verification: "🛡", broadcast: "📣", dispatch: "📍", payment: "💳", reminder: "👋" };
    return map[type] || "🔔";
  }

  function updateNotifDot() {
    var unread = app.state.notifications.filter(function (n) { return !n.read_at; }).length;
    var dot = ui.$("#notifDot");
    if (dot) dot.classList.toggle("sg-hide", unread === 0);
  }

  app.loadNotifications = function () {
    return api.notifications.list(app.state.me.id).then(function (list) {
      app.state.notifications = list;
      updateNotifDot();
    });
  };

  app.refreshUnread = function () {
    return api.messages.unreadCount(app.state.me.id).then(function (n) {
      app.state.unread = n;
      ui.$$('[data-badge="unread"]').forEach(function (el) {
        el.textContent = n > 9 ? "9+" : n;
        el.classList.toggle("sg-hide", n === 0);
      });
    });
  };

  /** Contadores do menu do admin (verificações e denúncias pendentes). */
  app.refreshAdminBadges = function () {
    if (app.state.role !== "admin") return Promise.resolve();
    function paint(key, n) {
      ui.$$('[data-badge="' + key + '"]').forEach(function (el) {
        el.textContent = n > 99 ? "99+" : n;
        el.classList.toggle("sg-hide", n === 0);
      });
    }
    return Promise.all([
      api.admin.listVerifications({ status: "pending" }),
      api.admin.listReports(),
      api.disputes.list().catch(function () { return []; })
    ]).then(function (r) {
      paint("kyc", r[0].length);
      paint("disputes", r[2].filter(function (d) { return d.status === "open"; }).length);
      paint("reports", r[1].filter(function (x) { return x.status === "open" || x.status === "reviewing"; }).length);
    }).catch(function () {});
  };

  /* ---- Menu do usuário ---------------------------------------------------- */
  function themeMenu() {
    if (!SG.theme) return "";
    var dark = SG.theme.current() === "dark";
    return '<div class="menu-pop__sep"></div>' +
      '<button class="menu-pop__item" data-theme-toggle>' +
        SG.icon(dark ? "sun" : "moon", 16) +
        (dark ? "Tema claro" : "Tema escuro") + "</button>" +
      (SG.theme.isExplicit()
        ? '<button class="menu-pop__item" data-theme-system>' + SG.icon("refresh", 16) +
          "Seguir o sistema</button>"
        : "");
  }

  function bindThemeMenu(pop) {
    if (!SG.theme) return;
    var t = pop.querySelector("[data-theme-toggle]");
    if (t) t.addEventListener("click", function () { SG.theme.toggle(); ui.closePopovers(); });
    var s = pop.querySelector("[data-theme-system]");
    if (s) s.addEventListener("click", function () { SG.theme.followSystem(); ui.closePopovers(); });
  }

  function openUserMenu(anchor) {
    var me = app.state.me;
    var extra = "";
    if (api.isDemo) {
      var isOwner = String(me.email || "").toLowerCase() === String(SG.config.owner.email).toLowerCase();
      extra =
        '<div class="menu-pop__sep"></div>' +
        '<div class="sg-xs sg-faint" style="padding:4px 12px">Trocar de perfil (demo)</div>' +
        '<button class="menu-pop__item" data-demo="client">' + SG.icon("user", 16) + "Cliente</button>" +
        '<button class="menu-pop__item" data-demo="professional">' + SG.icon("briefcase", 16) + "Profissional</button>" +
        // o atalho de administrador só existe para a conta proprietária
        (isOwner ? '<button class="menu-pop__item" data-demo="admin">' + SG.icon("shield", 16) +
          "Administrador</button>" : "");
    }
    var pop = ui.popover(anchor,
      '<div class="menu-pop">' +
      '<div class="sg-row" style="padding:10px 12px">' + ui.avatar(me, "sm") +
      '<div style="min-width:0"><div class="sg-sm sg-strong sg-truncate">' + ui.esc(me.full_name) + "</div>" +
      '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(me.email || "") + "</div></div></div>" +
      '<div class="menu-pop__sep"></div>' +
      '<a class="menu-pop__item" href="#/perfil">' + SG.icon("user", 16) + "Meu perfil</a>" +
      '<a class="menu-pop__item" href="#/ajuda">' + SG.icon("shield", 16) + "Ajuda e suporte</a>" +
      themeMenu() +
      extra +
      '<div class="menu-pop__sep"></div>' +
      '<button class="menu-pop__item" data-logout>' + SG.icon("logout", 16) + "Sair</button>" +
      "</div>");

    bindThemeMenu(pop);
    pop.querySelectorAll("[data-demo]").forEach(function (b) {
      b.addEventListener("click", function () {
        api.auth.demoLogin(b.getAttribute("data-demo")).then(function () {
          location.hash = "#/inicio";
          location.reload();
        });
      });
    });
    pop.querySelector("[data-logout]").addEventListener("click", function () {
      api.auth.signOut().then(function () { location.reload(); });
    });
  }

  /* ---- API para as telas -------------------------------------------------- */
  app.setHeader = function (title, sub) {
    var t = ui.$("#pageTitle"), s = ui.$("#pageSub");
    if (t) t.textContent = title || "ServeGo";
    if (s) s.textContent = sub || "";
    document.title = (title ? title + " · " : "") + "ServeGo";
  };

  app.view = function (html, opts) {
    opts = opts || {};
    var main = ui.$("#main");
    main.innerHTML = '<div class="app-view ' + (opts.className || "") + '">' + html + "</div>";
    ui.groupFilters(main.firstElementChild);
    ui.observeReveal(main);
    return main.firstElementChild;
  };

  app.loading = function (title, sub) {
    app.setHeader(title, sub);
    app.view('<div class="app-page-head"><div class="sg-skel sg-skel--title"></div></div>' + ui.skeletonCard(3));
  };

  app.cleanup = function () {
    app.unsub.forEach(function (fn) { try { fn(); } catch (e) {} });
    app.unsub = [];
  };

  app.track = function (unsubscribe) {
    if (typeof unsubscribe === "function") app.unsub.push(unsubscribe);
  };

  /* ---- Registro de rotas -------------------------------------------------- */
  function registerRoutes() {
    var V = SG.views;
    router.before(function () { app.cleanup(); return true; });

    router.add("/", function () { router.go("/inicio", true); });

    if (app.state.role === "client") {
      router.add("/inicio", V.clientHome);
      router.add("/categorias", V.categories);
      router.add("/solicitar", V.requestFlow);
      router.add("/atividade", V.clientActivity);
      router.add("/solicitacao/:id", V.requestDetail);
      router.add("/acompanhar/:id", V.tracking);
      router.add("/favoritos", V.favorites);
    } else if (app.state.role === "professional") {
      router.add("/inicio", V.proHome);
      router.add("/chamadas", V.proCalls);
      router.add("/oportunidades", function () { router.go("/chamadas", true); });
      router.add("/servicos", V.proBookings);
      router.add("/servico/:id", V.tracking);
      router.add("/ganhos", V.proEarnings);
      router.add("/avaliacoes", V.proReviews);
    } else {
      router.add("/inicio", function () { router.go("/admin", true); });
      // cada tela do admin passa pela permissão do papel na equipe
      var guard = function (path, view) {
        return function (params) {
          if (!canSee(path)) {
            app.setHeader("Sem acesso");
            app.view(ui.empty("🔒", "Esta área não faz parte do seu papel",
              "Peça ao dono da plataforma para ajustar suas permissões em Equipe.",
              '<a class="sg-btn sg-btn--primary" href="#/admin">Voltar às métricas</a>'));
            return;
          }
          return view(params);
        };
      };
      var add = router.add;
      router.add = function (path, view) {
        return add.call(router, path, path.indexOf("/admin") === 0 ? guard(path.replace(/\/:id$/, ""), view) : view);
      };
      router.add("/admin", V.adminMetrics);
      router.add("/admin/usuarios/:id", V.adminUser360);
      router.add("/admin/solicitacoes/:id", V.adminRequest360);
      router.add("/admin/conversas", V.adminConversations);
      router.add("/admin/chamadas", V.adminDispatch);
      router.add("/admin/equipe", V.adminTeam);
      router.add("/admin/suporte", V.adminStaff);
      router.add("/admin/controles", V.adminControls);
      router.add("/admin/relatorios", V.adminExports);
      router.add("/admin/usuarios", V.adminUsers);
      router.add("/admin/profissionais", V.adminProfessionals);
      router.add("/admin/solicitacoes", V.adminRequests);
      router.add("/admin/avaliacoes", V.adminReviews);
      router.add("/admin/denuncias", V.adminReports);
      router.add("/admin/categorias", V.adminCategories);
      router.add("/admin/verificacoes", V.adminVerifications);
      router.add("/admin/financeiro", V.adminFinance);
      router.add("/admin/comunicados", V.adminBroadcast);
      router.add("/admin/configuracoes", V.adminSettings);
      router.add("/admin/reengajamento", V.adminEngagement);
      router.add("/admin/disputas", V.adminDisputes);
      router.add("/admin/disputas/:id", V.adminDispute);
      router.add("/admin/auditoria", V.adminAudit);
      router.add = add;
    }

    // comuns
    router.add("/profissional/:id", V.professionalProfile);
    router.add("/mensagens", V.chat);
    router.add("/mensagens/:id", V.chat);
    router.add("/perfil", V.profile);
    router.add("/ajuda", V.help);
    router.setNotFound(function () {
      app.setHeader("Página não encontrada");
      app.view(ui.empty("🧭", "Não encontramos esta página",
        "O endereço acessado não existe ou foi movido.",
        '<a class="sg-btn sg-btn--primary" href="#/inicio">Voltar ao início</a>'));
    });
  }

  /* ---- Bootstrap ---------------------------------------------------------- */
  app.start = function () {
    SG.initSupabase();
    ui.$("#root").innerHTML =
      '<div style="min-height:100dvh;display:grid;place-items:center"><div class="sg-spinner sg-spinner--lg"></div></div>';

    // taxa da plataforma e demais configurações (sem a tabela, fica o padrão do config.js)
    var settings = api.settings.load().catch(function (e) {
      console.warn("[ServeGo] Configurações não carregadas (rode sql/07_settings.sql):", e);
    });

    settings.then(function () { return api.auth.me(); }).then(function (me) {
      if (!me) { SG.views.auth(); return; }
      if (me.status === "blocked") {
        SG.views.auth({ blocked: true });
        return;
      }
      var isOwner = String(me.email || "").toLowerCase() === String(SG.config.owner.email).toLowerCase();
      var st = SG.settings || {};
      // modo manutenção (Controles do app): só a equipe entra
      if ((st.maintenance_mode === true || st.maintenance_mode === "true") && me.role !== "admin" && !isOwner) {
        app.maintenance(st.maintenance_message);
        return;
      }
      var cfg = Object.assign({}, SG.config.identity || {});
      if (st.require_identity === false || st.require_identity === "false") cfg.required = false;
      // Verificação de identidade obrigatória (documento + CPF + selfie) para
      // clientes e profissionais. O dono/admin é dispensado.
      // (sem a coluna identity_status, o sql/06_identity.sql ainda não foi rodado)
      if (me.identity_status === undefined && cfg.required && !api.isDemo) {
        console.warn("[ServeGo] Rode sql/06_identity.sql para ativar a verificação de identidade.");
      }
      if (cfg.required && !isOwner && me.role !== "admin" &&
          me.identity_status !== undefined && me.identity_status !== "approved") {
        if (!(me.identity_status === "pending" && !cfg.requireApproval)) {
          SG.views.identityGate(me);
          return;
        }
      }
      app.enter(me);
    }).catch(function (err) {
      console.error(err);
      SG.views.auth({ error: SG.explainError(err) });
    });
  };

  /** Tela de manutenção para clientes e profissionais. */
  app.maintenance = function (msg) {
    ui.$("#root").innerHTML =
      '<div class="maint"><div class="maint__card">' + SG.brandLogo({ size: "lg" }) +
        '<div class="maint__ic">' + SG.icon("settings", 26) + "</div>" +
        "<h1>Voltamos já</h1><p>" + ui.esc(msg || "Estamos fazendo uma melhoria rápida. Volte em instantes.") + "</p>" +
        '<button class="sg-btn sg-btn--secondary" id="maintOut">' + SG.icon("logout", 15) + "Sair</button>" +
      "</div></div>";
    ui.$("#maintOut").addEventListener("click", function () {
      api.auth.signOut().then(function () { location.reload(); });
    });
  };

  /** Monta o shell e libera a navegação (identidade já verificada). */
  app.enter = function (me) {
    app.state.me = me;
    app.state.role = me.role || "client";
    // O painel admin abre para quem tem role = admin no banco (dono e equipe).
    // Quem é admin é decidido no banco (sql/05_admin.sql e 12_admin_control.sql);
    // o papel na equipe (admin_role) limita as telas — ver canSee().
    if (app.state.role === "admin" && !me.admin_role &&
        String(me.email || "").toLowerCase() === String(SG.config.owner.email).toLowerCase()) {
      me.admin_role = "owner";
    }
    app.renderShell();
    registerRoutes();
    router.start();

    app.loadNotifications();
    app.refreshUnread();
    app.refreshAdminBadges();
    api.profiles.touchLastSeen(me.id);
    // profissional: alerta de chamada em qualquer tela
    if (app.state.role === "professional" && SG.proCalls) {
      if (app.callsUnsub) { try { app.callsUnsub(); } catch (e) {} }
      app.callsUnsub = SG.proCalls.watch(me);
    }
    // assinatura de sessão (não é limpa entre telas)
    if (app.globalUnsub) { try { app.globalUnsub(); } catch (e) {} }
    app.globalUnsub = api.notifications.subscribe(me.id, function (n) {
      app.state.notifications.unshift(n);
      updateNotifDot();
      ui.toast(n.title, { text: n.body, type: "info" });
      app.refreshUnread();
    });
  };

  SG.app = app;
})(window.SG);
