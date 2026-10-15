// L'écran d'accueil et les flashcards, dans un vrai Chromium, servis en
// http comme par n'importe quel hébergement statique (IndexedDB, sauvegarde
// exportée puis importée sur un deuxième appareil).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");

const RACINE = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

// Un serveur de fichiers minimal, l'équivalent du nginx de production.
function serveurStatique() {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const fichier = path.join(RACINE, path.normalize(rel));
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream" });
    fs.createReadStream(fichier).pipe(res);
  });
}

function chargerPlaywright() {
  try { return require("playwright"); } catch (_) {}
  const { execSync } = require("node:child_process");
  return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
}

let navigateur, serveur, base;

before(async () => {
  serveur = serveurStatique();
  await new Promise((ok) => serveur.listen(0, ok));
  base = "http://127.0.0.1:" + serveur.address().port;
  navigateur = await chargerPlaywright().chromium.launch();
});
after(async () => {
  if (navigateur) await navigateur.close();
  await new Promise((ok) => serveur.close(ok));
});

async function ouvrir(chemin, taille) {
  const contexte = await navigateur.newContext({ viewport: taille || { width: 1280, height: 800 }, hasTouch: true, serviceWorkers: "block" });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  await page.goto(base + chemin);
  if (chemin.includes("flashcards")) await page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  return { page, contexte, erreurs };
}

// Gestes au doigt (et non à la souris) : chaque contact a son propre pointerId,
// comme sur la tablette. À un doigt, c'est l'enfant ; à deux, le parent.
async function doigt(page) {
  const cdp = await page.context().newCDPSession(page);
  const envoyer = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const X = 640, Y = 400;
  const points = (n, dx, dy) => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: X + i * 60 + dx, y: Y + dy }));
  const glisser = async (n, dx, dy) => {
    await envoyer("touchStart", points(n, 0, 0));
    for (let k = 1; k <= 4; k++) await envoyer("touchMove", points(n, (dx * k) / 4, (dy * k) / 4));
    await envoyer("touchEnd", []);
  };
  const appuiLong = async (n, ms) => {
    await envoyer("touchStart", points(n, 0, 0));
    await page.waitForTimeout(ms);
    await envoyer("touchEnd", []);
  };
  return {
    unDoigt: { glisser: (dx, dy) => glisser(1, dx, dy), appuiLong: (ms) => appuiLong(1, ms) },
    deuxDoigts: { glisser: (dx, dy) => glisser(2, dx, dy), appuiLong: (ms) => appuiLong(2, ms) },
    troisDoigts: { glisser: (dx, dy) => glisser(3, dx, dy), appuiLong: (ms) => appuiLong(3, ms) },
  };
}

async function commencerSeance(page, deckIndex, mode) {
  await page.locator(".jumeau").nth(deckIndex).click();
  await page.waitForSelector("#vue-mode:not([hidden])");
  await page.click(mode === "choice" ? "#mode-choisir" : "#mode-montrer");
  await page.waitForSelector("#vue-enfant:not([hidden])");
}

// Un PNG uni, sans dépendance.
function png(couleur) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const morceau = (type, data) => { const t = Buffer.from(type); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
  const w = 40, h = 30;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => couleur[i % 3])]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", ihdr),
    morceau("IDAT", zlib.deflateSync(Buffer.concat(Array(h).fill(ligne)))), morceau("IEND", Buffer.alloc(0))]);
}

test("accueil : deux jeux, chacun mène à son application et en revient", async () => {
  const { page, contexte, erreurs } = await ouvrir("/");
  const jeux = await page.$$eval(".jeu", (as) => as.map((a) => ({ nom: a.querySelector(".nom").textContent, href: a.getAttribute("href") })));
  assert.deepEqual(jeux, [{ nom: "Mot à Mot", href: "mot-a-mot/index.html" }, { nom: "Flashcards", href: "flashcards/index.html" }]);

  await page.click("#jeu-mot-a-mot");
  await page.waitForFunction(() => window.motAMot && window.motAMot.etat);
  await page.click("#bouton-jeux");
  await page.waitForSelector("#jeu-flashcards");
  await page.click("#jeu-flashcards");
  await page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  await page.click("#lien-jeux");
  await page.waitForSelector("#jeu-mot-a-mot");
  assert.deepEqual(erreurs, []);
  await contexte.close();

  // L'accueil s'ouvre aussi depuis un fichier, comme Mot à Mot.
  const c2 = await navigateur.newContext();
  const p2 = await c2.newPage();
  const e2 = [];
  p2.on("pageerror", (e) => e2.push(String(e)));
  await p2.goto("file://" + path.join(__dirname, "..", "index.html"));
  assert.equal(await p2.locator(".jeu").count(), 2);
  assert.deepEqual(e2, []);
  await c2.close();
});

