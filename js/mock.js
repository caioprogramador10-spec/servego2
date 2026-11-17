/* ==========================================================================
   ServeGo — Base de demonstração (modo demo)
   --------------------------------------------------------------------------
   Enquanto o Supabase não estiver configurado em js/config.js, esta base em
   memória alimenta o app inteiro com dados realistas, mantendo EXATAMENTE o
   mesmo formato das tabelas do Postgres. Assim a camada de API (js/api.js)
   troca de fonte sem que nenhuma tela precise mudar.
   ========================================================================== */
(function (SG) {
  var uid = (function () {
    var n = 0;
    return function (p) { n++; return (p || "id") + "-" + n + "-" + Math.random().toString(36).slice(2, 8); };
  })();

  var now = Date.now();
  var hours = function (h) { return new Date(now - h * 3600e3).toISOString(); };
  var days = function (d) { return new Date(now - d * 86400e3).toISOString(); };

  /* ---- Imagem placeholder (sem depender de rede) -------------------------- */
  function photo(seed, label) {
    var palette = [["#1b1f24", "#2b323a"], ["#20252b", "#39424c"], ["#181c20", "#2f3740"], ["#22262c", "#434c56"]];
    var p = palette[seed % palette.length];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + p[0] + '"/><stop offset="1" stop-color="' + p[1] + '"/></linearGradient></defs>' +
      '<rect width="480" height="360" fill="url(#g)"/>' +
      '<g stroke="rgba(255,255,255,.05)" stroke-width="1">' +
      '<path d="M0 90h480M0 180h480M0 270h480M120 0v360M240 0v360M360 0v360"/></g>' +
      '<circle cx="' + (120 + (seed % 3) * 90) + '" cy="150" r="54" fill="rgba(255,195,26,.10)"/>' +
      '<text x="50%" y="52%" text-anchor="middle" font-family="Inter,Arial" font-size="46">' + (label || "🛠") + "</text>" +
      '<text x="50%" y="72%" text-anchor="middle" fill="rgba(255,255,255,.34)" font-family="Inter,Arial" ' +
      'font-size="15" letter-spacing="3">SERVEGO</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---- Categorias --------------------------------------------------------- */
  var categories = [
    ["eletricista", "Eletricista", "eletricista", 90, 350, "Instalações, quadros, tomadas e curtos"],
    ["encanador", "Encanador", "encanador", 100, 420, "Vazamentos, desentupimento e hidráulica"],
    ["mecanico", "Mecânico", "mecanico", 120, 800, "Revisão, socorro e manutenção veicular"],
    ["pintor", "Pintor", "pintor", 150, 1200, "Pintura residencial e comercial"],
    ["pedreiro", "Pedreiro", "pedreiro", 180, 1500, "Alvenaria, reformas e acabamentos"],
    ["ar-condicionado", "Ar-condicionado", "ar-condicionado", 140, 600, "Instalação, limpeza e recarga de gás"],
    ["montador", "Montador de móveis", "montador", 80, 400, "Montagem e desmontagem de móveis"],
    ["jardinagem", "Jardinagem", "jardinagem", 90, 500, "Poda, corte de grama e paisagismo"],
    ["informatica", "Informática", "informatica", 80, 450, "Formatação, redes e manutenção"],
    ["limpeza", "Limpeza", "limpeza", 120, 350, "Faxina comum e pós-obra"],
    ["marceneiro", "Marceneiro", "marceneiro", 200, 2000, "Móveis sob medida e reparos"],
    ["serralheiro", "Serralheiro", "serralheiro", 180, 1600, "Portões, grades e estruturas"],
    ["chaveiro", "Chaveiro", "chaveiro", 70, 300, "Abertura, troca e cópia de chaves"],
    ["instalacoes", "Instalação / TV", "instalacoes", 80, 350, "Suportes, antenas e eletrônicos"]
  ].map(function (c, i) {
    return {
      id: "cat-" + c[0], slug: c[0], name: c[1], icon: c[2],
      price_from: c[3], price_to: c[4], description: c[5],
      sort_order: i + 1, active: true, created_at: days(120)
    };
  });

  function catId(slug) { return "cat-" + slug; }

  /* ---- Usuários ----------------------------------------------------------- */
  var demoClient = {
    id: "user-client", full_name: "Leane Oliveira", email: "cliente@servego.com.br",
    phone: "(11) 98888-1010", avatar_url: null, city: "São Paulo", state: "SP",
    role: "client", status: "active", created_at: days(210)
  };
  /* Administrador = conta proprietária definida em js/config.js.
     Não existe nenhum outro perfil com role 'admin' nesta base. */
  var demoAdmin = {
    id: "user-admin",
    full_name: (SG.config.owner && SG.config.owner.name) || "Administrador",
    email: (SG.config.owner && SG.config.owner.email) || "admin@servego.com.br",
    phone: null, avatar_url: null, city: "São Paulo", state: "SP",
    role: "admin", admin_role: "owner", status: "active", created_at: days(400)
  };
  // equipe de exemplo (tela Equipe e permissões)
  var demoTeam = [
    { id: "user-admin-2", full_name: "Marina Couto", email: "marina@servego.com.br", phone: null, avatar_url: null,
      city: "São Paulo", state: "SP", role: "admin", admin_role: "moderation", status: "active", created_at: days(120), last_seen_at: days(0.2) },
    { id: "user-admin-3", full_name: "Rafael Lima", email: "rafael@servego.com.br", phone: null, avatar_url: null,
      city: "Campinas", state: "SP", role: "admin", admin_role: "finance", status: "active", created_at: days(60), last_seen_at: days(2) }
  ];

  var proSeed = [
    ["Carlos Mendes", "eletricista", 4.9, 247, 12, 120, 2.4, "Eletricista industrial e residencial", true, "Vila Mariana"],
    ["Rafael Souza", "eletricista", 4.7, 132, 7, 105, 4.1, "Instalações e automação residencial", true, "Ipiranga"],
    ["Marina Lopes", "eletricista", 5.0, 88, 5, 145, 1.2, "Quadros de distribuição e laudos", true, "Moema"],
    ["Diego Ramos", "encanador", 4.8, 311, 15, 130, 3.3, "Hidráulica e caça-vazamento", true, "Santana"],
    ["Paulo Vieira", "encanador", 4.6, 96, 6, 110, 5.8, "Desentupimento 24h", false, "Tatuapé"],
    ["Anderson Melo", "mecanico", 4.9, 402, 18, 190, 6.2, "Mecânica geral e socorro móvel", true, "Lapa"],
    ["Juliana Costa", "pintor", 4.9, 174, 9, 220, 2.9, "Pintura fina e texturas", true, "Pinheiros"],
    ["Marcos Antunes", "pedreiro", 4.7, 205, 20, 260, 7.4, "Reformas completas", true, "Guarulhos"],
    ["Thiago Nunes", "ar-condicionado", 4.8, 268, 11, 160, 3.7, "Split, multi-split e PMOC", true, "Barra Funda"],
    ["Bruno Farias", "montador", 4.8, 521, 8, 90, 1.8, "Montagem de móveis planejados", true, "Vila Prudente"],
    ["Camila Reis", "limpeza", 4.9, 389, 6, 150, 2.2, "Faxina residencial e pós-obra", true, "Saúde"],
    ["Eduardo Pinto", "informatica", 4.7, 143, 10, 120, 4.6, "Redes, servidores e suporte", true, "Bela Vista"],
    ["Sandra Kimura", "jardinagem", 5.0, 77, 13, 130, 5.1, "Paisagismo e manutenção de jardins", true, "Morumbi"],
    ["Roberto Alencar", "marceneiro", 4.8, 61, 22, 380, 8.9, "Móveis sob medida", true, "Osasco"],
    ["Felipe Cardoso", "chaveiro", 4.6, 214, 9, 95, 1.5, "Abertura e troca de segredo", false, "Consolação"]
  ];

  var profiles = [demoClient, demoAdmin].concat(demoTeam);
  var professionals = [];
  var professionalCategories = [];

  proSeed.forEach(function (p, i) {
    var id = "pro-" + (i + 1);
    profiles.push({
      id: id, full_name: p[0], email: p[0].toLowerCase().replace(/\s+/g, ".") + "@servego.com.br",
      phone: "(11) 9" + (7000 + i) + "-" + (1000 + i * 7), avatar_url: null,
      city: "São Paulo", state: "SP", role: "professional", status: "active", created_at: days(180 - i * 4)
    });
    professionals.push({
      id: id, headline: p[7],
      bio: "Profissional com " + p[4] + " anos de experiência, atendimento pontual e garantia de 90 dias em todos os serviços executados. Trabalho com materiais de primeira linha e envio de relatório fotográfico ao final do atendimento.",
      experience_years: p[4], base_price: p[5], hourly_rate: Math.round(p[5] * 0.6),
      service_radius_km: 15 + (i % 3) * 5, lat: -23.55 + (i % 7) * 0.012, lng: -46.63 + (i % 5) * 0.014,
      city: "São Paulo", state: "SP", is_available: p[8], verified: p[8],
      verification_status: i === 4 || i === 14 ? "pending" : "approved",
      rating: p[2], reviews_count: Math.round(p[3] * 0.42), jobs_count: p[3],
      response_time_min: 8 + (i % 5) * 3, completion_rate: 94 + (i % 6),
      neighborhood: p[9], distance_km: p[6], created_at: days(180 - i * 4)
    });
    professionalCategories.push({ professional_id: id, category_id: catId(p[1]), price_from: p[5] });
    // um segundo nicho para alguns profissionais
    if (i % 4 === 0) professionalCategories.push({ professional_id: id, category_id: catId("instalacoes"), price_from: p[5] + 20 });
  });

  /* ---- Solicitações, ofertas, contratos ----------------------------------- */
  var serviceRequests = [
    {
      id: "req-1", client_id: demoClient.id, category_id: catId("ar-condicionado"),
      title: "Instalação de ar-condicionado split 12.000 BTUs",
      description: "Comprei um split 12.000 BTUs e preciso instalar na sala. A parede é de alvenaria e já existe ponto de energia a cerca de 2 metros. Preciso de suporte e tubulação.",
      address: "Rua Vergueiro, 1200 — Vila Mariana, São Paulo/SP",
      lat: -23.578, lng: -46.634, urgency: "tomorrow", scheduled_for: null,
      status: "awaiting_payment", professional_id: "pro-9", price: 160, payment_due_at: hours(-0.2),
      created_at: hours(0.1), updated_at: hours(0.05)
    },
    {
      id: "req-2", client_id: demoClient.id, category_id: catId("eletricista"),
      title: "Tomadas da cozinha sem energia",
      description: "As tomadas da cozinha pararam de funcionar depois de uma queda de energia. O disjuntor não está desarmado.",
      address: "Rua Vergueiro, 1200 — Vila Mariana, São Paulo/SP",
      lat: -23.578, lng: -46.634, urgency: "now", scheduled_for: null,
      professional_id: "pro-1", price: 180, status: "in_progress", created_at: days(1), updated_at: hours(2)
    },
    {
      id: "req-3", client_id: demoClient.id, category_id: catId("montador"),
      title: "Montagem de guarda-roupa 6 portas",
      description: "Guarda-roupa novo, ainda na caixa. Preciso de montagem e fixação na parede.",
      address: "Rua Vergueiro, 1200 — Vila Mariana, São Paulo/SP",
      lat: -23.578, lng: -46.634, urgency: "scheduled", scheduled_for: days(-3),
      professional_id: "pro-10", price: 200, status: "completed", created_at: days(14), updated_at: days(12)
    },
    {
      id: "req-4", client_id: "user-other-1", category_id: catId("eletricista"),
      title: "Troca de chuveiro elétrico + disjuntor",
      description: "Chuveiro queimou e o disjuntor desarma. Preciso trocar os dois.",
      address: "Av. Paulista, 900 — Bela Vista, São Paulo/SP",
      lat: -23.564, lng: -46.652, urgency: "today", scheduled_for: null,
      budget_hint: 250, status: "open", created_at: hours(1), updated_at: hours(1)
    },
    {
      id: "req-5", client_id: "user-other-2", category_id: catId("eletricista"),
      title: "Instalação de 6 luminárias de embutir",
      description: "Apartamento novo, forro de gesso já com recortes prontos.",
      address: "Rua Domingos de Morais, 300 — Vila Mariana, São Paulo/SP",
      lat: -23.588, lng: -46.638, urgency: "tomorrow", scheduled_for: null,
      budget_hint: 400, status: "open", created_at: hours(5), updated_at: hours(5)
    },
    {
      id: "req-6", client_id: "user-other-1", category_id: catId("encanador"),
      title: "Vazamento embaixo da pia da cozinha",
      description: "Está pingando água no armário embaixo da pia. Acho que é o sifão ou a conexão da torneira.",
      address: "Av. Paulista, 900 — Bela Vista, São Paulo/SP",
      lat: -23.564, lng: -46.652, urgency: "today", scheduled_for: null,
      professional_id: "pro-4", price: 130, status: "in_progress", created_at: days(1.2), updated_at: hours(20)
    }
  ];

  profiles.push(
    { id: "user-other-1", full_name: "Fernanda Alves", email: "fernanda@exemplo.com", phone: "(11) 97777-2020", city: "São Paulo", state: "SP", role: "client", status: "active", created_at: days(60) },
    { id: "user-other-2", full_name: "Ricardo Tavares", email: "ricardo@exemplo.com", phone: "(11) 97777-3030", city: "São Paulo", state: "SP", role: "client", status: "active", created_at: days(35) },
    { id: "user-other-3", full_name: "Patrícia Gomes", email: "patricia@exemplo.com", phone: "(11) 97777-4040", city: "São Paulo", state: "SP", role: "client", status: "blocked", created_at: days(22) }
  );

  var servicePhotos = [
    { id: uid("ph"), request_id: "req-1", uploaded_by: demoClient.id, storage_path: "demo/1.svg", url: photo(1, "❄️"), created_at: hours(3) },
    { id: uid("ph"), request_id: "req-1", uploaded_by: demoClient.id, storage_path: "demo/2.svg", url: photo(2, "🧰"), created_at: hours(3) },
    { id: uid("ph"), request_id: "req-2", uploaded_by: demoClient.id, storage_path: "demo/3.svg", url: photo(3, "⚡"), created_at: days(1) }
  ];

  /* Chamadas do despacho: o profissional mais próximo é chamado primeiro. */
  var dispatchOffers = [
    { id: "dsp-1", request_id: "req-1", professional_id: "pro-9", rank: 1, distance_km: 3.7, eta_minutes: 19, price: 160, status: "accepted", expires_at: hours(0.08), responded_at: hours(0.09), created_at: hours(0.1) },
    { id: "dsp-2", request_id: "req-2", professional_id: "pro-1", rank: 1, distance_km: 2.4, eta_minutes: 15, price: 180, status: "accepted", expires_at: days(1), responded_at: days(1), created_at: days(1) },
    { id: "dsp-3", request_id: "req-3", professional_id: "pro-10", rank: 1, distance_km: 1.8, eta_minutes: 13, price: 200, status: "accepted", expires_at: days(14), responded_at: days(14), created_at: days(14) }
  ];

  /* Pagamentos: sempre dentro da plataforma, antes do atendimento. */
  var payments = [
    { id: "pay-3", request_id: "req-6", booking_id: "bk-3", client_id: "user-other-1", professional_id: "pro-4", amount: 130, platform_fee: 13, method: "pix", provider: "demo", provider_ref: "demo-3", status: "paid", expires_at: days(1.2), paid_at: days(1.2), created_at: days(1.2), updated_at: days(1.2) },
    { id: "pay-1", request_id: "req-2", booking_id: "bk-1", client_id: demoClient.id, professional_id: "pro-1", amount: 180, platform_fee: 18, method: "pix", provider: "demo", provider_ref: "demo-1", status: "paid", expires_at: days(1), paid_at: days(1), created_at: days(1), updated_at: days(1) },
    { id: "pay-2", request_id: "req-3", booking_id: "bk-2", client_id: demoClient.id, professional_id: "pro-10", amount: 200, platform_fee: 20, method: "card", provider: "demo", provider_ref: "demo-2", status: "paid", expires_at: days(14), paid_at: days(14), created_at: days(14), updated_at: days(14) }
  ];

  var bookings = [
    {
      id: "bk-3", request_id: "req-6", offer_id: null, payment_id: "pay-3", client_id: "user-other-1", professional_id: "pro-4",
      price: 130, status: "disputed", accepted_at: days(1.2), started_at: days(1.1), arrived_at: days(1.08),
      pro_completed_at: hours(22), confirm_deadline: hours(-2),
      completed_at: null, cancelled_at: null, cancel_reason: null, created_at: days(1.2), updated_at: hours(20)
    },
    {
      id: "bk-1", request_id: "req-2", offer_id: null, payment_id: "pay-1", client_id: demoClient.id, professional_id: "pro-1",
      price: 180, status: "awaiting_confirmation", accepted_at: days(1), started_at: hours(2), arrived_at: hours(2.4),
      pro_completed_at: hours(0.3), confirm_deadline: hours(-23.7),
      completed_at: null, cancelled_at: null, cancel_reason: null, created_at: days(1), updated_at: hours(2)
    },
    {
      id: "bk-2", request_id: "req-3", offer_id: null, payment_id: "pay-2", client_id: demoClient.id, professional_id: "pro-10",
      price: 200, status: "completed", accepted_at: days(14), started_at: days(12.4), arrived_at: days(12.5),
      completed_at: days(12), cancelled_at: null, cancel_reason: null, created_at: days(14), updated_at: days(12)
    }
  ];

  var bookingEvents = [
    { id: uid("ev"), booking_id: "bk-1", status: "accepted", note: null, created_at: days(1) },
    { id: uid("ev"), booking_id: "bk-1", status: "on_the_way", note: null, created_at: hours(3) },
    { id: uid("ev"), booking_id: "bk-1", status: "arrived", note: null, created_at: hours(2.4) },
    { id: uid("ev"), booking_id: "bk-1", status: "in_progress", note: null, created_at: hours(2) },
    { id: uid("ev"), booking_id: "bk-1", status: "awaiting_confirmation", note: null, created_at: hours(0.3) },
    { id: uid("ev"), booking_id: "bk-2", status: "accepted", note: null, created_at: days(14) },
    { id: uid("ev"), booking_id: "bk-2", status: "in_progress", note: null, created_at: days(12.4) },
    { id: uid("ev"), booking_id: "bk-2", status: "completed", note: null, created_at: days(12) }
  ];

  var messages = [
    { id: uid("msg"), request_id: "req-2", booking_id: "bk-1", sender_id: "pro-1", recipient_id: demoClient.id, content: "Boa tarde, Leane! Recebi sua solicitação. Já estou a caminho, chego em cerca de 15 minutos.", image_url: null, read_at: hours(3), created_at: hours(3.2) },
    { id: uid("msg"), request_id: "req-2", booking_id: "bk-1", sender_id: demoClient.id, recipient_id: "pro-1", content: "Perfeito, Carlos. Vou deixar o portão aberto.", image_url: null, read_at: hours(3), created_at: hours(3.1) },
    { id: uid("msg"), request_id: "req-2", booking_id: "bk-1", sender_id: "pro-1", recipient_id: demoClient.id, content: "Cheguei. Já identifiquei o problema: é o disjuntor do circuito da cozinha. Vou trocar agora.", image_url: null, read_at: null, created_at: hours(2.3) },
    { id: uid("msg"), request_id: "req-1", booking_id: null, sender_id: "pro-9", recipient_id: demoClient.id, content: "Olá! Aceitei sua chamada. Assim que o pagamento for confirmado no app, já sigo para aí.", image_url: null, read_at: null, created_at: hours(2.3) }
  ];

  bookingEvents.push(
    { id: uid("ev"), booking_id: "bk-3", status: "accepted", note: "Pagamento confirmado", created_at: days(1.2) },
    { id: uid("ev"), booking_id: "bk-3", status: "on_the_way", note: null, created_at: days(1.15) },
    { id: uid("ev"), booking_id: "bk-3", status: "arrived", note: null, created_at: days(1.08) },
    { id: uid("ev"), booking_id: "bk-3", status: "in_progress", note: null, created_at: days(1.07) },
    { id: uid("ev"), booking_id: "bk-3", status: "awaiting_confirmation", note: null, created_at: hours(22) },
    { id: uid("ev"), booking_id: "bk-3", status: "disputed", note: "O problema voltou", created_at: hours(20) }
  );

  messages.push(
    { id: uid("msg"), request_id: "req-6", booking_id: "bk-3", sender_id: "pro-4", recipient_id: "user-other-1", content: "Serviço feito: troquei o sifão e a vedação. A torneira está bem desgastada, recomendo trocar.", image_url: null, read_at: hours(22), created_at: hours(22.2) },
    { id: uid("msg"), request_id: "req-6", booking_id: "bk-3", sender_id: "user-other-1", recipient_id: "pro-4", content: "Voltou a pingar. Pode voltar aqui para ver?", image_url: null, read_at: hours(19), created_at: hours(20.5) },
    { id: uid("msg"), request_id: "req-6", booking_id: "bk-3", sender_id: "pro-4", recipient_id: "user-other-1", content: "O vazamento agora é da torneira, que não fez parte do serviço. Posso trocar em um novo pedido.", image_url: null, read_at: null, created_at: hours(19.5) }
  );

  var reviews = [
    { id: uid("rv"), booking_id: "bk-2", request_id: "req-3", client_id: demoClient.id, professional_id: "pro-10", rating: 5, comment: "Montagem impecável e muito rápida. Deixou tudo limpo no final.", tags: ["Pontual", "Caprichoso"], reply: "Obrigado, Leane! Volte sempre.", replied_at: days(11), created_at: days(12) },
    { id: uid("rv"), booking_id: "bk-x1", request_id: "req-x1", client_id: "user-other-1", professional_id: "pro-1", rating: 5, comment: "Resolveu um problema que dois eletricistas não conseguiram. Explicou tudo com paciência.", tags: ["Explicativo", "Resolutivo"], reply: null, replied_at: null, created_at: days(6) },
    { id: uid("rv"), booking_id: "bk-x2", request_id: "req-x2", client_id: "user-other-2", professional_id: "pro-1", rating: 5, comment: "Chegou antes do horário e cobrou exatamente o que foi orçado.", tags: ["Pontual", "Preço justo"], reply: null, replied_at: null, created_at: days(19) },
    { id: uid("rv"), booking_id: "bk-x3", request_id: "req-x3", client_id: "user-other-1", professional_id: "pro-1", rating: 4, comment: "Serviço bom, só demorou um pouco para conseguir a peça.", tags: ["Educado"], reply: null, replied_at: null, created_at: days(34) },
    { id: uid("rv"), booking_id: "bk-x4", request_id: "req-x4", client_id: "user-other-2", professional_id: "pro-9", rating: 5, comment: "Instalação do split perfeita, sem sujeira e sem barulho.", tags: ["Limpo", "Pontual"], reply: null, replied_at: null, created_at: days(9) }
  ];

  var notifications = [
    { id: uid("nt"), user_id: demoClient.id, type: "dispatch", title: "Profissional encontrado!", body: "Pague R$ 160,00 no app para confirmar a instalação do ar-condicionado.", link: "#/solicitacao/req-1", read_at: null, created_at: hours(0.09) },
    { id: uid("nt"), user_id: demoClient.id, type: "message", title: "Nova mensagem de Carlos Mendes", body: "Cheguei. Já identifiquei o problema…", link: "#/mensagens/req-2", read_at: null, created_at: hours(2.3) },
    { id: uid("nt"), user_id: demoClient.id, type: "status", title: "Profissional chegou ao local", body: "Tomadas da cozinha sem energia", link: "#/acompanhar/bk-1", read_at: hours(2), created_at: hours(2.4) },
    { id: uid("nt"), user_id: "pro-1", type: "request", title: "Você atendeu 3 chamadas esta semana", body: "Fique online para continuar recebendo chamadas por perto.", link: "#/chamadas", read_at: null, created_at: hours(1) },
    { id: uid("nt"), user_id: "pro-1", type: "review", title: "Você recebeu uma avaliação 5 estrelas", body: "“Resolveu um problema que dois eletricistas não conseguiram.”", link: "#/avaliacoes", read_at: null, created_at: days(6) }
  ];

  var favorites = [{ client_id: demoClient.id, professional_id: "pro-1", created_at: days(10) }];

  var transactions = [];
  (function seedTransactions() {
    var pros = ["pro-1", "pro-1", "pro-1", "pro-9", "pro-10", "pro-1", "pro-1"];
    var vals = [180, 240, 150, 320, 200, 420, 190];
    pros.forEach(function (p, i) {
      var amount = vals[i];
      var fee = Math.round(amount * 0.1 * 100) / 100;
      transactions.push({
        id: uid("tx"), booking_id: "bk-seed-" + i, professional_id: p, client_id: demoClient.id,
        amount: amount, platform_fee: fee, net_amount: amount - fee,
        status: i < 5 ? "released" : "pending", created_at: days(i * 1.1)
      });
    });

    // histórico de 200 dias para os gráficos do painel (pseudoaleatório, sempre igual)
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var hpros = ["pro-1", "pro-2", "pro-3", "pro-4", "pro-6", "pro-7", "pro-9", "pro-10", "pro-11", "pro-12"];
    var hclients = [demoClient.id, "user-other-1", "user-other-2"];
    for (var d = 200; d >= 1; d--) {
      var growth = 1 + (200 - d) / 160;                     // a plataforma cresce ao longo do período
      var weekend = new Date(now - d * 864e5).getDay() % 6 === 0 ? 0.7 : 1;
      var count = Math.round((1.4 + rnd() * 2.6) * growth * weekend);
      for (var k = 0; k < count; k++) {
        var amount = Math.round((90 + rnd() * rnd() * 620) / 10) * 10;
        var fee = Math.round(amount * 0.1 * 100) / 100;
        transactions.push({
          id: uid("tx"), booking_id: "bk-hist-" + d + "-" + k,
          professional_id: hpros[Math.floor(rnd() * hpros.length)],
          client_id: hclients[Math.floor(rnd() * hclients.length)],
          amount: amount, platform_fee: fee, net_amount: amount - fee,
          status: rnd() < 0.03 ? "refunded" : "released", created_at: days(d - rnd() * 0.9)
        });
      }
    }
  })();

  var professionalDocuments = [
    { id: uid("doc"), professional_id: "pro-5", doc_type: "Documento com foto", storage_path: "demo/doc1", status: "pending", created_at: days(2) },
    { id: uid("doc"), professional_id: "pro-5", doc_type: "Comprovante de residência", storage_path: "demo/doc2", status: "pending", created_at: days(2) },
    { id: uid("doc"), professional_id: "pro-15", doc_type: "Certificado NR-10", storage_path: "demo/doc3", status: "pending", created_at: days(1) }
  ];

  /* ---- Disputa de exemplo, com provas dos dois lados -------------------- */
  function evidence(label, emoji, tone) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">' +
      '<rect width="640" height="480" fill="' + (tone || "#2b3138") + '"/>' +
      '<rect x="60" y="250" width="520" height="190" rx="10" fill="rgba(255,255,255,.08)"/>' +
      '<circle cx="320" cy="200" r="90" fill="rgba(80,160,255,.18)"/>' +
      '<text x="320" y="230" text-anchor="middle" font-size="96">' + emoji + "</text>" +
      '<text x="320" y="360" text-anchor="middle" fill="#fff" font-family="Inter,Arial" font-size="24" font-weight="700">' + label + "</text>" +
      '<text x="320" y="400" text-anchor="middle" fill="rgba(255,255,255,.45)" font-family="Inter,Arial" font-size="14">FOTO DE PROVA · DEMO</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  var disputes = [
    { id: "dis-1", booking_id: "bk-3", client_id: "user-other-1", professional_id: "pro-4", amount: 130,
      reason: "O problema voltou", status: "open", info_requested_from: null, info_request: null,
      admin_notes: "", decision_reason: null, decided_by: null, decided_at: null,
      created_at: hours(20), updated_at: hours(9) }
  ];
  var disputeEntries = [
    { id: "de-1", dispute_id: "dis-1", author_id: "user-other-1", party: "client",
      note: "Duas horas depois que o encanador foi embora o armário estava molhado de novo. A conexão da torneira continua pingando e o sifão ficou torto.",
      attachments: [
        { kind: "image", mime: "image/svg+xml", url: evidence("Armário molhado", "💧", "#23303d"), path: "demo/1" },
        { kind: "image", mime: "image/svg+xml", url: evidence("Conexão pingando", "🚰", "#2a3140"), path: "demo/2" },
        { kind: "image", mime: "image/svg+xml", url: evidence("Sifão torto", "🔧", "#30343a"), path: "demo/3" }
      ], created_at: hours(20) },
    { id: "de-2", dispute_id: "dis-1", author_id: "pro-4", party: "professional",
      note: "Troquei o sifão e a vedação e testei por 10 minutos sem vazamento, como mostra a foto. A torneira é antiga e o cliente não quis trocar — avisei que poderia pingar na base.",
      attachments: [
        { kind: "image", mime: "image/svg+xml", url: evidence("Teste sem vazamento", "✅", "#1f3a2c"), path: "demo/4" }
      ], created_at: hours(9) }
  ];

  var reports = [
    { id: uid("rp"), reporter_id: "user-other-1", target_user_id: "pro-5", booking_id: null, reason: "Não compareceu", description: "Marcou o atendimento e não apareceu, sem aviso.", status: "open", created_at: days(3) },
    { id: uid("rp"), reporter_id: demoClient.id, target_user_id: "user-other-3", booking_id: null, reason: "Comportamento inadequado", description: "Mensagens fora do contexto do serviço.", status: "resolved", created_at: days(20) }
  ];

  var portfolio = {};
  professionals.forEach(function (p, i) {
    portfolio[p.id] = [photo(i, "🛠"), photo(i + 1, "🔧"), photo(i + 2, "✅"), photo(i + 3, "🏠")];
  });

  /* ---- Verificação de identidade (documento frente/verso + selfie) -------- */
  function idDoc(side, name, seed) {
    var bg = side === "front" ? ["#1d3b2f", "#2f5d49"] : ["#23303d", "#3a4c5e"];
    var body = side === "front"
      ? '<rect x="34" y="78" width="120" height="150" rx="10" fill="rgba(255,255,255,.14)"/>' +
        '<circle cx="94" cy="135" r="30" fill="rgba(255,255,255,.28)"/>' +
        '<path d="M50 222c8-34 80-34 88 0" fill="rgba(255,255,255,.28)"/>' +
        '<text x="180" y="105" fill="rgba(255,255,255,.55)" font-family="Inter,Arial" font-size="13">NOME</text>' +
        '<text x="180" y="128" fill="#fff" font-family="Inter,Arial" font-size="19" font-weight="700">' + name + "</text>" +
        '<text x="180" y="165" fill="rgba(255,255,255,.55)" font-family="Inter,Arial" font-size="13">REGISTRO GERAL</text>' +
        '<text x="180" y="188" fill="#fff" font-family="Inter,Arial" font-size="17">' + (12 + seed) + ".345.678-" + (seed % 9) + "</text>"
      : '<text x="34" y="100" fill="rgba(255,255,255,.55)" font-family="Inter,Arial" font-size="13">FILIAÇÃO · NATURALIDADE · DATA DE NASCIMENTO</text>' +
        '<rect x="34" y="116" width="330" height="10" rx="5" fill="rgba(255,255,255,.22)"/>' +
        '<rect x="34" y="138" width="260" height="10" rx="5" fill="rgba(255,255,255,.22)"/>' +
        '<rect x="34" y="160" width="300" height="10" rx="5" fill="rgba(255,255,255,.22)"/>' +
        '<rect x="34" y="196" width="412" height="44" rx="6" fill="rgba(0,0,0,.25)"/>' +
        '<text x="44" y="224" fill="rgba(255,255,255,.6)" font-family="monospace" font-size="15">IDBRA' + (100000 + seed * 7) + "&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>";
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bg[0] + '"/>' +
      '<stop offset="1" stop-color="' + bg[1] + '"/></linearGradient></defs>' +
      '<rect width="480" height="300" rx="18" fill="url(#g)"/>' +
      '<text x="34" y="52" fill="#fff" font-family="Inter,Arial" font-size="16" font-weight="700" letter-spacing="2">' +
      "REPÚBLICA FEDERATIVA DO BRASIL</text>" + body +
      '<text x="446" y="282" text-anchor="end" fill="rgba(255,255,255,.35)" font-family="Inter,Arial" font-size="11">DEMO · ' +
      (side === "front" ? "FRENTE" : "VERSO") + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function idSelfie(seed) {
    var tones = ["#c99a74", "#8d5f3e", "#e2b896", "#6f4a31"];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">' +
      '<rect width="360" height="480" fill="#2a3138"/>' +
      '<circle cx="180" cy="190" r="86" fill="' + tones[seed % tones.length] + '"/>' +
      '<path d="M60 480c10-110 230-110 240 0" fill="#3d5a80"/>' +
      '<rect x="120" y="330" width="120" height="76" rx="8" fill="#2f5d49" stroke="#fff" stroke-opacity=".5"/>' +
      '<text x="180" y="462" text-anchor="middle" fill="rgba(255,255,255,.4)" font-family="Inter,Arial" font-size="12">SELFIE · DEMO</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /** CPF fictício porém válido (dígitos verificadores corretos). */
  function demoCpf(seed) {
    var d = String(100000000 + seed * 7919 + 31337).slice(-9).split("").map(Number);
    function dv(len) {
      var s = 0;
      for (var i = 0; i < len; i++) s += d[i] * (len + 1 - i);
      var r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    }
    d.push(dv(9));
    d.push(dv(10));
    return d.join("");
  }

  // todo perfil semeado já passou pela verificação, exceto os casos de exemplo abaixo
  profiles.forEach(function (p, i) {
    p.identity_status = "approved";
    p.cpf = demoCpf(i + 1);
    p.birth_date = (1970 + (i * 7) % 30) + "-0" + (1 + i % 9) + "-1" + (i % 9);
  });

  profiles.push(
    { id: "user-new-1", full_name: "Lucas Barbosa", email: "lucas.barbosa@exemplo.com", phone: "(11) 96666-1111", city: "São Paulo", state: "SP", role: "client", status: "active", identity_status: "pending", cpf: "52998224725", birth_date: "1996-03-14", created_at: hours(5) },
    { id: "user-new-2", full_name: "Aline Moraes", email: "aline.moraes@exemplo.com", phone: "(11) 96666-2222", city: "Santo André", state: "SP", role: "client", status: "active", identity_status: "rejected", cpf: "15350946056", birth_date: "1988-11-02", created_at: days(2) }
  );

  function setIdentity(id, status) {
    var p = profiles.filter(function (x) { return x.id === id; })[0];
    if (p) p.identity_status = status;
  }
  // último acesso: contas demo ativas agora; as demais com tempos variados de inatividade
  var inactiveDays = [0, 0, 2, 9, 34, 0.5, 61, 4, 97, 15, 1, 45, 130, 6, 72, 3, 210, 38, 12, 88, 26, 1.5];
  profiles.forEach(function (p, i) {
    var d = inactiveDays[i % inactiveDays.length];
    p.last_seen_at = days(d);
    if (new Date(p.created_at) > new Date(p.last_seen_at)) p.last_seen_at = p.created_at;
    if (d > 60 && i % 3 === 0) p.last_reminded_at = days(d - 20);
  });

  setIdentity("pro-5", "pending");
  setIdentity("pro-15", "pending");

  var identityVerifications = [
    { id: "idv-1", user_id: "pro-5", doc_type: "rg", front_url: idDoc("front", "Paulo Vieira", 5), back_url: idDoc("back", "Paulo Vieira", 5), selfie_url: idSelfie(1), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null, created_at: days(2) },
    { id: "idv-2", user_id: "pro-15", doc_type: "cnh", front_url: idDoc("front", "Felipe Cardoso", 15), back_url: idDoc("back", "Felipe Cardoso", 15), selfie_url: idSelfie(2), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null, created_at: days(1) },
    { id: "idv-3", user_id: "user-new-1", doc_type: "rg", front_url: idDoc("front", "Lucas Barbosa", 3), back_url: idDoc("back", "Lucas Barbosa", 3), selfie_url: idSelfie(0), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null, created_at: hours(5) },
    { id: "idv-4", user_id: "user-new-2", doc_type: "cnh", front_url: idDoc("front", "Aline Moraes", 8), back_url: idDoc("back", "Aline Moraes", 8), selfie_url: idSelfie(3), status: "rejected", rejection_reason: "Foto do documento ilegível ou cortada.", reviewed_by: demoAdmin.id, reviewed_at: days(1), created_at: days(2) },
    { id: "idv-5", user_id: "pro-1", doc_type: "cnh", front_url: idDoc("front", "Carlos Mendes", 1), back_url: idDoc("back", "Carlos Mendes", 1), selfie_url: idSelfie(0), status: "approved", rejection_reason: null, reviewed_by: demoAdmin.id, reviewed_at: days(170), created_at: days(178) }
  ];

  var auditLog = [
    { id: "au-1", admin_id: demoAdmin.id, action: "identity.rejected", target_type: "profile", target_id: "user-new-2", details: { motivo: "Foto do documento ilegível ou cortada." }, created_at: days(1) },
    { id: "au-2", admin_id: demoAdmin.id, action: "user.blocked", target_type: "profile", target_id: "user-other-3", details: null, created_at: days(19) },
    { id: "au-3", admin_id: demoAdmin.id, action: "report.resolved", target_type: "report", target_id: null, details: { motivo: "Comportamento inadequado" }, created_at: days(19) }
  ];

  SG.mock = {
    photo: photo,
    uid: uid,
    data: {
      profiles: profiles,
      professionals: professionals,
      categories: categories,
      professional_categories: professionalCategories,
      service_requests: serviceRequests,
      service_photos: servicePhotos,
      dispatch_offers: dispatchOffers,
      payments: payments,
      bookings: bookings,
      booking_events: bookingEvents,
      messages: messages,
      reviews: reviews,
      notifications: notifications,
      favorites: favorites,
      transactions: transactions,
      professional_documents: professionalDocuments,
      reports: reports,
      portfolio: portfolio,
      identity_verifications: identityVerifications,
      audit_log: auditLog,
      disputes: disputes,
      dispute_entries: disputeEntries,
      app_settings: [
        { key: "platform_fee_percent", value: SG.config.app.platformFeePercent },
        { key: "dispatch_radius_km", value: 30 }, { key: "min_order_value", value: 50 },
        { key: "signups_open", value: true }, { key: "require_identity", value: true },
        { key: "maintenance_mode", value: false },
        { key: "maintenance_message", value: "Estamos fazendo uma melhoria rápida. Voltamos em instantes." },
        { key: "support_email", value: "suporte@servego.com.br" }, { key: "support_whatsapp", value: "" },
        { key: "terms_text", value: "" }, { key: "privacy_text", value: "" }
      ],
      admin_notes: [
        { id: "note-1", target_type: "profile", target_id: "user-other-1", author_id: "user-admin-2",
          body: "Cliente ligou pedindo atualização da disputa do vazamento. Combinado retorno em 24 h.", created_at: days(0.6) }
      ],
      platform_fee_history: [
        { id: "fee-1", old_percent: null, new_percent: SG.config.app.platformFeePercent, changed_by: demoAdmin.id, created_at: days(400) }
      ]
    },
    accounts: {
      client: { email: demoClient.email, id: demoClient.id },
      professional: { email: "carlos.mendes@servego.com.br", id: "pro-1" },
      admin: { email: demoAdmin.email, id: demoAdmin.id }
    }
  };
})(window.SG);
