# Mission Control UX v2 — reset conceitual

Status: documento de planejamento. Nenhum código foi alterado para produzi-lo. Escrito antes de tocar `mission-control.tsx` novamente, conforme instrução explícita.

## Veredito honesto sobre a v1 (sem defender o trabalho anterior)

A estrutura atual — `Header → Estado do sistema → Campo de Inteligência (grafo) → Sinais ativos / Agentes em ação → Ação recomendada` — está **conceitualmente errada**, não apenas visualmente incompleta. É uma página composta por regiões independentes que cada uma mostra sua própria fatia de dado. Selecionar um objeto no grafo abre um Inspector ao lado dele, mas **nada mais na tela reage** — Sinais, Agentes e Ação Recomendada continuam mostrando exatamente o mesmo conteúdo, sejam quais forem, independente do que está selecionado. Isso é o sintoma real do problema: a tela não tem um "objeto em foco" como conceito central. Ela tem *seções*. Cada correção que fiz nas últimas rodadas (grafo radial, header compacto, Inspector sem vazamento) melhorou a execução de um modelo que continua sendo o modelo errado. Reconstruindo a partir daqui.

---

## A. PRODUCT THESIS

Mission Control não é "a home do produto com números". É o ponto de entrada de um sistema operacional de inteligência: **um objeto real está sempre em foco**, e a tela inteira existe para responder, sobre esse objeto, cinco perguntas — o que é, por que importa, com o que se relaciona, que evidência sustenta isso, e o que fazer a respeito. Quando nada foi escolhido explicitamente pelo usuário, o próprio sistema já traz em foco o objeto mais relevante agora (a Oportunidade/Decisão de maior prioridade real) — nunca uma tela neutra de resumo. Uma segunda área, menor, mostra o que mais está acontecendo no sistema, para o usuário trocar de foco. Não existe uma terceira coisa. O grafo é uma representação de relacionamento entre as que aparecem *dentro* do foco — nunca o elemento estrutural da página.

## B. USER MENTAL MODEL

O usuário não pensa "que seção eu preciso rolar para ver". Ele pensa:
1. **O que está em foco agora?** — um objeto real, sempre.
2. **Por que ele está em foco?** — porque é o que mais importa agora, ou porque eu escolhi.
3. **O que mais existe além disso?** — uma lista real de outros objetos/eventos para trocar de foco.
4. **Ao trocar de foco, a tela toda reage** — nunca preciso procurar informação relacionada em outro lugar.

## C. OBJECT MODEL

Os objetos reais do domínio (já existentes, sem alteração de schema):

| Objeto | Fonte real | Já no Object Inspector? |
|---|---|---|
| Entidade (`Entity`) | `lib/knowledge/repo.ts` | Sim |
| Oportunidade (`Opportunity`) | `lib/opportunity/repo.ts` | Sim |
| Página (`Page`) | `lib/pages/repo.ts` | Sim |
| Decisão (`Decision`) | `lib/intelligence/decisions.ts` | Sim |
| Execução de Agente (`AgentRun`) | `lib/workflow/repo.ts` | Sim |
| Observação (`Observation`) | `lib/intelligence/observations.ts` | Sim |
| Mercado / Papel (`Market`/`Role`) | subtipos de `Entity` (`entityType`) | Via Entidade |
| Consulta (`Query`), Tendência (`Trend`) | reais no domínio, ainda sem resolver próprio no Inspector | Não — gap já identificado na Fase 2, não resolvido nesta rodada (fora de escopo: não altera backend) |

Todo objeto, em qualquer lugar da tela (lista, foco, relação), sempre se identifica pelas mesmas três coisas: **tipo + nome + estado**. Isso já existe (`ObjectTypeBadge`/`ObjectStatusBadge`) e se mantém.

## D. RELATIONSHIP MODEL

Uma relação é sempre `Objeto A --relação real--> Objeto B` (`entity_relationships`, `opportunity_graph_edges`, ou a relação implícita `Decision.subjectType/subjectId`). O v1 tratava relação como "aresta de um grafo visual". O v2 trata relação primeiro como **uma linha navegável dentro do objeto em foco** (já existe no Inspector — rótulo da relação em negrito, objeto-alvo abaixo, clicável) — o grafo visual passa a ser uma segunda forma, opcional e compacta, de ver o mesmo dado, nunca a única.

