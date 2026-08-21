/* ------------------------------------------------------------------ *
 * WhiteHabbit Insights — dados do experimento conversacional.
 * Um conjunto curado de perguntas que o produto sabe responder,
 * cada uma com uma análise encenada e achados estruturados. Isto
 * alimenta o demo "Pergunte qualquer coisa" da página /insights.
 * ------------------------------------------------------------------ */

export interface InsightFinding {
  /** rótulo curto e forte, ex.: "Erro no app" */
  label: string
  /** explicação em uma frase */
  detail: string
  /** participação estimada nas conversas (0-100) */
  share: number
}

export interface InsightAnswer {
  id: string
  /** pergunta como aparece no chip / entrada */
  question: string
  /** contexto amostrado (ex.: "396 conversas · últimos 90 dias") */
  sampled: string
  /** título do insight resultante */
  headline: string
  /** resumo de uma frase */
  summary: string
  /** achados numerados */
  findings: InsightFinding[]
  /** KPI que este insight move */
  kpi: { label: string; value: string; trend: "up" | "down" | "flat" }
  /** ação recomendada */
  action: string
  /** pontos da sparkline (0-1) */
  spark: number[]
  /** passos de análise encenados (mostrados enquanto "pensa") */
  steps: string[]
}

export const SAMPLE_QUESTIONS: InsightAnswer[] = [
  {
    id: "app-vs-call",
    question: "Os clientes podem fazer isso no app — por que estão ligando?",
    sampled: "396 conversas · últimos 90 dias",
    headline:
      "Por que clientes ligam para upgrade de economy em vez de usar o app?",
    summary:
      "A maioria das ligações vem de uma falha no app e de desconhecimento do recurso — não de preferência por atendimento humano.",
    findings: [
      {
        label: "Erro no app",
        detail:
          "Clientes relatam que o app congela na tela de carregamento ao enviar o upgrade de economy básica.",
        share: 44,
      },
      {
        label: "Desconhecem o app",
        detail:
          "Clientes se surpreendem ao saber que dá para fazer o upgrade pelo próprio app.",
        share: 31,
      },
      {
        label: "Sem confiança no fluxo",
        detail:
          "Preferem confirmar por telefone porque não recebem comprovante claro no app.",
        share: 25,
      },
    ],
    kpi: { label: "Volume de chamadas evitável", value: "−38%", trend: "down" },
    action:
      "Corrigir o congelamento no envio e adicionar um comprovante de upgrade no app.",
    spark: [0.3, 0.4, 0.35, 0.5, 0.62, 0.58, 0.7, 0.82, 0.78, 0.9],
    steps: [
      "Amostrando 396 conversas relevantes",
      "Agrupando motivos de contato",
      "Correlacionando com eventos do app",
      "Ranqueando causas por impacto",
    ],
  },
  {
    id: "aht-west-southwest",
    question: "Por que o AHT é diferente entre as regiões Oeste e Sudoeste?",
    sampled: "4.940 conversas · Mar 1",
    headline: "Comparando AHT no Oeste vs. Sudoeste",
    summary:
      "O Sudoeste concentra conversas sobre cancelamento e incentivos de upgrade, que alongam o atendimento; o Oeste é dominado por feedback e problemas de resgate.",
    findings: [
      {
        label: "Considerações de cancelamento",
        detail:
          "Insatisfação com preço e qualidade puxa o tempo de atendimento no Sudoeste.",
        share: 38,
      },
      {
        label: "Incentivos de upgrade",
        detail:
          "Agentes gastam mais tempo apresentando ofertas de retenção no Sudoeste.",
        share: 27,
      },
      {
        label: "Problemas de resgate",
        detail:
          "No Oeste, falhas de resgate de pontos concentram o volume, com atendimento mais curto.",
        share: 20,
      },
    ],
    kpi: { label: "AHT — Sudoeste", value: "+6,2 min", trend: "up" },
    action:
      "Criar um fluxo de retenção guiado para cancelamento no Sudoeste e reduzir passos manuais.",
    spark: [0.5, 0.55, 0.48, 0.6, 0.72, 0.68, 0.8, 0.76, 0.88, 0.92],
    steps: [
      "Amostrando 4.940 conversas por região",
      "Extraindo temas por diálogo",
      "Comparando distribuição Oeste × Sudoeste",
      "Isolando temas que alongam o AHT",
    ],
  },
  {
    id: "baggage-west-coast",
    question: "O que está por trás do aumento de bagagem atrasada na Costa Oeste?",
    sampled: "2.000 conversas · últimas 12h",
    headline: "Consultas de bagagem atrasada crescem após chegadas na Costa Oeste",
    summary:
      "Voos noturnos com conexão estão gerando bagagem atrasada ou extraviada, concentrados em LAX e SEA.",
    findings: [
      {
        label: "Conexões noturnas",
        detail:
          "Itinerários com conexão em voos tardios têm mais falha de transferência de bagagem.",
        share: 47,
      },
      {
        label: "Hubs LAX e SEA",
        detail:
          "Dois aeroportos concentram a maior parte dos relatos de bagagem no período.",
        share: 33,
      },
      {
        label: "Falta de rastreio",
        detail:
          "Clientes ligam porque não recebem atualização proativa sobre a bagagem.",
        share: 20,
      },
    ],
    kpi: { label: "Contatos de bagagem", value: "+61%", trend: "up" },
    action:
      "Disparar notificação proativa de status de bagagem para conexões noturnas em LAX/SEA.",
    spark: [0.2, 0.28, 0.26, 0.4, 0.44, 0.6, 0.58, 0.72, 0.85, 0.95],
    steps: [
      "Amostrando 2.000 conversas recentes",
      "Geolocalizando origem dos contatos",
      "Cruzando com itinerários de conexão",
      "Detectando picos por hub",
    ],
  },
  {
    id: "attach-revenue",
    question: "Oferecer internet residencial após a resolução realmente gera receita?",
    sampled: "8.200 conversas · últimos 30 dias",
    headline: "Oferta de internet residencial após resolução",
    summary:
      "Conversas em que o agente fez a oferta no momento certo geraram receita de attach 40% maior por conversa.",
    findings: [
      {
        label: "Oferta realizada",
        detail: "Receita média de attach de US$ 9,50 por conversa.",
        share: 58,
      },
      {
        label: "Oferta não realizada",
        detail: "Receita média de attach de US$ 6,80 por conversa.",
        share: 42,
      },
      {
        label: "Janela ideal",
        detail:
          "O melhor resultado ocorre logo após a resolução, com o cliente satisfeito.",
        share: 0,
      },
    ],
    kpi: { label: "Receita de attach / conversa", value: "+US$ 2,70", trend: "up" },
    action:
      "Sugerir a oferta em tempo real quando a resolução for confirmada e o CSAT estiver alto.",
    spark: [0.4, 0.42, 0.5, 0.48, 0.56, 0.6, 0.66, 0.7, 0.78, 0.84],
    steps: [
      "Amostrando 8.200 conversas com resolução",
      "Separando oferta realizada × não realizada",
      "Calculando receita de attach por grupo",
      "Identificando a janela de maior conversão",
    ],
  },
]

/** métricas de resultado exibidas no acompanhamento */
export const OUTCOME_STATS = [
  {
    value: "50%",
    label: "Redução no volume de chamadas via otimização de jornada",
  },
  {
    value: "US$ milhões",
    label: "Economia com desvio de rota associado à otimização de jornada",
  },
  { value: "100%", label: "Chamadas avaliadas para CSAT preditivo" },
  { value: "+61%", label: "Aumento na arrecadação por hora de agente" },
]

/** KPIs guiados de ponta a ponta */
export const GUIDED_KPIS = ["CSAT", "Resolução", "AHT", "Conversão"]
