/* ==========================================================================
   ServeGo — Telas do administrador
   Métricas, verificações de identidade, usuários, profissionais,
   solicitações, financeiro, avaliações, denúncias, categorias, comunicados
   e auditoria. Tudo consome SG.api (nunca o SDK direto).
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api, app = SG.app;
  SG.views = SG.views || {};

  /* Dicionário local: ui.labels não tem rótulos de denúncia. */
  var REPORT_STATUS = {
    open: "Aberta",
    reviewing: "Em análise",
    resolved: "Resolvida",
    dismissed: "Descartada"
  };

  var ROLE_LABEL = { client: "Cliente", professional: "Profissional", admin: "Administrador" };

  var IDENTITY_LABEL = {
    not_submitted: "Não enviada",
    pending: "Em análise",
    approved: "Verificada",
    rejected: "Recusada"
  };

  var DOC_LABEL = { rg: "RG", cnh: "CNH", rne: "RNE / CRNM" };

  var TX_STATUS = { pending: "A liberar", released: "Liberada", refunded: "Estornada" };
  var PAY_STATUS = { pending: "Aguardando", paid: "Pago · retido", refunded: "Estornado", failed: "Recusado", expired: "Expirado" };

  var AUDIT_LABEL = {
    "identity.approved": "Identidade aprovada",
    "identity.rejected": "Identidade recusada",
    "user.blocked": "Conta bloqueada",
    "user.unblocked": "Conta desbloqueada",
    "professional.approved": "Profissional aprovado",
    "professional.rejected": "Profissional rejeitado",
    "document.approved": "Documento aprovado",
    "document.rejected": "Documento recusado",
    "report.resolved": "Denúncia resolvida",
    "report.dismissed": "Denúncia descartada",
    "transaction.released": "Repasse liberado",
    "transaction.refunded": "Transação estornada",
    "broadcast.sent": "Comunicado enviado",
    "settings.fee": "Taxa da plataforma alterada",
    "payment.refunded": "Pagamento estornado",
    "dispute.release": "Disputa: pagamento liberado ao profissional",
    "dispute.refund": "Disputa: estorno ao cliente",
    "dispute.info": "Disputa: pedido de informações",
    "reminder.sent": "Lembrete enviado a contas inativas",
    "reminder.whatsapp": "Lembrete pelo WhatsApp",
    "user.edited": "Dados da conta editados",
    "user.suspended": "Conta suspensa temporariamente",
    "user.unsuspended": "Suspensão removida",
    "user.anonymized": "Conta anonimizada (LGPD)",
    "professional.edited": "Perfil profissional editado",
    "professional.categories": "Especialidades alteradas",
    "professional.featured": "Profissional em destaque",
    "professional.unfeatured": "Destaque removido",
    "team.role": "Papel / permissão alterado",
    "notification.sent": "Notificação enviada",
    "request.redispatch": "Chamada relançada",
    "request.cancelled": "Pedido cancelado pela equipe",
    "booking.status": "Situação do serviço alterada",
    "review.hidden": "Avaliação ocultada",
    "review.restored": "Avaliação reexibida",
    "review.reply_removed": "Resposta de avaliação removida",
    "settings.update": "Configuração alterada",
    "staff.created": "Conta da equipe criada",
    "staff.password": "Nova senha temporária gerada",
    "staff.link": "Link de acesso enviado"
  };

  /* ==========================================================================
     HELPERS COMPARTILHADOS
     ========================================================================== */

  /** Chip de filtro (mesmo padrão das telas do cliente). */
  function chip(value, label, active) {
    return '<button class="sg-chip ' + (active ? "is-active" : "") + '" data-chip="' + ui.esc(value) + '" role="tab" ' +
      'aria-selected="' + !!active + '">' + ui.esc(label) + "</button>";
  }

  /* Rótulo de cada linha de filtro (aparece à esquerda na barra de filtros). */
  var FILTER_LABEL = {
    kycFilters: "Situação", kycRoles: "Perfil", usrFilters: "Papel", usrIdentity: "Identidade",
    proFilters: "Cadastro", reqFilters: "Situação", finFilters: "Repasse", rvFilters: "Mostrar",
    rpFilters: "Situação", engPeriod: "Sem acesso há", engRole: "Perfil", dsFilters: "Situação",
    auFilters: "Tipo de ação", cvFilters: "Mostrar", dpFilters: "Resposta", bcAudience: "Público"
  };

  /** Linha de chips já com o container. */
  function chipRow(id, items, activeValue) {
    var label = FILTER_LABEL[id] || "";
    return '<div class="sg-seg-wrap"' + (label ? ' data-label="' + ui.esc(label) + '"' : "") + '><div class="sg-seg" role="tablist" id="' + id + '"' +
      (label ? ' aria-label="' + ui.esc(label) + '"' : "") + ">" +
      items.map(function (it) { return chip(it[0], it[1], it[0] === activeValue); }).join("") +
      "</div></div>";
  }

  /** Números ao lado de cada chip: count(valor) diz quantos itens a opção mostraria. */
  function chipCounts(id, count) { ui.segCounts(id, "data-chip", count); }

  /** Liga a troca de chips de um container a um callback. */
  function bindChips(id, onChange) {
    var host = ui.$("#" + id);
    if (!host) return;
    ui.on(host, "click", "[data-chip]", function (e, el) {
      ui.$$("#" + id + " .sg-chip").forEach(function (c) {
        c.classList.toggle("is-active", c === el);
        c.setAttribute("aria-selected", c === el);
      });
      onChange(el.getAttribute("data-chip"));
    });
  }

  /** Campo de busca padrão. */
  function searchBox(id, placeholder) {
    return ui.searchBar({ id: id, placeholder: placeholder, cls: "adm-search" });
  }

  function bindSearch(id, onChange) {
    var input = ui.$("#" + id);
    if (!input) return;
    input.addEventListener("input", ui.debounce(function () { onChange(input.value.trim().toLowerCase()); }, 200));
  }

  /** Barra de ferramentas: busca à esquerda, ações à direita. */
  function toolbar(left, right) {
    return '<div class="adm-toolbar"><div class="adm-toolbar__left">' + (left || "") + "</div>" +
      '<div class="adm-toolbar__right">' + (right || "") + "</div></div>";
  }

  function exportBtn(id) {
    return '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="' + id + '">' + SG.icon("doc", 14) + "Exportar CSV</button>";
  }

  /** Cartão de métrica no padrão do dashboard (ícone, tom e dica). */
  function metricCard(label, value, hint, href, icon, tone) {
    return SG.dash.kpi({ label: label, value: value, hint: hint, href: href, icon: icon || "activity", tone: tone || "gold" });
  }

  /** Linha de KPIs. */
  function kpiRow(html) { return '<div class="dash-kpis">' + html + "</div>"; }

  /** Badge de verificação do profissional. */
  function verificationBadge(status) {
    var tone = ui.statusTone(status);
    return '<span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' +
      ui.esc(ui.labels.verification[status] || status || "—") + "</span>";
  }

  /** Badge da verificação de identidade (documento + selfie). */
  function identityBadge(status) {
    var tone = { approved: "success", pending: "brand", rejected: "danger" }[status] || "";
    return '<span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' +
      (status === "approved" ? SG.icon("verified", 12) : "") +
      ui.esc(IDENTITY_LABEL[status] || "Não enviada") + "</span>";
  }

  /** Badge de status de conta. */
  function accountBadge(status) {
    return status === "blocked"
      ? '<span class="sg-badge sg-badge--danger">Bloqueado</span>'
      : '<span class="sg-badge sg-badge--success">Ativo</span>';
  }

  function txBadge(status) {
    var tone = { released: "success", pending: "brand", refunded: "danger" }[status] || "";
    return '<span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' + ui.esc(TX_STATUS[status] || status) + "</span>";
  }

  /** Chave AAAA-MM-DD de uma data. */
  function dayKey(v) {
    var d = new Date(v);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  /** Série dos últimos N dias somando valueFn(item) por dia. */
  function dailySeries(items, days, valueFn) {
    var sums = {};
    (items || []).forEach(function (r) {
      var k = dayKey(r.created_at);
      sums[k] = (sums[k] || 0) + (valueFn ? valueFn(r) : 1);
    });
    var serie = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      var k2 = dayKey(d);
      serie.push({
        chave: k2,
        rotulo: days > 7
          ? d.toLocaleDateString(SG.config.app.locale, { day: "2-digit", month: "2-digit" })
          : d.toLocaleDateString(SG.config.app.locale, { weekday: "short" }).replace(".", ""),
        valor: sums[k2] || 0
      });
    }
    return serie;
  }

  /** Exporta linhas para CSV (separador ";" e BOM — abre direto no Excel pt-BR). */
  function downloadCsv(filename, columns, rows) {
    function cell(v) {
      var s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var lines = [columns.map(function (c) { return cell(c[0]); }).join(";")];
    rows.forEach(function (r) {
      lines.push(columns.map(function (c) { return cell(c[1](r)); }).join(";"));
    });
    var blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename + "-" + dayKey(new Date()) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    ui.toast("Arquivo exportado", { type: "success", text: ui.num(rows.length) + " linha(s)" });
  }

  /** Visualizador de imagem em tela cheia com zoom. */
  function openImage(url, title) {
    var m = ui.modal({
      title: title || "Imagem",
      size: "xl",
      body: '<div class="adm-viewer"><img src="' + ui.esc(url) + '" alt="' + ui.esc(title || "") + '"></div>' +
        '<div class="sg-row" style="gap:8px;justify-content:center;margin-top:12px">' +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-zoom="-1">−</button>' +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-zoom="0">100%</button>' +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-zoom="1">+</button>' +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-rotate>' + SG.icon("refresh", 14) + "Girar</button>" +
        "</div>"
    });
    var img = m.el.querySelector(".adm-viewer img");
    var scale = 1, rot = 0;
    function apply() { img.style.transform = "scale(" + scale + ") rotate(" + rot + "deg)"; }
    m.el.querySelectorAll("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () {
        var z = Number(b.getAttribute("data-zoom"));
        scale = z === 0 ? 1 : Math.min(4, Math.max(0.5, scale + z * 0.5));
        apply();
      });
    });
    m.el.querySelector("[data-rotate]").addEventListener("click", function () { rot = (rot + 90) % 360; apply(); });
  }

  function cpfCell(cpf) {
    if (!cpf) return '<span class="sg-faint">—</span>';
    var masked = SG.cpf.format(cpf);
    var ok = SG.cpf.digits(cpf).length !== 11 || SG.cpf.valid(cpf);
    return '<span class="sg-numeric">' + ui.esc(masked) + "</span>" +
      (ok ? "" : ' <span class="sg-badge sg-badge--danger">inválido</span>');
  }

  function ageFrom(iso) {
    if (!iso) return null;
    var b = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (isNaN(b)) return null;
    var n = new Date();
    var a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a;
  }

  /** 12,5% */
  function pct(v) {
    if (v === null || v === undefined || v === "") return "—";
    return Number(v).toLocaleString(SG.config.app.locale, { maximumFractionDigits: 2 }) + "%";
  }

  function kv(label, value) {
    return '<div class="adm-kv"><span class="adm-kv__k">' + ui.esc(label) + '</span><span class="adm-kv__v">' + value + "</span></div>";
  }

  /* ==========================================================================
     ANÁLISE DE IDENTIDADE (modal reutilizado por Verificações e Usuários)
     ========================================================================== */
  function openVerificationReview(v, opts) {
    opts = opts || {};
    var cfg = SG.config.identity;
    var u = v.user || {};
    var pending = v.status === "pending";
    var age = ageFrom(u.birth_date);
    var cpfOk = SG.cpf.digits(u.cpf).length === 11 ? SG.cpf.valid(u.cpf) : null;

    var m = ui.modal({
      title: "Análise de identidade",
      size: "xl",
      body:
        '<div class="kyc">' +
          '<div class="kyc__media">' +
            '<div class="kyc__compare">' +
              '<div class="kyc__img kyc__img--doc" data-img="front"><div class="sg-skel" style="height:100%"></div></div>' +
              '<div class="kyc__img kyc__img--selfie" data-img="selfie"><div class="sg-skel" style="height:100%"></div></div>' +
            "</div>" +
            '<div class="kyc__img kyc__img--doc kyc__img--back" data-img="back"><div class="sg-skel" style="height:100%"></div></div>' +
            '<p class="sg-xs sg-faint" style="margin-top:8px">Clique em uma imagem para ampliar, dar zoom ou girar. Os links expiram em 10 minutos.</p>' +
          "</div>" +
          '<div class="kyc__side">' +
            '<div class="sg-row" style="gap:12px;margin-bottom:14px">' + ui.avatar(u, "lg") +
              '<div style="min-width:0"><div class="sg-strong sg-truncate">' + ui.esc(u.full_name || "—") + "</div>" +
              '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(u.email || "") + "</div>" +
              '<div class="sg-row" style="gap:6px;margin-top:6px"><span class="sg-badge">' + ui.esc(ROLE_LABEL[u.role] || "—") + "</span>" +
                identityBadge(v.status) + "</div></div></div>" +
            '<div class="adm-kvs">' +
              kv("CPF", cpfCell(u.cpf) + (cpfOk === true ? ' <span class="sg-badge sg-badge--success">válido</span>' : "")) +
              kv("Nascimento", u.birth_date ? ui.date(u.birth_date) + (age !== null ? " · " + age + " anos" : "") : "—") +
              kv("Documento", ui.esc(DOC_LABEL[v.doc_type] || v.doc_type || "—")) +
              kv("Celular", ui.esc(u.phone || "—")) +
              kv("Cidade", ui.esc((u.city || "—") + (u.state ? " · " + u.state : ""))) +
              kv("Conta criada", u.created_at ? ui.dateTime(u.created_at) : "—") +
              kv("Enviado em", ui.dateTime(v.created_at)) +
            "</div>" +
            (pending
              ? '<div class="kyc__check">' +
                  '<div class="sg-xs sg-strong" style="margin-bottom:8px">Checklist da análise</div>' +
                  check("c1", "Documento legível, inteiro e sem sinais de adulteração") +
                  check("c2", "Rosto da selfie corresponde à foto do documento") +
                  check("c3", "Nome e data de nascimento conferem com o cadastro") +
                  check("c4", "Frente e verso são do mesmo documento") +
                "</div>" +
                '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="kycReason">Motivo da recusa</label>' +
                  '<select class="sg-select" id="kycReason"><option value="">Selecione (obrigatório para recusar)</option>' +
                  cfg.rejectionReasons.map(function (r) { return "<option>" + ui.esc(r) + "</option>"; }).join("") +
                  '<option value="__other">Outro motivo…</option></select>' +
                  '<textarea class="sg-textarea sg-hide" id="kycOther" style="margin-top:8px" placeholder="Explique ao usuário o que precisa ser corrigido"></textarea>' +
                "</div>"
              : '<div class="idnotice ' + (v.status === "rejected" ? "idnotice--danger" : "idnotice--success") + '" style="margin-top:14px">' +
                  SG.icon(v.status === "rejected" ? "alert" : "checkCircle", 18) +
                  "<div><div class=\"sg-md sg-strong\">" + (v.status === "rejected" ? "Recusada" : "Aprovada") +
                  (v.reviewed_at ? " em " + ui.dateTime(v.reviewed_at) : "") + "</div>" +
                  (v.rejection_reason ? '<div class="sg-sm">' + ui.esc(v.rejection_reason) + "</div>" : "") + "</div></div>") +
          "</div>" +
        "</div>",
      footer: pending
        ? '<button class="sg-btn sg-btn--ghost" data-close>Fechar</button>' +
          '<button class="sg-btn sg-btn--danger" data-decide="rejected">' + SG.icon("x", 15) + "Recusar</button>" +
          '<button class="sg-btn sg-btn--primary" data-decide="approved" disabled>' + SG.icon("check", 15) + "Aprovar identidade</button>"
        : '<button class="sg-btn sg-btn--ghost" data-close>Fechar</button>'
    });

    function check(id, text) {
      return '<label class="kyc__checkitem"><input type="checkbox" data-check="' + id + '"><span>' + ui.esc(text) + "</span></label>";
    }

    api.admin.verificationImages(v).then(function (imgs) {
      [["front", "Documento · frente"], ["back", "Documento · verso"], ["selfie", "Selfie"]].forEach(function (pair) {
        var host = m.el.querySelector('[data-img="' + pair[0] + '"]');
        if (!host) return;
        host.innerHTML = '<img src="' + ui.esc(imgs[pair[0]]) + '" alt="' + pair[1] + '"><span class="kyc__tag">' + pair[1] + "</span>";
        host.addEventListener("click", function () { openImage(imgs[pair[0]], pair[1]); });
      });
    }).catch(function (e) {
      ui.$$(".kyc__img", m.el).forEach(function (h) {
        h.innerHTML = '<div class="sg-xs sg-dim" style="padding:16px">' + ui.esc(SG.explainError(e)) + "</div>";
      });
    });

    if (!pending) return m;

    var approveBtn = m.el.querySelector('[data-decide="approved"]');
    var reasonSel = m.el.querySelector("#kycReason");
    var other = m.el.querySelector("#kycOther");
    function allChecked() {
      return ui.$$("[data-check]", m.el).every(function (c) { return c.checked; });
    }
    ui.$$("[data-check]", m.el).forEach(function (c) {
      c.addEventListener("change", function () { approveBtn.disabled = !allChecked(); });
    });
    reasonSel.addEventListener("change", function () {
      other.classList.toggle("sg-hide", reasonSel.value !== "__other");
    });

    ui.$$("[data-decide]", m.el).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var status = btn.getAttribute("data-decide");
        var reason = null;
        if (status === "rejected") {
          reason = reasonSel.value === "__other" ? other.value.trim() : reasonSel.value;
          if (!reason) {
            ui.toast("Informe o motivo da recusa", { type: "error", text: "O usuário verá esse motivo para corrigir o envio." });
            reasonSel.focus();
            return;
          }
        } else if (!allChecked()) {
          return;
        }
        ui.busy(btn, true);
        api.admin.reviewVerification(v.id, status, reason).then(function () {
          v.status = status;
          v.rejection_reason = reason;
          v.reviewed_at = new Date().toISOString();
          if (v.user) v.user.identity_status = status;
          m.close();
          ui.toast(status === "approved" ? "Identidade aprovada" : "Verificação recusada", {
            type: status === "approved" ? "success" : "info",
            text: u.full_name
          });
          app.refreshAdminBadges();
          if (opts.onDecided) opts.onDecided(v);
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });
    return m;
  }

  /* ==========================================================================
     FICHA DO USUÁRIO (modal)
     ========================================================================== */
  function openUserDetail(id, opts) {
    // a ficha completa (360°) é uma página própria: js/views/admin-control.js
    if (!(opts && opts.modal)) {
      Array.prototype.forEach.call(document.querySelectorAll(".sg-overlay"), function (o) { o.remove(); });
      document.body.style.overflow = "";
      SG.router.go("/admin/usuarios/" + id);
      return;
    }
    opts = opts || {};
    var m = ui.modal({
      title: "Ficha do usuário",
      size: "lg",
      body: '<div id="udBody">' + ui.skeletonCard(2) + "</div>",
      footer: '<button class="sg-btn sg-btn--ghost" data-close>Fechar</button><span id="udActions"></span>'
    });

    api.admin.userDetail(id).then(function (u) {
      if (!u) {
        ui.$("#udBody", m.el).innerHTML = ui.empty("🔍", "Usuário não encontrado", "");
        return;
      }
      var v = u.verification;
      var pro = u.professional;
      var age = ageFrom(u.birth_date);
      ui.$("#udBody", m.el).innerHTML =
        '<div class="sg-row sg-row--wrap" style="gap:14px;margin-bottom:18px">' + ui.avatar(u, "lg") +
          '<div style="min-width:0;flex:1"><div class="sg-strong" style="font-size:1.1rem">' + ui.esc(u.full_name || "—") + "</div>" +
          '<div class="sg-xs sg-dim">' + ui.esc(u.email || "") + "</div>" +
          '<div class="sg-row sg-row--wrap" style="gap:6px;margin-top:8px">' +
            '<span class="sg-badge">' + ui.esc(ROLE_LABEL[u.role] || "—") + "</span>" +
            accountBadge(u.status) + identityBadge(u.identity_status) +
            (pro ? verificationBadge(pro.verification_status) : "") +
          "</div></div></div>" +

        '<div class="sg-grid sg-grid--4 adm-mini-stats">' +
          miniStat("Solicitações", u.stats.solicitacoes) +
          miniStat("Serviços", u.stats.servicos) +
          miniStat("Avaliações", u.stats.avaliacoes) +
          miniStat("Denúncias recebidas", u.stats.denuncias, u.stats.denuncias > 0) +
        "</div>" +

        '<div class="app-section-title" style="margin-top:20px"><h3>Dados cadastrais</h3></div>' +
        '<div class="adm-kvs adm-kvs--2">' +
          kv("CPF", cpfCell(u.cpf)) +
          kv("Nascimento", u.birth_date ? ui.date(u.birth_date) + (age !== null ? " · " + age + " anos" : "") : "—") +
          kv("Celular", ui.esc(u.phone || "—")) +
          kv("Cidade", ui.esc((u.city || "—") + (u.state ? " · " + u.state : ""))) +
          kv("Cadastro", ui.dateTime(u.created_at)) +
          (pro ? kv("Nota", ui.rating(pro.rating || 0) + " · " + ui.num(pro.jobs_count) + " serviços") : "") +
        "</div>" +

        '<div class="app-section-title" style="margin-top:20px"><h3>Verificação de identidade</h3></div>' +
        (v
          ? '<div class="sg-row sg-row--between sg-row--wrap" style="gap:12px">' +
              '<div class="sg-sm sg-dim">' + ui.esc(DOC_LABEL[v.doc_type] || v.doc_type) + " enviado " + ui.timeAgo(v.created_at) +
              (v.rejection_reason ? '<div class="sg-xs" style="color:var(--sg-danger);margin-top:4px">' + ui.esc(v.rejection_reason) + "</div>" : "") +
              "</div>" +
              '<button class="sg-btn ' + (v.status === "pending" ? "sg-btn--primary" : "sg-btn--outline") + ' sg-btn--sm" id="udReview">' +
                SG.icon("eye", 14) + (v.status === "pending" ? "Analisar agora" : "Ver documentos") + "</button>" +
            "</div>"
          : '<p class="sg-sm sg-dim">Nenhum documento enviado ainda.</p>') +

        '<div class="app-section-title" style="margin-top:20px"><h3>Histórico administrativo</h3></div>' +
        (u.history && u.history.length
          ? '<div class="sg-stack-sm">' + u.history.map(function (h) {
              return '<div class="sg-row sg-row--between sg-xs"><span>' + ui.esc(AUDIT_LABEL[h.action] || h.action) +
                (h.details && h.details.motivo ? ' <span class="sg-dim">· ' + ui.esc(h.details.motivo) + "</span>" : "") +
                '</span><span class="sg-faint">' + ui.dateTime(h.created_at) + "</span></div>";
            }).join("") + "</div>"
          : '<p class="sg-sm sg-dim">Nenhuma ação registrada para esta conta.</p>');

      var review = ui.$("#udReview", m.el);
      if (review) review.addEventListener("click", function () {
        v.user = u;
        openVerificationReview(v, {
          onDecided: function () { m.close(); openUserDetail(id, opts); if (opts.onChange) opts.onChange(); }
        });
      });

      // ações
      var acts = ui.$("#udActions", m.el);
      if (u.id !== app.state.me.id) {
        var blocked = u.status === "blocked";
        acts.innerHTML =
          (u.role === "professional" ? '<a class="sg-btn sg-btn--secondary" href="#/profissional/' + ui.esc(u.id) + '" data-close>Perfil público</a>' : "") +
          '<button class="sg-btn ' + (blocked ? "sg-btn--outline" : "sg-btn--danger") + '" id="udBlock">' +
          SG.icon(blocked ? "check" : "ban", 15) + (blocked ? "Desbloquear" : "Bloquear") + "</button>";
        ui.$("#udBlock", m.el).addEventListener("click", function () {
          var btn = this;
          var next = blocked ? "active" : "blocked";
          ui.confirm({
            title: blocked ? "Desbloquear conta?" : "Bloquear conta?",
            text: blocked ? u.full_name + " poderá entrar novamente." : u.full_name + " perderá o acesso imediatamente.",
            okText: blocked ? "Sim, desbloquear" : "Sim, bloquear",
            danger: !blocked
          }).then(function (ok) {
            if (!ok) return;
            ui.busy(btn, true);
            api.admin.setUserStatus(u.id, next).then(function () {
              ui.toast(blocked ? "Conta desbloqueada" : "Conta bloqueada", { type: blocked ? "success" : "info", text: u.full_name });
              m.close();
              if (opts.onChange) opts.onChange();
            }).catch(function (err) { ui.busy(btn, false); ui.toast(SG.explainError(err), { type: "error" }); });
          });
        });
      }
    }).catch(function (e) {
      ui.$("#udBody", m.el).innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e));
    });

    function miniStat(label, value, warn) {
      return '<div class="adm-mini"><div class="adm-mini__v' + (warn ? " is-warn" : "") + '">' + ui.num(value) + "</div>" +
        '<div class="sg-xs sg-dim">' + ui.esc(label) + "</div></div>";
    }
  }

  /* ==========================================================================
     1. VISÃO GERAL (MÉTRICAS)
     ========================================================================== */
  SG.views.adminMetrics = function () {
    var D = SG.dash;
    app.setHeader("Visão geral", "Saúde do marketplace ServeGo");
    var period = 30;
    try { period = Number(localStorage.getItem("servego.dash.period")) || 30; } catch (e) { /* sem storage */ }
    var metric = "receita";

    app.view(
      '<div class="dash-head">' +
        '<div><h1>Visão geral</h1>' +
          '<p><span class="dash-live">Ao vivo</span><span id="mtUpdated">Carregando dados…</span></p></div>' +
        '<div class="dash-head__tools">' +
          '<div class="sg-seg-wrap"><div class="sg-seg" id="mtPeriod" role="tablist">' +
            [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"]].map(function (p) {
              return '<button class="sg-chip' + (p[0] === period ? " is-active" : "") + '" data-p="' + p[0] + '" role="tab">' + p[1] + "</button>";
            }).join("") +
          "</div></div>" +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="mtRefresh">' + SG.icon("refresh", 14) + "Atualizar</button>" +
        "</div>" +
      "</div>" +
      '<div class="dash-kpis" id="mtKpis">' + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + "</div>" +
      '<div class="dash-grid dash-grid--main">' +
        '<section class="dash-card" id="mtChart">' + ui.skeletonCard(1) + "</section>" +
        '<section class="dash-card" id="mtStatus">' + ui.skeletonCard(1) + "</section>" +
      "</div>" +
      '<div class="dash-stats" id="mtStats"></div>' +
      '<div class="dash-grid dash-grid--3" id="mtQueues">' +
        queueCard("Identidades em análise", "Documento + selfie", "#/admin/verificacoes", "mtKyc") +
        queueCard("Profissionais em análise", "Cadastros aguardando aprovação", "#/admin/profissionais", "mtPending") +
        queueCard("Moderação", "Denúncias e disputas abertas", "#/admin/disputas", "mtReports") +
      "</div>" +
      '<div class="dash-grid dash-grid--half">' +
        '<section class="dash-card" id="mtCats">' + ui.skeletonCard(1) + "</section>" +
        '<section class="dash-card" id="mtActivity">' + ui.skeletonCard(1) + "</section>" +
      "</div>",
      { className: "app-view--wide" }
    );

    function queueCard(title, sub, href, id) {
      return '<section class="dash-card">' +
        '<div class="dash-card__head"><div><h3 class="dash-card__title">' + title + "</h3>" +
          '<div class="dash-card__sub">' + sub + "</div></div>" +
          '<span class="dash-count" id="' + id + 'Count">…</span></div>' +
        '<div id="' + id + '">' + ui.skeletonCard(1) + "</div>" +
        '<a class="dash-link" href="' + href + '" style="margin-top:14px">Abrir fila ' + SG.icon("arrowRight", 13) + "</a>" +
      "</section>";
    }

    function setCount(id, n) {
      var el = ui.$("#" + id + "Count");
      if (!el) return;
      el.textContent = ui.num(n);
      el.classList.toggle("dash-count--zero", !n);
    }

    var data = null;

    /* ---- números do período ------------------------------------------------ */
    function paintKpis() {
      // mesmos dias de calendário do gráfico: período atual e o anterior, de igual tamanho
      var valid = data.tx.filter(function (t) { return t.status !== "refunded"; });
      function totals(fn) {
        var s = dailySeries(valid, period * 2, fn).map(function (d) { return d.valor; });
        var tot = function (arr) { return arr.reduce(function (a, v) { return a + v; }, 0); };
        return [tot(s.slice(period)), tot(s.slice(0, period))];
      }
      var f = totals(function (t) { return Number(t.platform_fee || 0); });
      var v = totals(function (t) { return Number(t.amount || 0); });
      var c = totals();
      var fee = f[0], feePrev = f[1], vol = v[0], volPrev = v[1];
      var cur = { length: c[0] }, prev = { length: c[1] };
      var ticket = cur.length ? vol / cur.length : 0, ticketPrev = prev.length ? volPrev / prev.length : 0;
      var sparkDays = Math.min(period, 30);
      function spark(fn) { return dailySeries(valid, sparkDays, fn).map(function (d) { return d.valor; }); }
      var label = "vs. " + period + " dias anteriores";

      ui.$("#mtKpis").innerHTML =
        D.kpi({ label: "Receita da plataforma", value: ui.money(fee), icon: "wallet", tone: "gold",
          delta: D.delta(fee, feePrev), hint: label, spark: spark(function (t) { return t.platform_fee; }), href: "#/admin/financeiro" }) +
        D.kpi({ label: "Volume transacionado", value: ui.money(vol), icon: "trending", tone: "green",
          delta: D.delta(vol, volPrev), hint: label, spark: spark(function (t) { return t.amount; }), href: "#/admin/financeiro" }) +
        D.kpi({ label: "Serviços pagos", value: ui.num(cur.length), icon: "checkCircle", tone: "blue",
          delta: D.delta(cur.length, prev.length), hint: label, spark: spark(), href: "#/admin/solicitacoes" }) +
        D.kpi({ label: "Ticket médio", value: ui.money(ticket), icon: "tag", tone: "violet",
          delta: D.delta(ticket, ticketPrev), hint: label, spark: (function () {
            var v = spark(function (t) { return t.amount; }), c = spark();
            return v.map(function (x, i) { return c[i] ? x / c[i] : 0; });
          })() });
    }

    function paintChart() {
      var valid = data.tx.filter(function (t) { return t.status !== "refunded"; });
      var M = {
        receita: { label: "Receita", fn: function (t) { return t.platform_fee; }, money: true },
        volume: { label: "Volume", fn: function (t) { return t.amount; }, money: true },
        servicos: { label: "Serviços", fn: null, money: false }
      }[metric];
      // série do período e do período anterior, alinhadas dia a dia
      var serie = dailySeries(valid, period, M.fn);
      var older = dailySeries(valid, period * 2, M.fn).slice(0, period);
      serie.forEach(function (d) {
        var dt = new Date(d.chave + "T12:00:00");
        d.dica = dt.toLocaleDateString(SG.config.app.locale, { weekday: "short", day: "2-digit", month: "short" });
        d.rotulo = dt.toLocaleDateString(SG.config.app.locale, { day: "2-digit", month: "short" }).replace(".", "");
      });
      var total = serie.reduce(function (s, d) { return s + d.valor; }, 0);
      var totalPrev = older.reduce(function (s, d) { return s + d.valor; }, 0);
      var fmt = M.money ? function (v) { return ui.money(v); } : function (v) { return ui.num(Math.round(v)); };

      ui.$("#mtChart").innerHTML =
        '<div class="dash-card__head">' +
          "<div>" +
            '<h3 class="dash-card__title">Desempenho</h3>' +
            '<div class="dash-card__sub">' + M.label + " por dia · últimos " + period + " dias</div>" +
            '<div class="dash-card__big"><b>' + fmt(total) + "</b>" + D.deltaBadge(D.delta(total, totalPrev)) + "</div>" +
          "</div>" +
          '<div class="sg-seg-wrap"><div class="sg-seg" id="mtMetric">' +
            [["receita", "Receita"], ["volume", "Volume"], ["servicos", "Serviços"]].map(function (x) {
              return '<button class="sg-chip' + (x[0] === metric ? " is-active" : "") + '" data-m="' + x[0] + '">' + x[1] + "</button>";
            }).join("") +
          "</div></div>" +
        "</div>" +
        D.areaChart(serie, { format: fmt, axis: M.money ? D.moneyAxis : function (v) { return ui.num(Math.round(v)); },
          label: M.label + " por dia", compare: older }) +
        '<div class="dash-chart-legend"><span><i></i>Período atual</span><span><i class="cmp"></i>Período anterior</span></div>';
    }

    function paintStatus() {
      var reqs = data.reqs;
      function count(list) { return reqs.filter(function (r) { return list.indexOf(r.status) >= 0; }).length; }
      var segs = [
        { label: "Concluídas", value: count(["completed"]), color: "var(--sg-success)" },
        { label: "Em andamento", value: count(["assigned", "in_progress"]), color: "var(--sg-info)" },
        { label: "Buscando / aguardando", value: count(["open", "matching", "awaiting_payment"]), color: "var(--sg-brand)" },
        { label: "Canceladas / sem profissional", value: count(["cancelled", "no_professional"]), color: "var(--sg-danger)" }
      ];
      var m = data.m;
      ui.$("#mtStatus").innerHTML =
        '<div class="dash-card__head"><div><h3 class="dash-card__title">Solicitações</h3>' +
          '<div class="dash-card__sub">Distribuição por situação</div></div>' +
          '<a class="dash-link" href="#/admin/solicitacoes">Ver todas ' + SG.icon("arrowRight", 13) + "</a></div>" +
        D.donut(segs, { center: "pedidos" }) +
        D.progress("Taxa de conclusão", Number(m.taxa_conclusao || 0), "Serviços contratados que terminaram confirmados pelo cliente");
    }

    function paintStats() {
      var m = data.m;
      var disputasAbertas = data.disputes.filter(function (d) { return d.status === "open" || d.status === "awaiting_info"; }).length;
      ui.$("#mtStats").innerHTML =
        D.stat({ label: "Usuários", value: ui.num(m.total_usuarios), icon: "users", tone: "blue", href: "#/admin/usuarios",
          hint: "+" + ui.num(m.novos_usuarios_7d || 0) + " nos últimos 7 dias" }) +
        D.stat({ label: "Profissionais", value: ui.num(m.total_profissionais), icon: "briefcase", tone: "violet", href: "#/admin/profissionais",
          hint: ui.num(m.profissionais_pendentes || 0) + " aguardando aprovação" }) +
        D.stat({ label: "Comissões a liberar", value: ui.money(m.receita_prevista || 0), icon: "lock", tone: "gold", href: "#/admin/financeiro",
          hint: "Retidas até a confirmação do cliente" }) +
        D.stat({ label: "Moderação", value: ui.num((m.denuncias_abertas || 0) + disputasAbertas), icon: "flag", tone: "red", href: "#/admin/disputas",
          hint: ui.num(m.denuncias_abertas || 0) + " denúncia(s) · " + ui.num(disputasAbertas) + " disputa(s)",
          alert: (m.denuncias_abertas || 0) + disputasAbertas ? "Atenção" : "" });
    }

    function queueItem(icon, tone, title, meta, href, cta) {
      return '<a class="dash-queue__item dash-tone--' + tone + '" href="' + href + '">' +
        '<span class="dash-ic">' + icon + "</span>" +
        '<div class="dash-queue__body"><div class="dash-queue__title">' + ui.esc(title) + "</div>" +
        '<div class="dash-queue__meta">' + ui.esc(meta) + "</div></div>" +
        '<span class="dash-queue__cta">' + cta + "</span></a>";
    }
    function emptyQueue(text) {
      return '<div class="dash-empty dash-tone--green"><span class="dash-ic">' + SG.icon("check", 16) + "</span>" + ui.esc(text) + "</div>";
    }

    function paintQueues() {
      var kyc = data.kyc;
      setCount("mtKyc", kyc.length);
      ui.$("#mtKyc").innerHTML = kyc.length
        ? '<div class="dash-queue">' + kyc.slice(0, 4).map(function (v) {
            var u = v.user || {};
            return queueItem(ui.esc(ui.initials(u.full_name || "?")), "blue", u.full_name || "—",
              (ROLE_LABEL[u.role] || "") + " · enviado " + ui.timeAgo(v.created_at), "#/admin/verificacoes", "Analisar");
          }).join("") + "</div>"
        : emptyQueue("Nenhuma identidade aguardando.");

      var pend = data.pending;
      setCount("mtPending", pend.length);
      ui.$("#mtPending").innerHTML = pend.length
        ? '<div class="dash-queue">' + pend.slice(0, 4).map(function (p) {
            return queueItem(ui.esc(ui.initials(p.full_name || "?")), "violet", p.full_name || "—",
              p.headline || "Profissional", "#/admin/profissionais", "Analisar");
          }).join("") + "</div>"
        : emptyQueue("Nenhum cadastro pendente.");

      var reports = data.reports.filter(function (r) { return r.status === "open" || r.status === "reviewing"; });
      var disputes = data.disputes.filter(function (d) { return d.status === "open" || d.status === "awaiting_info"; });
      setCount("mtReports", reports.length + disputes.length);
      var items = disputes.map(function (d) {
        return queueItem(SG.icon("alert", 16), "red", "Disputa · " + ((d.request && d.request.title) || "Serviço"),
          d.reason + " · " + ui.timeAgo(d.created_at), "#/admin/disputas/" + d.id, "Decidir");
      }).concat(reports.map(function (r) {
        return queueItem(SG.icon("flag", 16), "gold", r.reason,
          ((r.target && r.target.full_name) || "Usuário") + " · " + ui.timeAgo(r.created_at), "#/admin/denuncias", "Revisar");
      }));
      ui.$("#mtReports").innerHTML = items.length
        ? '<div class="dash-queue">' + items.slice(0, 4).join("") + "</div>"
        : emptyQueue("A moderação está em dia.");
    }

    function paintCats() {
      var by = {};
      data.reqs.forEach(function (r) {
        var c = r.category || {};
        var k = c.id || r.category_id || "?";
        if (!by[k]) by[k] = { cat: c, n: 0 };
        by[k].n++;
      });
      var rows = Object.keys(by).map(function (k) { return by[k]; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
      ui.$("#mtCats").innerHTML =
        '<div class="dash-card__head"><div><h3 class="dash-card__title">Categorias mais pedidas</h3>' +
          '<div class="dash-card__sub">Solicitações por tipo de serviço</div></div>' +
          '<a class="dash-link" href="#/admin/categorias">Gerenciar ' + SG.icon("arrowRight", 13) + "</a></div>" +
        (rows.length
          ? D.barList(rows.map(function (r) {
              return { label: r.cat.name || "Sem categoria", value: r.n, icon: SG.catIcon(r.cat, 17),
                display: ui.num(r.n) + " pedido" + (r.n === 1 ? "" : "s") };
            }))
          : emptyQueue("Ainda não há solicitações."));
    }

    function paintActivity() {
      var tones = { approved: "green", released: "green", resolved: "green", unblocked: "green", rejected: "red", blocked: "red", refunded: "red" };
      var list = data.audit.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 6);
      ui.$("#mtActivity").innerHTML =
        '<div class="dash-card__head"><div><h3 class="dash-card__title">Atividade recente</h3>' +
          '<div class="dash-card__sub">Últimas ações da equipe</div></div>' +
          '<a class="dash-link" href="#/admin/auditoria">Auditoria ' + SG.icon("arrowRight", 13) + "</a></div>" +
        (list.length
          ? '<ul class="dash-timeline">' + list.map(function (a) {
              var key = (a.action.split(".")[1] || "");
              var tone = tones[key] || "gold";
              return '<li class="dash-tone--' + tone + '"><span class="dash-ic">' +
                SG.icon(tone === "green" ? "check" : tone === "red" ? "x" : "activity", 14) + "</span>" +
                '<div class="dash-timeline__body"><div class="dash-timeline__title">' + ui.esc(AUDIT_LABEL[a.action] || a.action) +
                  (a.target && a.target.full_name ? " · " + ui.esc(a.target.full_name) : "") + "</div>" +
                '<div class="dash-timeline__meta">' + ui.esc((a.admin && a.admin.full_name) || "Equipe") + " · " + ui.timeAgo(a.created_at) + "</div></div></li>";
            }).join("") + "</ul>"
          : emptyQueue("Nenhuma ação registrada ainda."));
    }

    function paintAll() {
      ui.$("#mtUpdated").textContent = "Atualizado às " + ui.time(new Date()) + " · comparando com os " + period + " dias anteriores";
      paintKpis(); paintChart(); paintStatus(); paintStats(); paintQueues(); paintCats(); paintActivity();
    }

    function load() {
      return Promise.all([
        api.admin.metrics(),
        api.admin.listTransactions(),
        api.requests.listAll(),
        api.admin.listVerifications({ status: "pending" }),
        api.professionals.listAll({ status: "pending" }),
        api.admin.listReports(),
        api.disputes.list().catch(function () { return []; }),
        api.admin.listAudit().catch(function () { return []; })
      ]).then(function (r) {
        data = { m: r[0] || {}, tx: r[1] || [], reqs: r[2] || [], kyc: r[3] || [], pending: r[4] || [],
          reports: r[5] || [], disputes: r[6] || [], audit: r[7] || [] };
        paintAll();
      }).catch(function (e) {
        ui.$("#mtKpis").innerHTML = "";
        ui.$("#mtChart").innerHTML = ui.empty("⚠️", "Não foi possível carregar o painel", SG.explainError(e));
      });
    }
    load();

    ui.on(ui.$("#mtPeriod"), "click", "[data-p]", function (e, el) {
      period = Number(el.getAttribute("data-p"));
      try { localStorage.setItem("servego.dash.period", String(period)); } catch (err) { /* sem storage */ }
      ui.$$("#mtPeriod .sg-chip").forEach(function (c) { c.classList.toggle("is-active", c === el); });
      if (data) paintAll();
    });
    ui.on(ui.$("#mtChart"), "click", "[data-m]", function (e, el) {
      metric = el.getAttribute("data-m");
      paintChart();
    });
    ui.$("#mtRefresh").addEventListener("click", function () {
      var b = this;
      ui.busy(b, true);
      load().then(function () { ui.busy(b, false); ui.toast("Painel atualizado", { type: "success" }); });
    });
  };

  /* ==========================================================================
     2. VERIFICAÇÕES DE IDENTIDADE
     ========================================================================== */
  SG.views.adminVerifications = function () {
    app.setHeader("Verificações", "Documento com foto, CPF e selfie");
    app.view(
      '<div class="app-page-head"><h1>Verificações de identidade</h1>' +
        "<p>Compare a selfie com a foto do documento, confira o CPF e libere (ou recuse) o acesso de clientes e profissionais.</p></div>" +
      '<div id="kycStats"></div>' +
      toolbar(searchBox("kycSearch", "Buscar por nome, e-mail ou CPF…"), exportBtn("kycCsv")) +
      chipRow("kycFilters", [
        ["pending", "Em análise"], ["approved", "Aprovadas"], ["rejected", "Recusadas"], ["all", "Todas"]
      ], "pending") +
      chipRow("kycRoles", [["all", "Todos os perfis"], ["client", "Clientes"], ["professional", "Profissionais"]], "all") +
      '<div id="kycList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var filter = "pending", role = "all", query = "";

    function matches(v) {
      var u = v.user || {};
      if (filter !== "all" && v.status !== filter) return false;
      if (role !== "all" && u.role !== role) return false;
      if (!query) return true;
      var hay = [(u.full_name || ""), (u.email || ""), SG.cpf.digits(u.cpf), (u.cpf || "")].join(" ").toLowerCase();
      return hay.indexOf(query) >= 0 || (SG.cpf.digits(query) && hay.indexOf(SG.cpf.digits(query)) >= 0);
    }

    function stats() {
      var c = { pending: 0, approved: 0, rejected: 0 };
      all.forEach(function (v) { if (c[v.status] !== undefined) c[v.status]++; });
      var oldest = all.filter(function (v) { return v.status === "pending"; })
        .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); })[0];
      ui.$("#kycStats").innerHTML =
        kpiRow(
          metricCard("Em análise", ui.num(c.pending), "Aguardando decisão", null, "clock", "gold") +
          metricCard("Aprovadas", ui.num(c.approved), "Identidades verificadas", null, "verified", "green") +
          metricCard("Recusadas", ui.num(c.rejected), "Precisam reenviar", null, "x", "red") +
          metricCard("Mais antiga na fila", oldest ? ui.timeAgo(oldest.created_at) : "—", "Meta: responder em até 24h", null, "alert", "blue"));
    }

    function card(v) {
      var u = v.user || {};
      return '<div class="sg-card kyc-card" data-kyc="' + ui.esc(v.id) + '">' +
        '<div class="kyc-card__thumbs" data-open="' + ui.esc(v.id) + '">' +
          '<span class="kyc-card__thumb"><span class="sg-skel"></span></span>' +
          '<span class="kyc-card__thumb kyc-card__thumb--selfie"><span class="sg-skel"></span></span>' +
        "</div>" +
        '<div class="kyc-card__info">' +
          '<div class="sg-row" style="gap:8px;flex-wrap:wrap">' +
            '<span class="sg-strong">' + ui.esc(u.full_name || "—") + "</span>" +
            '<span class="sg-badge">' + ui.esc(ROLE_LABEL[u.role] || "—") + "</span>" +
            identityBadge(v.status) +
          "</div>" +
          '<div class="sg-xs sg-dim" style="margin-top:4px">' + ui.esc(u.email || "") + "</div>" +
          '<div class="sg-row sg-row--wrap sg-xs sg-dim" style="gap:14px;margin-top:10px">' +
            "<span>CPF " + cpfCell(u.cpf) + "</span>" +
            "<span>" + SG.icon("doc", 12) + " " + ui.esc(DOC_LABEL[v.doc_type] || v.doc_type) + "</span>" +
            "<span>" + SG.icon("clock", 12) + " " + ui.timeAgo(v.created_at) + "</span>" +
          "</div>" +
          (v.rejection_reason ? '<div class="sg-xs" style="margin-top:8px;color:var(--sg-danger)">' + ui.esc(v.rejection_reason) + "</div>" : "") +
        "</div>" +
        '<div class="kyc-card__act">' +
          '<button class="sg-btn ' + (v.status === "pending" ? "sg-btn--primary" : "sg-btn--secondary") + ' sg-btn--sm" data-open="' + ui.esc(v.id) + '">' +
            SG.icon("eye", 14) + (v.status === "pending" ? "Analisar" : "Ver") + "</button>" +
          '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-user="' + ui.esc(u.id || v.user_id) + '">Ficha</button>' +
        "</div>" +
      "</div>";
    }

    function paint() {
      stats();
      chipCounts("kycFilters", function (v) { var o = filter; filter = v; var n = all.filter(matches).length; filter = o; return n; });
      chipCounts("kycRoles", function (v) { var o = role; role = v; var n = all.filter(matches).length; role = o; return n; });
      var list = all.filter(matches);
      ui.$("#kycList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(card).join("") + "</div>"
        : ui.empty("🪪", filter === "pending" ? "Fila zerada" : "Nada neste filtro",
            filter === "pending" ? "Nenhuma identidade aguardando análise." : "Troque o filtro ou a busca.");
      // miniaturas (URLs assinadas no Supabase)
      list.slice(0, 30).forEach(function (v) {
        api.admin.verificationImages(v).then(function (imgs) {
          var el = ui.$('[data-kyc="' + v.id + '"] .kyc-card__thumbs');
          if (!el) return;
          var t = el.querySelectorAll(".kyc-card__thumb");
          t[0].innerHTML = '<img src="' + ui.esc(imgs.front) + '" alt="Documento">';
          t[1].innerHTML = '<img src="' + ui.esc(imgs.selfie) + '" alt="Selfie">';
        }).catch(function () {});
      });
    }

    function load() {
      return api.admin.listVerifications().then(function (list) {
        // mostra só o envio mais recente de cada usuário (o histórico fica na ficha)
        var seen = {};
        all = list.filter(function (v) {
          if (seen[v.user_id]) return false;
          seen[v.user_id] = true;
          return true;
        }).sort(function (a, b) {
          // fila: pendentes mais antigos primeiro; demais, mais recentes primeiro
          if (a.status === "pending" && b.status === "pending") return new Date(a.created_at) - new Date(b.created_at);
          return new Date(b.created_at) - new Date(a.created_at);
        });
        paint();
      }).catch(function (e) {
        ui.$("#kycList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e));
      });
    }
    load();

    bindChips("kycFilters", function (v) { filter = v; paint(); });
    bindChips("kycRoles", function (v) { role = v; paint(); });
    bindSearch("kycSearch", function (q) { query = q; paint(); });

    function openNext(afterId) {
      var queue = all.filter(function (v) { return v.status === "pending" && v.id !== afterId; });
      if (!queue.length) return ui.toast("Fila concluída", { type: "success", text: "Não há mais identidades pendentes." });
      ui.confirm({
        title: "Próxima da fila?",
        text: queue.length + " identidade(s) aguardando análise.",
        okText: "Analisar a próxima"
      }).then(function (ok) { if (ok) review(queue[0]); });
    }

    function review(v) {
      openVerificationReview(v, {
        onDecided: function () { paint(); if (filter === "pending") openNext(v.id); }
      });
    }

    ui.on(ui.$("#kycList"), "click", "[data-open]", function (e, el) {
      var v = all.filter(function (x) { return x.id === el.getAttribute("data-open"); })[0];
      if (v) review(v);
    });
    ui.on(ui.$("#kycList"), "click", "[data-user]", function (e, el) {
      openUserDetail(el.getAttribute("data-user"), { onChange: load });
    });

    ui.$("#kycCsv").addEventListener("click", function () {
      downloadCsv("servego-verificacoes", [
        ["Nome", function (v) { return v.user && v.user.full_name; }],
        ["E-mail", function (v) { return v.user && v.user.email; }],
        ["CPF", function (v) { return v.user && SG.cpf.format(v.user.cpf); }],
        ["Perfil", function (v) { return v.user && ROLE_LABEL[v.user.role]; }],
        ["Documento", function (v) { return DOC_LABEL[v.doc_type] || v.doc_type; }],
        ["Status", function (v) { return IDENTITY_LABEL[v.status]; }],
        ["Motivo da recusa", function (v) { return v.rejection_reason; }],
        ["Enviado em", function (v) { return ui.dateTime(v.created_at); }],
        ["Analisado em", function (v) { return v.reviewed_at ? ui.dateTime(v.reviewed_at) : ""; }]
      ], all.filter(matches));
    });
  };

  /* ==========================================================================
     3. USUÁRIOS
     ========================================================================== */
  SG.views.adminUsers = function () {
    app.setHeader("Usuários", "Contas de clientes, profissionais e administradores");
    app.view(
      '<div class="app-page-head"><h1>Usuários</h1>' +
        "<p>Busque por nome, e-mail ou CPF, veja a ficha completa e bloqueie contas com comportamento abusivo.</p></div>" +
      '<div id="usrStats">' + kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      toolbar(searchBox("usrSearch", "Buscar por nome, e-mail ou CPF…"), exportBtn("usrCsv")) +
      chipRow("usrFilters", [
        ["all", "Todos"], ["client", "Clientes"], ["professional", "Profissionais"], ["admin", "Admins"]
      ], "all") +
      chipRow("usrIdentity", [
        ["all", "Qualquer identidade"], ["approved", "Verificadas"], ["pending", "Em análise"],
        ["rejected", "Recusadas"], ["not_submitted", "Não enviadas"], ["blocked", "Bloqueados"]
      ], "all") +
      '<div id="usrList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var role = "all";
    var idFilter = "all";
    var query = "";

    function filtered() {
      var q = query;
      var qd = SG.cpf.digits(q);
      return all.filter(function (u) {
        if (role !== "all" && u.role !== role) return false;
        if (idFilter === "blocked" && u.status !== "blocked") return false;
        if (idFilter !== "all" && idFilter !== "blocked" && (u.identity_status || "not_submitted") !== idFilter) return false;
        if (!q) return true;
        return (u.full_name || "").toLowerCase().indexOf(q) >= 0 ||
          (u.email || "").toLowerCase().indexOf(q) >= 0 ||
          (qd.length >= 3 && SG.cpf.digits(u.cpf).indexOf(qd) >= 0);
      });
    }

    function actionCell(u) {
      // bloquear a si mesmo trancaria o dono para fora do painel
      if (u.id === app.state.me.id) return '<span class="sg-xs sg-faint">Sua conta</span>';
      var blocked = u.status === "blocked";
      return '<button class="sg-btn ' + (blocked ? "sg-btn--outline" : "sg-btn--danger") + ' sg-btn--sm" ' +
        'data-toggle="' + ui.esc(u.id) + '">' +
        SG.icon(blocked ? "check" : "ban", 14) + (blocked ? "Desbloquear" : "Bloquear") + "</button>";
    }

    function row(u) {
      return '<tr data-row="' + ui.esc(u.id) + '" class="adm-clickable">' +
        '<td><div class="sg-row" style="min-width:0">' + ui.avatar(u, "sm") +
          '<div style="min-width:0"><div class="sg-md sg-strong sg-truncate">' + ui.esc(u.full_name || "—") + "</div>" +
          '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(u.email || "") + "</div></div></div></td>" +
        '<td class="sg-md">' + cpfCell(u.cpf) + "</td>" +
        '<td><span class="sg-badge">' + ui.esc(ROLE_LABEL[u.role] || u.role || "—") + "</span></td>" +
        "<td>" + (u.role === "admin" ? '<span class="sg-xs sg-faint">—</span>' : identityBadge(u.identity_status)) + "</td>" +
        '<td class="sg-md sg-dim">' + ui.esc(u.last_seen_at ? lastSeenLabel(u.last_seen_at) : "—") +
          '<div class="sg-xs sg-faint">desde ' + ui.date(u.created_at) + "</div></td>" +
        '<td data-cell="status">' + accountBadge(u.status) + "</td>" +
        '<td data-cell="acao">' + actionCell(u) + "</td>" +
        "</tr>";
    }

    function usrStats() {
      var n = function (fn) { return all.filter(fn).length; };
      var week = n(function (u) { return Date.now() - new Date(u.created_at) < 7 * 864e5; });
      ui.$("#usrStats").innerHTML = kpiRow(
        metricCard("Contas", ui.num(all.length), "+" + ui.num(week) + " nos últimos 7 dias", null, "users", "blue") +
        metricCard("Clientes", ui.num(n(function (u) { return u.role === "client"; })), "pedem serviços", null, "user", "gold") +
        metricCard("Profissionais", ui.num(n(function (u) { return u.role === "professional"; })), "prestam serviços", "#/admin/profissionais", "briefcase", "violet") +
        metricCard("Identidade verificada", ui.num(n(function (u) { return u.identity_status === "approved"; })),
          ui.num(n(function (u) { return u.status === "blocked"; })) + " conta(s) bloqueada(s)", "#/admin/verificacoes", "verified", "green"));
    }

    function paint() {
      usrStats();
      chipCounts("usrFilters", function (v) { var o = role; role = v; var n = filtered().length; role = o; return n; });
      chipCounts("usrIdentity", function (v) { var o = idFilter; idFilter = v; var n = filtered().length; idFilter = o; return n; });
      var list = filtered();
      ui.$("#usrList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            "<th>Usuário</th><th>CPF</th><th>Papel</th><th>Identidade</th><th>Último acesso</th><th>Status</th><th>Ações</th>" +
            "</tr></thead><tbody>" + list.map(row).join("") + "</tbody></table></div>" +
          '<div class="sg-xs sg-faint" style="margin-top:12px">' + ui.num(list.length) +
            " usuário" + (list.length === 1 ? "" : "s") + " listado" + (list.length === 1 ? "" : "s") +
            " · clique em uma linha para abrir a ficha</div>"
        : ui.empty("🔍", "Nenhum usuário encontrado", "Tente outro termo de busca ou remova os filtros.");
    }

    function load() {
      return api.admin.listUsers().then(function (list) {
        all = list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        paint();
      });
    }
    load();

    bindSearch("usrSearch", function (q) { query = q; paint(); });
    bindChips("usrFilters", function (value) { role = value; paint(); });
    bindChips("usrIdentity", function (value) { idFilter = value; paint(); });

    // Ficha completa
    ui.on(ui.$("#usrList"), "click", "tr[data-row]", function (e, tr) {
      if (e.target.closest("[data-toggle]")) return;
      openUserDetail(tr.getAttribute("data-row"), { onChange: load });
    });

    // Bloquear / desbloquear (delegação: sobrevive aos repaints)
    ui.on(ui.$("#usrList"), "click", "[data-toggle]", function (e, btn) {
      var id = btn.getAttribute("data-toggle");
      var u = all.filter(function (x) { return x.id === id; })[0];
      if (!u || u.id === app.state.me.id) return;
      var blocked = u.status === "blocked";
      var next = blocked ? "active" : "blocked";
      ui.confirm({
        title: blocked ? "Desbloquear conta?" : "Bloquear conta?",
        text: blocked
          ? u.full_name + " poderá entrar no ServeGo novamente."
          : u.full_name + " perderá o acesso imediatamente e não poderá contratar nem atender.",
        okText: blocked ? "Sim, desbloquear" : "Sim, bloquear",
        danger: !blocked
      }).then(function (ok) {
        if (!ok) return;
        ui.busy(btn, true);
        api.admin.setUserStatus(id, next).then(function () {
          u.status = next;
          var tr = ui.$('[data-row="' + id + '"]', ui.$("#usrList"));
          if (tr) {
            ui.$('[data-cell="status"]', tr).innerHTML = accountBadge(u.status);
            ui.$('[data-cell="acao"]', tr).innerHTML = actionCell(u);
          }
          ui.toast(blocked ? "Conta desbloqueada" : "Conta bloqueada", {
            type: blocked ? "success" : "info",
            text: u.full_name
          });
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });

    ui.$("#usrCsv").addEventListener("click", function () {
      downloadCsv("servego-usuarios", [
        ["Nome", function (u) { return u.full_name; }],
        ["E-mail", function (u) { return u.email; }],
        ["CPF", function (u) { return u.cpf ? SG.cpf.format(u.cpf) : ""; }],
        ["Celular", function (u) { return u.phone; }],
        ["Papel", function (u) { return ROLE_LABEL[u.role]; }],
        ["Identidade", function (u) { return IDENTITY_LABEL[u.identity_status] || ""; }],
        ["Status", function (u) { return u.status === "blocked" ? "Bloqueado" : "Ativo"; }],
        ["Cidade", function (u) { return u.city; }],
        ["UF", function (u) { return u.state; }],
        ["Cadastro", function (u) { return ui.date(u.created_at); }],
        ["Último acesso", function (u) { return u.last_seen_at ? ui.dateTime(u.last_seen_at) : ""; }]
      ], filtered());
    });
  };

  /* ==========================================================================
     4. PROFISSIONAIS
     ========================================================================== */
  SG.views.adminProfessionals = function () {
    app.setHeader("Profissionais", "Verificação e curadoria dos prestadores");
    app.view(
      '<div class="app-page-head"><h1>Profissionais</h1>' +
        "<p>Aprove cadastros, confira documentos e acompanhe a reputação.</p></div>" +
      '<div id="proStats">' + kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      toolbar(searchBox("proSearch", "Buscar profissional…"), exportBtn("proCsv")) +
      chipRow("proFilters", [
        ["all", "Todos"], ["pending", "Em análise"], ["approved", "Aprovados"], ["rejected", "Rejeitados"]
      ], "all") +
      '<div class="sg-grid adm-split" id="proGrid">' +
        '<div id="proList">' + ui.skeletonCard(3) + "</div>" +
        '<div id="proDocs"></div>' +
      "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var filter = "all";
    var query = "";

    function card(p) {
      var pending = p.verification_status === "pending";
      var idStatus = p.identity_status || (p.profile && p.profile.identity_status);
      var idOk = idStatus === "approved";
      return '<div class="sg-card" data-pro="' + ui.esc(p.id) + '">' +
        '<div class="sg-row sg-row--top sg-row--between" style="gap:14px">' +
          '<div class="sg-row sg-row--top" style="min-width:0">' + ui.avatar(p, "lg") +
            '<div style="min-width:0">' +
              '<div class="sg-row" style="gap:8px;flex-wrap:wrap">' +
                '<span class="sg-strong sg-truncate">' + ui.esc(p.full_name || "—") + "</span>" +
                (p.verified ? '<span class="sg-badge sg-badge--brand">' + SG.icon("verified", 12) + "Verificado</span>" : "") +
              "</div>" +
              '<div class="sg-xs sg-dim sg-truncate" style="margin-top:3px">' + ui.esc(p.headline || "") + "</div>" +
              '<div class="sg-row sg-row--wrap" style="gap:14px;margin-top:10px">' +
                '<span class="sg-row sg-xs sg-dim" style="gap:5px">' + ui.stars(p.rating, 13) +
                  ui.rating(p.rating || 0) + "</span>" +
                '<span class="sg-row sg-xs sg-dim" style="gap:5px">' + SG.icon("briefcase", 13) +
                  ui.num(p.jobs_count) + " serviços</span>" +
                '<span class="sg-row sg-xs sg-dim" style="gap:5px">' + SG.icon("pin", 13) +
                  ui.esc((p.city || "—") + (p.state ? " · " + p.state : "")) + "</span>" +
              "</div>" +
              '<div class="sg-row sg-xs" style="gap:6px;margin-top:10px">Identidade: ' + identityBadge(idStatus) + "</div>" +
            "</div></div>" +
          '<div data-cell="verif">' + verificationBadge(p.verification_status) + "</div>" +
        "</div>" +
        (!idOk && p.verification_status !== "approved"
          ? '<div class="sg-xs sg-dim" style="margin-top:12px">' + SG.icon("alert", 12) +
            " Aprove a identidade (documento + selfie) antes de liberar o profissional.</div>"
          : "") +
        '<div class="sg-row sg-row--wrap" style="gap:8px;margin-top:16px;justify-content:flex-end" data-cell="acoes">' +
          '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-user="' + ui.esc(p.id) + '">Ficha</button>' +
          '<a class="sg-btn sg-btn--secondary sg-btn--sm" href="#/profissional/' + ui.esc(p.id) + '">Ver perfil</a>' +
          (p.verification_status !== "rejected"
            ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-verify="rejected" data-id="' + ui.esc(p.id) + '">' +
              SG.icon("x", 14) + "Rejeitar</button>" : "") +
          (p.verification_status !== "approved"
            ? '<button class="sg-btn ' + (pending ? "sg-btn--primary" : "sg-btn--outline") + ' sg-btn--sm" ' +
              'data-verify="approved" data-id="' + ui.esc(p.id) + '">' + SG.icon("check", 14) + "Aprovar</button>" : "") +
        "</div></div>";
    }

    function filtered() {
      return all.filter(function (p) {
        if (filter !== "all" && p.verification_status !== filter) return false;
        if (!query) return true;
        return [(p.full_name || ""), (p.headline || ""), (p.city || "")].join(" ").toLowerCase().indexOf(query) >= 0;
      });
    }

    function proStats() {
      var n = function (st) { return all.filter(function (p) { return p.verification_status === st; }).length; };
      var rated = all.filter(function (p) { return Number(p.rating) > 0; });
      var avg = rated.length ? rated.reduce(function (s, p) { return s + Number(p.rating); }, 0) / rated.length : 0;
      var online = all.filter(function (p) { return p.is_available; }).length;
      ui.$("#proStats").innerHTML = kpiRow(
        metricCard("Profissionais", ui.num(all.length), ui.num(online) + " online agora", null, "briefcase", "violet") +
        metricCard("Aprovados", ui.num(n("approved")), "aparecem nas buscas", null, "verified", "green") +
        metricCard("Em análise", ui.num(n("pending")), n("pending") ? "aguardando sua decisão" : "fila zerada", null, "clock", "gold") +
        metricCard("Nota média", ui.rating(avg), ui.num(rated.length) + " profissionais avaliados", "#/admin/avaliacoes", "star", "blue"));
    }

    function paint() {
      proStats();
      chipCounts("proFilters", function (v) { var o = filter; filter = v; var n = filtered().length; filter = o; return n; });
      var list = filtered();
      ui.$("#proList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(card).join("") + "</div>"
        : ui.empty("🧰", "Nenhum profissional neste filtro", "Troque o filtro para ver outros cadastros.");
    }

    function load() {
      return Promise.all([api.professionals.listAll(), api.admin.listUsers()]).then(function (r) {
        var byId = {};
        r[1].forEach(function (u) { byId[u.id] = u; });
        all = r[0].map(function (p) {
          var u = byId[p.id] || {};
          p.identity_status = u.identity_status;
          p.full_name = p.full_name || u.full_name;
          p.email = p.email || u.email;
          return p;
        });
        paint();
      });
    }
    load();

    bindChips("proFilters", function (value) { filter = value; paint(); });
    bindSearch("proSearch", function (q) { query = q; paint(); });

    ui.on(ui.$("#proList"), "click", "[data-user]", function (e, el) {
      openUserDetail(el.getAttribute("data-user"), { onChange: load });
    });

    ui.on(ui.$("#proList"), "click", "[data-verify]", function (e, btn) {
      var id = btn.getAttribute("data-id");
      var status = btn.getAttribute("data-verify");
      var p = all.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      var aprovar = status === "approved";
      if (aprovar && p.identity_status && p.identity_status !== "approved") {
        ui.toast("Identidade ainda não verificada", {
          type: "error",
          text: "Analise o documento e a selfie em Verificações antes de aprovar o profissional."
        });
        return;
      }
      ui.confirm({
        title: aprovar ? "Aprovar cadastro?" : "Rejeitar cadastro?",
        text: aprovar
          ? p.full_name + " passará a receber solicitações e ganha o selo Verificado."
          : p.full_name + " será avisado para revisar os documentos enviados.",
        okText: aprovar ? "Aprovar" : "Rejeitar",
        danger: !aprovar
      }).then(function (ok) {
        if (!ok) return;
        ui.busy(btn, true);
        api.admin.setVerification(id, status).then(function () {
          p.verification_status = status;
          p.verified = aprovar;
          paint();
          ui.toast(aprovar ? "Profissional aprovado" : "Cadastro rejeitado", {
            type: aprovar ? "success" : "info",
            text: p.full_name
          });
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });

    ui.$("#proCsv").addEventListener("click", function () {
      downloadCsv("servego-profissionais", [
        ["Nome", function (p) { return p.full_name; }],
        ["E-mail", function (p) { return p.email; }],
        ["Especialidade", function (p) { return p.headline; }],
        ["Cadastro profissional", function (p) { return ui.labels.verification[p.verification_status]; }],
        ["Identidade", function (p) { return IDENTITY_LABEL[p.identity_status] || ""; }],
        ["Nota", function (p) { return ui.rating(p.rating || 0); }],
        ["Serviços", function (p) { return p.jobs_count; }],
        ["Cidade", function (p) { return p.city; }]
      ], filtered());
    });

    // Documentos complementares, agrupados por profissional
    ui.$("#proDocs").innerHTML =
      '<div class="sg-panel"><div class="sg-panel__head">' +
        '<strong class="sg-md">Documentos complementares</strong>' +
        '<span class="sg-badge">' + SG.icon("doc", 12) + "Certificados e comprovantes</span></div>" +
        '<div class="sg-panel__body" id="proDocsBody">' + ui.skeletonCard(2) + "</div></div>";

    var docs = [];
    function paintDocs() {
      var groups = [];
      var index = {};
      docs.forEach(function (d) {
        var key = d.professional_id;
        if (!index[key]) {
          var pro = d.professional || {};
          if (!pro.full_name && pro.profile) pro.full_name = pro.profile.full_name;
          index[key] = { id: key, professional: pro, items: [] };
          groups.push(index[key]);
        }
        index[key].items.push(d);
      });

      ui.$("#proDocsBody").innerHTML = groups.length
        ? '<div class="sg-stack">' + groups.map(function (g) {
            var nome = (g.professional && g.professional.full_name) || "Profissional";
            return "<div>" +
              '<div class="sg-row sg-row--between" style="margin-bottom:10px">' +
                '<div class="sg-row" style="min-width:0">' + ui.avatar(g.professional, "sm") +
                  '<div style="min-width:0"><div class="sg-md sg-strong sg-truncate">' + ui.esc(nome) + "</div>" +
                  '<div class="sg-xs sg-dim">' + ui.num(g.items.length) + " documento" +
                    (g.items.length === 1 ? "" : "s") + "</div></div></div>" +
                '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/profissional/' + ui.esc(g.id) + '">' +
                  SG.icon("eye", 14) + "Perfil</a>" +
              "</div>" +
              '<div class="sg-stack-sm">' + g.items.map(function (d) {
                var tone = ui.statusTone(d.status);
                return '<div class="adm-doc">' +
                  '<button class="adm-doc__name" data-docview="' + ui.esc(d.id) + '">' + SG.icon("doc", 13) +
                    '<span class="sg-truncate">' + ui.esc(d.doc_type || "Documento") + "</span></button>" +
                  '<span class="sg-row" style="gap:6px">' +
                    '<span class="sg-xs sg-faint">' + ui.date(d.created_at, { day: "2-digit", month: "short" }) + "</span>" +
                    '<span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' +
                      ui.esc(ui.labels.verification[d.status] || d.status || "—") + "</span>" +
                    (d.status === "pending"
                      ? '<button class="app-iconbtn adm-doc__btn" title="Recusar" data-doc="rejected" data-id="' + ui.esc(d.id) + '">' + SG.icon("x", 14) + "</button>" +
                        '<button class="app-iconbtn adm-doc__btn" title="Aprovar" data-doc="approved" data-id="' + ui.esc(d.id) + '">' + SG.icon("check", 14) + "</button>"
                      : "") +
                  "</span></div>";
              }).join("") + "</div>" +
              '<div class="sg-divider"></div>' +
              "</div>";
          }).join("") + "</div>"
        : ui.empty("📄", "Nenhum documento enviado", "Certificados e comprovantes aparecem aqui.");
    }

    api.admin.listDocuments().then(function (list) { docs = list; paintDocs(); });

    ui.on(ui.$("#proDocsBody"), "click", "[data-docview]", function (e, el) {
      var d = docs.filter(function (x) { return x.id === el.getAttribute("data-docview"); })[0];
      if (!d) return;
      api.admin.documentUrl(d).then(function (url) { openImage(url, d.doc_type); })
        .catch(function (err) { ui.toast(SG.explainError(err), { type: "error" }); });
    });

    ui.on(ui.$("#proDocsBody"), "click", "[data-doc]", function (e, btn) {
      var id = btn.getAttribute("data-id");
      var status = btn.getAttribute("data-doc");
      var d = docs.filter(function (x) { return x.id === id; })[0];
      ui.busy(btn, true);
      api.admin.setDocumentStatus(id, status).then(function () {
        d.status = status;
        paintDocs();
        ui.toast(status === "approved" ? "Documento aprovado" : "Documento recusado", { type: status === "approved" ? "success" : "info" });
      }).catch(function (err) {
        ui.busy(btn, false);
        ui.toast(SG.explainError(err), { type: "error" });
      });
    });
  };

  /* ==========================================================================
     5. SOLICITAÇÕES
     ========================================================================== */
  SG.views.adminRequests = function () {
    app.setHeader("Solicitações", "Todos os pedidos de serviço da plataforma");
    app.view(
      '<div class="app-page-head"><h1>Solicitações</h1>' +
        "<p>Acompanhe a demanda por categoria, urgência e status.</p></div>" +
      '<div id="reqStats">' + kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      toolbar(searchBox("reqSearch", "Buscar por serviço, cliente ou endereço…"),
        '<select class="sg-select sg-select--sm" id="reqCat"><option value="">Todas as categorias</option></select>' + exportBtn("reqCsv")) +
      chipRow("reqFilters", [
        ["all", "Todas"], ["open", "Abertas"], ["in_progress", "Em andamento"],
        ["completed", "Concluídas"], ["cancelled", "Canceladas"]
      ], "all") +
      '<div id="reqList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var filter = "all";
    var query = "";
    var cat = "";

    function matches(r) {
      if (cat && r.category_id !== cat) return false;
      if (query) {
        var hay = [r.title, r.address, r.client && r.client.full_name, r.category && r.category.name].join(" ").toLowerCase();
        if (hay.indexOf(query) < 0) return false;
      }
      if (filter === "all") return true;
      if (filter === "open") return ["open", "matching"].indexOf(r.status) >= 0;
      if (filter === "in_progress") return ["assigned", "in_progress"].indexOf(r.status) >= 0;
      return r.status === filter;
    }

    function row(r) {
      var c = r.category || {};
      return '<tr class="adm-clickable" data-req="' + ui.esc(r.id) + '">' +
        '<td><div class="sg-row" style="min-width:0">' +
          '<span class="sg-avatar sg-avatar--sm sg-avatar--cat">' + SG.catIcon(c, 16) + "</span>" +
          '<div style="min-width:0"><div class="sg-md sg-strong sg-truncate">' + ui.esc(r.title) + "</div>" +
          '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(r.address || "") + "</div></div></div></td>" +
        '<td class="sg-md">' + ui.esc((r.client && r.client.full_name) || "—") + "</td>" +
        '<td class="sg-md sg-dim">' + ui.esc(c.name || "—") + "</td>" +
        '<td><span class="sg-badge">' + ui.esc(ui.labels.urgency[r.urgency] || r.urgency || "—") + "</span></td>" +
        "<td>" + ui.statusBadge(r.status, ui.labels.requestStatus) + "</td>" +
        '<td class="sg-md sg-dim">' + ui.timeAgo(r.created_at) + "</td>" +
        "</tr>";
    }

    function reqStats() {
      var n = function (list) { return all.filter(function (r) { return list.indexOf(r.status) >= 0; }).length; };
      var urgent = all.filter(function (r) { return r.urgency === "now" || r.urgency === "urgent"; }).length;
      ui.$("#reqStats").innerHTML = kpiRow(
        metricCard("Solicitações", ui.num(all.length), ui.num(urgent) + " com urgência", null, "layers", "blue") +
        metricCard("Buscando profissional", ui.num(n(["open", "matching", "awaiting_payment"])), "chamada ou pagamento em curso", null, "search", "gold") +
        metricCard("Em andamento", ui.num(n(["assigned", "in_progress"])), "profissional a caminho ou atendendo", null, "activity", "violet") +
        metricCard("Concluídas", ui.num(n(["completed"])), ui.num(n(["cancelled", "no_professional"])) + " cancelada(s) ou sem profissional", null, "checkCircle", "green"));
    }

    function paint() {
      reqStats();
      chipCounts("reqFilters", function (v) { var o = filter; filter = v; var n = all.filter(matches).length; filter = o; return n; });
      var list = all.filter(matches);
      ui.$("#reqList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            "<th>Serviço</th><th>Cliente</th><th>Categoria</th><th>Urgência</th><th>Status</th><th>Criada</th>" +
            "</tr></thead><tbody>" + list.map(row).join("") + "</tbody></table></div>" +
          '<div class="sg-xs sg-faint" style="margin-top:12px">' + ui.num(list.length) +
            " solicitação" + (list.length === 1 ? "" : "ões") + "</div>"
        : ui.empty("📋", "Nenhuma solicitação neste filtro", "Troque o filtro para ver outros pedidos.");
    }

    api.requests.listAll().then(function (list) {
      all = list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      paint();
    });
    api.categories.listAll().then(function (cats) {
      var sel = ui.$("#reqCat");
      if (!sel) return;
      sel.innerHTML += cats.map(function (c) {
        return '<option value="' + ui.esc(c.id) + '">' + ui.esc(c.name) + "</option>";
      }).join("");
      sel.addEventListener("change", function () { cat = sel.value; paint(); });
    });

    bindChips("reqFilters", function (value) { filter = value; paint(); });
    bindSearch("reqSearch", function (q) { query = q; paint(); });

    // a central do pedido (360°) é uma página própria: js/views/admin-control.js
    ui.on(ui.$("#reqList"), "click", "[data-req]", function (e, tr) {
      SG.router.go("/admin/solicitacoes/" + tr.getAttribute("data-req"));
    });

    // visualização rápida em modal (não usada; a página acima substitui)
    function quickView(tr) {
      var r = all.filter(function (x) { return x.id === tr.getAttribute("data-req"); })[0];
      if (!r) return;
      var c = r.category || {};
      var photos = (r.photos || []).filter(function (p) { return p && p.url; });
      var m = ui.modal({
        title: r.title,
        size: "lg",
        body:
          '<div class="sg-row sg-row--wrap" style="gap:6px;margin-bottom:14px">' +
            ui.statusBadge(r.status, ui.labels.requestStatus) +
            '<span class="sg-badge">' + SG.catIcon(c, 14) + ui.esc(c.name || "—") + "</span>" +
            '<span class="sg-badge">' + ui.esc(ui.labels.urgency[r.urgency] || r.urgency || "") + "</span>" +
          "</div>" +
          (r.description ? '<p class="sg-md sg-muted sg-break">' + ui.esc(r.description) + "</p>" : "") +
          '<div class="adm-kvs adm-kvs--2" style="margin-top:16px">' +
            kv("Cliente", ui.esc((r.client && r.client.full_name) || "—")) +
            kv("Endereço", ui.esc(r.address || "—")) +
            kv("Profissional", ui.esc((r.professional && r.professional.full_name) || "—")) +
            kv("Preço fechado", r.price ? ui.money(r.price) : "—") +
            kv("Pagamento", r.payment ? ui.esc((PAY_STATUS[r.payment.status] || r.payment.status) +
              " · " + (r.payment.method === "pix" ? "Pix" : "cartão")) : "—") +
            kv("Criada em", ui.dateTime(r.created_at)) +
            kv("Atualizada", ui.timeAgo(r.updated_at || r.created_at)) +
          "</div>" +
          (photos.length
            ? '<div class="app-section-title" style="margin-top:18px"><h3>Fotos</h3></div><div class="sg-thumbs">' +
              photos.map(function (p, i) {
                return '<button class="sg-thumb" data-photo="' + i + '"><img src="' + ui.esc(p.url) + '" alt="Foto ' + (i + 1) + '"></button>';
              }).join("") + "</div>"
            : ""),
        footer:
          '<button class="sg-btn sg-btn--ghost" data-close>Fechar</button>' +
          (r.client_id ? '<button class="sg-btn sg-btn--secondary" data-client>' + SG.icon("user", 15) + "Ficha do cliente</button>" : "")
      });
      ui.$$("[data-photo]", m.el).forEach(function (b) {
        b.addEventListener("click", function () { openImage(photos[Number(b.getAttribute("data-photo"))].url, "Foto da solicitação"); });
      });
      var bc = m.el.querySelector("[data-client]");
      if (bc) bc.addEventListener("click", function () { m.close(); openUserDetail(r.client_id); });
    }
    void quickView;

    ui.$("#reqCsv").addEventListener("click", function () {
      downloadCsv("servego-solicitacoes", [
        ["Serviço", function (r) { return r.title; }],
        ["Cliente", function (r) { return r.client && r.client.full_name; }],
        ["Categoria", function (r) { return r.category && r.category.name; }],
        ["Urgência", function (r) { return ui.labels.urgency[r.urgency]; }],
        ["Status", function (r) { return ui.labels.requestStatus[r.status]; }],
        ["Preço fechado", function (r) { return r.price; }],
        ["Endereço", function (r) { return r.address; }],
        ["Criada em", function (r) { return ui.dateTime(r.created_at); }]
      ], all.filter(matches));
    });
  };

  /* ==========================================================================
     6. FINANCEIRO
     ========================================================================== */
  SG.views.adminFinance = function () {
    app.setHeader("Financeiro", "Transações, comissões e repasses");
    app.view(
      '<div class="app-page-head"><h1>Financeiro</h1>' +
        "<p>Volume transacionado, comissão da plataforma (" + SG.config.app.platformFeePercent + "%) e repasses aos profissionais.</p></div>" +
      '<div id="finCards">' + ui.skeletonCard(1) + "</div>" +
      '<div id="finChart"></div>' +
      '<div class="app-section-title"><h3>Pagamentos dos clientes</h3></div>' +
      '<p class="sg-sm sg-dim" style="margin:-6px 0 14px">Todo serviço é pago pelo app antes do atendimento. O valor fica retido e vira repasse quando o serviço é concluído.</p>' +
      '<div id="payList">' + ui.skeletonCard(1) + "</div>" +
      '<div class="app-section-title"><h3>Repasses aos profissionais</h3></div>' +
      toolbar(searchBox("finSearch", "Buscar por cliente ou profissional…"), exportBtn("finCsv")) +
      chipRow("finFilters", [
        ["all", "Todas"], ["pending", "A liberar"], ["released", "Liberadas"], ["refunded", "Estornadas"]
      ], "all") +
      '<div id="finList">' + ui.skeletonCard(2) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var filter = "all";
    var query = "";

    function name(p) { return (p && p.full_name) || "—"; }

    function matches(t) {
      if (filter !== "all" && t.status !== filter) return false;
      if (!query) return true;
      return (name(t.client) + " " + name(t.professional)).toLowerCase().indexOf(query) >= 0;
    }

    function cards() {
      function sum(list, key) { return list.reduce(function (s, t) { return s + Number(t[key] || 0); }, 0); }
      var valid = all.filter(function (t) { return t.status !== "refunded"; });
      var released = all.filter(function (t) { return t.status === "released"; });
      var pending = all.filter(function (t) { return t.status === "pending"; });
      var ticket = valid.length ? sum(valid, "amount") / valid.length : 0;
      ui.$("#finCards").innerHTML =
        kpiRow(
          metricCard("Volume transacionado", ui.money(sum(valid, "amount")), ui.num(valid.length) + " transações válidas", null, "trending", "green") +
          metricCard("Receita liberada", ui.money(sum(released, "platform_fee")), "Comissão já disponível", null, "wallet", "gold") +
          metricCard("Comissão a receber", ui.money(sum(pending, "platform_fee")), ui.num(pending.length) + " transação(ões) a liberar", null, "lock", "blue") +
          metricCard("Ticket médio", ui.money(ticket), "Por serviço", null, "tag", "violet"));
      var serie = dailySeries(valid, 30, function (t) { return Number(t.platform_fee || 0); });
      serie.forEach(function (d) {
        var dt = new Date(d.chave + "T12:00:00");
        d.rotulo = dt.toLocaleDateString(SG.config.app.locale, { day: "2-digit", month: "short" }).replace(".", "");
        d.dica = dt.toLocaleDateString(SG.config.app.locale, { weekday: "short", day: "2-digit", month: "short" });
      });
      var total = serie.reduce(function (a, d) { return a + d.valor; }, 0);
      ui.$("#finChart").innerHTML =
        '<section class="dash-card" style="margin-bottom:var(--sg-6)">' +
          '<div class="dash-card__head"><div><h3 class="dash-card__title">Comissão por dia</h3>' +
            '<div class="dash-card__sub">Receita da plataforma · últimos 30 dias</div>' +
            '<div class="dash-card__big"><b>' + ui.money(total) + "</b></div></div></div>" +
          SG.dash.areaChart(serie, { format: function (v) { return ui.money(v); }, axis: SG.dash.moneyAxis, label: "Comissão por dia", width: 1180, height: 280 }) +
        "</section>";
    }

    function actions(t) {
      if (t.status !== "pending") return '<span class="sg-xs sg-faint">—</span>';
      return '<div class="sg-row" style="gap:6px">' +
        '<button class="sg-btn sg-btn--outline sg-btn--sm" data-tx="released" data-id="' + ui.esc(t.id) + '">Liberar</button>' +
        '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-tx="refunded" data-id="' + ui.esc(t.id) + '">Estornar</button></div>';
    }

    function paint() {
      cards();
      chipCounts("finFilters", function (v) { var o = filter; filter = v; var n = all.filter(matches).length; filter = o; return n; });
      var list = all.filter(matches);
      ui.$("#finList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            "<th>Data</th><th>Cliente</th><th>Profissional</th><th>Valor</th><th>Comissão</th><th>Líquido</th><th>Status</th><th>Ações</th>" +
            "</tr></thead><tbody>" + list.map(function (t) {
              return "<tr>" +
                '<td class="sg-md sg-dim">' + ui.date(t.created_at) + "</td>" +
                '<td class="sg-md">' + ui.esc(name(t.client)) + "</td>" +
                '<td class="sg-md">' + ui.esc(name(t.professional)) + "</td>" +
                '<td class="sg-md sg-strong sg-numeric">' + ui.money(t.amount) + "</td>" +
                '<td class="sg-md sg-numeric">' + ui.money(t.platform_fee) + "</td>" +
                '<td class="sg-md sg-numeric sg-dim">' + ui.money(t.net_amount !== undefined ? t.net_amount : t.amount - t.platform_fee) + "</td>" +
                "<td>" + txBadge(t.status) + "</td>" +
                "<td>" + actions(t) + "</td>" +
                "</tr>";
            }).join("") + "</tbody></table></div>"
        : ui.empty("💳", "Nenhuma transação", "As transações aparecem quando um serviço é concluído.");
    }

    /* Pagamentos (cliente → plataforma) */
    var pays = [];
    function paintPays() {
      var payTone = { paid: "success", refunded: "danger", pending: "brand", failed: "danger", expired: "" };
      ui.$("#payList").innerHTML = pays.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            "<th>Data</th><th>Cliente</th><th>Serviço</th><th>Método</th><th>Valor</th><th>Status</th><th>Ações</th>" +
            "</tr></thead><tbody>" + pays.map(function (p) {
              var tone = payTone[p.status] || "";
              return "<tr>" +
                '<td class="sg-md sg-dim">' + ui.dateTime(p.created_at) + "</td>" +
                '<td class="sg-md">' + ui.esc(name(p.client)) + "</td>" +
                '<td class="sg-md sg-dim">' + ui.esc((p.request && p.request.title) || "—") + "</td>" +
                '<td class="sg-md">' + (p.method === "pix" ? "Pix" : "Cartão") + "</td>" +
                '<td class="sg-md sg-strong sg-numeric">' + ui.money(p.amount) + "</td>" +
                '<td><span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' + ui.esc(PAY_STATUS[p.status] || p.status) + "</span></td>" +
                "<td>" + (p.status === "paid" && p.booking_id
                  ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-refund="' + ui.esc(p.id) + '">Estornar</button>'
                  : '<span class="sg-xs sg-faint">—</span>') + "</td>" +
                "</tr>";
            }).join("") + "</tbody></table></div>"
        : ui.empty("💳", "Nenhum pagamento ainda", "Os pagamentos aparecem quando um cliente paga um serviço pelo app.");
    }
    api.payments.listAll().then(function (list) { pays = list; paintPays(); })
      .catch(function (e) { ui.$("#payList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });

    ui.on(ui.$("#payList"), "click", "[data-refund]", function (e, btn) {
      var pay = pays.filter(function (x) { return x.id === btn.getAttribute("data-refund"); })[0];
      if (!pay) return;
      ui.confirm({
        title: "Estornar pagamento?",
        text: ui.money(pay.amount) + " voltam para " + name(pay.client) + " e o serviço é cancelado.",
        okText: "Estornar", danger: true
      }).then(function (ok) {
        if (!ok) return;
        ui.busy(btn, true);
        api.bookings.cancel(pay.booking_id, "Estornado pelo suporte").then(function () {
          pay.status = "refunded";
          paintPays();
          api.admin.log("payment.refunded", "payment", pay.id, { valor: pay.amount });
          ui.toast("Pagamento estornado", { type: "info" });
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });

    api.admin.listTransactions().then(function (list) {
      all = list;
      paint();
    }).catch(function (e) {
      ui.$("#finList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e));
    });

    bindChips("finFilters", function (v) { filter = v; paint(); });
    bindSearch("finSearch", function (q) { query = q; paint(); });

    ui.on(ui.$("#finList"), "click", "[data-tx]", function (e, btn) {
      var id = btn.getAttribute("data-id");
      var status = btn.getAttribute("data-tx");
      var t = all.filter(function (x) { return x.id === id; })[0];
      var liberar = status === "released";
      ui.confirm({
        title: liberar ? "Liberar repasse?" : "Estornar transação?",
        text: liberar
          ? ui.money(t.net_amount !== undefined ? t.net_amount : t.amount - t.platform_fee) + " serão repassados a " + name(t.professional) + "."
          : "O valor de " + ui.money(t.amount) + " será marcado como estornado ao cliente.",
        okText: liberar ? "Liberar" : "Estornar",
        danger: !liberar
      }).then(function (ok) {
        if (!ok) return;
        ui.busy(btn, true);
        api.admin.setTransactionStatus(id, status).then(function () {
          t.status = status;
          paint();
          ui.toast(liberar ? "Repasse liberado" : "Transação estornada", { type: liberar ? "success" : "info" });
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });

    ui.$("#finCsv").addEventListener("click", function () {
      downloadCsv("servego-financeiro", [
        ["Data", function (t) { return ui.dateTime(t.created_at); }],
        ["Cliente", function (t) { return name(t.client); }],
        ["Profissional", function (t) { return name(t.professional); }],
        ["Valor", function (t) { return Number(t.amount).toFixed(2).replace(".", ","); }],
        ["Comissão", function (t) { return Number(t.platform_fee).toFixed(2).replace(".", ","); }],
        ["Líquido", function (t) { return Number(t.net_amount !== undefined ? t.net_amount : t.amount - t.platform_fee).toFixed(2).replace(".", ","); }],
        ["Status", function (t) { return TX_STATUS[t.status]; }]
      ], all.filter(matches));
    });
  };

  /* ==========================================================================
     7. AVALIAÇÕES
     ========================================================================== */
  SG.views.adminReviews = function () {
    app.setHeader("Avaliações", "Qualidade percebida pelos clientes");
    app.view(
      '<div class="app-page-head"><h1>Avaliações</h1>' +
        "<p>Nota média da plataforma e o que os clientes estão comentando.</p></div>" +
      '<div id="rvSummary">' + ui.skeletonCard(1) + "</div>" +
      chipRow("rvFilters", [["all", "Todas"], ["low", "Notas baixas (≤ 3)"], ["5", "5 estrelas"], ["noreply", "Sem resposta"], ["hidden", "Ocultas"]], "all") +
      '<div id="rvList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var filter = "all";

    function passes(r, f) {
      if (f === "hidden") return !!r.hidden;
      if (f === "low") return Number(r.rating) <= 3;
      if (f === "5") return Number(r.rating) === 5;
      if (f === "noreply") return !r.reply;
      return true;
    }

    function paintList() {
      chipCounts("rvFilters", function (v) { return all.filter(function (r) { return passes(r, v); }).length; });
      var list = all.filter(function (r) { return passes(r, filter); });
      ui.$("#rvList").innerHTML = list.length
        ? '<div class="sg-card">' + list.map(function (r) {
            var cliente = (r.client && r.client.full_name) || "Cliente";
            var proObj = r.professional || {};
            var pro = proObj.full_name || (proObj.profile && proObj.profile.full_name) || "Profissional";
            return '<div class="review">' +
              '<div class="sg-row sg-row--between sg-row--wrap" style="gap:10px">' +
                '<div class="sg-row" style="min-width:0">' + ui.avatar(r.client, "sm") +
                  '<div style="min-width:0"><div class="sg-md sg-strong sg-truncate">' + ui.esc(cliente) + "</div>" +
                  '<div class="sg-xs sg-dim sg-truncate">avaliou ' + ui.esc(pro) + "</div></div></div>" +
                '<div class="sg-row" style="gap:10px">' + ui.stars(r.rating, 14) +
                  '<span class="sg-xs sg-faint">' + ui.date(r.created_at) + "</span></div>" +
              "</div>" +
              (r.comment ? '<p class="sg-md sg-muted sg-break" style="margin-top:12px">' + ui.esc(r.comment) + "</p>" : "") +
              (r.tags && r.tags.length
                ? '<div class="sg-row sg-row--wrap" style="gap:6px;margin-top:12px">' + r.tags.map(function (t) {
                    return '<span class="sg-badge">' + ui.esc(t) + "</span>";
                  }).join("") + "</div>"
                : "") +
              (r.reply ? '<p class="sg-xs sg-dim" style="margin-top:10px;padding-left:10px;border-left:2px solid var(--sg-line)">' +
                "<b>Resposta:</b> " + ui.esc(r.reply) + "</p>" : "") +
              (r.hidden ? '<div class="adm-hidden-note">' + SG.icon("eye", 13) + "Oculta no app" +
                (r.hidden_reason ? " · " + ui.esc(r.hidden_reason) : "") + "</div>" : "") +
              '<div class="sg-row" style="gap:6px;margin-top:12px;justify-content:flex-end;flex-wrap:wrap">' +
                (r.reply ? '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-rv-noreply="' + ui.esc(r.id) + '">Remover resposta</button>' : "") +
                '<button class="sg-btn ' + (r.hidden ? "sg-btn--outline" : "sg-btn--ghost") + ' sg-btn--sm" data-rv-hide="' + ui.esc(r.id) + '">' +
                  SG.icon(r.hidden ? "eye" : "ban", 14) + (r.hidden ? "Reexibir" : "Ocultar do app") + "</button>" +
              "</div>" +
              "</div>";
          }).join("") + "</div>"
        : ui.empty("⭐", "Nenhuma avaliação neste filtro", "As avaliações dos serviços concluídos aparecem aqui.");
    }

    api.admin.listReviews().then(function (list) {
      all = list;
      var total = list.length;
      var soma = list.reduce(function (s, r) { return s + Number(r.rating || 0); }, 0);
      var media = total ? Math.round((soma / total) * 10) / 10 : 0;

      var dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      list.forEach(function (r) {
        var n = Math.round(Number(r.rating || 0));
        if (dist[n] !== undefined) dist[n] += 1;
      });

      var semResposta = list.filter(function (r) { return !r.reply; }).length;
      var baixas = dist[1] + dist[2] + dist[3];
      var D = SG.dash;
      ui.$("#rvSummary").innerHTML =
        kpiRow(
          metricCard("Nota média", ui.rating(media) + '<small class="dash-kpi__unit">/5</small>', ui.num(total) + " avaliação" + (total === 1 ? "" : "ões"), null, "star", "gold") +
          metricCard("5 estrelas", (total ? Math.round(dist[5] / total * 100) : 0) + "%", ui.num(dist[5]) + " clientes encantados", null, "heart", "green") +
          metricCard("Notas baixas (≤ 3)", ui.num(baixas), baixas ? "vale olhar de perto" : "nenhuma até agora", null, "alert", "red") +
          metricCard("Sem resposta", ui.num(semResposta), "o profissional ainda não respondeu", null, "chat", "blue")) +
        '<section class="dash-card" style="margin-bottom:var(--sg-6)">' +
          '<div class="dash-card__head"><div><h3 class="dash-card__title">Distribuição das notas</h3>' +
            '<div class="dash-card__sub">Quantas avaliações em cada nota</div></div>' +
            '<div style="text-align:right">' + ui.stars(media, 18) + "</div></div>" +
          D.barList([5, 4, 3, 2, 1].map(function (i) {
            return { label: i + " estrela" + (i === 1 ? "" : "s"), value: dist[i],
              display: ui.num(dist[i]) + " · " + (total ? Math.round(dist[i] / total * 100) : 0) + "%" };
          }), { rank: false }) +
        "</section>";
      paintList();
    });

    bindChips("rvFilters", function (v) { filter = v; paintList(); });

    ui.on(ui.$("#rvList"), "click", "[data-rv-hide]", function (e, b) {
      var r = all.filter(function (x) { return x.id === b.getAttribute("data-rv-hide"); })[0];
      if (!r) return;
      var go = function (reason) {
        ui.busy(b, true);
        api.admin.setReviewHidden(r.id, !r.hidden, reason).then(function () {
          r.hidden = !r.hidden;
          r.hidden_reason = r.hidden ? reason : null;
          ui.toast(r.hidden ? "Avaliação ocultada" : "Avaliação reexibida", { type: "success",
            text: r.hidden ? "Ela some do app e sai da média do profissional." : "Ela volta a contar na média." });
          paintList();
        }).catch(function (err) { ui.busy(b, false); ui.toast(SG.explainError(err), { type: "error" }); });
      };
      if (r.hidden) return go(null);
      var m = ui.modal({
        title: "Ocultar avaliação?",
        body: '<p class="sg-sm sg-dim">A avaliação some do perfil público e deixa de contar na nota do profissional. Você pode reexibir depois.</p>' +
          '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="rvReason">Motivo (fica na auditoria)</label>' +
          '<input class="sg-input" id="rvReason" placeholder="Ex.: linguagem ofensiva, dados pessoais, avaliação falsa"></div>',
        footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button><button class="sg-btn sg-btn--danger" data-ok>Ocultar</button>'
      });
      m.el.querySelector("[data-ok]").addEventListener("click", function () {
        var reason = ui.$("#rvReason", m.el).value.trim();
        if (!reason) { ui.toast("Informe o motivo", { type: "error" }); return; }
        m.close();
        go(reason);
      });
    });

    ui.on(ui.$("#rvList"), "click", "[data-rv-noreply]", function (e, b) {
      var id = b.getAttribute("data-rv-noreply");
      ui.confirm({ title: "Remover a resposta do profissional?", text: "A avaliação continua; só a resposta é apagada.", okText: "Remover", danger: true })
        .then(function (ok) {
          if (!ok) return;
          api.admin.removeReply(id).then(function () {
            all.forEach(function (x) { if (x.id === id) x.reply = null; });
            ui.toast("Resposta removida", { type: "success" });
            paintList();
          }).catch(function (err) { ui.toast(SG.explainError(err), { type: "error" }); });
        });
    });
  };

  /* ==========================================================================
     8. DENÚNCIAS
     ========================================================================== */
  SG.views.adminReports = function () {
    app.setHeader("Denúncias", "Moderação e segurança da comunidade");
    app.view(
      '<div class="app-page-head"><h1>Denúncias</h1>' +
        "<p>Analise os relatos e tome uma decisão. Casos graves podem gerar bloqueio de conta.</p></div>" +
      '<div id="rpStats">' + kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      chipRow("rpFilters", [
        ["all", "Todas"], ["open", "Abertas"], ["reviewing", "Em análise"],
        ["resolved", "Resolvidas"], ["dismissed", "Descartadas"]
      ], "all") +
      '<div id="rpList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];
    var filter = "all";

    function statusBadge(status) {
      var tone = status === "resolved" ? "success" : status === "dismissed" ? "danger"
        : status === "reviewing" ? "brand" : "info";
      return '<span class="sg-badge sg-badge--' + tone + '">' +
        ui.esc(REPORT_STATUS[status] || status || "—") + "</span>";
    }

    function card(r) {
      var aberta = r.status === "open" || r.status === "reviewing";
      return '<div class="sg-card">' +
        '<div class="sg-row sg-row--between sg-row--wrap" style="gap:12px">' +
          '<div class="sg-row" style="min-width:0">' +
            '<span class="sg-avatar sg-avatar--lg" style="font-size:20px">' + SG.icon("flag", 20) + "</span>" +
            '<div style="min-width:0">' +
              '<div class="sg-strong sg-truncate">' + ui.esc(r.reason || "Denúncia") + "</div>" +
              '<div class="sg-xs sg-dim" style="margin-top:3px">' + ui.dateTime(r.created_at) + "</div>" +
            "</div></div>" +
          statusBadge(r.status) +
        "</div>" +
        '<div class="sg-grid sg-grid--2" style="margin-top:16px;gap:12px">' +
          '<div><div class="sg-xs sg-faint">Denunciante</div>' +
            '<div class="sg-md sg-strong">' + ui.esc((r.reporter && r.reporter.full_name) || "Usuário removido") + "</div></div>" +
          '<div><div class="sg-xs sg-faint">Denunciado</div>' +
            '<div class="sg-md sg-strong">' + ui.esc((r.target && r.target.full_name) || "Usuário removido") +
            (r.target_user_id ? ' <button class="sg-btn sg-btn--ghost sg-btn--sm" data-user="' + ui.esc(r.target_user_id) + '">Ficha</button>' : "") +
            "</div></div>" +
        "</div>" +
        (r.description
          ? '<p class="sg-md sg-muted sg-break" style="margin-top:16px;padding-left:12px;border-left:2px solid var(--sg-line)">' +
            ui.esc(r.description) + "</p>"
          : "") +
        (r.booking && r.booking.status === "disputed"
          ? '<div class="sg-row" style="justify-content:flex-end;margin-top:14px">' +
              '<a class="sg-btn sg-btn--primary sg-btn--sm" href="#/admin/disputas">' + SG.icon("alert", 14) + "Analisar em Disputas</a></div>"
          : aberta
          ? '<div class="sg-row sg-row--wrap" style="gap:8px;margin-top:18px;justify-content:flex-end">' +
              '<button class="sg-btn sg-btn--ghost sg-btn--sm" data-resolve="dismissed" data-id="' + ui.esc(r.id) + '">' +
                SG.icon("x", 14) + "Descartar</button>" +
              (r.target_user_id
                ? '<button class="sg-btn sg-btn--danger sg-btn--sm" data-block="' + ui.esc(r.id) + '">' +
                  SG.icon("ban", 14) + "Resolver e bloquear</button>"
                : "") +
              '<button class="sg-btn sg-btn--primary sg-btn--sm" data-resolve="resolved" data-id="' + ui.esc(r.id) + '">' +
                SG.icon("checkCircle", 14) + "Resolver</button>" +
            "</div>"
          : '<div class="sg-row sg-xs sg-faint" style="gap:6px;margin-top:18px;justify-content:flex-end">' +
            SG.icon("check", 13) + "Caso encerrado" + (r.resolved_at ? " em " + ui.date(r.resolved_at) : "") + "</div>") +
        "</div>";
    }

    function rpStats() {
      var n = function (st) { return all.filter(function (r) { return r.status === st; }).length; };
      ui.$("#rpStats").innerHTML = kpiRow(
        metricCard("Abertas", ui.num(n("open")), n("open") ? "precisam de uma decisão" : "nada pendente", null, "flag", "red") +
        metricCard("Em análise", ui.num(n("reviewing")), "sendo investigadas", null, "eye", "gold") +
        metricCard("Resolvidas", ui.num(n("resolved")), "com medida aplicada", null, "checkCircle", "green") +
        metricCard("Descartadas", ui.num(n("dismissed")), "sem fundamento", null, "x", "blue"));
    }

    function paint() {
      rpStats();
      chipCounts("rpFilters", function (v) { return all.filter(function (r) { return v === "all" || r.status === v; }).length; });
      var list = all.filter(function (r) { return filter === "all" || r.status === filter; });
      ui.$("#rpList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(card).join("") + "</div>"
        : ui.empty("🛡", "Nenhuma denúncia neste filtro", "A moderação está em dia por aqui.");
    }

    api.admin.listReports().then(function (list) {
      all = list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      paint();
    });

    bindChips("rpFilters", function (value) { filter = value; paint(); });

    ui.on(ui.$("#rpList"), "click", "[data-user]", function (e, el) {
      openUserDetail(el.getAttribute("data-user"));
    });

    function resolve(r, status, btn, alsoBlock) {
      ui.busy(btn, true);
      var p = api.admin.resolveReport(r.id, status);
      if (alsoBlock) p = p.then(function () { return api.admin.setUserStatus(r.target_user_id, "blocked"); });
      return p.then(function () {
        r.status = status;
        r.resolved_at = new Date().toISOString();
        paint();
        app.refreshAdminBadges();
        ui.toast(alsoBlock ? "Denúncia resolvida e conta bloqueada" : status === "resolved" ? "Denúncia resolvida" : "Denúncia descartada", {
          type: status === "resolved" ? "success" : "info"
        });
      }).catch(function (err) {
        ui.busy(btn, false);
        ui.toast(SG.explainError(err), { type: "error" });
      });
    }

    ui.on(ui.$("#rpList"), "click", "[data-resolve]", function (e, btn) {
      var id = btn.getAttribute("data-id");
      var status = btn.getAttribute("data-resolve");
      var r = all.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      var resolver = status === "resolved";
      ui.confirm({
        title: resolver ? "Marcar como resolvida?" : "Descartar denúncia?",
        text: resolver
          ? "Registre a decisão. O denunciante será considerado atendido."
          : "A denúncia será arquivada sem penalidade ao usuário denunciado.",
        okText: resolver ? "Sim, resolver" : "Sim, descartar",
        danger: !resolver
      }).then(function (ok) { if (ok) resolve(r, status, btn, false); });
    });

    ui.on(ui.$("#rpList"), "click", "[data-block]", function (e, btn) {
      var r = all.filter(function (x) { return x.id === btn.getAttribute("data-block"); })[0];
      if (!r) return;
      ui.confirm({
        title: "Resolver e bloquear?",
        text: ((r.target && r.target.full_name) || "O usuário") + " perderá o acesso imediatamente.",
        okText: "Bloquear conta",
        danger: true
      }).then(function (ok) { if (ok) resolve(r, "resolved", btn, true); });
    });
  };

  /* ==========================================================================
     9. CATEGORIAS
     ========================================================================== */
  SG.views.adminCategories = function () {
    app.setHeader("Categorias", "Catálogo de serviços do ServeGo");
    app.view(
      '<div class="app-page-head"><h1>Categorias</h1>' +
        "<p>Defina os tipos de serviço, o ícone e a faixa de preço sugerida.</p></div>" +
      '<div id="catStats"></div>' +
      '<div class="sg-row sg-row--between" style="margin-bottom:20px">' +
        '<span class="sg-md sg-dim" id="catCount">Carregando…</span>' +
        '<button class="sg-btn sg-btn--primary sg-btn--sm" id="catNew">' + SG.icon("plus", 15) + "Nova categoria</button>" +
      "</div>" +
      '<div id="catList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [];

    function card(c) {
      var ativa = c.active !== false;
      return '<div class="sg-card" data-cat="' + ui.esc(c.id) + '">' +
        '<div class="sg-row sg-row--between sg-row--top">' +
          '<div class="sg-row" style="min-width:0">' +
            '<span class="sg-avatar sg-avatar--lg sg-avatar--cat">' + SG.catIcon(c, 24) + "</span>" +
            '<div style="min-width:0"><div class="sg-strong sg-truncate">' + ui.esc(c.name) + "</div>" +
            '<div class="sg-xs sg-dim sg-clamp-2" style="margin-top:3px">' + ui.esc(c.description || "") + "</div></div>" +
          "</div>" +
          '<span class="sg-badge' + (ativa ? " sg-badge--success" : "") + '">' + (ativa ? "Ativa" : "Inativa") + "</span>" +
        "</div>" +
        '<div class="sg-divider"></div>' +
        '<div class="sg-row sg-row--between">' +
          "<div><div class=\"sg-xs sg-faint\">Faixa de preço</div>" +
            '<div class="sg-md sg-strong sg-numeric">' +
              ui.money(c.price_from, true) + " – " + ui.money(c.price_to, true) + "</div></div>" +
          '<div class="sg-row" style="gap:8px">' +
            '<button class="sg-switch ' + (ativa ? "is-on" : "") + '" data-active="' + ui.esc(c.id) + '" ' +
              'title="' + (ativa ? "Desativar categoria" : "Ativar categoria") + '">' +
              '<span class="sg-switch__track"><span class="sg-switch__thumb"></span></span></button>' +
            '<button class="sg-btn sg-btn--outline sg-btn--sm" data-edit="' + ui.esc(c.id) + '">' +
              SG.icon("settings", 14) + "Editar</button>" +
          "</div>" +
        "</div></div>";
    }

    function paint() {
      var ativas = all.filter(function (c) { return c.active !== false; }).length;
      var avg = function (key) {
        return all.length ? all.reduce(function (s, c) { return s + Number(c[key] || 0); }, 0) / all.length : 0;
      };
      ui.$("#catStats").innerHTML = kpiRow(
        metricCard("Categorias", ui.num(all.length), "no catálogo", null, "grid", "blue") +
        metricCard("Ativas", ui.num(ativas), "visíveis para os clientes", null, "checkCircle", "green") +
        metricCard("Inativas", ui.num(all.length - ativas), "ocultas no app", null, "power", "red") +
        metricCard("Faixa média", ui.money(avg("price_from"), true) + " – " + ui.money(avg("price_to"), true), "preço sugerido", null, "tag", "gold"));
      ui.$("#catCount").textContent = ui.num(all.length) + " categoria" + (all.length === 1 ? "" : "s") +
        " no catálogo · " + ui.num(ativas) + " ativa" + (ativas === 1 ? "" : "s");
      ui.$("#catList").innerHTML = all.length
        ? '<div class="sg-grid sg-grid--3">' + all.map(card).join("") + "</div>"
        : ui.empty("🗂", "Nenhuma categoria cadastrada",
            "Crie a primeira categoria para que os clientes possam solicitar serviços.");
    }

    function load() {
      // listAll inclui as inativas — senão uma categoria desativada some e não volta mais
      return api.categories.listAll().then(function (list) {
        all = list;
        paint();
      });
    }
    load();

    /* Modal de criação/edição ------------------------------------------------ */
    function openCategoryModal(cat) {
      var c = cat || {};
      var m = ui.modal({
        title: cat ? "Editar categoria" : "Nova categoria",
        body:
          '<div class="sg-grid sg-grid--2" style="gap:16px">' +
            '<div class="sg-field"><label class="sg-field__label" for="catName">Nome</label>' +
              '<input class="sg-input" id="catName" value="' + ui.esc(c.name || "") + '" placeholder="Ex.: Eletricista"></div>' +
            '<div class="sg-field"><label class="sg-field__label" for="catSlug">Identificador</label>' +
              '<input class="sg-input" id="catSlug" value="' + ui.esc(c.slug || "") + '" disabled placeholder="gerado pelo nome"></div>' +
          "</div>" +
          '<div class="sg-field" style="margin-top:16px"><span class="sg-field__label">Ícone</span>' +
            '<div class="caticon-pick" id="catIcon" role="radiogroup" aria-label="Ícone da categoria">' +
              Object.keys(SG.catIcons).map(function (k) {
                var on = k === SG.catIconKey(c);
                return '<button type="button" class="caticon-pick__opt' + (on ? " is-active" : "") + '" data-icon="' + k + '" ' +
                  'role="radio" aria-checked="' + on + '" title="' + ui.esc(SG.catIconNames[k] || k) + '">' +
                  SG.catIcon({ icon: k }, 22) + "</button>";
              }).join("") +
            "</div></div>" +
          '<div class="sg-field" style="margin-top:16px"><label class="sg-field__label" for="catDesc">Descrição</label>' +
            '<textarea class="sg-textarea" id="catDesc" placeholder="O que esta categoria cobre?">' +
              ui.esc(c.description || "") + "</textarea></div>" +
          '<div class="sg-grid sg-grid--2" style="gap:16px;margin-top:16px">' +
            '<div class="sg-field"><label class="sg-field__label" for="catFrom">Preço mínimo (R$)</label>' +
              '<input class="sg-input" id="catFrom" type="number" min="0" step="10" value="' +
              ui.esc(c.price_from === undefined || c.price_from === null ? "" : c.price_from) + '"></div>' +
            '<div class="sg-field"><label class="sg-field__label" for="catTo">Preço máximo (R$)</label>' +
              '<input class="sg-input" id="catTo" type="number" min="0" step="10" value="' +
              ui.esc(c.price_to === undefined || c.price_to === null ? "" : c.price_to) + '"></div>' +
          "</div>",
        footer:
          '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button>' +
          '<button class="sg-btn sg-btn--primary" data-save>' + (cat ? "Salvar alterações" : "Criar categoria") + "</button>"
      });

      ui.on(ui.$("#catIcon", m.el), "click", "[data-icon]", function (e, el) {
        ui.$$("[data-icon]", m.el).forEach(function (b) {
          b.classList.toggle("is-active", b === el);
          b.setAttribute("aria-checked", b === el);
        });
      });

      m.el.querySelector("[data-save]").addEventListener("click", function () {
        var btn = this;
        var nome = ui.$("#catName", m.el).value.trim();
        var emoji = ui.$("#catIcon .is-active", m.el).getAttribute("data-icon");
        var desc = ui.$("#catDesc", m.el).value.trim();
        var de = Number(ui.$("#catFrom", m.el).value || 0);
        var ate = Number(ui.$("#catTo", m.el).value || 0);

        if (!nome) {
          ui.toast("Informe o nome da categoria", { type: "error" });
          return;
        }
        if (de < 0 || ate < 0 || (ate && de && ate < de)) {
          ui.toast("O preço máximo deve ser maior que o mínimo", { type: "error" });
          return;
        }
        var repetida = all.some(function (x) {
          return x.id !== c.id && String(x.name || "").trim().toLowerCase() === nome.toLowerCase();
        });
        if (repetida) {
          ui.toast("Já existe uma categoria com esse nome", { type: "error" });
          return;
        }

        var payload = {
          name: nome,
          icon: emoji || "servico",
          description: desc,
          price_from: de,
          price_to: ate
        };
        if (c.id) payload.id = c.id;
        else payload.slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        ui.busy(btn, true);
        api.categories.upsert(payload).then(function () {
          m.close();
          ui.toast(cat ? "Categoria atualizada" : "Categoria criada", { type: "success", text: nome });
          load();
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    }

    ui.$("#catNew").addEventListener("click", function () { openCategoryModal(null); });

    ui.on(ui.$("#catList"), "click", "[data-edit]", function (e, btn) {
      var c = all.filter(function (x) { return x.id === btn.getAttribute("data-edit"); })[0];
      if (c) openCategoryModal(c);
    });

    ui.on(ui.$("#catList"), "click", "[data-active]", function (e, btn) {
      var id = btn.getAttribute("data-active");
      var c = all.filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      var next = c.active === false;
      ui.confirm({
        title: next ? "Ativar categoria?" : "Desativar categoria?",
        text: next
          ? c.name + " voltará a aparecer para os clientes."
          : c.name + " deixará de aparecer no catálogo e nas buscas.",
        okText: next ? "Sim, ativar" : "Sim, desativar",
        danger: !next
      }).then(function (ok) {
        if (!ok) return;
        api.categories.setActive(id, next).then(function () {
          c.active = next;
          paint();
          ui.toast(next ? "Categoria ativada" : "Categoria desativada", {
            type: next ? "success" : "info",
            text: c.name
          });
        }).catch(function (err) {
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });
  };

  /* ==========================================================================
     10. COMUNICADOS
     ========================================================================== */
  SG.views.adminBroadcast = function () {
    app.setHeader("Comunicados", "Avisos para toda a base de usuários");
    app.view(
      '<div class="app-page-head"><h1>Comunicados</h1>' +
        "<p>Envie um aviso que chega como notificação no app de clientes, profissionais ou de todos.</p></div>" +
      '<div class="sg-grid adm-split">' +
        '<div class="sg-card">' +
          '<div class="sg-field__label" style="margin-bottom:8px">Público</div>' +
          chipRow("bcAudience", [["all", "Todos"], ["client", "Clientes"], ["professional", "Profissionais"]], "all") +
          '<div class="sg-field"><label class="sg-field__label" for="bcTitle">Título</label>' +
            '<input class="sg-input" id="bcTitle" maxlength="80" placeholder="Ex.: Novidade no ServeGo"></div>' +
          '<div class="sg-field" style="margin-top:14px"><label class="sg-field__label" for="bcBody">Mensagem</label>' +
            '<textarea class="sg-textarea" id="bcBody" maxlength="280" rows="4" placeholder="O que você quer avisar?"></textarea>' +
            '<div class="sg-xs sg-faint" style="text-align:right;margin-top:4px"><span id="bcCount">0</span>/280</div></div>' +
          '<div class="app-section-title" style="margin-top:8px"><h3>Pré-visualização</h3></div>' +
          '<div class="notif-item is-unread adm-preview"><span class="notif-item__ic">📣</span>' +
            '<span style="min-width:0"><span class="sg-md sg-strong" style="display:block" id="bcPrevTitle">Título do comunicado</span>' +
            '<span class="sg-xs sg-dim" id="bcPrevBody">A mensagem aparece aqui.</span>' +
            '<span class="sg-xs sg-faint" style="display:block;margin-top:3px">agora</span></span></div>' +
          '<button class="sg-btn sg-btn--primary sg-btn--block" id="bcSend" style="margin-top:18px">' +
            SG.icon("send", 15) + "Enviar comunicado</button>" +
        "</div>" +
        '<div class="sg-panel"><div class="sg-panel__head"><strong class="sg-md">Enviados</strong></div>' +
          '<div class="sg-panel__body" id="bcHistory">' + ui.skeletonCard(2) + "</div></div>" +
      "</div>",
      { className: "app-view--wide" }
    );

    var audience = "all";
    var AUD = { all: "Todos", client: "Clientes", professional: "Profissionais" };
    bindChips("bcAudience", function (v) { audience = v; });

    var title = ui.$("#bcTitle"), body = ui.$("#bcBody");
    function preview() {
      ui.$("#bcPrevTitle").textContent = title.value || "Título do comunicado";
      ui.$("#bcPrevBody").textContent = body.value || "A mensagem aparece aqui.";
      ui.$("#bcCount").textContent = body.value.length;
    }
    title.addEventListener("input", preview);
    body.addEventListener("input", preview);

    function history() {
      api.admin.listBroadcasts().then(function (list) {
        ui.$("#bcHistory").innerHTML = list.length
          ? '<div class="sg-stack">' + list.map(function (b) {
              var d = b.details || {};
              return "<div>" +
                '<div class="sg-row sg-row--between"><span class="sg-md sg-strong sg-truncate">' + ui.esc(d.titulo || "Comunicado") + "</span>" +
                '<span class="sg-xs sg-faint">' + ui.timeAgo(b.created_at) + "</span></div>" +
                '<div class="sg-xs sg-dim">' + ui.esc(AUD[d.publico] || d.publico || "") + " · " + ui.num(d.enviados || 0) + " destinatário(s)</div>" +
                "</div>";
            }).join('<div class="sg-divider"></div>') + "</div>"
          : ui.empty("📣", "Nenhum comunicado ainda", "Os avisos enviados aparecem aqui.");
      });
    }
    history();

    ui.$("#bcSend").addEventListener("click", function () {
      var btn = this;
      var t = title.value.trim(), b = body.value.trim();
      if (t.length < 3 || b.length < 3) return ui.toast("Preencha título e mensagem", { type: "error" });
      ui.confirm({
        title: "Enviar comunicado?",
        text: "Será enviado para: " + AUD[audience] + ". Esta ação não pode ser desfeita.",
        okText: "Enviar agora"
      }).then(function (ok) {
        if (!ok) return;
        ui.busy(btn, true);
        api.admin.broadcast(audience, t, b).then(function (n) {
          ui.busy(btn, false);
          title.value = ""; body.value = ""; preview();
          ui.toast("Comunicado enviado", { type: "success", text: ui.num(n) + " pessoa(s) notificada(s)" });
          setTimeout(history, 300);
        }).catch(function (err) {
          ui.busy(btn, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });
  };

  /* ==========================================================================
     11. CONFIGURAÇÕES (taxa da plataforma)
     ========================================================================== */
  SG.views.adminSettings = function () {
    app.setHeader("Configurações", "Regras de negócio da plataforma");
    var current = Number(SG.config.app.platformFeePercent) || 0;
    app.view(
      '<div class="app-page-head"><h1>Configurações</h1>' +
        "<p>Ajuste o percentual que fica com o ServeGo em cada serviço concluído.</p></div>" +
      '<div class="sg-grid adm-split">' +
        '<div class="sg-card">' +
          '<div class="sg-card__head"><span class="sg-card__title">Taxa da plataforma</span>' +
            '<span class="sg-badge sg-badge--brand">Atual: <b id="feeCurrent" style="margin-left:4px">' + pct(current) + "</b></span></div>" +
          '<p class="sg-sm sg-dim">Percentual descontado do valor de cada serviço concluído. O restante é repassado ao profissional.</p>' +
          '<div class="fee-editor">' +
            '<input type="range" class="fee-range" id="feeRange" min="0" max="30" step="0.5" value="' + Math.min(30, current) + '" aria-label="Taxa da plataforma">' +
            '<div class="fee-input">' +
              '<input class="sg-input" id="feeInput" type="number" min="0" max="50" step="0.5" value="' + current + '" aria-label="Percentual">' +
              "<span>%</span></div>" +
          "</div>" +
          '<div class="sg-row sg-row--wrap" style="gap:6px;margin-top:12px" id="feePresets">' +
            [5, 8, 10, 12, 15, 20].map(function (v) {
              return '<button class="sg-chip" data-fee="' + v + '">' + v + "%</button>";
            }).join("") +
          "</div>" +

          '<div class="app-section-title" style="margin-top:22px"><h3>Simulador</h3></div>' +
          '<div class="sg-field"><label class="sg-field__label" for="feeSample">Valor de um serviço (R$)</label>' +
            '<input class="sg-input" id="feeSample" type="number" min="0" step="10" value="200"></div>' +
          '<div class="fee-sim" id="feeSim"></div>' +

          '<div class="idnotice" style="margin:20px 0 0">' + SG.icon("alert", 18) +
            '<div class="sg-sm">A nova taxa vale para os serviços <b>concluídos a partir de agora</b>. ' +
            "Transações já geradas mantêm o percentual da época. Clientes e profissionais passam a ver o novo valor no app.</div></div>" +
          '<div class="sg-row" style="gap:8px;margin-top:18px;justify-content:flex-end">' +
            '<button class="sg-btn sg-btn--ghost" id="feeReset">Desfazer</button>' +
            '<button class="sg-btn sg-btn--primary" id="feeSave" disabled>' + SG.icon("check", 15) + "Salvar taxa</button>" +
          "</div>" +
        "</div>" +
        '<div class="sg-panel"><div class="sg-panel__head"><strong class="sg-md">Histórico de alterações</strong></div>' +
          '<div class="sg-panel__body" id="feeHistory">' + ui.skeletonCard(2) + "</div></div>" +
      "</div>" +
      '<div class="sg-card" style="margin-top:24px">' +
        '<div class="sg-card__head"><span class="sg-card__title">Chamadas e pagamento</span>' +
          '<span class="sg-xs sg-dim">Modelo Uber: o mais próximo é chamado, o cliente paga antes</span></div>' +
        '<div class="sg-grid sg-grid--2" style="gap:16px">' +
          setField("dispatch_timeout_seconds", "Tempo para o profissional aceitar", "segundos", (SG.config.payments || {}).dispatchTimeoutSeconds, 15, 300) +
          setField("payment_timeout_minutes", "Tempo para o cliente pagar", "minutos", (SG.config.payments || {}).paymentTimeoutMinutes, 3, 60) +
          setField("urgency_surcharge_percent", "Adicional para pedidos \"Agora\"", "%", (SG.config.payments || {}).urgencySurchargePercent, 0, 100) +
          setField("completion_auto_confirm_hours", "Prazo do cliente para confirmar a conclusão", "horas", (SG.config.payments || {}).completionAutoConfirmHours, 1, 168) +
        "</div>" +
        '<div class="sg-row" style="justify-content:flex-end;margin-top:16px">' +
          '<button class="sg-btn sg-btn--secondary" id="dspSave">' + SG.icon("check", 15) + "Salvar regras</button></div>" +
      "</div>",
      { className: "app-view--wide" }
    );

    var range = ui.$("#feeRange"), input = ui.$("#feeInput"), sample = ui.$("#feeSample");
    var save = ui.$("#feeSave");

    function value() { return Math.round(Number(input.value) * 100) / 100; }

    function setField(key, label, unit, val, min, max) {
      return '<div class="sg-field"><label class="sg-field__label" for="set_' + key + '">' + ui.esc(label) + "</label>" +
        '<div class="fee-input"><input class="sg-input" style="width:110px;font-size:1rem" id="set_' + key + '" data-setting="' + key +
        '" type="number" min="' + min + '" max="' + max + '" value="' + ui.esc(val === undefined ? "" : val) + '"><span style="font-size:.95rem">' +
        ui.esc(unit) + "</span></div></div>";
    }

    function paint() {
      var v = value();
      var valid = input.value !== "" && !isNaN(v) && v >= 0 && v <= 50;
      var price = Math.max(0, Number(sample.value) || 0);
      var fee = valid ? Math.round(price * v) / 100 : 0;
      ui.$("#feeSim").innerHTML = valid
        ? '<div class="fee-sim__row"><span>Cliente paga</span><b>' + ui.money(price) + "</b></div>" +
          '<div class="fee-sim__row fee-sim__row--brand"><span>ServeGo fica (' + pct(v) + ")</span><b>" + ui.money(fee) + "</b></div>" +
          '<div class="fee-sim__row"><span>Profissional recebe</span><b>' + ui.money(price - fee) + "</b></div>" +
          '<div class="fee-sim__bar"><span style="width:' + Math.min(100, v * 2) + '%"></span></div>' +
          (v !== current
            ? '<div class="sg-xs sg-dim" style="margin-top:10px">Hoje (' + pct(current) + "): ServeGo fica " +
              ui.money(Math.round(price * current) / 100) + " · diferença de " +
              ui.money(Math.round(price * (v - current)) / 100) + " por serviço deste valor.</div>"
            : "")
        : '<div class="sg-field__error">Informe um percentual entre 0% e 50%.</div>';
      save.disabled = !valid || v === current;
      ui.$$("#feePresets [data-fee]").forEach(function (b) {
        b.classList.toggle("is-active", Number(b.getAttribute("data-fee")) === v);
      });
    }

    range.addEventListener("input", function () { input.value = range.value; paint(); });
    input.addEventListener("input", function () { range.value = Math.min(30, value() || 0); paint(); });
    sample.addEventListener("input", paint);
    ui.on(ui.$("#feePresets"), "click", "[data-fee]", function (e, b) {
      input.value = b.getAttribute("data-fee");
      range.value = input.value;
      paint();
    });
    ui.$("#feeReset").addEventListener("click", function () {
      input.value = current;
      range.value = Math.min(30, current);
      paint();
    });

    save.addEventListener("click", function () {
      var v = value();
      ui.confirm({
        title: "Alterar a taxa da plataforma?",
        text: "De " + pct(current) + " para " + pct(v) + ". Vale para os próximos serviços concluídos.",
        okText: "Sim, alterar",
        danger: v > current
      }).then(function (ok) {
        if (!ok) return;
        ui.busy(save, true);
        api.settings.setPlatformFee(v).then(function (saved) {
          current = saved;
          ui.$("#feeCurrent").textContent = pct(saved);
          ui.busy(save, false);
          paint();
          history();
          ui.toast("Taxa atualizada", { type: "success", text: "A plataforma agora fica com " + pct(saved) + " de cada serviço." });
        }).catch(function (err) {
          ui.busy(save, false);
          ui.toast(SG.explainError(err), { type: "error" });
        });
      });
    });

    function history() {
      api.settings.feeHistory().then(function (list) {
        ui.$("#feeHistory").innerHTML = list.length
          ? '<div class="sg-stack">' + list.map(function (h) {
              return '<div class="sg-row sg-row--between" style="gap:10px">' +
                '<div style="min-width:0"><div class="sg-md sg-strong">' +
                  (h.old_percent === null || h.old_percent === undefined
                    ? "Taxa inicial de " + pct(h.new_percent)
                    : pct(h.old_percent) + " → " + pct(h.new_percent)) + "</div>" +
                '<div class="sg-xs sg-dim">' + ui.esc((h.admin && h.admin.full_name) || "Sistema") + "</div></div>" +
                '<span class="sg-xs sg-faint" style="white-space:nowrap">' + ui.dateTime(h.created_at) + "</span></div>";
            }).join('<div class="sg-divider"></div>') + "</div>"
          : ui.empty("🧾", "Sem alterações", "As mudanças de taxa aparecem aqui.");
      }).catch(function (e) {
        ui.$("#feeHistory").innerHTML = ui.empty("⚠️", "Histórico indisponível", SG.explainError(e));
      });
    }

    ui.$("#dspSave").addEventListener("click", function () {
      var btn = this;
      var inputs = ui.$$("[data-setting]");
      var bad = inputs.filter(function (i) {
        var v = Number(i.value);
        return i.value === "" || isNaN(v) || v < Number(i.min) || v > Number(i.max);
      })[0];
      if (bad) return ui.toast("Valor fora do limite", { type: "error", text: "Use entre " + bad.min + " e " + bad.max + "." });
      ui.busy(btn, true);
      inputs.reduce(function (p, i) {
        return p.then(function () { return api.settings.set(i.getAttribute("data-setting"), Number(i.value)); });
      }, Promise.resolve()).then(function () {
        ui.busy(btn, false);
        ui.toast("Regras salvas", { type: "success", text: "Valem para as próximas chamadas." });
      }).catch(function (e) {
        ui.busy(btn, false);
        ui.toast(SG.explainError(e), { type: "error" });
      });
    });

    paint();
    history();
  };

  /* ==========================================================================
     REENGAJAMENTO — quem não usa o app há tempo + lembrete
     ========================================================================== */
  function daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso)) / 864e5);
  }

  function lastSeenLabel(iso) {
    var d = daysSince(iso);
    if (d === null) return "Nunca acessou";
    if (d === 0) return "Hoje";
    if (d === 1) return "Ontem";
    return "há " + d + " dias";
  }

  var REMINDER_TEMPLATES = {
    client: {
      title: "{nome}, sentimos sua falta no ServeGo",
      body: "Precisa de um eletricista, encanador ou outro serviço? Peça pelo app e o profissional verificado mais próximo aceita em minutos, com preço fechado e pagamento protegido."
    },
    professional: {
      title: "{nome}, tem cliente procurando você",
      body: "Há pedidos de serviço perto de você. Fique online no ServeGo para receber chamadas — o cliente paga pelo app antes de você sair."
    }
  };

  SG.views.adminEngagement = function () {
    app.setHeader("Reengajamento", "Contas que não usam o app há tempo");
    app.view(
      '<div class="app-page-head"><h1>Reengajamento</h1>' +
        "<p>Veja quem não abre o ServeGo há algum tempo e envie um lembrete — no app, por e-mail ou pelo WhatsApp.</p></div>" +
      '<div id="engCards">' + ui.skeletonCard(1) + "</div>" +
      toolbar(searchBox("engSearch", "Buscar por nome ou e-mail…"), exportBtn("engCsv")) +
      chipRow("engPeriod", [["7", "7+ dias"], ["30", "30+ dias"], ["60", "60+ dias"], ["90", "90+ dias"], ["180", "180+ dias"]], "30") +
      chipRow("engRole", [["all", "Clientes e profissionais"], ["client", "Clientes"], ["professional", "Profissionais"]], "all") +
      '<label class="eng-skip"><input type="checkbox" id="engSkip" checked> Ocultar quem já recebeu lembrete nos últimos 7 dias</label>' +
      '<div class="eng-bulk sg-hide" id="engBulk"><span id="engBulkText"></span>' +
        '<button class="sg-btn sg-btn--primary sg-btn--sm" id="engSendBulk">' + SG.icon("send", 14) + "Enviar lembrete</button></div>" +
      '<div id="engList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [], period = 30, role = "all", query = "", skipRecent = true;
    var selected = {};

    function inactive(u) {
      if (u.role === "admin" || u.status === "blocked") return false;
      var d = daysSince(u.last_seen_at || u.created_at);
      return d !== null && d >= period;
    }

    function filtered() {
      return all.filter(function (u) {
        if (!inactive(u)) return false;
        if (role !== "all" && u.role !== role) return false;
        if (skipRecent && u.last_reminded_at && daysSince(u.last_reminded_at) < 7) return false;
        if (!query) return true;
        return ((u.full_name || "") + " " + (u.email || "")).toLowerCase().indexOf(query) >= 0;
      }).sort(function (a, b) {
        return new Date(a.last_seen_at || a.created_at) - new Date(b.last_seen_at || b.created_at);
      });
    }

    function cards() {
      var people = all.filter(function (u) { return u.role !== "admin" && u.status !== "blocked"; });
      function count(min, max) {
        return people.filter(function (u) {
          var d = daysSince(u.last_seen_at || u.created_at);
          return d >= min && (max === undefined || d < max);
        }).length;
      }
      var reminded = people.filter(function (u) { return u.last_reminded_at && daysSince(u.last_reminded_at) < 30; });
      var back = reminded.filter(function (u) { return u.last_seen_at && new Date(u.last_seen_at) > new Date(u.last_reminded_at); });
      ui.$("#engCards").innerHTML =
        kpiRow(
          metricCard("Ativos (7 dias)", ui.num(count(0, 7)), "de " + ui.num(people.length) + " contas", null, "activity", "green") +
          metricCard("Inativos 30–89 dias", ui.num(count(30, 90)), "bom momento para lembrar", null, "clock", "gold") +
          metricCard("Inativos 90+ dias", ui.num(count(90)), "risco de perder a conta", null, "alert", "red") +
          metricCard("Voltaram após lembrete", reminded.length ? Math.round(back.length / reminded.length * 100) + "%" : "—",
            ui.num(back.length) + " de " + ui.num(reminded.length) + " lembrados em 30 dias", null, "refresh", "blue"));
    }

    function whatsappLink(u) {
      var digits = String(u.phone || "").replace(/\D/g, "");
      if (digits.length < 10) return null;
      if (digits.length <= 11) digits = "55" + digits;
      var t = REMINDER_TEMPLATES[u.role] || REMINDER_TEMPLATES.client;
      var first = String(u.full_name || "").split(" ")[0];
      var msg = "Oi, " + first + "! Aqui é da equipe ServeGo. " + t.body;
      return "https://wa.me/" + digits + "?text=" + encodeURIComponent(msg);
    }

    function row(u) {
      var wa = whatsappLink(u);
      var d = daysSince(u.last_seen_at || u.created_at);
      var tone = d >= 90 ? "danger" : d >= 30 ? "brand" : "";
      return '<tr data-row="' + ui.esc(u.id) + '">' +
        '<td style="width:36px"><input type="checkbox" class="eng-check" data-pick="' + ui.esc(u.id) + '"' + (selected[u.id] ? " checked" : "") + "></td>" +
        '<td><div class="sg-row" style="min-width:0">' + ui.avatar(u, "sm") +
          '<div style="min-width:0"><button class="adm-link sg-md sg-strong sg-truncate" data-user="' + ui.esc(u.id) + '">' + ui.esc(u.full_name || "—") + "</button>" +
          '<div class="sg-xs sg-dim sg-truncate">' + ui.esc(u.email || "") + "</div></div></div></td>" +
        '<td><span class="sg-badge">' + ui.esc(ROLE_LABEL[u.role] || "—") + "</span></td>" +
        '<td><span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' + ui.esc(lastSeenLabel(u.last_seen_at)) + "</span>" +
          (u.last_seen_at ? '<div class="sg-xs sg-faint" style="margin-top:3px">' + ui.date(u.last_seen_at) + "</div>" : "") + "</td>" +
        '<td class="sg-md sg-dim">' + (u.last_reminded_at ? lastSeenLabel(u.last_reminded_at) : "Nunca") + "</td>" +
        '<td><div class="sg-row" style="gap:6px">' +
          '<button class="sg-btn sg-btn--outline sg-btn--sm" data-remind="' + ui.esc(u.id) + '">' + SG.icon("bell", 14) + "Lembrar</button>" +
          (wa ? '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="' + ui.esc(wa) + '" target="_blank" rel="noopener" data-wa="' + ui.esc(u.id) + '" title="Abrir conversa no WhatsApp com a mensagem pronta">' +
            SG.icon("chat", 14) + "WhatsApp</a>" : "") +
        "</div></td>" +
        "</tr>";
    }

    function paint() {
      cards();
      chipCounts("engPeriod", function (v) { var o = period; period = Number(v); var n = filtered().length; period = o; return n; });
      chipCounts("engRole", function (v) { var o = role; role = v; var n = filtered().length; role = o; return n; });
      var list = filtered();
      var allChecked = list.length && list.every(function (u) { return selected[u.id]; });
      ui.$("#engList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            '<th style="width:36px"><input type="checkbox" class="eng-check" id="engAll"' + (allChecked ? " checked" : "") + ' aria-label="Selecionar todos"></th>' +
            "<th>Conta</th><th>Papel</th><th>Último acesso</th><th>Último lembrete</th><th>Ações</th>" +
            "</tr></thead><tbody>" + list.map(row).join("") + "</tbody></table></div>" +
          '<div class="sg-xs sg-faint" style="margin-top:12px">' + ui.num(list.length) + " conta(s) sem acesso há " + period + "+ dias</div>"
        : ui.empty("🎉", "Ninguém inativo neste filtro", "Todas as contas deste grupo usaram o app recentemente.");
      paintBulk();
    }

    function selectedIds() {
      var visible = filtered().map(function (u) { return u.id; });
      return visible.filter(function (id) { return selected[id]; });
    }

    function paintBulk() {
      var ids = selectedIds();
      ui.$("#engBulk").classList.toggle("sg-hide", !ids.length);
      ui.$("#engBulkText").textContent = ids.length + " conta(s) selecionada(s)";
    }

    function load() {
      return api.admin.listUsers().then(function (list) { all = list; paint(); });
    }
    load();

    bindChips("engPeriod", function (v) { period = Number(v); selected = {}; paint(); });
    bindChips("engRole", function (v) { role = v; selected = {}; paint(); });
    bindSearch("engSearch", function (q) { query = q; paint(); });
    ui.$("#engSkip").addEventListener("change", function () { skipRecent = this.checked; paint(); });

    var listEl = ui.$("#engList");
    listEl.addEventListener("change", function (e) {
      var t = e.target;
      if (t.id === "engAll") {
        filtered().forEach(function (u) { selected[u.id] = t.checked; });
        paint();
      } else if (t.hasAttribute("data-pick")) {
        selected[t.getAttribute("data-pick")] = t.checked;
        paintBulk();
      }
    });
    ui.on(listEl, "click", "[data-user]", function (e, el) { openUserDetail(el.getAttribute("data-user"), { onChange: load }); });
    ui.on(listEl, "click", "[data-remind]", function (e, el) {
      var u = all.filter(function (x) { return x.id === el.getAttribute("data-remind"); })[0];
      if (u) openReminder([u]);
    });
    ui.on(listEl, "click", "[data-wa]", function (e, el) {
      // registra o contato manual na trilha de auditoria
      api.admin.log("reminder.whatsapp", "profile", el.getAttribute("data-wa"));
    });
    ui.$("#engSendBulk").addEventListener("click", function () {
      var ids = selectedIds();
      openReminder(all.filter(function (u) { return ids.indexOf(u.id) >= 0; }));
    });

    ui.$("#engCsv").addEventListener("click", function () {
      downloadCsv("servego-inativos", [
        ["Nome", function (u) { return u.full_name; }],
        ["E-mail", function (u) { return u.email; }],
        ["Celular", function (u) { return u.phone; }],
        ["Papel", function (u) { return ROLE_LABEL[u.role]; }],
        ["Último acesso", function (u) { return u.last_seen_at ? ui.dateTime(u.last_seen_at) : "Nunca"; }],
        ["Dias sem acesso", function (u) { return daysSince(u.last_seen_at || u.created_at); }],
        ["Último lembrete", function (u) { return u.last_reminded_at ? ui.dateTime(u.last_reminded_at) : ""; }]
      ], filtered());
    });

    /* Modal do lembrete --------------------------------------------------- */
    function openReminder(people) {
      if (!people.length) return;
      var roles = {};
      people.forEach(function (u) { roles[u.role] = true; });
      var tplKey = roles.professional && !roles.client ? "professional" : "client";
      var tpl = REMINDER_TEMPLATES[tplKey];
      var sample = people[0];
      var m = ui.modal({
        title: people.length === 1 ? "Lembrar " + (sample.full_name || "") : "Lembrete para " + people.length + " contas",
        size: "lg",
        body:
          '<div class="sg-row sg-row--wrap" style="gap:10px;margin-bottom:14px">' +
            '<span class="sg-xs sg-dim">Modelo:</span>' +
            '<div class="sg-seg" id="remTpl">' +
            '<button class="sg-chip' + (tplKey === "client" ? " is-active" : "") + '" data-tpl="client">Para clientes</button>' +
            '<button class="sg-chip' + (tplKey === "professional" ? " is-active" : "") + '" data-tpl="professional">Para profissionais</button>' +
          "</div></div>" +
          '<div class="sg-field"><label class="sg-field__label" for="remTitle">Título</label>' +
            '<input class="sg-input" id="remTitle" maxlength="90" value="' + ui.esc(tpl.title) + '"></div>' +
          '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="remBody">Mensagem</label>' +
            '<textarea class="sg-textarea" id="remBody" rows="4" maxlength="400">' + ui.esc(tpl.body) + "</textarea>" +
            '<div class="sg-xs sg-faint" style="margin-top:4px">Use <b>{nome}</b> para o primeiro nome de cada pessoa.</div></div>' +
          '<div class="sg-field__label" style="margin:16px 0 8px">Enviar por</div>' +
          '<label class="eng-skip" style="margin:0 0 6px"><input type="checkbox" checked disabled> Notificação no app</label>' +
          '<label class="eng-skip" style="margin:0"><input type="checkbox" id="remEmail" checked> E-mail' +
            ' <span class="sg-xs sg-faint">(chega mesmo sem a pessoa abrir o app)</span></label>' +
          '<div class="app-section-title" style="margin-top:16px"><h3>Como ' + ui.esc(String(sample.full_name || "").split(" ")[0]) + " vai ver</h3></div>" +
          '<div class="notif-item is-unread adm-preview"><span class="notif-item__ic">👋</span>' +
            '<span style="min-width:0"><span class="sg-md sg-strong" style="display:block" id="remPrevT"></span>' +
            '<span class="sg-xs sg-dim" id="remPrevB"></span></span></div>' +
          (people.length > 1 ? '<p class="sg-xs sg-faint" style="margin-top:10px">' + people.slice(0, 6).map(function (u) {
            return ui.esc(String(u.full_name || "").split(" ")[0]);
          }).join(", ") + (people.length > 6 ? " e mais " + (people.length - 6) : "") + ".</p>" : ""),
        footer: '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button>' +
          '<button class="sg-btn sg-btn--primary" data-send>' + SG.icon("send", 15) + "Enviar lembrete</button>"
      });

      var t = ui.$("#remTitle", m.el), b = ui.$("#remBody", m.el);
      var first = String(sample.full_name || "").split(" ")[0];
      function preview() {
        ui.$("#remPrevT", m.el).textContent = t.value.split("{nome}").join(first);
        ui.$("#remPrevB", m.el).textContent = b.value.split("{nome}").join(first);
      }
      t.addEventListener("input", preview);
      b.addEventListener("input", preview);
      preview();
      ui.on(ui.$("#remTpl", m.el), "click", "[data-tpl]", function (e, el) {
        var k = el.getAttribute("data-tpl");
        ui.$$("#remTpl [data-tpl]", m.el).forEach(function (c) { c.classList.toggle("is-active", c === el); });
        t.value = REMINDER_TEMPLATES[k].title;
        b.value = REMINDER_TEMPLATES[k].body;
        preview();
      });

      m.el.querySelector("[data-send]").addEventListener("click", function () {
        var btn = this;
        if (t.value.trim().length < 3 || b.value.trim().length < 10) {
          return ui.toast("Preencha título e mensagem", { type: "error" });
        }
        var byEmail = ui.$("#remEmail", m.el).checked;
        ui.busy(btn, true);
        api.admin.sendReminder(people.map(function (u) { return u.id; }), t.value.trim(), b.value.trim(), byEmail)
          .then(function (res) {
            m.close();
            selected = {};
            ui.toast("Lembrete enviado", {
              type: "success",
              text: ui.num(res.notified) + " notificação(ões) no app" +
                (byEmail && res.email_configured === false ? " · e-mail não configurado (RESEND_API_KEY)" :
                  res.emailed ? " · " + ui.num(res.emailed) + " e-mail(s)" : "")
            });
            load();
          }).catch(function (e) {
            ui.busy(btn, false);
            ui.toast(SG.explainError(e), { type: "error" });
          });
      });
    }
  };

  /* ==========================================================================
     DISPUTAS — análise dos fatos e decisão sobre o pagamento retido
     ========================================================================== */
  var DISPUTE_SLA_HOURS = 48;

  function disputeBadge(status) {
    var tone = { open: "brand", awaiting_info: "info", resolved_refund: "danger", resolved_release: "success" }[status] || "";
    var label = (SG.disputeLabels && SG.disputeLabels.status[status]) || status;
    return '<span class="sg-badge' + (tone ? " sg-badge--" + tone : "") + '">' + ui.esc(label) + "</span>";
  }

  function slaInfo(d) {
    if (d.status !== "open" && d.status !== "awaiting_info") return null;
    var due = new Date(new Date(d.created_at).getTime() + DISPUTE_SLA_HOURS * 3600e3);
    var hoursLeft = Math.round((due - Date.now()) / 3600e3);
    return { due: due, late: hoursLeft < 0, hoursLeft: hoursLeft };
  }

  SG.views.adminDisputes = function () {
    app.setHeader("Disputas", "Análise dos fatos e decisão sobre o pagamento retido");
    app.view(
      '<div class="app-page-head"><h1>Disputas</h1>' +
        "<p>Quando o cliente toca em “Tive um problema”, o pagamento fica retido. Analise as provas dos dois lados e decida: estorno ao cliente ou pagamento ao profissional.</p></div>" +
      '<div id="dsCards">' + ui.skeletonCard(1) + "</div>" +
      chipRow("dsFilters", [["active", "Para analisar"], ["awaiting_info", "Aguardando informação"], ["decided", "Decididas"], ["all", "Todas"]], "active") +
      '<div id="dsList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [], filter = "active";

    function cards() {
      var open = all.filter(function (d) { return d.status === "open"; });
      var waiting = all.filter(function (d) { return d.status === "awaiting_info"; });
      var late = all.filter(function (d) { var s = slaInfo(d); return s && s.late; });
      var decided = all.filter(function (d) { return /^resolved/.test(d.status); });
      var refunds = decided.filter(function (d) { return d.status === "resolved_refund"; }).length;
      var held = open.concat(waiting).reduce(function (s, d) { return s + Number(d.amount || 0); }, 0);
      ui.$("#dsCards").innerHTML =
        kpiRow(
          metricCard("Para analisar", ui.num(open.length), ui.money(held) + " retidos no total", null, "alert", "gold") +
          metricCard("Aguardando informação", ui.num(waiting.length), "pedido feito a uma das partes", null, "chat", "blue") +
          metricCard("Fora do prazo (" + DISPUTE_SLA_HOURS + " h)", ui.num(late.length), late.length ? "priorize estes casos" : "tudo dentro do prazo", null, "clock", "red") +
          metricCard("Decididas", ui.num(decided.length),
            decided.length ? Math.round(refunds / decided.length * 100) + "% com estorno ao cliente" : "nenhuma ainda", null, "checkCircle", "green"));
    }

    function card(d) {
      var s = slaInfo(d);
      var title = (d.request && d.request.title) || "Serviço";
      var icon = SG.catIcon(d.request && d.request.category, 22);
      return '<a class="sg-card sg-card--hover ds-card" href="#/admin/disputas/' + ui.esc(d.id) + '">' +
        '<span class="sg-avatar sg-avatar--lg sg-avatar--cat">' + icon + "</span>" +
        '<div style="min-width:0">' +
          '<div class="sg-row" style="gap:8px;flex-wrap:wrap"><span class="sg-strong sg-truncate">' + ui.esc(title) + "</span>" + disputeBadge(d.status) + "</div>" +
          '<div class="sg-xs sg-dim" style="margin-top:3px">' + ui.esc(d.reason) + " · " +
            ui.esc((d.client && d.client.full_name) || "Cliente") + " × " + ui.esc((d.professional && d.professional.full_name) || "Profissional") + "</div>" +
          '<div class="sg-row sg-row--wrap sg-xs sg-dim" style="gap:14px;margin-top:8px">' +
            "<span>" + SG.icon("camera", 12) + " " + ui.num(d.evidence_count || 0) + " prova(s)</span>" +
            "<span>" + SG.icon("chat", 12) + " " + (d.pro_answered ? "profissional respondeu" : "<b>sem resposta do profissional</b>") + "</span>" +
            "<span>" + SG.icon("clock", 12) + " aberta " + ui.timeAgo(d.created_at) + "</span>" +
            (s ? '<span class="' + (s.late ? "ds-late" : "") + '">' + (s.late ? "atrasada " + (-s.hoursLeft) + " h" : "prazo em " + s.hoursLeft + " h") + "</span>" : "") +
          "</div>" +
        "</div>" +
        '<div class="ds-card__amount"><div class="sg-xs sg-faint">Retido</div><div class="sg-strong">' + ui.money(d.amount) + "</div></div>" +
      "</a>";
    }

    function passes(d, f) {
      if (f === "active") return d.status === "open";
      if (f === "awaiting_info") return d.status === "awaiting_info";
      if (f === "decided") return /^resolved/.test(d.status);
      return true;
    }

    function paint() {
      cards();
      chipCounts("dsFilters", function (v) { return all.filter(function (d) { return passes(d, v); }).length; });
      var list = all.filter(function (d) { return passes(d, filter); }).sort(function (a, b) {
        // mais antigas primeiro na fila; decididas, mais recentes primeiro
        return filter === "decided" ? new Date(b.decided_at) - new Date(a.decided_at) : new Date(a.created_at) - new Date(b.created_at);
      });
      ui.$("#dsList").innerHTML = list.length
        ? '<div class="sg-stack">' + list.map(card).join("") + "</div>"
        : ui.empty("⚖️", filter === "active" ? "Nenhuma disputa para analisar" : "Nada neste filtro", "Quando um cliente relatar um problema, o caso aparece aqui.");
    }

    api.disputes.list().then(function (list) { all = list; paint(); })
      .catch(function (e) { ui.$("#dsList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)); });
    bindChips("dsFilters", function (v) { filter = v; paint(); });
  };

  /* ---- Análise de um caso -------------------------------------------------- */
  SG.views.adminDispute = function (params) {
    app.setHeader("Disputa", "Análise do caso");
    app.view(ui.skeletonCard(3), { className: "app-view--wide" });

    function load() {
      return api.disputes.get(params.id).then(function (res) {
        if (!res) return SG.router.go("/admin/disputas", true);
        render(res);
      }).catch(function (e) {
        app.view(ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e)));
      });
    }

    function render(res) {
      var d = res.dispute, bk = res.booking || {}, req = bk.request || d.request || {};
      var entries = res.entries || [];
      var decided = /^resolved/.test(d.status);
      var s = slaInfo(d);
      var net = Number(d.amount) * (1 - SG.config.app.platformFeePercent / 100);
      var clientEv = entries.filter(function (e) { return e.party === "client"; })
        .reduce(function (n, e) { return n + (e.attachments || []).length; }, 0);
      var proEntries = entries.filter(function (e) { return e.party === "professional"; });
      var PL = (SG.disputeLabels && SG.disputeLabels.party) || {};

      app.setHeader(req.title || "Disputa", (SG.disputeLabels && SG.disputeLabels.status[d.status]) || "");
      app.view(
        '<a class="sg-btn sg-btn--ghost sg-btn--sm" href="#/admin/disputas" style="margin-bottom:16px">' + SG.icon("arrowLeft", 15) + "Disputas</a>" +
        '<div class="sg-grid adm-split ds-detail">' +
          "<div>" +
            /* cabeçalho */
            '<div class="sg-card">' +
              '<div class="sg-row sg-row--between" style="gap:12px;flex-wrap:wrap">' +
                '<div class="sg-row" style="min-width:0;gap:12px">' +
                  '<span class="sg-avatar sg-avatar--lg sg-avatar--cat">' + SG.catIcon(req.category, 22) + "</span>" +
                  '<div style="min-width:0"><div class="sg-eyebrow">' + ui.esc((req.category && req.category.name) || "Serviço") + "</div>" +
                  '<h3 style="margin-top:4px">' + ui.esc(req.title || "") + "</h3>" +
                  '<div class="sg-sm sg-dim">Motivo: <b>' + ui.esc(d.reason) + "</b> · aberta em " + ui.dateTime(d.created_at) + "</div></div>" +
                "</div>" + disputeBadge(d.status) +
              "</div>" +
              '<div class="ds-parties">' +
                party(d.client, "Cliente", d.client_id) +
                '<div class="ds-vs">' + SG.icon("lock", 16) + "<b>" + ui.money(d.amount) + "</b><span>retidos</span></div>" +
                party(d.professional, "Profissional", d.professional_id) +
              "</div>" +
              (s ? '<div class="sg-xs ' + (s.late ? "ds-late" : "sg-dim") + '" style="margin-top:12px">' + SG.icon("clock", 12) + " " +
                (s.late ? "Fora do prazo de " + DISPUTE_SLA_HOURS + " h — decidir com prioridade."
                        : "Decidir até " + ui.dateTime(s.due) + " (" + s.hoursLeft + " h restantes).") + "</div>" : "") +
            "</div>" +

            /* relatos e provas */
            '<div class="app-section-title"><h3>Relatos e provas</h3><span class="sg-xs sg-dim">' +
              ui.num(clientEv) + " prova(s) do cliente · " + (proEntries.length ? "profissional respondeu" : "profissional ainda não respondeu") + "</span></div>" +
            '<div class="sg-stack">' + entries.map(function (e) {
              return '<div class="sg-card ds-entry ds-entry--' + e.party + '">' +
                '<div class="sg-row sg-row--between" style="gap:10px">' +
                  '<div class="sg-row" style="gap:10px">' + ui.avatar(e.author || (e.party === "client" ? d.client : d.professional), "sm") +
                    '<div><div class="sg-sm sg-strong">' + ui.esc(PL[e.party] || e.party) + " · " +
                      ui.esc((e.author && e.author.full_name) || "") + "</div>" +
                    '<div class="sg-xs sg-faint">' + ui.dateTime(e.created_at) + "</div></div></div>" +
                  ((e.attachments || []).length ? '<span class="sg-badge">' + SG.icon("camera", 11) + (e.attachments || []).length + "</span>" : "") +
                "</div>" +
                (e.note ? '<p class="sg-md sg-break" style="margin-top:10px">' + ui.esc(e.note) + "</p>" : "") +
                galleryAdmin(e.attachments) +
              "</div>";
            }).join("") + "</div>" +

            /* pedido original */
            '<div class="app-section-title"><h3>O que foi contratado</h3></div>' +
            '<div class="sg-card">' +
              '<p class="sg-md sg-muted sg-break">' + ui.esc(req.description || "—") + "</p>" +
              ((req.photos || []).length ? '<div class="sg-field__label" style="margin:12px 0 8px">Fotos enviadas no pedido (antes do serviço)</div>' +
                galleryAdmin((req.photos || []).map(function (p) { return { kind: "image", url: p.url }; })) : "") +
              '<div class="adm-kvs adm-kvs--2" style="margin-top:14px">' +
                kv("Preço fechado", ui.money(bk.price || d.amount)) +
                kv("Pagamento", bk.payment ? (bk.payment.method === "pix" ? "Pix" : "Cartão") + " · " + ui.dateTime(bk.payment.paid_at) : "—") +
                kv("Endereço", ui.esc(req.address || "—")) +
                kv("Profissional concluiu em", bk.pro_completed_at ? ui.dateTime(bk.pro_completed_at) : "—") +
              "</div>" +
            "</div>" +

            /* linha do tempo + chat */
            '<div class="sg-grid sg-grid--2" style="gap:16px;margin-top:24px">' +
              '<div class="sg-card"><div class="sg-card__head"><span class="sg-card__title">Linha do tempo</span></div>' +
                '<div class="ds-events">' + (bk.events || []).map(function (ev) {
                  return '<div class="ds-event"><span>' + ui.esc(ui.labels.bookingStatus[ev.status] || ev.status) + "</span>" +
                    '<span class="sg-faint">' + ui.dateTime(ev.created_at) + "</span></div>";
                }).join("") + "</div></div>" +
              '<div class="sg-card"><div class="sg-card__head"><span class="sg-card__title">Conversa no chat</span>' +
                '<span class="sg-xs sg-dim">' + ui.num((res.messages || []).length) + " mensagem(ns)</span></div>" +
                '<div class="ds-chat">' + ((res.messages || []).length ? res.messages.map(function (m) {
                  var who = m.sender_id === d.client_id ? "client" : "professional";
                  return '<div class="ds-msg ds-msg--' + who + '"><div class="sg-xs sg-strong">' + ui.esc(PL[who]) +
                    ' <span class="sg-faint" style="font-weight:400">· ' + ui.dateTime(m.created_at) + "</span></div>" +
                    '<div class="sg-sm sg-break">' + ui.esc(m.content || "[imagem]") + "</div></div>";
                }).join("") : '<p class="sg-sm sg-dim">Sem mensagens.</p>') + "</div></div>" +
            "</div>" +
          "</div>" +

          /* painel de decisão */
          '<div class="ds-side">' + (decided ? decidedPanel(d) : decisionPanel(d, net)) +
            '<div class="sg-card" style="margin-top:16px">' +
              '<div class="sg-card__head"><span class="sg-card__title">Notas internas</span><span class="sg-xs sg-dim">só o admin vê</span></div>' +
              '<textarea class="sg-textarea" id="dsNotes" rows="4" placeholder="Anotações da análise…">' + ui.esc(d.admin_notes || "") + "</textarea>" +
              '<button class="sg-btn sg-btn--secondary sg-btn--sm" id="dsNotesSave" style="margin-top:10px">Salvar notas</button>' +
            "</div>" +
          "</div>" +
        "</div>",
        { className: "app-view--wide" }
      );
      bind(d, net);
    }

    function party(p, label, id) {
      p = p || {};
      return '<div class="ds-party">' + ui.avatar(p, "lg") +
        '<div style="min-width:0"><div class="sg-xs sg-faint">' + label + "</div>" +
        '<button class="adm-link sg-strong" data-user="' + ui.esc(id) + '">' + ui.esc(p.full_name || "—") + "</button></div></div>";
    }

    function galleryAdmin(list) {
      if (!list || !list.length) return "";
      return '<div class="ev-gallery ev-gallery--lg">' + list.map(function (a, i) {
        return a.kind === "video"
          ? '<video class="ev-item" src="' + ui.esc(a.url || "") + '" controls preload="metadata"></video>'
          : '<button class="ev-item" data-zoom-img="' + ui.esc(a.url || "") + '"><img src="' + ui.esc(a.url || "") + '" alt="Prova ' + (i + 1) + '"></button>';
      }).join("") + "</div>";
    }

    function decidedPanel(d) {
      var refund = d.status === "resolved_refund";
      return '<div class="sg-card">' +
        '<div class="idnotice ' + (refund ? "idnotice--danger" : "idnotice--success") + '" style="margin:0">' +
          SG.icon(refund ? "refresh" : "checkCircle", 18) +
          '<div><div class="sg-md sg-strong">' + (refund ? "Estorno integral ao cliente" : "Pagamento liberado ao profissional") + "</div>" +
          '<div class="sg-xs">' + (d.decided_at ? "Decidido em " + ui.dateTime(d.decided_at) : "") + "</div></div></div>" +
        '<div class="sg-field__label" style="margin:14px 0 6px">Justificativa enviada às partes</div>' +
        '<p class="sg-sm sg-break">' + ui.esc(d.decision_reason || "—") + "</p></div>";
    }

    function decisionPanel(d, net) {
      return '<div class="sg-card">' +
          '<div class="sg-card__head"><span class="sg-card__title">Pedir mais informações</span></div>' +
          (d.status === "awaiting_info"
            ? '<div class="idnotice" style="margin:0 0 12px">' + SG.icon("clock", 16) + '<div class="sg-sm">Aguardando ' +
              (d.info_requested_from === "client" ? "o cliente" : "o profissional") + ": " + ui.esc(d.info_request || "") + "</div></div>"
            : "") +
          '<div class="sg-segment" id="dsParty" style="width:100%;margin-bottom:10px">' +
            '<button class="sg-segment__item is-active" data-party="client" style="flex:1">Cliente</button>' +
            '<button class="sg-segment__item" data-party="professional" style="flex:1">Profissional</button></div>' +
          '<textarea class="sg-textarea" id="dsAsk" rows="3" placeholder="Ex.: Envie um vídeo mostrando o vazamento com a torneira fechada."></textarea>' +
          '<button class="sg-btn sg-btn--secondary sg-btn--sm sg-btn--block" id="dsAskSend" style="margin-top:10px">' + SG.icon("send", 14) + "Enviar pedido</button>" +
        "</div>" +
        '<div class="sg-card" style="margin-top:16px">' +
          '<div class="sg-card__head"><span class="sg-card__title">Decisão</span><span class="sg-xs sg-dim">' + ui.money(d.amount) + " retidos</span></div>" +
          '<div class="ds-options" id="dsOptions">' +
            '<button class="sg-choice ds-option" data-outcome="refund">' +
              '<span class="sg-choice__radio"></span><span style="text-align:left"><span class="sg-choice__title" style="display:block">Estornar ao cliente</span>' +
              '<span class="sg-choice__sub">' + ui.money(d.amount) + " voltam integralmente ao cliente e o serviço é cancelado</span></span></button>" +
            '<button class="sg-choice ds-option" data-outcome="release">' +
              '<span class="sg-choice__radio"></span><span style="text-align:left"><span class="sg-choice__title" style="display:block">Pagar o profissional</span>' +
              '<span class="sg-choice__sub">serviço concluído · ' + ui.money(net) + " vão para o repasse dele</span></span></button>" +
          "</div>" +
          '<div class="sg-field" style="margin-top:12px"><label class="sg-field__label" for="dsReason">Justificativa (enviada ao cliente e ao profissional)</label>' +
            '<textarea class="sg-textarea" id="dsReason" rows="4" placeholder="Explique com base nas provas por que o pagamento vai para quem você decidiu."></textarea></div>' +
          '<button class="sg-btn sg-btn--primary sg-btn--block" id="dsDecide" disabled style="margin-top:12px">' + SG.icon("check", 15) + "Registrar decisão</button>" +
        "</div>";
    }

    function bind(d, net) {
      var main = ui.$("#main");
      ui.on(main, "click", "[data-zoom-img]", function (e, el) { openImage(el.getAttribute("data-zoom-img"), "Prova"); });
      ui.on(main, "click", "[data-user]", function (e, el) { openUserDetail(el.getAttribute("data-user")); });

      ui.$("#dsNotesSave").addEventListener("click", function () {
        var btn = this;
        ui.busy(btn, true);
        api.disputes.setNotes(d.id, ui.$("#dsNotes").value).then(function () {
          ui.busy(btn, false);
          ui.toast("Notas salvas", { type: "success" });
        }).catch(function (e) { ui.busy(btn, false); ui.toast(SG.explainError(e), { type: "error" }); });
      });

      if (/^resolved/.test(d.status)) return;

      var party = "client";
      ui.on(ui.$("#dsParty"), "click", "[data-party]", function (e, el) {
        party = el.getAttribute("data-party");
        ui.$$("#dsParty .sg-segment__item").forEach(function (b) { b.classList.toggle("is-active", b === el); });
      });
      ui.$("#dsAskSend").addEventListener("click", function () {
        var btn = this, msg = ui.$("#dsAsk").value.trim();
        if (msg.length < 5) return ui.toast("Escreva o que você precisa", { type: "error" });
        ui.busy(btn, true);
        api.disputes.requestInfo(d.id, party, msg).then(function () {
          ui.toast("Pedido enviado", { type: "success", text: "A parte foi notificada." });
          load();
        }).catch(function (e) { ui.busy(btn, false); ui.toast(SG.explainError(e), { type: "error" }); });
      });

      var outcome = null;
      var decideBtn = ui.$("#dsDecide");
      ui.on(ui.$("#dsOptions"), "click", "[data-outcome]", function (e, el) {
        outcome = el.getAttribute("data-outcome");
        ui.$$("#dsOptions .ds-option").forEach(function (b) { b.classList.toggle("is-selected", b === el); });
        decideBtn.disabled = false;
      });
      decideBtn.addEventListener("click", function () {
        var reason = ui.$("#dsReason").value.trim();
        if (!outcome) return;
        if (reason.length < 10) return ui.toast("Escreva a justificativa", { type: "error", text: "Ela é enviada ao cliente e ao profissional." });
        var refund = outcome === "refund";
        ui.confirm({
          title: refund ? "Estornar " + ui.money(d.amount) + " ao cliente?" : "Liberar o pagamento ao profissional?",
          text: (refund ? "O serviço será cancelado e o valor devolvido integralmente." : "O serviço será dado como concluído e " + ui.money(net) + " entram no repasse.") +
            " Esta decisão não pode ser desfeita pelo painel.",
          okText: refund ? "Estornar ao cliente" : "Pagar o profissional",
          danger: refund
        }).then(function (ok) {
          if (!ok) return;
          ui.busy(decideBtn, true);
          api.disputes.decide(d.id, outcome, reason).then(function () {
            ui.toast("Decisão registrada", { type: "success", text: "Cliente e profissional foram avisados." });
            app.refreshAdminBadges();
            load();
          }).catch(function (e) { ui.busy(decideBtn, false); ui.toast(SG.explainError(e), { type: "error" }); });
        });
      });
    }

    load();
  };

  /* ==========================================================================
     12. AUDITORIA
     ========================================================================== */
  SG.views.adminAudit = function () {
    app.setHeader("Auditoria", "Tudo o que foi decidido no painel");
    app.view(
      '<div class="app-page-head"><h1>Auditoria</h1>' +
        "<p>Registro imutável das ações administrativas: aprovações, bloqueios, repasses e comunicados.</p></div>" +
      '<div id="auStats">' + kpiRow(ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1) + ui.skeletonCard(1)) + "</div>" +
      toolbar(searchBox("auSearch", "Buscar por usuário ou ação…"), exportBtn("auCsv")) +
      chipRow("auFilters", [
        ["all", "Tudo"], ["identity", "Identidade"], ["user", "Contas"], ["professional", "Profissionais"],
        ["document", "Documentos"], ["report", "Denúncias"], ["transaction", "Financeiro"], ["broadcast", "Comunicados"],
        ["settings", "Configurações"], ["payment", "Pagamentos"], ["dispute", "Disputas"], ["reminder", "Lembretes"]
      ], "all") +
      '<div id="auList">' + ui.skeletonCard(3) + "</div>",
      { className: "app-view--wide" }
    );

    var all = [], filter = "all", query = "";

    function detailText(a) {
      var d = a.details || {};
      return [d.motivo, d.titulo, d.documento, d.valor ? ui.money(d.valor) : null, d.enviados !== undefined ? d.enviados + " destinatário(s)" : null,
        d.para !== undefined ? pct(d.de) + " → " + pct(d.para) : null]
        .filter(Boolean).join(" · ");
    }

    function matches(a) {
      if (filter !== "all" && a.action.indexOf(filter + ".") !== 0) return false;
      if (!query) return true;
      return [AUDIT_LABEL[a.action] || a.action, a.target && a.target.full_name, a.target && a.target.email, detailText(a)]
        .join(" ").toLowerCase().indexOf(query) >= 0;
    }

    function auStats() {
      var since = function (d) { return all.filter(function (a) { return Date.now() - new Date(a.created_at) < d * 864e5; }).length; };
      var admins = {};
      all.forEach(function (a) { if (a.admin_id) admins[a.admin_id] = 1; });
      var sensitive = all.filter(function (a) { return /blocked|refunded|rejected/.test(a.action); }).length;
      ui.$("#auStats").innerHTML = kpiRow(
        metricCard("Ações registradas", ui.num(all.length), "desde o início", null, "doc", "blue") +
        metricCard("Últimos 7 dias", ui.num(since(7)), ui.num(since(1)) + " nas últimas 24 h", null, "calendar", "gold") +
        metricCard("Ações sensíveis", ui.num(sensitive), "bloqueios, recusas e estornos", null, "shield", "red") +
        metricCard("Administradores", ui.num(Object.keys(admins).length), "que já agiram no painel", null, "users", "violet"));
    }

    function paint() {
      auStats();
      chipCounts("auFilters", function (v) { var o = filter; filter = v; var n = all.filter(matches).length; filter = o; return n; });
      var list = all.filter(matches);
      ui.$("#auList").innerHTML = list.length
        ? '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
            "<th>Quando</th><th>Ação</th><th>Alvo</th><th>Detalhes</th><th>Por</th>" +
            "</tr></thead><tbody>" + list.map(function (a) {
              var tone = /approved|unblocked|released|resolved/.test(a.action) ? "success"
                : /rejected|blocked|refunded/.test(a.action) ? "danger" : "brand";
              return "<tr>" +
                '<td class="sg-md sg-dim" style="white-space:nowrap">' + ui.dateTime(a.created_at) + "</td>" +
                '<td><span class="sg-badge sg-badge--' + tone + '">' + ui.esc(AUDIT_LABEL[a.action] || a.action) + "</span></td>" +
                '<td class="sg-md">' + (a.target
                  ? '<button class="adm-link" data-user="' + ui.esc(a.target_id) + '">' + ui.esc(a.target.full_name || a.target.email || "—") + "</button>"
                  : '<span class="sg-dim">' + ui.esc(a.target_type || "—") + "</span>") + "</td>" +
                '<td class="sg-md sg-dim">' + ui.esc(detailText(a) || "—") + "</td>" +
                '<td class="sg-md sg-dim">' + ui.esc((a.admin && a.admin.full_name) || "—") + "</td>" +
                "</tr>";
            }).join("") + "</tbody></table></div>"
        : ui.empty("🗒", "Nenhum registro", "As ações do painel aparecem aqui.");
    }

    api.admin.listAudit().then(function (list) {
      all = list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      paint();
    }).catch(function (e) {
      ui.$("#auList").innerHTML = ui.empty("⚠️", "Não foi possível carregar", SG.explainError(e));
    });

    bindChips("auFilters", function (v) { filter = v; paint(); });
    bindSearch("auSearch", function (q) { query = q; paint(); });
    ui.on(ui.$("#auList"), "click", "[data-user]", function (e, el) { openUserDetail(el.getAttribute("data-user")); });

    ui.$("#auCsv").addEventListener("click", function () {
      downloadCsv("servego-auditoria", [
        ["Quando", function (a) { return ui.dateTime(a.created_at); }],
        ["Ação", function (a) { return AUDIT_LABEL[a.action] || a.action; }],
        ["Alvo", function (a) { return a.target ? a.target.full_name : a.target_type; }],
        ["Detalhes", detailText],
        ["Administrador", function (a) { return a.admin && a.admin.full_name; }]
      ], all.filter(matches));
    });
  };

  /* Utilitários compartilhados com js/views/admin-control.js */
  SG.adminKit = {
    chipRow: chipRow, bindChips: bindChips, chipCounts: chipCounts, searchBox: searchBox, bindSearch: bindSearch,
    toolbar: toolbar, exportBtn: exportBtn, metricCard: metricCard, kpiRow: kpiRow, downloadCsv: downloadCsv,
    verificationBadge: verificationBadge, identityBadge: identityBadge, accountBadge: accountBadge, txBadge: txBadge,
    openImage: openImage, cpfCell: cpfCell, ageFrom: ageFrom, kv: kv, dailySeries: dailySeries,
    openVerificationReview: openVerificationReview,
    ROLE_LABEL: ROLE_LABEL, IDENTITY_LABEL: IDENTITY_LABEL, DOC_LABEL: DOC_LABEL, TX_STATUS: TX_STATUS,
    PAY_STATUS: PAY_STATUS, AUDIT_LABEL: AUDIT_LABEL, REPORT_STATUS: REPORT_STATUS
  };
})(window.SG);
