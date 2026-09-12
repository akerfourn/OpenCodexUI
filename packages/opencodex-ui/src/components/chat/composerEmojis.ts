import type { OpenCodexEmojiCatalogOverrides } from "@open-codex-ui/opencodex-protocol";

/** Curated Unicode emojis that help express tone in a chat message. */
export const COMPOSER_EMOJI_CATEGORIES = {
  emotions: [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
    "😊", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘",
    "😋", "😛", "😜", "🤪", "🤨", "🧐", "😎", "🤩",
    "🥳", "😏", "😞", "😔", "😟", "😕", "🙁", "☹️",
    "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤",
    "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱",
    "😨", "😰", "😥", "😓", "🤗", "🤔", "🫡", "🤭",
    "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯",
    "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪",
    "😵", "🤐", "🤑", "🤠", "😈", "👿", "🤡", "💩",
    "👻", "💀", "👽", "🤖", "😺", "😸", "😹", "😻",
    "😼", "😽", "🙀", "😿", "😾"
  ],
  reactions: [
    "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙",
    "👏", "🙌", "👐", "🤝", "🙏", "💪", "👀", "💯",
    "🔥", "✨", "✅", "❌", "💡", "🎉", "❤️", "🧡",
    "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "💕", "💖", "💗", "💓", "💘", "💝", "💟", "❗",
    "❓", "⁉️", "‼️", "⭐", "🌟", "🎯", "🚀", "☕"
  ]
} as const;

export type ComposerEmojiCategoryId = keyof typeof COMPOSER_EMOJI_CATEGORIES;