## E. CONTEXT MODEL

Existe exatamente **um estado de contexto** por vez: `focusedObject: {type, id} | null`. Quando `null`, o sistema resolve automaticamente para o objeto real de maior prioridade (o sujeito da Decision pendente de maior prioridade — o que a v1 chamava de "next action"). Trocar o contexto significa: (1) o painel de foco recarrega para o novo objeto — identidade, propriedades, leitura explicável, relações, evidências, histórico, decisão, ações; (2) a lista de "o que mais está acontecendo" permanece visível para trocar de novo; (3) nenhuma outra parte da tela existe fora dessas duas.

## F. ACTION MODEL

Uma ação nunca é um card independente. Ela é a última seção do objeto em foco — o mesmo `ObjectDetail.actions` que já existe, renderizado no rodapé do painel de foco (mantém o botão fixo/sempre visível já implementado). Quando o objeto em foco é uma Oportunidade com uma Decisão real pendente vinculada a ela, essa Decisão e suas ações aparecem *dentro* do foco daquela Oportunidade — nunca como uma segunda entidade solta na tela chamada "Ação Recomendada".

## G. INFORMATION ARCHITECTURE

Duas zonas reais, uma barra de contexto:

1. **Barra de contexto** (topo, já existe): identidade do sistema, busca universal. O "estado do sistema" (contagens reais) vira parte dessa barra, como legenda mínima — não uma zona própria.
2. **Foco** (zona dominante, ~65-70% da largura no desktop): o objeto em foco — identidade, leitura explicável, propriedades, relações (lista navegável + uma visualização compacta e opcional de vizinhança quando fizer sentido), evidências, histórico, decisão/ações. É literalmente o Object Inspector de hoje, promovido de "painel lateral de 360px" para "conteúdo principal da página".
3. **O que está acontecendo** (zona secundária, ~30-35%, ao lado no desktop / abaixo no mobile): um único feed real e unificado (sinais, observações, decisões, ações, execuções de agente, outcomes — o `TimelineEntry` que já existe, sem separar "Sinais" de "Agentes" em caixas diferentes), cada item clicável e ele muda o foco.

Sem uma terceira zona. Sem "Ação Recomendada" à parte. Sem "Campo de Inteligência" como um bloco full-width autônomo.

## H. WIREFRAME (textual, não copiado do exemplo do briefing — derivado do nosso próprio domínio)

### Desktop 1440 / 1280
```
┌───────────────────────────────────────────────────────────────────────────┐
│ MISSION CONTROL · Central de inteligência        [5 entid · 1 pág · ...]  │
│ [ Pesquisar entidades, oportunidades, páginas, decisões…            ]     │
├───────────────────────────────────────────┬─────────────────────────────┤
│ FOCO                                       │ O QUE ESTÁ ACONTECENDO      │
│ ⦿ Oportunidade · Guia para diretores...    │ • Aceleração de tendência…  │
│   Aprovação pendente          pontuação 66 │   há 20 min                 │
│                                             │ • Criar página: Oport...    │
│ Leitura explicável:                        │   há 30 min                 │
│  "Recomendada com 81% de confiança..."     │ • Execução: Geração de      │
│                                             │   conteúdo · em execução    │
│ Propriedades          Relações  (3)        │ • Ação concluída: Criar     │
│  Intenção-alvo  ...    direciona-se a      │   página · há 2h            │
│  Valor negócio  ...     Rivertown Consult. │ • ...                       │
│  ...                    direciona-se a     │                             │
│                          Mercado            │ [cada item clicável →      │
│ Evidências (0)          direciona-se a      │  muda o foco à esquerda]   │
│  Nenhuma real ainda      Papel              │                             │
│                                             │                             │
│ Histórico                                  │                             │
│  Descoberta · 28/08 12:00                  │                             │
│                                             │                             │
│ ── Decisão real vinculada ──               │                             │
│ Criar página · risco médio · 81% confiança │                             │
│ [ Aprovar e executar → ]                   │                             │
└─────────────────────────────────────────────┴─────────────────────────────┘
```
A "visualização de vizinhança" (versão pequena do grafo radial já construído) fica **dentro** do bloco Relações, opcional, compacta (algo como 100% da largura da coluna de foco por ~180px de altura) — nunca ocupando a tela inteira.

