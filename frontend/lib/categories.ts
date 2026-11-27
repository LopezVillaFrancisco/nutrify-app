/**
 * Tipo de alimento para ordenar la pantalla Comida. Se adivina por el nombre ("Bife angosto" → Carnes)
 * y se puede elegir a mano en el alimento (columna foods.category).
 */
export type FoodCategory = "carnes" | "harinas" | "lacteos" | "frutas" | "desayuno" | "suplementos" | "bebidas" | "otros";

export const CATEGORIES: { key: FoodCategory; label: string; short: string }[] = [
  { key: "carnes", label: "Carnes, pollo y pescado", short: "Carnes" },
  { key: "harinas", label: "Pastas, arroz, panes y tartas", short: "Pastas y harinas" },
  { key: "lacteos", label: "Lácteos y huevos", short: "Lácteos y huevos" },
  { key: "frutas", label: "Frutas y verduras", short: "Frutas y verduras" },
  { key: "desayuno", label: "Desayuno y snacks", short: "Desayuno y snacks" },
  { key: "suplementos", label: "Suplementos", short: "Suplementos" },
  { key: "bebidas", label: "Bebidas", short: "Bebidas" },
  { key: "otros", label: "Otros", short: "Otros" },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<FoodCategory, string>;

const WORDS: [FoodCategory, string[]][] = [
  [
    "carnes",
    ["carne", "bife", "lomo", "asado", "vacio", "matambre", "entrana", "nalga", "peceto", "cuadril", "picada", "hamburguesa", "milanesa",
      "pollo", "suprema", "pechuga", "muslo", "pavo", "cerdo", "bondiola", "chorizo", "salchicha", "jamon", "pescado", "merluza", "atun",
      "salmon", "langostino", "camaron", "calamar", "albondiga"],
  ],
  [
    "harinas",
    ["fideo", "pasta", "tallarin", "noqui", "raviol", "sorrentino", "lasagna", "arroz", "risotto", "pan", "tostada", "tarta", "pizza",
      "empanada", "sandwich", "sanguche", "polenta", "quinoa", "cuscus", "papa", "pure", "batata", "lenteja", "garbanzo", "poroto", "guiso"],
  ],
  ["lacteos", ["leche", "yogur", "yogurt", "queso", "ricota", "manteca", "crema", "huevo", "clara", "omelette", "tortilla"]],
  [
    "frutas",
    ["banana", "manzana", "naranja", "mandarina", "pera", "durazno", "frutilla", "uva", "kiwi", "anana", "sandia", "melon", "mango",
      "arandano", "fruta", "ensalada", "lechuga", "tomate", "zanahoria", "zapallo", "zapallito", "calabaza", "brocoli", "espinaca", "verdura",
      "palta", "cebolla", "morron", "pepino", "choclo"],
  ],
  [
    "desayuno",
    ["pancake", "panqueque", "avena", "granola", "cereal", "copos", "galletita", "galleta", "alfajor", "barrita", "medialuna", "factura",
      "mermelada", "dulce de leche", "miel", "chocolate", "mani", "almendra", "nuez", "nueces", "torta", "budin", "helado"],
  ],
  ["suplementos", ["whey", "proteina", "creatina", "suplemento", "colageno", "bcaa", "caseina"]],
  ["bebidas", ["jugo", "gaseosa", "coca", "cerveza", "vino", "cafe", "te", "mate", "licuado", "batido", "bebida", "isotonica", "gatorade"]],
];

const strip = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** Adivina el tipo por la palabra clave que aparece PRIMERO ("Milanesa de pollo con queso" → carnes, no lácteos). */
export function guessCategory(name: string): FoodCategory {
  const n = strip(name);
  let best: { cat: FoodCategory; at: number } | null = null;
  for (const [cat, words] of WORDS) {
    for (const w of words) {
      // palabra entera (con plural): "pan" no es "pancake"
      const m = new RegExp(` ${w}(?:s|es)? `).exec(n);
      const at = m ? m.index : -1;
      if (at >= 0 && (!best || at < best.at)) best = { cat, at };
    }
  }
  return best?.cat ?? "otros";
}

export function categoryOf(food: { name: string; category?: string | null }): FoodCategory {
  const c = food.category as FoodCategory | null | undefined;
  return c && c in CATEGORY_LABEL ? c : guessCategory(food.name);
}
