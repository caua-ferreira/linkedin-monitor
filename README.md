# Calendário Editorial Notion ↔ LinkedIn

Automação local em TypeScript. O código atual inclui OAuth, publicação e scheduler;
parte das instruções abaixo ainda descreve a entrega original da Fase A.
`DRY_RUN=true` executa prévia somente leitura; `DRY_RUN=false` permite publicação real.
Consulte [operações](docs/OPERATIONS.md) para as correções de segurança de 2026-10-04.
Nenhuma dependência de hospedagem paga.

## Onde escrever o post

Abra a linha do calendário como página. Abaixo das propriedades, crie um título
nativo de nível 2 chamado **Texto final** e escreva o texto abaixo dele. O campo
**Post** da tabela é somente o nome do item. Use **Texto publicado** como alternativa,
mantendo apenas uma dessas seções na página. O próximo título de nível 1 ou 2 encerra
o trecho enviado ao LinkedIn. Veja [o contrato completo](docs/NOTION_SCHEMA.md).

## Começar no Windows

Requer Node.js 22 ou superior e npm. Em PowerShell, dentro desta pasta:

```powershell
npm install
Copy-Item .env.example .env
# Edite .env localmente e preencha NOTION_TOKEN. Não envie tokens pelo chat.
npm run notion:check
npm run dev
```

Não sobrescreva um `.env` existente. A integração Notion deve ter acesso à database
original por **Connections / Conexões** e permissão de leitura de conteúdo.
O `.env.example` já contém o Data Source ID fornecido:
`3b1f73c4-d13e-4f4e-b5d8-d6a038e9ec99`.

Teste sem credenciais ou rede:

```powershell
npm run test
npm run lint
npm run build
npm run dry-run:demo
```

O demo usa **um post fictício**, não um item real do seu calendário. O status
`would_wait` significa que seu horário ainda não chegou; `would_publish` significa
que passou pelas validações da Fase A e chegou o horário. Ambos são apenas prévias.
Isso ainda não certifica requisitos ou limites da API LinkedIn.

## Comandos da Fase A

| Comando | Efeito |
| --- | --- |
| `npm run dev` / `npm run dry-run` | Uma leitura do Notion, validação e prévia |
| `npm run dry-run:demo` | Prévia offline com fixture |
| `npm run notion:check` | Verifica tipos das propriedades; não modifica o schema |
| `npm run scheduler` | Alias temporário de **uma rodada DRY_RUN**, sem daemon |
| `npm run test` | Testes unitários e de integração com HTTP simulado |
| `npm run lint` | ESLint e checagem TypeScript estrita |
| `npm run build` | Compila em `dist/` |

Saídas: `0` sucesso; `1` configuração, leitura ou infraestrutura falhou;
`2` candidatos bloqueados ou schema incompatível.
Logs em `data/automation.jsonl`. Cada execução bem-sucedida gera
`data/dry-run-<timestamp>-<uuid>.json` e imprime a mesma prévia.
Um erro de leitura invalida a rodada inteira; nenhuma prévia parcial é tratada como completa.
Posts fora dos critérios de prontidão são ignorados com log `eligibility/skipped`.

## Regras de leitura

`getReadyPosts()` retorna apenas itens com Status `Aprovado`, Data e Horário
preenchidos, Arte `Pronta` ou `Não precisa`, checkbox `Pronto para publicar` marcado
e `Scheduler ID` vazio. Páginas arquivadas ou na lixeira são excluídas.

Os candidatos ainda passam por `validatePostForPublishing()`: título e texto,
formato conhecido, mídia obrigatória nos formatos visuais, URLs HTTP(S) sem
credenciais, mídia HTTPS, data/horário válidos e ausência de indicadores de
publicação. Qualquer texto em `Erro automação` bloqueia até revisão manual.
Texto simples com `Mídia URL` preenchida também bloqueia por ambiguidade.

Use **exatamente um heading 2**, no nível principal da página, chamado `Texto final`
ou `Texto publicado`. O texto termina no próximo heading 1 ou 2, ou no fim da página.
Sem outro heading, todo o conteúdo restante pertence ao texto final.
Parágrafos e listas simples são aceitos. Dois títulos de seção, estruturas
aninhadas, menções, links mascarados ou blocos não suportados dentro da seção bloqueiam.
Links precisam aparecer como URL literal no texto. Formatação visual como negrito
é convertida em texto simples; listas ganham marcadores e blocos são separados por
linha em branco. Confira sempre a prévia. Não se anexa UTM automaticamente.

