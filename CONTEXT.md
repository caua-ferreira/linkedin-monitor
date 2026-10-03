PROJETO: LinkedIn_Monitor

Atue como um engenheiro de software sênior responsável por construir e manter
uma automação pessoal de publicação e analytics para LinkedIn.

O sistema deve ser projetado para produção, mesmo que inicialmente rode apenas
na máquina local Windows do usuário.

PRINCÍPIOS

1. Notion é a fonte de verdade editorial.
2. SQLite é a fonte de verdade operacional da automação.
3. Analytics nunca devem ser sobrescritos sem preservar o snapshot anterior.
4. Toda publicação deve ser idempotente.
5. Nenhuma operação destrutiva ou publicação real deve ocorrer em testes.
6. Nunca depender de serviço pago.
7. Nunca usar scraping ou automação de navegador para publicar.
8. Usar somente APIs oficiais do LinkedIn.
9. Se uma permissão do LinkedIn não estiver disponível, degradar graciosamente.
10. Não assumir funcionalidades da API; verificar a documentação oficial atual.



==================================================
MODELO DE DADOS
==================================================

Separar três conceitos:

A) ESTADO EDITORIAL — vem do Notion

Ideia
Em produção
Em revisão
Aprovado
Agendado
Publicado

B) ESTADO OPERACIONAL — banco local

idle
queued
publishing
published
failed
reconciliation_required

C) ANALYTICS SNAPSHOTS

Cada coleta deve gerar um novo registro histórico.

Nunca sobrescrever um snapshot antigo.

Tabela sugerida:

analytics_snapshots

id
notion_page_id
linkedin_post_urn
checkpoint
captured_at
post_age_minutes
impressions
reach
reactions
comments
shares
saves
sends
profile_views
followers_gained
link_clicks
premium_cta_clicks
source
raw_payload
created_at

source deve aceitar:

linkedin_api
linkedin_xlsx
manual


==================================================
SCHEDULING MODEL
==================================================

No Notion podem continuar existindo:

Data
Horário

Mas internamente sempre converter para:

scheduled_at

Formato ISO 8601 com timezone:

2026-10-05T18:10:00-03:00

Timezone oficial:

America/Sao_Paulo

Nunca fazer comparação de horários usando strings.

Estados esperados:

Aprovado
→ sistema valida
→ cria registro local queued
→ Status Notion = Agendado

Quando scheduled_at <= now:

queued
→ publishing
→ chamada LinkedIn
→ persistir LinkedIn URN imediatamente
→ atualizar Notion
→ published

Se houver falha:

failed

Nunca tentar novamente cegamente quando houver dúvida se o LinkedIn recebeu
a publicação.

Nesses casos:

reconciliation_required




getPostsToQueue()

Selecionar:

Status = Aprovado
Pronto para publicar = true
scheduled_at futuro ou presente
sem publicação local existente

getPostsDueForPublishing()

Consultar o BANCO LOCAL por:

automation_state = queued
scheduled_at <= now




==================================================
LINKEDIN OAUTH
==================================================

Usar Authorization Code Flow oficial.

Scopes iniciais, quando disponíveis para o aplicativo:

openid
profile
email
w_member_social

Não assumir que refresh_token estará disponível.

O sistema deve suportar dois modos:

1. refresh token, quando fornecido pelo LinkedIn;
2. reautorização OAuth quando refresh token não estiver disponível.

Persistir:

access_token encrypted
access_token_expires_at
refresh_token encrypted, se recebido
refresh_token_expires_at, se recebido
authorized_scopes

Criar comando:

npm run auth:status

Saída esperada:

LinkedIn authenticated: yes
Access token expires: ...
Refresh supported: yes/no
Scopes:
- w_member_social
- ...



==================================================
FORMATOS LINKEDIN
==================================================

Suportar:

text
single_image
multi_image
video
document

Não assumir suporte a carrossel orgânico pela Posts API.

Quando Formato no Notion = Carrossel:

não publicar automaticamente até existir um mapeamento explicitamente
suportado pela API.

Registrar:

UNSUPPORTED_FORMAT



==================================================
ANALYTICS ENGINE
==================================================

Criar interface:

AnalyticsProvider

Método:

collect(post): Promise<AnalyticsSnapshot>

Implementações:

LinkedInApiAnalyticsProvider
LinkedInXlsxAnalyticsProvider

Isso permite trocar a fonte sem alterar o restante do sistema.

O AnalyticsService NÃO deve saber se o dado veio de API ou XLSX.

Fluxo:

provider
→ AnalyticsSnapshot
→ persist SQLite
→ atualizar resumo no Notion



checkpoint_1h:
target = 60 min
window = 60–90 min

checkpoint_24h:
target = 1440 min
window = 1440–1500 min

checkpoint_72h:
target = 4320 min
window >= 4320 min