test("séance « montrer » : écran nu, l'enfant à un doigt ne note rien, le parent note à deux doigts, appui long → « fini » verrouillé", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html");
  assert.equal(await page.locator(".jumeau").count(), 2);
  await page.evaluate(() => { flashcards.config.verrouFini = 1500; });
  await commencerSeance(page, 0, "show");

  // Premier jour : tout est neuf, donc trois cartes (au plus trois nouvelles),
  // et des mots : un enfant de deux ans ne commence pas par l'alphabet.
  const file = await page.evaluate(() => flashcards.seance.file.map((c) => c.id));
  assert.equal(file.length, 3);
  assert.ok(file.every((id) => id.startsWith("word-")), "un paquet neuf ouvre sur des mots : " + file);
  // Rien d'autre qu'une image et un mot : aucun bouton, aucun lien, aucune barre.
  assert.equal(await page.locator("#vue-enfant button, #vue-enfant a, #vue-enfant input").count(), 0);
  assert.equal(await page.locator("#scene .visuel").count(), 1);
  assert.equal(await page.locator("#scene .etiquette").count(), 1);
  const visuel = await page.locator("#scene .visuel").boundingBox();
  assert.ok(visuel.height >= 0.6 * 800, "l'image occupe ~70 % de l'écran : " + visuel.height);
  // Le souffleur, pour le parent : la carte est nouvelle, on donne le mot.
  assert.match(await page.textContent("#souffleur"), /Nouveau : dis le mot/);
  assert.ok(/·/.test(await page.textContent("#souffleur")), "une relance suit");
  const souffleur = await page.locator("#souffleur").boundingBox();
  assert.ok(souffleur.y >= visuel.y + visuel.height, "le souffleur est sous l'image");
  assert.ok(souffleur.y + souffleur.height <= 800, "et dans l'écran");
  // Éteint dans les réglages : plus rien en mode montrer.
  await page.evaluate(() => { localStorage.setItem("flashcards.souffleur", "0"); flashcards.rendre(); });
  assert.equal(await page.isHidden("#souffleur"), true);
  await page.evaluate(() => { localStorage.removeItem("flashcards.souffleur"); flashcards.rendre(); });
  assert.equal(await page.isVisible("#souffleur"), true);

  // Tap sur l'image : rien ne se passe, ni note ni changement de carte.
  await page.click("#scene .visuel");
  assert.equal(await page.evaluate(() => flashcards.seance.i), 0);

  // Les gestes d'un enfant : un doigt qui traîne, un doigt qui reste posé,
  // une paume. Rien ne se note, rien ne se termine.
  const toucher = await doigt(page);
  await toucher.unDoigt.glisser(250, 0);
  await toucher.unDoigt.appuiLong(1100);
  await toucher.troisDoigts.glisser(250, 0);
  await toucher.troisDoigts.appuiLong(1100);
  assert.equal(await page.evaluate(() => flashcards.seance.i), 0, "un doigt (ou une paume) ne note jamais");
  assert.equal(await page.isVisible("#vue-enfant"), true, "un doigt posé ne termine pas la séance");

  await toucher.deuxDoigts.glisser(250, 0);   // → su
  await toucher.deuxDoigts.glisser(0, -250);  // ↑ hésitant
  assert.equal(await page.evaluate(() => flashcards.seance.i), 2);
  const entrees = await page.evaluate((ids) => ids.map((id) => Stockage.entree("deck-1", id)), file);
  assert.deepEqual(entrees.slice(0, 2).map((e) => [e.box, e.reviews]), [[2, 1], [1, 1]]);
  assert.equal(entrees[2].reviews, 0);
  // Le jumeau 2 n'est pas touché.
  assert.equal(await page.evaluate((id) => Stockage.entree("deck-2", id).reviews, file[0]), 0);

  // Appui long à deux doigts : fin de séance, par le parent.
  await toucher.deuxDoigts.appuiLong(1100);
  assert.equal(await page.isVisible("#vue-fini"), true);
  assert.equal((await page.textContent("#vue-fini")).trim(), "fini");
  const seance = await page.evaluate(() => Object.values(Stockage.etat.sessions)[0]);
  assert.equal(seance.ended_by, "parent");
  // Verrouillé : taper ne sert à rien, puis retour au départ.
  await page.mouse.click(640, 400);
  assert.equal(await page.isVisible("#vue-fini"), true);
  await page.waitForSelector("#vue-depart:not([hidden])", { timeout: 4000 });

  // Séance suivante sur la même page : les glissements marchent encore
  // après un appui long.
  await commencerSeance(page, 0, "show");
  await toucher.deuxDoigts.glisser(250, 0);
  assert.equal(await page.evaluate(() => flashcards.seance.i), 1, "le glissement après un appui long est bien noté");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#vue-depart:not([hidden])", { timeout: 4000 });

  // Tout est resté sur l'appareil, et survit à un rechargement.
  await page.reload();
  await page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  assert.equal(await page.evaluate(() => Object.keys(Stockage.etat.reviews).length), 3);
  assert.equal(await page.evaluate((id) => Stockage.entree("deck-1", id).box, file[0]), 2);
  assert.deepEqual(erreurs, []);
  await contexte.close();
});

