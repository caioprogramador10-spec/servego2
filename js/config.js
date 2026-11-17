/* ==========================================================================
   ServeGo — Configuração
   --------------------------------------------------------------------------
   1) Crie um projeto em https://supabase.com
   2) Rode, na ordem, os arquivos de /sql no SQL Editor
   3) Cole abaixo a URL e a ANON KEY (Project Settings → API)

   IMPORTANTE: aqui só entra a chave "anon/public". A service_role NUNCA
   deve aparecer no front-end — operações privilegiadas ficam em Edge
   Functions ou em RPCs SECURITY DEFINER protegidas por is_admin().
   ========================================================================== */

window.SG = window.SG || {};

window.SG.config = {
  supabaseUrl: "", // ex.: "https://xxxxxxxxxxxx.supabase.co"
  supabaseAnonKey: "", // ex.: "eyJhbGciOiJIUzI1NiIsInR5cCI6..."

  /* Conta proprietária: a ÚNICA que pode ter papel de administrador.
     A regra é aplicada no banco por sql/05_admin.sql — o front apenas reflete isso.
     Para trocar o dono, altere o e-mail aqui E no arquivo 05_admin.sql. */
  owner: {
    email: "caio.programador10@gmail.com",
    name: "Caio"
  },

  app: {
    name: "ServeGo",
    tagline: "O profissional que você precisa, quando precisa.",
    supportEmail: "suporte@servego.com.br",
    platformFeePercent: 10,
    defaultRadiusKm: 25,
    currency: "BRL",
    locale: "pt-BR"
  },

  // Buckets do Supabase Storage (criados por sql/03_storage.sql)
  buckets: {
    avatars: "avatars",
    servicePhotos: "service-photos",
    chatImages: "chat-images",
    documents: "professional-documents",
    identity: "identity-documents" // RG/CNH frente e verso + selfie (PRIVADO)
  },

  /* Verificação de identidade obrigatória no cadastro (clientes e profissionais).
     O usuário envia documento com foto (frente e verso), CPF e uma selfie.
     requireApproval: true → o app só libera o uso depois que o admin aprovar. */
  identity: {
    required: true,
    requireApproval: true,
    docTypes: [
      { value: "rg", label: "RG" },
      { value: "cnh", label: "CNH" },
      { value: "rne", label: "RNE / CRNM" }
    ],
    rejectionReasons: [
      "Foto do documento ilegível ou cortada.",
      "A selfie não corresponde à foto do documento.",
      "Documento vencido ou inválido.",
      "Os dados do documento não conferem com o CPF informado.",
      "Frente e verso de documentos diferentes."
    ]
  },

  // Preparado para integração real de mapas (Mapbox / Google / MapLibre).
  // Sem chave, a aplicação usa o mapa mockado elegante de components.css.
  maps: {
    provider: "mock", // "mock" | "mapbox" | "google"
    apiKey: "",
    defaultCenter: { lat: -23.5505, lng: -46.6333 }, // São Paulo
    defaultZoom: 13
  },

  /* Pagamento SEMPRE dentro da plataforma, antes do atendimento (modelo Uber).
     provider: "mercadopago" usa as Edge Functions em supabase/functions
     (create-payment, payment-webhook, refund-payment). No modo demo o
     pagamento é simulado. As chaves do gateway ficam só nos secrets do Supabase. */
  payments: {
    provider: "mercadopago",
    methods: ["pix", "card"],
    dispatchTimeoutSeconds: 45,   // tempo que o profissional tem para aceitar a chamada
    paymentTimeoutMinutes: 15,    // tempo que o cliente tem para pagar
    urgencySurchargePercent: 20,  // adicional quando o cliente pede "Agora"
    completionAutoConfirmHours: 24 // sem resposta do cliente após o profissional concluir → confirma sozinho
  },

  features: {
    realtimeChat: true,
    notifications: true,
    favorites: true,
    reports: true,
    emergencyMode: true
  }
};

/* Modo demo: sem credenciais, o app roda com uma base em memória (js/mock.js),
   permitindo navegar 100% do fluxo antes de conectar o Supabase. */
window.SG.isDemo = function () {
  var c = window.SG.config;
  return !c.supabaseUrl || !c.supabaseAnonKey;
};
