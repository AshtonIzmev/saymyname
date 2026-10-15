// Règles du planificateur (Leitner à cinq boîtes) et du jeu de départ.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../flashcards/planificateur.js");
const Graines = require("../flashcards/graines.js");
const { alea } = require("./charger");

const MIDI = new Date(2026, 9, 12, 12, 0, 0).getTime();
const J = P.JOUR;

function mot(id, category, extra) {
  return Object.assign({ id, type: "word", label: id, category, extras: {}, images: [{ id: id + "-i", emoji: "x", is_primary: true, order: 0 }], created_at: 0 }, extra);
}
function lettre(l, label) { return { id: "letter-" + l, type: "letter", label, extras: { letter: l }, images: [], created_at: 0 }; }
function nombre(n) { return { id: "number-" + n, type: "number", label: ["", "un", "deux", "trois", "quatre", "cinq"][n], extras: { digit: n }, images: [], created_at: 0 }; }
function entree(card_id, champs) { return Object.assign(P.nouvelleEntree("d", card_id, 0), champs); }
function indexer(cartes) { return Object.fromEntries(cartes.map((c) => [c.id, c])); }

test("noter : su monte d'une boîte, hésitant reste, pas su retombe en boîte 1", () => {
  let e = P.nouvelleEntree("d", "c", MIDI);
  e = P.noter(e, "knew", MIDI);
  assert.equal(e.box, 2);
  assert.equal(e.due_at, P.debutDuJour(MIDI) + 1 * J, "boîte 2 : due le lendemain à minuit");
  e = P.noter(e, "knew", MIDI);
  assert.equal(e.box, 3);
  assert.equal(e.due_at, P.debutDuJour(MIDI) + 3 * J);
  e = P.noter(e, "hesitant", MIDI);
  assert.equal(e.box, 3, "hésitant : même boîte");
  assert.equal(e.due_at, MIDI, "hésitant : due dès la prochaine séance");
  e = P.noter(e, "knew", MIDI);
  assert.equal(e.box, 4);
  assert.equal(e.due_at, P.debutDuJour(MIDI) + 7 * J);
  e = P.noter(e, "didnt_know", MIDI);
  assert.deepEqual([e.box, e.fail_count, e.streak, e.reviews], [1, 1, 0, 5]);
  assert.equal(e.last_seen_at, MIDI);
  assert.throws(() => P.noter(e, "bravo", MIDI), /Note inconnue/);
});

test("boîte 5 : trois « su » d'affilée en boîte 4, et un hésitant remet le compte à zéro", () => {
  let e = entree("c", { box: 4 });
  e = P.noter(e, "knew", MIDI); assert.deepEqual([e.box, e.streak], [4, 1]);
  e = P.noter(e, "hesitant", MIDI); assert.deepEqual([e.box, e.streak], [4, 0]);
  e = P.noter(e, "knew", MIDI);
  e = P.noter(e, "knew", MIDI); assert.deepEqual([e.box, e.streak], [4, 2]);
  e = P.noter(e, "knew", MIDI); assert.deepEqual([e.box, e.streak], [5, 0]);
  assert.equal(e.due_at, P.debutDuJour(MIDI) + 21 * J);
  e = P.noter(e, "knew", MIDI); assert.equal(e.box, 5, "la boîte 5 est la dernière");
});

test("sangsue : quatre échecs d'affilée en boîte 1, effacés par un « su »", () => {
  let e = P.nouvelleEntree("d", "c", MIDI);
  for (let i = 0; i < 3; i++) e = P.noter(e, "didnt_know", MIDI);
  assert.equal(P.estSangsue(e), false);
  e = P.noter(e, "didnt_know", MIDI);
  assert.equal(P.estSangsue(e), true);
  e = P.noter(e, "knew", MIDI);
  assert.equal(e.fail_count, 0);
  assert.equal(P.estSangsue(e), false);
});

