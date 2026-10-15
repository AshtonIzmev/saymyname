// Le souffleur : une ligne pour le parent, en bas de l'écran de l'enfant.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../flashcards/souffleur.js");
const Graines = require("../flashcards/graines.js");

const chien = { id: "word-chien", type: "word", label: "chien", category: "animal", extras: {}, note: "" };
const neuve = { reviews: 0 };
const vue = { reviews: 2 };

test("nouveau mot : on le donne ; mot revu : on le demande, puis on attend", () => {
  assert.match(S.souffler(chien, neuve, "show").phase, /^Nouveau : dis le mot/);
  assert.match(S.souffler(chien, null, "show").phase, /^Nouveau/);
  assert.match(S.souffler(chien, vue, "show").phase, /c'est quoi \?.*attends/);
  assert.equal(S.souffler(chien, vue, "show").relance, S.RELANCES.animal);
  assert.equal(S.souffler(chien, vue, "show").cible, "chien");
});

test("mode choisir : la cible est toujours là, et la consigne est d'attendre", () => {
  const r = S.souffler(chien, vue, "choice");
  assert.equal(r.cible, "chien");
  assert.match(r.phase, /où est … \?/);
  assert.match(r.phase, /ne dis rien/);
});

test("lettres et chiffres : cible lisible, relance propre, note de la carte reprise", () => {
  const h = { type: "letter", label: "hibou", extras: { letter: "H" }, note: "H ne se prononce pas." };
  assert.equal(S.cible(h), "H");
  assert.match(S.souffler(h, neuve, "show").phase, /Nouvelle lettre.*son nom ou son son/);
  assert.equal(S.souffler(h, neuve, "show").note, "H ne se prononce pas.");
  assert.equal(S.relance(h), S.RELANCES.letter);
  const trois = { type: "number", label: "trois", extras: { digit: 3 } };
  assert.equal(S.cible(trois), "3 trois");
  assert.match(S.relance(trois), /Compte/);
});

test("chaque catégorie du jeu de départ a sa relance", () => {
  for (const cat of Object.keys(Graines.CATEGORIES)) assert.ok(S.RELANCES[cat], "relance manquante : " + cat);
  for (const c of Graines.cartesDeDepart()) assert.ok(S.relance(c), "sans relance : " + c.id);
});
