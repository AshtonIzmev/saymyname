const { test } = require("node:test");
const assert = require("node:assert/strict");
const { charger, alea } = require("./charger");

const G = charger();
const { NOTIONS, FAMILLES, VOCABULAIRE, validerNotions, voisins, etatSuivant, estChemin } = G;

test("le tableau est valide (étiquettes fermées, familles connues, ids uniques)", () => {
  assert.doesNotThrow(() => validerNotions(NOTIONS));
  assert.ok(NOTIONS.length >= 100 && NOTIONS.length <= 115, "≈100–110 notions, trouvé " + NOTIONS.length);
  const parFamille = {};
  for (const n of NOTIONS) parFamille[n[2]] = (parFamille[n[2]] || 0) + 1;
  for (const f of FAMILLES) assert.ok(parFamille[f] >= 10, "au moins 10 " + f);
});

test("une étiquette hors vocabulaire est rejetée au démarrage", () => {
  const faux = [...NOTIONS, ["🧪", "test", "objet", ["rond", "violet", "joue"]]];
  assert.throws(() => validerNotions(faux), /hors vocabulaire/);
  assert.throws(() => validerNotions([["🧪", "test", "truc", ["rond", "joue", "petit"]]]), /Famille inconnue/);
  assert.throws(() => validerNotions([["🧪", "test", "objet", ["rond", "joue"]]]), /3 à 6/);
});

test("le vocabulaire couvre les cinq axes et aucune étiquette ne se répète entre axes", () => {
  assert.deepEqual(Object.keys(VOCABULAIRE), ["forme", "couleur", "lieu", "usage", "trait"]);
  const toutes = Object.values(VOCABULAIRE).flat();
  assert.equal(new Set(toutes).size, toutes.length);
});

test("détection image : emoji → glyphe, chemin → <img>", () => {
  assert.equal(estChemin("🐕"), false);
  assert.equal(estChemin("img/chien.webp"), true);
  assert.equal(estChemin("chien.png"), true);
});

test("les voisines excluent le centre, le centre précédent et les coins précédents", () => {
  const r = alea(7);
  let etat = etatSuivant(NOTIONS, null, NOTIONS[0], r);
  for (let pas = 0; pas < 200; pas++) {
    const vers = etat.coins[Math.floor(r() * 4)];
    const suivant = etatSuivant(NOTIONS, etat, vers, r);
    assert.equal(suivant.coins.length, 4);
    const ids = suivant.coins.map((c) => c[1]);
    assert.equal(new Set(ids).size, 4, "quatre voisines distinctes");
    assert.ok(!ids.includes(vers[1]), "le centre n'est pas sa propre voisine");
    assert.ok(!ids.includes(etat.centre[1]), "le centre précédent est écarté");
    for (const c of etat.coins) assert.ok(!ids.includes(c[1]), "un coin précédent est écarté : " + c[1]);
    etat = suivant;
  }
});

test("au plus deux voisines de la famille du centre", () => {
  const r = alea(11);
  for (const n of NOTIONS) {
    const coins = voisins(NOTIONS, n, new Set(), r);
    const memeFamille = coins.filter((c) => c[2] === n[2]).length;
    assert.ok(memeFamille <= 2, n[1] + " a " + memeFamille + " voisines de sa famille");
  }
});

test("la contrainte de famille se relâche sur un tableau trop petit", () => {
  const petit = NOTIONS.filter((n) => n[2] === "fruit").slice(0, 6);
  const coins = voisins(petit, petit[0], new Set(), alea(1));
  assert.equal(coins.length, 4);
});

test("la proximité vient des étiquettes : sans aléa, chien ↔ chat avant chien ↔ poisson", () => {
  const zero = () => 0;
  const chien = NOTIONS.find((n) => n[1] === "chien");
  const chat = NOTIONS.find((n) => n[1] === "chat");
  const poisson = NOTIONS.find((n) => n[1] === "poisson");
  assert.ok(G.score(chien, chat, zero) > G.score(chien, poisson, zero));
});

// Critère de qualité du §7 : 50 pas depuis n'importe quel départ → ≥ 4 familles
// sur 5 et ≥ 25 notions distinctes. Vérifié pour tous les départs et plusieurs
// graines. Si ce test échoue, ce sont les étiquettes qu'il faut revoir.
test("marche aléatoire de 50 pas : ≥ 4 familles et ≥ 25 notions distinctes, tout départ", () => {
  const GRAINES = 12;
  const echecs = [];
  for (const depart of NOTIONS) {
    for (let g = 1; g <= GRAINES; g++) {
      const r = alea(g * 1000 + NOTIONS.indexOf(depart));
      let etat = etatSuivant(NOTIONS, null, depart, r);
      const vus = new Set([depart[1]]);
      const familles = new Set([depart[2]]);
      for (let pas = 0; pas < 50; pas++) {
        const vers = etat.coins[Math.floor(r() * 4)];
        etat = etatSuivant(NOTIONS, etat, vers, r);
        vus.add(vers[1]);
        familles.add(vers[2]);
      }
      if (familles.size < 4 || vus.size < 25)
        echecs.push(depart[1] + "#" + g + " → " + familles.size + " familles, " + vus.size + " notions");
    }
  }
  assert.deepEqual(echecs, [], "marches en échec :\n" + echecs.join("\n"));
});

test("ajouter une ligne au tableau suffit à la faire entrer dans le graphe", () => {
  const chien = NOTIONS.find((n) => n[1] === "chien");
  const etendu = [...NOTIONS, ["img/loup.webp", "loup", "animal", ["poil", "pattes", "queue", "brun", "grand"]]];
  assert.doesNotThrow(() => validerNotions(etendu));
  const coins = voisins(etendu, chien, new Set(), () => 0);
  assert.ok(coins.some((c) => c[1] === "loup"), "le loup est voisin du chien");
});
