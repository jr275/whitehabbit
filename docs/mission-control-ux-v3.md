# Mission Control UX v3 — de "Object Detail em tela cheia" para ambiente operacional

Status: documento de planejamento. Nenhum código foi alterado para produzi-lo. Escrito antes de tocar `mission-control.tsx`, `object-inspector.tsx` ou qualquer outro componente, conforme instrução explícita da rodada.

---

## Crítica honesta do v2 (sem defender o trabalho anterior)

O v2 corrigiu o erro real do v1 — a tela deixou de ser seções desconectadas que não reagiam a nada — mas superagiu na direção oposta. `Foco` (o Object Inspector, ocupando ~65-70% da largura) + `O que está acontecendo` (um feed) não é um sistema operacional de inteligência. É um Object Inspector em tela cheia com uma lista de eventos ao lado. Três defeitos concretos, não estéticos:

1. **A pergunta que a tela responde primeiro está errada.** Ao abrir `/mission`, a primeira coisa que o usuário vê ocupando 70% da tela é "Guia para diretores financeiros em Rivertown: 66 pontos, 78% confiança, 3 relações" — o detalhe de *um* objeto específico, escolhido pelo sistema. A pergunta real de quem abre Mission Control não é "me fale sobre este objeto", é "o que está acontecendo no meu sistema agora". O v2 responde a segunda pergunta apenas em uma coluna estreita de 380px, como se fosse secundária — quando na verdade é a pergunta primária de toda a tela.
2. **`focusedObject: {type, id} | null` é um estado bom demais para o Object Inspector e pobre demais para Mission Control.** Ele descreve muito bem "que ficha estou vendo agora". Ele não descreve nada sobre o sistema como um todo — não existe, no estado da página, nenhuma representação de "quais categorias de coisa estão acontecendo", só "qual objeto está em foco" e "lista crua de eventos". Eu confundi *o modelo de estado do Inspector* com *o modelo de estado de Mission Control* — são modelos diferentes, e usei o mesmo.
3. **O feed único apagou uma informação real que já existia de forma estruturada.** `TimelineEntry` sempre teve um `type` real (`signal`/`observation`/`decision`/`action`/`outcome`) com semântica própria — um Sinal é uma leitura bruta, uma Decisão é um julgamento, uma Ação é uma execução, um Resultado é uma medição posterior. Ao fundir tudo numa lista cronológica única ordenada só por `at`, essa hierarquia de tipo desaparece visualmente: um Sinal de baixa confiança e um Resultado que prova uma hipótese ficam com o mesmo peso visual, diferenciados só por um rótulo pequeno em caixa alta no canto. Isso é exatamente o "transformar tudo em evento no feed" que a rodada aponta.

O que **não** estava errado — validado nesta rodada, mantido: a decisão "Ontology ≠ Graph" (não recolocar o grafo grande como estrutura da página), a rejeição do card "Ação Recomendada" solto, o princípio de nunca inventar dado, o `ObjectInspector` como o componente correto para "olhar profundamente um objeto" — só não como o componente correto para "ser Mission Control inteiro".

### O que foi mantido / descartado / perdido (resumo)

| | v2 | v3 |
|---|---|---|
| **Mantido** | `ObjectInspector` (identidade, leitura explicável, propriedades, relações, evidências, histórico, ações) — continua sendo *o* componente de detalhe de objeto | Reaproveitado integralmente, mas deixa de ocupar a página inteira: passa a ser o conteúdo da zona **Contexto** |
| **Mantido** | Foco automático em algo relevante quando nada foi escolhido | Reavaliado (ver §C) — mantido o princípio de "nunca uma tela vazia", descartada a forma ("abrir direto o detalhe de uma Oportunidade específica") |
| **Mantido** | `TimelineEntry` como fonte real de dado de atividade | Mantido, mas deixa de ser renderizado como lista única — volta a ser agrupado por tipo real |
| **Mantido** | Ações/Decisão como parte do objeto, nunca card solto | Mantido sem mudança |
| **Descartado** | Grid de duas zonas (`Foco` 70% + `Feed` 30%) como a arquitetura inteira da página | Substituído por três zonas + camadas de contexto (§6) |
| **Descartado** | Feed único cronológico plano | Substituído por grupos reais por tipo dentro da zona Radar |
| **Perdido** | Qualquer noção de "sistema como um todo" — nenhuma zona da tela respondia "o que mudou desde a última visita" de forma agregada e imediata | Recuperado como a primeira coisa que a tela mostra (§6, Barra de Sistema) |
| **Perdido** | Sensação de espaço/adjacência entre objetos — a lista de relações dentro do Inspector é navegável, mas não dá noção de vizinhança visual | Recuperado via a zona **Relacionados** (§6) — sem reintroduzir o grafo grande |

