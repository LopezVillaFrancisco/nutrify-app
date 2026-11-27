package app.nutrify.nutrition;

import java.util.List;

/**
 * @param aiCalls        pedidos hechos a la IA en este cálculo (0, 1 o 2)
 * @param aiNeeded       cosas que la IA podría completar y quedaron sin hacer
 * @param aiPendingNames qué quedó pendiente, para mostrarlo antes de pedir permiso
 * @param aiCallsNeeded  pedidos que haría completar lo pendiente (0, 1 o 2)
 */
public record AnalyzeResult(List<AnalyzedLine> lines, int aiCalls, int aiNeeded, List<String> aiPendingNames, int aiCallsNeeded) {}