test("séance « choisir » : deux images sans étiquette, note automatique, fondu de l'autre image", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html");
  await commencerSeance(page, 1, "choice");
  assert.equal(await page.locator("#scene .option").count(), 2);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("#scene .etiquette")].map((e) => e.textContent).join("")), "");
  // Le souffleur donne au parent le mot à demander, même souffleur éteint.
  const cibleAffichee = await page.evaluate(() => [document.querySelector("#souffleur b").textContent, flashcards.carteCourante.label]);
  assert.equal(cibleAffichee[0], cibleAffichee[1]);
  await page.evaluate(() => { localStorage.setItem("flashcards.souffleur", "0"); flashcards.rendre(); });
  assert.match(await page.textContent("#souffleur"), /où est/);
  await page.evaluate(() => { localStorage.removeItem("flashcards.souffleur"); flashcards.rendre(); });

  // Bonne réponse du premier coup.
  let cote = await page.evaluate(() => flashcards.seance.essai.cote);
  const cible = await page.evaluate(() => flashcards.carteCourante.id);
  const distracteur = await page.evaluate(() => flashcards.seance.essai.distracteur);
  assert.notEqual(distracteur.id, cible);
  const categories = await page.evaluate((d) => [Planificateur.categorie(flashcards.carteCourante), Planificateur.categorie(d)], distracteur);
  assert.notEqual(categories[0], categories[1], "jamais deux animaux face à face");
  const toucher = await doigt(page);
  await page.locator("#scene .option").nth(cote).tap();
  const apres = await page.evaluate((c) => ({
    estompee: document.querySelectorAll("#scene .option")[1 - c].classList.contains("estompee"),
    etiquette: document.querySelectorAll("#scene .option")[c].querySelector(".etiquette").textContent,
  }), cote);
  assert.equal(apres.estompee, true);
  assert.ok(apres.etiquette.length > 0, "l'étiquette apparaît sous la cible");
  await toucher.deuxDoigts.glisser(0, 250); // ↓ : on garde la note automatique
  let r = await page.evaluate((id) => Object.values(Stockage.etat.reviews).find((x) => x.card_id === id && x.session_id === flashcards.seance.id), cible);
  assert.deepEqual([r.grade, r.touches, r.mode, r.distractor_card_id], ["knew", 1, "choice", distracteur.id]);

  // Deux erreurs : pas su, et le parent peut forcer « hésitant » par glissement.
  cote = await page.evaluate(() => flashcards.seance.essai.cote);
  const cible2 = await page.evaluate(() => flashcards.carteCourante.id);
  await page.keyboard.press(String(2 - cote)); // la mauvaise
  await page.keyboard.press(String(2 - cote)); // ignorée : silence d'une seconde
  assert.equal(await page.evaluate(() => flashcards.seance.essai.touchers), 1);
  await page.waitForTimeout(1100);
  await page.keyboard.press(String(2 - cote));
  assert.equal(await page.evaluate(() => flashcards.seance.essai.auto), "didnt_know");
  await toucher.deuxDoigts.glisser(0, -250);
  r = await page.evaluate((id) => Object.values(Stockage.etat.reviews).find((x) => x.card_id === id && x.session_id === flashcards.seance.id), cible2);
  assert.deepEqual([r.grade, r.touches], ["hesitant", 2]);
  // La révision ne compte que pour la cible, jamais pour le distracteur.
  assert.equal(await page.evaluate((id) => Stockage.entree("deck-2", id).reviews, distracteur.id), 0);
  assert.deepEqual(erreurs, []);
  await contexte.close();
});

