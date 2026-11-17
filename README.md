# ServeGo

**O profissional que você precisa, quando precisa.**

Marketplace de serviços que conecta **clientes ↔ profissionais** (eletricistas, encanadores,
mecânicos, pintores, pedreiros, técnicos de ar-condicionado, montadores, jardineiros, técnicos de
informática, faxineiros, marceneiros, serralheiros, chaveiros e instaladores).

Aplicação web em **HTML5 + CSS3 + JavaScript moderno (sem build)** com **Supabase** como backend
(Auth, PostgreSQL, Storage, Realtime e Row Level Security).

---

## 1. Como rodar

### Modo demonstração (imediato, sem configurar nada)

O projeto funciona 100% sem backend: uma base em memória (`js/mock.js`) alimenta todas as telas com
dados realistas — inclusive orçamentos chegando ao vivo, chat respondendo e o serviço avançando de
status sozinho.

```bash
# qualquer servidor estático serve
npx serve .
# ou
python3 -m http.server 8000
```

Abra `http://localhost:8000/index.html` (landing) e clique em **Encontrar um profissional**.
Na tela de login use os atalhos **Cliente · Profissional**. Para abrir o painel administrativo em
modo demo, entre com o e-mail proprietário (`caio.programador10@gmail.com`) — nenhuma outra conta
vê esse painel.

> Também é possível abrir o `index.html` direto pelo navegador (`file://`), mas um servidor local
> é recomendado.

### Modo conectado ao Supabase

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, rode os arquivos de `/sql` **nesta ordem**:

   | Arquivo | O que faz |
   |---|---|
   | `01_schema.sql` | enums, 16 tabelas, índices, triggers, funções e RPCs |
   | `02_rls.sql` | Row Level Security em todas as tabelas (~60 policies) |
   | `03_storage.sql` | buckets de avatares, fotos de serviço, imagens de chat e documentos |
   | `04_seed.sql` | as 14 categorias iniciais |
   | `05_admin.sql` | trava o papel de administrador na conta proprietária |
   | `06_identity.sql` | verificação de identidade (CPF, documento frente/verso, selfie), auditoria, comunicados |
   | `07_settings.sql` | configurações editáveis pelo admin (taxa da plataforma) + histórico |
   | `08_dispatch_payments.sql` | modelo Uber: chamada ao profissional mais próximo, pagamento antes, estorno, chat sem contato externo |
   | `09_completion_confirmation.sql` | conclusão em duas etapas: profissional conclui, cliente confirma (ou abre disputa) |
   | `10_engagement.sql` | último acesso de cada conta e lembretes para quem está inativo |
   | `11_disputes.sql` | disputas com provas (fotos/vídeos), versão do profissional, pedido de informações e decisão do admin |
   | `12_admin_control.sql` | controle total do admin: equipe com papéis, suspensão, anonimização (LGPD), avaliações ocultas, notas internas, destaque de profissional, controles do app (manutenção, cadastros, raio de busca…), relançar e cancelar pedidos |
   | `13_staff_accounts.sql` | contas da equipe criadas pelo painel (Admin → Equipe de suporte): convite por e-mail ou senha temporária |

3. Em **Project Settings → API**, copie a **URL** e a **anon/public key**.
4. Cole em `js/config.js`:

```js
window.SG.config = {
  supabaseUrl: "https://xxxxxxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  ...
};
```

5. Crie a **conta de administrador** (uma só, veja a seção 3.1) e depois os demais usuários pelo
   próprio app, na tela **Criar conta**.

Assim que as credenciais existirem, o modo demo é desligado automaticamente e todas as telas passam
a ler e gravar no Postgres.

> **Nunca** coloque a `service_role key` no front-end. O app usa apenas a chave `anon`; as operações
> privilegiadas ficam em RPCs `SECURITY DEFINER` protegidas por `is_admin()` (ou em Edge Functions).

---

### Celular e app instalável (PWA)

- `manifest.webmanifest` + ícones `assets/icon-192.png`, `icon-512.png` e `icon-maskable-512.png`: no Android aparece
  "Instalar app"; no iPhone, *Compartilhar → Adicionar à Tela de Início*. Abre em tela cheia, com atalhos
  "Pedir um serviço" e "Mensagens".
