# Fase 4 — Composição de Telas (conceitual)

Status: documento de planejamento, sem alteração de código. Nenhuma tela foi implementada — esta é a descrição estrutural que a Fase 5 (implementação, começando por `/mission`) deve seguir.

## Nova arquitetura de informação (derivada, não copiada literalmente)

O exemplo do briefing (SYSTEM/OPERATE/EXPLORE) é um ponto de partida correto, mas precisa reconciliar com: (a) o modelo real de objetos desta auditoria, (b) a distinção Produto vs. Infraestrutura já estabelecida em `docs/product-experience-reset.md` §6-7, e (c) as rotas reais que já existem e precisam de um lugar (`/websites`, `/approvals`, `/studio`, `/factory`, `/library`, `/integrations`, `/outcomes`, `/observatory`, `/evolve`).

Proposta (a implementar somente quando a navegação for redesenhada — não na Fase 5):

- **SISTEMA** — Mission (cockpit), Busca/Comando (universal, sempre acessível via atalho), Timeline (histórico real do sistema inteiro).
- **ONTOLOGIA** — o Grafo unificado (já existe como `IntelligenceGraph`, 7 modos reais) como a superfície principal de exploração; Entidades/Mercados/Papéis são modos do mesmo grafo, não páginas separadas.
- **OPERAR** — Oportunidades, Páginas (Page Factory), Decisões, Agentes — as quatro superfícies onde o usuário realmente toma ou acompanha uma ação real.
- **CONFIGURAR** — Websites (conexão de fonte), Integrations, Worker Studio/Factory/Skills (automação avançada), Approvals, Outcomes, Observatory, Improve — tudo que é real, mas não é o loop principal do produto.

Este agrupamento não é implementado nesta fase — fica registrado aqui como a direção que a navegação deve seguir quando for redesenhada, depois que a linguagem visual de `/mission` for validada.

## 1. Mission Control (`/mission`) — o cockpit

Composição, de cima para baixo:

1. **Comando/Busca** — uma faixa fixa no topo (não um botão isolado no canto): campo de busca real sempre visível, não escondido atrás de ⌘K — reduz a distância entre "quero investigar algo" e "encontrei o objeto".
2. **Estado do sistema** — não mais um parágrafo de prosa. Uma faixa compacta com 4-5 números reais lado a lado (entidades rastreadas, páginas reais, oportunidades ativas, execuções ativas, decisões pendentes), cada número com seu rótulo pt-BR logo abaixo, em uma única linha densa — não cards separados com bordas e sombra individuais, mas uma faixa contínua dividida por separadores finos (o padrão real já existe no Pipeline da Page Factory: `divide-x` em vez de `gap` com cards).
3. **Campo de Inteligência** — o coração da nova composição: um recorte real e pequeno do grafo (não o canvas completo de `/knowledge` — algo como 8-12 nós reais: os objetos mais recentes/relevantes e suas conexões diretas), renderizado inline na própria página, clicável, abrindo o Inspector sem sair de `/mission`. Isso substitui as duas listas separadas de "Oportunidades" e "Agentes" de hoje por uma única visualização espacial onde ambos os tipos de objeto aparecem conectados de verdade.
4. **Sinais ativos** — um feed compacto real (reaproveitando o `TimelineFeed`/`StreamRow` já existente, unificado por Fase 3 item 8), mostrando os eventos mais recentes do sistema inteiro.
5. **O que fazer a seguir** — mantém a função real do `NextActionCard` (aprovar → executar a mesma cadeia real), mas com o tratamento visual de Action UI (Fase 3 item 7): ancorado, contextual, nunca um card genérico central como hoje.

## 2. Ontologia / Conhecimento (`/knowledge`, futuramente unificado sob "Ontologia")

Mantém o `IntelligenceGraph` real e os 7 modos reais já existentes — a mudança é inteiramente de Graph UI (Fase 3 item 9): foco real, nós densos, expansão real. A lista de filtros acima do canvas passa a ficar visualmente integrada ao canvas (uma barra de contexto persistente), não uma fileira solta de pills e inputs.

## 3. Opportunity Explorer (`/opportunities`)

Deixa de ser uma lista de cards e passa a ser uma composição de duas camadas:
1. Uma **tabela operacional densa** (Fase 3 §9 do design system real de tabelas) com colunas reais: Oportunidade, Entidade-alvo, Mercado/Intenção, Score, Status, Ação — cada linha compacta, clicável, abrindo o Object Inspector.
2. Ao selecionar uma oportunidade, o Inspector mostra a cadeia real completa que o briefing pede: Entidade + Papel + Mercado + Intenção + Tendência (quando existir) + Valor de Negócio → Oportunidade → Página proposta → Resultado esperado — como uma trilha de Relationship UI navegável, não como texto solto.

## 4. Page Factory (`/`, homepage)

O Pipeline real (Fase UX-3) se mantém — já é, estruturalmente, a peça mais alinhada com a linguagem de "sistema em produção" desta auditoria. Ganha apenas: tradução completa dos rótulos de estágio para pt-BR (Fase 2), e integração visual mais densa com o Object Inspector (clicar em uma oportunidade/página do Pipeline abre o Inspector, hoje só navega para outra página).

## 5. Agent Control Center (`/agents/live`)

Passa de lista de cards com chips para um grafo real de dependência (Graph UI, Fase 3 item 9), reaproveitando o mesmo `GraphCanvas`/modo de grafo já usado em Ontologia — nunca um canvas paralelo. Cada execução real é um caminho de nós reais (Descoberta → Pesquisa → Entidade → Dados → Oportunidade → Conteúdo → SEO → GEO → QA → Publicação), com o nó em execução real destacado.

## 6. Object Inspector (universal)

A composição definida em Fase 3 §11: cabeçalho compacto de 3 elementos (Object UI), faixa de métricas-chave, seções com separador fino, rodapé fixo de Ações. Esta é a peça que mais componentes vão reaproveitar — deve ser a primeira a ser refinada visualmente na Fase 5, mesmo implementando apenas `/mission` primeiro, porque `/mission` também abre o Inspector.

## Ordem de implementação recomendada para a Fase 5

Conforme instrução explícita do usuário — apenas `/mission` nesta próxima etapa, validando a linguagem visual antes de propagar. Como `/mission` abre o Object Inspector, o refinamento do Inspector (Fase 3 §11) faz parte natural desse mesmo passo — não é uma tela adicional, é o mesmo objeto de UI usado dentro de `/mission`.