test("parent : ajouter une carte, elle apparaît dans la séance suivante", async () => {
  const appareil = await ouvrir("/flashcards/index.html#parent", { width: 390, height: 844 });
  const tel = appareil.page;
  await tel.waitForSelector("#vue-parent:not([hidden])");
  await tel.fill("#ajout-emoji", "🦔");
  await tel.fill("#ajout-mot", "Hérisson");
  await tel.selectOption("#ajout-categorie", "animal");
  await tel.uncheck("#ajout-paquets input[value='deck-2']");
  await tel.click("#ajout-enregistrer-carte");
  await tel.waitForFunction(() => /ajoutée/.test(document.getElementById("ajout-message").textContent));
  const herisson = await tel.evaluate(() => Object.values(Stockage.etat.cards).find((c) => c.label === "hérisson"));
  assert.ok(herisson, "la carte est enregistrée");
  assert.equal(herisson.source, "emoji");
  assert.deepEqual(await tel.evaluate((id) => Object.values(Stockage.etat.deck_cards).filter((e) => e.card_id === id).map((e) => [e.deck_id, e.box]), herisson.id),
    [["deck-1", 1]]);

  // Liste des cartes : recherche et fiche.
  await tel.click("[data-onglet='cartes']");
  await tel.fill("#filtre-texte", "hérisson");
  assert.equal(await tel.locator("#liste-cartes li").count(), 1);
  await tel.click("#liste-cartes li");
  assert.equal(await tel.isVisible("#fiche"), true);
  await tel.click("#fiche >> text=Fermer");

  // Elle est dans la séance suivante du jumeau 1.
  await tel.click("#parent-fermer");
  await commencerSeance(tel, 0, "show");
  const ids = await tel.evaluate(() => flashcards.seance.file.map((c) => c.id));
  assert.ok(ids.includes(herisson.id), "la nouvelle carte passe en tête des nouvelles");
  assert.deepEqual(appareil.erreurs, []);
  await appareil.contexte.close();
});

test("parent : import en masse, réglages, tableau de bord", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html#parent");
  await page.click("[data-onglet='reglages']");
  // Prénom et plafond.
  const nom = page.locator(".paquet-reglage[data-deck='deck-1'] input[type='text']");
  await nom.fill("Adam");
  await nom.dispatchEvent("change");
  const cap = page.locator(".paquet-reglage[data-deck='deck-1'] input[type='number']");
  await cap.fill("40");
  await cap.dispatchEvent("change");
  assert.equal(await cap.inputValue(), "15", "plafond borné à 6–15");
  assert.equal(await page.evaluate(() => Stockage.etat.decks["deck-1"].name), "Adam");

  // Import : tonton.png et tonton-2.png → une carte, deux images.
  await page.setInputFiles("#import-fichiers", [
    { name: "tonton.png", mimeType: "image/png", buffer: png([200, 40, 40]) },
    { name: "tonton-2.png", mimeType: "image/png", buffer: png([40, 40, 200]) },
    { name: "mamie.png", mimeType: "image/png", buffer: png([40, 200, 40]) },
  ]);
  await page.waitForFunction(() => /créée/.test(document.getElementById("import-message").textContent));
  const tonton = await page.evaluate(() => Object.values(Stockage.etat.cards).find((c) => c.label === "tonton"));
  assert.equal(tonton.images.length, 2);
  assert.equal(tonton.images.filter((i) => i.is_primary).length, 1);
  // Recadrée au carré, en WebP.
  const recadree = await page.evaluate(async (id) => {
    const b = await Stockage.lireMedia(id);
    const bmp = await createImageBitmap(b);
    return [b.type, bmp.width, bmp.height];
  }, tonton.images[0].media);
  assert.deepEqual(recadree, ["image/webp", 30, 30]);

  // La réserve : les lettres dorment, un bouton les réveille, un autre les y remet.
  assert.deepEqual(await page.$$eval("#reserve .groupe", (gs) => gs.map((g) => g.dataset.groupe)), ["lettres", "couleurs", "formes", "grands-nombres"]);
  assert.match(await page.textContent("#reserve .groupe[data-groupe='lettres']"), /26 cartes · en réserve/);
  assert.equal(await page.evaluate(() => Object.values(Stockage.etat.cards).filter((c) => c.type === "letter" && !c.suspended).length), 0);
  await page.click("#reserve .groupe[data-groupe='lettres'] button");
  assert.equal(await page.evaluate(() => Object.values(Stockage.etat.cards).filter((c) => c.type === "letter" && c.suspended).length), 0);
  assert.match(await page.textContent("#reserve .groupe[data-groupe='lettres']"), /en séance/);
  assert.match(await page.textContent("#reserve .groupe[data-groupe='lettres'] button"), /Mettre en réserve/);
  // La suspension d'un mois posée depuis la fiche n'est pas une mise en réserve.
  assert.equal(await page.evaluate(() => Stockage.etat.cards["letter-A"].suspended_until), null);

  // Tableau de bord : les deux enfants côte à côte.
  await page.click("[data-onglet='tableau']");
  assert.equal(await page.locator(".carte-stats").count(), 2);
  assert.match(await page.textContent(".carte-stats[data-deck='deck-1'] h3"), /Adam/);
  assert.deepEqual(erreurs, []);

  // Sur l'écran du mode : le filtre Lettres apparaît maintenant que les lettres
  // sont réveillées ; Chiffres aussi (1 à 3 sont en séance dès le départ).
  await page.click("#parent-fermer");
  await page.locator(".jumeau").nth(0).click();
  assert.equal(await page.isVisible("#filtre button[data-filtre='lettres']"), true);
  assert.equal(await page.isVisible("#filtre button[data-filtre='nombres']"), true);
  await page.click("#filtre button[data-filtre='lettres']");
  assert.match(await page.textContent("#mode-info"), /3 cartes/);
  await contexte.close();
});

