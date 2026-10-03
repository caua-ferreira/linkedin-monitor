# LinkedIn — preparação para Fase B

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