---

## A. Qual é o papel do Mission Control?

Mission Control é a superfície onde o estado do sistema inteiro — sinais captados, decisões pendentes, execuções em andamento, oportunidades emergindo — fica visível e categorizado o suficiente para o usuário decidir, em segundos, **para onde olhar em seguida**. Ele não guarda detalhe nenhum por si mesmo. Todo detalhe real (propriedades, relações, evidências, histórico completo de um objeto) vive no Object Inspector, que Mission Control invoca *dentro de si mesmo* — nunca navegando para outra rota, nunca abrindo por cima como modal.

## B. Diferença entre Mission Control e Object Inspector

| | Object Inspector | Mission Control |
|---|---|---|
| Unidade central | Um objeto | O sistema |
| Pergunta que resolve | "O que é isto, e o que fazer com isto?" | "O que está acontecendo, e o que merece minha atenção?" |
| Ponto de entrada | Sempre a partir de algo — uma linha de lista, um resultado de busca, um item do Radar | Direto — é a própria home do produto |
| Persistência na tela | Aparece porque algo foi selecionado | Está sempre presente; o que muda é o que está selecionado *dentro* dele |
| Relação entre os dois | É invocado *por* Mission Control | *Contém* o Object Inspector como a zona Contexto, nunca é substituído por ele |

O erro do v2 foi fazer Mission Control **ser** um Object Inspector com decoração ao redor. A relação correta é de composição: Mission Control é a casa; o Object Inspector é um cômodo dela, não a casa inteira.

## C. Qual é o estado inicial da tela?

Nem "nenhum objeto selecionado, tela em branco" nem "o sistema escolhe uma Oportunidade arbitrária e diz 'comece aqui'" — os dois errados pelo mesmo motivo: os dois tratam o estado inicial como se ele precisasse necessariamente ser sobre *um objeto*.

O estado inicial correto é o sistema respondendo, sobre si mesmo, sem que o usuário tenha escolhido nada ainda: a zona **Contexto** abre com uma **síntese real do sistema** — não um objeto, não um resumo genérico, uma composição real de `MissionSnapshot` + as contagens reais por grupo do Radar ("1 decisão pendente aguardando você", "2 execuções em andamento", "1 tendência acelerando", "1 oportunidade nova qualificada hoje"), cada linha um link direto para o item real correspondente. Isto não é decoração nem "hero card" — é a mesma leitura explicável que já usamos em score, aplicada ao sistema como um todo em vez de a um objeto. O usuário nunca vê uma tela vazia, e o sistema nunca decide por ele qual objeto merece a atenção dele — ele decide, a partir da síntese.

## D. Como o usuário descobre o que está acontecendo?

Pela zona **Radar** (§6) — não um feed cronológico único, quatro grupos reais e sempre visíveis: **Decisões pendentes**, **Execuções ativas**, **Sinais recentes**, **Oportunidades em destaque**. Cada grupo mostra sua contagem real no cabeçalho e suas 3-5 linhas mais relevantes; "ver todas" abre a lista completa daquele tipo (reaproveitando as rotas reais já existentes: `GET /api/v1/intelligence/decisions?status=pending`, `GET /api/v1/workflows?status=running`, `GET /api/v1/intelligence/timeline?types=signal`, `GET /api/v1/opportunities`). Isso resolve diretamente o teste do §3 do briefing: cada uma das sete perguntas (sistema/inteligência/objetos/oportunidades/decisões/execuções/ações) tem uma zona ou grupo real correspondente, sem precisar escanear uma lista misturada.

