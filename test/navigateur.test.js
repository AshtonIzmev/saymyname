// Critères d'acceptation vérifiés dans un vrai Chromium, depuis un file://.
// Nécessite Playwright (global ou local) et son Chromium.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CHEMIN_HTML } = require("./charger");

function chargerPlaywright() {
  try { return require("playwright"); } catch (_) {}
  const { execSync } = require("node:child_process");
  const racine = execSync("npm root -g").toString().trim();
  return require(path.join(racine, "playwright"));
}

const URL = "file://" + CHEMIN_HTML;
const TAILLES = [[1024, 768], [1920, 1440], [768, 1024], [1200, 1200], [1440, 1920]];
let navigateur;

before(async () => {
  const { chromium } = chargerPlaywright();
  navigateur = await chromium.launch();
});
after(async () => { if (navigateur) await navigateur.close(); });

async function ouvrir(largeur = 1024, hauteur = 768) {
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, hasTouch: true });
  const page = await contexte.newPage();
  const requetes = [];
  const erreurs = [];
  page.on("request", (r) => requetes.push(r.url()));
  page.on("pageerror", (e) => erreurs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.motAMot && window.motAMot.etat);
  return { page, contexte, requetes, erreurs };
}

const idsAffiches = (page) => page.evaluate(() => ({
  centre: motAMot.etat.centre[1],
  coins: motAMot.etat.coins.map((c) => c[1]),
}));

test("critère 2 : aucune règle CSS interdite sur le plateau", () => {
  const html = fs.readFileSync(CHEMIN_HTML, "utf8");
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
  for (const motif of [/transition/, /animation/, /@keyframes/, /gradient/, /box-shadow/, /text-shadow/, /\bfilter\s*:/, /backdrop-filter/, /blur\(/, /:hover/, /transform\s*:/, /opacity\s*:/])
    assert.ok(!motif.test(css), "CSS interdit trouvé : " + motif);
  // Aucun gris entre #666 et #AAA.
  for (const m of css.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    if (r === g && g === b) assert.ok(r < 0x66 || r > 0xaa, "gris qui trame mal : #" + h);
  }
  assert.ok(!/@font-face/.test(css) && !/@import/.test(css), "aucune police réseau");
});

test("critère 9 : s'ouvre depuis file:// sans requête réseau ni erreur", async () => {
  const { page, contexte, requetes, erreurs } = await ouvrir();
  await page.click("#bouton-hasard");
  await page.keyboard.press("1");
  assert.deepEqual(erreurs, []);
  assert.ok(requetes.length > 0);
  for (const u of requetes) assert.ok(u.startsWith("file://"), "requête sortante : " + u);
  await contexte.close();
});

test("critère 1 : aucun caractère de texte sur le plateau", async () => {
  const { page, contexte } = await ouvrir();
  for (let i = 0; i < 15; i++) {
    const texte = await page.evaluate(() => document.getElementById("plateau").textContent);
    // Seuls des pictogrammes (et leurs sélecteurs de variante / ZWJ) sont tolérés.
    const reste = texte.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}️‍\s]/gu, "");
    assert.equal(reste, "", "texte sur le plateau : « " + reste + " »");
    const attributs = await page.evaluate(() =>
      [...document.querySelectorAll("#plateau [title], #plateau [alt]:not([alt=''])")].length);
    assert.equal(attributs, 0);
    await page.keyboard.press(String(1 + (i % 4)));
  }
  await contexte.close();
});

// Distance d'un point au contour d'un carré à angles arrondis (0 = sur le contour).
function distanceContourArrondi(px, py, rect, rayon) {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const demi = rect.width / 2;
  const qx = Math.abs(px - cx) - (demi - rayon), qy = Math.abs(py - cy) - (demi - rayon);
  const ext = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return ext - rayon;
}

