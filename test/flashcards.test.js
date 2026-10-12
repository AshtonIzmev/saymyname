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

async function glisser(page, dx, dy) {
  const x = 640, y = 400;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

// Gestes au doigt (et non à la souris) : chaque contact a son propre pointerId,
// comme sur la tablette.
async function doigt(page) {
  const cdp = await page.context().newCDPSession(page);
  const envoyer = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  return {
    async appuiLong(x, y, ms) {
      await envoyer("touchStart", [{ x, y }]);
      await page.waitForTimeout(ms);
      await envoyer("touchEnd", []);
    },
    async glisser(dx, dy) {
      const x = 640, y = 400;
      await envoyer("touchStart", [{ x, y }]);
      for (let k = 1; k <= 4; k++) await envoyer("touchMove", [{ x: x + (dx * k) / 4, y: y + (dy * k) / 4 }]);
      await envoyer("touchEnd", []);
    },
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

test("séance « montrer » : écran nu, glissements notés, appui long → « fini » verrouillé", async () => {
  const { page, contexte, erreurs } = await ouvrir("/flashcards/index.html");
  assert.equal(await page.locator(".jumeau").count(), 2);
  await page.evaluate(() => { flashcards.config.verrouFini = 1500; });
  await commencerSeance(page, 0, "show");

  // Premier jour : tout est neuf, donc trois cartes (au plus trois nouvelles).
  const file = await page.evaluate(() => flashcards.seance.file.map((c) => c.id));
  assert.equal(file.length, 3);
  // Rien d'autre qu'une image et un mot : aucun bouton, aucun lien, aucune barre.
  assert.equal(await page.locator("#vue-enfant button, #vue-enfant a, #vue-enfant input").count(), 0);
  assert.equal(await page.locator("#scene .visuel").count(), 1);
  assert.equal(await page.locator("#scene .etiquette").count(), 1);
  const visuel = await page.locator("#scene .visuel").boundingBox();
  assert.ok(visuel.height >= 0.6 * 800, "l'image occupe ~70 % de l'écran : " + visuel.height);

  // Tap sur l'image : la voix, sans note ni changement de carte.
  await page.click("#scene .visuel");
  assert.equal(await page.evaluate(() => flashcards.seance.i), 0);

  await glisser(page, 250, 0);   // → su
  await glisser(page, 0, -250);  // ↑ hésitant
  assert.equal(await page.evaluate(() => flashcards.seance.i), 2);
  const entrees = await page.evaluate((ids) => ids.map((id) => Stockage.entree("deck-1", id)), file);
  assert.deepEqual(entrees.slice(0, 2).map((e) => [e.box, e.reviews]), [[2, 1], [1, 1]]);
  assert.equal(entrees[2].reviews, 0);
  // Le jumeau 2 n'est pas touché.
  assert.equal(await page.evaluate((id) => Stockage.entree("deck-2", id).reviews, file[0]), 0);

  // Appui long au doigt : fin de séance, par le parent.
  const toucher = await doigt(page);
  await toucher.appuiLong(640, 400, 1100);
  assert.equal(await page.isVisible("#vue-fini"), true);
  assert.equal((await page.textContent("#vue-fini")).trim(), "fini");
  const seance = await page.evaluate(() => Object.values(Stockage.etat.sessions)[0]);
  assert.equal(seance.ended_by, "parent");
  // Verrouillé : taper ne sert à rien, puis retour au départ.
  await page.mouse.click(640, 400);
  assert.equal(await page.isVisible("#vue-fini"), true);
  await page.waitForSelector("#vue-depart:not([hidden])", { timeout: 4000 });

  // Séance suivante sur la même page, au doigt : les glissements marchent
  // encore après un appui long.
  await commencerSeance(page, 0, "show");
  await toucher.glisser(250, 0);
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

  // Bonne réponse du premier coup.
  let cote = await page.evaluate(() => flashcards.seance.essai.cote);
  const cible = await page.evaluate(() => flashcards.carteCourante.id);
  const distracteur = await page.evaluate(() => flashcards.seance.essai.distracteur);
  assert.notEqual(distracteur.id, cible);
  const categories = await page.evaluate((d) => [Planificateur.categorie(flashcards.carteCourante), Planificateur.categorie(d)], distracteur);
  assert.notEqual(categories[0], categories[1], "jamais deux animaux face à face");
  await page.locator("#scene .option").nth(cote).tap();
  const apres = await page.evaluate((c) => ({
    estompee: document.querySelectorAll("#scene .option")[1 - c].classList.contains("estompee"),
    etiquette: document.querySelectorAll("#scene .option")[c].querySelector(".etiquette").textContent,
  }), cote);
  assert.equal(apres.estompee, true);
  assert.ok(apres.etiquette.length > 0, "l'étiquette apparaît sous la cible");
  await glisser(page, 0, 250); // ↓ : on garde la note automatique
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
  await glisser(page, 0, -250);
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
  await tel.fill("#ajout-phrase", "le hérisson");
  await tel.selectOption("#ajout-categorie", "animal");
  await tel.uncheck("#ajout-paquets input[value='deck-2']");
  await tel.click("#ajout-enregistrer-carte");
  await tel.waitForFunction(() => /ajoutée/.test(document.getElementById("ajout-message").textContent));
  const herisson = await tel.evaluate(() => Object.values(Stockage.etat.cards).find((c) => c.label === "hérisson"));
  assert.ok(herisson, "la carte est enregistrée");
  assert.equal(herisson.source, "emoji");
  assert.deepEqual(await tel.evaluate((id) => Object.values(Stockage.etat.deck_cards).filter((e) => e.card_id === id).map((e) => [e.deck_id, e.box]), herisson.id),
    [["deck-1", 1]]);

  // Liste des cartes : filtre « à enregistrer » et fiche.
  await tel.click("[data-onglet='cartes']");
  await tel.fill("#filtre-texte", "hérisson");
  assert.equal(await tel.locator("#liste-cartes li").count(), 1);
  assert.match(await tel.textContent("#liste-cartes li"), /à enregistrer/);
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

  // Tableau de bord : les deux enfants côte à côte.
  await page.click("[data-onglet='tableau']");
  assert.equal(await page.locator(".carte-stats").count(), 2);
  assert.match(await page.textContent(".carte-stats[data-deck='deck-1'] h3"), /Adam/);
  assert.deepEqual(erreurs, []);
  await contexte.close();
});

test("plafond quotidien : une deuxième séance le même jour ne propose que le reste", async () => {
  const { page, contexte } = await ouvrir("/flashcards/index.html");
  await page.evaluate(() => { flashcards.config.verrouFini = 200; });
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
  assert.equal(await page.isVisible("#vue-fini"), true);
  await contexte.close();
});

test("sauvegarde : exporter sur la tablette, importer sur un autre appareil, tout y est", async () => {
  // Appareil A : des progrès, une photo, une voix, un prénom.
  const a = await ouvrir("/flashcards/index.html#parent");
  await a.page.evaluate(async () => {
    const photo = await Stockage.ajouterMedia(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }));
    const voix = await Stockage.ajouterMedia(new Blob([new Uint8Array([9, 8, 7])], { type: "audio/webm" }));
    Stockage.enregistrerCarte({ id: "carte-a", type: "word", label: "papi", category: "famille", extras: { phrase: "papi" },
      source: "photo", note: "", created_at: 0, suspended: false, suspended_until: null,
      images: [{ id: "i1", media: photo, emoji: null, is_primary: true, order: 0 }],
      audio: { id: "v1", media: voix, gain: 1.5, recorded_by: "papa" } }, ["deck-1"]);
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
  assert.equal(Object.keys(contenu.medias).length, 2, "la photo et la voix sont dans le fichier");
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
    const voix = await Stockage.lireMedia(c.audio.media);
    return {
      label: c.label, gain: c.audio.gain,
      photo: [photo.type, [...new Uint8Array(await photo.arrayBuffer())]],
      voix: [voix.type, [...new Uint8Array(await voix.arrayBuffer())]],
      boite: Stockage.entree("deck-1", "word-chien").box,
      revues: Object.keys(Stockage.etat.reviews),
      prenom: Stockage.etat.decks["deck-2"].name,
      membre: !!Stockage.entree("deck-1", "carte-a") && !Stockage.entree("deck-2", "carte-a"),
    };
  });
  assert.deepEqual(recu, {
    label: "papi", gain: 1.5, photo: ["image/webp", [1, 2, 3, 4]], voix: ["audio/webm", [9, 8, 7]],
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