- `sw.js`: rede primeiro (o app sempre carrega a versão nova); sem internet usa a última cópia e, se não
  houver, mostra `offline.html`. Supabase e pagamentos nunca passam pelo cache. Ao publicar mudanças
  grandes, aumente `VERSION` no `sw.js`.
- Precisa de **HTTPS** em produção (Vercel, Netlify e afins já dão). A câmera da verificação de identidade também.
- Campos com 16 px (o iPhone não dá zoom ao tocar), áreas de toque de 44 px e respeito ao entalhe/barra do iPhone.

## 2. Estrutura de arquivos

```
servego/
├── index.html                 landing page
├── app.html                   SPA (cliente, profissional e admin)
├── assets/
│   ├── logo-mark.svg       marca oficial em vetor (usada em toda a interface)
│   ├── logo-servego.png    lockup completo com o wordmark
│   └── favicon.png
├── css/
│   ├── tokens.css             design tokens (cores, tipografia, espaços, sombras)
│   ├── base.css               reset, tipografia, utilitários de layout
│   ├── components.css         botões, cards, campos, chat, timeline, modais, toasts…
│   ├── landing.css            landing page
│   └── app.css                shell do app (sidebar, header, bottom nav, telas)
├── js/
│   ├── config.js              credenciais e parâmetros do produto
│   ├── icons.js               sistema único de ícones SVG + marca
│   ├── theme.js               tema claro/escuro (preferência + botão)
│   ├── ui.js                  helpers de DOM, formatação, toasts, modais, skeletons
│   ├── supabaseClient.js      criação do client + tradução de erros
│   ├── mock.js                base de demonstração (mesmo formato das tabelas)
│   ├── api.js                 camada de dados (Supabase ⇄ demo)
│   ├── router.js              roteador por hash
│   ├── app.js                 shell, sessão, navegação, notificações
│   └── views/
│       ├── identity.js             CPF, câmera, documento + selfie, tela de bloqueio
│       ├── auth.js                 entrar / criar conta (com verificação de identidade)
│       ├── client.js               início, categorias, atividade, matching, acompanhamento
│       ├── request-flow.js         solicitação em 6 etapas
│       ├── professional-profile.js perfil público do profissional
│       ├── chat.js                 mensagens em tempo real
│       ├── pro.js                  painel, oportunidades, orçamentos, ganhos, avaliações
│       ├── admin.js                painel administrativo
│       └── profile.js              perfil e configurações
└── sql/
    ├── 01_schema.sql
    ├── 02_rls.sql
    ├── 03_storage.sql
    ├── 04_seed.sql
    ├── 05_admin.sql
    ├── 06_identity.sql
    └── 07_settings.sql
```

**Regra de arquitetura:** nenhuma tela conversa com o Supabase diretamente. Tudo passa por
`js/api.js`, que tem duas implementações para cada função (Supabase e demo). Trocar de fonte de
dados não exige mudar nenhuma view.

---

## 3. Banco de dados

16 tabelas com UUID, timestamps, enums e índices:

`profiles` · `professionals` · `categories` · `professional_categories` · `service_requests` ·
`service_photos` · `service_offers` · `bookings` · `booking_events` · `messages` · `reviews` ·
`notifications` · `favorites` · `professional_documents` · `transactions` · `reports`

Automatizações no próprio banco:

- `handle_new_user()` — cria o `profile` (e o `professional`) no cadastro
- `refresh_professional_rating()` — recalcula nota e nº de avaliações
- `on_booking_completed()` — carimba a conclusão, incrementa serviços e gera a transação com a taxa
- `log_booking_event()` — alimenta a timeline de acompanhamento
- gatilhos de notificação para oferta recebida, oferta aceita, nova mensagem, avaliação e conclusão

RPCs:

- `search_professionals(categoria, lat, lng, raio, limite)` — busca por proximidade (Haversine),
  ordenada por nota e distância, já devolvendo preço e tempo estimado de chegada
- `admin_metrics()` — indicadores do marketplace (restrito a admin)
- `professional_earnings(id)` — ganhos do dia/semana/mês, a receber e série dos últimos 7 dias

### 3.1 Administrador único

O papel `admin` está travado no banco por `sql/05_admin.sql`: apenas o e-mail devolvido por
`public.servego_owner_email()` — hoje **caio.programador10@gmail.com** — pode ser administrador.

