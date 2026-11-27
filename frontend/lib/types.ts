export type Meal = "desayuno" | "almuerzo" | "merienda" | "colacion" | "cena";

export type Source = "guardado" | "base" | "revisar";

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** Valores por 100 g (los alimentos "por unidad" se normalizan a 100 g al guardarlos). */
export type Per100g = Macros;

export type FoodRow = {
  id: string;
  name: string;
  aliases: string[];
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  default_portion_g: number | null;
  unit_label: string | null;
  /** tipo elegido a mano (si no, se adivina por el nombre) */
  category?: string | null;
};

export type SavedMealRow = { id: string; name: string; items: string[]; /** momento del día (null = cualquiera) */ meal?: Meal | null };

export type EntryRow = {
  id: string;
  date: string;
  meal: Meal;
  eaten_at: string;
  raw_text: string | null;
  food_name: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: Source;
};

/** Línea resuelta que devuelve /api/analyze. */
export type AnalyzedLine = {
  raw: string;
  food_name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: Source;
  /** Valores por 100 g, para ofrecer guardar el alimento en "Alimentos". */
  per100g: Per100g;
  /** De dónde salieron los números (ej. "USDA: Bananas, raw"). */
  match?: string;
  note?: string;
  /** false si no se encontró nada (valores en 0). */
  found: boolean;
  /** De dónde sale cada cosa (para mostrarlo claro después de Calcular). */
  origin: {
    values: "propio" | "usda" | "off" | "ia" | "ninguno";
    valuesDetail?: string;
    qty: "escrita" | "porcion" | "supuesta" | "ia";
    qtyDetail: string;
    /** el texto lo interpretó la IA (las reglas no alcanzaron) */
    parsedByAi: boolean;
  };
};

export type Settings = {
  kcal: number;
  protein: number;
  rangeLow: number; // % de la meta (ej. 80)
  rangeHigh: number; // % de la meta (ej. 110)
  weightKg: number | null;
  heightCm: number | null;
  stepsGoal: number;
  waterGoalMl: number | null; // null = automático según el peso
  aiMode: AiMode;
  /** tus vasos de siempre (botones para sumar agua de un toque) */
  cups: Cup[];
};

export type Cup = { name: string; ml: number };

/** Uso de IA: "auto" la usa sola, "ask" solo cuando tocás "Completar con IA", "off" nunca. */
export type AiMode = "auto" | "ask" | "off";

/** Tope de pedidos a la IA por usuario y por día (el plan gratis de Gemini da 500 por día en total). */
export const AI_DAILY_CAP = 40;

export type AiStatus = {
  mode: AiMode;
  /** pedidos hechos en este cálculo */
  used: number;
  usedToday: number;
  cap: number;
  /** datos que la IA podría completar y quedaron pendientes */
  pending: number;
  blocked: "tope" | "apagada" | null;
  /** qué quedó pendiente (para mostrar antes de pedir permiso) */
  pendingNames?: string[];
  /** cuántos pedidos haría completar lo pendiente (1 o 2) */
  callsNeeded?: number;
  /** si en este cálculo Google rechazó el pedido */
  failed?: AiProblem["kind"] | null;
};

/** Último problema con Google: "minuto"/"dia" = límite de la clave, "clave" = clave inválida, "error" = Google falló. */
export type AiProblem = { kind: "minuto" | "dia" | "clave" | "error"; at: number; until?: number };

/** Estado de la IA ANTES de usarla (no gasta cuota). */
export type AiHealth = {
  mode: AiMode;
  usedToday: number;
  cap: number;
  /** conexión con Google: se consulta el modelo, sin generar nada */
  connection: "ok" | "clave" | "modelo" | "sin_conexion" | "sin_clave" | "apagada";
  model: string;
  /** freno propio por minuto */
  minute: { free: number; max: number; waitSec: number };
  problem: AiProblem | null;
  canUse: boolean;
  /** por qué no se puede (si canUse es false) */
  reason: string | null;
  checkedAt: number;
};

export type WaterRow = { id: string; date: string; ml: number; drank_at: string };

export type StepsRow = {
  id: string;
  date: string;
  kind: "dia" | "caminadora";
  steps: number;
  minutes: number | null;
  speed_kmh: number | null;
  distance_km: number | null;
  created_at: string;
};

/** Ejercicio de una rutina. kg = peso objetivo (opcional), restSec = descanso entre series. */
export type RoutineExercise = { name: string; sets: number; reps: number; kg?: number | null; restSec?: number; muscle?: string };
export type RoutineRow = { id: string; name: string; exercises: RoutineExercise[] };

export type WeightRow = { id: string; date: string; kg: number };

/** Ejercicio tuyo (o un cambio a uno de la lista de la app). */
export type ExerciseRow = { id: string; name: string; muscle: string; step: number; base: string | null; hidden: boolean };

/** warmup = serie de calentamiento (no cuenta para volumen ni récords). */
export type WorkoutSet = { reps: number | null; kg: number | null; done: boolean; warmup?: boolean };
export type WorkoutExercise = { name: string; sets: WorkoutSet[]; muscle?: string; restSec?: number };
export type WorkoutRow = {
  id: string;
  date: string;
  routine_id: string | null;
  name: string;
  exercises: WorkoutExercise[];
  started_at: string;
  finished_at: string | null;
};
