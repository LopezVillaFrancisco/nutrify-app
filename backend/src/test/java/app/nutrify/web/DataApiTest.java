package app.nutrify.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import app.nutrify.db.UserDb;
import app.nutrify.nutrition.Json;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * La API de datos contra un Postgres 17 de verdad con el schema de Supabase (supabase/schema.sql, sin cambios) y RLS.
 * La base está armada como un proyecto de Supabase, ya con el acceso directo cerrado (ver TestDb).
 * Cada test usa dos usuarios nuevos, A y B, y comprueba que B nunca ve ni toca lo de A.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "SUPABASE_URL=https://proyecto-test.supabase.co",
        "SUPABASE_JWT_SECRET=" + ApiTest.SECRET,
        "GEMINI_API_KEY=",
    })
class DataApiTest {
  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    EmbeddedPostgres pg = TestDb.get();
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "postgres");
  }

  @Autowired Environment env;
  @Autowired UserDb userDb;
  @Autowired JwtDecoder decoder;

  final HttpClient http = HttpClient.newHttpClient();
  String a;
  String b;
  UUID aId;

  record Res(int status, JsonNode body) {
    String error() {
      return body != null && body.has("error") ? body.get("error").stringValue() : null;
    }
  }

  static String token(UUID user) throws Exception {
    JWTClaimsSet claims = new JWTClaimsSet.Builder()
        .subject(user.toString())
        .issuer(ApiTest.ISSUER)
        .audience("authenticated")
        .claim("role", "authenticated")
        .claim("email", user.toString().substring(0, 8) + "@test.local")
        .expirationTime(new Date(System.currentTimeMillis() + 600_000))
        .build();
    SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
    jwt.sign(new MACSigner(ApiTest.SECRET.getBytes(StandardCharsets.UTF_8)));
    return jwt.serialize();
  }

  @BeforeEach
  void users() throws Exception {
    JdbcTemplate admin = TestDb.admin();
    aId = UUID.randomUUID();
    UUID bId = UUID.randomUUID();
    admin.update("insert into auth.users (id) values (?), (?)", aId, bId);
    a = token(aId);
    b = token(bId);
  }

  Res call(String method, String path, String token, Object body) throws Exception {
    HttpRequest.BodyPublisher pub = body == null ? HttpRequest.BodyPublishers.noBody()
        : HttpRequest.BodyPublishers.ofString(body instanceof String s ? s : Json.write(body));
    HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + env.getProperty("local.server.port") + path))
        .header("authorization", "Bearer " + token)
        .header("content-type", "application/json")
        .method(method, pub)
        .build();
    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
    return new Res(res.statusCode(), res.body().isEmpty() ? null : Json.parse(res.body()));
  }

  Res get(String path, String token) throws Exception {
    return call("GET", path, token, null);
  }

  static void ok(Res r, int status) {
    assertEquals(status, r.status(), () -> "respuesta: " + r.body());
  }

  /* ---------- RLS a mano: sin filtrar por usuario, la base igual devuelve solo lo tuyo ---------- */

  @Test
  void rlsFiltraAunqueLaConsultaNoFiltre() throws Exception {
    ok(call("POST", "/api/foods", a, """
        {"name":"Whey","aliases":[],"kcal_per_100g":380,"protein_per_100g":75,"carbs_per_100g":8,"fat_per_100g":5}"""), 201);
    Jwt ja = decoder.decode(a);
    Jwt jb = decoder.decode(b);
    assertEquals(Integer.valueOf(1), userDb.<Integer>run(ja, jdbc -> jdbc.queryForObject("select count(*)::int from public.foods", Integer.class)));
    assertEquals(Integer.valueOf(0), userDb.<Integer>run(jb, jdbc -> jdbc.queryForObject("select count(*)::int from public.foods", Integer.class)));
    // Ni actualizando todo de golpe se toca lo del otro
    assertEquals(Integer.valueOf(0), userDb.<Integer>run(jb, jdbc -> jdbc.update("update public.foods set name = 'hackeado'")));
    assertEquals("Whey", get("/api/foods", a).body().get(0).get("name").stringValue());
  }

  /* ---------- Perfil ---------- */

  @Test
  void perfil() throws Exception {
    Res def = get("/api/settings", a);
    ok(def, 200);
    assertEquals(2350, def.body().get("kcal").intValue());
    assertEquals("ask", def.body().get("aiMode").stringValue());
    assertEquals(2, def.body().get("cups").size());

    Res put = call("PUT", "/api/settings", a, """
        {"kcal":2500,"protein":170,"rangeLow":85,"rangeHigh":105,"weightKg":80.5,"heightCm":178,"stepsGoal":12000,
         "waterGoalMl":3000,"aiMode":"auto","cups":[{"name":"  Botella  ","ml":750},{"name":"","ml":200},{"name":"Gigante","ml":9000}]}""");
    ok(put, 200);
    assertEquals(2500, put.body().get("kcal").intValue());
    assertEquals(80.5, put.body().get("weightKg").doubleValue());
    assertEquals("auto", put.body().get("aiMode").stringValue());
    assertEquals(1, put.body().get("cups").size(), "los vasos inválidos se descartan");
    assertEquals("Botella", put.body().get("cups").get(0).get("name").stringValue());

    assertEquals(2350, get("/api/settings", b).body().get("kcal").intValue(), "B sigue con los valores por defecto");

    Res bad = call("PUT", "/api/settings", a, """
        {"kcal":200,"protein":170,"rangeLow":85,"rangeHigh":105,"stepsGoal":12000}""");
    ok(bad, 400);
    assertEquals("Las calorías tienen que estar entre 500 y 10.000.", bad.error());
    Res range = call("PUT", "/api/settings", a, """
        {"kcal":2500,"protein":170,"rangeLow":110,"rangeHigh":90,"stepsGoal":12000}""");
    ok(range, 400);
    assertEquals("El rango tiene que ir de menor a mayor (ej. 80% a 110%).", range.error());
    ok(call("PUT", "/api/settings", a, "{no es json"), 400);
  }

  /* ---------- Alimentos y comidas guardadas ---------- */

  @Test
  void alimentos() throws Exception {
    Res created = call("POST", "/api/foods", a, """
        {"name":" Yogur Ser ","aliases":["yogur ser","yogur ser"],"kcal_per_100g":70,"protein_per_100g":3,"carbs_per_100g":10,
         "fat_per_100g":1.5,"default_portion_g":200,"unit_label":"unidad","category":"lacteos"}""");
    ok(created, 201);
    String id = created.body().get("id").stringValue();
    assertEquals("Yogur Ser", created.body().get("name").stringValue());
    assertEquals(1, created.body().get("aliases").size(), "alias repetidos se guardan una vez");
    assertEquals(200, created.body().get("default_portion_g").intValue());

    Res bad = call("POST", "/api/foods", a, """
        {"name":"","kcal_per_100g":70,"protein_per_100g":3,"carbs_per_100g":10,"fat_per_100g":1}""");
    ok(bad, 400);
    assertEquals("Poné un nombre.", bad.error());
    ok(call("POST", "/api/foods", a, """
        {"name":"X","kcal_per_100g":-1,"protein_per_100g":3,"carbs_per_100g":10,"fat_per_100g":1}"""), 400);

    // B no lo ve ni lo puede tocar: para B no existe
    assertEquals(0, get("/api/foods", b).body().size());
    String update = """
        {"name":"Robado","kcal_per_100g":1,"protein_per_100g":1,"carbs_per_100g":1,"fat_per_100g":1}""";
    ok(call("PUT", "/api/foods/" + id, b, update), 404);
    ok(call("DELETE", "/api/foods/" + id, b, null), 404);
    ok(call("PUT", "/api/foods/" + id, a, update), 200);
    ok(call("DELETE", "/api/foods/no-es-un-uuid", a, null), 404);
    ok(call("DELETE", "/api/foods/" + id, a, null), 204);
    ok(call("DELETE", "/api/foods/" + id, a, null), 404);

    Res meal = call("POST", "/api/saved-meals", a, """
        {"name":"Desayuno de siempre","items":["1 scoop whey","300 ml leche"],"meal":"desayuno"}""");
    ok(meal, 201);
    assertEquals(2, meal.body().get("items").size());
    ok(call("POST", "/api/saved-meals", a, """
        {"name":"Vacía","items":[]}"""), 400);
    ok(call("POST", "/api/saved-meals", a, """
        {"name":"Rara","items":["x"],"meal":"brunch"}"""), 400);
    assertEquals(1, get("/api/saved-meals", a).body().size());
    assertEquals(0, get("/api/saved-meals", b).body().size());
    ok(call("DELETE", "/api/saved-meals/" + meal.body().get("id").stringValue(), b, null), 404);
  }

  /* ---------- Lo que comiste y totales ---------- */

  static String line(String date, String meal, String food, double kcal) {
    return """
        {"date":"%s","meal":"%s","raw_text":"x","food_name":"%s","grams":100,"kcal":%s,"protein":10,"carbs":20,"fat":5,"source":"base"}"""
        .formatted(date, meal, food, kcal);
  }

  @Test
  void comidas() throws Exception {
    Res created = call("POST", "/api/entries", a,
        "{\"entries\":[" + line("2026-11-20", "almuerzo", "Pollo", 300) + "," + line("2026-11-20", "cena", "Arroz", 200) + "]}");
    ok(created, 201);
    assertEquals(2, created.body().size());
    ok(call("POST", "/api/entries", a, "{\"entries\":[" + line("2026-11-22", "desayuno", "Avena", 150) + "]}"), 201);

    Res day = get("/api/entries?date=2026-11-20", a);
    assertEquals(2, day.body().size());
    assertEquals("Pollo", day.body().get(0).get("food_name").stringValue());
    assertTrue(day.body().get(0).get("eaten_at").isString());

    Res days = get("/api/days?from=2026-11-16&to=2026-11-22", a);
    assertEquals(500, days.body().get("2026-11-20").get("kcal").intValue());
    assertEquals(2, days.body().get("2026-11-20").get("count").intValue());
    assertEquals(150, days.body().get("2026-11-22").get("kcal").intValue());
    assertEquals(2, get("/api/days/logged?from=2026-11-01&to=2026-11-30", a).body().size());
    assertEquals(0, get("/api/days?from=2026-11-16&to=2026-11-22", b).body().size());

    // Validación: una línea mala frena todo (no se guarda nada)
    Res bad = call("POST", "/api/entries", a,
        "{\"entries\":[" + line("2026-11-21", "almuerzo", "Ok", 100) + "," + line("2026-11-21", "brunch", "Mal", 100) + "]}");
    ok(bad, 400);
    assertEquals("Comida inválida.", bad.error());
    assertEquals(0, get("/api/entries?date=2026-11-21", a).body().size());
    ok(get("/api/entries?date=26/11/2026", a), 400);
    ok(get("/api/days?from=2026-11-22&to=2026-11-01", a), 400);

    // Corregir: se reemplaza en una transacción
    String pollo = day.body().get(0).get("id").stringValue();
    ok(call("POST", "/api/entries/" + pollo + "/replace", b, "{\"entries\":[" + line("2026-11-20", "almuerzo", "Trucho", 1) + "]}"), 404);
    Res replaced = call("POST", "/api/entries/" + pollo + "/replace", a,
        "{\"entries\":[" + line("2026-11-20", "almuerzo", "Pechuga", 250) + "," + line("2026-11-20", "almuerzo", "Ensalada", 50) + "]}");
    ok(replaced, 200);
    assertEquals(3, get("/api/entries?date=2026-11-20", a).body().size());
    assertEquals(0, get("/api/entries?date=2026-11-20", b).body().size(), "el reemplazo fallido de B no dejó nada");

    // Deshacer varias: las de A no cuentan para B
    String ids = replaced.body().get(0).get("id").stringValue() + "," + replaced.body().get(1).get("id").stringValue() + ",basura";
    assertEquals(0, call("DELETE", "/api/entries?ids=" + ids, b, null).body().get("deleted").intValue());
    assertEquals(2, call("DELETE", "/api/entries?ids=" + ids, a, null).body().get("deleted").intValue());
    assertEquals(1, get("/api/entries?date=2026-11-20", a).body().size());
  }

  /* ---------- Agua, pasos, peso y Progreso ---------- */

  @Test
  void aguaPasosYPeso() throws Exception {
    ok(call("POST", "/api/water", a, "{\"date\":\"2026-11-20\",\"ml\":250}"), 201);
    Res glass = call("POST", "/api/water", a, "{\"date\":\"2026-11-20\",\"ml\":400}");
    ok(glass, 201);
    Res tooMuch = call("POST", "/api/water", a, "{\"date\":\"2026-11-20\",\"ml\":6000}");
    ok(tooMuch, 400);
    assertEquals("La cantidad tiene que estar entre 1 y 5.000 ml.", tooMuch.error());
    ok(call("DELETE", "/api/water/" + glass.body().get("id").stringValue(), b, null), 404);
    assertEquals(2, get("/api/water?date=2026-11-20", a).body().size());

    // Pasos del día: uno solo, se reemplaza
    Res s1 = call("PUT", "/api/steps/day", a, "{\"date\":\"2026-11-20\",\"steps\":4000}");
    Res s2 = call("PUT", "/api/steps/day", a, "{\"date\":\"2026-11-20\",\"steps\":7500}");
    ok(s2, 200);
    assertEquals(s1.body().get("id").stringValue(), s2.body().get("id").stringValue());
    ok(call("POST", "/api/steps/treadmill", a, """
        {"date":"2026-11-20","steps":3000,"minutes":30,"speed_kmh":5.5,"distance_km":2.75}"""), 201);
    Res steps = get("/api/steps?date=2026-11-20", a);
    assertEquals(2, steps.body().size());
    assertEquals(5.5, steps.body().get(1).get("speed_kmh").doubleValue());

    ok(call("POST", "/api/workouts", a, "{\"date\":\"2026-11-20\",\"name\":\"Pecho\",\"exercises\":[]}"), 201);
    JsonNode act = get("/api/activity?from=2026-11-16&to=2026-11-22", a).body().get("2026-11-20");
    assertEquals(650, act.get("water").intValue());
    assertEquals(10500, act.get("steps").intValue());
    assertEquals(1, act.get("gym").intValue());
    assertEquals(0, get("/api/activity?from=2026-11-16&to=2026-11-22", b).body().size());

    // Peso: uno por día; el más reciente pasa al Perfil
    ok(call("PUT", "/api/settings", a, """
        {"kcal":2500,"protein":170,"rangeLow":80,"rangeHigh":110,"stepsGoal":10000}"""), 200);
    ok(call("PUT", "/api/weights", a, "{\"date\":\"2026-11-20\",\"kg\":81}"), 200);
    ok(call("PUT", "/api/weights", a, "{\"date\":\"2026-11-20\",\"kg\":80.4}"), 200);
    ok(call("PUT", "/api/weights", a, "{\"date\":\"2026-11-01\",\"kg\":83}"), 200);
    Res weights = get("/api/weights", a);
    assertEquals(2, weights.body().size());
    assertEquals(80.4, weights.body().get(1).get("kg").doubleValue());
    assertEquals(80.4, get("/api/settings", a).body().get("weightKg").doubleValue(), "un pesaje viejo no pisa el peso actual");
    ok(call("PUT", "/api/weights", a, "{\"date\":\"2026-11-20\",\"kg\":900}"), 400);
    assertEquals(0, get("/api/weights", b).body().size());
  }

  /* ---------- Gym ---------- */

  @Test
  void gym() throws Exception {
    Res ex = call("POST", "/api/exercises", a, "{\"name\":\"Press  banca\",\"muscle\":\"Pecho\",\"step\":2.5}");
    ok(ex, 201);
    assertEquals("Press banca", ex.body().get("name").stringValue());
    Res dup = call("POST", "/api/exercises", a, "{\"name\":\"PRESS BANCA\",\"muscle\":\"Pecho\",\"step\":2.5}");
    ok(dup, 409);
    assertEquals("Ya existe “PRESS BANCA”.", dup.error());
    ok(call("POST", "/api/exercises", b, "{\"name\":\"Press banca\",\"muscle\":\"Pecho\",\"step\":2.5}"), 201);

    Res routine = call("POST", "/api/routines", a, """
        {"name":"Pecho","exercises":[{"name":"Press banca","sets":4,"reps":8,"kg":60,"restSec":90,"muscle":"Pecho"}]}""");
    ok(routine, 201);
    String routineId = routine.body().get("id").stringValue();
    Res badRoutine = call("POST", "/api/routines", a, "{\"name\":\"Mal\",\"exercises\":[{\"name\":\"X\",\"sets\":0,\"reps\":8}]}");
    ok(badRoutine, 400);
    assertEquals("Las series van de 1 a 20.", badRoutine.error());

    // B no puede enganchar un entreno a la rutina de A (la clave foránea sola lo dejaría)
    Res stolen = call("POST", "/api/workouts", b, "{\"date\":\"2026-11-20\",\"routine_id\":\"" + routineId + "\",\"name\":\"Pecho\"}");
    ok(stolen, 400);
    assertEquals("Esa rutina no existe.", stolen.error());

    Res w = call("POST", "/api/workouts", a, """
        {"date":"2026-11-20","routine_id":"%s","name":"Pecho",
         "exercises":[{"name":"Press banca","sets":[{"reps":null,"kg":null,"done":false}],"muscle":"Pecho","restSec":90}]}""".formatted(routineId));
    ok(w, 201);
    String wid = w.body().get("id").stringValue();
    assertEquals(routineId, w.body().get("routine_id").stringValue());

    // Cambios parciales
    Res p = call("PATCH", "/api/workouts/" + wid, a, """
        {"exercises":[{"name":"Press banca","sets":[{"reps":8,"kg":60,"done":true},{"reps":10,"kg":40,"done":true,"warmup":true}]}],
         "finished_at":"2026-11-20T19:30:00Z"}""");
    ok(p, 200);
    assertEquals("Pecho", p.body().get("name").stringValue(), "lo que no vino no se toca");
    assertEquals(2, p.body().get("exercises").get(0).get("sets").size());
    assertTrue(p.body().get("exercises").get(0).get("sets").get(1).get("warmup").booleanValue());
    assertTrue(p.body().get("finished_at").isString());
    Res reopened = call("PATCH", "/api/workouts/" + wid, a, "{\"finished_at\":null}");
    assertTrue(reopened.body().get("finished_at").isNull(), "finished_at: null lo deja sin terminar");
    ok(call("PATCH", "/api/workouts/" + wid, b, "{\"name\":\"Hackeado\"}"), 404);
    ok(call("PATCH", "/api/workouts/" + wid, a, "{\"exercises\":[{\"name\":\"\",\"sets\":[]}]}"), 400);

    // Entreno del día: si ya hay, devuelve ese
    Res t1 = call("POST", "/api/workouts/today", a, "{\"date\":\"2026-11-21\"}");
    Res t2 = call("POST", "/api/workouts/today", a, "{\"date\":\"2026-11-21\"}");
    assertEquals(t1.body().get("id").stringValue(), t2.body().get("id").stringValue());
    assertEquals("Entreno", t1.body().get("name").stringValue());

    // Renombrar en todos lados (sin importar tildes ni mayúsculas)
    Res renamed = call("POST", "/api/exercises/rename", a, "{\"from\":\"PRESS banca\",\"to\":\"Press de banca plano\"}");
    ok(renamed, 200);
    assertEquals(1, renamed.body().get("workouts").intValue());
    assertEquals(1, renamed.body().get("routines").intValue());
    assertEquals("Press de banca plano", get("/api/workouts/" + wid, a).body().get("exercises").get(0).get("name").stringValue());
    assertEquals("Press de banca plano", get("/api/routines", a).body().get(0).get("exercises").get(0).get("name").stringValue());
    assertEquals(0, call("POST", "/api/exercises/rename", b, "{\"from\":\"Press de banca plano\",\"to\":\"X\"}").body().get("routines").intValue());

    assertEquals(2, get("/api/workouts", a).body().size());
    assertEquals(0, get("/api/workouts", b).body().size());
    ok(get("/api/workouts/" + wid, b), 404);
    ok(call("DELETE", "/api/routines/" + routineId, a, null), 204);
    assertTrue(get("/api/workouts/" + wid, a).body().get("routine_id").isNull(), "borrar la rutina deja el entreno sin rutina");
    ok(call("DELETE", "/api/workouts/" + wid, a, null), 204);
  }

  @Test
  void yo() throws Exception {
    Res me = get("/api/me", a);
    ok(me, 200);
    assertEquals(aId.toString(), me.body().get("id").stringValue());
    assertTrue(me.body().get("email").stringValue().endsWith("@test.local"));
  }
}
