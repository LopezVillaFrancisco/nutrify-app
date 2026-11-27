package app.nutrify.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import app.nutrify.db.UserData;
import app.nutrify.nutrition.AiCache;
import app.nutrify.nutrition.Json;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

/** La API entera (seguridad, CORS, formato de respuesta), con la base simulada y sin IA. */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "SUPABASE_URL=https://proyecto-test.supabase.co",
        "SUPABASE_JWT_SECRET=" + ApiTest.SECRET,
        "GEMINI_API_KEY=",
        "CORS_ORIGINS=http://localhost:3000",
    })
class ApiTest {
  static final String SECRET = "secreto-de-prueba-de-al-menos-32-bytes!!";
  static final String ISSUER = "https://proyecto-test.supabase.co/auth/v1";

  @Autowired Environment env;
  @MockitoBean UserData data;

  final HttpClient http = HttpClient.newHttpClient();
  final Map<String, JsonNode> store = new LinkedHashMap<>();

  @BeforeEach
  void setUp() {
    store.clear();
    when(data.foods(any())).thenReturn(List.of());
    when(data.aiMode(any())).thenReturn("auto");
    when(data.cache(any())).thenReturn(new AiCache() {
      @Override
      public Map<String, JsonNode> load(List<String> keys) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (String k : keys) if (store.containsKey(k)) out.put(k, store.get(k));
        return out;
      }

      @Override
      public void save(List<Map.Entry<String, JsonNode>> entries) {
        for (Map.Entry<String, JsonNode> e : entries) store.put(e.getKey(), e.getValue());
      }
    });
  }

  String url(String path) {
    return "http://localhost:" + env.getProperty("local.server.port") + path;
  }

  static String token(String issuer, String aud, long expiresInSec) throws Exception {
    JWTClaimsSet claims = new JWTClaimsSet.Builder()
        .subject("00000000-0000-0000-0000-000000000001")
        .issuer(issuer)
        .audience(aud)
        .claim("role", "authenticated")
        .expirationTime(new Date(System.currentTimeMillis() + expiresInSec * 1000))
        .issueTime(new Date())
        .build();
    SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
    jwt.sign(new MACSigner(SECRET.getBytes(StandardCharsets.UTF_8)));
    return jwt.serialize();
  }

  HttpResponse<String> post(String path, String body, String token) throws Exception {
    HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url(path)))
        .header("content-type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body));
    if (token != null) b.header("authorization", "Bearer " + token);
    return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void sinTokenDa401ConElMensajeDeSiempre() throws Exception {
    HttpResponse<String> res = post("/api/analyze", "{\"text\":\"2 huevos\"}", null);
    assertEquals(401, res.statusCode());
    assertEquals("Tu sesión venció. Volvé a entrar.", Json.parse(res.body()).get("error").stringValue());
  }

  @Test
  void tokensInvalidosDan401() throws Exception {
    assertEquals(401, post("/api/analyze", "{\"text\":\"2 huevos\"}", "basura").statusCode());
    assertEquals(401, post("/api/analyze", "{\"text\":\"2 huevos\"}", token(ISSUER, "authenticated", -60)).statusCode(), "vencido");
    assertEquals(401, post("/api/analyze", "{\"text\":\"2 huevos\"}", token("https://otro.supabase.co/auth/v1", "authenticated", 600)).statusCode(), "otro proyecto");
    assertEquals(401, post("/api/analyze", "{\"text\":\"2 huevos\"}", token(ISSUER, "anon", 600)).statusCode(), "token anónimo");
  }

  @Test
  void calcula() throws Exception {
    HttpResponse<String> res = post("/api/analyze", "{\"text\":\"2 huevos y 1 banana\",\"allowAi\":true}", token(ISSUER, "authenticated", 600));
    assertEquals(200, res.statusCode(), res.body());
    JsonNode body = Json.parse(res.body());
    JsonNode lines = body.get("lines");
    assertEquals(2, lines.size());
    assertEquals("Huevos", lines.get(0).get("food_name").stringValue());
    assertEquals(100, lines.get(0).get("grams").doubleValue());
    assertEquals(143, lines.get(0).get("kcal").intValue());
    assertEquals("base", lines.get(0).get("source").stringValue());
    assertEquals("USDA: Egg, whole, raw, fresh", lines.get(0).get("match").stringValue());
    assertEquals("Banana", lines.get(1).get("food_name").stringValue());
    JsonNode ai = body.get("ai");
    assertEquals("auto", ai.get("mode").stringValue());
    assertEquals("apagada", ai.get("blocked").stringValue(), "sin GEMINI_API_KEY la IA figura apagada");
    assertTrue(ai.has("failed") && ai.get("failed").isNull(), "failed va como null, igual que antes");
  }

  @Test
  void erroresDeTexto() throws Exception {
    String t = token(ISSUER, "authenticated", 600);
    HttpResponse<String> empty = post("/api/analyze", "{\"text\":\"   \"}", t);
    assertEquals(400, empty.statusCode());
    assertEquals("Escribí qué comiste.", Json.parse(empty.body()).get("error").stringValue());
    assertEquals(400, post("/api/analyze", "no es json", t).statusCode());
    assertEquals(400, post("/api/analyze", "{\"text\":\"" + "a".repeat(2001) + "\"}", t).statusCode());
    HttpResponse<String> nothing = post("/api/analyze", "{\"text\":\"-\"}", t);
    assertEquals(422, nothing.statusCode());
    assertEquals("No encontré alimentos en ese texto.", Json.parse(nothing.body()).get("error").stringValue());
  }

  @Test
  void estadoDeLaIa() throws Exception {
    HttpRequest req = HttpRequest.newBuilder(URI.create(url("/api/ai-status")))
        .header("authorization", "Bearer " + token(ISSUER, "authenticated", 600)).GET().build();
    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
    assertEquals(200, res.statusCode(), res.body());
    assertTrue(res.headers().firstValue("cache-control").orElse("").contains("no-store"));
    JsonNode h = Json.parse(res.body());
    assertEquals("sin_clave", h.get("connection").stringValue());
    assertEquals(false, h.get("canUse").booleanValue());
    assertEquals("Falta la clave de Gemini en el servidor (GEMINI_API_KEY).", h.get("reason").stringValue());
    assertEquals(40, h.get("cap").intValue());
  }

  @Test
  void corsParaElFrontend() throws Exception {
    HttpRequest pre = HttpRequest.newBuilder(URI.create(url("/api/analyze")))
        .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
        .header("Origin", "http://localhost:3000")
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "authorization,content-type")
        .build();
    HttpResponse<String> res = http.send(pre, HttpResponse.BodyHandlers.ofString());
    assertEquals(200, res.statusCode());
    assertEquals("http://localhost:3000", res.headers().firstValue("access-control-allow-origin").orElse(null));

    HttpRequest other = HttpRequest.newBuilder(URI.create(url("/api/analyze")))
        .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
        .header("Origin", "https://sitio-ajeno.com")
        .header("Access-Control-Request-Method", "POST")
        .build();
    assertEquals(403, http.send(other, HttpResponse.BodyHandlers.ofString()).statusCode());
  }
}