## E. Como ele entra em um objeto?

Clicando em qualquer linha do Radar, em qualquer relação dentro do Contexto, ou em qualquer objeto na zona Relacionados. Todos os três pontos de entrada fazem exatamente a mesma coisa: definem o objeto atual da zona **Contexto**, sem navegação de página — o Inspector recarrega no lugar. Isso é idêntico ao princípio 7 do v2 ("selecionar qualquer coisa sempre resulta na mesma ação"), só que agora a zona que recebe essa mudança não é a página inteira, é especificamente a coluna Contexto.

**Gap real identificado nesta análise, não resolvido no v2**: hoje só `TimelineEntry` do tipo `decision` resolve para um objeto real clicável (`signalTarget()` em `mission-control.tsx` só trata `entry.type === "decision"`). Mas o dado já existe para mais: todo `signal` carrega `detail.entityId` real (`lib/intelligence/timeline.ts:73`), e toda `action` carrega `detail.decisionId`/`detail.agentRunId` reais. Isso significa que, na implementação do v3, um Sinal no Radar já pode abrir a Entidade real que ele descreve, e uma Ação já pode abrir a Execução de Agente real ou a Decisão que a originou — sem inventar nenhum campo novo, só terminando de usar o que `buildIntelligenceTimeline` já retorna. `observation` (via `signalIds`, sem `entityId` direto) e `outcome` (via `actionId`, dois saltos até o sujeito) ficam como gap real e explícito, não resolvido nesta fase — não forço uma resolução sem o dado direto.

## F. Como ele navega pelas relações?

Duas formas, que já existiam separadas no v2 e passam a coexistir de propósito:
1. **Dentro do Contexto**, a lista de relações do objeto atual continua existindo (rótulo em negrito, alvo abaixo, clicável) — é a forma completa, com todas as relações reais do objeto.
2. **Na zona Relacionados** (nova, §6), as mesmas relações do objeto atual em Contexto aparecem como uma coluna espacial de vizinhos — não uma lista de texto, um objeto por linha com badge de tipo + nome + 1-2 propriedades reais mais relevantes. Clicar em um vizinho não abre uma "segunda tela": ele *se torna* o novo Contexto, e o objeto anterior é adicionado à trilha (§6, Nível de profundidade) no topo do Contexto, para o usuário voltar.

Isso é a cadeia ontológica pedida no item 8 do briefing (`Oportunidade → Mercado → Entidade → ...`) sem depender de um grafo visual: a profundidade fica visível pela trilha, a vizinhança fica visível pela coluna Relacionados.

## G. Como ele encontra evidências?

Sem mudança de mecanismo em relação ao v2 — a seção Evidências já existe dentro do Object Inspector (hoje, honestamente, quase sempre vazia nos dados reais de seed: "Nenhuma evidência real registrada ainda"). O que muda é o contexto ao redor: como o Contexto agora é uma coluna, não a página inteira, Evidências para de competir por atenção com Propriedades/Relações/Histórico pelo mesmo espaço nobre de 70% da largura — cada seção tem seu peso real dentro de uma coluna dedicada, igual já era, só que a coluna é menor e mais focada.

## H. Como ele chega a uma decisão?

Três caminhos convergentes, todos levando ao mesmo lugar — a Decisão real aparece dentro do Contexto do seu sujeito, nunca como card solto (princípio mantido do v2):
1. Direto do grupo **Decisões pendentes** do Radar → abre o Contexto já no objeto sujeito daquela decisão, com o bloco de decisão visível.
2. Pela síntese do sistema (estado inicial, §C) → mesmo destino.
3. Investigando um objeto por conta própria (Relacionados/relação) e descobrindo, dentro do Contexto dele, que existe uma decisão real pendente vinculada.

## I. Como ele executa uma ação?

Sem mudança: o bloco "Aprovar e executar" continua vivendo dentro do Contexto do objeto sujeito da decisão (`approveAndExecute()` real, PATCH + POST já implementados, mantidos). A única mudança é onde esse bloco vive fisicamente na tela — dentro da coluna Contexto, não dentro de um painel que é a página inteira.

