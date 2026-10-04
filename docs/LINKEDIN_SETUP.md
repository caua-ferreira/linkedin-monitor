# LinkedIn — preparação para Fase B

## Verificação em 2026-10-04

A configuração local foi atualizada de `202501` para `202609`, versão mais recente
indicada na [documentação oficial de versionamento](https://learn.microsoft.com/en-us/linkedin/marketing/versioning).
Continua configurável em `LINKEDIN_API_VERSION`. A criação textual usa
`POST /rest/posts`, `w_member_social`, os dois headers de versão e captura
`x-restli-id`, conforme a [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09).
Não repetir a criação após resposta 5xx, pois ela pode ter sido efetivada.

A Fase A não chama o LinkedIn e não requer Client ID ou Client Secret.
Não existem rotas OAuth nem tokens LinkedIn persistidos nesta entrega.

Na Fase B, consultar a documentação oficial atual antes de implementar OAuth e
publicação de texto. Verificar produtos concedidos ao aplicativo, scopes
efetivamente disponíveis, versão suportada e contratos de request/response.

Requisitos a confirmar na implementação:

- OAuth oficial com state de uso único, expiração e validação do callback.
- Rotas `GET /auth/linkedin` e `GET /auth/linkedin/callback`.
- Scopes solicitados no projeto: `openid`, `profile`, `email`, `w_member_social`.
- `LINKEDIN_API_VERSION` configurável; não assumir a versão pela data do computador.
- Segredos no backend; tokens cifrados e exclusão de credenciais dos logs.
- Refresh depende de suporte concedido ao aplicativo; não assumir que virá token.
- Nenhum scraping, simulação de cliques ou automação de browser para publicar.

Antes da Fase E, confirmar disponibilidade do scope `r_member_postAnalytics` e do
recurso `memberCreatorPostAnalytics`. Até lá, `LINKEDIN_ANALYTICS_ENABLED=false`
é reservado para configuração futura. O importador XLSX pertence à Fase D e ainda
não está disponível. A estrutura do Notion será a mesma para ambas as fontes.

Não preencha uma versão LinkedIn fictícia no `.env` apenas para passar validação.
As variáveis LinkedIn permanecem inativas na Fase A.
