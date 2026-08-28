# Mission Control — Visual Reset

Status: documento de planejamento, curto, visual. `docs/mission-control-ux-v3.md` e `docs/mission-control-ux-v3.1.md` estão **abandonados** como direção — não como referência de dados reais (os campos, rotas e objetos mapeados ali continuam válidos; a composição visual não). Nenhum código foi alterado. O mockup do item 7/8 é um HTML estático fora da árvore do produto.

O erro de raiz das quatro versões anteriores (V1→V3.1) não foi de layout — foi de ponto de partida. Toda vez eu comecei do backend (`Objeto → Card → Relação → Painel → Inspector → Ação`) e cheguei, sempre, em alguma variação de painéis com borda organizados em colunas. Tecnicamente coerente, visualmente sempre a gramática de um admin tool. Desta vez comecei do outro lado: qual é a sensação de usar isto, primeiro — os objetos reais entram depois, dentro dela.

## A metáfora

**Mission Control é um dossiê de inteligência sendo lido, não um painel sendo operado.** Não uma pasta física ilustrada — a estrutura de um dossiê: uma história central em foco, densamente reasoned, com notas de margem (relações, evidências, histórico) ao lado, e um log discreto de outros casos abertos na periferia. O usuário não "navega uma UI", ele **lê o caso mais urgente que o sistema já tem aberto** e aprofunda a partir dali.

---

## 1. PRODUCT FEEL

1. O produto sente como um dossiê vivo sendo lido, não um painel sendo operado.
2. A primeira coisa que aparece é uma história real que o sistema encontrou — nunca uma tela neutra, nunca uma grade de números.
3. Densidade é seletiva: a história principal respira; o log periférico é denso, pequeno e quieto.
4. Cor é usada uma vez, com peso real — nunca como sistema de categorização por tipo.
5. Tipografia carrega a personalidade da tela — a composição precisa funcionar quase sem nenhuma cor, só pela hierarquia tipográfica.
6. Nenhum bloco é uma "caixa administrativa": relações, evidências e histórico são notas de margem, não widgets com borda.
7. Aprofundar contexto é continuar a mesma leitura, nunca abrir uma tela nova.
8. O sistema explica antes de exibir — a mesma leitura explicável que já existia numa nota pequena vira o motor de toda a página, não um detalhe.
9. Uma ação é uma decisão editorial — um selo real, nunca um botão azul genérico de SaaS.
10. Vazio é honesto e nunca constrangido — "nenhuma evidência ainda" é uma linha discreta, nunca um placeholder pedindo desculpa.

## 2. VISUAL DNA

Se o Mission Control fosse um objeto físico: uma pasta de caso sobre uma mesa escura, sob luz de abajur — capa em verde quase preto, carimbo em latão, papel levemente amarelado pela luz de lâmpada, não pela idade do papel. Nada de neon, nada de vidro/glassmorphism, nada de gradiente.

- **Cor**: fundo verde-ardósia quase preto (não navy, não cinza puro — uma identidade própria, nunca vista nas versões anteriores). Um único acento: latão/dourado envelhecido — usado só onde algo real pede atenção (selo de decisão pendente, marca de seleção). Nunca azul de SaaS, nunca vermelho de alerta genérico.
- **Tipografia**: uma serifada de display com presença real para o título do caso (a manchete); uma serifada de leitura, mais macia, para o parágrafo de leitura explicável (o "olho" da matéria); mono caps pequena só para carimbo/data/metadado; sans-serif discreta só para os dois únicos controles de UI (busca, links de navegação) — nunca para texto de conteúdo.
- **Superfície**: uma única superfície elevada em toda a tela — a própria folha do dossiê (o corpo do caso). Tudo o mais (notas de margem, log de outros casos) vive direto sobre o fundo, sem caixa própria — dividido só por linhas finas.
- **Regra de decoração**: se um elemento não é o carimbo de decisão nem a manchete, ele não pode competir visualmente com os dois. Sem ícone decorativo, sem sombra grande, sem cantos muito arredondados.

## 3. CURRENT PROBLEM — por que V1→V3.1 falharam visualmente

| Versão | O que mudou | Por que continuou parecendo admin tool |
|---|---|---|
| V1 | Grid de estatísticas + grafo decorativo | Gramática de dashboard clássico: KPI tiles + gráfico |
| V2 | Object Inspector em tela cheia + feed | Um card de propriedades ocupando a tela inteira ainda é um card |
| V3 | Três zonas nomeadas (Radar/Contexto/Relacionados) | Zonas nomeadas ainda são painéis com borda organizados em coluna — só ganharam nomes melhores |
| V3.1 | Disciplina de "dois containers", painéis conectados por linha | Refinar a moldura de um painel não muda o fato de que a unidade ainda é "painel com borda" |

O fio comum: em toda versão, a unidade de desenho foi um **contêiner de UI** (card, painel, coluna) preenchido com dado. Refinar essa unidade produz um admin tool cada vez mais bem organizado — nunca um produto com identidade própria, porque a gramática visual de "contêiner com borda organizando dado" **é**, ela mesma, a gramática de um dashboard, independente de como é nomeada ou disposta.

