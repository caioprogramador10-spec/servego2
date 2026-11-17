/* ==========================================================================
   ServeGo — Verificação de identidade
   --------------------------------------------------------------------------
   • SG.cpf            máscara e validação de CPF (dígitos verificadores)
   • SG.identity       captura do documento (frente e verso) e da selfie,
                       compressão das imagens e "guarda" local do envio
   • SG.views.identityGate  tela que trava o app até a identidade ser
                       enviada / aprovada (clientes e profissionais)
   ========================================================================== */
(function (SG) {
  var ui = SG.ui, api = SG.api;
  SG.views = SG.views || {};

  /* ==========================================================================
     CPF
     ========================================================================== */
  SG.cpf = {
    digits: function (v) { return String(v || "").replace(/\D/g, "").slice(0, 11); },
    mask: function (v) {
      var d = SG.cpf.digits(v);
      return d
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
    },
    valid: function (v) {
      var d = SG.cpf.digits(v);
      if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
      function dv(len) {
        var s = 0;
        for (var i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
        var r = (s * 10) % 11;
        return r === 10 ? 0 : r;
      }
      return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
    },
    /** 000.000.000-00 (ou o valor como veio, se já estiver mascarado). */
    format: function (v) {
      var d = SG.cpf.digits(v);
      return d.length === 11 ? SG.cpf.mask(d) : (v || "—");
    }
  };

  /** Liga máscara de CPF a um <input>. */
  SG.cpf.bind = function (input) {
    if (!input) return;
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "14");
    input.addEventListener("input", function () {
      input.value = SG.cpf.mask(input.value);
    });
  };

  /* ==========================================================================
     IMAGENS
     ========================================================================== */
  var identity = {};

  /** Redimensiona e converte para JPEG (documentos ficam legíveis e leves). */
  identity.compress = function (source, maxSide, quality) {
    maxSide = maxSide || 1600;
    quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      function draw(img, w, h) {
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("Não foi possível processar a imagem.")); },
          "image/jpeg", quality);
      }
      if (source instanceof HTMLCanvasElement) return draw(source, source.width, source.height);
      if (!/^image\//.test(source.type || "")) {
        return reject(new Error("Envie uma imagem (JPG, PNG ou WEBP)."));
      }
      var url = URL.createObjectURL(source);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        draw(img, img.naturalWidth, img.naturalHeight);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Formato de imagem não suportado. Use JPG ou PNG."));
      };
      img.src = url;
    });
  };

  identity.hasCamera = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  /* ---- Câmera ------------------------------------------------------------- */
  /**
   * Abre a câmera num modal e devolve um Blob JPEG.
   * mode: "selfie" (câmera frontal, guia oval) | "doc" (traseira, guia retangular)
   */
  identity.openCamera = function (mode, title) {
    return new Promise(function (resolve, reject) {
      var selfie = mode === "selfie";
      var stream = null;
      var shot = null;
      var m = ui.modal({
        title: title || (selfie ? "Tire sua selfie" : "Fotografe o documento"),
        size: "lg",
        body:
          '<div class="idcam ' + (selfie ? "idcam--selfie" : "idcam--doc") + '">' +
            '<video class="idcam__video" autoplay playsinline muted></video>' +
            '<canvas class="idcam__shot sg-hide"></canvas>' +
            '<div class="idcam__guide"><span></span></div>' +
            '<div class="idcam__status sg-xs">Iniciando a câmera…</div>' +
          "</div>" +
          '<p class="sg-xs sg-dim" style="margin-top:12px;text-align:center">' +
            (selfie
              ? "Rosto centralizado no oval, boa iluminação, sem óculos escuros, boné ou máscara."
              : "Documento inteiro dentro do quadro, sem reflexos e com todas as letras legíveis.") +
          "</p>",
        footer:
          '<button class="sg-btn sg-btn--ghost" data-close>Cancelar</button>' +
          '<button class="sg-btn sg-btn--secondary sg-hide" data-fallback>' + SG.icon("image", 15) + "Enviar uma foto</button>" +
          '<button class="sg-btn sg-btn--secondary sg-hide" data-retake>' + SG.icon("refresh", 15) + "Tirar outra</button>" +
          '<button class="sg-btn sg-btn--primary" data-shoot disabled>' + SG.icon("camera", 15) + "Capturar</button>" +
          '<button class="sg-btn sg-btn--primary sg-hide" data-use>' + SG.icon("check", 15) + "Usar esta foto</button>",
        onClose: function () {
          stop();
          if (!shot) reject(new Error("cancelled"));
        }
      });

      var el = m.el;
      var video = el.querySelector(".idcam__video");
      var canvas = el.querySelector(".idcam__shot");
      var status = el.querySelector(".idcam__status");
      var bShoot = el.querySelector("[data-shoot]");
      var bRetake = el.querySelector("[data-retake]");
      var bUse = el.querySelector("[data-use]");

      function stop() {
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      }

      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: selfie ? "user" : { ideal: "environment" },
          width: { ideal: 1920 }, height: { ideal: 1080 }
        }
      }).then(function (s) {
        stream = s;
        video.srcObject = s;
        status.classList.add("sg-hide");
        bShoot.disabled = false;
      }).catch(function (err) {
        status.textContent = err && err.name === "NotAllowedError"
          ? "Permissão da câmera negada. Libere o acesso nas configurações do navegador ou envie uma foto."
          : "Não encontramos uma câmera disponível neste dispositivo. Envie uma foto tirada agora pelo celular.";
        status.classList.add("is-error");
        bShoot.classList.add("sg-hide");
        el.querySelector("[data-fallback]").classList.remove("sg-hide");
      });

      // Sem câmera: abre o seletor (no celular, capture abre a câmera nativa).
      el.querySelector("[data-fallback]").addEventListener("click", function () {
        identity.pickFile(selfie ? "user" : "environment").then(function (blob) {
          shot = blob;
          m.close();
          resolve(blob);
        }).catch(function (e) {
          if (e && e.message !== "cancelled") ui.toast(e.message, { type: "error" });
        });
      });

      bShoot.addEventListener("click", function () {
        var w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return;
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (selfie) { ctx.translate(w, 0); ctx.scale(-1, 1); } // mesma orientação do espelho
        ctx.drawImage(video, 0, 0, w, h);
        video.classList.add("sg-hide");
        canvas.classList.remove("sg-hide");
        bShoot.classList.add("sg-hide");
        bRetake.classList.remove("sg-hide");
        bUse.classList.remove("sg-hide");
      });

      bRetake.addEventListener("click", function () {
        video.classList.remove("sg-hide");
        canvas.classList.add("sg-hide");
        bShoot.classList.remove("sg-hide");
        bRetake.classList.add("sg-hide");
        bUse.classList.add("sg-hide");
      });

      bUse.addEventListener("click", function () {
        ui.busy(bUse, true);
        identity.compress(canvas, selfie ? 1280 : 1600, 0.86).then(function (blob) {
          shot = blob;
          m.close();
          resolve(blob);
        }).catch(function (e) { ui.busy(bUse, false); ui.toast(e.message, { type: "error" }); });
      });
    });
  };

  /** Seletor de arquivo (fallback quando não há câmera, ou documento já fotografado). */
  identity.pickFile = function (capture) {
    return new Promise(function (resolve, reject) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      if (capture) input.setAttribute("capture", capture);
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        input.remove();
        if (!f) return reject(new Error("cancelled"));
        if (f.size > 15 * 1024 * 1024) return reject(new Error("Arquivo muito grande (máx. 15 MB)."));
        identity.compress(f).then(resolve, reject);
      });
      input.click();
    });
  };

  /* ---- Guarda local do envio ----------------------------------------------
     Se o Supabase exigir confirmação de e-mail, o cadastro termina SEM sessão
     e não há como subir as fotos ainda (o bucket exige auth.uid()). As fotos
     ficam no IndexedDB deste navegador e são enviadas no primeiro login. */
  var IDB = "servego-identity", STORE = "pending";
  function idb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
      var req = indexedDB.open(IDB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var out = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(out && out.result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  identity.stash = function (email, payload) {
    return tx("readwrite", function (s) { return s.put(payload, String(email).toLowerCase()); })
      .catch(function () { return null; });
  };
  identity.takeStash = function (email) {
    var key = String(email || "").toLowerCase();
    return tx("readonly", function (s) { return s.get(key); }).then(function (v) {
      if (!v) return null;
      return tx("readwrite", function (s) { return s.delete(key); }).then(function () { return v; });
    }).catch(function () { return null; });
  };

  /* ==========================================================================
     COMPONENTE DE CAPTURA (documento → selfie → revisão)
     opts:
       leadSteps  rótulos de etapas anteriores (ex.: ["Dados"]) só para o stepper
       onBack     voltar a partir da 1ª etapa (opcional)
       onSubmit   function(payload) → Promise   payload = { doc_type, front, back, selfie }
       submitText texto do botão final
     ========================================================================== */
  identity.capture = function (host, opts) {
    opts = opts || {};
    var cfg = SG.config.identity;
    var lead = opts.leadSteps || [];
    var steps = ["Documento", "Selfie", "Revisão"];
    var step = 0;
    var state = { doc_type: (opts.initial && opts.initial.doc_type) || cfg.docTypes[0].value, front: null, back: null, selfie: null };
    var previews = {};
    var consent = false;

    function setBlob(key, blob) {
      if (previews[key]) URL.revokeObjectURL(previews[key]);
      state[key] = blob;
      previews[key] = blob ? URL.createObjectURL(blob) : null;
    }

    function stepper() {
      var all = lead.concat(steps);
      var current = lead.length + step;
      return '<div class="sg-stepper idflow__stepper">' + all.map(function (label, i) {
        var cls = i < current ? "is-done" : i === current ? "is-active" : "";
        return (i ? '<span class="sg-stepper__line ' + (i <= current ? "is-done" : "") + '"></span>' : "") +
          '<span class="sg-stepper__step ' + cls + '"><span class="sg-stepper__bullet">' +
          (i < current ? SG.icon("check", 12) : i + 1) + '</span><span class="sg-stepper__label">' +
          ui.esc(label) + "</span></span>";
      }).join("") + "</div>";
    }

    function slot(key, title, hint, portrait) {
      var has = !!state[key];
      return '<div class="idslot' + (portrait ? " idslot--portrait" : "") + (has ? " is-filled" : "") + '" data-slot="' + key + '">' +
        '<div class="idslot__media">' +
          (has
            ? '<img src="' + previews[key] + '" alt="' + ui.esc(title) + '">' +
              '<span class="idslot__ok">' + SG.icon("check", 14) + "</span>"
            : '<span class="idslot__ph">' + SG.icon(portrait ? "user" : "doc", 30) + "</span>") +
        "</div>" +
        '<div class="idslot__body">' +
          '<div class="sg-md sg-strong">' + ui.esc(title) + "</div>" +
          '<div class="sg-xs sg-dim">' + ui.esc(hint) + "</div>" +
          '<div class="sg-row sg-row--wrap" style="gap:6px;margin-top:10px">' +
            (identity.hasCamera()
              ? '<button type="button" class="sg-btn sg-btn--' + (has ? "secondary" : "primary") + ' sg-btn--sm" data-cam="' + key + '">' +
                SG.icon("camera", 14) + (has ? "Refazer" : portrait ? "Abrir câmera" : "Fotografar") + "</button>"
              : "") +
            (portrait
              ? (!identity.hasCamera()
                  ? '<button type="button" class="sg-btn sg-btn--primary sg-btn--sm" data-file="' + key + '" data-capture="user">' +
                    SG.icon("camera", 14) + "Tirar selfie</button>"
                  : "")
              : '<button type="button" class="sg-btn sg-btn--ghost sg-btn--sm" data-file="' + key + '" data-capture="environment">' +
                SG.icon("image", 14) + "Enviar arquivo</button>") +
          "</div>" +
        "</div>" +
      "</div>";
    }

    function docStep() {
      return '<div class="idflow__head"><h2>Documento com foto</h2>' +
          '<p class="sg-muted sg-md">Fotografe a <b>frente</b> e o <b>verso</b> do seu documento oficial. ' +
          "Precisamos disso para manter o ServeGo seguro para todos.</p></div>" +
        '<div class="sg-field__label" style="margin-bottom:8px">Tipo de documento</div>' +
        '<div class="sg-seg-wrap" style="margin-bottom:18px"><div class="sg-seg">' +
          cfg.docTypes.map(function (d) {
            return '<button type="button" class="sg-chip ' + (state.doc_type === d.value ? "is-active" : "") + '" data-doctype="' +
              d.value + '">' + ui.esc(d.label) + "</button>";
          }).join("") +
        "</div></div>" +
        '<div class="idslots">' +
          slot("front", "Frente do documento", "Lado com a sua foto") +
          slot("back", "Verso do documento", "Lado com os dados e a assinatura") +
        "</div>" +
        tips(["Tire o documento do plástico", "Evite reflexo de luz", "Enquadre o documento inteiro"]);
    }

    function selfieStep() {
      return '<div class="idflow__head"><h2>Agora, uma selfie</h2>' +
          '<p class="sg-muted sg-md">Vamos comparar seu rosto com a foto do documento. A selfie precisa ser tirada agora, pela câmera.</p></div>' +
        '<div class="idslots idslots--single">' +
          slot("selfie", "Sua selfie", "Rosto inteiro, olhando para a câmera", true) +
        "</div>" +
        tips(["Local bem iluminado", "Sem óculos escuros, boné ou máscara", "Somente você na foto"]);
    }

    function reviewStep() {
      var label = (cfg.docTypes.filter(function (d) { return d.value === state.doc_type; })[0] || {}).label || state.doc_type;
      return '<div class="idflow__head"><h2>Confira antes de enviar</h2>' +
          '<p class="sg-muted sg-md">As imagens precisam estar nítidas. Se algo estiver cortado ou borrado, refaça.</p></div>' +
        '<div class="idreview">' +
          reviewItem("front", label + " · frente", 0) +
          reviewItem("back", label + " · verso", 0) +
          reviewItem("selfie", "Selfie", 1) +
        "</div>" +
        '<label class="idconsent">' +
          '<input type="checkbox" id="idConsent" ' + (consent ? "checked" : "") + ">" +
          "<span>Autorizo o ServeGo a usar estas imagens e meu CPF exclusivamente para verificar minha identidade, " +
          "conforme a Lei Geral de Proteção de Dados (LGPD). Os arquivos ficam em armazenamento privado.</span>" +
        "</label>";
    }

    function reviewItem(key, label, goto) {
      return '<figure class="idreview__item' + (key === "selfie" ? " idreview__item--portrait" : "") + '">' +
        '<img src="' + previews[key] + '" alt="' + ui.esc(label) + '">' +
        '<figcaption><span class="sg-xs sg-strong">' + ui.esc(label) + "</span>" +
        '<button type="button" class="sg-btn sg-btn--ghost sg-btn--sm" data-goto="' + goto + '">Refazer</button></figcaption>' +
        "</figure>";
    }

    function tips(list) {
      return '<ul class="idtips">' + list.map(function (t) {
        return "<li>" + SG.icon("check", 13) + "<span>" + ui.esc(t) + "</span></li>";
      }).join("") + "</ul>";
    }

    function canAdvance() {
      if (step === 0) return state.front && state.back;
      if (step === 1) return !!state.selfie;
      return consent;
    }

    function render() {
      var body = step === 0 ? docStep() : step === 1 ? selfieStep() : reviewStep();
      var showBack = step > 0 || !!opts.onBack;
      host.innerHTML =
        '<div class="idflow">' + stepper() + body +
          '<div id="idError" class="sg-field__error sg-hide" style="margin-top:12px"></div>' +
          '<div class="idflow__actions">' +
            (showBack ? '<button type="button" class="sg-btn sg-btn--ghost" data-back>' + SG.icon("arrowLeft", 15) + "Voltar</button>" : "<span></span>") +
            '<button type="button" class="sg-btn sg-btn--primary sg-btn--lg" data-next ' + (canAdvance() ? "" : "disabled") + ">" +
              (step < 2 ? "Continuar" + SG.icon("arrowRight", 15) : ui.esc(opts.submitText || "Enviar para análise")) +
            "</button>" +
          "</div>" +
        "</div>";
      bind();
    }

    function error(msg) {
      var e = host.querySelector("#idError");
      if (!e) return ui.toast(msg, { type: "error" });
      e.textContent = msg;
      e.classList.remove("sg-hide");
    }

    function capture(key, fromFile, captureAttr) {
      var mode = key === "selfie" ? "selfie" : "doc";
      var title = key === "front" ? "Frente do documento" : key === "back" ? "Verso do documento" : "Sua selfie";
      var p = fromFile ? identity.pickFile(captureAttr) : identity.openCamera(mode, title);
      p.then(function (blob) {
        setBlob(key, blob);
        render();
      }).catch(function (e) {
        if (e && e.message !== "cancelled") error(e.message);
      });
    }

    function bind() {
      ui.$$("[data-doctype]", host).forEach(function (b) {
        b.addEventListener("click", function () { state.doc_type = b.getAttribute("data-doctype"); render(); });
      });
      ui.$$("[data-cam]", host).forEach(function (b) {
        b.addEventListener("click", function () { capture(b.getAttribute("data-cam"), false); });
      });
      ui.$$("[data-file]", host).forEach(function (b) {
        b.addEventListener("click", function () {
          capture(b.getAttribute("data-file"), true, b.getAttribute("data-capture"));
        });
      });
      ui.$$("[data-goto]", host).forEach(function (b) {
        b.addEventListener("click", function () { step = Number(b.getAttribute("data-goto")); render(); });
      });
      var c = host.querySelector("#idConsent");
      if (c) c.addEventListener("change", function () {
        consent = c.checked;
        host.querySelector("[data-next]").disabled = !canAdvance();
      });
      var back = host.querySelector("[data-back]");
      if (back) back.addEventListener("click", function () {
        if (step === 0) return opts.onBack && opts.onBack();
        step -= 1; render();
      });
      host.querySelector("[data-next]").addEventListener("click", function () {
        var btn = this;
        if (!canAdvance()) return;
        if (step < 2) { step += 1; render(); host.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
        ui.busy(btn, true);
        Promise.resolve(opts.onSubmit({
          doc_type: state.doc_type, front: state.front, back: state.back, selfie: state.selfie
        })).catch(function (e) {
          ui.busy(btn, false);
          error(SG.explainError(e));
        });
      });
    }

    render();
    return {
      destroy: function () { Object.keys(previews).forEach(function (k) { setBlob(k, null); }); }
    };
  };

  /* ==========================================================================
     TELA DE BLOQUEIO (antes de liberar o app)
     ========================================================================== */
  function gateShell(inner) {
    ui.$("#root").innerHTML =
      '<div class="idgate">' +
        '<header class="idgate__top">' + SG.brandLogo() +
          '<div class="sg-row" style="gap:8px"><div id="themeSlot" style="display:flex"></div>' +
          '<button class="sg-btn sg-btn--ghost sg-btn--sm" id="gateLogout">' + SG.icon("logout", 15) + "Sair</button></div>" +
        "</header>" +
        '<main class="idgate__main"><div class="idgate__card" id="gateBody">' + inner + "</div></main>" +
      "</div>";
    if (SG.theme) SG.theme.mount("#themeSlot", "app-iconbtn");
    ui.$("#gateLogout").addEventListener("click", function () {
      api.auth.signOut().then(function () { location.reload(); });
    });
  }

  function statusScreen(icon, tone, title, text, actions) {
    return '<div class="idstatus">' +
      '<div class="idstatus__icon idstatus__icon--' + tone + '">' + SG.icon(icon, 30) + "</div>" +
      "<h2>" + title + "</h2>" +
      '<p class="sg-muted sg-md">' + text + "</p>" +
      (actions || "") +
      "</div>";
  }

  /**
   * me: perfil logado. Resolve quando o usuário pode entrar no app.
   * Só chame quando identity_status !== "approved".
   */
  SG.views.identityGate = function (me) {
    var cfg = SG.config.identity;

    function showCapture(rejected) {
      gateShell(
        (rejected
          ? '<div class="idnotice idnotice--danger">' + SG.icon("alert", 18) +
            '<div><div class="sg-md sg-strong">Sua verificação anterior foi recusada</div>' +
            '<div class="sg-sm">' + ui.esc(rejected.rejection_reason || "Envie novas fotos.") + "</div></div></div>"
          : '<div class="idnotice">' + SG.icon("shield", 18) +
            '<div><div class="sg-md sg-strong">Olá, ' + ui.esc((me.full_name || "").split(" ")[0] || "tudo bem") + "!</div>" +
            '<div class="sg-sm">Para concluir seu cadastro, envie seu documento e uma selfie.</div></div></div>') +
        '<div id="gateCapture"></div>'
      );
      identity.capture(ui.$("#gateCapture"), {
        initial: rejected,
        onSubmit: function (payload) {
          return api.identity.submit(me.id, payload).then(function () {
            me.identity_status = "pending";
            ui.toast("Documentos enviados", { type: "success", text: "Vamos analisar em até 24 horas." });
            route();
          });
        }
      });
    }

    function showPending(v) {
      gateShell(statusScreen("clock", "brand", "Estamos verificando sua identidade",
        "Recebemos seu documento e sua selfie" + (v ? " em " + ui.dateTime(v.created_at) : "") +
        ". A análise costuma levar até 24 horas — avisaremos assim que for concluída.",
        '<div class="sg-row" style="gap:8px;justify-content:center;margin-top:24px">' +
          '<button class="sg-btn sg-btn--primary" id="gateRefresh">' + SG.icon("refresh", 15) + "Atualizar status</button></div>" +
        (api.isDemo
          ? '<p class="sg-xs sg-faint" style="margin-top:20px">Modo demonstração: entre como administrador ' +
            "(Sair → atalho <b>Administrador</b> na tela de login) e aprove em <b>Verificações</b>.</p>"
          : "")));
      ui.$("#gateRefresh").addEventListener("click", function () {
        ui.busy(this, true);
        location.reload();
      });
    }

    function route() {
      gateShell('<div style="display:grid;place-items:center;min-height:240px"><div class="sg-spinner sg-spinner--lg"></div></div>');
      api.identity.mine(me.id).then(function (v) {
        var st = me.identity_status || "not_submitted";
        if (st === "pending") {
          if (!cfg.requireApproval) return SG.app.enter(me);
          return showPending(v);
        }
        if (st === "rejected") return showCapture(v || {});
        // not_submitted: fotos guardadas no cadastro (sem sessão naquele momento)?
        return identity.takeStash(me.email).then(function (stash) {
          if (!stash) return showCapture(null);
          return api.identity.submit(me.id, stash).then(function () {
            me.identity_status = "pending";
            ui.toast("Documentos enviados", { type: "success", text: "Recebemos as fotos do seu cadastro." });
            route();
          }).catch(function () { showCapture(null); });
        });
      }).catch(function (e) {
        gateShell(statusScreen("alert", "danger", "Não foi possível carregar", SG.explainError(e)));
      });
    }

    route();
  };

  SG.identity = identity;
})(window.SG);
