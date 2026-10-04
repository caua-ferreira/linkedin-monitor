# Operação — Fase A

## Correções verificadas em 2026-10-04

O scheduler local respeita `DRY_RUN=true` antes de abrir o banco operacional ou
enfileirar publicações; nesse modo executa a prévia somente leitura. A classe
PostScheduler também usa simulação por padrão. A publicação real exige opção explícita.
O claim de um item enfileirado é atômico no mesmo banco. Processos usando bancos
diferentes não compartilham esse lock: não execute workers independentes para o mesmo post.
Criação de posts não repete automaticamente chamadas em caso de 5xx; resultado
incerto exige reconciliação. Estas mudanças locais precisam ser implantadas para
afetarem GitHub Actions ou Vercel.

## Validar antes de continuar

1. Execute `npm install`, `npm run test`, `npm run lint`, `npm run build`.
2. Execute `npm run dry-run:demo` e confira a prévia fictícia.
3. Configure `.env` local e compartilhe a database com a integração Notion.
4. Execute `npm run notion:check` e ajuste incompatibilidades sem apagar propriedades.
5. Prepare um item real aprovado, com checkbox e seção final única.
6. Execute `npm run dry-run` e revise título, texto, mídia e horário UTC (12:20 em
   São Paulo equivale a 15:20Z nessa data de exemplo).
7. Só depois avance às fases de publicação; o modo real ainda é bloqueado.

Os testes usam fixtures/HTTP mockado. Demo não comprova acesso ao workspace.
Erros de configuração/leitura retornam código 1; candidatos bloqueados retornam 2.
Não apague um erro bloqueante sem verificar e resolver a causa no item.

## Windows Task Scheduler

`scripts/start-scheduler.ps1` executa uma rodada somente leitura nesta fase.
Para monitorar prévias localmente, no Agendador de Tarefas:

- Crie uma tarefa no seu usuário, sem privilégios elevados desnecessários.
- Programa: `powershell.exe`.
- Argumentos: `-NoProfile -File "C:\caminho\LinkedIn_automatic\scripts\start-scheduler.ps1"`.
- Pasta inicial: raiz do projeto. O script também a ajusta automaticamente.
- Disparador: por exemplo, a cada 5 minutos; exija disponibilidade de rede.
- Em instância já em execução, escolha **não iniciar nova instância**.
- Confira o código de saída e `data/automation.jsonl`.

O Node/npm precisa estar no PATH do usuário da tarefa. O computador precisa estar
ligado e acordado. Nenhuma tarefa do Windows é criada automaticamente por esta
entrega. O script de servidor será incluído quando houver servidor OAuth na Fase B.

## Troubleshooting

| Código/sintoma | Ação |
| --- | --- |
| NOTION_TOKEN_REQUIRED | Preencher token no `.env` local ou ambiente do processo |
| NOTION_HTTP_401 | Corrigir token, sem retry automático |
| NOTION_HTTP_403 | Conferir capabilities da integração e acesso à página |
| NOTION_HTTP_404 | Conferir Data Source ID e compartilhamento da database original |
| NOTION_SCHEMA_MISMATCH_RUN_NOTION_CHECK | Executar `npm run notion:check`; comparar com contrato do schema |
| FINAL_TEXT_SECTION_MISSING | Criar um heading 2 nativo `Texto final` ou `Texto publicado` |
| FINAL_TEXT_SECTION_AMBIGUOUS | Manter uma única seção de texto final |
| FINAL_TEXT_UNSUPPORTED_BLOCK_OR_RICH_TEXT | Simplificar seção; usar URLs literais e parágrafos/listas sem filhos |
| INVALID_OR_AMBIGUOUS_SCHEDULE | Data sem hora/intervalo e Horário `HH:mm` |
| ALREADY_PUBLISHED_OR_REGISTERED | Investigar URN, URL ou Publicado em; não apagar IDs para forçar tentativa |
| BLOCKING_AUTOMATION_ERROR | Resolver causa no item antes de limpar erro manualmente |
| PHASE_A_DRY_RUN_REQUIRED | Manter DRY_RUN=true; publicação real ainda não foi implementada |
| Lista vazia | Conferir critérios de prontidão e logs `eligibility/skipped` |

## Hospedagem futura

Local com Agendador de Tarefas é a primeira opção, sem custo de hospedagem.
Um servidor próprio ou VPS com disco persistente poderá rodar o mesmo worker.
Planos gratuitos com suspensão e ambientes efêmeros não garantem publicação pontual
nem preservação do SQLite. Preços e disponibilidade devem ser verificados na fase
de deploy. Nenhum provedor externo foi provisionado.

## Retenção e recuperação

Faça backup dos arquivos de configuração por canal seguro. Prévia não é backup do
Notion. Exclua prévias antigas conforme sua política de retenção, pois contêm texto
editorial completo. Não há estado externo a reconciliar nesta fase. Ledger, lock,
tokens criptografados e `npm run reconcile` serão implementados antes do modo real.