test("sélection : dues des boîtes 2–4 d'abord (la plus ancienne en tête), puis au plus 3 nouvelles, puis les ratées", () => {
  const cartes = [];
  const entrees = [];
  const ajouter = (id, cat, champs) => { cartes.push(mot(id, cat)); entrees.push(entree(id, champs)); };
  ajouter("due-vieille", "a", { box: 3, due_at: MIDI - 5 * J, reviews: 2 });
  ajouter("due-recente", "a", { box: 2, due_at: MIDI - J, reviews: 1 });
  ajouter("pas-due", "a", { box: 4, due_at: MIDI + J, reviews: 4 });
  ajouter("ratee", "b", { box: 1, reviews: 3, fail_count: 1, last_seen_at: MIDI - J });
  for (let i = 0; i < 6; i++) ajouter("neuve-" + i, "c", { box: 1 });

  // Sans mélange (alea = 0 laisse l'ordre presque intact), on vérifie la composition.
  const choix = P.choisirSession(indexer(cartes), entrees, { cap: 10, maintenant: MIDI, alea: alea(1) });
  const ids = choix.map((c) => c.id);
  assert.ok(ids.includes("due-vieille") && ids.includes("due-recente") && ids.includes("ratee"));
  assert.ok(!ids.includes("pas-due"));
  assert.equal(ids.filter((i) => i.startsWith("neuve")).length, 3, "au plus trois nouvelles");
  assert.equal(ids.length, 6);

  // Plafond serré : les dues d'abord, puis du nouveau, et les ratées en dernier.
  // Une ratée revient de toute façon à chaque séance ; une nouvelle, elle,
  // n'arriverait jamais si les ratées passaient devant.
  const serre = P.choisirSession(indexer(cartes), entrees, { cap: 2, maintenant: MIDI, alea: alea(2) }).map((c) => c.id).sort();
  assert.deepEqual(serre, ["due-recente", "due-vieille"]);
  const trois = P.choisirSession(indexer(cartes), entrees, { cap: 3, maintenant: MIDI, alea: alea(3) }).map((c) => c.id);
  assert.deepEqual(trois.filter((i) => i.startsWith("due")).sort(), ["due-recente", "due-vieille"]);
  assert.equal(trois.filter((i) => i.startsWith("neuve")).length, 1);
  const cinq = P.choisirSession(indexer(cartes), entrees, { cap: 5, maintenant: MIDI, alea: alea(3) }).map((c) => c.id);
  assert.equal(cinq.filter((i) => i.startsWith("neuve")).length, 3);
  assert.ok(!cinq.includes("ratee"));
  const six = P.choisirSession(indexer(cartes), entrees, { cap: 6, maintenant: MIDI, alea: alea(3) }).map((c) => c.id);
  assert.ok(six.includes("ratee"));
});

test("sélection : un paquet tout neuf ouvre sur des mots, jamais sur A, B, C", () => {
  const cartes = indexer(Graines.cartesDeDepart());
  const entrees = Object.keys(cartes).map((id) => P.nouvelleEntree("d", id, 0));
  const premieres = new Set();
  for (let g = 1; g <= 30; g++) {
    const file = P.choisirSession(cartes, entrees, { cap: 10, maintenant: MIDI, alea: alea(g) });
    assert.equal(file.length, 3);
    for (const c of file) { assert.equal(c.type, "word", "graine " + g + " : " + c.id); premieres.add(c.id); }
  }
  assert.ok(premieres.size > 10, "à date égale, le hasard ordonne les mots, pas l'alphabet : " + [...premieres]);
  // Séance « lettres » : les lettres, évidemment.
  const lettres = P.choisirSession(cartes, entrees, { cap: 10, filtre: "lettres", maintenant: MIDI, alea: alea(1) });
  assert.ok(lettres.length === 3 && lettres.every((c) => c.type === "letter"));
});