test("réserve : sans lettres actives, pas de filtre Lettres ; une installation d'avant la réserve y passe ses cartes jamais vues", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html");
  await page.locator(".jumeau").nth(0).click();
  assert.equal(await page.isVisible("#filtre button[data-filtre='lettres']"), false);
  assert.equal(await page.isVisible("#filtre button[data-filtre='nombres']"), true, "les chiffres 1 à 3 sont en séance");
  assert.equal(await page.isVisible("#filtre button[data-filtre='tout']"), true);

  // Une base d'avant la réserve : tout actif, la lettre A déjà montrée.
  await page.evaluate(async () => {
    const etat = Stockage.etat;
    delete etat.migrations;
    for (const c of Object.values(etat.cards)) c.suspended = false;
    etat.reviews["r-a"] = { id: "r-a", session_id: "s", deck_id: "deck-1", card_id: "letter-A", grade: "knew", mode: "show", at: Date.now() };
    Stockage.enregistrerPaquet(etat.decks["deck-1"]);
    await new Promise((ok) => setTimeout(ok, 100));
  });
  await page.reload();
  await page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  const apres = await page.evaluate(() => ({
    a: Stockage.etat.cards["letter-A"].suspended,
    b: Stockage.etat.cards["letter-B"].suspended,
    rouge: Stockage.etat.cards["word-rouge"].suspended,
    chien: Stockage.etat.cards["word-chien"].suspended,
    quatre: Stockage.etat.cards["number-4"].suspended,
    trois: Stockage.etat.cards["number-3"].suspended,
    fait: Stockage.etat.migrations.reserve,
  }));
  assert.deepEqual(apres, { a: false, b: true, rouge: true, chien: false, quatre: true, trois: false, fait: true }, "déjà vue : reste ; jamais vue : en réserve");
  // Le filtre Lettres est là : A est active.
  await page.locator(".jumeau").nth(0).click();
  assert.equal(await page.isVisible("#filtre button[data-filtre='lettres']"), true);
  assert.deepEqual(erreurs, []);
  await contexte.close();
});

test("plafond quotidien : une deuxième séance le même jour ne propose que le reste, et rien ne verrouille l'écran", async () => {
  const { page, contexte } = await ouvrir("/flashcards/index.html");
  // Des révisions « aujourd'hui » pour le jumeau 2 jusqu'au plafond.
  await page.evaluate(() => {
    const d = Stockage.etat.decks["deck-2"];
    Stockage.enregistrerPaquet(Object.assign({}, d, { daily_cap: 6 }));
    const deja = Planificateur.restantAujourdhui(Object.values(Stockage.etat.reviews), "deck-2", 6, Date.now());
    for (let i = 0; i < deja; i++)
      Stockage.ajouterRevue({ id: "test-" + i, session_id: "x", deck_id: "deck-2", card_id: "word-chat", grade: "knew", mode: "show", at: Date.now() });
  });
  await page.locator(".jumeau").nth(1).click();
  assert.match(await page.textContent("#mode-info"), /Plafond du jour atteint/);
  await page.click("#mode-montrer");
  // Un appui de trop sur une tuile n'enferme pas le parent trente secondes
  // devant « fini » : on reste sur le choix du mode.
  assert.equal(await page.isVisible("#vue-mode"), true);
  assert.equal(await page.isVisible("#vue-fini"), false);
  assert.equal(await page.evaluate(() => Object.keys(Stockage.etat.sessions).length), 0, "aucune séance vide enregistrée");
  await contexte.close();
});

