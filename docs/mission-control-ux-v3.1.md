# Mission Control UX v3.1 — de "três colunas" para uma superfície contínua

Status: documento de planejamento. **Nenhum código foi alterado, nenhum componente foi criado, nenhum screenshot foi gerado para produzir este documento** — conforme instrução explícita da rodada. O mockup visual do item 18 é um arquivo HTML estático separado, fora do código do produto, não conectado a `mission-control.tsx` nem a nenhuma rota real.

---

## Risco identificado, admitido antes de qualquer coisa

"Radar + Contexto + Relacionados" como três nomes de coluna é, sozinho, apenas um dashboard com nomes melhores. Os dois problemas reais do v3 que este documento resolve:

1. **Product model correto, visual composition não definida.** O v3 respondia "o que cada zona contém", nunca "como elas coexistem no mesmo plano visual". Este documento resolve isso explicitamente (§10, §11, §12-16).
2. **Radar como quatro blocos = quatro dashboards pequenos dentro de um grande.** Usar o mesmo componente de lista para Decisões/Execuções/Sinais/Oportunidades recria a sensação de KPI tiles só porque cada grupo tem uma caixa própria. Resolvido em §4 com uma linguagem visual distinta por tipo.

---

## 1. PRODUCT THESIS

Mission Control é a superfície onde o sistema inteiro fica **visualmente contínuo com o objeto que você está investigando agora** — nunca um conjunto de módulos independentes que por acaso estão na mesma página. Existe exatamente uma coisa em foco a qualquer momento (um objeto, ou — no estado inicial — o próprio sistema), e tudo o mais na tela é **periferia visualmente conectada a esse foco**, não uma seção paralela competindo por atenção. A pergunta que a tese resolve, do zero: como três coisas conceitualmente diferentes (índice do sistema, objeto em foco, vizinhança do objeto) ocupam **um único plano contínuo**, não três retângulos lado a lado.

## 2. MISSION CONTROL vs OBJECT INSPECTOR

Sem mudança de tese em relação ao v3 (validada, mantida): Mission Control contém o Object Inspector, nunca é substituído por ele. O que muda nesta versão é *como* essa contenção aparece visualmente — no v3 o Inspector era literalmente uma coluna inteira; no v3.1 ele é **o painel dominante de uma superfície conectada**, fisicamente tocando (via linhas de conexão reais, não apenas posição lado a lado) os objetos relacionados a ele, e ladeado por um índice periférico que nunca ganha um contêiner próprio com borda e sombra — só o objeto em foco e seus vizinhos imediatos merecem esse peso visual.

## 3. INITIAL SYSTEM STATE

**"Agora"** — uma única linha densa, sem caixas, sem ícones decorativos, sem cor de fundo — funcionando como **índice de navegação**, nunca como KPI:

```
AGORA   2 decisões aguardando você · 3 agentes executando · 5 sinais detectados · 4 oportunidades emergentes
```

Cada segmento é clicável e filtra/expande o grupo correspondente do Radar abaixo — nunca um número solto, sempre uma contagem real ligada à lista real que a sustenta (mesmas rotas já mapeadas no v3: `GET /api/v1/intelligence/decisions?status=pending`, `GET /api/v1/workflows?status=running`, `GET /api/v1/intelligence/timeline?types=signal`, `GET /api/v1/opportunities`). Abaixo dessa linha, o Radar aparece já expandido nos quatro grupos (§4) — "atividade contextual real", nunca uma segunda linha de números. O painel de Contexto, no estado inicial, mostra a mesma sensação: uma leitura em prosa real da prioridade agregada ("A decisão mais urgente agora é aprovar 'Criar página' para Rivertown — 81% de confiança, risco médio"), com um link direto para abrir aquele objeto — nunca abre ele sozinho, é uma sugestão textual clicável, não uma escolha automática.

## 4. RADAR MODEL — quatro linguagens visuais, nunca um grid de cards

Nenhum grupo usa um "card". Todos são linhas densas dentro de um índice contínuo, `divide-y`, sem borda externa própria — mas cada tipo tem sua **própria representação**, nunca o mesmo componente reaproveitado:

| Grupo | Representação | Por quê essa forma |
|---|---|---|
| **Decisões pendentes** | Linha compacta: ponto de urgência real (cor única do sistema) + nome real do objeto-sujeito + rótulo "aguardando" em caixa alta pequena. Sem barra, sem ícone extra. | Uma decisão é binária no seu estado — pendente ou não — não precisa de uma representação temporal nem de progresso; a urgência já está no fato de estar na lista. |
| **Execuções ativas** | Linha com um **indicador de etapas real** embutido — pontos/traços preenchidos até a etapa atual, na contagem real de `checkpoint.lastCompletedSequence`/etapas totais do `AgentRun` (o mesmo dado que já alimenta `StageGrid`, só que em miniatura, inline, sem grade própria). | Uma execução é um processo com progresso real mensurável — merece uma representação de atividade, não uma linha estática. |
| **Sinais recentes** | Uma **faixa de pulso temporal**: um eixo horizontal curto (últimas horas), marcas verticais finas posicionadas pela `at` real de cada sinal — densidade de marcas comunica volume à primeira vista; clicar numa marca abre o sinal. | Um sinal é definido pelo *quando*, não por um estado — a representação certa é temporal, não uma lista de texto. |
| **Oportunidades em destaque** | Linha de identidade de objeto padrão (mesmo tratamento usado em Contexto/Relacionados/Trilha — ver §11): tipo + nome real + um **arco de pontuação pequeno** (não o número solto) ao lado. | Uma Oportunidade já é um objeto de primeira classe com pontuação real — usa a mesma linguagem de identidade do resto do sistema, só compacta. |

Nenhum desses quatro tem fundo próprio, sombra, ou borda individual — a distinção entre eles é só o cabeçalho do grupo (rótulo + contagem real) e a representação interna. Isso é o que evita "quatro dashboards pequenos": eles compartilham o mesmo container flat do Radar, só a forma de cada linha muda.

## 5. CONTEXT MODEL

Sem mudança de conteúdo em relação ao v3 (identidade, leitura explicável, propriedades, evidências, histórico, ações — tudo real, tudo mantido). A mudança é de moldura: o painel de Contexto ganha um tratamento visual explicitamente mais "denso e central" do que qualquer coisa ao redor — é a única superfície com `bg-card` + borda de página inteira na composição (junto dos painéis de Relacionados, §6) — nunca compete visualmente com o Radar, que fica deliberadamente mais "achatado" (sem essa superfície). Isso concretiza, visualmente, "o Contexto se aprofunda" (item 8 do briefing): quando nada está selecionado, não existe painel de Contexto elevado nenhum, só a linha "Agora" (§3); no momento em que um objeto é selecionado, **o painel de Contexto nasce/aparece com essa superfície elevada**, e é isso — não uma navegação de página — que comunica "o ambiente se reorganizou ao redor daquele objeto".

## 6. RELATIONSHIP MODEL — painéis conectados, não sidebar

Relacionados deixa de ser uma coluna com uma lista de texto. Passa a ser um conjunto de **2 a 4 painéis pequenos**, com a mesma superfície elevada do Contexto (`bg-card` + borda), posicionados ao lado/abaixo dele e **fisicamente ligados a ele por uma linha de conexão fina real**, com a frase de relação real (`direciona-se a`, `materializes`, `targets`, `operates_on` traduzidas) sentada sobre essa linha como um rótulo pequeno — o mesmo princípio que a referência RE/MAX usa em arestas de grafo, aplicado a um layout de painéis fixos, não a posicionamento livre de nós (decisão já justificada no v3, mantida: risco de colisão/overflow já pago duas vezes).

Cada painel de Relacionado mostra: tipo + nome real (mesma identidade de objeto do resto do sistema) +, quando o espaço permitir, uma propriedade real de maior peso (ex. pontuação, se o vizinho for uma Oportunidade). Isso resolve diretamente o pedido "o usuário precisa entender *por que* esses objetos estão relacionados" — a frase real da relação não é uma legenda cinza pequena dentro do painel, é o rótulo visível na própria linha de conexão, no mesmo nível de destaque que a referência dá a rótulos de aresta.

Clicar em um painel de Relacionado: ele **se torna** o novo Contexto (troca de lugar visualmente — o painel clicado ganha a posição central, o antigo Contexto se torna um dos painéis conectados ou entra na Trilha, ver §7) — nunca abre uma segunda tela.

## 7. OBJECT TRAIL — pilha de profundidade, não breadcrumb

Um breadcrumb tradicional é texto puro e sem estado próprio. A Trilha de Profundidade é diferente: cada nível já visitado vira uma **tira colapsada** (só a identidade do objeto — tipo + nome, uma linha, sem o corpo) empilhada **acima** do painel de Contexto ativo, na ordem em que foi visitado (mais recente mais perto do topo do Contexto). Três propriedades que a diferenciam de um breadcrumb:

1. **Cada tira mantém o tratamento visual de identidade do seu tipo real** (não vira texto genérico cinza) — dá para reconhecer "isso era uma Oportunidade, isso era um Sinal" só pela tira, sem clicar.
2. **Clicar numa tira não "volta"** no sentido de navegação — ela **se expande** no lugar, empurrando o Contexto atual para baixo dela como uma nova tira colapsada. É uma troca de posição dentro da mesma pilha, nunca uma transição de página.
3. **Cada tira, ao colapsar, preserva o estado de leitura daquele nível** (scroll interno, aba de evidências aberta) — reabrir não reseta.

```
Sistema                                    ← tira colapsada (nível 1)
  Sinal · Aceleração de tendência detectada ← tira colapsada (nível 2)
  Oportunidade · Guia para diretores...     ← tira colapsada (nível 3)
┌─────────────────────────────────────────┐
│ Mercado · Consultoria financeira em      │  ← CONTEXTO ATIVO (nível 4)
│ Rivertown                                │
│ ...conteúdo completo do objeto...        │
└─────────────────────────────────────────┘
```

## 8. ACTION MODEL — honesto sobre o que já é real hoje

Ações vivem sempre dentro do painel de Contexto do objeto a que pertencem (mantido do v3). Nível de detalhe pedido nesta rodada, verificado contra `lib/ontology/object-resolver.ts` e as rotas reais — três categorias, para não fabricar nada:

| Objeto | Ação(ões) real(is) hoje, já implementada(s) | Extensão real proposta (endpoint já existe, falta compor no Mission Control) | Pedida no briefing, **sem endpoint real hoje — gap declarado, fora de escopo** |
|---|---|---|---|
| Oportunidade | "Gerar página real" (quando elegível) / "Ver página real" (quando já existe) | — | "Investigar" não é uma ação de backend — é navegação (abrir o objeto no Contexto), sempre disponível, não fabricada. "Revisar"/"Ignorar" pedem um endpoint de revisão/descarte que não existe — registrado, não implementado |
| Decisão | "Aprovar e executar" (`PATCH status=approved` + `POST execute`, já real) | "Rejeitar" — `PATCH /api/v1/intelligence/decisions/:id { status: "rejected" }` **já existe e já é usado pelo backend**, só não está exposto como botão no Mission Control hoje. Extensão real e pequena. | "Investigar" = mesma navegação genérica acima |
| Página | "Ver publicada" / "Abrir detalhe da página" | "Publicar" — `POST /api/pages/:id/publish` **já existe** para uma página com `status: "ready"`; hoje o Mission Control só linka para o detalhe, não chama publish direto. Extensão real. | "Editar"/"Gerar novamente" pedem rotas que não existem hoje — gap declarado |

Hierarquia visual (ver §11): no máximo uma ação primária (botão sólido) + uma secundária (texto/ghost) visíveis por objeto — nunca uma lista de botões.

## 9. EVIDENCE MODEL

Já real, já estruturado exatamente como pedido — `ObjectEvidenceItem { fact, source, sourceUrl, confidence, verificationStatus }` (`lib/ontology/object-resolver.ts:42`). O v3.1 não muda o dado, muda a apresentação para deixar a cadeia explícita: **Afirmação** (`fact`, quando existir) → **Fonte** (`source`/`sourceUrl`, link real) → **Confiança** (`confidence`, número real) → **Objeto relacionado** (o próprio objeto em Contexto, já implícito pela seção estar dentro dele). Quando `evidence.length === 0` (caso real e comum nos dados de seed hoje), o estado mostra honestamente "Nenhuma evidência real registrada ainda" — sem inventar. Nenhuma mudança de escopo além de apresentação.

## 10. SPATIAL MODEL — por que painéis conectados, não grafo, para Mission Control especificamente