async function verifierFils(page) {
  const mesures = await page.evaluate(() => {
    const R = document.getElementById("plateau").getBoundingClientRect();
    const rel = (r) => ({ x: r.left - R.left, y: r.top - R.top, width: r.width, height: r.height });
    const plaque = document.getElementById("centre");
    return {
      plaque: rel(plaque.getBoundingClientRect()),
      rayon: parseFloat(getComputedStyle(plaque).borderTopLeftRadius),
      cercles: [1, 2, 3, 4].map((i) => rel(document.getElementById("coin-" + i).getBoundingClientRect())),
      fils: [1, 2, 3, 4].map((i) => {
        const l = document.getElementById("fil-" + i);
        return ["x1", "y1", "x2", "y2"].map((a) => parseFloat(l.getAttribute(a)));
      }),
    };
  });
  for (let i = 0; i < 4; i++) {
    const [x1, y1, x2, y2] = mesures.fils[i];
    const d1 = distanceContourArrondi(x1, y1, mesures.plaque, mesures.rayon);
    assert.ok(Math.abs(d1) < 0.5, "fil " + (i + 1) + " ne touche pas la plaque : " + d1.toFixed(2) + " px");
    const c = mesures.cercles[i];
    const d2 = Math.hypot(x2 - (c.x + c.width / 2), y2 - (c.y + c.height / 2)) - c.width / 2;
    assert.ok(Math.abs(d2) < 0.5, "fil " + (i + 1) + " ne touche pas le cercle : " + d2.toFixed(2) + " px");
    assert.ok(Math.hypot(x2 - x1, y2 - y1) > 10, "fil " + (i + 1) + " trop court");
  }
}

async function verifierRognage(page, largeur, hauteur) {
  const r = await page.evaluate(() => {
    const boite = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
    return {
      formes: ["centre", "coin-1", "coin-2", "coin-3", "coin-4", "barre"].map(boite),
      defilement: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      plateau: boite("plateau"),
    };
  });
  for (const f of r.formes) {
    assert.ok(f.left >= 0 && f.top >= 0 && f.right <= largeur + 0.5 && f.bottom <= hauteur + 0.5,
      "élément rogné à " + largeur + "×" + hauteur + " : " + JSON.stringify(f));
    assert.ok(f.width > 20 && f.height > 20);
  }
  assert.ok(r.defilement[0] <= largeur && r.defilement[1] <= hauteur, "la page défile");
  const carre = r.formes[0];
  assert.ok(Math.abs(carre.width - carre.height) < 1, "la plaque n'est pas carrée");
  const cadres = await page.evaluate(() => [...document.querySelectorAll("#plateau .forme")].map((f) => getComputedStyle(f).borderTopWidth));
  assert.deepEqual(cadres, ["0px", "0px", "0px", "0px", "0px"], "aucune forme ne doit avoir de cadre");
  assert.ok(carre.bottom <= r.plateau.bottom + 0.5 && carre.top >= r.plateau.top - 0.5);
}

test("critères 4 et 5 : fils exacts et rien de rogné, à toutes tailles, après redimensionnement", async () => {
  const { page, contexte } = await ouvrir(...TAILLES[0]);
  for (const [l, h] of TAILLES) {
    await page.setViewportSize({ width: l, height: h });
    await page.waitForTimeout(50);
    await verifierRognage(page, l, h);
    await verifierFils(page);
    // Diamètre des cercles ≈ 20 % du plus petit côté.
    const d = await page.evaluate(() => document.getElementById("coin-1").getBoundingClientRect().width);
    assert.ok(Math.abs(d - 0.2 * Math.min(l, h)) < 1, "diamètre " + d + " à " + l + "×" + h);
  }
  // Après navigation, les fils restent justes.
  await page.keyboard.press("2");
  await verifierFils(page);
  await contexte.close();
});

test("critère 7 : l'appui inverse le cercle, le relâchement navigue", async () => {
  const { page, contexte } = await ouvrir();
  const avant = await idsAffiches(page);
  const boite = await page.locator("#coin-3").boundingBox();
  const cx = boite.x + boite.width / 2, cy = boite.y + boite.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const pendant = await page.evaluate(() => {
    const c = document.getElementById("coin-3");
    const s = getComputedStyle(c, "::after");
    return { presse: c.classList.contains("presse"), voile: s.content !== "none" && s.mixBlendMode === "difference" };
  });
  assert.equal(pendant.presse, true, "classe presse absente pendant l'appui");
  assert.equal(pendant.voile, true, "inversion absente pendant l'appui");
  assert.deepEqual(await idsAffiches(page), avant, "pas de navigation avant le relâchement");
  await page.mouse.up();
  const apres = await idsAffiches(page);
  assert.equal(apres.centre, avant.coins[2], "le coin tapé devient le centre");
  assert.equal(await page.evaluate(() => document.getElementById("coin-3").classList.contains("presse")), false);
  // Les nouvelles voisines excluent l'ancien centre et les anciens coins.
  for (const id of [avant.centre, ...avant.coins]) assert.ok(!apres.coins.includes(id), id + " réapparaît");

  // Relâchement hors du cercle : rien.
  const b2 = await page.locator("#coin-1").boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, 10);
  await page.mouse.up();
  assert.deepEqual(await idsAffiches(page), apres);
  await contexte.close();
});