test("repos : au quatrième échec la carte se repose une semaine, hors séance et hors distracteur ; un « su » efface tout", () => {
  const cartes = indexer([mot("a", "x"), mot("b", "y"), mot("c", "z")]);
  let e = P.nouvelleEntree("d", "a", MIDI);
  for (let i = 0; i < 3; i++) e = P.noter(e, "didnt_know", MIDI);
  assert.equal(P.enRepos(e, MIDI), false, "trois échecs : pas encore");
  e = P.noter(e, "didnt_know", MIDI);
  assert.equal(P.estSangsue(e), true);
  assert.equal(e.rest_until, P.debutDuJour(MIDI) + P.REPOS_JOURS * J);
  assert.equal(P.enRepos(e, MIDI), true);
  assert.equal(P.enRepos(e, MIDI + 8 * J), false, "revenue après une semaine");
  const entrees = [e, entree("b", { box: 3, reviews: 3 }), entree("c")];
  assert.deepEqual(P.choisirSession(cartes, entrees, { cap: 10, maintenant: MIDI, alea: alea(1) }).map((c) => c.id).sort(), ["b", "c"], "a est au repos");
  assert.equal(P.choisirDistracteur(cartes.c, cartes, entrees, { maintenant: MIDI, alea: alea(1) }).id, "b", "jamais une carte au repos en distracteur");
  assert.equal(P.choisirSession(cartes, entrees, { cap: 10, maintenant: MIDI + 8 * J, alea: alea(1) }).some((c) => c.id === "a"), true);
  e = P.noter(e, "knew", MIDI + 8 * J);
  assert.deepEqual([e.rest_until, e.fail_count, P.estSangsue(e)], [null, 0, false]);
  // Le repos posé par le parent (un mois) suit la même règle.
  const posee = Object.assign(entree("c"), { rest_until: MIDI + 30 * J });
  assert.equal(P.enRepos(posee, MIDI + 29 * J), true);
  assert.equal(P.enRepos(posee, MIDI + 31 * J), false);
});

test("un enfant qui rate beaucoup voit quand même du nouveau chaque jour, et une carte signalée ne revient qu'une fois par semaine", () => {
  // Trente jours, une séance par jour, plafond 10, un enfant qui ne sait que 25 %.
  const r = alea(42);
  const cartes = indexer(Graines.cartesDeDepart());
  const entrees = {};
  for (const id of Object.keys(cartes)) entrees[id] = P.nouvelleEntree("d", id, 0);
  const revues = [];
  const vues = new Set();
  const derniereSignalee = {};
  for (let jour = 0; jour < 30; jour++) {
    const now = MIDI + jour * J;
    const file = P.choisirSession(cartes, Object.values(entrees), { cap: P.restantAujourdhui(revues, "d", 10, now), maintenant: now, alea: r });
    assert.ok(file.some((c) => !(entrees[c.id].reviews > 0)), "jour " + (jour + 1) + " : aucune carte nouvelle");
    for (const c of file) {
      if (P.estSangsue(entrees[c.id])) {
        if (derniereSignalee[c.id] != null) assert.ok(jour - derniereSignalee[c.id] >= P.REPOS_JOURS, c.id + " revient avant une semaine");
        derniereSignalee[c.id] = jour;
      }
      vues.add(c.id);
      const x = r();
      entrees[c.id] = P.noter(entrees[c.id], x < 0.25 ? "knew" : x < 0.4 ? "hesitant" : "didnt_know", now);
      revues.push({ deck_id: "d", at: now });
    }
  }
  assert.ok(vues.size >= 60, "en trente jours, au moins soixante cartes distinctes, trouvé " + vues.size);
});

test("sélection : la carte ajoutée le plus récemment passe en tête des nouvelles", () => {
  const cartes = [], entrees = [];
  for (let i = 0; i < 10; i++) { cartes.push(mot("graine-" + i, "a", { created_at: 0 })); entrees.push(entree("graine-" + i)); }
  cartes.push(mot("photo-du-jour", "b", { created_at: MIDI - 1000 })); entrees.push(entree("photo-du-jour"));
  const ids = P.choisirSession(indexer(cartes), entrees, { cap: 10, maintenant: MIDI, alea: alea(4) }).map((c) => c.id);
  assert.ok(ids.includes("photo-du-jour"));
});

