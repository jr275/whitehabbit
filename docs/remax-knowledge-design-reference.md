# RE/MAX Knowledge — Referência de Design (Fase A/B)

Status: documento de planejamento, produzido antes de qualquer alteração de código desta rodada, conforme a regra explícita "PRIMEIRO: NÃO CODE".

## Nota sobre o acesso à referência

`https://remaxmenlo.vercel.app` está bloqueado pelo proxy de rede deste ambiente — confirmado via `WebFetch` (`EGRESS_BLOCKED`) e via `curl` direto (`CONNECT tunnel failed, response 403`), o mesmo bloqueio já documentado na Fase 1 para `palantir.com`/`tryvizup.com`. O usuário then colou **6 screenshots reais** do produto diretamente nesta conversa, cobrindo 5 telas distintas:

1. **Inspetor de imóvel + grafo urbano** (rota provável "Grafo urbano") — vista padrão de um objeto real (`Apartamento Moema`) com seu recorte de grafo e o painel de detalhe lado a lado.
2. **RE/MAX Relações** — o explorador de Knowledge Graph completo (28 entidades, 29 relações), com filtro por tipo, Path Finder e um subgrafo denso.
3. **Expansão** ("Motor de expansão semântica") — pipeline de processamento de um novo cenário de entrada.
4. **AI Content Factory** — produção de conteúdo em massa a partir do grafo.
5. **Data Hub** — arquitetura de integração de fontes, saúde da plataforma, resolução de entidades, schema browser.

Esta análise é fundamentada nos pixels reais desses 6 screenshots — nunca em suposição. Onde uma afirmação depende de conhecimento geral (Palantir Ontology) ou do screenshot já usado na Fase 1 (Vizup), isso é dito explicitamente.

---

## 1. DESIGN PRINCIPLES (o que importar)

1. **Um único acento cromático, usado com disciplina total.** RE/MAX usa vermelho da marca exclusivamente para: CTA primário, nó selecionado no grafo, aresta do caminho ativo, badge de pontuação, barra de progresso, status "processando/pronto". Nunca decoração, nunca gradiente. Nós/estados neutros permanecem no mesmo azul-marinho escuro do fundo, distinguidos apenas por borda. **Nosso produto já tem essa base** (`--primary` é um azul saturado único sobre fundo `oklch(0.16 0.012 264)`, quase navy) — o princípio a importar não é a cor vermelha em si (isso seria copiar, o que foi explicitamente proibido), é a **disciplina de um único acento** aplicada com o mesmo rigor.
2. **Tipografia editorial em duas camadas: serifada para título do objeto/headline, sem serifa para UI/corpo.** "Apartamento Moema", "Motor de expansão semântica", "AI Content Factory" e os títulos dos ativos gerados usam uma serifada elegante — não é decoração, é o que torna a interface "publicação de inteligência" em vez de "software". Esse é o sinal visual mais forte e mais ausente no nosso produto hoje.
3. **Toda pontuação/score vem acompanhada de uma explicação em prosa real** ("Leitura explicável", "IA explicável"): nunca um número solto. O texto explica os fatores reais que compõem aquele número (proximidade, diversidade de conexões, centralidade). Esse é o princípio mais importante de todos para o objetivo "Ontology, não dashboard" — é isso que transforma um número em uma alegação sustentada por raciocínio, não uma métrica.
4. **O grafo é o ponto de entrada padrão para inspecionar um objeto**, não uma tela separada de "explorar". O layout de duas colunas — grafo à esquerda, ficha do objeto à direita, mesma altura, sem sobreposição — é a composição default, não uma opção secundária.
5. **O painel de detalhe é ancorado (docked), nunca um modal com fundo escurecido.** Não há dimming/backdrop em nenhum dos 6 screenshots — o painel de objeto é permanentemente parte do layout, lado a lado com o grafo, dando a sensação de "estou dentro do workspace", não "abri uma caixa de diálogo por cima dele".
6. **Nó do grafo carrega badge de pontuação circular sobrepondo o canto do retângulo**, não um número solto abaixo do nome. É um tratamento visual de identidade, reconhecível à distância.
7. **Aresta ativa ganha tratamento visual diferente de aresta neutra**: tracejado vermelho grosso para o caminho selecionado/relevante vs. linha cinza fina neutra para o resto — mesmo princípio de foco real que já tínhamos desenhado na Fase 3, mas confirmado aqui com um padrão visual concreto (tracejado, não apenas opacidade).
8. **Relação no grafo é rotulada na própria aresta** ("contém", "próximo a", "servido por", "integra com") — pill branco pequeno sentado sobre a linha, nunca uma legenda separada.
9. **Linha de relação no painel de detalhe é bicamada**: rótulo em negrito na primeira linha, valor em cinza na segunda — nunca uma única linha "rótulo · valor · badge". Mais legível, mais "ficha", menos "log".
10. **Pipeline/processo real é uma grade de etapas com status individual** (ícone de check + nome + status textual "Concluído e validado"/"Processando"), acompanhada de uma barra de progresso e controles de velocidade/execução — não uma barra fina de progresso genérica. Esse padrão se repete IDENTICAMENTE em pelo menos 3 telas diferentes (Expansão, Content Factory, Data Hub) — é um primitive real e deliberado, não um componente único.
11. **Listas numéricas densas usam linhas divididas por um traço fino, nunca cards individuais** ("Produção ao vivo": rótulo à esquerda, número grande à direita, `divide-y`, sem borda por item). Onde números aparecem em grade (Content Factory: Artigos/Landing pages/FAQs...), os cards são propositalmente quietos — sem ícone, sem fundo colorido, apenas rótulo + número.
12. **Diagramas de arquitetura do próprio sistema aparecem como UI real** (Data Hub: "Fontes externas → Data Hub → Knowledge Graph → experiências", com setas reais) — reforça a sensação de "sistema operando", não "relatório sobre dados".
13. **Um utilitário de navegação espacial ganha sua própria UI dedicada quando é um recurso real** (Path Finder: dois selects + resultado do caminho como breadcrumb) — nunca escondido dentro de um menu genérico.
14. **Explorador de esquema/ontologia como superfície própria** (Schema Explorer no Data Hub: tipos expansíveis com campos como pills) — o vocabulário do sistema é literalmente navegável.
15. **Estado do sistema (saúde, cobertura, observabilidade) é mostrado com barras de progresso finas por métrica**, não KPI tiles genéricos — cada barra rotulada, valor à direita, sem decoração.

