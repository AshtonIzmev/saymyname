// ==========================================================================
// STOCKAGE. Tout l'état vit sur l'appareil (IndexedDB) : une séance n'attend
// jamais le réseau. Ce qui change est noté « à envoyer » et part vers le
// serveur dès qu'il répond ; ce que le serveur sait de plus récent revient.
// Sans serveur (fichier ouvert en local, hébergement statique), l'application
// fonctionne seule sur l'appareil.
// ==========================================================================
(function (racine) {
  "use strict";

  const BASE = "flashcards";
  const SORTES = ["cards", "decks", "deck_cards", "sessions", "reviews"];
  const CLE_SECRET = "flashcards.secret";

  let db = null;
  let etat = null;
  let compteur = 0;
  const urls = new Map(); // id média → URL objet, pour l'affichage
  let synchro = null;
  let ecouteurs = [];
  let statut = { etat: "local", message: "Pas encore synchronisé", derniere: null };

  function nouvelId() {
    const o = new Uint8Array(16);
    // getRandomValues plutôt que randomUUID : ce dernier exige un contexte
    // sécurisé, et la tablette peut joindre le serveur en http sur le réseau local.
    racine.crypto.getRandomValues(o);
    return [...o].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function cleEntree(deckId, cardId) { return deckId + "|" + cardId; }

  function etatVide() {
    const e = { aEnvoyer: { media: {} } };
    for (const s of SORTES) { e[s] = {}; e.aEnvoyer[s] = {}; }
    return e;
  }

  // ---------- IndexedDB, avec repli en mémoire ----------

  function requete(r) {
    return new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  }

  async function ouvrirBase() {
    if (!racine.indexedDB) return null;
    try {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("etat");
        r.result.createObjectStore("media");
      };
      return await requete(r);
    } catch (_) { return null; }
  }

  function magasin(nom, mode) { return db.transaction(nom, mode).objectStore(nom); }

  let ecriture = Promise.resolve();
  function sauver() {
    if (!db) return Promise.resolve();
    // Les écritures s'enchaînent : la dernière gagne toujours.
    ecriture = ecriture.then(() => requete(magasin("etat", "readwrite").put(etat, "etat"))).catch(() => {});
    return ecriture;
  }

  function marquer(sorte, id) {
    etat.aEnvoyer[sorte][id] = ++compteur;
  }

  function semer() {
    for (const d of Graines.paquetsDeDepart()) etat.decks[d.id] = d;
    for (const c of Graines.cartesDeDepart()) {
      etat.cards[c.id] = c;
      for (const d of Object.keys(etat.decks))
        etat.deck_cards[cleEntree(d, c.id)] = Planificateur.nouvelleEntree(d, c.id, 0);
    }
  }

  async function charger() {
    db = await ouvrirBase();
    etat = db ? await requete(magasin("etat", "readonly").get("etat")).catch(() => null) : null;
    if (!etat) {
      etat = etatVide();
      semer();
      await sauver();
    }
    for (const s of SORTES.concat("media")) etat.aEnvoyer[s] = etat.aEnvoyer[s] || {};
    compteur = Math.max(0, ...SORTES.concat("media").flatMap((s) => Object.values(etat.aEnvoyer[s])));
    return etat;
  }

  // ---------- Écritures locales ----------

  function enregistrerCarte(carte, deckIds) {
    const maintenant = Date.now();
    carte.updated_at = maintenant;
    if (!carte.created_at) carte.created_at = maintenant;
    etat.cards[carte.id] = carte;
    marquer("cards", carte.id);
    for (const d of deckIds || []) {
      const k = cleEntree(d, carte.id);
      if (etat.deck_cards[k]) continue;
      etat.deck_cards[k] = Planificateur.nouvelleEntree(d, carte.id, maintenant);
      marquer("deck_cards", k);
    }
    sauver();
    return carte;
  }

  function enregistrerPaquet(paquet) {
    paquet.updated_at = Date.now();
    etat.decks[paquet.id] = paquet;
    marquer("decks", paquet.id);
    sauver();
  }

  function enregistrerEntree(entree) {
    const k = cleEntree(entree.deck_id, entree.card_id);
    etat.deck_cards[k] = entree;
    marquer("deck_cards", k);
    sauver();
  }

  function enregistrerSession(session) {
    etat.sessions[session.id] = session;
    marquer("sessions", session.id);
    sauver();
  }

  function ajouterRevue(revue) {
    etat.reviews[revue.id] = revue;
    marquer("reviews", revue.id);
    sauver();
  }

  function entrees(deckId) {
    return Object.values(etat.deck_cards).filter((e) => e.deck_id === deckId);
  }

  function entree(deckId, cardId) { return etat.deck_cards[cleEntree(deckId, cardId)] || null; }

  // ---------- Médias (photos, voix) ----------

  async function mettreMedia(id, blob) {
    if (db) await requete(magasin("media", "readwrite").put(blob, id));
    else urls.set(id + ":blob", blob);
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }

  async function ajouterMedia(blob) {
    const id = nouvelId();
    await mettreMedia(id, blob);
    etat.aEnvoyer.media[id] = ++compteur;
    sauver();
    return id;
  }

  async function lireMedia(id) {
    if (!id) return null;
    if (!db) return urls.get(id + ":blob") || null;
    return (await requete(magasin("media", "readonly").get(id)).catch(() => null)) || null;
  }

  async function urlMedia(id) {
    if (!id) return null;
    if (urls.has(id)) return urls.get(id);
    const blob = await lireMedia(id);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    urls.set(id, u);
    return u;
  }

  // Les URL déjà résolues, pour un rendu synchrone sur l'écran de l'enfant.
  function urlMediaConnue(id) { return urls.get(id) || null; }

  function mediasReferences() {
    const ids = new Set();
    for (const c of Object.values(etat.cards)) {
      for (const im of c.images || []) if (im.media) ids.add(im.media);
      if (c.audio && c.audio.media) ids.add(c.audio.media);
    }
    for (const d of Object.values(etat.decks)) if (d.photo) ids.add(d.photo);
    return ids;
  }

  // ---------- Synchronisation ----------

  function secret() { try { return localStorage.getItem(CLE_SECRET) || ""; } catch (_) { return ""; } }
  function definirSecret(s) { try { localStorage.setItem(CLE_SECRET, s); } catch (_) {} }

  function urlApi(chemin) { return new URL("../api/" + chemin, racine.location.href).toString(); }

  async function appel(methode, chemin, corps, type) {
    const entetes = {};
    if (secret()) entetes.Authorization = "Bearer " + secret();
    if (corps != null) entetes["Content-Type"] = type || "application/json";
    const r = await fetch(urlApi(chemin), {
      method: methode, headers: entetes, cache: "no-store",
      body: corps == null ? undefined : (type ? corps : JSON.stringify(corps)),
    });
    if (r.status === 401) throw Object.assign(new Error("Secret refusé par le serveur"), { code: 401 });
    if (!r.ok) throw new Error("Serveur : " + r.status);
    return r;
  }

  function changerStatut(s) {
    statut = Object.assign({}, statut, s);
    for (const f of ecouteurs) try { f(statut); } catch (_) {}
  }

  function fusionner(distant) {
    let change = false;
    const garderPlusRecent = (sorte, cle, objet) => {
      const local = etat[sorte][cle];
      if (!local || (objet.updated_at || 0) > (local.updated_at || 0)) { etat[sorte][cle] = objet; change = true; }
    };
    for (const c of distant.cards || []) garderPlusRecent("cards", c.id, c);
    for (const d of distant.decks || []) garderPlusRecent("decks", d.id, d);
    for (const e of distant.deck_cards || []) garderPlusRecent("deck_cards", cleEntree(e.deck_id, e.card_id), e);
    for (const s of distant.sessions || []) {
      const local = etat.sessions[s.id];
      if (!local || (!local.ended_at && s.ended_at)) { etat.sessions[s.id] = s; change = true; }
    }
    for (const r of distant.reviews || []) if (!etat.reviews[r.id]) { etat.reviews[r.id] = r; change = true; }
    return change;
  }

  async function synchroniserUneFois() {
    if (racine.location.protocol === "file:") {
      changerStatut({ etat: "local", message: "Ouvert en fichier local : pas de serveur" });
      return false;
    }
    changerStatut({ etat: "encours", message: "Synchronisation…" });
    try {
      // 1. Les médias d'abord : une carte ne doit jamais pointer vers un
      //    fichier que le serveur n'a pas.
      for (const [id, version] of Object.entries(etat.aEnvoyer.media)) {
        const blob = await lireMedia(id);
        if (blob) await appel("PUT", "media/" + id, blob, blob.type || "application/octet-stream");
        if (etat.aEnvoyer.media[id] === version) delete etat.aEnvoyer.media[id];
      }
      // 2. Un lot avec la version courante de tout ce qui a changé.
      const envoyes = {};
      const lot = {};
      for (const s of SORTES) {
        envoyes[s] = Object.assign({}, etat.aEnvoyer[s]);
        lot[s] = Object.keys(envoyes[s]).map((k) => etat[s][k]).filter(Boolean);
      }
      if (SORTES.some((s) => lot[s].length)) await appel("POST", "lot", lot);
      for (const s of SORTES)
        for (const [k, v] of Object.entries(envoyes[s])) if (etat.aEnvoyer[s][k] === v) delete etat.aEnvoyer[s][k];
      // 3. Ce que les autres appareils ont fait.
      const distant = await (await appel("GET", "etat")).json();
      fusionner(distant);
      await sauver();
      // 4. Les médias qui manquent ici (photo prise au téléphone, par exemple).
      for (const id of mediasReferences()) {
        if (await lireMedia(id)) continue;
        try {
          const r = await appel("GET", "media/" + id);
          await mettreMedia(id, await r.blob());
        } catch (_) { /* on réessaiera à la prochaine synchro */ }
      }
      changerStatut({ etat: "ok", message: "Synchronisé", derniere: Date.now() });
      return true;
    } catch (e) {
      await sauver();
      changerStatut({ etat: e.code === 401 ? "refuse" : "horsligne", message: e.code === 401 ? e.message : "Hors ligne — les changements partiront plus tard" });
      return false;
    }
  }

  function synchroniser() {
    if (!synchro) synchro = synchroniserUneFois().finally(() => { synchro = null; });
    return synchro;
  }

  function enAttente() {
    return SORTES.concat("media").reduce((n, s) => n + Object.keys(etat.aEnvoyer[s]).length, 0);
  }

  racine.Stockage = {
    charger, nouvelId, cleEntree,
    get etat() { return etat; },
    get statut() { return statut; },
    surStatut(f) { ecouteurs.push(f); },
    enregistrerCarte, enregistrerPaquet, enregistrerEntree, enregistrerSession, ajouterRevue,
    entrees, entree, ajouterMedia, lireMedia, urlMedia, urlMediaConnue, mettreMedia,
    synchroniser, enAttente, secret, definirSecret, fusionner,
  };
})(typeof self !== "undefined" ? self : this);
