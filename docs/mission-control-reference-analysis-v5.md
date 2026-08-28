# Mission Control — Reference Analysis v5

Status: documento de planejamento. Nenhum código de produção foi alterado para produzi-lo. Analisa as 5 imagens anexadas nesta rodada pela lógica operacional, não pela estética — conforme instrução explícita.

## A. O que cada referência está realmente mostrando

1. **pSEO Template → Structured Database → Automated Outputs** ("Data-Driven Diversity"): um template + uma base estruturada convergem visualmente, depois **divergem em várias páginas reais e distintas ao mesmo tempo** (New York City, Tokyo, Model X Pro, London — cada uma com dado próprio, não um placeholder repetido). É literalmente *Intelligence → Page Production*, sem nenhum vocabulário de dashboard.
2. **"Generated Page URLs Monitor"** (sidebar + tabela de URLs com status Indexed/Pending/Excluded + gráficos): esta é a única das 5 imagens que É o anti-padrão — um dashboard SaaS genérico. Não vou tratá-la como referência de composição geral. Mas ela carrega dois padrões pontuais reais e úteis, isolados do resto da tela: **(a)** um banner de alerta acionável no topo — "Pages flagged for thin content. Immediate review required." + botão "Review Now" — nunca um texto pálido "Pending"; **(b)** status como pill colorido com ícone, não uma palavra solta.
3. **"AI Content Strategy" (mindmap radial)**: um centro com braços nomeados (Topic Intelligence, Content Calendar, Production, Measurement, Distribution), cada braço com sub-itens próprios, espessura de linha e glow comunicando peso/atividade real. Estruturalmente: **múltiplos fluxos de interesse coexistindo ao redor de um centro comum, todos visíveis ao mesmo tempo**, sem uma sequência de leitura forçada.
4. **Diagrama isométrico "digital twin"** (planta industrial com PROPERTIES/ACTIONS/FUNCTIONS/VERSIONING apontando para objetos operacionais reais — caminhão, robôs, um "PLANT OBJECT" com Status/Consumption/CycleTime/Issues/Uptime/EfficiencyScore em pontos coloridos, uma ação real "Re-Route" sentada num caminho entre dois objetos, tudo dentro de um branch "master"): Ontology aplicada a **objetos operacionais com estado vivo**, não a um catálogo estático de dados. A ação nomeada senta exatamente onde a transformação acontece, não num botão à parte.
5. **"WRITES / ONTOLOGY / READS"** (mesh convergindo para um grid de objetos ligados, divergindo de novo): topologia **muitos→um→muitos** — muitas escritas reais do mundo convergem para um modelo estruturado compacto no centro, que diverge de novo em muitas leituras/ações reais.

## B. O fluxo visual de cada referência

| Imagem | Fluxo |
|---|---|
| 1. pSEO | Convergência → núcleo (template+dados) → divergência (muitas páginas reais simultâneas) |
| 2. Dashboard | Tabular/linear — não é fluxo, é o padrão a evitar |
| 3. Mindmap | Radial simultâneo — vários braços do mesmo centro, sem sequência |
| 4. Digital twin | Um caminho pontual entre dois objetos operacionais reais, com uma ação nomeada nele |
| 5. Writes/Reads | Convergência → núcleo → divergência (idêntico em forma à imagem 1, em outro domínio) |

## C. Modelo mental comum (excluindo a imagem 2, que é o anti-padrão)

Um **núcleo estruturado e compacto** recebe muitas entradas reais e produz muitas saídas reais, **ao mesmo tempo**, com **estado vivo visível em cada ponto**, e uma **ação nomeada sentada exatamente onde a transformação acontece** — nunca um botão à parte, nunca uma legenda separada.

## D. Estrutural vs. visual

| Estrutural (adaptar) | Visual (não copiar) |
|---|---|
| Convergência-divergência simultânea | Roxo neon, glow, gradiente |
| Estado vivo por item (ponto colorido, anel de progresso) | Ilustração isométrica 3D |
| Ação nomeada sentada na própria transformação | Sidebar + tabela de SaaS |
| Núcleo compacto e estruturado | Ícones decorativos de fábrica |
| Radialidade para "muitas coisas ao mesmo tempo" sem hierarquia forçada | — |