## 2. INFORMATION ARCHITECTURE

- **Navegação global**: uma única fileira de ~14 links de texto direto (Grafo urbano, Relações, Expansão, Content Factory, Data Hub, AI Search, Agent Studio, Mission Control, Graph Studio, Developers, Experiências, Imóvel, Guia de Moema, Mercado) + um CTA vermelho isolado à direita ("Ver imóvel →"). **Nenhum dropdown agrupado** — cada seção real do produto tem seu próprio link de primeiro nível. Isso é estruturalmente diferente do nosso `TopNav` atual (grupos "Workspace/Conhecimento/Construir/Conectar/Observar" com dropdown) — uma diferença real e visível em toda tela.
- **Objetos**: um Imóvel é o objeto raiz mais visível, mas o grafo trata Bairro, Parque, Aeroporto, Metrô, Escola, Universidade, Hotel, Distrito, Rua etc. como cidadãos de primeira classe iguais — cada um com seu próprio tipo, pontuação de relevância e conexões, nunca "metadado" de outro objeto.
- **Entidades e relacionamentos**: tipos são filtráveis por uma lista de pills que cobre todo o vocabulário real do domínio (22 tipos visíveis) — a navegação por tipo é uma feature de primeira classe da tela de Relações, não uma busca de texto genérica.
- **Detalhe/contexto**: cada objeto selecionado mostra, na mesma tela, sem navegação adicional: tipo, pontuação/relevância real, contagem de conexões, um parágrafo de contexto real (frase gerada, não um campo vazio), e a leitura explicável do porquê da pontuação.
- **Ações**: por objeto, um único CTA direto e específico ("Abrir página da entidade →" / "Ver imóvel →" / "Resolver entidade" / "Executar cenário") — nunca uma lista de ações genéricas fora de contexto.
- **Pipeline/processo como IA própria**: "Expansão", "Content Factory" e "Data Hub" tratam um PROCESSO (não um objeto de domínio) como a unidade central da tela — cada uma tem sua própria barra de progresso, suas próprias etapas, seu próprio "próximo cenário".

## 3. VISUAL LANGUAGE