test("fiche : reposer une carte pour un seul enfant, et l'écran de l'enfant prévient quand rien ne s'enregistre", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html#parent");
  await page.click("[data-onglet='cartes']");
  await page.fill("#filtre-texte", "chien");
  await page.click("#liste-cartes li");
  await page.click("#fiche button[data-repos='deck-1']");
  const repos = await page.evaluate(() => ({
    j1: Planificateur.enRepos(Stockage.entree("deck-1", "word-chien"), Date.now()),
    j2: Planificateur.enRepos(Stockage.entree("deck-2", "word-chien"), Date.now()),
    drapeau: document.querySelector("#liste-cartes li .drapeaux").textContent,
  }));
  assert.deepEqual([repos.j1, repos.j2], [true, false], "le repos ne vaut que pour un enfant");
  assert.match(repos.drapeau, /repos/);
  // Le jumeau 1 ne la voit plus en séance ; le jumeau 2 si.
  const vue = await page.evaluate(() => [1, 2].map((n) =>
    Planificateur.choisirSession(Stockage.etat.cards, Stockage.entrees("deck-" + n), { cap: 200, maxNouvelles: 200 }).some((c) => c.id === "word-chien")));
  assert.deepEqual(vue, [false, true]);
  // Réveiller.
  await page.click("#liste-cartes li");
  assert.match(await page.textContent("#fiche button[data-repos='deck-1']"), /Réveiller/);
  await page.click("#fiche button[data-repos='deck-1']");
  assert.equal(await page.evaluate(() => Planificateur.enRepos(Stockage.entree("deck-1", "word-chien"), Date.now())), false);

  // Le stockage refuse d'écrire (plein, fermé…) : le départ le dit, en rouge,
  // au lieu de laisser noter dans le vide.
  await page.evaluate(async () => {
    IDBObjectStore.prototype.put = () => { throw new DOMException("plein", "QuotaExceededError"); };
    Stockage.enregistrerPaquet(Object.assign({}, Stockage.etat.decks["deck-1"], { name: "Adam" }));
    await new Promise((ok) => setTimeout(ok, 50));
  });
  assert.ok(await page.evaluate(() => !!Stockage.derniereErreur), "l'erreur est retenue");
  await page.click("#parent-fermer");
  assert.match(await page.textContent("#statut-depart"), /n'enregistre plus/);
  assert.equal(await page.$eval("#statut-depart", (el) => el.classList.contains("erreur")), true);
  assert.deepEqual(erreurs, []);
  await contexte.close();
});