A pergunta certa não é "grafo sim ou não" em abstrato — é "qual representação espacial serve à *função* de Mission Control". Um grafo é a ferramenta certa quando a tarefa é **entender a forma de uma estrutura densa e muitos-para-muitos** — é exatamente para isso que este produto já tem uma tela dedicada, real, existente: `/intelligence/map`. Mission Control tem uma função diferente: está sempre ancorado em **um** objeto por vez, com uma vizinhança real pequena (a maioria dos objetos deste domínio tem entre 1 e 5 relações diretas, pelos dados reais de seed já vistos nas rodadas anteriores) — aqui, legibilidade total de cada rótulo em qualquer momento importa mais que revelar a forma global do grafo, que um grafo nunca garante em conjunto com espaço reduzido. Painéis conectados (§6) entregam: 100% de legibilidade de nome e da frase de relação, zero risco de colisão/sobreposição (já pago duas vezes com posicionamento livre), composição real com a Trilha (§7) e o Radar (§4) sem disputar o mesmo canvas, e ainda assim uma sensação real de espaço — a linha de conexão visível é o mesmo princípio geométrico de uma aresta de grafo, só que com posição fixa em vez de física livre. **Conclusão explícita**: a melhor representação espacial da Ontology *para Mission Control* é painéis conectados com rótulo de relação na conexão; a melhor representação espacial da Ontology *para explorar a estrutura inteira do domínio* continua sendo o grafo, e o produto já tem o lugar certo para isso em `/intelligence/map` — não precisa (e não deve) duplicar essa função aqui.

## 11. VISUAL LANGUAGE

**A unidade visual fundamental é OBJECT + CONTEXT, nunca Card.** Concretamente: existe um único primitivo de identidade de objeto (tipo + nome real em serifada + estado real), usado sem variação visual em toda a superfície — na linha de Oportunidades do Radar, no painel de Contexto, nos painéis de Relacionados, nas tiras da Trilha. O que muda entre esses lugares nunca é o primitivo em si, é o **container** ao redor dele — e existem só dois containers reais em toda a tela:

- **Superfície elevada** (`bg-card` + borda de 1px): usada exclusivamente pelo painel de Contexto e pelos painéis de Relacionados — os únicos lugares onde um objeto está "atualmente sendo examinado" ou "imediatamente adjacente ao examinado".
- **Superfície plana** (sem fundo próprio, sem borda individual, só `divide-y`): usada por tudo o resto — Radar, Trilha, a linha "Agora".

Essa disciplina de só-dois-containers é o que impede "três colunas de cards" de voltar: card, no sentido rejeitado, é qualquer contêiner elevado usado para algo que não é o objeto atual ou vizinho direto dele — isso nunca acontece aqui.

| Dimensão | Definição |
|---|---|
| Tipografia | Serifada para o nome real de qualquer objeto (mantido do v1-v3); sans-serif para corpo/UI; mono caixa-alta pequena para tipo/categoria/metadado (mantido) |
| Densidade | Alta — padding 16-20px nos dois containers elevados, 8-12px de gap, `divide-y` sem padding extra nas linhas do Radar/Trilha (herdado da referência RE/MAX já documentada) |
| Hierarquia de superfície | Duas: elevada (Contexto + Relacionados) vs. plana (Radar + Trilha + "Agora") — nunca uma terceira |
| Bordas | Um único tom de borda, 1px, só nos dois containers elevados — nunca em linhas individuais |
| Divisores | `divide-y` da mesma cor de borda, dentro de Radar e da pilha de Trilha |
| Estado ativo/selecionado | O objeto atual é identificado por *estar* no painel de Contexto — não por destaque de cor em outro lugar. Exceção única: se esse mesmo objeto também aparece como uma linha no Radar, essa linha ganha uma barra de acento de 2px na cor primária — o único uso de cor de acento para indicar seleção em toda a tela |
| Identidade de objeto | Tipo + nome serifado + estado — idêntico em Radar/Contexto/Relacionados/Trilha (é essa repetição consistente que faz a tela parecer um ambiente, não módulos) |
| Identidade de relação | Sempre no mesmo tratamento visual — pill pequeno tingido na cor primária, nunca cinza neutro — sentado na linha de conexão (Relacionados) ou como prefixo em negrito (lista de relações dentro do Contexto) |
| Hierarquia de ação | No máximo 1 ação primária (sólida) + 1 secundária (texto) por objeto — nunca uma lista de botões |
| Hierarquia de informação | Por escala tipográfica e posição (central vs. periférico) — nunca por cor de fundo/sombra |

## 12-16. WIREFRAMES

