// ==========================================================================
// SERVEUR. Sert les pages (accueil, Mot à Mot, Flashcards) et l'API de
// synchronisation des flashcards : SQLite pour les données, un dossier pour
// les médias. Aucune dépendance : node:http et node:sqlite (Node ≥ 22.13).
//
// Le serveur ne recalcule rien : la tablette planifie hors ligne et pousse
// ses révisions et ses lignes deck_card ; le serveur les range. Chaque objet
// porte un updated_at et la version la plus récente l'emporte, des deux côtés.
//
//   PORT       port d'écoute (8080)
//   DATA_DIR   dossier de la base et des médias (./data)
//   SECRETS    secrets partagés, séparés par des virgules, un par appareil.
//              Vide : API ouverte (développement seulement).
// ==========================================================================
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const Graines = require("../flashcards/graines.js");

const RACINE = path.join(__dirname, "..");
// Seuls ces chemins sont servis : le reste du dépôt (serveur, tests, données)
// ne sort pas.
const PUBLICS = ["index.html", "sw.js", "manifest.webmanifest", "icones/", "mot-a-mot/", "flashcards/"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".md": "text/plain; charset=utf-8",
};
const TYPES_MEDIA = /^(image\/(webp|jpeg|png)|audio\/(webm|ogg|mp4|mpeg|wav))$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_LOT = 5 * 1024 * 1024;
const MAX_MEDIA = 10 * 1024 * 1024;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('word', 'number', 'letter')),
  label TEXT NOT NULL, category TEXT, extras TEXT NOT NULL DEFAULT '{}',
  source TEXT, note TEXT, created_at INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0, suspended_until INTEGER, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS image (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  media TEXT, emoji TEXT, is_primary INTEGER NOT NULL DEFAULT 0, "order" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audio (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  media TEXT NOT NULL, recorded_by TEXT, gain REAL NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS deck (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, photo TEXT,
  daily_cap INTEGER NOT NULL DEFAULT 10, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deck_card (
  deck_id TEXT NOT NULL REFERENCES deck(id), card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5), due_at INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0, fail_count INTEGER NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER, updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deck_id, card_id)
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES deck(id), mode TEXT NOT NULL, filter TEXT,
  started_at INTEGER NOT NULL, ended_at INTEGER, ended_by TEXT
);
CREATE TABLE IF NOT EXISTS review (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, deck_id TEXT NOT NULL, card_id TEXT NOT NULL,
  grade TEXT NOT NULL, mode TEXT NOT NULL, distractor_card_id TEXT, touches INTEGER, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS review_deck ON review (deck_id, at);
`;

function ouvrirBase(dossier) {
  fs.mkdirSync(path.join(dossier, "media"), { recursive: true });
  const db = new DatabaseSync(path.join(dossier, "flashcards.sqlite"));
  db.exec(SCHEMA);
  return db;
}

function transaction(db, f) {
  db.exec("BEGIN");
  try { const r = f(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

// ---------- Écritures : la version la plus récente l'emporte ----------

function ecrireCarte(db, c) {
  if (!c || !ID.test(c.id) || !["word", "number", "letter"].includes(c.type) || typeof c.label !== "string")
    throw new ErreurClient("carte invalide : " + JSON.stringify(c && c.id));
  const existante = db.prepare("SELECT updated_at FROM card WHERE id = ?").get(c.id);
  if (existante && existante.updated_at > (c.updated_at || 0)) return false;
  db.prepare(`INSERT INTO card (id, type, label, category, extras, source, note, created_at, suspended, suspended_until, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET type = excluded.type, label = excluded.label, category = excluded.category,
      extras = excluded.extras, source = excluded.source, note = excluded.note, created_at = excluded.created_at,
      suspended = excluded.suspended, suspended_until = excluded.suspended_until, updated_at = excluded.updated_at`)
    .run(c.id, c.type, c.label, c.category || null, JSON.stringify(c.extras || {}), c.source || null, c.note || "",
      c.created_at || 0, c.suspended ? 1 : 0, c.suspended_until || null, c.updated_at || 0);
  db.prepare("DELETE FROM image WHERE card_id = ?").run(c.id);
  db.prepare("DELETE FROM audio WHERE card_id = ?").run(c.id);
  const insImage = db.prepare(`INSERT INTO image (id, card_id, media, emoji, is_primary, "order") VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET card_id = excluded.card_id, media = excluded.media, emoji = excluded.emoji,
      is_primary = excluded.is_primary, "order" = excluded."order"`);
  for (const im of c.images || []) {
    if (!ID.test(im.id)) throw new ErreurClient("image invalide");
    insImage.run(im.id, c.id, im.media || null, im.emoji || null, im.is_primary ? 1 : 0, im.order || 0);
  }
  if (c.audio) {
    if (!ID.test(c.audio.id) || !ID.test(c.audio.media || "")) throw new ErreurClient("audio invalide");
    db.prepare(`INSERT INTO audio (id, card_id, media, recorded_by, gain) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET card_id = excluded.card_id, media = excluded.media,
        recorded_by = excluded.recorded_by, gain = excluded.gain`)
      .run(c.audio.id, c.id, c.audio.media, c.audio.recorded_by || null, Number(c.audio.gain) || 1);
  }
  return true;
}

function ecrirePaquet(db, d) {
  if (!d || !ID.test(d.id)) throw new ErreurClient("paquet invalide");
  db.prepare(`INSERT INTO deck (id, name, photo, daily_cap, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, photo = excluded.photo, daily_cap = excluded.daily_cap,
      updated_at = excluded.updated_at WHERE excluded.updated_at >= deck.updated_at`)
    .run(d.id, String(d.name || d.id), d.photo || null, Math.max(1, Math.min(30, Number(d.daily_cap) || 10)), d.updated_at || 0);
}

function ecrireEntree(db, e) {
  if (!e || !ID.test(e.deck_id) || !ID.test(e.card_id)) throw new ErreurClient("entrée invalide");
  db.prepare(`INSERT INTO deck_card (deck_id, card_id, box, due_at, streak, fail_count, reviews, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (deck_id, card_id) DO UPDATE SET box = excluded.box, due_at = excluded.due_at, streak = excluded.streak,
      fail_count = excluded.fail_count, reviews = excluded.reviews, last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at WHERE excluded.updated_at >= deck_card.updated_at`)
    .run(e.deck_id, e.card_id, Math.max(1, Math.min(5, e.box | 0)), e.due_at || 0, e.streak || 0,
      e.fail_count || 0, e.reviews || 0, e.last_seen_at || null, e.updated_at || 0);
}

function ecrireSession(db, s) {
  if (!s || !ID.test(s.id) || !ID.test(s.deck_id)) throw new ErreurClient("séance invalide");
  db.prepare(`INSERT INTO session (id, deck_id, mode, filter, started_at, ended_at, ended_by) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET ended_at = excluded.ended_at, ended_by = excluded.ended_by`)
    .run(s.id, s.deck_id, String(s.mode), s.filter || null, s.started_at || 0, s.ended_at || null, s.ended_by || null);
}

function ecrireRevue(db, r) {
  if (!r || !ID.test(r.id) || !ID.test(r.card_id) || !ID.test(r.deck_id)) throw new ErreurClient("révision invalide");
  db.prepare(`INSERT OR IGNORE INTO review (id, session_id, deck_id, card_id, grade, mode, distractor_card_id, touches, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(r.id, String(r.session_id), r.deck_id, r.card_id, String(r.grade), String(r.mode),
      r.distractor_card_id || null, r.touches == null ? null : r.touches, r.at || 0);
}

// Un lot = tout ce que l'appareil a modifié depuis sa dernière synchro.
// L'ordre compte : cartes et paquets avant les lignes qui les référencent.
function appliquerLot(db, lot) {
  return transaction(db, () => {
    for (const d of lot.decks || []) ecrirePaquet(db, d);
    for (const c of lot.cards || []) ecrireCarte(db, c);
    for (const e of lot.deck_cards || []) ecrireEntree(db, e);
    for (const s of lot.sessions || []) ecrireSession(db, s);
    for (const r of lot.reviews || []) ecrireRevue(db, r);
    return { ok: true };
  });
}

// ---------- Lectures ----------

function lireEtat(db) {
  const images = {}, audios = {};
  for (const im of db.prepare('SELECT * FROM image ORDER BY "order"').all())
    (images[im.card_id] = images[im.card_id] || []).push({ id: im.id, media: im.media, emoji: im.emoji, is_primary: !!im.is_primary, order: im.order });
  for (const a of db.prepare("SELECT * FROM audio").all())
    audios[a.card_id] = { id: a.id, media: a.media, recorded_by: a.recorded_by, gain: a.gain };
  const cards = db.prepare("SELECT * FROM card").all().map((c) => Object.assign({}, c, {
    extras: JSON.parse(c.extras || "{}"), suspended: !!c.suspended,
    images: images[c.id] || [], audio: audios[c.id] || null,
  }));
  return {
    cards,
    decks: db.prepare("SELECT * FROM deck").all().map((d) => Object.assign({}, d)),
    deck_cards: db.prepare("SELECT * FROM deck_card").all().map((e) => Object.assign({}, e)),
    sessions: db.prepare("SELECT * FROM session").all().map((s) => Object.assign({}, s)),
    reviews: db.prepare("SELECT * FROM review").all().map((r) => Object.assign({}, r)),
  };
}

// Agrégats du tableau de bord, par paquet. La tablette sait les calculer
// elle-même hors ligne ; cet appel sert aux outils extérieurs.
function lireTableau(db, maintenant) {
  const semaine = maintenant - 7 * 86400000;
  return db.prepare("SELECT id, name FROM deck ORDER BY id").all().map((d) => ({
    deck_id: d.id, name: d.name,
    boxes: Object.fromEntries(db.prepare(`SELECT dc.box, COUNT(*) n FROM deck_card dc JOIN card c ON c.id = dc.card_id
      WHERE dc.deck_id = ? AND c.suspended = 0 GROUP BY dc.box`).all(d.id).map((r) => [r.box, r.n])),
    never_shown: db.prepare("SELECT COUNT(*) n FROM deck_card WHERE deck_id = ? AND reviews = 0").get(d.id).n,
    learned_this_week: db.prepare(`SELECT COUNT(DISTINCT card_id) n FROM review WHERE deck_id = ? AND grade = 'knew' AND at >= ?`).get(d.id, semaine).n,
    failing: db.prepare("SELECT card_id FROM deck_card WHERE deck_id = ? AND fail_count >= 3").all(d.id).map((r) => r.card_id),
  }));
}

function semerSiVide(db) {
  if (db.prepare("SELECT COUNT(*) n FROM card").get().n > 0) return;
  const cartes = Graines.cartesDeDepart(), paquets = Graines.paquetsDeDepart();
  transaction(db, () => {
    for (const d of paquets) ecrirePaquet(db, d);
    for (const c of cartes) {
      ecrireCarte(db, c);
      for (const d of paquets)
        ecrireEntree(db, { deck_id: d.id, card_id: c.id, box: 1, due_at: 0, streak: 0, fail_count: 0, reviews: 0, last_seen_at: null, updated_at: 0 });
    }
  });
}

// ---------- HTTP ----------

class ErreurClient extends Error {}

function lireCorps(req, max) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    let taille = 0;
    req.on("data", (m) => {
      taille += m.length;
      if (taille > max) { reject(new ErreurClient("corps trop gros")); req.destroy(); return; }
      morceaux.push(m);
    });
    req.on("end", () => resolve(Buffer.concat(morceaux)));
    req.on("error", reject);
  });
}

function json(res, statut, objet) {
  const corps = JSON.stringify(objet);
  res.writeHead(statut, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(corps);
}

function egalConstant(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function servirFichier(req, res, chemin) {
  let rel = decodeURIComponent(chemin).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const normal = path.posix.normalize(rel);
  if (normal.startsWith("..") || !PUBLICS.some((p) => normal === p || (p.endsWith("/") && normal.startsWith(p)))) {
    res.writeHead(404); res.end(); return;
  }
  const absolu = path.join(RACINE, normal);
  fs.stat(absolu, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(absolu)] || "application/octet-stream",
      // Le service worker garde la copie hors ligne ; le réseau doit toujours
      // donner la dernière version pour qu'une mise à jour se propage.
      "Cache-Control": "no-cache",
      "Content-Length": st.size,
    });
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(absolu).pipe(res);
  });
}