test("sauvegarde : exporter sur la tablette, importer sur un autre appareil, tout y est", async () => {
  // Appareil A : des progrès, une photo, un prénom.
  const a = await ouvrir("/flashcards/index.html#parent");
  await a.page.evaluate(async () => {
    const photo = await Stockage.ajouterMedia(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }));
    Stockage.enregistrerCarte({ id: "carte-a", type: "word", label: "papi", category: "famille", extras: {},
      source: "photo", note: "", created_at: 0, suspended: false, suspended_until: null,
      images: [{ id: "i1", media: photo, emoji: null, is_primary: true, order: 0 }] }, ["deck-1"]);
    Stockage.enregistrerPaquet(Object.assign({}, Stockage.etat.decks["deck-2"], { name: "Ilyas" }));
    const e = Stockage.entree("deck-1", "word-chien");
    Stockage.enregistrerEntree(Planificateur.noter(e, "knew", Date.now()));
    Stockage.ajouterRevue({ id: "r-a", session_id: "s-a", deck_id: "deck-1", card_id: "word-chien", grade: "knew", mode: "show", at: Date.now() });
  });
  await a.page.click("[data-onglet='reglages']");
  assert.match(await a.page.textContent("#sauvegarde-statut"), /Aucune sauvegarde/);
  const [telechargement] = await Promise.all([a.page.waitForEvent("download"), a.page.click("#exporter")]);
  assert.match(telechargement.suggestedFilename(), /^flashcards-\d{4}-\d{2}-\d{2}\.json$/);
  const fichier = await telechargement.path();
  const contenu = JSON.parse(fs.readFileSync(fichier, "utf8"));
  assert.equal(contenu.format, "flashcards-sauvegarde");
  assert.equal(Object.keys(contenu.medias).length, 1, "la photo est dans le fichier");
  await a.page.waitForFunction(() => /téléchargée/.test(document.getElementById("sauvegarde-message").textContent));
  assert.match(await a.page.textContent("#sauvegarde-statut"), /Dernière sauvegarde/);

  // Appareil B, vierge : importer remplace tout par la sauvegarde.
  const b = await ouvrir("/flashcards/index.html#parent");
  await b.page.click("[data-onglet='reglages']");
  b.page.once("dialog", (d) => d.accept());
  await b.page.setInputFiles("#importer-sauvegarde", fichier);
  await b.page.waitForFunction(() => /importée/.test(document.getElementById("sauvegarde-message").textContent));
  const recu = await b.page.evaluate(async () => {
    const c = Stockage.etat.cards["carte-a"];
    const photo = await Stockage.lireMedia(c.images[0].media);
    return {
      label: c.label,
      photo: [photo.type, [...new Uint8Array(await photo.arrayBuffer())]],
      boite: Stockage.entree("deck-1", "word-chien").box,
      revues: Object.keys(Stockage.etat.reviews),
      prenom: Stockage.etat.decks["deck-2"].name,
      membre: !!Stockage.entree("deck-1", "carte-a") && !Stockage.entree("deck-2", "carte-a"),
    };
  });
  assert.deepEqual(recu, {
    label: "papi", photo: ["image/webp", [1, 2, 3, 4]],
    boite: 2, revues: ["r-a"], prenom: "Ilyas", membre: true,
  });
  // Les tuiles de départ ont suivi, et tout survit au rechargement.
  await b.page.reload();
  await b.page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  assert.equal(await b.page.evaluate(() => Stockage.etat.decks["deck-2"].name), "Ilyas");
  assert.equal(await b.page.evaluate(async () => !!(await Stockage.lireMedia(Stockage.etat.cards["carte-a"].images[0].media))), true);

  // Un fichier qui n'est pas une sauvegarde est refusé sans rien toucher.
  b.page.once("dialog", (d) => d.accept());
  await b.page.click("[data-onglet='reglages']");
  await b.page.setInputFiles("#importer-sauvegarde", { name: "photo.json", mimeType: "application/json", buffer: Buffer.from('{"bonjour":1}') });
  await b.page.waitForFunction(() => /pas une sauvegarde/.test(document.getElementById("sauvegarde-message").textContent));
  assert.equal(await b.page.evaluate(() => !!Stockage.etat.cards["carte-a"]), true);

  // Refuser la confirmation n'importe rien.
  const c = await ouvrir("/flashcards/index.html#parent");
  await c.page.click("[data-onglet='reglages']");
  c.page.once("dialog", (d) => d.dismiss());
  await c.page.setInputFiles("#importer-sauvegarde", fichier);
  await c.page.waitForTimeout(300);
  assert.equal(await c.page.evaluate(() => !!Stockage.etat.cards["carte-a"]), false);

  assert.deepEqual(a.erreurs, []);
  assert.deepEqual(b.erreurs, []);
  await Promise.all([a.contexte.close(), b.contexte.close(), c.contexte.close()]);
});

test("rappel de sauvegarde au départ, seulement quand il y a des progrès à perdre", async () => {
  const { page, contexte } = await ouvrir("/flashcards/index.html");
  assert.equal((await page.textContent("#statut-depart")).trim(), "", "rien à perdre, pas de rappel");
  await page.evaluate(() => {
    Stockage.ajouterRevue({ id: "r", session_id: "s", deck_id: "deck-1", card_id: "word-chien", grade: "knew", mode: "show", at: Date.now() });
  });
  await page.reload();
  await page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  assert.match(await page.textContent("#statut-depart"), /Aucune sauvegarde/);
  await page.evaluate(() => localStorage.setItem("flashcards.derniereSauvegarde", String(Date.now() - 2 * 86400000)));
  await page.reload();
  await page.waitForFunction(() => window.flashcards && window.flashcards.pret);
  assert.equal((await page.textContent("#statut-depart")).trim(), "", "sauvegarde récente : pas de rappel");
  await contexte.close();
});

