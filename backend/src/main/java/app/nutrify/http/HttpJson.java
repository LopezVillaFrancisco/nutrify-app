package app.nutrify.http;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

/** Pedidos HTTP a servicios externos (USDA, Open Food Facts, traductor, Gemini). En los tests se reemplaza por uno falso. */
public interface HttpJson {
  record Response(int status, String body) {
    public boolean ok() {
      return status >= 200 && status < 300;
    }
  }

  /** GET. cacheTtl != null: guarda las respuestas buenas en memoria ese tiempo (USDA y Open Food Facts devuelven lo mismo por horas). */
  Response get(String url, Map<String, String> headers, Duration timeout, Duration cacheTtl) throws IOException, InterruptedException;

  Response post(String url, Map<String, String> headers, String body, Duration timeout) throws IOException, InterruptedException;
}