## J. Como agentes/processos aparecem sem virar cards soltos?

Duas camadas, nunca um card autônomo "Agentes em ação":
1. **No Radar**, o grupo **Execuções ativas** lista cada `AgentRun`/`WorkflowRun` real em andamento por uma linha densa (nome do agente + etapa atual + status), igual aos outros três grupos — é uma categoria do sistema, não um destaque especial.
2. **No Contexto**, quando uma Execução de Agente específica está em foco (clicada a partir do Radar ou de uma relação), o `StageGrid` real de etapas aparece dentro do Contexto dela — exatamente como o v2 já fazia (`RunStagesStrip`), mantido sem mudança nesta camada.

---

## Nova arquitetura: três zonas, camadas de contexto, sem grafo grande

### As três zonas

```
BARRA DE SISTEMA (o que mudou desde a última visita — sempre visível, sempre no topo)
┌───────────────┬─────────────────────────────────┬───────────────────┐
│   RADAR        │           CONTEXTO              │   RELACIONADOS     │
│  (o quê)       │        (o objeto atual)         │  (vizinhança)      │
│                │                                  │                   │
│ Decisões       │  ⦿ trilha: Sistema › Sinal ›     │  objetos           │
│ pendentes (2)  │    Oportunidade                 │  conectados ao     │
│  • ...         │                                  │  objeto atual do   │
│  • ...         │  identidade + leitura explicável │  Contexto,         │
│                │  propriedades                    │  cada um           │
│ Execuções      │  evidências                      │  clicável e        │
│ ativas (2)     │  histórico                       │  substitui o       │
│  • ...         │  ações                           │  Contexto ao       │
│                │  ── decisão vinculada, se houver ──                  │
│ Sinais         │  ── etapas de execução, se houver ──                 │
│ recentes (6)   │                                  │                   │
│  • ...         │                                  │                   │
│                │                                  │                   │
│ Oportunidades  │                                  │                   │
│ em destaque(3) │                                  │                   │
│  • ...         │                                  │                   │
└───────────────┴─────────────────────────────────┴───────────────────┘
```

Isto não é "Discovery/Intelligence/Context" do exemplo do briefing copiado — é uma composição derivada do nosso próprio domínio real: Radar = os quatro grupos reais que já existem como dado (decisões/execuções/sinais/oportunidades); Contexto = o Object Inspector real, sem mudança de conteúdo; Relacionados = as relações reais do objeto em Contexto, renderizadas como coluna em vez de lista embutida.

### Camadas de contexto (Nível 1 a 7, sem trocar de página)

A pilha de níveis do briefing (Sistema → Sinal → Objeto → Relação → Evidência → Decisão → Ação) não vira sete telas nem sete seções empilhadas — vira **um único estado de navegação com pilha (trilha)**, exibido dentro do Contexto:

- **Nível 1 (Sistema)**: estado inicial de Contexto — a síntese (§C).
- **Nível 2 (Sinal)**: usuário clica um Sinal no Radar → Contexto muda para a Entidade real que aquele sinal descreve; trilha: `Sistema › Sinal · Aceleração de tendência detectada`.
- **Nível 3 (Objeto)**: o corpo do Contexto agora mostra aquele objeto completo.
- **Nível 4 (Relação)**: usuário clica um objeto na coluna Relacionados → Contexto substitui pelo novo objeto; trilha ganha um elo: `Sistema › Sinal › Entidade: Rivertown Consulting › Oportunidade: Guia para diretores financeiros`.
- **Nível 5 (Evidência)**: dentro do Contexto atual, seção Evidências (sem navegação — é uma seção, não um nível de trilha).
- **Nível 6 (Decisão)**: se o objeto atual tem uma decisão real vinculada, ela aparece no rodapé do Contexto.
- **Nível 7 (Ação)**: o botão real de aprovar/executar, no mesmo bloco.

A trilha nunca cresce por seção (Evidência/Decisão/Ação não geram elo de trilha — são partes do mesmo objeto), só por troca real de objeto em foco. Clicar em qualquer elo da trilha volta o Contexto para aquele ponto, sem perder a coluna Relacionados nem o Radar — nada na tela "recarrega como página nova". É a resposta concreta ao item 13 do briefing.

