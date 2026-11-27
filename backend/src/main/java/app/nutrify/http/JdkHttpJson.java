package app.nutrify.http;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/** HttpJson con el cliente HTTP de Java y una memoria chica (LRU) para los GET que se repiten. */
public class JdkHttpJson implements HttpJson {
  private static final int MAX_CACHED = 2000;

  private record Cached(Response response, long expiresAt) {}

  private final HttpClient client = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(5))
      .followRedirects(HttpClient.Redirect.NORMAL)
      .build();

  private final Map<String, Cached> cache = new LinkedHashMap<>(256, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
      return size() > MAX_CACHED;
    }
  };

  @Override
  public Response get(String url, Map<String, String> headers, Duration timeout, Duration cacheTtl) throws IOException, InterruptedException {
    if (cacheTtl != null) {
      synchronized (cache) {
        Cached c = cache.get(url);
        if (c != null && c.expiresAt() > System.currentTimeMillis()) return c.response();
      }
    }
    HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET();
    headers.forEach(req::header);
    Response res = send(req.build());
    if (cacheTtl != null && res.ok()) {
      synchronized (cache) {
        cache.put(url, new Cached(res, System.currentTimeMillis() + cacheTtl.toMillis()));
      }
    }
    return res;
  }

  @Override
  public Response post(String url, Map<String, String> headers, String body, Duration timeout) throws IOException, InterruptedException {
    HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url)).timeout(timeout)
        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
    headers.forEach(req::header);
    return send(req.build());
  }

  private Response send(HttpRequest req) throws IOException, InterruptedException {
    HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    return new Response(res.statusCode(), res.body());
  }
}
