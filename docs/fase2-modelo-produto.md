# Fase 2 — Modelo de Produto (mapeado para a interface)

Status: documento de planejamento, sem alteração de código. Complementa `docs/ontology-product-model-v1.md` (o modelo de dados real, em inglês) traduzindo cada conceito para **como ele deve se manifestar visualmente**, em português brasileiro nativo — não uma tradução automática de rótulos em inglês.

## Nomenclatura pt-BR dos Tipos de Objeto

| Inglês (código) | pt-BR (interface) | Ícone/cor de categoria (design-system-v4 §4) |
|---|---|---|
| Entity | Entidade | `--chart-1` |
| Opportunity | Oportunidade | `--chart-4` |
| Page | Página | `--chart-2` |
| Decision | Decisão | `--chart-5` |
| AgentRun | Execução | `--chart-3` |
| Observation | Observação | `--chart-5` |
| Market | Mercado | `--chart-1` (subtipo de Entidade) |
| Role | Papel | `--chart-1` (subtipo de Entidade) |
| Query | Consulta | — (ainda sem view própria) |
| Trend | Tendência | — (ainda sem view própria) |
| Worker | Agente configurável | — (fora do escopo do Inspector universal) |

## Objects (Objetos)

Cada Tipo de Objeto real (13 no modelo, ver `ontology-product-model-v1.md` §1) deve aparecer na interface como uma **entidade de primeira classe com identidade visual própria**: um badge de tipo (cor de categoria + ícone + rótulo em pt-BR), nunca um texto solto dizendo "opportunity" ou "entity". Um objeto nunca é "uma linha" — é sempre "um Objeto do tipo X".

## Relationships (Relacionamentos)

Hoje: uma lista de linhas de texto ("TARGETS ROLE → Family buyer"). Novo padrão:
- Rótulo do relacionamento em pt-BR natural, nunca a tradução literal da constante do banco: `TARGETS_ROLE` → **"direciona-se a"**, `ANSWERS_INTENT` → **"responde a"**, `derived_from` → **"originado de"**, `targets` → **"direciona-se a"**, `produced` → **"produziu"**, `measures` → **"mede"**, `supports` → **"sustenta"**, `materializes` → **"materializa-se em"**, `operates_on` → **"opera sobre"**.
- Contagem por tipo de relacionamento sempre visível no cabeçalho do objeto (ex.: "12 Oportunidades · 4 Mercados · 8 Consultas · 6 Páginas" — exatamente o exemplo do briefing), não apenas uma lista plana de itens individuais.
- Cada relacionamento continua clicável e navegável dentro do próprio Inspector (padrão já real, mantido).

## Properties (Propriedades)

Nomenclatura em pt-BR natural por objeto — nunca abreviações estranhas para caber no layout (regra explícita do usuário). Exemplos reais já mapeados:

| Campo real | pt-BR |
|---|---|
| `targetIntent` | Intenção-alvo |
| `businessValueScore` | Valor de negócio |
| `sourceGroundingScore` | Fundamentação da fonte |
| `outlineCompletenessScore` | Completude do esboço |
| `entityCoverageScore` | Cobertura da entidade |
| `qualityScore` | Qualidade |
| `seoScore` / `aeoScore` / `geoScore` | Pontuação SEO / AEO / GEO |
| `informationGainScore` | Ganho de informação |
| `risk` | Risco |
| `priority` | Prioridade |
| `confidence` | Confiança |
| `expectedImpact` | Impacto esperado |

Uma propriedade com valor real `null` continua exibida como "—" (nunca omitida silenciosamente, nunca um zero fabricado) — mas o rótulo que acompanha esse "—" precisa soar natural: **"não disponível"**, nunca "N/A" ou "null".

## Signals (Sinais)

Hoje sem UI própria fora da Timeline. Um Sinal deve aparecer como um evento pontual e datado, com verbo de ação em pt-BR natural derivado do `SignalType` real — nunca o nome técnico da constante. Exemplo: `TREND_ACCELERATION` → **"Aceleração de tendência detectada"**.

## Actions (Ações)

Nomenclatura pt-BR dos 16 valores reais de `DecisionAction`:

| Inglês | pt-BR |
|---|---|
| CREATE_PAGE | Criar página |
| UPDATE_PAGE | Atualizar página |
| MERGE_PAGES | Mesclar páginas |
| REDIRECT_PAGE | Redirecionar página |
| ADD_INTERNAL_LINKS | Adicionar links internos |
| CREATE_HUB | Criar hub |
| CREATE_DATASET | Criar conjunto de dados |
| CREATE_CALCULATOR | Criar calculadora |
| CREATE_COMPARISON | Criar comparativo |
| CREATE_FAQ | Criar FAQ |
| REFRESH_CONTENT | Atualizar conteúdo |
| INVESTIGATE_ENTITY | Investigar entidade |
| EXPAND_MARKET | Expandir mercado |
| EXPAND_ROLE | Expandir papel |
| MONITOR | Monitorar |
| DO_NOTHING | Não fazer nada |

Uma Ação sempre aparece **ancorada no objeto**, nunca em uma lista separada de "tarefas pendentes" — o padrão real já existe (`Actions` no Inspector), falta apenas o tratamento visual: botão de ação com verbo no infinitivo, motivo de bloqueio em pt-BR quando `plan.status === "unsupported"` (ex.: "Ainda não é possível automatizar: {motivo}").

## States (Estados)

O mapa de 5 estados reais (design-system-v4 §5) ganha rótulos pt-BR — nunca `replaceAll("_", " ")` sobre a constante em inglês, que é o que o código faz hoje:

| Bucket | Inglês (exemplos reais) | pt-BR |
|---|---|---|
| Não iniciado | discovered, pending, queued | Descoberto, Pendente, Na fila |
| Em andamento | qualified, approved, generating, running | Qualificado, Aprovado, Gerando, Em execução |
| Requer atenção | ready, waiting_approval, paused | Pronto para revisão, Aguardando aprovação, Pausado |
| Concluído | published, succeeded, completed | Publicado, Concluído com sucesso, Concluído |
| Falhou | quality_rejected, failed, blocked, cancelled | Rejeitado por qualidade, Falhou, Bloqueado, Cancelado |

## Evidence (Evidência)

Rótulo do painel: **"Evidência"**. Campos: fonte (`source_type` real, ex. `web_search` → **"Pesquisa na web"**), confiança (real, "80% de confiança"), status de verificação (`verified` → **"verificado"**, `unverified` → **"não verificado"**, `conflicting` → **"conflitante"**, `stale` → **"desatualizado"**).

## Decisions (Decisões)

Uma Decisão real mostra: ação proposta (tabela acima), motivo real (`reason`, já em texto livre — continua como está, mas gerado/escrito em pt-BR quando novas decisões forem criadas), risco/prioridade/confiança (tabela de Properties acima), e a cadeia causal real Sinal → Observação → Decisão → Ação → Resultado como uma trilha navegável, não uma lista de texto.

## Regra geral de tom

Termos técnicos internos do código (nomes de tabelas, endpoints, tipos TypeScript) continuam em inglês — isso é interno, nunca visível ao usuário. Toda a camada de apresentação segue o padrão já demonstrado no briefing: **"Oportunidades emergentes"**, não "Emerging Opportunities"; **"O que exige atenção"**, não "What needs attention". Nenhuma tradução literal palavra-por-palavra — cada rótulo é escrito como um redator brasileiro nativo escreveria para um produto profissional de inteligência operacional.
