// ==========================================================================
// JEU DE DÉPART. Semé une fois, dans les deux paquets, avec des emoji en
// attendant les photos du parent et les dessins MultiPic / BOSS.
// Identifiants déterministes (« word-chien », « letter-B ») : la tablette et
// le serveur sèment chacun de leur côté sans créer de doublons.
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

  // [ emoji, mot (minuscules), ce que dit la voix, catégorie ]
  const MOTS = [
    ["🐕", "chien", "le chien", "animal"],
    ["🐈", "chat", "le chat", "animal"],
    ["🐄", "vache", "la vache", "animal"],
    ["🐖", "cochon", "le cochon", "animal"],
    ["🐑", "mouton", "le mouton", "animal"],
    ["🐔", "poule", "la poule", "animal"],
    ["🐴", "cheval", "le cheval", "animal"],
    ["🐰", "lapin", "le lapin", "animal"],
    ["🐭", "souris", "la souris", "animal"],
    ["🐦", "oiseau", "l'oiseau", "animal"],
    ["🦆", "canard", "le canard", "animal"],
    ["🐟", "poisson", "le poisson", "animal"],
    ["🐢", "tortue", "la tortue", "animal"],
    ["🐸", "grenouille", "la grenouille", "animal"],
    ["🐝", "abeille", "l'abeille", "animal"],
    ["🦋", "papillon", "le papillon", "animal"],
    ["🐘", "éléphant", "l'éléphant", "animal"],
    ["🦒", "girafe", "la girafe", "animal"],
    ["🦁", "lion", "le lion", "animal"],
    ["🐒", "singe", "le singe", "animal"],
    ["🐻", "ours", "l'ours", "animal"],
    ["🦓", "zèbre", "le zèbre", "animal"],

    ["🍎", "pomme", "la pomme", "nourriture"],
    ["🍌", "banane", "la banane", "nourriture"],
    ["🍊", "orange", "l'orange", "nourriture"],
    ["🍓", "fraise", "la fraise", "nourriture"],
    ["🍇", "raisin", "le raisin", "nourriture"],
    ["🍐", "poire", "la poire", "nourriture"],
    ["🍒", "cerise", "la cerise", "nourriture"],
    ["🍉", "pastèque", "la pastèque", "nourriture"],
    ["🥕", "carotte", "la carotte", "nourriture"],
    ["🍅", "tomate", "la tomate", "nourriture"],
    ["🥔", "pomme de terre", "la pomme de terre", "nourriture"],
    ["🌽", "maïs", "le maïs", "nourriture"],
    ["🥦", "brocoli", "le brocoli", "nourriture"],
    ["🍞", "pain", "le pain", "nourriture"],
    ["🧀", "fromage", "le fromage", "nourriture"],
    ["🥚", "œuf", "l'œuf", "nourriture"],
    ["🥛", "lait", "le lait", "nourriture"],
    ["🍪", "biscuit", "le biscuit", "nourriture"],
    ["🍦", "glace", "la glace", "nourriture"],
    ["🎂", "gâteau", "le gâteau", "nourriture"],

    ["👁️", "œil", "l'œil", "corps"],
    ["👃", "nez", "le nez", "corps"],
    ["👂", "oreille", "l'oreille", "corps"],
    ["👄", "bouche", "la bouche", "corps"],
    ["🦷", "dent", "la dent", "corps"],
    ["👅", "langue", "la langue", "corps"],
    ["✋", "main", "la main", "corps"],
    ["🦶", "pied", "le pied", "corps"],
    ["🦵", "jambe", "la jambe", "corps"],
    ["💪", "bras", "le bras", "corps"],
    ["👶", "bébé", "le bébé", "corps"],

    ["👕", "tee-shirt", "le tee-shirt", "vetement"],
    ["👖", "pantalon", "le pantalon", "vetement"],
    ["👗", "robe", "la robe", "vetement"],
    ["🧦", "chaussette", "la chaussette", "vetement"],
    ["👟", "chaussure", "la chaussure", "vetement"],
    ["🧢", "casquette", "la casquette", "vetement"],
    ["🧥", "manteau", "le manteau", "vetement"],
    ["🧤", "gants", "les gants", "vetement"],
    ["🧣", "écharpe", "l'écharpe", "vetement"],
    ["🎩", "chapeau", "le chapeau", "vetement"],

    ["🪑", "chaise", "la chaise", "objet"],
    ["🛏️", "lit", "le lit", "objet"],
    ["⚽", "ballon", "le ballon", "objet"],
    ["🧸", "nounours", "le nounours", "objet"],
    ["🥄", "cuillère", "la cuillère", "objet"],
    ["🍽️", "assiette", "l'assiette", "objet"],
    ["🥣", "bol", "le bol", "objet"],
    ["☕", "tasse", "la tasse", "objet"],
    ["🍼", "biberon", "le biberon", "objet"],
    ["🔑", "clé", "la clé", "objet"],
    ["💡", "lampe", "la lampe", "objet"],
    ["📖", "livre", "le livre", "objet"],
    ["🎈", "ballon de baudruche", "le ballon", "objet"],
    ["☂️", "parapluie", "le parapluie", "objet"],
    ["🪥", "brosse à dents", "la brosse à dents", "objet"],
    ["🛁", "bain", "le bain", "objet"],

    ["🚗", "voiture", "la voiture", "vehicule"],
    ["🚌", "bus", "le bus", "vehicule"],
    ["🚲", "vélo", "le vélo", "vehicule"],
    ["🚂", "train", "le train", "vehicule"],
    ["✈️", "avion", "l'avion", "vehicule"],
    ["⛵", "bateau", "le bateau", "vehicule"],
    ["🚜", "tracteur", "le tracteur", "vehicule"],
    ["🚒", "camion de pompiers", "le camion de pompiers", "vehicule"],
    ["🚁", "hélicoptère", "l'hélicoptère", "vehicule"],
    ["🏍️", "moto", "la moto", "vehicule"],

    ["🌳", "arbre", "l'arbre", "nature"],
    ["🌸", "fleur", "la fleur", "nature"],
    ["☀️", "soleil", "le soleil", "nature"],
    ["🌙", "lune", "la lune", "nature"],
    ["☁️", "nuage", "le nuage", "nature"],
    ["🌧️", "pluie", "la pluie", "nature"],
    ["❄️", "neige", "la neige", "nature"],
    ["🍃", "feuille", "la feuille", "nature"],

    ["🔴", "rouge", "rouge", "couleur"],
    ["🔵", "bleu", "bleu", "couleur"],
    ["🟡", "jaune", "jaune", "couleur"],
    ["🟢", "vert", "vert", "couleur"],
    ["🟠", "orange (couleur)", "orange", "couleur"],
    ["🟣", "violet", "violet", "couleur"],
    ["⚫", "noir", "noir", "couleur"],
    ["⚪", "blanc", "blanc", "couleur"],

    ["⭕", "rond", "le rond", "forme"],
    ["🟦", "carré", "le carré", "forme"],
    ["🔺", "triangle", "le triangle", "forme"],
    ["⭐", "étoile", "l'étoile", "forme"],
    ["❤️", "cœur", "le cœur", "forme"],
  ];

  // [ lettre, mot compagnon, emoji, son (pour la voix de secours) ]
  // Premier son sans ambiguïté en français : ni « ch », ni « ph », ni h muet.
  // H n'a pas de son en français ; « hibou » est le moins mauvais compagnon
  // et la carte porte une note pour que le parent décide.
  const LETTRES = [
    ["A", "ananas", "🍍", "a"],
    ["B", "bateau", "⛵", "beu"],
    ["C", "canard", "🦆", "keu"],
    ["D", "dauphin", "🐬", "deu"],
    ["E", "escargot", "🐌", "è"],
    ["F", "fraise", "🍓", "feu"],
    ["G", "gâteau", "🎂", "gueu"],
    ["H", "hibou", "🦉", "hache"],
    ["I", "île", "🏝️", "i"],
    ["J", "jus", "🧃", "jeu"],
    ["K", "koala", "🐨", "keu"],
    ["L", "lion", "🦁", "leu"],
    ["M", "maison", "🏠", "meu"],
    ["N", "nuage", "☁️", "neu"],
    ["O", "orange", "🍊", "o"],
    ["P", "pomme", "🍎", "peu"],
    ["Q", "quille", "🎳", "keu"],
    ["R", "renard", "🦊", "reu"],
    ["S", "soleil", "☀️", "seu"],
    ["T", "tortue", "🐢", "teu"],
    ["U", "usine", "🏭", "u"],
    ["V", "vache", "🐄", "veu"],
    ["W", "wagon", "🚃", "veu"],
    ["X", "xylophone", "🎶", "ksss"],
    ["Y", "yoyo", "🪀", "ieu"],
    ["Z", "zèbre", "🦓", "zeu"],
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
    H: "H ne se prononce pas en français : choisir son et compagnon à la main.",
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
      audio: null,
    };
  }

  function cartesDeDepart() {
    const cartes = [];
    for (const [emoji, mot, phrase, cat] of MOTS) {
      // « orange (couleur) » : la précision sert au parent, pas à l'enfant.
      const label = mot.replace(/\s*\(.*\)$/, "");
      cartes.push(carte(idDe("word", mot), "word", label, cat, { phrase }, [emoji]));
    }
    for (const [lettre, mot, emoji, son] of LETTRES)
      cartes.push(carte("letter-" + lettre, "letter", mot, null, { letter: lettre, sound: son }, [emoji], NOTES_LETTRES[lettre]));
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