- o e-mail proprietário é promovido a `admin` automaticamente ao criar a conta;
- qualquer outra conta que tente virar admin (pelo formulário, pela API com a chave anon ou por
  `update` direto no próprio perfil) recebe erro `42501`;
- o script também rebaixa qualquer admin antigo que já exista e nunca cria ficha de profissional
  para o dono;
- o front-end reflete a mesma regra: o cadastro público só oferece cliente/profissional e o painel
  administrativo só é montado para essa conta (`config.owner.email` em `js/config.js`).

**Como criar a conta:** no painel do Supabase, *Authentication → Users → Add user → Create new
user*, com o e-mail acima, a senha escolhida e a opção *Auto Confirm User* marcada. A senha fica
somente no Supabase Auth (em hash) — **nenhum arquivo do projeto guarda senha em texto**.

Para trocar o dono no futuro: altere o e-mail em `servego_owner_email()` (dentro de
`sql/05_admin.sql`), rode o arquivo novamente e atualize `owner.email` em `js/config.js`.

**Equipe (a partir do `12_admin_control.sql`).** O dono pode dar acesso ao painel para outras
pessoas em *Admin → Equipe*, cada uma com um papel:

| Papel | Vê no painel |
|---|---|
| Dono | tudo, inclusive equipe, taxa e anonimização |
| Financeiro | métricas, financeiro, pedidos, usuários, relatórios e auditoria |
| Moderação | identidades, usuários, profissionais, avaliações, disputas, denúncias, conversas e inativos |
| Suporte | usuários, pedidos, conversas, disputas, comunicados e inativos |
| Operação | pedidos, chamadas, profissionais, categorias e conversas |

No banco, `enforce_admin_role()` passa a aceitar admins adicionados por um dono, e
`guard_admin_roles()` impede que qualquer outra pessoa altere papéis (e que o último dono seja
rebaixado). O menu e as rotas escondem o que não é do papel. **Atenção:** rodar o `05_admin.sql` de
novo depois do `12` volta a regra de admin único e rebaixa a equipe. Se fizer isso, rode o `12` em
seguida.

### 3.2 Verificação de identidade obrigatória

Todo **cliente e profissional** passa por verificação no cadastro:

1. **Dados** — nome completo, **CPF** (máscara + validação dos dígitos verificadores), data de
   nascimento (18+), e-mail, celular e senha;
2. **Documento** — RG, CNH ou RNE, **frente e verso**, pela câmera ou por arquivo;
3. **Selfie** — tirada na hora pela câmera frontal, com guia oval;
4. **Revisão** — confere as três fotos e aceita o termo de uso dos dados (LGPD).

As imagens são redimensionadas no navegador (JPEG, até 1600 px) e vão para o bucket **privado**
`identity-documents/<uid>/`. O CPF fica em `profile_private` (só o dono e o admin leem) — nunca em
`profiles`, que é parcialmente pública. CPF repetido é barrado por `unique`.

Até o admin aprovar, o usuário vê a tela "Estamos verificando sua identidade" e não usa o app
(`config.identity.requireApproval`). Se recusado, vê o motivo e reenvia. No banco, políticas
**restritivas** impedem criar solicitação ou orçamento sem identidade aprovada, e um gatilho
impede o próprio usuário de mudar `identity_status`.

> Se o Supabase exigir confirmação de e-mail, o cadastro termina sem sessão; as fotos ficam
> guardadas no IndexedDB do navegador e são enviadas automaticamente no primeiro login.

### 3.3 Painel administrativo

| Tela | O que faz |
|---|---|
| Métricas | 12 indicadores clicáveis, gráfico de 14 dias e painel "precisa da sua atenção" |
| **Verificações** | fila de identidades; selfie × documento lado a lado, zoom/girar, CPF validado, idade, checklist obrigatório para aprovar, motivo obrigatório para recusar, "próxima da fila" |
| Usuários | busca por nome/e-mail/CPF, filtros por papel e identidade, **ficha completa** (dados, estatísticas, documentos, histórico), bloqueio, CSV |
| Profissionais | busca, status de identidade, aprovação só com identidade verificada, documentos complementares com visualização e aprovação individual, CSV |
| Solicitações | busca, filtro por categoria/status, detalhes com fotos, CSV |
| **Financeiro** | volume, comissão liberada/a receber, ticket médio, gráfico diário, liberar repasse / estornar, CSV |
| Avaliações | média, distribuição, filtros (notas baixas, sem resposta) |
| Denúncias | resolver, descartar ou **resolver e bloquear**; ficha do denunciado |
| Categorias | CRUD (agora lista também as inativas, para poder reativar) |
| **Configurações** | taxa da plataforma (0% a 50%) com controle deslizante, atalhos, simulador "cliente paga / ServeGo fica / profissional recebe" e histórico de alterações |
| **Comunicados** | notificação em massa para todos, clientes ou profissionais, com pré-visualização |
| **Auditoria** | registro imutável de toda decisão do painel, com filtros e CSV |

