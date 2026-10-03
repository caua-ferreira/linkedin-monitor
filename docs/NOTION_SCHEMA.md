# Contrato do Notion — Fase A

Fonte de verdade: [Calendário Editorial LinkedIn](https://app.notion.com/p/346a6ba3e9234c3ebf8f536b46969f75).
Data Source ID: `3b1f73c4-d13e-4f4e-b5d8-d6a038e9ec99`.
[Overview](https://app.notion.com/p/3ecd12d8e1e181eb8c28d2aaf7d03de9) e
[Guia Editorial](https://app.notion.com/p/3ecd12d8e1e181a38bd8c31a5e848403) são referências
fornecidas pelo usuário; o conteúdo dessas páginas ainda não foi verificado nesta entrega.

Não existem migrações automáticas de schema. Execute `npm run notion:check` para
conferir o schema real com sua integração. Divergências bloqueiam a rodada e devem
ser resolvidas preservando os dados e as propriedades existentes.

| Propriedade obrigatória na Fase A | Tipo esperado |
| --- | --- |
| Post | title |
| Status | status ou select |
| Data | date, sem hora e sem término |
| Horário | rich_text, formato `HH:mm` |
| Formato | select |
| Arte | select ou status |
| Pronto para publicar | checkbox |
| Scheduler ID | rich_text |
| Publicado em | date |
| Mídia URL | url |
| Post URL | url |
| UTM URL | url |
| Erro automação | rich_text |

Fluxo preservado: Ideia → Em produção → Em revisão → Aprovado → Agendado → Publicado.
Nesta fase nenhuma transição é executada. O filtro exige `Aprovado`; `Agendado`
não autoriza publicação. A política final de agendamento será definida na Fase C,
mantendo a exigência de aprovação imediatamente antes de publicar.

Formatos aceitos para prévia: `Texto`, `Texto + imagem`, `Imagem vertical`,
`Vídeo/GIF`, `Documento`. Formatos visuais exigem `Mídia URL` HTTPS. Nesta fase a
URL não é baixada e o arquivo não tem MIME, tamanho ou processamento verificados.
Essas verificações pertencem à Fase C, conforme suporte oficial LinkedIn.

As demais propriedades são preservadas e não são necessárias à leitura inicial:

- Pilar, BrainFrost?, Objetivo, Observações.
- Coleta 1h, Coleta 24h, Coleta 72h, Última coleta.
- Impressões 1h, Alcance 1h, Impressões 24h, Alcance 24h, Impressões 72h, Alcance 72h.
- Reações, Comentários, Compartilhamentos, Salvamentos, Visitas ao perfil,
  Novos seguidores, Cliques.
- Taxa de engajamento, Impressões por pessoa, CTR de clique.

Não converter ou sobrescrever fórmulas existentes. Tipos desses campos serão
inspecionados antes das fases de analytics. Não criar valores zero para métricas
indisponíveis; ausência de acesso não equivale a zero.

## Conteúdo do item

```text
[heading 2] Texto final
[paragraph] Texto pronto para ser publicado.
[paragraph] https://example.org/artigo
[heading 2] Observações internas
[paragraph] Este conteúdo não entra no post.
```

Use heading nativo do Notion; um parágrafo contendo `## Texto final` não é heading.
`Texto publicado` é alternativa aceita, mas não pode coexistir com `Texto final`
na mesma página. Heading dentro de toggle, coluna ou seção aninhada é bloqueado.
Os tipos são verificados por schema e novamente nos valores de cada página.