### 12. Desktop 1440 — a composição de referência

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ MISSION CONTROL · Central de inteligência                    [Pesquisar…]         │
│ AGORA   2 decisões aguardando você · 3 agentes executando · 5 sinais · 4 oport.   │
├───────────────────┬────────────────────────────────────────────────────────────────┤
│ RADAR              │           Sistema › Sinal › Oportunidade   ← trilha            │
│ (superfície plana, │  ┌──────────────────────────┐   ┌───────────────────────┐    │
│  sem fundo)        │  │ CONTEXTO (elevado)         │╌╌│ RELACIONADOS (elevado) │    │
│                    │  │                            │  │  direciona-se a         │    │
│ DECISÕES · 2       │  │ ⦿ Oportunidade              │╌╌│  ⦿ Rivertown Consulting │    │
│  • Criar página     │  │   Guia para diretores...   │  │    Entidade             │    │
│    Rivertown···     │  │   Qualificado    66 pontos │  │                         │    │
│  • Mesclar páginas  │  │                            │  └───────────────────────┘    │
│                    │  │ Leitura explicável:         │   ┌───────────────────────┐   │
│ EXECUÇÕES · 3      │  │ "78% de confiança..."       │╌╌│  direciona-se a         │   │
│  • ●●●○○ Geração   │  │                            │  │  ⦿ Consultoria financ.  │   │
│    de conteúdo      │  │ Propriedades  Evidências(0)│  │    Mercado              │   │
│  • ●●○○○ Descoberta │  │                            │  └───────────────────────┘   │
│    de site           │  │ Histórico                  │   ┌───────────────────────┐   │
│  • ●●●●○ Resolução  │  │                            │╌╌│  direciona-se a         │   │
│                    │  │ ── Decisão vinculada ──     │  │  ⦿ Diretor financeiro   │   │
│ SINAIS · 5          │  │ Criar página · 81% conf.    │  │    Papel                │   │
│  ┈┈╎┈┈┈╎┈┈┈┈╎┈ (24h)│  │ [Aprovar e executar] Rejeit.│  └───────────────────────┘   │
│                    │  └──────────────────────────┘                                 │
│ OPORTUNIDADES · 4   │                                                                │
│  • ⦿ Guia p/ dir.   │                                                                │
│    financ.   ◔ 66   │                                                                │
│  • ⦿ Consultoria…   │                                                                │
│    ◑ 58              │                                                                │
└───────────────────┴────────────────────────────────────────────────────────────────┘
```

Proporções: Radar ~260px fixo (superfície plana, sem borda própria delimitando a coluna toda — só o texto e os divisores). Contexto + Relacionados ocupam o restante como um **cluster único** (não duas colunas separadas por borda de página): o Contexto tem largura própria (~560-620px), os painéis de Relacionados ficam à direita dele, empilhados verticalmente, cada um com sua linha de conexão (as marcas `╌╌` no wireframe) tocando a borda direita do Contexto. Ver o mockup HTML (item 18) para a versão visual real desta composição.

### 13. 1280

Mesma composição, Radar reduz para ~230px, Contexto ~480-520px, painéis de Relacionados reduzem para 1-2 propriedades visíveis (nunca somem — se não couber a propriedade extra, mostra só tipo+nome+relação).

### 14. 1024

Radar recolhe de coluna fixa para uma faixa horizontal fina no topo (mesmo padrão "Agora", mas expandido: os 4 grupos como categorias com contagem, roláveis horizontalmente, clique expande a lista daquele grupo como um painel temporário que se sobrepõe suavemente — nunca escondido atrás de um menu). Contexto + Relacionados continuam como o cluster central conectado, agora ocupando a largura inteira.

```
┌──────────────────────────────────────────────┐
│ AGORA · Radar horizontal: [Decisões 2] [Exec 3] [Sinais 5] [Oport 4] │
├──────────────────────────────────────────────┤
│  Sistema › Sinal › Oportunidade                │
│  ┌─────────────────────┐   ┌────────────────┐ │
│  │ CONTEXTO              │╌╌│ RELACIONADOS    │ │
│  └─────────────────────┘   └────────────────┘ │
└──────────────────────────────────────────────┘
```

### 15. 768

O cluster Contexto+Relacionados perde a segunda coluna lado a lado — os painéis de Relacionados migram para **abaixo** do Contexto, em vez de ao lado, mas **mantêm a linha de conexão** (agora vertical, descendo do rodapé do Contexto até o topo de cada painel) — nunca viram uma lista sem conexão visual. Radar continua como faixa horizontal de categorias no topo.

### 16. 390

Radar vira um acordeão real (grupos fechados por padrão, exceto o de maior prioridade real aberto) em vez de faixa horizontal — em uma tela desse tamanho, rolar uma faixa horizontal com o polegar é pior que expandir/colapsar verticalmente. Trilha, Contexto e Relacionados mantêm a mesma ordem vertical e a mesma linha de conexão (vertical) entre Contexto e cada painel de Relacionado, agora abaixo dele — nunca "coluna 1 → coluna 2 → coluna 3", como pedido explicitamente: é a mesma hierarquia Sistema → Radar → Trilha → Contexto → Relacionados → Ação, só que cada elemento é uma faixa de largura total.

---

## 17. CURRENT V3 → V3.1 — o que mudou exatamente

| Elemento do v3 | O que mudou no v3.1 e por quê |
|---|---|
| Radar como 4 blocos de lista igual | **Cada grupo ganha linguagem visual própria** (ponto de urgência / indicador de etapas / faixa de pulso temporal / arco de pontuação) — resolve "não use o mesmo componente para tudo" |
| Radar como coluna com borda própria | **Vira superfície plana**, sem container elevado — só o Contexto e Relacionados têm essa superfície agora, disciplina de "dois containers só" |
| Relacionados como coluna de lista de texto | **Vira 2-4 painéis elevados conectados** ao Contexto por linha real com o rótulo da relação sentado nela — peso visual real, motivo da relação explícito |
| Trilha como breadcrumb de texto | **Vira pilha de tiras colapsadas** com identidade visual própria por nível, que se expandem no lugar em vez de navegar |
| "Três colunas lado a lado" como composição geral | **Um cluster central conectado** (Contexto+Relacionados, fisicamente tocando) ladeado por uma periferia plana (Radar) — nunca três blocos de peso visual igual |
| Modelo de ação (só "Aprovar e executar" mencionado) | **Detalhado e verificado contra o backend real**: "Rejeitar" (Decisão) e "Publicar" (Página) identificados como extensões reais e pequenas (endpoint já existe); "Revisar"/"Ignorar"/"Editar"/"Gerar novamente" identificados honestamente como gaps sem endpoint, não implementados |
| Papel do grafo | Não mencionado explicitamente no v3 além de "não reintroduzir". **v3.1 justifica por função**: grafo serve exploração estrutural ampla (`/intelligence/map`, já existe), painéis conectados servem o uso operacional ancorado de Mission Control |
| Estado inicial | Mantido o princípio (síntese, não objeto arbitrário); **detalhado como uma única linha "Agora"** com segmentos clicáveis, nunca KPI tiles |

---

## 18. Wireframe visual

Mockup HTML estático em alta fidelidade da composição 1440px descrita em §12 — arquivo separado, fora da árvore de código do produto, sem nenhuma conexão com dado real ou rota da aplicação. Enviado junto com este documento.

---

## Critérios de aprovação (§19 do briefing) — autoavaliação honesta

| # | Pergunta | Resposta e por quê |
|---|---|---|
| A | Parece sistema operacional de inteligência? | Essa é a intenção de todo o desenho — validação real só é possível pelo mockup visual, não por esta tabela |
| B | Parece um dashboard? | Meta explícita de design: não. Risco seria voltar via Radar-como-cards; endereçado em §4/§11 (disciplina de dois containers) |
| C | Parece Object Inspector gigante? | Não — Contexto agora ocupa uma fração da largura (~40-45% em 1440), não 70% |
| D | Objetos são a unidade fundamental? | Sim, explicitamente declarado em §11: um único primitivo de identidade, reaproveitado sem variação em toda a tela |
| E | Sistema continua visível quando um objeto está em foco? | Sim — Radar nunca desaparece, permanece periferia visível em qualquer estado |
| F | Selecionar um objeto transforma o contexto? | Sim — o painel de Contexto nasce/muda de conteúdo, os painéis de Relacionados mudam junto, a Trilha ganha uma tira — nenhuma navegação de página |
| G | Relacionamentos são navegáveis? | Sim, em dois lugares (lista dentro do Contexto + painéis conectados) |
| H | Decisões/sinais/oportunidades/execuções mantêm identidades diferentes? | Sim — quatro representações visuais distintas no Radar (§4), nunca fundidas |
| I | Ações aparecem naturalmente no contexto? | Sim, sempre dentro do painel do objeto a que pertencem, nunca soltas |
| J | Profundidade espacial sem grafo? | Sim — via painéis conectados com linha+rótulo real (§6, §10) |

---

Próximo passo: aguardar aprovação explícita do documento **e** do mockup visual antes de qualquer alteração de código, conforme instrução da rodada ("NÃO CODE AINDA"). Apenas `/mission` será tocado quando a aprovação vier — `/knowledge`, `/opportunities`, `/pages`, `/agents`, `/workflows` continuam fora de escopo.
