# Mission Control — Production Flow v3

Status: documento de planejamento. Nenhum mockup visual e nenhum código foram produzidos nesta rodada — só este documento, conforme instrução explícita ("primeiro prove que você entendeu o fluxo").

## O erro das rodadas anteriores, admitido

Toda versão até agora — Object-centric, Radar/Contexto/Relacionados, Dossiê, Production Room, e o grid 3×3 — tratou as referências como **vocabulário visual** (que fonte, que cor, que borda, que grid) e nunca como **modelo de operação** (o que o sistema faz, em que ordem, o que entra e o que sai). O grid 3×3 da última rodada é o sintoma mais claro disso: copiei a estrutura de um diagrama estático (objeto + relações), quando a referência real pedida era um sistema em loop. Um grid de objetos conectados descreve uma estrutura. Não descreve um sistema funcionando. Esta versão parte do funcionamento, não da estrutura.

---

## A. CORE LOOP

O loop não é uma metáfora nova — é o que o domínio já implementa, hoje, em código real. `Opportunity.status` (`lib/opportunity/model.ts`) já é, literalmente, a máquina de estados deste loop:

```
discovered → qualified → approved → generating → published → monitoring
   (+ rejected / stale / merged como saídas reais de exceção)
```

Mapeado nas 8 etapas pedidas, cada uma com sua fonte real (nada inventado):

| Etapa | O que acontece | Fonte real |
|---|---|---|
| **1. Observar** | Um sinal bruto é captado — menção de entidade, dado de Search Console, consulta real | `Signal` (`lib/intelligence/signals.ts`), `POST /api/v1/search-console/properties/:id/import` |
| **2. Entender** | Sinais viram um padrão real; a ontologia (entidades e relações já existentes) dá contexto a esse padrão | `Observation` (agrupa `signalIds`), `entity_relationships`, `opportunity_graph_edges` |
| **3. Descobrir** | Uma Oportunidade real nasce e é pontuada | `Opportunity.status: "discovered" → "qualified"`, scores reais (`businessValueScore`, `sourceGroundingScore`, `entityCoverageScore`) |
| **4. Decidir** | O motor de decisão propõe uma ação real; um humano aprova ou rejeita | `Decision` (`lib/intelligence/decisions.ts`), `DecisionAction` taxonomia fechada (`CREATE_PAGE`, `MERGE_PAGES`, `REFRESH_CONTENT`...), `status: pending → approved`; `Opportunity.status → "approved"` |
| **5. Produzir** | Um agente real executa a ação aprovada, gerando a página | `Action{decisionId, agentRunId}`, `AgentRun` (etapas reais via `checkpoint.lastCompletedSequence`), `Opportunity.status → "generating"`, `Page.status: "draft"` |
| **6. Revisar** | A página passa por um portão de qualidade real | `Page.status: "draft" → "quality_rejected" \| "ready"`, artefatos reais do pipeline (Research/Outline/Draft/SEO/GEO/Quality) |
| **7. Publicar** | A página vai ao ar; a Oportunidade se fecha | `POST /api/pages/:id/publish` (`publishPageAction` — gera JSON-LD, links internos, marca a Oportunidade), `Page.status → "published"`, `Opportunity.status → "published"` |
| **8. Medir** | O resultado real é medido; isso gera sinal novo, fechando o loop | `Outcome` (métrica/valor/baseline/delta reais), `Opportunity.status → "monitoring"`, `POST /api/v1/search-console/properties/:id/detect-signals` — **este endpoint já existe e já é, literalmente, "Medir → Observar de novo"** |

O loop já existe no backend. Ele nunca apareceu como loop em nenhuma tela. É isso que Mission Control precisa mostrar.

## B. OBJECT MODEL — o que existe em cada etapa

| Etapa | Objetos reais presentes |
|---|---|
| Observar | `Signal`, propriedade de Search Console importada |
| Entender | `Observation`, `Entity` (com subtipos Mercado/Papel via `entityType`), relações reais entre entidades |
| Descobrir | `Opportunity`; gaps reais ainda sem view própria: `Query`, `Trend` (mesmo gap identificado desde a Fase 2, não resolvido aqui) |
| Decidir | `Decision` |
| Produzir | `Action`, `AgentRun`, `Page` (rascunho) |
| Revisar | `Page` (com artefatos de conteúdo reais) |
| Publicar | `Page` (publicada) |
| Medir | `Outcome` |

Nenhum objeto é exclusivo de uma etapa — uma `Opportunity`, por exemplo, existe fisicamente da etapa 3 até a 8, só muda de `status`. O Object Model (Ontology) não é substituído pelo Production Flow — é a estrutura de dado que o flow anima. Mantido de todas as versões anteriores, sem alteração de schema.

## C. STATE MODEL — como um objeto se move pelo fluxo

Um objeto real tem, a qualquer momento, uma posição única e observável no loop — o próprio `status` real dele:

