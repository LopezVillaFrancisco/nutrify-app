package app.nutrify.web;

import app.nutrify.db.UserData;
import app.nutrify.nutrition.AiCache;
import app.nutrify.nutrition.AiProblem;
import app.nutrify.nutrition.AiStatus;
import app.nutrify.nutrition.AnalyzeResult;
import app.nutrify.nutrition.Analyzer;
import app.nutrify.nutrition.FoodRow;
import app.nutrify.nutrition.Gemini;
import app.nutrify.nutrition.Text;
import app.nutrify.nutrition.Json;
import java.util.AbstractMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.IntNode;

/** POST /api/analyze: texto libre → líneas con kcal y macros */
@RestController
public class AnalyzeController {
  private final Analyzer analyzer;
  private final Gemini gemini;
  private final UserData data;
  private final AiState state;
  private final ExecutorService executor;

  public AnalyzeController(Analyzer analyzer, Gemini gemini, UserData data, AiState state, ExecutorService nutritionExecutor) {
    this.analyzer = analyzer;
    this.gemini = gemini;
    this.data = data;
    this.state = state;
    this.executor = nutritionExecutor;
  }

  public record Out(List<app.nutrify.nutrition.AnalyzedLine> lines, AiStatus ai) {}

  @PostMapping("/api/analyze")
  public ResponseEntity<?> analyze(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String rawBody) {
    JsonNode body;
    try {
      body = rawBody == null ? null : Json.parse(rawBody);
    } catch (Exception e) {
      body = null;
    }
    String text = body == null ? null : Json.str(body.get("text"));
    text = text == null ? "" : Text.trim(text);
    if (text.isEmpty()) return error(400, "Escribí qué comiste.");
    if (text.length() > 2000) return error(400, "Es mucho texto de una vez. Probá por partes.");
    boolean askedAi = body.get("allowAi") != null && body.get("allowAi").isBoolean() && body.get("allowAi").booleanValue();

    AiCache cache = data.cache(jwt);
    String usageKey = state.usageKey();
    CompletableFuture<List<FoodRow>> foodsF = CompletableFuture.supplyAsync(() -> data.foods(jwt), executor);
    CompletableFuture<String> modeF = CompletableFuture.supplyAsync(() -> data.aiMode(jwt), executor);
    CompletableFuture<Map<String, JsonNode>> usageF = CompletableFuture.supplyAsync(() -> cache.load(List.of(usageKey, AiState.PROBLEM_KEY)), executor);
    List<FoodRow> foods = foodsF.join();
    Map<String, JsonNode> usageMap = usageF.join();

    // Modo de IA elegido en Perfil: "auto" (sola), "ask" (solo si tocás "Completar con IA"), "off" (nunca)
    String mode = AiStatus.readMode(modeF.join());
    JsonNode storedProblem = usageMap.get(AiState.PROBLEM_KEY);
    gemini.restoreProblem(storedProblem);
    int usedToday = AiState.used(usageMap.get(usageKey));
    boolean available = gemini.enabled() && !gemini.killSwitch();
    boolean overCap = usedToday >= AiStatus.AI_DAILY_CAP;
    boolean allowAi = available && !overCap && !mode.equals("off") && (mode.equals("auto") || askedAi);

    AnalyzeResult result = analyzer.analyze(text, foods, cache, allowAi);

    // Contador diario (vive en la misma tabla de memoria de la IA)
    CompletableFuture<Void> saveUsage = result.aiCalls() > 0
        ? CompletableFuture.runAsync(() -> cache.save(List.of(new AbstractMap.SimpleEntry<>(usageKey, IntNode.valueOf(usedToday + result.aiCalls())))), executor)
        : CompletableFuture.completedFuture(null);
    CompletableFuture<Void> saveProblem = CompletableFuture.runAsync(() -> state.persistProblem(cache, storedProblem), executor);
    CompletableFuture.allOf(saveUsage, saveProblem).join();

    if (result.lines().isEmpty()) return error(422, "No encontré alimentos en ese texto.");

    AiProblem problem = gemini.problem();
    AiStatus ai = new AiStatus(
        mode,
        result.aiCalls(),
        usedToday + result.aiCalls(),
        AiStatus.AI_DAILY_CAP,
        available ? result.aiNeeded() : 0,
        !available ? "apagada" : overCap ? "tope" : null,
        result.aiPendingNames().subList(0, Math.min(12, result.aiPendingNames().size())),
        result.aiCallsNeeded(),
        // Se pidió la IA y quedó algo sin completar por culpa de Google (límite, clave, caída)
        allowAi && result.aiNeeded() > 0 && problem != null ? problem.kind() : null);
    return ResponseEntity.ok(new Out(result.lines(), ai));
  }

  static ResponseEntity<Map<String, String>> error(int status, String message) {
    return ResponseEntity.status(status).body(Map.of("error", message));
  }
}