- **Grid/composição**: sempre 2 ou 3 colunas — [canvas/conteúdo principal largo] + [painel de contexto estreito à direita], por vezes com um terceiro rail à esquerda (filtros/módulos). Nunca uma coluna única centralizada com respiro generoso.
- **Espaçamento**: denso — padding de card ~16-20px, não 24-32px. Gap entre elementos pequeno (8-12px), nunca `gap-6`/`gap-8` generoso.
- **Tipografia**: serifada de display (títulos de objeto, headlines de seção) + sans-serif limpa para UI/corpo + rótulos em caixa alta letter-spaced pequenos (TIPO, RELEVÂNCIA, CONEXÕES, MÓDULOS) — o mesmo princípio "mono/caixa-alta para metadado" que já tínhamos adotado nas fases anteriores, confirmado aqui.
- **Densidade**: alta — a tela de Relações mostra ~28 nós simultâneos legíveis; o Data Hub mostra 8+ seções reais em uma única viewport sem scroll excessivo.
- **Bordas**: finas, baixo contraste, cor única — nunca múltiplas espessuras/cores de borda na mesma tela.
- **Superfícies**: fundo quase-preto uniforme; cards e painéis usam um tom de navy ligeiramente mais claro que o fundo — nunca branco, nunca glassmorphism, nunca sombra grande. A distinção card-vs-fundo é sutil (diferença de luminosidade pequena), não uma borda pesada.
- **Painéis**: sempre ancorados na página, nunca flutuantes com sombra grande — parecem parte da estrutura, não uma camada sobreposta.
- **Tabelas/listas**: linhas divididas por traço fino (`divide-y`), nunca card por linha.
- **Overlays**: não usados para o Inspector — confirmado nos 6 screenshots, o padrão de "modal com fundo escurecido" não aparece nenhuma vez.
- **Inspectors**: painel de ficha densa — cabeçalho com badge de tipo + pontuação grande, corpo com metadados, seção de relações em linhas bicamadas, seção de leitura explicável, CTA final.
- **Mapas/grafos**: fundo com grade pontilhada sutil, nós retangulares com cantos levemente arredondados, aresta com label sentado na própria linha, foco expresso por cor + espessura + estilo de traço (sólido vs. tracejado), nunca por escala/zoom isolado.
- **Estados**: "Concluído e validado" / "Processando" / "Pronto para publicar" / "Saudável" — sempre texto real explicando o estado, nunca apenas uma cor sem rótulo.
- **Hierarquia**: conseguida por tipografia (serifada grande vs. caixa-alta pequena) e por posição (canvas largo vs. rail estreito), quase nunca por cor de fundo ou sombra.

## 4. WHAT WE ARE DOING WRONG (auditoria brutal, ≥20 itens reais)

Comparando com o Mission Control produzido na Fase 5 (o estado atual antes desta rodada):

1. **Nenhuma tipografia serifada em lugar nenhum do produto** — tudo é Geist Sans. O título de um objeto no nosso Inspector ("Rivertown Consulting: visão geral") tem exatamente o mesmo peso visual que um rótulo de botão. Isso sozinho já faz a interface ler como "app", não "publicação de inteligência".
2. **Nenhum score vem acompanhado de explicação em prosa.** `Score`/`ScoreBreakdown` mostram só o número. Não existe, em lugar nenhum do produto, um texto real dizendo por que um score é o que é.
3. **O Object Inspector é um modal com `bg-black/50` escurecendo o fundo** — exatamente o padrão que a referência evita em toda tela. Isso lê como "abri uma caixa de diálogo", nunca "estou dentro do sistema".
4. **O score no nó do grafo é texto solto** (`pontuação 82`), não um badge circular reconhecível — perde a assinatura visual mais forte da referência.
5. **A navegação global usa dropdowns agrupados** (Workspace/Conhecimento/Construir/Conectar/Observar) em vez de uma fileira flat de links diretos — mais "app SaaS com IA de produto", menos "sistema com seções nomeadas".
6. **Relações no Inspector são uma única linha** (`rótulo · valor · badge`) em vez de duas linhas (rótulo em negrito, valor abaixo) — menos legível, mais "log de debug".
7. **Nenhum diagrama de arquitetura do próprio sistema é mostrado ao usuário** — o produto nunca se explica visualmente como um sistema operando (fontes → processamento → publicação).
8. **"Agentes em ação" no Mission Control é uma lista plana de 2 linhas**, sem o tratamento de grade de etapas com status que a referência usa consistentemente para qualquer processo real.
9. **Nenhuma superfície equivalente ao "Path Finder"** — não existe um utilitário real e dedicado para "encontrar o caminho entre dois objetos", mesmo tendo o grafo real para sustentar isso.
10. **Nenhum Schema Explorer** — o vocabulário real de tipos/propriedades do domínio nunca é exposto como uma superfície navegável própria.
11. **Cards ainda aparecem em contextos onde a referência usaria uma lista com `divide-y`** (ex. a lista "Sinais ativos" tem um card externo, mas isso é aceitável — o ponto real é onde ainda sobra padding/borda desnecessária em blocos menores).
12. **O acento cromático não é usado com disciplina total** — algumas superfícies usam `--warn`/`--destructive`/`--grow` livremente para qualquer estado, diluindo o "isto é o que importa agora" que um único acento comunica.
13. **Nenhum estado do sistema usa barra de progresso fina por métrica** (o padrão "Platform Health" do Data Hub) — nossos números de estado são estáticos, sem indicação visual de proximidade a um limite/meta.
14. **A ficha do objeto não tem um cabeçalho com pontuação grande no canto**, como a referência faz consistentemente (94 no canto superior direito do painel) — nosso layout intercala tipo/nome/status na mesma linha mas não dá à pontuação o mesmo destaque visual.
15. **Nenhuma seção "contexto" em prosa real no Inspector** — a referência sempre inclui uma frase gerada explicando por que aquele objeto importa no grafo local; nós só mostramos campos estruturados.
16. **O grafo do nosso Campo de Inteligência não mostra contagem de conexões como parte do "cartão de identidade" do nó de forma tão proeminente quanto a referência** (a referência mostra "2 conexões" com destaque tipográfico próprio).
17. **Painel do Inspector some completamente da tela quando fechado** (drawer) — a referência mantém o grafo e o painel sempre juntos, nunca um estado "grafo sozinho, sem contexto".
18. **Não existe um equivalente a "Entity Resolution" visível ao usuário** — mesmo tendo `entity_merge_candidates` real no domínio, não há tela nenhuma mostrando "dois registros parecidos, aqui está a similaridade, resolva".
19. **A cor de fundo do canvas do grafo é idêntica à cor de fundo da página** — a referência usa uma grade pontilhada sutil para dar textura espacial ao canvas sem depender de cor.
20. **O produto nunca mostra "impacto projetado" de uma ação antes de o usuário confirmá-la** (o padrão "Impacto projetado: Entidades +5, Relações +9..." do Expansão) — nossas ações mostram custo estimado, mas não o efeito real esperado nos números do sistema.
21. **Onde a referência usa `1x/10x/100x/1000x` como controle real de simulação de escala, nós não temos equivalente** — não crítico para `/mission`, mas registrado como gap real do Content Factory (fora de escopo desta fase).
22. **Os rótulos de tipo/relacionamento no nosso grafo não têm o mesmo contraste tipográfico da referência** (CAIXA-ALTA pequena e discreta vs. nome grande em negrito) — no nosso nó atual o rótulo do tipo e o nome competem em peso visual parecido.