## E. O que estava errado nas versões anteriores — autocrítica cumulativa

- **Object-centric (v1–v3.1)**: tratou **um** objeto por vez como o centro da tela inteira. Nenhuma das 5 referências faz isso — todas mostram várias transformações reais simultâneas.
- **Dossiê Vivo**: tratou a tela como leitura sequencial de texto. Nenhuma referência é uma peça editorial.
- **Intelligence Production Room (trilho reto)**: identificou corretamente as 8 etapas reais, mas representou como **uma linha reta com um item em foco** — as referências mostram fluxo radial e múltiplo, nunca uma fila única.
- **Grid 3×3 de objetos ligados**: copiou a **estrutura estática** de uma das 5 imagens sem nenhuma noção de transformação ou estado — um grafo de relações descreve onde as coisas estão, nunca o que está acontecendo com elas agora.

O erro comum às quatro: eu desenhava *onde as coisas estão*. Nunca *o que está acontecendo com elas agora, há quanto tempo, e o que vem a seguir* — que é exatamente o que as 5 referências desta rodada mostram, cada uma à sua maneira.

## F. Tradução para o produto — o Anel de Fluxo

No lugar de grid/trilho reto/grafo: as 8 etapas reais do loop (já documentado em `docs/mission-control-production-flow-v3.md`, mantido sem alteração: Observar → Entender → Descobrir → Decidir → Produzir → Revisar → Publicar → Medir) viram posições ao redor de um **anel fechado**. O loop deixa de precisar de uma seta de retorno decorativa (o problema apontado no ponto 9 do briefing) porque **a geometria do círculo já é o loop** — Medir e Observar são vizinhos reais no anel, fisicamente adjacentes.

## G. Como representar múltiplos fluxos simultâneos

Cada item real do sistema (uma Oportunidade, uma Decisão, uma Execução, uma Página) é um marcador independente na sua posição real no anel. Vários marcadores reais aparecem ao mesmo tempo — nenhum precisa terminar para outro aparecer. Isso é literalmente o padrão radial da imagem 3 (vários braços do mesmo centro, todos visíveis) aplicado a estágios sequenciais reais em vez de categorias de assunto.

## H. Como representar Human + Agent

- **Agente trabalhando**: marcador preenchido, com pulso vivo, cor "escreve" (do par semântico write/read já extraído da imagem 5), com um pequeno arco de progresso próprio quando existe um `AgentRun` real com etapas em andamento — o mesmo princípio do "PLANT OBJECT" da imagem 4 (estado vivo com ponto colorido, direto no objeto operacional).
- **Aguardando humano**: marcador com contorno vazado + rótulo explícito "Aguardando aprovação humana" — nunca só "Pendente" — inspirado diretamente no banner acionável da imagem 2 ("Immediate review required"), sem copiar o layout de dashboard ao redor dele.

## I. Como representar Page Production

Página é o output central do produto (ponto 6 do briefing) — não pode ser um ponto genérico igual aos outros. No trecho do anel entre Produzir/Revisar/Publicar, páginas reais em produção ganham miniatura própria (like um pequeno recorte de página real, título + status), inspirado diretamente na pilha de saídas reais da imagem 1 — nunca um ponto abstrato.

## J. Como representar o feedback loop

Geométrico, não narrativo: Medir e Observar são posições fisicamente adjacentes no anel. Quando uma medição real gera um sinal novo (o mesmo mecanismo real já documentado — `POST /api/v1/search-console/properties/:id/detect-signals`), o sinal nasce visualmente ao lado da medição que o originou, no mesmo giro do anel — nunca uma seta separada apontando de volta ao topo da tela.

---

Próximo passo: mockup navegável (arquivo separado, fora do código de produção) demonstrando este modelo — seleção de item, acompanhamento do fluxo, abertura de decisão/agente/página, múltiplos fluxos simultâneos visíveis. Nenhuma implementação em `mission-control.tsx` até aprovação.
