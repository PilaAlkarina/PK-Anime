// Shared by the server catalog and client components, so it must stay free of server imports

// AniList categories look like "Theme-Fantasy" or "Cast-Main Cast"; the first part is translated
const CATEGORY_ROOTS: Record<string, string> = {
  Cast: "Reparto",
  Demographic: "Público",
  Setting: "Ambientación",
  Technical: "Técnica",
  Theme: "Temática",
  "Sexual Content": "Contenido sexual",
  Other: "Otros",
};

const SUBCATEGORIES: Record<string, string> = {
  "Main Cast": "protagonistas",
  Traits: "rasgos",
  Scene: "lugar",
  Time: "época",
  Universe: "universo",
  Action: "acción",
  Arts: "artes",
  Music: "música",
  Comedy: "comedia",
  Drama: "drama",
  Fantasy: "fantasía",
  Game: "juegos",
  Sport: "deporte",
  "Card & Board Game": "cartas y tablero",
  Other: "otros",
  Organisations: "organizaciones",
  Vehicle: "vehículos",
  Romance: "romance",
  "Sci-Fi": "ciencia ficción",
  Mecha: "mecha",
  "Slice of Life": "recuentos de la vida",
};

/** "Theme-Game-Sport" → "Temática · juegos · deporte" */
export function tagCategoryLabel(category: string) {
  const [root, ...rest] = category.split("-");
  return [CATEGORY_ROOTS[root] || root, ...rest.map((part) => SUBCATEGORIES[part] || part)].join(" · ");
}

/**
 * Tags offered as one-press chips on the TV, where browsing ~360 by name with a remote is
 * impractical. The web screens search the whole collection.
 */
export const POPULAR_TAGS = [
  "Isekai",
  "Reincarnation",
  "Time Travel",
  "Magic",
  "Super Power",
  "Martial Arts",
  "Swordplay",
  "Military",
  "Historical",
  "School",
  "School Club",
  "Female Protagonist",
  "Male Protagonist",
  "Ensemble Cast",
  "Shounen",
  "Seinen",
  "Shoujo",
  "Josei",
  "Tragedy",
  "Survival",
  "Gore",
  "Revenge",
  "Iyashikei",
  "Coming of Age",
  "Found Family",
  "Love Triangle",
  "Idol",
  "Food",
  "Demons",
  "Vampire",
  "Space",
  "Cyberpunk",
  "Post-Apocalyptic",
  "Dystopian",
  "Detective",
  "Video Games",
];