test("police emoji embarquée : chargée en COLRv1, et elle couvre chaque emoji des deux jeux", async () => {
  const Graines = require("../flashcards/graines.js");
  const { charger } = require("./charger");
  const emojis = new Set();
  for (const [e] of Graines.MOTS) emojis.add(e);
  for (const [, , e] of Graines.LETTRES) emojis.add(e);
  for (const [, , objets] of Graines.NOMBRES) for (const e of objets) emojis.add(e);
  for (const n of charger().NOTIONS) emojis.add(n[0]);
  assert.ok(emojis.size > 150);

  for (const chemin of ["/flashcards/index.html", "/mot-a-mot/index.html", "/"]) {
    const { page, contexte, erreurs } = await ouvrir(chemin);
    const r = await page.evaluate(async (liste) => {
      await document.fonts.load('40px "Jeux Emoji"', liste.join(""));
      const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Jeux Emoji");
      const plages = faces.flatMap((f) => f.unicodeRange.split(",").map((p) => {
        const m = p.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
        return [parseInt(m[1], 16), parseInt(m[2] || m[1], 16)];
      }));
      const couvert = (cp) => plages.some(([a, b]) => cp >= a && cp <= b);
      const manquants = [];
      for (const e of liste) for (const ch of e) {
        const cp = ch.codePointAt(0);
        if (cp !== 0xfe0f && !couvert(cp)) manquants.push(e);
      }
      return { faces: faces.length, statuts: [...new Set(faces.map((f) => f.status))], manquants };
    }, [...emojis]);
    assert.equal(r.faces, 10, chemin + " : dix morceaux de police déclarés");
    assert.deepEqual(r.statuts, ["loaded"], chemin + " : Chromium charge la police COLRv1");
    assert.deepEqual(r.manquants, [], chemin + " : emoji hors police");
    assert.deepEqual(erreurs, []);
    await contexte.close();
  }
});

test("aucun son : ni voix de synthèse, ni micro, ni enregistrement, nulle part dans le code", () => {
  const interdits = /speechSynthesis|SpeechSynthesisUtterance|AudioContext|MediaRecorder|getUserMedia|<audio|new Audio\(/;
  const fichiers = [];
  (function parcourir(dossier) {
    for (const f of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (f.name === "node_modules" || f.name === ".git" || f.name === ".vercel" || f.name === "test") continue;
      const chemin = path.join(dossier, f.name);
      if (f.isDirectory()) parcourir(chemin);
      else if (/\.(html|js|css|webmanifest)$/.test(f.name)) fichiers.push(chemin);
    }
  })(RACINE);
  assert.ok(fichiers.length >= 8, "les fichiers sont trouvés : " + fichiers.length);
  for (const f of fichiers) assert.doesNotMatch(fs.readFileSync(f, "utf8"), interdits, path.relative(RACINE, f));
});

test("ancienne sauvegarde avec une voix : la voix est retirée, le reste est intact", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html#parent");
  const sauvegarde = await page.evaluate(async () => {
    const e = JSON.parse(JSON.stringify(Stockage.etat));
    e.cards["word-chien"].audio = { id: "v1", media: "m-voix", gain: 1.5, recorded_by: "papa" };
    e.cards["word-chat"].audio = null;
    const octets = (a) => btoa(String.fromCharCode(...a));
    return JSON.stringify({ format: "flashcards-sauvegarde", version: 1, exporte_le: Date.now(), etat: e,
      medias: { "m-voix": "data:audio/webm;base64," + octets([9, 8, 7]), "m-photo": "data:image/webp;base64," + octets([1, 2, 3]) } });
  });
  await page.click("[data-onglet='reglages']");
  page.once("dialog", (d) => d.accept());
  await page.setInputFiles("#importer-sauvegarde", { name: "ancienne.json", mimeType: "application/json", buffer: Buffer.from(sauvegarde) });
  await page.waitForFunction(() => /importée/.test(document.getElementById("sauvegarde-message").textContent));
  assert.match(await page.textContent("#sauvegarde-message"), /1 photos\./);
  const apres = await page.evaluate(async () => ({
    chien: "audio" in Stockage.etat.cards["word-chien"], chat: "audio" in Stockage.etat.cards["word-chat"],
    voix: await Stockage.lireMedia("m-voix"), photo: !!(await Stockage.lireMedia("m-photo")),
    cartes: Object.keys(Stockage.etat.cards).length,
  }));
  assert.deepEqual(apres, { chien: false, chat: false, voix: null, photo: true, cartes: 141 });
  assert.deepEqual(erreurs, []);
  await contexte.close();
});