test("critère 7 bis : le même geste au doigt (tactile)", async () => {
  const { page, contexte } = await ouvrir();
  const avant = await idsAffiches(page);
  await page.tap("#coin-2");
  const apres = await idsAffiches(page);
  assert.equal(apres.centre, avant.coins[1]);
  await contexte.close();
});

test("critère 8 : taper le centre ne produit rien", async () => {
  const { page, contexte } = await ouvrir();
  const avant = await idsAffiches(page);
  await page.tap("#centre");
  await page.click("#centre");
  await page.click("#centre");
  assert.deepEqual(await idsAffiches(page), avant);
  assert.equal(await page.evaluate(() => motAMot.historique.length), 0);
  await contexte.close();
});

test("critère 3 : les cinq images changent dans la même frame, en moins de 300 ms", async () => {
  const { page, contexte } = await ouvrir();
  await page.evaluate(() => {
    window.__frames = 0;
    const compter = () => { window.__frames++; requestAnimationFrame(compter); };
    requestAnimationFrame(compter);
    window.__mutations = [];
    const obs = new MutationObserver((liste) => {
      for (const m of liste) window.__mutations.push({ cible: m.target.id, frame: window.__frames, t: performance.now() });
    });
    for (const id of ["centre", "coin-1", "coin-2", "coin-3", "coin-4"])
      obs.observe(document.getElementById(id), { childList: true });
  });
  await page.waitForTimeout(100);
  const t0 = await page.evaluate(() => { window.__mutations = []; const t = performance.now(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "1" })); return t; });
  await page.waitForTimeout(100);
  const mutations = await page.evaluate(() => window.__mutations);
  const cibles = new Set(mutations.map((m) => m.cible));
  assert.equal(cibles.size, 5, "cinq formes modifiées : " + [...cibles]);
  assert.equal(new Set(mutations.map((m) => m.frame)).size, 1, "les changements s'étalent sur plusieurs frames");
  for (const m of mutations) assert.ok(m.t - t0 < 300, "trop lent : " + (m.t - t0) + " ms");
  await contexte.close();
});

test("barre du père : retour, hasard, e-ink (mémorisé), raccourcis clavier", async () => {
  const { page, contexte } = await ouvrir();
  assert.equal(await page.isDisabled("#bouton-retour"), true);
  const e0 = await idsAffiches(page);
  await page.keyboard.press("4");
  const e1 = await idsAffiches(page);
  assert.equal(e1.centre, e0.coins[3]);
  assert.equal(await page.isDisabled("#bouton-retour"), false);
  await page.keyboard.press("Backspace");
  assert.deepEqual(await idsAffiches(page), e0, "Retour restaure exactement l'état précédent");
  assert.equal(await page.isDisabled("#bouton-retour"), true);
  await page.keyboard.press(" ");
  const e2 = await idsAffiches(page);
  assert.notEqual(e2.centre, e0.centre);
  await page.click("#bouton-retour");
  assert.deepEqual(await idsAffiches(page), e0);
  await page.click("#bouton-hasard");
  assert.notEqual((await idsAffiches(page)).centre, e0.centre);

  // La barre ne contient que quatre commandes, sans couleur.
  const barre = await page.evaluate(() => [...document.querySelectorAll("#barre button")].map((b) => ({
    texte: b.textContent, couleur: getComputedStyle(b).color, fond: getComputedStyle(b).backgroundColor })));
  assert.deepEqual(barre.map((b) => b.texte), ["Jeux", "Retour", "Au hasard", "E-ink"]);
  for (const b of barre) for (const c of [b.couleur, b.fond]) {
    const [r, g, bl] = c.match(/\d+/g).map(Number);
    assert.ok(r === g && g === bl, "couleur dans la barre : " + c);
  }

  // E-ink : bascule, voile de désaturation, contours épaissis, mémorisation.
  assert.equal(await page.getAttribute("#bouton-eink", "aria-pressed"), "false");
  await page.click("#bouton-eink");
  const eink = await page.evaluate(() => ({
    classe: document.documentElement.classList.contains("eink"),
    fil: getComputedStyle(document.getElementById("fil-1")).strokeWidth,
    voile: getComputedStyle(document.getElementById("plateau"), "::after").mixBlendMode,
    memo: localStorage.getItem("motamot.eink"),
  }));
  assert.deepEqual(eink, { classe: true, fil: "3px", voile: "saturation", memo: "1" });
  await verifierFils(page);
  await page.reload();
  await page.waitForFunction(() => window.motAMot && window.motAMot.etat);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("eink")), true);
  await page.click("#bouton-eink");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("eink")), false);
  await contexte.close();
});

