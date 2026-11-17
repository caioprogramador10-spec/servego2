/* ==========================================================================
   ServeGo — Autenticação (entrar / criar conta)
   Criar conta = Dados (com CPF) → Documento (frente e verso) → Selfie → Revisão.
   A verificação de identidade vale para clientes e profissionais.
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api;
  SG.views = SG.views || {};

  SG.views.auth = function (opts) {
    opts = opts || {};
    var mode = "signin";
    var role = "client";
    var draft = {};
    var signupStage = "data"; // data | identity

    function aside() {
      return (
        '<aside class="auth__aside">' +
          "<div>" + SG.brandLogo({ size: "lg" }) + "</div>" +
          "<div>" +
            '<div class="sg-eyebrow" style="margin-bottom:18px">Marketplace de serviços</div>' +
            '<h2 style="max-width:14ch;font-size:2.4rem">O profissional que você precisa, <span class="sg-brand-text">quando precisa</span>.</h2>' +
            '<p class="sg-lead" style="margin-top:18px;max-width:42ch">Profissionais verificados, preço fechado pago pelo app e acompanhamento do serviço em tempo real.</p>' +
            '<div class="sg-row" style="gap:28px;margin-top:40px;flex-wrap:wrap">' +
              stat("12.400+", "profissionais ativos") +
              stat("4,9", "avaliação média") +
              stat("2 min", "para o profissional aceitar") +
            "</div>" +
            '<div class="auth__trust">' + SG.icon("verified", 16) +
              "<span>Toda conta passa por verificação de identidade: documento com foto, CPF e selfie.</span></div>" +
          "</div>" +
          '<div class="sg-row sg-xs sg-faint">' + SG.icon("lock", 14) +
          "<span>Conexão protegida · Row Level Security no Supabase</span></div>" +
        "</aside>"
      );
    }
    function stat(v, l) {
      return '<div><div class="sg-display" style="font-size:1.5rem">' + v + "</div>" +
        '<div class="sg-xs sg-dim">' + l + "</div></div>";
    }

    function stepperData() {
      var labels = ["Dados", "Documento", "Selfie", "Revisão"];
      return '<div class="sg-stepper idflow__stepper" style="margin-bottom:18px">' + labels.map(function (l, i) {
        return (i ? '<span class="sg-stepper__line"></span>' : "") +
          '<span class="sg-stepper__step ' + (i === 0 ? "is-active" : "") + '"><span class="sg-stepper__bullet">' +
          (i + 1) + '</span><span class="sg-stepper__label">' + l + "</span></span>";
      }).join("") + "</div>";
    }

    function formHtml() {
      var isSignup = mode === "signup";
      return (
        '<div class="auth__form">' +
          '<div class="sg-only-md" style="margin-bottom:28px">' + SG.brandLogo() + "</div>" +
          '<h2 style="font-size:1.75rem">' + (isSignup ? "Criar sua conta" : "Bem-vindo de volta") + "</h2>" +
          '<p class="sg-muted sg-md" style="margin-top:8px">' +
            (isSignup ? "Seus dados, depois documento com foto e uma selfie." : "Entre para continuar no ServeGo.") + "</p>" +

          '<div class="sg-segment" style="margin:24px 0 20px;width:100%">' +
            '<button class="sg-segment__item ' + (!isSignup ? "is-active" : "") + '" data-mode="signin" style="flex:1">Entrar</button>' +
            '<button class="sg-segment__item ' + (isSignup ? "is-active" : "") + '" data-mode="signup" style="flex:1">Criar conta</button>' +
          "</div>" +

          (isSignup ? stepperData() : "") +

          '<form id="authForm" class="sg-stack" novalidate>' +
            (isSignup ?
              '<div class="sg-grid sg-grid--2" style="gap:10px">' +
                choiceCard("client", "Sou cliente", "Preciso contratar", role === "client") +
                choiceCard("professional", "Sou profissional", "Quero receber serviços", role === "professional") +
              "</div>" +
              field("full_name", "Nome completo", "text", "Como está no documento") +
              '<div class="sg-grid sg-grid--2" style="gap:12px">' +
                field("cpf", "CPF", "text", "000.000.000-00") +
                field("birth_date", "Data de nascimento", "date", "") +
              "</div>" : "") +
            field("email", "E-mail", "email", "voce@email.com") +
            (isSignup ? field("phone", "Celular / WhatsApp", "tel", "(11) 90000-0000") : "") +
            field("password", "Senha", "password", isSignup ? "Mínimo de 6 caracteres" : "Sua senha") +
            '<div id="authError" class="sg-field__error sg-hide"></div>' +
            '<button class="sg-btn sg-btn--primary sg-btn--lg sg-btn--block" type="submit" style="margin-top:8px">' +
              (isSignup ? "Continuar para o documento" + SG.icon("arrowRight", 16) : "Entrar") + "</button>" +
          "</form>" +

          (!isSignup ? '<button class="sg-btn sg-btn--ghost sg-btn--sm sg-btn--block" id="forgot" style="margin-top:12px">Esqueci minha senha</button>' : "") +

          (api.isDemo ?
            '<div style="margin-top:28px;padding-top:22px;border-top:1px solid var(--sg-line)">' +
              '<div class="sg-xs sg-faint" style="text-align:center;margin-bottom:12px">Acesso rápido de demonstração</div>' +
              '<div class="sg-row" style="gap:8px">' +
                '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-demo="client" style="flex:1">Cliente</button>' +
                '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-demo="professional" style="flex:1">Profissional</button>' +
                '<button class="sg-btn sg-btn--secondary sg-btn--sm" data-demo="admin" style="flex:1">Administrador</button>' +
              "</div>" +
              '<div class="sg-xs sg-faint" style="text-align:center;margin-top:12px;line-height:1.6">' +
                "No modo demonstração não há servidor de autenticação: qualquer senha entra.<br>" +
                "O painel administrativo é exclusivo de <b>" + ui.esc(SG.config.owner.email) + "</b>.</div>" +
              "</div>" : "") +

          '<p class="sg-xs sg-faint" style="margin-top:24px;text-align:center">' +
            "Ao continuar você concorda com os Termos de Uso e a Política de Privacidade do ServeGo.</p>" +
        "</div>"
      );
    }

    function field(name, label, type, placeholder) {
      var auto = { password: mode === "signup" ? "new-password" : "current-password", email: "email", tel: "tel" };
      return '<div class="sg-field"><label class="sg-field__label" for="f_' + name + '">' + label + "</label>" +
        '<input class="sg-input" id="f_' + name + '" name="' + name + '" type="' + type + '" ' +
        'value="' + ui.esc(draft[name] || "") + '" ' +
        'placeholder="' + placeholder + '" autocomplete="' + (auto[type] || (name === "full_name" ? "name" : "off")) + '"></div>';
    }

    function choiceCard(value, title, sub, selected) {
      return '<button type="button" class="sg-choice ' + (selected ? "is-selected" : "") + '" data-role="' + value + '">' +
        '<span class="sg-choice__radio"></span><span style="text-align:left">' +
        '<span class="sg-choice__title" style="display:block">' + title + "</span>" +
        '<span class="sg-choice__sub">' + sub + "</span></span></button>";
    }

    function render() {
      var root = ui.$("#root");
      // guarda o que já foi digitado: trocar de aba ou de papel redesenha o formulário
      ui.$$("#authForm input").forEach(function (i) { draft[i.name] = i.value; });
      var identityStage = mode === "signup" && signupStage === "identity";
      root.innerHTML = '<div class="auth">' + aside() +
        '<div class="auth__form-wrap">' +
          (identityStage ? '<div class="auth__form auth__form--wide" id="signupIdentity"></div>' : formHtml()) +
        "</div>" +
        '<div id="themeSlot" style="position:fixed;top:20px;right:20px;z-index:20;display:flex"></div>' +
        "</div>";
      if (identityStage) return mountIdentity();
      bind();
      if (opts.blocked) showError("Sua conta está bloqueada. Fale com o suporte do ServeGo.");
      if (opts.error) showError(opts.error);
    }

    function showError(msg) {
      var el = ui.$("#authError");
      if (!el) return;
      el.textContent = msg;
      el.classList.remove("sg-hide");
    }

    function age(iso) {
      var b = new Date(iso + "T00:00:00");
      if (isNaN(b)) return -1;
      var n = new Date();
      var a = n.getFullYear() - b.getFullYear();
      if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
      return a;
    }

    function validateSignup(d) {
      if (!d.full_name || d.full_name.split(/\s+/).length < 2) return "Informe seu nome completo, como está no documento.";
      if (!SG.cpf.valid(d.cpf)) return "CPF inválido. Confira os números digitados.";
      if (!d.birth_date) return "Informe sua data de nascimento.";
      var a = age(d.birth_date);
      if (a < 18 || a > 120) return "É preciso ter 18 anos ou mais para usar o ServeGo.";
      if (!/^\S+@\S+\.\S+$/.test(d.email)) return "Informe um e-mail válido.";
      if (String(d.phone || "").replace(/\D/g, "").length < 10) return "Informe um celular com DDD.";
      if (!d.password || d.password.length < 6) return "A senha precisa ter ao menos 6 caracteres.";
      return null;
    }

    /* Etapas de documento e selfie. A conta só é criada no envio final. */
    function mountIdentity() {
      if (SG.theme) SG.theme.mount("#themeSlot", "app-iconbtn");
      var host = ui.$("#signupIdentity");
      host.innerHTML = '<div class="sg-only-md" style="margin-bottom:20px">' + SG.brandLogo() + "</div>" +
        '<div id="signupCapture"></div>';
      SG.identity.capture(ui.$("#signupCapture"), {
        leadSteps: ["Dados"],
        submitText: "Criar conta e enviar",
        onBack: function () { signupStage = "data"; render(); },
        onSubmit: function (docs) {
          return api.auth.signUp({
            email: draft.email, password: draft.password, full_name: draft.full_name,
            phone: draft.phone, role: role,
            cpf: SG.cpf.digits(draft.cpf), birth_date: draft.birth_date
          }).then(function (res) {
            var session = res && res.session;
            var userId = session && session.user && session.user.id;
            if (userId) {
              return api.identity.submit(userId, docs).then(function () {
                ui.toast("Conta criada!", { type: "success", text: "Seus documentos foram enviados para análise." });
                location.hash = "#/inicio";
                SG.app.start();
              });
            }
            // Supabase com confirmação de e-mail: ainda não há sessão para subir as fotos.
            return SG.identity.stash(draft.email, docs).then(function () {
              ui.toast("Conta criada!", {
                type: "success",
                text: "Confirme seu e-mail e faça login — enviaremos seus documentos automaticamente."
              });
              var email = draft.email;
              draft = { email: email };
              mode = "signin"; signupStage = "data";
              render();
            });
          });
        }
      });
    }

    function bind() {
      if (SG.theme) SG.theme.mount("#themeSlot", "app-iconbtn");
      ui.$$("[data-mode]").forEach(function (b) {
        b.addEventListener("click", function () { mode = b.getAttribute("data-mode"); signupStage = "data"; render(); });
      });
      ui.$$("[data-role]").forEach(function (b) {
        b.addEventListener("click", function () { role = b.getAttribute("data-role"); render(); });
      });
      SG.cpf.bind(ui.$("#f_cpf"));
      var birth = ui.$("#f_birth_date");
      if (birth) birth.max = new Date().toISOString().slice(0, 10);
      ui.$$("[data-demo]").forEach(function (b) {
        b.addEventListener("click", function () {
          ui.busy(b, true);
          api.auth.demoLogin(b.getAttribute("data-demo"))
            .then(function () { location.hash = "#/inicio"; SG.app.start(); })
            .catch(function (e) { ui.busy(b, false); showError(SG.explainError(e)); });
        });
      });
      var forgot = ui.$("#forgot");
      if (forgot) {
        forgot.addEventListener("click", function () {
          var email = (ui.$("#f_email") || {}).value;
          if (!email) return ui.toast("Informe seu e-mail primeiro", { type: "error" });
          api.auth.resetPassword(email).then(function () {
            ui.toast("Link enviado", { type: "success", text: "Confira sua caixa de entrada." });
          });
        });
      }

      ui.$("#authForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var btn = this.querySelector('button[type="submit"]');
        var data = {};
        ui.$$("input", this).forEach(function (i) { data[i.name] = i.value.trim(); });
        ui.$("#authError").classList.add("sg-hide");

        if (mode === "signup") {
          var st = SG.settings || {};
          if (st.signups_open === false || st.signups_open === "false") {
            return showError("Os cadastros estão temporariamente fechados. Tente novamente mais tarde.");
          }
          var err = validateSignup(data);
          if (err) return showError(err);
          draft = data;
          signupStage = "identity";
          render();
          return;
        }

        if (!data.email || !data.password) return showError("Preencha e-mail e senha.");
        ui.busy(btn, true);
        api.auth.signIn(data.email, data.password).then(function () {
          location.hash = "#/inicio";
          SG.app.start();
        }).catch(function (err) {
          ui.busy(btn, false);
          showError(SG.explainError(err));
        });
      });
    }

    render();
  };
})(window.SG);