Badges no menu mostram identidades e denúncias pendentes.

**Controle total (`js/views/admin-control.js` + `js/api-admin.js` + `sql/12_admin_control.sql`)**

| Tela | O que faz |
|---|---|
| **Ficha 360° do usuário** (`#/admin/usuarios/:id`) | tudo da conta em abas: resumo, pedidos, pagamentos e repasses, conversas, avaliações, denúncias e disputas, notas internas e histórico. Ações: notificar, editar dados, bloquear, **suspender por X dias**, trocar papel, **exportar dados (LGPD)** e **anonimizar**. Para profissionais: editar vitrine, preço, raio, especialidades, online e **destaque** |
| **Central do pedido** (`#/admin/solicitacoes/:id`) | linha do tempo completa (chamadas, pagamento, atendimento, avaliação, disputa), chamadas enviadas com tempo de resposta, conversa, dinheiro, notas. Ações: **relançar chamada**, **cancelar com estorno**, **alterar a situação do serviço** (destravar casos parados) e notificar as partes |
| **Chamadas** | todas as chamadas enviadas, taxa de aceite, tempo médio de resposta, pedidos parados com botão de relançar e ranking dos profissionais |
| **Conversas** | lê qualquer chat (somente leitura) e mostra onde houve tentativa de contato fora do app |
| **Equipe** | adiciona pessoas por e-mail com um papel, troca papéis e mostra a matriz de permissões |
| **Controles do app** | modo manutenção (com mensagem), cadastros abertos/fechados, exigir identidade, raio de busca, tempo de chamada, prazo de pagamento, adicional de urgência, confirmação automática, valor mínimo, contatos de suporte, termos e privacidade |
| **Relatórios** | CSV de 13 tabelas (usuários, pedidos, pagamentos, repasses, mensagens, auditoria…) por período e backup completo em JSON |
| **Busca global** | `Ctrl + K` (ou o botão no topo) encontra pessoa por nome, e-mail, celular ou CPF, pedido, pagamento e disputa |
| Avaliações | agora dá para **ocultar** (sai do app e da média) e remover a resposta do profissional |

Toda ação entra na **Auditoria**.

**Equipe de suporte — criar contas para quem trabalha no app** (só o dono)

Em *Admin → Equipe de suporte* você cria a conta de um atendente (ou de alguém do financeiro,
moderação ou operação) com nome, e-mail, celular e papel. Duas formas de primeiro acesso:

- **Convite por e-mail (recomendado)** — o Supabase envia um link e a pessoa cria a própria senha;
- **Senha temporária** — aparece uma única vez na tela para você repassar; peça para trocar em *Meu perfil*.

Na lista dá para trocar o papel, reenviar o link de acesso, gerar nova senha, bloquear e tirar da
equipe. Para funcionar no Supabase:

```bash
supabase functions deploy admin-create-user
supabase secrets set APP_URL=https://seu-dominio.com.br
```

O login é criado pela Edge Function `admin-create-user` com a chave `service_role` (que nunca vai
para o navegador); ela confere se quem pediu é o dono. O `13_staff_accounts.sql` autoriza o e-mail
convidado (vale mesmo com cadastros fechados) e permite essa promoção a admin.

**Disputas** — fila com prazo de análise de 48 h. Cada caso mostra, numa tela só: as provas e os relatos
do cliente e do profissional, as fotos do pedido original, a linha do tempo do atendimento e o chat
entre os dois. O admin pode **pedir mais informações** a qualquer lado, guardar **notas internas** (que as
partes não veem) e **decidir**: estorno integral ao cliente ou pagamento ao profissional, com
justificativa obrigatória enviada aos dois.