### Tablet 768
Duas zonas empilhadas (Foco em cima, largura total; O que está acontecendo embaixo, largura total) — mesmo conteúdo, mesma ordem de leitura (objeto → contexto → relação → evidência → decisão → ação primeiro, atividade lateral depois).

### Mobile 390
Mesma ordem, mesma hierarquia — Foco primeiro (identidade, leitura explicável, propriedades, relações como lista, evidências, decisão/ações), depois o feed "O que está acontecendo". A mini-visualização de vizinhança pode ocultar-se no mobile (permanece a lista de relações, que já é 100% equivalente em conteúdo) — nunca o resto do modelo mental muda.

## I. DESIGN PRINCIPLES

1. Um objeto real está sempre em foco — nunca uma tela neutra de resumo.
2. O foco é a zona dominante da página — não uma de várias seções de peso igual.
3. Toda pontuação vem com leitura explicável em prosa real (já implementado, mantido).
4. Relação é primeiro uma linha navegável; o grafo é uma representação secundária e compacta dela, nunca a estrutura da página.
5. Ação nunca é um componente independente — é a última seção do objeto em foco.
6. Existe exatamente um feed real de atividade, nunca "Sinais" e "Agentes" como caixas separadas competindo por atenção.
7. Selecionar qualquer coisa (feed, busca, relação) sempre resulta na mesma ação: o foco muda.
8. O sistema começa com o objeto de maior prioridade real já em foco — nunca espera o usuário decidir o que olhar primeiro.
9. Nenhum elemento existe "para preencher espaço" — cada bloco corresponde a uma pergunta real (o que é / por que importa / relação / evidência / decisão / ação).
10. Densidade operacional: sem headline enorme, sem hero, sem CTA genérico solto.
11. Mobile preserva a mesma ordem conceitual — nunca uma versão "resumida" do modelo mental.
12. 100% PT-BR — nenhum dado técnico cru (id interno, snake_case) aparece na UI.
13. Nenhum dado é inventado; uma seção honestamente vazia mostra um estado vazio real, nunca é omitida silenciosamente.
14. O grafo pequeno de vizinhança (quando existir) usa o mesmo layout radial já construído — não descartado, apenas remontado em escala e posição corretas.
15. Backend, domínio, APIs e dados permanecem intocados — a reconstrução é inteiramente da camada de composição visual.

## J. CURRENT → V2

| Elemento v1 | Destino no v2 |
|---|---|
| Header + busca | **Mantido** — vira a barra de contexto |
| Faixa "Estado do sistema" (linha de legenda) | **Mantido**, mas passa a viver dentro da barra de contexto, não como bloco próprio |
| "Campo de Inteligência" full-width (grafo grande) | **Removido como zona própria.** O layout radial já construído é reaproveitado em escala pequena, dentro da seção Relações do painel de Foco |
| Object Inspector docked ao lado do grafo | **Promovido** — vira o próprio painel de Foco, conteúdo principal da página, sempre visível (não só quando algo é clicado no grafo) |
| "Sinais Ativos" (caixa própria) | **Fundido** com Agentes em ação num único feed real "O que está acontecendo" |
| "Agentes em ação" / StageGrid (caixa própria) | **Fundido** no mesmo feed; o StageGrid de etapas reais de uma execução aparece dentro do Foco quando a execução em si está em foco (é um objeto como qualquer outro) |
| "Ação Recomendada" (card próprio) | **Removido como componente.** Sua decisão/ação passam a aparecer dentro do painel de Foco do objeto que ela afeta — e esse objeto é o foco *default* da página |
| `ExplainabilityNote` | **Mantido**, sem mudança de conceito |
| Badges de tipo/status, Score, densidade de propriedades | **Mantidos** sem mudança |
| pt-BR (`lib/ontology/pt-br.ts`) | **Mantido** integralmente |
| `radialPositions()` (grafo) | **Reaproveitado**, remontado como mini-grafo de vizinhança dentro do Foco |

Próximo passo: implementar exatamente esta arquitetura em `mission-control.tsx` (reescrita real, não incremental), depois QA visual em 2 ciclos.