test("purge de la dalle : le voile noir apparaît une frame puis disparaît ; API constructeur prioritaire", async () => {
  const { page, contexte } = await ouvrir();
  const r = await page.evaluate(() => new Promise((res) => {
    motAMot.purgerDalle();
    const visible = !document.getElementById("voile").hidden;
    setTimeout(() => res({ visible, apres: document.getElementById("voile").hidden }), 200);
  }));
  assert.deepEqual(r, { visible: true, apres: true });
  const appel = await page.evaluate(() => {
    let n = 0; motAMot.rafraichirDalle = () => n++; motAMot.purgerDalle();
    return { n, voile: document.getElementById("voile").hidden };
  });
  assert.deepEqual(appel, { n: 1, voile: true });
  await contexte.close();
});

test("critère 10 : une notion avec un chemin d'image est rendue en <img> préchargée", async () => {
  // Copie temporaire de la page avec une ligne de plus, et une vraie image à côté.
  const dossier = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "motamot-"));
  fs.mkdirSync(path.join(dossier, "img"));
  fs.writeFileSync(path.join(dossier, "img", "exemple.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  const html = fs.readFileSync(CHEMIN_HTML, "utf8").replace(
    "const NOTIONS = [",
    'const NOTIONS = [\n  ["img/exemple.svg", "exemple", "objet", ["rond", "joue", "rouge", "petit", "maison"]],');
  assert.notEqual(html.indexOf("exemple.svg"), -1);
  const copie = path.join(dossier, "index.html");
  fs.writeFileSync(copie, html);

  const contexte = await navigateur.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e)));
  await page.goto("file://" + copie);
  await page.waitForFunction(() => window.motAMot && window.motAMot.etat);
  const rendu = await page.evaluate(() => {
    const ok = motAMot.aller("exemple");
    const img = document.querySelector("#centre img");
    return {
      ok,
      centre: motAMot.etat.centre[1],
      img: !!img,
      alt: img && img.getAttribute("alt"),
      chargee: !!img && img.complete && img.naturalWidth > 0,
      glyphesAilleurs: document.querySelectorAll("#plateau .glyphe").length,
    };
  });
  assert.deepEqual(erreurs, []);
  assert.equal(rendu.ok, true);
  assert.equal(rendu.centre, "exemple");
  assert.equal(rendu.img, true, "la notion à chemin est rendue en <img>");
  assert.equal(rendu.alt, "", "aucun texte alternatif affichable");
  assert.equal(rendu.chargee, true, "l'image est préchargée et décodée");
  assert.equal(rendu.glyphesAilleurs, 4, "les quatre coins restent des glyphes");
  await contexte.close();
  fs.rmSync(dossier, { recursive: true, force: true });
});

test("captures pour vérification visuelle", async () => {
  const dossier = process.env.CAPTURES;
  if (!dossier) return;
  fs.mkdirSync(dossier, { recursive: true });
  for (const [l, h] of [[1024, 768], [768, 1024]]) {
    const { page, contexte } = await ouvrir(l, h);
    await page.screenshot({ path: path.join(dossier, `plateau-${l}x${h}.png`) });
    const b = await page.locator("#coin-4").boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.screenshot({ path: path.join(dossier, `presse-${l}x${h}.png`) });
    await page.mouse.up();
    await page.click("#bouton-eink");
    await page.screenshot({ path: path.join(dossier, `eink-${l}x${h}.png`) });
    await contexte.close();
  }
});