**Inativos (reengajamento)** — o app registra o último acesso de cada conta (`touch_last_seen`). Em
*Admin → Inativos* você filtra quem não abre o app há 7, 30, 60, 90 ou 180+ dias (clientes e/ou
profissionais), seleciona uma ou várias contas e envia um lembrete com `{nome}` personalizado:

- **notificação no app** (sempre);
- **e-mail** via Resend — `supabase secrets set RESEND_API_KEY=re_... REMINDER_FROM="ServeGo <oi@seu-dominio>"`
  e `supabase functions deploy send-reminder`;
- **WhatsApp** — botão por conta que abre a conversa com a mensagem pronta (envio manual).

Quem recebeu lembrete nos últimos 7 dias fica oculto por padrão (para não insistir demais), e o
indicador *Voltaram após lembrete* mostra quantos abriram o app depois do aviso.

### 3.4 Pedido "estilo Uber" e pagamento só pelo app

1. O cliente descreve o serviço e vê a **faixa de preço**.
2. O sistema chama o **profissional disponível mais próximo** (verificado, online, sem outro atendimento em
   andamento). Ele tem `dispatch_timeout_seconds` (padrão 45 s) para aceitar; se recusar ou não responder,
   a chamada passa para o próximo mais perto.
3. Quando alguém aceita, o cliente vê o **preço fechado** (preço do profissional na categoria + adicional
   de urgência para "Agora") e **paga pelo app, antes do atendimento**, via Pix ou cartão.
4. Com o pagamento aprovado, o serviço é criado e o profissional é avisado para sair. O valor fica
   **retido** durante todo o atendimento.
5. Ao terminar, o profissional toca em **Concluir serviço** — mas isso não libera o dinheiro. O **cliente
   precisa confirmar** que o serviço foi de fato concluído; só então o repasse é gerado.
   - **Tive um problema:** o cliente abre uma disputa e é **obrigado a enviar fotos ou vídeos** (até 8
     arquivos, vídeos de até 50 MB, bucket privado `dispute-evidence`). O profissional é avisado e pode
     enviar a versão dele, também com provas. O pagamento continua retido até o admin decidir em
     **Admin → Disputas**.
   - **Sem resposta:** após `completion_auto_confirm_hours` (padrão 24 h) o serviço é confirmado
     automaticamente. Agende no Supabase com pg_cron:
     `select cron.schedule('servego-auto-confirm', '*/10 * * * *', $$select public.auto_confirm_completions()$$);`
6. Cancelou antes de o profissional sair? **Estorno integral**. Depois disso, só por disputa.

Para manter o pagamento dentro da plataforma, o chat oculta telefones, e-mails, links e "chave pix",
tanto no app quanto no banco (gatilho `mask_contact_info`).

**Ativar o Mercado Pago** (as chaves ficam só no Supabase, nunca no front):

```bash
supabase secrets set MP_ACCESS_TOKEN=APP_USR-xxxx MP_WEBHOOK_SECRET=xxxx APP_URL=https://seu-dominio.com.br
supabase functions deploy create-payment
supabase functions deploy refund-payment
supabase functions deploy payment-webhook --no-verify-jwt
```

No painel do Mercado Pago, cadastre o webhook `https://<projeto>.supabase.co/functions/v1/payment-webhook`
(evento *Pagamentos*). O cartão usa o checkout seguro do Mercado Pago, então o ServeGo nunca recebe dados de
cartão. No modo demo, o pagamento é simulado com botões "Simular pagamento aprovado".

As regras (tempo para aceitar, tempo para pagar, adicional de urgência, prazo de confirmação) ficam em
**Admin → Configurações**.

### 3.5 Tema claro e escuro

A interface tem os dois temas, e eles nascem dos mesmos tokens — não existe folha de estilo
duplicada.

- **Padrão:** segue o sistema operacional (`prefers-color-scheme`).
- **Escolha do usuário:** o botão de sol/lua no cabeçalho (e no menu da conta) grava a preferência
  e passa a mandar sobre o sistema. Dá para voltar em *Seguir o sistema*, no menu da conta.
- **Sem flash:** um script minúsculo no `<head>` de `index.html` e `app.html` aplica o tema antes
  da primeira pintura, então a tela nunca "pisca" branca ao carregar.