### Radar preserva o tipo real, não vira "evento genérico"

Os quatro grupos do Radar usam a mesma fonte de dado do v2 (`buildIntelligenceTimeline` + `listWorkflows` + `listOpportunities` + `listDecisions`), mas **nunca são fundidos em uma lista só**. `SignalRow`/`FeedRowItem` (mantidos como primitivo visual) deixam de alimentar uma lista cronológica plana e passam a alimentar cada grupo separadamente, na ordem real de cada tipo (decisões por prioridade real, execuções por mais recente, sinais por mais recente, oportunidades por score real). Isso devolve exatamente a distinção que o v2 apagou: um Sinal nunca aparece misturado visualmente com um Resultado ou uma Decisão — cada grupo tem seu próprio cabeçalho nomeado.

### Reavaliação do foco automático — decisão

Descartado: abrir a página direto no detalhe de uma Oportunidade específica escolhida pelo sistema. Mantido meia-vida: o sistema continua "decidindo por prioridade real" — mas o que ele decide mostrar primeiro é a **síntese do sistema** (que já é, ela mesma, ordenada pela mesma lógica de prioridade real que o v2 usava para escolher a Oportunidade — só que expressa como uma lista de "o que mais importa agora", não como um detalhe forçado de um único objeto).

### Reintrodução de espaço — escolha concreta: coluna de vizinhança, não grafo

Entre as dez alternativas listadas no briefing (relationship field, object constellation, contextual columns, split workspace, object browser, relationship rail, contextual canvas, master/detail, command-driven exploration, spatial object navigation) — a zona **Relacionados** é, na prática, uma combinação de **relationship rail** + **master/detail**: uma coluna dedicada e sempre visível às relações reais do objeto atual, que ao ser clicada substitui o master (Contexto) — sem ser um "browser" genérico nem um canvas livre. Justificativa de por que essa e não um "constellation"/canvas espacial livre: as outras opções (canvas espacial, constellation) reintroduzem exatamente o risco que já nos custou duas rodadas de bugs de colisão/overflow (posicionamento livre de nós), e o objeto real do nosso domínio já tem, no máximo, poucas dezenas de relações por objeto — uma coluna densa com `divide-y` (o padrão que a própria referência RE/MAX usa para listas numéricas, não só para o grafo) resolve a sensação de "espaço e interconexão" sem essa reintrodução de risco. Fica registrado como decisão, não como ausência de análise.

### Reference re-check: RE/MAX Knowledge, focado em organização (não estética)

Releitura do `docs/remax-knowledge-design-reference.md` com a pergunta certa desta vez — não "que fonte/cor copiar", mas "como a informação é organizada":

- A referência **nunca mistura tipos diferentes de conteúdo na mesma lista sem rótulo de tipo** — Sinal/Decisão/Execução nossos equivalem a "Fontes externas", "Processamento", "Publicação" nela: sempre em seções nomeadas próprias (Data Hub: "Fontes externas", "Saúde da plataforma", "Resolução de entidades" — três blocos, nunca fundidos).
- A composição real da referência é sempre **canvas largo + painel de contexto estreito à direita**, às vezes com um terceiro rail à esquerda de filtros/módulos — ou seja, a própria referência já é estruturalmente três zonas quando tem mais de duas coisas para mostrar ao mesmo tempo (grafo + ficha + filtro), não duas. O v2 usou duas zonas; a referência, quando a tela precisa fazer mais de uma coisa, usa três. Isso valida diretamente a mudança para três zonas nesta rodada.
- **Achado novo desta releitura**: a fileira de navegação global da referência lista "Mission Control" como um item **próprio e distinto** de "Grafo urbano" (que é a tela de objeto+grafo já analisada). Não tenho screenshot do conteúdo real dessa tela específica — não vou fabricar como ela é — mas a existência dela como rota separada confirma exatamente o ponto 2 do briefing desta rodada: a própria referência trata "ver o sistema" e "ver um objeto" como duas telas diferentes, nunca a mesma tela com nomes diferentes. É a evidência mais forte, vinda da própria referência, de que fundir os dois (o que o v2 fez) era a direção errada.
- A referência organiza processos (Expansão/Content Factory) como **grade de etapas com status individual**, nunca como "cards soltos". Nosso Radar → grupo "Execuções ativas" segue o mesmo padrão real (`StageGrid` dentro do Contexto quando a execução está em foco).
- Onde a referência perde para o que estou propondo: ela não tem, nos 6 screenshots disponíveis, uma zona equivalente ao nosso Radar (visão agregada e categorizada do sistema todo) — a tela "Mission Control" dela pode ser exatamente isso, mas não posso confirmar sem a imagem real. Registrado como suposição não verificada, não como fato.