/** Multiple French and English search terms for the most useful chat emojis. */
export const COMPOSER_EMOJI_ALIASES: Record<string, readonly string[]> = {
  "😀": ["joie", "bonheur", "heureux", "sourire", "smile", "happy"],
  "😃": ["joie", "sourire", "content", "heureux", "smile", "happy"],
  "😄": ["joie", "sourire", "rire", "content", "joy", "smile"],
  "😁": ["sourire", "content", "satisfait", "grin"],
  "😆": ["rire", "amusé", "humour", "laughing", "funny"],
  "😅": ["gêne", "embarras", "maladresse", "oups", "soulagement", "rire nerveux", "awkward"],
  "😂": ["rire", "hilarité", "drôle", "humour", "lol", "laughing", "funny"],
  "🤣": ["fou rire", "hilarité", "mort de rire", "rofl", "lol"],
  "😊": ["content", "heureux", "douceur", "sourire", "tendre", "blush"],
  "🙂": ["sourire", "calme", "neutre", "okay", "smile"],
  "🙃": ["ironie", "sarcasme", "second degré", "à l'envers", "irony"],
  "😉": ["clin d'œil", "complice", "wink", "ironie"],
  "😍": ["amour", "amoureux", "admiration", "love"],
  "🥰": ["tendresse", "affection", "amour", "adoration", "love"],
  "😘": ["bisou", "baiser", "kiss", "amour"],
  "😋": ["miam", "délicieux", "gourmand", "yum"],
  "😜": ["taquin", "blague", "espiègle", "tongue", "playful"],
  "🤪": ["folie", "bizarre", "fou", "dingue", "crazy", "weird"],
  "🤨": ["sceptique", "doute", "suspicion", "vraiment", "suspicious"],
  "🧐": ["analyse", "inspecter", "observation", "enquête", "analyser"],
  "😎": ["cool", "confiance", "lunettes", "classe", "cool"],
  "🤩": ["impressionné", "émerveillement", "wow", "star", "impressed"],
  "🥳": ["fête", "célébration", "anniversaire", "party", "celebration"],
  "😏": ["malice", "sous-entendu", "sourire en coin", "smug"],
  "😞": ["déçu", "déception", "tristesse", "disappointed"],
  "😔": ["regret", "triste", "mélancolie", "sad", "regret"],
  "😟": ["inquiétude", "préoccupé", "souci", "worried"],
  "😕": ["confusion", "perplexe", "ne comprend pas", "confused"],
  "🙁": ["tristesse", "déception", "pas content", "sad"],
  "☹️": ["triste", "chagrin", "tristesse", "sad"],
  "😣": ["douleur", "difficulté", "souffrance", "pain"],
  "😖": ["frustration", "exaspération", "difficulté", "frustrated"],
  "😫": ["fatigue", "épuisement", "ras-le-bol", "tired", "exhausted"],
  "😩": ["fatigue", "épuisement", "ras-le-bol", "lassitude", "tired"],
  "🥺": ["implorer", "supplication", "pitié", "s'il te plaît", "please"],
  "😢": ["tristesse", "larme", "pleurer", "sad", "cry"],
  "😭": ["pleurs", "désespoir", "très triste", "crying", "sob"],
  "😤": ["frustration", "agacement", "énervement", "colère contenue", "frustrated"],
  "😠": ["colère", "fâché", "énervé", "angry"],
  "😡": ["colère", "rage", "furieux", "angry", "rage"],
  "🤬": ["grossièreté", "juron", "rage", "insulte", "swearing"],
  "🤯": ["choc", "bouleversement", "incroyable", "mind blown", "shocked"],
  "😳": ["gêne", "honte", "surpris", "embarrassed", "blush"],
  "🥵": ["chaud", "stress", "chaleur", "hot"],
  "🥶": ["froid", "gelé", "glacé", "cold"],
  "😱": ["peur", "panique", "horreur", "scream", "fear"],
  "😨": ["peur", "inquiétude", "effrayé", "afraid", "fear"],
  "😰": ["anxiété", "stress", "inquiétude", "anxious", "stress"],
  "😥": ["soulagement", "inquiétude", "effort", "relief"],
  "😓": ["effort", "stress", "sueur", "difficile", "sweat"],
  "🤗": ["câlin", "accueil", "affection", "hug"],
  "🤔": ["réflexion", "question", "doute", "incertitude", "penser", "thinking"],
  "🫡": ["respect", "obéir", "saluer", "respect"],
  "🤭": ["rire discret", "oups", "secret", "gêné", "giggle"],
  "🤫": ["silence", "chut", "secret", "silencieux", "shh"],
  "🤥": ["mensonge", "menteur", "mensonge", "lying", "liar"],
  "😶": ["silence", "sans voix", "muet", "speechless"],
  "😐": ["neutre", "indifférence", "bof", "neutral"],
  "😑": ["lassitude", "exaspération", "sans commentaire", "unamused"],
  "😬": ["malaise", "gêne", "grimace", "awkward"],
  "🙄": ["exaspération", "roulement des yeux", "ironie", "eye roll"],
  "😯": ["surprise", "étonnement", "surprised"],
  "😮": ["surprise", "étonnement", "wow", "surprised"],
  "😲": ["choc", "étonnement", "surprise", "shocked"],
  "🥱": ["bâillement", "fatigue", "ennui", "yawn", "bored"],
  "😴": ["sommeil", "dormir", "fatigue", "sleep"],
  "🤤": ["envie", "gourmandise", "appétit", "drool"],
  "😪": ["sommeil", "fatigue", "dormir", "sleepy"],
  "😵": ["étourdi", "confusion", "vertige", "dizzy"],
  "🤐": ["secret", "bouche cousue", "silence", "zipper"],
  "😈": ["diable", "malicieux", "méchant", "devil", "naughty"],
  "👿": ["colère", "diable", "furieux", "angry", "devil"],
  "🤡": ["clown", "ridicule", "absurde", "clown"],
  "💀": ["mort", "mort de rire", "épuisé", "skull", "dead"],
  "👍": ["oui", "accord", "approuver", "bravo", "like", "yes", "ok"],
  "👎": ["non", "désaccord", "refus", "dislike", "no"],
  "👌": ["okay", "parfait", "correct", "d'accord", "ok"],
  "✌️": ["paix", "victoire", "peace", "victory"],
  "🤞": ["espoir", "chance", "doigts croisés", "croiser les doigts", "fingers crossed"],
  "👏": ["bravo", "applaudissements", "félicitations", "clap", "congratulations"],
  "🙌": ["joie", "célébration", "hourra", "hurray", "celebration"],
  "🤝": ["accord", "collaboration", "partenariat", "poignée de main", "deal"],
  "🙏": ["merci", "prière", "s'il te plaît", "reconnaissance", "thanks", "please"],
  "💪": ["force", "courage", "motivation", "muscle", "strength"],
  "👀": ["regarder", "curieux", "attention", "voir", "eyes", "look"],
  "💯": ["parfait", "cent pour cent", "excellent", "100", "perfect"],
  "🔥": ["feu", "excellent", "chaud", "tendance", "fire", "hot"],
  "✨": ["magie", "brillant", "important", "étincelle", "sparkles"],
  "✅": ["validé", "terminé", "succès", "check", "done", "success"],
  "❌": ["erreur", "non", "refus", "faux", "error", "no"],
  "💡": ["idée", "idée lumineuse", "solution", "ampoule", "idea"],
  "🎉": ["fête", "bravo", "succès", "célébration", "party", "success"],
  "❤️": ["amour", "cœur", "affection", "j'aime", "love", "heart"],
  "💔": ["tristesse", "rupture", "cœur brisé", "heartbreak", "broken heart"],
  "❗": ["important", "attention", "alerte", "exclamation", "important"],
  "❓": ["question", "doute", "interrogation", "question"],
  "⁉️": ["confusion", "question", "surprise", "confused"],
  "⭐": ["important", "favori", "étoile", "star", "favorite"],
  "🌟": ["super", "brillant", "étoile", "star", "shining"],
  "🎯": ["objectif", "précis", "cible", "target", "goal"],
  "🚀": ["lancement", "rapide", "progrès", "fusée", "launch", "progress"],
  "☕": ["café", "pause", "boisson", "coffee", "break"]
};

