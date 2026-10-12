// API du serveur : graines, lot (la version la plus récente l'emporte),
// médias, secret partagé, et fichiers servis (rien d'autre que les pages).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { creerServeur } = require("../serveur/serveur.js");

let serveur, base, dossier;
const SECRET = "secret-de-test";

before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), "flashcards-serveur-"));
  serveur = creerServeur({ dossier, secrets: [SECRET] });
  await new Promise((ok) => serveur.listen(0, ok));
  base = "http://127.0.0.1:" + serveur.address().port;
});
after(async () => {
  await new Promise((ok) => serveur.close(ok));
  fs.rmSync(dossier, { recursive: true, force: true });
});

const appel = (chemin, options = {}) => fetch(base + chemin, Object.assign({}, options, {
  headers: Object.assign({ Authorization: "Bearer " + SECRET }, options.headers || {}),
}));

test("sans le secret, l'API refuse ; les pages restent servies", async () => {
  assert.equal((await fetch(base + "/api/etat")).status, 401);
  assert.equal((await fetch(base + "/api/etat", { headers: { Authorization: "Bearer faux" } })).status, 401);
  const accueil = await fetch(base + "/");
  assert.equal(accueil.status, 200);
  assert.match(await accueil.text(), /Choisir un jeu/);
  for (const p of ["/mot-a-mot/index.html", "/flashcards/index.html", "/flashcards/app.js", "/sw.js", "/manifest.webmanifest", "/icones/icone-192.png"])
    assert.equal((await fetch(base + p)).status, 200, p);
  for (const p of ["/serveur/serveur.js", "/package.json", "/test/serveur.test.js", "/flashcards/../serveur/serveur.js", "/%2e%2e/package.json", "/data/flashcards.sqlite"])
    assert.equal((await fetch(base + p)).status, 404, p);
});

test("premier démarrage : le jeu de départ est semé dans les deux paquets", async () => {
  const etat = await (await appel("/api/etat")).json();
  assert.equal(etat.decks.length, 2);
  assert.ok(etat.cards.length > 130);
  assert.equal(etat.deck_cards.length, etat.cards.length * 2);
  const chien = etat.cards.find((c) => c.id === "word-chien");
  assert.equal(chien.extras.phrase, "le chien");
  assert.equal(chien.images[0].emoji, "🐕");
});

test("lot : carte, entrées, séance et révisions ; la version la plus récente l'emporte", async () => {
  const carte = {
    id: "abc123", type: "word", label: "tonton", category: "famille", extras: { phrase: "tonton" }, source: "photo",
    note: "", created_at: 1000, suspended: false, suspended_until: null, updated_at: 2000,
    images: [{ id: "img1", media: "m1", emoji: null, is_primary: true, order: 0 }],
    audio: { id: "aud1", media: "m2", gain: 1.7, recorded_by: "papa" },
  };
  const entree = { deck_id: "deck-1", card_id: "abc123", box: 2, due_at: 5000, streak: 0, fail_count: 0, reviews: 1, last_seen_at: 4000, updated_at: 4000 };
  const lot = {
    cards: [carte], deck_cards: [entree],
    sessions: [{ id: "s1", deck_id: "deck-1", mode: "show", filter: "tout", started_at: 3000, ended_at: 4500, ended_by: "cap" }],
    reviews: [{ id: "r1", session_id: "s1", deck_id: "deck-1", card_id: "abc123", grade: "knew", mode: "show", distractor_card_id: null, touches: null, at: 4000 }],
  };
  assert.equal((await appel("/api/lot", { method: "POST", body: JSON.stringify(lot) })).status, 200);
  // Rejouer le même lot est sans effet (la file d'attente peut renvoyer deux fois).
  assert.equal((await appel("/api/lot", { method: "POST", body: JSON.stringify(lot) })).status, 200);
  // Une version plus ancienne ne remplace pas la récente.
  const vieux = { cards: [Object.assign({}, carte, { label: "vieux", updated_at: 1500, images: [] })], deck_cards: [Object.assign({}, entree, { box: 1, updated_at: 3000 })] };
  assert.equal((await appel("/api/lot", { method: "POST", body: JSON.stringify(vieux) })).status, 200);

  const etat = await (await appel("/api/etat")).json();
  const c = etat.cards.find((x) => x.id === "abc123");
  assert.equal(c.label, "tonton");
  assert.equal(c.images.length, 1);
  assert.deepEqual(c.audio, { id: "aud1", media: "m2", recorded_by: "papa", gain: 1.7 });
  assert.equal(etat.deck_cards.find((e) => e.card_id === "abc123" && e.deck_id === "deck-1").box, 2);
  assert.equal(etat.reviews.filter((r) => r.id === "r1").length, 1);
  assert.equal(etat.sessions.find((s) => s.id === "s1").ended_by, "cap");

  const tableau = await (await appel("/api/tableau")).json();
  const d1 = tableau.find((t) => t.deck_id === "deck-1");
  assert.equal(d1.learned_this_week, 0, "la révision de test date de 1970");
  assert.equal(d1.boxes["2"], 1);
});

test("lot invalide : refusé en entier, sans écriture partielle", async () => {
  const lot = { cards: [{ id: "ok-1", type: "word", label: "ok", updated_at: 1 }, { id: "../x", type: "word", label: "x" }] };
  const r = await appel("/api/lot", { method: "POST", body: JSON.stringify(lot) });
  assert.equal(r.status, 400);
  const etat = await (await appel("/api/etat")).json();
  assert.ok(!etat.cards.some((c) => c.id === "ok-1"));
  assert.equal((await appel("/api/lot", { method: "POST", body: "{pas du json" })).status, 400);
});

test("médias : dépôt puis lecture, types contrôlés", async () => {
  const octets = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
  let r = await appel("/api/media/m1", { method: "PUT", body: octets, headers: { "Content-Type": "image/webp" } });
  assert.equal(r.status, 200);
  r = await appel("/api/media/m1");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), octets);
  r = await appel("/api/media/m2", { method: "PUT", body: octets, headers: { "Content-Type": "audio/webm;codecs=opus" } });
  assert.equal(r.status, 200);
  r = await appel("/api/media/m3", { method: "PUT", body: "<script>", headers: { "Content-Type": "text/html" } });
  assert.equal(r.status, 400);
  assert.equal((await appel("/api/media/inconnu")).status, 404);
  assert.equal((await fetch(base + "/api/media/m1")).status, 401, "les photos de famille ne sortent pas sans secret");
});
