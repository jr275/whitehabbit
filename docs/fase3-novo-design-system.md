# Fase 3 — Novo Design System (v5)

Status: documento de planejamento, sem alteração de código. Sucede `docs/design-system-v4.md`, mantendo seus tokens de cor/tipografia reais (não há motivo para trocar os valores OKLCH ou as famílias de fonte — o problema nunca foi o token, foi a composição). Este documento define os 10 tipos de UI que o briefing pede, mais a regra de densidade e a regra de localização pt-BR aplicada ao layout.

## 0. O que muda e o que não muda

**Não muda:** a paleta de cores real (`--primary`, `--grow`, `--warn`, `--destructive`, `--chart-1..5`), as famílias tipográficas (Geist Sans/Mono), o modelo de dados, os componentes de baixo nível já corretos (`ObjectTypeBadge`, `ObjectStatusBadge`, `Score`).

**Muda:** a composição — como esses tokens se organizam no espaço. Menos padding generoso, menos "card com sombra", mais grade estruturada, mais densidade real, mais hierarquia por tipografia/alinhamento em vez de espaço em branco.

## 1. Regra de densidade

Referência real: os screenshots da Ontology mostram um painel de objeto (`PLANT OBJECT`) com 6 propriedades em um espaço vertical menor do que o card de uma única linha do Object Inspector atual mostra para 2 propriedades. A meta concreta:

- Altura de linha em listas operacionais (Oportunidades, Páginas, Execuções): reduzir de `py-4` para `py-2.5`–`py-3`.
- Painéis (Inspector, seções): reduzir de `p-5`/`px-6 py-6` para `p-4`, com separadores finos (`border-b border-border/60`) em vez de espaçamento vertical (`gap-6`) entre seções.
- Nenhuma seção do Inspector deve ter mais de ~40% de espaço vazio visível quando populada com dados reais — se sobra muito espaço, a seção está usando o padrão de card errado.

## 2. Regra de localização pt-BR aplicada ao layout

Palavras em português ocupam, em média, 15–30% mais espaço que o equivalente em inglês (ex.: "Ready to create" = 16 caracteres, "Pronto para criar" = 17; mas "Discovered" = 10 vs "Descoberto" = 10; "Waiting approval" = 17 vs "Aguardando aprovação" = 21). Nenhuma abreviação estranha é aceitável para compensar isso. Regras concretas:

- Badges de status: usar `min-width` flexível (`w-auto` com `white-space: nowrap`), nunca `w-14` fixo como o Score atual usa — testado nesta auditoria, "confiança" (9 caracteres) já não cabe confortavelmente no `w-14` (56px) que hoje serve "score" (5 caracteres) e "quality" (7 caracteres) em inglês.
- Pills de filtro/modo (ex. os 7 modos do grafo): já usam `rounded-full px-3 py-1.5` com largura automática — esse padrão está correto e deve ser mantido; o problema não é a pill, é que "Oportunidades" (14 caracteres) ao lado de "Decisões" (8 caracteres) precisa continuar cabendo em uma fileira com scroll horizontal e fade, exatamente como já resolvido para o TopNav e o Pipeline da Page Factory nesta sessão — o mesmo padrão se aplica a qualquer fileira de pills daqui para frente.
- Tabelas operacionais (Fase 4): colunas de rótulo (ex. "Intenção-alvo") precisam de `min-width` maior que o equivalente em inglês testava — a validação real em 1440/1280/1024/768/390 (Fase 5) precisa usar os rótulos pt-BR reais definidos na Fase 2, nunca os textos em inglês atuais como placeholder.

## 3. Object UI

O objeto deixa de ser representado como "card com borda arredondada" e passa a ter uma **ficha de identidade compacta**: badge de tipo (categoria + ícone) + nome + um badge de status inline — os três na mesma linha, nunca empilhados verticalmente como hoje. Um objeto em qualquer contexto (nó de grafo, linha de tabela, cabeçalho do Inspector) usa exatamente essa mesma composição de 3 elementos — nunca uma variação por tela.

## 4. Relationship UI