## 5. TRANSLATION TO OUR PRODUCT

| Princípio da referência | Como se aplica ao nosso domínio real |
|---|---|
| Objeto raiz com pontuação grande no cabeçalho | `Opportunity.finalScore`, `Page.qualityScore`, `Entity` (sem score próprio — herda relevância pelas conexões) exibidos como pontuação grande no cabeçalho do Object Inspector |
| Leitura explicável / IA explicável | Uma frase real construída a partir dos componentes reais já calculados: para `Opportunity`, a partir de `businessValueScore`/`sourceGroundingScore`/`entityCoverageScore`; para `Decision`, a partir de `risk`/`priority`/`confidence`/`evidenceIds.length` — nunca um texto genérico, sempre derivado dos campos reais já existentes |
| Grafo com nó = objeto, aresta = relação real, rótulo na aresta | `Entity ↔ Entity` (`entity_relationships`), `Opportunity → Market/Role/Trend` (`opportunity_graph_edges`), `Page → Opportunity` (`derived_from`) — já real, ganha o tratamento visual (badge de pontuação, aresta focada) |
| Path Finder | Um utilitário real futuro (Fase G): "de `Entity X` até `Opportunity Y`" usando os mesmos edges reais — registrado como direção, não implementado nesta fase (fora do escopo de `/mission`) |
| Schema Explorer | Os 6 Object Types reais (`Entity/Opportunity/Page/Decision/AgentRun/Observation`) e suas propriedades já mapeadas em `lib/ontology/object-resolver.ts` — candidato real a uma superfície própria em Fase G, não nesta fase |
| Pipeline em grade com status por etapa | `AgentRun`/`WorkflowRun` real (`checkpoint.lastCompletedSequence`, `status`) — usado no Mission Control para "Agentes em ação" nesta fase |
| Entity Resolution visível | `entity_merge_candidates` (já real no domínio) — candidato a Fase G, não nesta fase |
| Diagrama de arquitetura do sistema | Fora do escopo de `/mission` nesta fase — futura tela de "Observatório"/Data Hub próprio |
| Query/Trend | Ainda sem view própria no Inspector (mesmo gap identificado na Fase 2) — permanece registrado, não resolvido nesta fase |

---

## Conclusão

O gap real não é de dados nem de arquitetura — é inteiramente de linguagem visual, e a referência aponta exatamente os mesmos pontos que a Fase 1 já tinha identificado de forma mais genérica (Palantir/Vizup), agora com padrões concretos e replicáveis: tipografia serifada de identidade, explicabilidade em prosa como padrão obrigatório, badge de pontuação no nó, inspector ancorado (nunca modal), relação em duas linhas, e pipeline como grade de etapas. Esses cinco pontos guiam a reconstrução de `/mission` nesta fase.