O que torna isso possível é a camada de **materiais** em `css/tokens.css` — `glaze` (verniz de luz),
`hover`, `well` (fundo rebaixado), `sheen` (filete de 1px), `inset`, `scrim` e as auras de fundo.
No escuro a luz vem de um brilho branco sobre preto; no claro, de branco sobre marfim, com as
sombras virando quentes e o ouro virando bronze no texto (`--sg-brand-ink`, `--sg-gold-ink`) para
manter o contraste legível sobre papel.

Ao criar uma tela nova, use sempre esses tokens em vez de `rgba()` cru — assim ela já nasce
funcionando nos dois temas.

### Segurança (RLS)

- cliente enxerga apenas os próprios dados;
- profissional enxerga os próprios dados e as solicitações abertas da sua especialidade;
- mensagens só são visíveis para remetente e destinatário;
- administrador tem acesso via `is_admin()` (`SECURITY DEFINER`, evitando recursão de RLS);
- Storage: cada usuário só grava dentro da pasta com o próprio `auth.uid()`.

---

## 4. O que está implementado

**Cliente** — dashboard com categorias e serviços ativos · busca · solicitação em 6 etapas
(categoria → descrição → local → fotos → urgência → revisão) · chamada ao profissional mais próximo
com radar animado · preço fechado e **pagamento pelo app antes do atendimento** (Pix ou cartão) ·
estorno ao cancelar · perfil completo do profissional · chat (sem troca de contato externo) · acompanhamento com timeline e mapa · avaliação com estrelas e tags · favoritos
· repetição de serviço · denúncia · notificações.

**Profissional** — painel com métricas e agenda · switch Online/Offline · **chamadas por proximidade** com
alerta em tela, contagem regressiva e aceite/recusa · serviço só começa depois do pagamento · atualização de status do serviço (a caminho → chegou → em
andamento → concluído) · ganhos com gráfico e extrato · avaliações com resposta pública · perfil,
especialidades e documentos.

**Administrador** — métricas do marketplace · aprovação de profissionais e documentos · gestão de
usuários (bloqueio) · solicitações · avaliações · denúncias · CRUD de categorias.

**Transversal** — design system próprio, tema claro e escuro, modo demo, skeletons, estados vazios,
toasts, microinterações, navegação inferior no mobile e responsividade completa.

---

## 5. Preparado para evoluir

A arquitetura já foi desenhada para receber, sem reescrita:

- **Pagamentos** — a tabela `transactions` já registra valor, taxa e líquido; basta plugar o
  provedor (split, antecipação) numa Edge Function.
- **Mapas reais** — `config.maps` aceita `mapbox` ou `google`; os componentes `.sg-map` são a versão
  mockada e podem ser trocados por um mapa real sem mexer nas telas.
- **Geolocalização** — `service_requests.lat/lng` e `professionals.lat/lng` já existem e a RPC de
  busca já calcula distância; a etapa de local do fluxo captura a posição do navegador.
- **Notificações push** — a tabela `notifications` e o canal Realtime já estão prontos; falta a
  camada de envio (FCM/APNs).
- **Apps Android e iOS** — a mesma camada `api.js` pode ser reaproveitada, ou o app web pode ser
  empacotado (PWA/Capacitor).
- **Comissão e assinatura** — a taxa é editada pelo admin em **Configurações** e fica em
  `app_settings`; o trigger `on_booking_completed()` lê `platform_fee_percent()` e o app carrega o
  valor ao abrir (`config.app.platformFeePercent` é só o padrão quando a tabela não existe).
  Transações já geradas guardam o valor da comissão da época.

---

## 6. Identidade visual

Preto profundo e grafite como base, branco para texto e o amarelo/dourado da logo **apenas como
destaque** (botões primários, selos, estados ativos). Tipografia **Manrope** para títulos e
**Inter** para interface. Raios sóbrios, bordas sutis, sombras direcionais e gradientes discretos.
Todos os valores vivem em `css/tokens.css` — mudar a marca inteira é mudar um arquivo.

A marca é um vetor (`assets/logo-mark.svg`): reta e nítida em qualquer tamanho. Dela saem o favicon
(`favicon.png`), o ícone de celular (`apple-touch-icon.png`) e uma versão PNG 512 px (`logo-mark-512.png`).
A arte 3D anterior está guardada em `assets/logo-mark-original.png`. A marca aparece em: header, sidebar,
tela de login, composição do hero e animação de busca de profissionais. O caminho está centralizado
em `SG.brandAsset` (`js/icons.js`).
