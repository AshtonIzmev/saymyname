// ==========================================================================
// JEU DE DÉPART. Semé une fois, dans les deux paquets, avec des emoji en
// attendant les photos du parent et les dessins MultiPic / BOSS.
// Identifiants déterministes (« word-chien », « letter-B ») : stables d'un
// appareil à l'autre, lisibles dans une sauvegarde.
// ==========================================================================
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.Graines = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CATEGORIES = {
    animal: "Animaux", nourriture: "Nourriture", corps: "Corps", vetement: "Vêtements",
    objet: "Objets", vehicule: "Véhicules", nature: "Nature", couleur: "Couleurs",
    forme: "Formes", famille: "Famille", lieu: "Lieux", action: "Actions",
  };
  const SOURCES = { photo: "Photo", multipic: "MultiPic", boss: "BOSS", emoji: "Emoji", ia: "IA" };

  // [ emoji, mot (minuscules), catégorie ]
  const MOTS = [
    ["🐕", "chien", "animal"],
    ["🐈", "chat", "animal"],
    ["🐄", "vache", "animal"],
    ["🐖", "cochon", "animal"],
    ["🐑", "mouton", "animal"],
    ["🐔", "poule", "animal"],
    ["🐴", "cheval", "animal"],
    ["🐰", "lapin", "animal"],
    ["🐭", "souris", "animal"],
    ["🐦", "oiseau", "animal"],
    ["🦆", "canard", "animal"],
    ["🐟", "poisson", "animal"],
    ["🐢", "tortue", "animal"],
    ["🐸", "grenouille", "animal"],
    ["🐝", "abeille", "animal"],
    ["🦋", "papillon", "animal"],
    ["🐘", "éléphant", "animal"],
    ["🦒", "girafe", "animal"],
    ["🦁", "lion", "animal"],
    ["🐒", "singe", "animal"],
    ["🐻", "ours", "animal"],
    ["🦓", "zèbre", "animal"],

    ["🍎", "pomme", "nourriture"],
    ["🍌", "banane", "nourriture"],
    ["🍊", "orange", "nourriture"],
    ["🍓", "fraise", "nourriture"],
    ["🍇", "raisin", "nourriture"],
    ["🍐", "poire", "nourriture"],
    ["🍒", "cerise", "nourriture"],
    ["🍉", "pastèque", "nourriture"],
    ["🥕", "carotte", "nourriture"],
    ["🍅", "tomate", "nourriture"],
    ["🥔", "pomme de terre", "nourriture"],
    ["🌽", "maïs", "nourriture"],
    ["🥦", "brocoli", "nourriture"],
    ["🍞", "pain", "nourriture"],
    ["🧀", "fromage", "nourriture"],
    ["🥚", "œuf", "nourriture"],
    ["🥛", "lait", "nourriture"],
    ["🍪", "biscuit", "nourriture"],
    ["🍦", "glace", "nourriture"],
    ["🎂", "gâteau", "nourriture"],

    ["👁️", "œil", "corps"],
    ["👃", "nez", "corps"],
    ["👂", "oreille", "corps"],
    ["👄", "bouche", "corps"],
    ["🦷", "dent", "corps"],
    ["👅", "langue", "corps"],
    ["✋", "main", "corps"],
    ["🦶", "pied", "corps"],
    ["🦵", "jambe", "corps"],
    ["💪", "bras", "corps"],
    ["👶", "bébé", "corps"],

    ["👕", "tee-shirt", "vetement"],
    ["👖", "pantalon", "vetement"],
    ["👗", "robe", "vetement"],
    ["🧦", "chaussette", "vetement"],
    ["👟", "chaussure", "vetement"],
    ["🧢", "casquette", "vetement"],
    ["🧥", "manteau", "vetement"],
    ["🧤", "gants", "vetement"],
    ["🧣", "écharpe", "vetement"],
    ["🎩", "chapeau", "vetement"],

    ["🪑", "chaise", "objet"],
    ["🛏️", "lit", "objet"],
    ["⚽", "ballon", "objet"],
    ["🧸", "nounours", "objet"],
    ["🥄", "cuillère", "objet"],
    ["🍽️", "assiette", "objet"],
    ["🥣", "bol", "objet"],
    ["☕", "tasse", "objet"],
    ["🍼", "biberon", "objet"],
    ["🔑", "clé", "objet"],
    ["💡", "lampe", "objet"],
    ["📖", "livre", "objet"],
    ["🎈", "ballon de baudruche", "objet"],
    ["☂️", "parapluie", "objet"],
    ["🪥", "brosse à dents", "objet"],
    ["🛁", "bain", "objet"],

    ["🚗", "voiture", "vehicule"],
    ["🚌", "bus", "vehicule"],
    ["🚲", "vélo", "vehicule"],
    ["🚂", "train", "vehicule"],
    ["✈️", "avion", "vehicule"],
    ["⛵", "bateau", "vehicule"],
    ["🚜", "tracteur", "vehicule"],
    ["🚒", "camion de pompiers", "vehicule"],
    ["🚁", "hélicoptère", "vehicule"],
    ["🏍️", "moto", "vehicule"],

    ["🌳", "arbre", "nature"],
    ["🌸", "fleur", "nature"],
    ["☀️", "soleil", "nature"],
    ["🌙", "lune", "nature"],
    ["☁️", "nuage", "nature"],
    ["🌧️", "pluie", "nature"],
    ["❄️", "neige", "nature"],
    ["🍃", "feuille", "nature"],

    ["🔴", "rouge", "couleur"],
    ["🔵", "bleu", "couleur"],
    ["🟡", "jaune", "couleur"],
    ["🟢", "vert", "couleur"],
    ["🟠", "orange (couleur)", "couleur"],
    ["🟣", "violet", "couleur"],
    ["⚫", "noir", "couleur"],
    ["⚪", "blanc", "couleur"],

    ["⭕", "rond", "forme"],
    ["🟦", "carré", "forme"],
    ["🔺", "triangle", "forme"],
    ["⭐", "étoile", "forme"],
    ["❤️", "cœur", "forme"],
  ];

  // [ lettre, mot compagnon, emoji ]
  // Premier son sans ambiguïté en français : ni « ch », ni « ph », ni h muet.
  // H n'a pas de son en français ; « hibou » est le moins mauvais compagnon
  // et la carte porte une note pour que le parent décide.
  const LETTRES = [
    ["A", "ananas", "🍍"],
    ["B", "bateau", "⛵"],
    ["C", "canard", "🦆"],
    ["D", "dauphin", "🐬"],
    ["E", "escargot", "🐌"],
    ["F", "fraise", "🍓"],
    ["G", "gâteau", "🎂"],
    ["H", "hibou", "🦉"],
    ["I", "île", "🏝️"],
    ["J", "jus", "🧃"],
    ["K", "koala", "🐨"],
    ["L", "lion", "🦁"],
    ["M", "maison", "🏠"],
    ["N", "nuage", "☁️"],
    ["O", "orange", "🍊"],
    ["P", "pomme", "🍎"],
    ["Q", "quille", "🎳"],
    ["R", "renard", "🦊"],
    ["S", "soleil", "☀️"],
    ["T", "tortue", "🐢"],
    ["U", "usine", "🏭"],
    ["V", "vache", "🐄"],
    ["W", "wagon", "🚃"],
    ["X", "xylophone", "🎶"],
    ["Y", "yoyo", "🪀"],
    ["Z", "zèbre", "🦓"],
  ];

  // [ chiffre, mot, objets (une image par objet, répétée N fois) ]
  // Les objets varient d'une image à l'autre pour que le nombre s'attache à la
  // quantité, pas au dessin.
  const NOMBRES = [
    [1, "un", ["🍎", "🐟", "🚗"]],
    [2, "deux", ["🐦", "☕", "👟"]],
    [3, "trois", ["⚽", "🌸", "🐞"]],
    [4, "quatre", ["🍓", "⭐", "🦆"]],
    [5, "cinq", ["🍌", "🎈", "🐢"]],
  ];

  const NOTES_LETTRES = {
    H: "H ne se prononce pas en français : choisir le compagnon à la main.",
    X: "Pas d'emoji xylophone : image à remplacer.",
  };

  function idDe(type, cle) {
    return type + "-" + String(cle).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/œ/g, "oe").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function carte(id, type, label, category, extras, emojis, note) {
    return {
      id, type, label, category, extras,
      source: "emoji", note: note || "", created_at: 0,
      suspended: false, suspended_until: null, updated_at: 0,
      images: emojis.map((e, i) => ({ id: id + "-img" + i, emoji: e, media: null, is_primary: i === 0, order: i })),
    };
  }

  function cartesDeDepart() {
    const cartes = [];
    for (const [emoji, mot, cat] of MOTS) {
      // « orange (couleur) » : la précision sert au parent, pas à l'enfant.
      const label = mot.replace(/\s*\(.*\)$/, "");
      cartes.push(carte(idDe("word", mot), "word", label, cat, {}, [emoji]));
    }
    for (const [lettre, mot, emoji] of LETTRES)
      cartes.push(carte("letter-" + lettre, "letter", mot, null, { letter: lettre }, [emoji], NOTES_LETTRES[lettre]));
    for (const [chiffre, mot, objets] of NOMBRES)
      cartes.push(carte("number-" + chiffre, "number", mot, null, { digit: chiffre }, objets));
    return cartes;
  }

  function paquetsDeDepart() {
    return [
      { id: "deck-1", name: "Jumeau 1", photo: null, daily_cap: 10, updated_at: 0 },
      { id: "deck-2", name: "Jumeau 2", photo: null, daily_cap: 10, updated_at: 0 },
    ];
  }

  return { CATEGORIES, SOURCES, MOTS, LETTRES, NOMBRES, cartesDeDepart, paquetsDeDepart, idDe };
});
