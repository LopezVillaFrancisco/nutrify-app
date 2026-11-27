package app.nutrify.web;

import app.nutrify.db.UserDb;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /health (sin sesión): para el hosting y para ver rápido si la base responde. */
@RestController
public class HealthController {
  private final UserDb db;

  public HealthController(UserDb db) {
    this.db = db;
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, String>> health() {
    boolean dbOk = db.ping();
    return ResponseEntity.ok(Map.of("status", "ok", "db", dbOk ? "ok" : "error"));
  }
}