Duas formas, escolhidas pelo contexto (nunca as duas ao mesmo tempo para o mesmo dado):
1. **Contagem agregada** (cabeçalho do objeto): "12 Oportunidades · 4 Mercados · 8 Consultas" — números reais, tipografia mono, separados por `·`.
2. **Lista navegável** (dentro do Inspector): linha compacta com rótulo do relacionamento em pt-BR (Fase 2) + nome do objeto-alvo real + badge de tipo — já real, mantém-se, ganha apenas a tradução dos rótulos e a redução de padding (regra de densidade).

## 5. Property UI

Grade real de 2 colunas (rótulo à esquerda, valor à direita, ambos na mesma linha) — já é o padrão atual do Inspector (`<dl>` com `flex justify-between`) e está correto; a mudança é reduzir o `gap-2` vertical entre propriedades para aproximar do padrão "ficha técnica densa" do screenshot de referência.

## 6. Evidence UI

Cada evidência mostra fato (quando existe) + fonte + confiança + status de verificação na mesma linha compacta, não em duas linhas com respiro como hoje — reduzir para uma composição tipo tabela (fato à esquerda, metadados à direita em texto menor, mono).

## 7. Action UI

Botão de ação sempre com verbo no infinitivo pt-BR (Fase 2), sempre ancorado no rodapé do objeto (Inspector) ou na própria linha (tabela) — nunca solto no meio do fluxo de scroll. Estado bloqueado (`plan.status === "unsupported"` ou `!policy.allowed`) exibido como texto explicativo ao lado do botão desabilitado, nunca escondido.

## 8. Signal UI

Um ponto colorido (cor de estado, nunca categoria) + verbo de ação em pt-BR + timestamp relativo — já é exatamente o padrão do `StreamRow` da Page Factory (`components/home/product-home.tsx`); esse componente deve se tornar o `SignalRow`/`TimelineEvent` compartilhado (ver design-system-v4 §11, ainda pendente de unificação) em vez de existir duplicado entre a Page Factory e a Intelligence Timeline.

## 9. Graph UI

Mudança mais profunda desta fase:
- **Foco real**: nó selecionado em destaque total (escala maior, borda mais forte); vizinhos diretos com opacidade plena; o resto do grafo recua para 30–40% de opacidade — nunca todos os nós com o mesmo peso visual simultaneamente.
- **Nó denso**: cada nó carrega badge de tipo + nome + 1 propriedade-chave real (score ou status) + contagem de relações — nunca apenas um rótulo.
- **Expansão real**: clicar em um nó pode expandir sua vizinhança diretamente no canvas (carregar mais nós conectados), não apenas abrir um painel lateral desconectado do grafo.
- Arestas mantêm o tratamento de baixo contraste já correto (`--border`), reservando cor de aresta apenas quando ela carrega um dado real (ex. confiança do relacionamento).

## 10. Timeline UI

Já real e funcional (`intelligence-timeline.tsx`) — ganha apenas: rótulos de tipo/evento traduzidos (Fase 2), e compartilhamento de componente com o Signal UI (item 8) para eliminar a duplicação hoje existente entre a Timeline e o stream de produção da Page Factory.

## 11. Inspector UI

O painel lateral universal ganha uma nova composição interna:
- Cabeçalho compacto: badge de tipo + nome + badge de status, todos na mesma linha (Object UI, item 3) — nunca separados em linhas diferentes como hoje.
- Uma faixa de métricas-chave logo abaixo do cabeçalho (score, confiança, contagem de relações) em formato de mini-grid horizontal, não em blocos empilhados.
- Seções com separador fino, não `gap-6` generoso.
- Rodapé fixo (`position: sticky bottom-0`) para as Ações — sempre visível mesmo com scroll, nunca no final de uma lista longa de evidências.

## 12. Command UI

O Command Palette passa a agrupar resultados por Tipo de Objeto real (badge + rótulo pt-BR, Fase 2), com o mesmo tratamento visual de badge usado em toda a interface — reforçando a mensagem "isto é uma busca sobre objetos", não uma busca de texto genérica.

## 13. Navegação (a definir na Fase 4)

Não redesenhada aqui — a Fase 4 propõe a nova arquitetura de informação a partir do modelo mental real do produto, e só então este documento seria estendido com o componente de navegação correspondente.
