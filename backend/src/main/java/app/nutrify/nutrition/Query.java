package app.nutrify.nutrition;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Arma URLs con parámetros codificados. */
final class Query {
  private final StringBuilder sb;
  private boolean first = true;

  Query(String base) {
    sb = new StringBuilder(base);
  }

  Query set(String key, String value) {
    sb.append(first ? '?' : '&').append(URLEncoder.encode(key, StandardCharsets.UTF_8)).append('=')
        .append(URLEncoder.encode(value, StandardCharsets.UTF_8));
    first = false;
    return this;
  }

  @Override
  public String toString() {
    return sb.toString();
  }
}
