# Arquitetura

## Implementado na Fase A

| Módulo | Responsabilidade |
| --- | --- |
| `src/config/env.ts` | Configuração Zod; exige DRY_RUN, sem exibir valores secretos |
| `src/notion/notionClient.ts` | Autenticação, schema, query por status, paginação, conteúdo recursivo, PATCH guardado, logs e erros |
| `src/notion/notionRepository.ts` | Mapeamento tipado e `getReadyPosts()` |
| `src/notion/notionContentParser.ts` | Identificação única da seção e conversão conservadora para texto |
| `src/services/postValidation.ts` | `validatePostForPublishing()` e validação de URLs |
| `src/services/dryRunService.ts` | Plano de simulação sem IO remoto |
| `src/utils/time.ts` | Conversão São Paulo → UTC e rejeição de horários ambíguos |
| `src/utils/retry.ts` | Até 4 tentativas totais, backoff exponencial e jitter |
| `src/cli/` | Leitura real, fixture offline e diagnóstico do schema |
| `src/tests/` | Testes com fetch injetado; nenhuma chamada real |

Timeout HTTP: 20 segundos. Retry apenas para 429, 5xx e timeout; respeita o maior
entre `Retry-After` numérico em segundos e o backoff. 400/401/403/404 e falhas de
rede não classificadas falham imediatamente. Espera de 350 ms entre chamadas
sequenciais reduz pressão sobre a API; processos independentes ainda podem somar
tráfego. Não rode múltiplas instâncias desnecessariamente.

Limites de segurança de leitura: 30 níveis e 10.000 blocos por página; ciclos,
cursores repetidos, payload inválido ou query incompleta invalidam a leitura.
Erros externos são reduzidos a códigos seguros; os corpos remotos não são logados.

## Planejado para fases seguintes

OAuth e API HTTP separados do worker. Tokens criptografados em repouso, com chave
fora do banco. SQLite local para ledger e lock transacional. Notion continua sendo
a fonte editorial; o ledger registra apenas efeitos externos e recuperação.

Chave de tentativa: `notionPageId:scheduledInstantUTC`. Além dela, a proteção por
page ID deverá impedir uma nova publicação quando a data for editada após sucesso.
Antes do envio real, reler Status, Scheduler ID, Post URL, aprovação e conteúdo.

Após sucesso LinkedIn, persistir URN imediatamente antes de atualizar o Notion.
Reconciliação reaplica propriedades a partir do ledger sem republicar.
**Timeout após envio não permite retry cego de criação de post**: a API pode ter
aceitado a chamada. Essa janela exige estado de resultado desconhecido, bloqueio
de nova tentativa e reconciliação ou revisão humana. Não prometer exatamente uma
vez sem uma garantia de idempotência do serviço externo.

Analytics usará os mesmos DTOs para importação manual e API. Checkpoints serão
persistidos separadamente; um snapshot antigo não poderá sobrescrever os campos
do checkpoint mais recente. Ausência de permissão será estado esperado.

Os módulos planejados ainda não estão implementados; esta fase não instala nem
abre banco de tokens, não expõe servidor e não contém cliente LinkedIn.
