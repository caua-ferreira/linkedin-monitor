# Verificação local — 2026-10-04

## Conteúdo do Notion

O texto publicado é extraído do corpo da página, na seção H2 `Texto final` ou
`Texto publicado`. Não é uma propriedade da tabela. Uma única seção é permitida.

Foram restaurados e comparados com a origem 160 blocos em oito páginas da base nova.
As seis outras páginas da base antiga não tinham conteúdo para copiar. Os 14 IDs
existentes foram mantidos. Propriedades e métricas editadas pelo proprietário não
foram sobrescritas; esta etapa restaurou somente corpos vazios.

Backup anterior à restauração e comparações:
`data/notion-recovery/content-1791095057713/` (ignorado pelo Git).

## Correções locais

- `src/cli/runScheduler.ts`: respeita DRY_RUN antes de abrir banco e enfileirar.
- `src/scheduling/postScheduler.ts`: simulação por padrão; execução pode selecionar um único item.
- `src/scheduling/queueService.ts`: mantém Aprovado quando prontidão é fórmula.
- `src/storage/publicationRepository.ts`: claim atômico de queued para publishing.
- `src/publishing/publishingService.ts`: usa claim; 5xx deixa reconciliação pendente.
- `src/linkedin/linkedinClient.ts`: não repete automaticamente criação de post.
- `src/config/env.ts`, `.env.example` e `.env` local: versão LinkedIn 202609.
- Testes de fila, scheduler e segurança; configuração ESLint dos scripts Node.
- README e documentos Notion, LinkedIn e operações atualizados.

Referências oficiais verificadas:
[versionamento](https://learn.microsoft.com/en-us/linkedin/marketing/versioning) e
[Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09).

## Teste real autorizado

Item: [TESTE — automação Notion → LinkedIn](https://app.notion.com/p/3efd12d8e1e1819d9353c7e3c9942c9b).
Agendamento: 2026-10-04 03:31 America/Sao_Paulo / 06:31 UTC.
Texto: “Teste de publicação automática — validando minha integração entre Notion e LinkedIn. Este post será removido após a verificação.”

A prévia real do Notion passou sem erros. `npm run scheduler -- --once` com
DRY_RUN=true retornou `would_wait` e não publicou. O processo de teste usa os
módulos de fila/publicação existentes, restrito ao page ID acima. Registro:
`data/editorial-live-test-2026-10-04.json`. Não reexecute o script de criação:
ele bloqueia quando esse registro existe, inclusive após resultado incerto.

## Validação e limites

Suíte completa: 133 testes passaram; um teste adicional da fórmula/filtro passou
na suíte focada de fila (6 testes). Lint e tipos conferidos.

Esta verificação é local. Não confirma implantação no Vercel, execução contínua
no GitHub Actions, upload de mídia ou coleta de analytics em 1h/24h/72h.
Locks exigem o mesmo banco operacional; workers em bancos diferentes não os compartilham.
O post de teste será removido após confirmar a publicação; o registro e URN serão preservados.