`Data` deve ser uma data sem hora nem intervalo (`YYYY-MM-DD`); `Horário` é texto
`HH:mm`, em `America/Sao_Paulo`. Datas com hora embutida são bloqueadas em vez de
combinar fusos silenciosamente. A decisão de vencimento usa o instante UTC convertido.

## Configuração

| Variável | Padrão / finalidade |
| --- | --- |
| `DRY_RUN` | `true`; único modo permitido na Fase A |
| `NOTION_TOKEN` | Segredo local, obrigatório para leitura real |
| `NOTION_DATA_SOURCE_ID` | ID fornecido pelo usuário |
| `NOTION_API_VERSION` | `2026-03-11`, configurável |
| `TIMEZONE` | `America/Sao_Paulo`, único fuso permitido neste calendário |
| `DATA_DIR` | `./data`, logs e prévias locais |
| `LOG_LEVEL` | `info` |
| `LINKEDIN_*` | Reservadas; não utilizadas nesta fase |

Não grave segredos em código, commits ou logs. O cliente não registra headers nem
corpos de erros remotos. Atualizações no Notion enviam somente propriedades
explicitamente solicitadas, preservando as demais. Em DRY_RUN o cliente bloqueia
PATCH, e `recordError()` registra o erro somente no log local.

**Atenção ao OneDrive:** esta pasta está dentro de uma pasta sincronizada. `.gitignore`
protege o Git, mas não impede sincronização pelo OneDrive. Para uso real, mantenha
projeto/segredos em pasta local fora da sincronização, ou injete `NOTION_TOKEN` pelo
ambiente do processo e defina `DATA_DIR` fora do OneDrive. As prévias contêm conteúdo
editorial completo; limite o acesso local e aplique retenção conforme sua necessidade.

## Arquitetura e evolução

`config → CLI → notionRepository → notionClient → API Notion`

`blocos → notionContentParser → validatePostForPublishing → dryRunService → JSON/logs`

`fetch` nativo com timeouts, Zod nas fronteiras, Pino para logs, date-fns-tz para
timezone e Vitest para testes. Não há SQLite ainda, pois esta fase não grava estado
de publicação. A chave `page ID + scheduled datetime` aparece na prévia; **não é um
lock nem uma garantia de idempotência de publicação**.

| Fase | Situação |
| --- | --- |
| A — configuração, Notion, validação, DRY_RUN | Implementada; leitura real depende de token e schema compatível |
| B — OAuth oficial e post de texto | Pendente |
| C — mídia, scheduler, ledger SQLite e lock | Pendente |
| D — importação XLSX | Pendente |
| E — analytics oficial e checkpoints | Pendente |
| F — reconciliação e validação integrada final | Pendente |

Os comandos `collect`, `import:linkedin-report`, `reconcile` e o servidor OAuth
serão adicionados nas respectivas fases; não há comandos vazios simulando sucesso.
Overview e Guia Editorial existentes permanecem intactos. Esta entrega não criou
dashboards nem alterou propriedades ou páginas do workspace.

## Decisões e documentação oficial

Consultada em 01/10/2026:

- [Versionamento Notion](https://developers.notion.com/reference/versioning):
  a versão atual documentada é `2026-03-11`, utilizada como padrão configurável.
- [Query a data source](https://developers.notion.com/reference/query-a-data-source):
  leitura pelo Data Source ID, filtro por Status e paginação; resultados marcados
  `incomplete` causam falha explícita.
- [Retrieve a data source](https://developers.notion.com/reference/retrieve-a-data-source):
  inspeção do schema antes de consultar candidatos.
- [Retrieve block children](https://developers.notion.com/reference/get-block-children):
  todas as páginas de blocos são lidas e seus filhos são buscados recursivamente.
- [Update page](https://developers.notion.com/reference/patch-page):
  suporte a atualização de propriedades no cliente, bloqueado em DRY_RUN.

Nenhum endpoint, scope ou versão LinkedIn foi implementado nesta fase. A documentação
oficial atual será consultada novamente antes de implementar B, C e E.

Mais detalhes: [schema](docs/NOTION_SCHEMA.md), [arquitetura](docs/ARCHITECTURE.md),
[operação e troubleshooting](docs/OPERATIONS.md), [preparação LinkedIn](docs/LINKEDIN_SETUP.md).