function creerServeur(options) {
  const o = Object.assign({ dossier: path.join(RACINE, "data"), secrets: [] }, options);
  const db = ouvrirBase(o.dossier);
  semerSiVide(db);
  const dossierMedia = path.join(o.dossier, "media");

  async function api(req, res, chemin) {
    if (o.secrets.length) {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!m || !o.secrets.some((s) => egalConstant(s, m[1]))) return json(res, 401, { erreur: "secret refusé" });
    }
    if (req.method === "GET" && chemin === "/api/etat") return json(res, 200, lireEtat(db));
    if (req.method === "GET" && chemin === "/api/tableau") return json(res, 200, lireTableau(db, Date.now()));
    if (req.method === "POST" && chemin === "/api/lot") {
      const corps = await lireCorps(req, MAX_LOT);
      let lot;
      try { lot = JSON.parse(corps.toString("utf8")); } catch (_) { throw new ErreurClient("JSON invalide"); }
      return json(res, 200, appliquerLot(db, lot));
    }
    const m = /^\/api\/media\/([^/]+)$/.exec(chemin);
    if (m && ID.test(m[1])) {
      const fichier = path.join(dossierMedia, m[1]);
      if (req.method === "PUT") {
        const type = String(req.headers["content-type"] || "").split(";")[0].trim();
        if (!TYPES_MEDIA.test(type)) throw new ErreurClient("type de média refusé : " + type);
        const corps = await lireCorps(req, MAX_MEDIA);
        fs.writeFileSync(fichier, corps);
        db.prepare(`INSERT INTO media (id, type, size, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET type = excluded.type, size = excluded.size`).run(m[1], type, corps.length, Date.now());
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET") {
        const info = db.prepare("SELECT type, size FROM media WHERE id = ?").get(m[1]);
        if (!info || !fs.existsSync(fichier)) return json(res, 404, { erreur: "média inconnu" });
        res.writeHead(200, { "Content-Type": info.type, "Content-Length": info.size, "Cache-Control": "private, max-age=31536000, immutable" });
        fs.createReadStream(fichier).pipe(res);
        return;
      }
    }
    json(res, 404, { erreur: "inconnu" });
  }

  const serveur = http.createServer((req, res) => {
    const chemin = new URL(req.url, "http://x").pathname;
    if (chemin.startsWith("/api/")) {
      api(req, res, chemin).catch((e) => {
        if (e instanceof ErreurClient) json(res, 400, { erreur: e.message });
        else { console.error(e); json(res, 500, { erreur: "erreur serveur" }); }
      });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    servirFichier(req, res, chemin);
  });
  serveur.on("close", () => db.close());
  return serveur;
}

module.exports = { creerServeur, appliquerLot, lireEtat, ouvrirBase };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const secrets = String(process.env.SECRETS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const dossier = process.env.DATA_DIR || path.join(RACINE, "data");
  if (!secrets.length) console.warn("SECRETS vide : l'API est ouverte à quiconque atteint ce port.");
  creerServeur({ dossier, secrets }).listen(port, () => console.log("Écoute sur http://localhost:" + port + " — données dans " + dossier));
}