test("sélection : au plus 50 % de lettres et chiffres, sauf séance lettres ou chiffres", () => {
  const cartes = [], entrees = [];
  for (const l of "ABCDEFGH") { cartes.push(lettre(l, "mot" + l)); entrees.push(entree("letter-" + l, { box: 2, due_at: MIDI - J, reviews: 1 })); }
  for (let n = 1; n <= 5; n++) { cartes.push(nombre(n)); entrees.push(entree("number-" + n, { box: 2, due_at: MIDI - J, reviews: 1 })); }
  for (let i = 0; i < 8; i++) { cartes.push(mot("m" + i, "a")); entrees.push(entree("m" + i, { box: 2, due_at: MIDI - J + i, reviews: 1 })); }
  const tout = P.choisirSession(indexer(cartes), entrees, { cap: 10, maintenant: MIDI, alea: alea(5) });
  assert.equal(tout.length, 10);
  assert.ok(tout.filter((c) => c.type !== "word").length <= 5);
  const lettres = P.choisirSession(indexer(cartes), entrees, { cap: 10, filtre: "lettres", maintenant: MIDI, alea: alea(6) });
  assert.equal(lettres.length, 8);
  assert.ok(lettres.every((c) => c.type === "letter"));
  const nombres = P.choisirSession(indexer(cartes), entrees, { cap: 10, filtre: "nombres", maintenant: MIDI, alea: alea(7) });
  assert.deepEqual(nombres.map((c) => c.id).sort(), ["number-1", "number-2", "number-3", "number-4", "number-5"]);
});

test("sélection : cartes suspendues exclues, suspension d'un mois levée à l'échéance", () => {
  const cartes = [mot("a", "x", { suspended: true }), mot("b", "x", { suspended_until: MIDI + J }), mot("c", "x", { suspended_until: MIDI - 1 })];
  const entrees = cartes.map((c) => entree(c.id, { box: 1, reviews: 1 }));
  const ids = P.choisirSession(indexer(cartes), entrees, { cap: 10, maintenant: MIDI }).map((c) => c.id);
  assert.deepEqual(ids, ["c"]);
});

test("mélange : jamais deux fois le même mot à la suite", () => {
  for (let graine = 1; graine <= 200; graine++) {
    const cartes = [mot("bateau", "v"), lettre("B", "bateau"), mot("chat", "a"), mot("chien", "a"), lettre("C", "canard"), mot("canard", "a")];
    const file = P.melanger(cartes, alea(graine));
    assert.equal(file.length, cartes.length);
    for (let i = 1; i < file.length; i++)
      assert.notEqual(P.motCle(file[i]), P.motCle(file[i - 1]), "graine " + graine + " : " + file.map((c) => c.id));
  }
  // Cas qu'un algorithme glouton naïf rate : deux « bateau » pour une autre carte.
  for (let graine = 1; graine <= 50; graine++) {
    const file = P.melanger([mot("bateau", "v"), lettre("B", "bateau"), mot("chat", "a")], alea(graine));
    assert.equal(P.motCle(file[1]), "chat");
  }
});