## 4. NEW EXPERIENCE

Mission Control abre no caso real de maior prioridade do sistema agora (mesma lógica de sempre: sujeito da decisão pendente de maior prioridade, ou a Oportunidade de maior pontuação real) — apresentado como a matéria de capa do dossiê de hoje, não como um card de dados. Título real do objeto vira a manchete. A leitura explicável real vira o texto de abertura. Propriedades, relações, evidências e histórico se dissolvem no corpo do texto e nas notas de margem — nunca reaparecem como seções com título "PROPRIEDADES" dentro de uma caixa.

Ao lado, um log fino e quieto mostra o que mais está em aberto no sistema agora — não uma seção de destaque, um rodapé de consciência periférica. Clicar em qualquer coisa relacionada (nota de margem ou item do log) não navega: a capa atual recolhe para uma linha fina no topo ("casos consultados"), e o novo caso expande no lugar — como puxar outra pasta de cima da pilha, nunca trocar de aplicativo.

## 5. INFORMATION HIERARCHY

O que domina, nesta ordem: (1) a manchete real do caso em foco — maior elemento tipográfico da tela; (2) o parágrafo de leitura explicável real, logo abaixo, em corpo generoso; (3) o carimbo de decisão real, quando existir, único ponto de cor com peso na tela inteira. Tudo o resto — propriedades, histórico, relações, evidências, log de outros casos — é deliberadamente menor, mais quieto, e nunca compete com os três primeiros por atenção. Isso é o oposto de "maximizar informação por pixel": a meta é clareza por pixel — algumas áreas respiram (a manchete, a leitura), outras são densas e pequenas de propósito (o log periférico).

## 6. INTERACTION MODEL

- **Entrar** num objeto relacionado ou num item do log = a leitura continua, nunca uma nova tela, nunca modal, nunca sidebar.
- **Aprofundar** evidência/histórico = rolar a própria página — são notas de margem que já estão ali, não abas escondidas.
- **Voltar** = clicar numa linha da trilha "casos consultados" no topo; ela reexpande no lugar, empurrando o caso atual de volta para a trilha.
- **Decidir** = o carimbo de decisão real, sempre dentro do caso a que pertence, nunca solto na tela.
- O Object Inspector **continua existindo como motor de dados** (mesmos campos: identidade, leitura explicável, propriedades, relações, evidências, histórico, ações) — deixa de existir como **moldura visual**. Não há, em lugar nenhum da tela, um painel rotulado "Inspector".

## 7. 1440px COMPOSITION

Ver mockup HTML (entregue junto). Descrição da composição: nameplate mínimo + busca no topo; carimbo de classificação (tipo · estado real) acima da manchete; manchete em serifada grande (título real do objeto); linha de dateline em mono pequena (pontuação, confiança, data real); parágrafo de leitura explicável em serifada de leitura, itálico, corpo generoso, largura de coluna de leitura (~60-65 caracteres); propriedades reais como uma lista corrida de duas colunas discretas; histórico como uma régua vertical fina na margem esquerda do corpo; carimbo de decisão real (quando existir) como bloco com borda em latão, ação primária sólida + ação secundária em texto; margem direita, mais estreita, com "leitura relacionada" (relação real + objeto real, sem caixa, dividida por linha fina) e evidências reais como citação numerada ou estado vazio honesto; log "também em aberto" no rodapé da margem, quieto, texto puro.

## 8. 390px COMPOSITION

Uma única coluna de leitura, mesma ordem: trilha (só o item mais recente, se existir) → carimbo de classificação → manchete → dateline → leitura explicável → propriedades → carimbo de decisão → histórico → leitura relacionada → evidências → também em aberto. Nada vira aba, nada vira accordion por padrão — é a mesma matéria, só em coluna cheia. O log "também em aberto" comprime para 1 linha por item, sem perder nenhum tipo real.

## 9. DESIGN DO'S

- Deixar a manchete real ser o maior elemento tipográfico da tela.
- Tratar toda ação real como uma decisão editorial (selo), nunca um botão azul solto.
- Deixar áreas vazias reais respirarem — espaço em branco é uma escolha, não uma falha.
- Usar o acento de cor uma única vez por tela, no que realmente importa agora.
- Deixar o log periférico ser pequeno e quieto de propósito.

## 10. DESIGN DON'TS

- Não colocar nenhum bloco de conteúdo dentro de um card com borda própria, exceto o corpo do próprio caso.
- Não nomear seções como "PROPRIEDADES"/"RELAÇÕES" em caixa alta dentro de uma caixa — deixar a tipografia e a posição comunicarem a hierarquia.
- Não usar mais de uma cor de acento na mesma tela.
- Não fabricar prosa nova — a manchete e a leitura explicável continuam vindo de campos reais (`title`, `ExplainabilityNote`), nunca de texto inventado.
- Não deixar o log periférico competir visualmente com o caso em foco.

---

Próximo passo: aguardar aprovação do mockup visual antes de qualquer código.
