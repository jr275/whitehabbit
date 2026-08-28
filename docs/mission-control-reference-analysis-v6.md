# Mission Control — Reference Analysis v6

Status: documento de planejamento. Nenhum código de produção foi alterado. Analisa as 3 telas reais anexadas nesta rodada (produto real, não diagrama) pela lógica de fluxo — conforme instrução explícita. **Seções I e J dependem da base real de imóveis da RE/MAX, ainda não recebida — ver nota no fim.**

## A. O que cada referência demonstra

1. **Home "Criar conteúdo"** (workspace `remax.com.br`): ponto de entrada não é um objeto de dado, é uma **escolha de modo de produção** — Artigo (1 crédito, uma palavra-chave → um artigo), Campanha (2 créditos, "LOTE", múltiplos artigos com voz/contexto compartilhados), Programático (3 créditos, "ESCALA", "crie modelos, alimente os dados e gere em escala"). "Ideias rápidas" oferece pontos de partida reais e pré-preenchidos (palavras-chave sugeridas), sem forçar o usuário a inventar um do zero. Duas seções da navegação (Otimizar, Indexação) aparecem com cadeado — um estado real de "recurso bloqueado pelo plano", distinto de "não configurado".
2. **"Novo artigo" / Geração de artigo único**: a tela mais importante das 3 para o nosso domínio. Fluxo real: palavra-chave alvo → título gerado por IA (editável, contador de caracteres, botão "Regenerado") → **pesquisa competitiva ao vivo** ("Analisou 1 concorrente", contador real, "Veja as informações →") → palavras-chave secundárias sugeridas por IA como chips adicionáveis + selecionadas como chips removíveis → painel lateral com **estimativa real** (tempo de geração, extensão do artigo, custo em créditos) e **checklist do que a saída vai incluir** (título/meta otimizados, estrutura H2/H3, cobertura de palavras-chave, imagens com alt-text, sugestões de link interno) — tudo isso **antes** de qualquer geração começar.
3. **"My Content"**: lista real filtrável por status (All/Drafts/Writing/Ready/Published/Archived — uma máquina de estados quase idêntica à nossa `Page.status`), cada linha mostrando o número real de tráfego já medido inline (`0` para o artigo em escrita, `1.9k` para o publicado) — o resultado medido já aparece na mesma lista de produção, sem precisar abrir o item.

## B. Fluxos reais presentes

```
Home (escolher modo + ponto de partida real)
   → Novo artigo (palavra-chave → título → pesquisa competitiva ao vivo →
      palavras-chave secundárias curadas pelo usuário → estimativa + checklist)
   → [geração]
   → Meu conteúdo (status real: Escrevendo → Pronto → Publicado, tráfego real inline)
```

## C. Objetos que participam

Palavra-chave, Título (versão gerada + editável), Concorrente (pesquisa real), Palavra-chave secundária (sugerida/selecionada), Artigo/Página (com status real), Métrica de tráfego real.

## D. Estados observados

`Escrevendo` (Writing), `Pronto` (Ready), `Publicado` (Published), `Rascunho` (Draft), `Arquivado` (Archived) — e um estado de **plano**, não de conteúdo: recurso bloqueado (cadeado), distinto de "não configurado".

## E. Atores (Human / Agent / System)

- **Sistema**: gera o título, roda a pesquisa competitiva, sugere palavras-chave secundárias, calcula a estimativa — tudo automático.
- **Humano**: cura o resultado antes de comprometer o gasto (edita o título, adiciona/remove palavras-chave secundárias) — esse é o ponto real de intervenção humana nesta referência, e ele acontece **antes** de gerar, não só depois.
- Não há um "agente" nomeado visível nesta referência especificamente (ao contrário do "Anel de Fluxo" anterior) — a pesquisa/geração aparece como capacidade do sistema, sem uma UI própria de "acompanhar o agente trabalhando" nestas 3 telas.

## F. Transformações

Palavra-chave → Título (IA) → Título + palavras-chave secundárias (curado por humano) → Artigo real (gerado) → Artigo com status de ciclo de vida → Artigo publicado com tráfego real medido.

## G. Outputs

Um Artigo real, com metadado real (título/meta/H2-H3/links internos/imagens) — nunca um "conteúdo genérico"; a lista final ("A saída inclui") é a prova disso, mostrada como promessa concreta antes de gerar.

## H. Feedback

O tráfego real (`1.9k`) aparece na própria lista de conteúdo — o "resultado" não é uma tela separada de analytics, é uma coluna a mais na mesma lista de produção. Essa é uma forma de fechar o loop mais simples do que o Anel: **não precisa de uma visualização própria de "Medir" — o número de tráfego já vive dentro do item, sempre visível.**

## I. Dados RE/MAX

**Bloqueado.** A base real de imóveis não chegou nesta mensagem — só as 3 imagens de tela vieram. Não vou inspecionar/derivar schema sem o arquivo real (isso violaria a regra 4 desta própria rodada: "não invente dados"). Assim que o arquivo (CSV/planilha/JSON/link) chegar, esta seção e `docs/remax-real-estate-ontology-v1.md` são o próximo passo imediato — leio a estrutura real, identifico campos/entidades/relacionamentos reais, e só então proponho a Ontology.

## J. Como isso aparece no Mission Control

Duas mudanças reais e concretas para incorporar ao modelo já existente (Anel de Fluxo, `docs/mission-control-reference-analysis-v5.md`), sem descartar o que já funcionava:

1. **A etapa Decidir precisa de um "brief" real antes do selo de aprovação** — hoje nosso Anel mostra "Decisão pendente: Criar página" com confiança/prioridade/risco, mas não mostra *o que* vai ser produzido. A referência prova que isso importa: mostrar, antes de aprovar, quais entidades/consultas reais vão alimentar a página e o que a saída vai conter é o que faz a decisão parecer informada, não um botão cego.
2. **Medir não precisa ser um ponto separado no anel** — pode viver como um número real dentro do próprio marcador da Página, sempre visível, sem precisar clicar. Mantenho a posição geométrica de Medir no anel (ela ainda importa para o loop fechado e para o Sinal que ela gera), mas a métrica em si aparece também inline no marcador da Página, como a referência 3 faz.

---

**Bloqueio explícito**: `docs/remax-real-estate-ontology-v1.md` e o novo mockup navegável (Estados 1-9 pedidos) dependem da base real de imóveis. Aguardando o arquivo antes de continuar essa parte.
