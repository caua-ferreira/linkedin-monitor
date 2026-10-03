# Analytics

## Objetivo

Coletar dados de desempenho dos posts do LinkedIn de forma comparável, preservando o tempo real de captura de cada medição.

---

## Interface AnalyticsProvider

```ts
interface AnalyticsProvider {
  collect(post: PublishedPost): Promise<AnalyticsSnapshot>;
}
```

Providers:

```text
LinkedInXlsxAnalyticsProvider
LinkedInApiAnalyticsProvider  (fase F, quando o acesso estiver disponível)
```

O restante do sistema não deve depender de onde as métricas vieram.

---

## Modelo AnalyticsSnapshot

Campos:

```text
id
notion_page_id
linkedin_post_urn
checkpoint          (1h | 24h | 72h)
captured_at         (ISO 8601 com timezone)
post_age_minutes    (calculado a partir do published_at real)
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
source              (linkedin_api | linkedin_xlsx | manual)
raw_payload         (JSON original preservado)
created_at
```

---

## Sources

```text
linkedin_api
linkedin_xlsx
manual
```

---

## Checkpoints

Alvo:

```text
1h
24h
72h
```

Janelas recomendadas:

```text
1h:    60–90 minutos
24h:   1440–1500 minutos
72h:   >= 4320 minutos
```

Sempre armazenar a idade real.

Exemplo:

```text
checkpoint = 72h
post_age_minutes = 4423
```

Isso representa aproximadamente 73h43m.

---

## Nunca fingir precisão

Se um relatório foi coletado com:

```text
26h
```

não armazenar como se fosse exatamente:

```text
24h
```

Armazenar a idade real. O checkpoint pode ser categorizado no bucket operacional mais próximo quando apropriado.

---

## XLSX Fallback

CLI:

```bash
npm run analytics:import -- report.xlsx
```

O importador deve:

```text
ler XLSX
detectar formato do relatório
detectar identidade do post no LinkedIn
combinar com página do Notion
extrair métricas
detectar timestamp gerado se possível
calcular post_age_minutes
sugerir checkpoint
mostrar prévia
persistir snapshot
atualizar resumo do Notion
```

Comportamento padrão: exigir confirmação antes de persistir.

Opcional:

```bash
--yes
```

para automação confiável.

---

## Campos ambíguos no XLSX

Exportações do LinkedIn XLSX podem conter:

```text
rótulos duplicados
nomes de métricas ambíguos
mudanças de layout
```

O parser nunca deve adivinhar silenciosamente.

Quando ambíguo:

```text
sinalizar ambiguidade
armazenar valor bruto
mostrar aviso
exigir regra de parser explícita
```

---

## Resumo no Notion

Quando um novo snapshot for salvo, atualizar os campos de resumo relevantes do Notion.

Campos por checkpoint:

```text
Impressões 1h / Alcance 1h
Impressões 24h / Alcance 24h
Impressões 72h / Alcance 72h
```

Campos cumulativos mais recentes:

```text
Reações
Comentários
Compartilhamentos
Salvamentos
Visitas ao perfil
Novos seguidores
Cliques
```

Esses campos representam o snapshot mais recente conhecido. O histórico fica no SQLite.

---

## Métricas derivadas

Exemplos:

```text
engagement_per_reach
impressions_per_reached_member
profile_view_rate
click_rate
follower_conversion
```

Não comparar posts de idades diferentes sem indicar a diferença.

---

## Correlação GA4 / BrainFrost (fase futura)

Campos futuros:

```text
site_sessions
signups
activations
```

Funil sugerido:

```text
impressão no LinkedIn
→ clique no LinkedIn
→ sessão no site
→ signup
→ ativação
```

Ativação pode ser definida depois como algo significativo no BrainFrost.

Não implementar correlação GA4 até que o modelo de tracking do site esteja confirmado.