/** Returns the curated emoji catalogue in stable picker order. */
export function getComposerEmojis(): string[] {
  return Array.from(new Set([
    ...COMPOSER_EMOJI_CATEGORIES.emotions,
    ...COMPOSER_EMOJI_CATEGORIES.reactions
  ]));
}

/** Returns the built-in aliases for one emoji without user customizations. */
export function getDefaultComposerEmojiAliases(emoji: string): string[] {
  return [...(COMPOSER_EMOJI_ALIASES[emoji] ?? [])];
}

/** Returns built-in and user-added aliases after applying user removals. */
export function getComposerEmojiAliases(
  emoji: string,
  overrides?: OpenCodexEmojiCatalogOverrides
): string[] {
  const defaultAliases = getDefaultComposerEmojiAliases(emoji);
  const override = overrides?.overrides[emoji];
  const removedAliases = new Set(
    (override?.removedDefaultAliases ?? []).map(normalizeComposerEmojiSearchText)
  );
  const aliases = defaultAliases.filter((alias) => (
    !removedAliases.has(normalizeComposerEmojiSearchText(alias))
  ));

  for (const alias of override?.addedAliases ?? []) {
    const trimmedAlias = alias.trim();

    if (trimmedAlias.length > 0 && !containsNormalizedAlias(aliases, trimmedAlias)) {
      aliases.push(trimmedAlias);
    }
  }

  return aliases;
}

/** Normalizes accents and case for aliases and search terms. */
export function normalizeComposerEmojiSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .trim();
}

/** Checks whether an alias already exists with a different accent or case. */
function containsNormalizedAlias(aliases: readonly string[], candidate: string): boolean {
  const normalizedCandidate = normalizeComposerEmojiSearchText(candidate);
  return aliases.some((alias) => normalizeComposerEmojiSearchText(alias) === normalizedCandidate);
}