test("distracteur : même type, autre catégorie, déjà connu (boîte 3+) de préférence", () => {
  const chat = mot("chat", "animal"), chien = mot("chien", "animal");
  const tasse = mot("tasse", "objet"), bus = mot("bus", "vehicule"), pomme = mot("pomme", "nourriture");
  const cartes = indexer([chat, chien, tasse, bus, pomme, lettre("A", "ananas")]);
  const entrees = [entree("chat"), entree("chien", { box: 5, reviews: 9 }), entree("tasse", { box: 3, reviews: 3 }),
    entree("bus", { box: 1, reviews: 1 }), entree("pomme"), entree("letter-A", { box: 4, reviews: 4 })];
  for (let g = 1; g <= 30; g++)
    assert.equal(P.choisirDistracteur(chat, cartes, entrees, { alea: alea(g) }).id, "tasse", "jamais chat contre chien");
  // Sans carte en boîte 3+, une carte déjà vue.
  const sansConnue = entrees.map((e) => (e.card_id === "tasse" ? Object.assign({}, e, { box: 1, reviews: 0 }) : e));
  assert.equal(P.choisirDistracteur(chat, cartes, sansConnue, { alea: alea(1) }).id, "bus");
  // Une lettre contre une autre lettre ; seule, pas de distracteur.
  assert.equal(P.choisirDistracteur(lettre("A", "ananas"), cartes, entrees), null);
  const deuxLettres = indexer([lettre("A", "ananas"), lettre("B", "bateau")]);
  assert.equal(P.choisirDistracteur(deuxLettres["letter-A"], deuxLettres, [entree("letter-A"), entree("letter-B")]).id, "letter-B");
});

test("images : la principale jusqu'à la boîte 3, puis rotation", () => {
  const c = mot("chien", "a");
  c.images = [{ id: "dessin", order: 1 }, { id: "photo", is_primary: true, order: 0 }, { id: "autre", order: 2 }];
  assert.equal(P.choisirImage(c, entree("chien", { box: 2 })).id, "photo");
  assert.equal(P.choisirImage(c, null).id, "photo");
  const vues = new Set();
  const a = alea(9);
  for (let i = 0; i < 50; i++) vues.add(P.choisirImage(c, entree("chien", { box: 3 }), a).id);
  assert.deepEqual([...vues].sort(), ["autre", "dessin", "photo"]);
});

test("plafond quotidien et note du mode choix", () => {
  const revues = [{ deck_id: "d", at: MIDI - 1000 }, { deck_id: "d", at: MIDI - 2000 }, { deck_id: "d", at: MIDI - J }, { deck_id: "autre", at: MIDI }];
  assert.equal(P.restantAujourdhui(revues, "d", 10, MIDI), 8);
  assert.equal(P.restantAujourdhui(revues, "d", 2, MIDI), 0);
  assert.equal(P.noteChoix(1, true), "knew");
  assert.equal(P.noteChoix(2, true), "hesitant");
  assert.equal(P.noteChoix(3, true), "didnt_know");
  assert.equal(P.noteChoix(2, false), "didnt_know");
});

test("jeu de départ : identifiants uniques, minuscules, 26 lettres, chiffres 1 à 5, une catégorie par mot", () => {
  const cartes = Graines.cartesDeDepart();
  const ids = new Set(cartes.map((c) => c.id));
  assert.equal(ids.size, cartes.length);
  const mots = cartes.filter((c) => c.type === "word");
  assert.ok(mots.length >= 100, "≈100+ mots, trouvé " + mots.length);
  for (const c of mots) {
    assert.equal(c.label, c.label.toLowerCase(), "minuscules : " + c.label);
    assert.ok(Graines.CATEGORIES[c.category], "catégorie : " + c.id);
    assert.ok(!/\(/.test(c.label), "précision entre parenthèses affichée : " + c.label);
  }
  const lettres = cartes.filter((c) => c.type === "letter").map((c) => c.extras.letter);
  assert.equal(lettres.join(""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  for (const c of cartes.filter((x) => x.type === "letter")) {
    const l = c.label.normalize("NFD").charAt(0).toUpperCase();
    assert.equal(l, c.extras.letter, "le compagnon commence par sa lettre : " + c.label);
    assert.ok(!/^(ch|ph)/.test(c.label), "premier son ambigu : " + c.label);
  }
  assert.deepEqual(cartes.filter((c) => c.type === "number").map((c) => c.extras.digit), [1, 2, 3, 4, 5]);
  for (const c of cartes.filter((x) => x.type === "number")) assert.ok(c.images.length >= 3, "objets variés : " + c.id);
});
