// ==========================================================================
// SOUFFLEUR. Une ligne pour le parent, en bas de l'écran de l'enfant, que
// l'enfant ne lit pas. Ce qui enseigne, c'est la voix du parent ; la carte
// ne fait que choisir le mot. Le souffleur dit la seule chose qui compte et
// que l'application sait : si le mot est nouveau (on le donne) ou déjà vu
// (on le demande, puis on attend), et une relance pour en parler.
// Fonctions pures, sans DOM : chargées par la tablette et par les tests.
// ==========================================================================
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.Souffleur = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Après le mot : de quoi parler, par catégorie. Une phrase, pas un cours.
  const RELANCES = {
    animal: "Le bruit qu'il fait, où on l'a vu.",
    nourriture: "Tu aimes ? On en a mangé quand ?",
    corps: "Montre le tien, montre le mien.",
    vetement: "Qui en porte ? Où est le tien ?",
    objet: "À quoi ça sert ? Où est-il à la maison ?",
    vehicule: "Le bruit qu'il fait, où on l'a vu passer.",
    nature: "On l'a vu quand ? Regarde par la fenêtre.",
    couleur: "Cherche la même couleur autour de vous.",
    forme: "Cherche la même forme autour de vous.",
    famille: "Qui c'est ? Qu'est-ce qu'on fait ensemble ?",
    lieu: "On y va quand ? Avec qui ?",
    action: "Fais-le, et fais-le faire.",
    number: "Compte les objets avec le doigt, un par un.",
    letter: "Cherche-la dans un prénom, sur une boîte.",
  };

  // Ce que l'application sait et que le parent ne voit pas : nouveau ou revu.
  const PHASES = {
    nouvelle: "Nouveau : dis le mot, montre, redis-le.",
    nouvelleLettre: "Nouvelle lettre : son nom ou son son, toujours le même, puis le mot.",
    revue: "Demande « c'est quoi ? », attends trois secondes, puis dis-le.",
    choix: "Demande « où est … ? », puis attends. S'il se trompe, ne dis rien.",
  };

  // Le mot tel que le parent le dit : « chien », « A », « 3 ».
  function cible(carte) {
    if (!carte) return "";
    if (carte.type === "letter") return carte.extras && carte.extras.letter ? carte.extras.letter : carte.label;
    if (carte.type === "number") return carte.extras && carte.extras.digit != null ? String(carte.extras.digit) + " " + carte.label : carte.label;
    return carte.label || "";
  }

  function relance(carte) {
    if (!carte) return "";
    if (carte.type === "letter" || carte.type === "number") return RELANCES[carte.type];
    return RELANCES[carte.category] || "";
  }

  // mode : « show » ou « choice ». Renvoie { cible, phase, relance, note }.
  // En mode choisir, la cible est indispensable : sans elle, le parent ne sait
  // pas laquelle des deux images demander.
  function souffler(carte, entree, mode) {
    const nouvelle = !entree || !(entree.reviews > 0);
    let phase;
    if (mode === "choice") phase = PHASES.choix;
    else if (!nouvelle) phase = PHASES.revue;
    else phase = carte && carte.type === "letter" ? PHASES.nouvelleLettre : PHASES.nouvelle;
    return { cible: cible(carte), phase, relance: relance(carte), note: (carte && carte.note) || "" };
  }

  return { RELANCES, PHASES, cible, relance, souffler };
});
