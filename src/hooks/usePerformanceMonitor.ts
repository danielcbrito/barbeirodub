import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface MetricaPerformance {
  timestamp: number
  memoriaUsadaMB: number
  memoriaLimiteMB: number
  totalQueriesCache: number
  totalQueriesAtivas: number
  tempoSessaoMinutos: number
}

interface RelatorioPerformance {
  geradoEm: string
  duracaoSessaoMinutos: number
  totalAmostras: number
  memoriaInicial: number
  memoriaFinal: number
  memoriaMaxima: number
  crescimentoMemoriaMB: number
  statusGeral: 'saudavel' | 'atencao' | 'critico'
  amostras: MetricaPerformance[]
}

export function usePerformanceMonitor(habilitado: boolean = false) {
  const queryClient = useQueryClient()
  const inicioSessao = useRef<number>(Date.now())
  const metricas = useRef<MetricaPerformance[]>([])
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const coletarMetrica = useCallback((): MetricaPerformance => {
    const memoria = (performance as any).memory
    const memoriaUsadaMB = memoria
      ? Math.round(memoria.usedJSHeapSize / 1024 / 1024)
      : 0
    const memoriaLimiteMB = memoria
      ? Math.round(memoria.jsHeapSizeLimit / 1024 / 1024)
      : 0

    const cache = queryClient.getQueryCache()
    const todasQueries = cache.getAll()
    const queriesAtivas = todasQueries.filter(
      (q) =>
        q.state.status === 'success' ||
        q.state.fetchStatus === 'fetching'
    )

    return {
      timestamp: Date.now(),
      memoriaUsadaMB,
      memoriaLimiteMB,
      totalQueriesCache: todasQueries.length,
      totalQueriesAtivas: queriesAtivas.length,
      tempoSessaoMinutos: Math.round(
        (Date.now() - inicioSessao.current) / 1000 / 60
      ),
    }
  }, [queryClient])

  const verificarAlertas = useCallback(
    (metrica: MetricaPerformance) => {
      if (metricas.current.length < 2) return

      const primeira = metricas.current[0]
      const crescimento = metrica.memoriaUsadaMB - primeira.memoriaUsadaMB

      if (crescimento > 80) {
        console.error(
          `[PERF] 🔴 CRÍTICO: Memória cresceu ${crescimento}MB em ` +
            `${metrica.tempoSessaoMinutos} minutos. Memory leak severo.`
        )
      } else if (crescimento > 40) {
        console.warn(
          `[PERF] 🟡 ATENÇÃO: Memória cresceu ${crescimento}MB em ` +
            `${metrica.tempoSessaoMinutos} minutos. Possível memory leak.`
        )
      }

console.log(
        `[PERF] ✅ ${metrica.tempoSessaoMinutos}min | ` +
          `RAM: ${metrica.memoriaUsadaMB}MB (+${crescimento}MB) | ` +
          `Queries cache: ${metrica.totalQueriesCache} | ` +
          `Queries ativas: ${metrica.totalQueriesAtivas}`
      )
    },
    []
  )

  const forcarColeta = useCallback(() => {
    const metrica = coletarMetrica()
    metricas.current.push(metrica)
    verificarAlertas(metrica)
  }, [coletarMetrica, verificarAlertas])

  useEffect(() => {
    if (!habilitado) return

    const coletar = () => {
      const metrica = coletarMetrica()
      metricas.current.push(metrica)
      verificarAlertas(metrica)
    }

    coletar()
    intervaloRef.current = setInterval(coletar, 1000 * 60 * 5)

    // CLEANUP OBRIGATÓRIO — sem isso o timer continua para sempre
    return () => {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current)
        intervaloRef.current = null
      }
    }
  }, [habilitado, coletarMetrica, verificarAlertas])

  const exportarRelatorio = useCallback((): RelatorioPerformance => {
    const amostras = metricas.current
    const memoriaInicial = amostras[0]?.memoriaUsadaMB ?? 0
    const memoriaFinal = amostras[amostras.length - 1]?.memoriaUsadaMB ?? 0
    const memoriaMaxima = Math.max(...amostras.map((a) => a.memoriaUsadaMB), 0)
    const crescimento = memoriaFinal - memoriaInicial

    const statusGeral: 'saudavel' | 'atencao' | 'critico' =
      crescimento > 80
        ? 'critico'
        : crescimento > 40
        ? 'atencao'
        : 'saudavel'

    const relatorio: RelatorioPerformance = {
      geradoEm: new Date().toISOString(),
      duracaoSessaoMinutos: Math.round(
        (Date.now() - inicioSessao.current) / 1000 / 60
      ),
      totalAmostras: amostras.length,
      memoriaInicial,
      memoriaFinal,
      memoriaMaxima,
      crescimentoMemoriaMB: crescimento,
      statusGeral,
      amostras,
    }

    console.table({
      'Status Geral': statusGeral.toUpperCase(),
      'Duração da Sessão': `${relatorio.duracaoSessaoMinutos} minutos`,
      'Memória Inicial': `${memoriaInicial}MB`,
      'Memória Final': `${memoriaFinal}MB`,
      'Memória Máxima': `${memoriaMaxima}MB`,
      'Crescimento Total': `${crescimento}MB`,
      'Total de Amostras': amostras.length,
    })

    return relatorio
  }, [])

  return {
    exportarRelatorio,
    forcarColeta,
    amostras: metricas.current,
    inicioSessaoTimestamp: inicioSessao.current,
  }
}