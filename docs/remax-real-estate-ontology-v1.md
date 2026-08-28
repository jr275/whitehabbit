# RE/MAX — Ontologia derivada de dados reais (v1)

Status: documento de planejamento. Nenhum código de produção foi alterado.

## O que o arquivo realmente é

`remax.com.brPerformanceonSearch20260828.zip` é uma exportação real do **Google Search Console** para `remax.com.br`, últimos 3 meses (`Filters.csv`: Search type=Web, Date=Last 3 months), com 7 CSVs: `Chart.csv` (91 dias), `Queries.csv` (999 consultas reais), `Pages.csv` (1.040 URLs reais), `Countries.csv` (227 países), `Devices.csv` (3 dispositivos), `Search appearance.csv` (3 tipos de rich result).

**Isto não é uma base de imóveis individuais.** Não há preço, quarto, metragem, foto, ou um id de imóvel em lugar nenhum do arquivo. É dado real de desempenho de busca — o que já corresponde, no nosso domínio, ao que alimenta `Signal`/`Outcome`/`Observation`, não a um objeto `Imóvel`. Registro isso explicitamente em vez de inventar imóveis que não existem no arquivo.

## Objetos reais, derivados diretamente dos dados (nenhum inventado)

### Consulta (Query)
Fonte: `Queries.csv`, 999 linhas reais. Cada uma com `clicks`, `impressions`, `ctr`, `position` reais.
Exemplos reais: `"apartamento para alugar"` (119 cliques, 11.156 impressões, CTR 1.07%, posição 10.21), `"casa para alugar mogi guaçu"` (525 cliques, posição 2.63), `"aluguel de imoveis em brasilia df"` (ver Página abaixo).
Propriedade derivável real: **tipo de transação** — "venda" vs. "aluguel"/"alugar" aparece explicitamente no texto de ~198 das 999 consultas (`casa a venda`, `casa aluguel`, `apartamento para alugar`...) — real, contável, não inferido por suposição.

### Página (Page)
Fonte: `Pages.csv`, 1.040 URLs reais com métricas reais. Sub-tipos reais, identificáveis pela própria estrutura da URL (não inventados — a URL já carrega a categoria):
- **Home**: `remax.com.br/`
- **Hub regional**: `remax.com.br/_/Região_Sudeste/São_Paulo/Registro`
- **Busca filtrada** (com tipo de imóvel + transação reais no path): `remax.com.br/pt-br/pesquisa/regiao-centro-oeste/mato-grosso/rondonopolis/residencial-casa/alugar/`
- **Landing de aluguel/venda por cidade**: `remax.com.br/casas-para-alugar-em-cosmopolis`, `remax.com.br/casas-a-venda-em-araras/`
- **Página de escritório/corretor**: `remax.com.br/pt-br/escritorios/bahia/camacari/remax-sol/58049`
- **Busca de listagem por escritório**: `remax.com.br/listings?OfficeID=60105&...`

### Mercado / Localização
Não existe como tabela própria — é **derivado real** de nomes de cidade/estado literalmente presentes nas URLs e nas consultas (nunca inventado): Mogi Guaçu, Botucatu, Nova Odessa, Bragança Paulista, Cosmópolis, Cabreuva, Salto de Pirapora, Andradina, Capivari, Ribeirão Pires, Sorocaba, Jundiaí, Curitiba, Registro, Lins, Araras, Passo Fundo, Ribeirão Preto, Rio Claro, Armação dos Búzios, Atibaia, Rondonópolis/MT, Brasília/DF, Salvador/BA, Maceió/AL, Manaus/AM, Alagoinhas/BA, Camaçari/BA, Jequié/BA — todos strings reais extraídas do arquivo.

### Tipo de imóvel
Derivado real do path de busca filtrada: `residencial-casa`, `residencial-apartamento` aparecem literalmente nas URLs reais de `/pt-br/pesquisa/.../residencial-casa/venda/` etc. — uma taxonomia de tipo real, no nível de categoria (não de imóvel individual).

### Escritório / Corretor
Derivado real das páginas `/pt-br/escritorios/{estado}/{cidade}/{slug-do-escritório}/{OfficeID}`. Nomes e IDs reais, extraídos, exemplos: **REMAX AL Maré** (Maceió/AL, id 85027), **REMAX Corais** (Marechal Deodoro/AL, id 85065), **REMAX Urbana** (Manaus/AM, id 72079), **REMAX Sol** (Camaçari/BA, id 58049), **REMAX DN Imóveis** (Jequié/BA, id 58073). Quando a URL só tem `OfficeID` sem slug de nome (ex. `listings?OfficeID=60105`), o escritório fica honestamente identificado só pelo id — nunca inventei um nome para ele.

### Resultado (Outcome)
Já é o dado nativo do arquivo inteiro: toda Consulta e toda Página carregam `clicks`/`impressions`/`ctr`/`position` reais — o mesmo modelo que `translateMetric()` já trata no produto.

### Sinal (Signal)
`Chart.csv` dá uma série real diária (91 dias, 27/05 a 26/08/2026). O maior salto real de um dia para o outro no período inteiro: **+6.109 cliques em 10/08/2026** (de 8.063 para 14.172) — real, verificado nos dados, causa não determinada por este export (não vou inventar uma explicação).

### Dispositivo / Alcance
`Devices.csv` real: Mobile domina (665.302 cliques reais vs. 316.580 Desktop). `Countries.csv` real: Brasil concentra a maior parte, mas há tráfego real de Portugal, EUA, Argentina, Espanha.

## O que continua fora do alcance dos dados — gap real, não preenchido

**Imóvel individual** (um registro por unidade — preço, quartos, metragem, foto, status de disponibilidade) não existe neste arquivo nem no schema atual do produto (`lib/ontology/object-resolver.ts` tem `Entity/Opportunity/Page/Decision/AgentRun/Observation` — nenhum `Property`/`Imóvel`). Registrado como gap real dos dois lados (dado e schema), não implementado nesta rodada.

## Relacionamentos reais que a estrutura já sustenta

```
Consulta  --sobre-->  Mercado (cidade real extraída)
Consulta  --busca--> Tipo de imóvel (quando presente na própria consulta)
Página    --atende--> Consulta (mesma cidade/intenção real)
Página    --pertence a--> Escritório (quando a URL é de escritório real)
Página    --mede--> Resultado (clicks/impressions/ctr/position reais, sempre presentes)
Sinal     --detectado em--> a série diária real do site inteiro
```

Próximo passo: usar estes objetos reais (não os fictícios de rodadas anteriores) no mockup navegável.