```
Opportunity.status:  discovered → qualified → approved → generating → published → monitoring
                                                    ↘ rejected          ↘ stale/merged
Decision.status:                         pending → approved → executed
                                                  ↘ rejected/expired/cancelled
Page.status:                                              draft → quality_rejected
                                                                 ↘ ready → published
```

Três máquinas de estado reais, não uma — aninhadas: `Decision` nasce dentro da etapa 4 de uma `Opportunity`; `Page` nasce dentro da etapa 5. Mission Control não precisa inventar um estado novo — precisa mostrar, para o objeto em foco, em qual das três máquinas ele está agora e o que isso significa na etapa correspondente do loop.

## D. HUMAN / AGENT MODEL

| Etapa | Automático ou humano? | Real |
|---|---|---|
| Observar / Entender | Automático | Detecção de sinal e clusterização em observação não pedem aprovação |
| Descobrir | Automático | Pontuação da Oportunidade é calculada, não decidida por humano |
| Decidir | **Humano, obrigatório** | `PATCH /api/v1/intelligence/decisions/:id { status: "approved" }` — o princípio já vigente no produto: "a decisão está pendente, não aprovada — o executor de ações nunca despacha uma ação para uma decisão que um humano ainda não aprovou" |
| Produzir | Agente, só após aprovação humana | `AgentRun` só inicia depois que a `Decision` correspondente está `approved` |
| Revisar | Automático (portão de qualidade) | `Page.status` decidido por score real, sem humano no caminho crítico |
| Publicar | Agente ou humano | `publishPageAction` é chamado tanto por um passo de workflow/agente (`lib/workflow/step-worker.ts`, `lib/agent/tool-runner.ts`) quanto manualmente — os dois caminhos reais existem hoje |
| Medir | Automático | `Outcome` é medição, não decisão |

O único ponto de bloqueio humano real e obrigatório no loop inteiro é a etapa 4. Mission Control precisa deixar isso visualmente óbvio — não como "1 decisão pendente" solto, mas como o único portão real que humano precisa abrir para o loop continuar.

## E. SCREEN ARCHITECTURE — 1440px

Uma espinha de fluxo horizontal, sempre visível, no topo da tela, com as 8 estações reais (Observar · Entender · Descobrir · Decidir · Produzir · Revisar · Publicar · Medir) — cada estação mostra sua contagem real agora (ex. "34 sinais", "3 aguardando decisão", "4 em produção"), nunca inventada, e um estado honestamente vazio quando zero. A etapa 8 (Medir) se conecta de volta à etapa 1 (Observar) por uma linha de retorno real e visível — o loop precisa estar fisicamente fechado na tela, não implícito.

O objeto real que está em movimento agora pela linha (o mesmo objeto de maior prioridade real que orientava o foco nas versões anteriores) aparece como um marcador sobre a estação em que está — não uma seção separada. Clicar nesse marcador expande, logo abaixo da espinha, a jornada real dele até aqui (ex.: "Oportunidade → Decisão aguardando aprovação → Agente ainda não iniciado"), no mesmo espírito do exemplo do briefing, sem uma seção rotulada "Agentes em ação" à parte — o agente aparece dentro da própria estação Produzir, como o estado real dela.

O grafo/relações (Object Inspector, evidências, propriedades) vira uma visão secundária e contextual: só abre quando o usuário aprofunda um objeto específico a partir do seu marcador na espinha — nunca a composição default da tela.

## F. MOBILE 390

A mesma espinha, rotacionada para vertical — 8 estações de cima para baixo, mesmas contagens reais, mesma linha de retorno da etapa 8 à etapa 1 (representada por uma seta de retorno visível ligando o fim ao início, não removida por falta de espaço). O objeto em movimento aparece como o mesmo marcador, na mesma estação, expansível no lugar. Nenhuma estação é ocultada para economizar espaço — o loop precisa continuar legível como loop mesmo comprimido.

## G. INTERACTION MODEL

Clicar numa estação abre a lista real de itens que estão nela agora (reaproveitando o primitivo de linha já existente no produto). Clicar num item específico dessa lista abre o contexto completo dele — propriedades, relações, evidências, ações — como uma extensão no lugar, nunca uma página nova. O grafo, quando fizer sentido, é alcançável a partir desse contexto, nunca o ponto de entrada. Aprovar uma decisão a partir da estação Decidir usa exatamente os mesmos endpoints já implementados (`PATCH` + `execute`) — nenhuma mudança de backend.

---

## Critério de sucesso, verificado antes de entregar

Olhando só para a descrição acima (sem ainda ter desenhado): dá para responder, na ordem, Input → Intelligence → Opportunity → Decision → Production → Review → Publish → Measure → Loop, sem grafo, sem relatório, sem abrir um card? Sim — as 8 estações da espinha são exatamente essa sequência, na ordem, com o loop fechado de volta ao início. Esse é o teste que este documento precisa passar antes de eu desenhar qualquer coisa.

Próximo passo: aguardar aprovação deste modelo antes de propor qualquer mockup visual.