---

## Wireframes

### 1440 / 1280 — três colunas lado a lado

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MISSION CONTROL · Central de inteligência   [Pesquisar…]                     │
│ 5 entidades · 1 página · 2 execuções · 1 pendente · 1 bloqueado · 78 qualid. │
├───────────────┬────────────────────────────────────┬─────────────────────────┤
│ RADAR          │ Sistema › Sinal › Oportunidade      │ RELACIONADOS (3)        │
│                │                                      │                         │
│ DECISÕES (1)   │ ⦿ Oportunidade                      │ ⦿ Rivertown Consulting  │
│ • Criar página │   Guia para diretores financeiros   │   Entidade              │
│   Rivertown... │   Qualificado          pontuação 66 │   direciona-se a        │
│                │                                      │                         │
│ EXECUÇÕES (2)  │ Leitura explicável:                 │ ⦿ Consultoria financ.  │
│ • Geração de   │  "78% de confiança, conectado a..." │   Mercado               │
│   conteúdo     │                                      │   direciona-se a        │
│   em execução  │ Propriedades          Evidências (0) │                         │
│ • Descoberta   │  Intenção-alvo...      Nenhuma real  │ ⦿ Diretor financeiro   │
│   de site      │  Valor de negócio...   ainda         │   Papel                 │
│   na fila      │                                      │   direciona-se a        │
│                │ Histórico                            │                         │
│ SINAIS (6)     │  Descoberta · 28/08                  │ [clicar substitui o     │
│ • Aceleração   │                                      │  Contexto ao lado]      │
│   de tendência │ ── Decisão vinculada ──              │                         │
│ • Lacuna de    │ Criar página · 81% conf · risco médio│                         │
│   entidade     │ [ Aprovar e executar → ]             │                         │
│                │                                      │                         │
│ OPORTUNIDADES  │                                      │                         │
│ EM DESTAQUE(3) │                                      │                         │
│ • Guia p/ dir. │                                      │                         │
│   financ. · 66 │                                      │                         │
└───────────────┴────────────────────────────────────┴─────────────────────────┘
```

Proporção sugerida: Radar ~260-280px fixo, Contexto flexível (o que sobrar), Relacionados ~260-280px fixo — nunca o Contexto voltando a ocupar 70% sozinho.

### 1024 — três colunas, Radar e Relacionados mais estreitos

Mesma composição, larguras reduzidas (Radar/Relacionados ~220-240px); se o conteúdo real de um grupo do Radar não couber em 3 linhas nessa largura, corta em "ver todas (N) →" — nunca esconde a categoria inteira.

### 768 — duas colunas + uma zona empilhada

Nesta largura três colunas lado a lado deixam de caber com legibilidade real. Contexto + Relacionados continuam lado a lado (é aqui que a "sensação de vizinhança" mais importa, quando o usuário já está investigando algo); Radar sobe para uma faixa horizontal **acima**, com os quatro grupos como categorias roláveis horizontalmente (chips com contagem, cada um expansível para a lista real daquele grupo) — nunca oculto atrás de um menu.

```
┌─────────────────────────────────────────────┐
│ Sistema: 5 entid · 1 pág · 2 exec · 1 pend. │
│ [Decisões 1] [Execuções 2] [Sinais 6] [Op 3]│  ← Radar horizontal
├───────────────────────┬───────────────────────┤
│ CONTEXTO               │ RELACIONADOS (3)      │
│ (mesmo conteúdo do     │ (mesmo conteúdo)      │
│  desktop, mesma ordem) │                        │
└───────────────────────┴───────────────────────┘
```

### 390 — uma coluna, ordem conceitual preservada

Sistema (faixa compacta) → Radar (grupos como acordeão real, fechado por padrão exceto o de maior prioridade real — nunca todos abertos ocupando a tela) → Contexto (conteúdo completo, mesma ordem do desktop) → Relacionados (faixa horizontal rolável de chips de objeto, não lista vertical — mantém a sensação espacial mesmo em coluna única, em vez de virar "mais uma lista"). Mesma ordem conceitual do v2 preservada (o princípio que já estava certo), mas agora com quatro blocos reais em vez de dois.

---

## Princípios de interação

1. Mission Control nunca é o detalhe de um objeto — é a visão do sistema que leva a um objeto.
2. O Object Inspector nunca desaparece como conceito nem é reconstruído do zero — é reaproveitado inteiro dentro da zona Contexto.
3. Três zonas, sempre as três, em qualquer largura — a forma como elas se dispõem muda (colunas → empilhado), a existência das três nunca muda.
4. O Radar preserva o tipo real de cada coisa — nunca funde Sinal/Decisão/Execução/Oportunidade numa lista só.
5. Nenhuma zona começa vazia: Contexto sem seleção mostra a síntese real do sistema, nunca um card em branco nem um objeto escolhido arbitrariamente.
6. Trocar de objeto nunca parece "abrir uma página nova" — o Contexto recarrega no lugar, e a trilha no topo dele mostra a profundidade percorrida.
7. Relação é navegável em dois lugares com o mesmo dado: lista completa dentro do Contexto, coluna espacial de vizinhos em Relacionados — nunca um grafo de posicionamento livre.
8. Ação e Decisão nunca são componentes soltos — vivem sempre dentro do Contexto do objeto que afetam.
9. Execução de agente aparece como uma linha no Radar (categoria) e como `StageGrid` real dentro do Contexto quando está em foco — nunca como card autônomo "Agentes em ação".
10. Nenhum dado é inventado; onde o dado real para resolver uma relação/alvo não existe ainda (observação→sujeito, resultado→sujeito), o gap fica registrado e a linha correspondente do Radar simplesmente não é clicável, honestamente, em vez de fingir um destino.
11. 100% PT-BR em toda a superfície nova — nomes de zona (Radar/Contexto/Relacionados/Trilha), grupos (Decisões pendentes/Execuções ativas/Sinais recentes/Oportunidades em destaque), rótulos, aria-labels.
12. Mobile preserva a mesma ordem conceitual das quatro zonas — nunca "empilhar tudo", cada zona vira um bloco reconhecível na mesma sequência de leitura do desktop.
13. Densidade operacional mantida do v2: sem hero, sem headline dominante, sem CTA genérico solto.
14. Backend, domínio, rotas e schema permanecem intocados — todas as rotas usadas pelo Radar já existem (`/api/v1/intelligence/decisions?status=pending`, `/api/v1/workflows?status=running`, `/api/v1/intelligence/timeline`, `/api/v1/opportunities`).

---

## Gaps reais declarados (não resolvidos nesta fase, não fabricados)

- `signalTarget()`-equivalente precisa ser estendido para resolver Sinal→Entidade e Ação→Decisão-sujeito/Execução — dado real já existe, só falta terminar de usar (§E). Vira trabalho de implementação, não uma decisão de design em aberto.
- Observação→sujeito e Resultado→sujeito direto não têm campo real de referência de um salto — ficam não-clicáveis honestamente até (se algum dia fizer sentido) o domínio ganhar esse campo. Nenhuma UI finge esse destino.
- A zona Relacionados hoje reaproveita os mesmos dados de relação que já chegam para o Object Inspector — isso implica extrair essa lista para fora do corpo do Inspector durante a implementação (mudança de composição de componente, não de dado). Registrado aqui para não ser surpresa na hora de codar.

---

Próximo passo: aguardar aprovação explícita deste documento antes de qualquer alteração de código, conforme instrução da rodada.
