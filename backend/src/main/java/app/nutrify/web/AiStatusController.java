package app.nutrify.web;

import app.nutrify.db.UserData;
import app.nutrify.nutrition.AiCache;
import app.nutrify.nutrition.AiHealth;
import app.nutrify.nutrition.AiStatus;
import app.nutrify.nutrition.Gemini;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** GET /api/ai-status: estado de la IA antes de usarla. No le pide nada a la IA: solo consulta si la clave y el modelo responden. */
@RestController
public class AiStatusController {
  private final Gemini gemini;
  private final UserData data;
  private final AiState state;
  private final Clock clock;
  private final ExecutorService executor;

  public AiStatusController(Gemini gemini, UserData data, AiState state, Clock clock, ExecutorService nutritionExecutor) {
    this.gemini = gemini;
    this.data = data;
    this.state = state;
    this.clock = clock;
    this.executor = nutritionExecutor;
  }

  @GetMapping("/api/ai-status")
  public ResponseEntity<AiHealth> status(@AuthenticationPrincipal Jwt jwt, @RequestParam(name = "force", required = false) String force) {
    AiCache cache = data.cache(jwt);
    String usageKey = state.usageKey();
    CompletableFuture<String> modeF = CompletableFuture.supplyAsync(() -> data.aiMode(jwt), executor);
    Map<String, JsonNode> stored = cache.load(List.of(usageKey, AiState.PROBLEM_KEY));
    JsonNode storedProblem = stored.get(AiState.PROBLEM_KEY);
    gemini.restoreProblem(storedProblem);

    AiHealth health = AiHealth.compute(gemini, clock, AiStatus.readMode(modeF.join()), AiState.used(stored.get(usageKey)), true, "1".equals(force));
    state.persistProblem(cache, storedProblem);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(health);
  }
}
