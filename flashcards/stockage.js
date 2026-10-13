// ==========================================================================
// STOCKAGE. Tout vit sur l'appareil, dans IndexedDB : cartes, paquets,
// boîtes, séances, révisions, et à part les médias (photos). Aucun
// serveur. Pour sauvegarder ou passer à un autre appareil : exporter un
// fichier unique, puis l'importer de l'autre côté.
// ==========================================================================
(function (racine) {
  "use strict";

  const BASE = "flashcards";
  const SORTES = ["cards", "decks", "deck_cards", "sessions", "reviews"];
  const FORMAT = "flashcards-sauvegarde";
  const VERSION_FORMAT = 1;

  let db = null;
  let etat = null;
  const urls = new Map(); // id média → URL objet, pour l'affichage
  const memoire = new Map(); // repli si IndexedDB est indisponible

  function nouvelId() {
    const o = new Uint8Array(16);
    // getRandomValues plutôt que randomUUID : ce dernier exige un contexte
    // sécurisé, et la page peut être ouverte en http ou depuis un fichier.
    racine.crypto.getRandomValues(o);
    return [...o].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function cleEntree(deckId, cardId) { return deckId + "|" + cardId; }

  function etatVide() {
    const e = {};
    for (const s of SORTES) e[s] = {};
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

  function semer() {
    for (const d of Graines.paquetsDeDepart()) etat.decks[d.id] = d;
    for (const c of Graines.cartesDeDepart()) {
      etat.cards[c.id] = c;
      for (const d of Object.keys(etat.decks))
        etat.deck_cards[cleEntree(d, c.id)] = Planificateur.nouvelleEntree(d, c.id, 0);
    }
  }

  // Les anciennes versions enregistraient la voix du parent sur chaque carte :
  // il n'y a plus de son. On retire ces enregistrements de l'appareil ; le
  // résultat dit si l'état a changé et quels médias ont été supprimés.
  async function retirerAnciensSons() {
    const medias = new Set();
    let modifie = false;
    for (const c of Object.values(etat.cards)) {
      if (!("audio" in c)) continue;
      if (c.audio && c.audio.media) { medias.add(c.audio.media); await supprimerMedia(c.audio.media); }
      delete c.audio;
      modifie = true;
    }
    return { modifie, medias };
  }

  async function charger() {
    db = await ouvrirBase();
    etat = db ? await requete(magasin("etat", "readonly").get("etat")).catch(() => null) : null;
    if (!etat) {
      etat = etatVide();
      semer();
      await sauver();
    } else if ((await retirerAnciensSons()).modifie) {
      await sauver();
    }
    // Demander au navigateur de ne pas effacer ces données pour faire de la
    // place : c'est le seul exemplaire, en dehors des sauvegardes.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
    return etat;
  }

  // ---------- Écritures ----------

  function enregistrerCarte(carte, deckIds) {
    const maintenant = Date.now();
    carte.updated_at = maintenant;
    if (!carte.created_at) carte.created_at = maintenant;
    etat.cards[carte.id] = carte;
    for (const d of deckIds || []) {
      const k = cleEntree(d, carte.id);
      if (!etat.deck_cards[k]) etat.deck_cards[k] = Planificateur.nouvelleEntree(d, carte.id, maintenant);
    }
    sauver();
    return carte;
  }

  function enregistrerPaquet(paquet) {
    paquet.updated_at = Date.now();
    etat.decks[paquet.id] = paquet;
    sauver();
  }

  function enregistrerEntree(entree) {
    etat.deck_cards[cleEntree(entree.deck_id, entree.card_id)] = entree;
    sauver();
  }

  function enregistrerSession(session) {
    etat.sessions[session.id] = session;
    sauver();
  }

  function ajouterRevue(revue) {
    etat.reviews[revue.id] = revue;
    sauver();
  }

  function entrees(deckId) {
    return Object.values(etat.deck_cards).filter((e) => e.deck_id === deckId);
  }

  function entree(deckId, cardId) { return etat.deck_cards[cleEntree(deckId, cardId)] || null; }

  // ---------- Médias (photos) ----------

  async function mettreMedia(id, blob) {
    if (db) await requete(magasin("media", "readwrite").put(blob, id));
    else memoire.set(id, blob);
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }

  async function ajouterMedia(blob) {
    const id = nouvelId();
    await mettreMedia(id, blob);
    return id;
  }

  async function supprimerMedia(id) {
    if (db) await requete(magasin("media", "readwrite").delete(id)).catch(() => {});
    else memoire.delete(id);
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }

  async function lireMedia(id) {
    if (!id) return null;
    if (!db) return memoire.get(id) || null;
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

  function mediasReferences(e) {
    const ids = new Set();
    for (const c of Object.values(e.cards)) {
      for (const im of c.images || []) if (im.media) ids.add(im.media);
    }
    for (const d of Object.values(e.decks)) if (d.photo) ids.add(d.photo);
    return ids;
  }

  // ---------- Sauvegarde : exporter, importer ----------

  function enDataUrl(blob) {
    return new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => ko(r.error);
      r.readAsDataURL(blob);
    });
  }

  // Un seul fichier JSON : l'état complet, et chaque photo encodée
  // en data URL. Lisible, sans dépendance, réimportable tel quel.
  async function exporter() {
    const medias = {};
    for (const id of mediasReferences(etat)) {
      const blob = await lireMedia(id);
      if (blob) medias[id] = await enDataUrl(blob);
    }
    const contenu = { format: FORMAT, version: VERSION_FORMAT, exporte_le: Date.now(), etat, medias };
    return new Blob([JSON.stringify(contenu)], { type: "application/json" });
  }

  function lireSauvegarde(texte) {
    let s;
    try { s = JSON.parse(texte); } catch (_) { throw new Error("Ce fichier n'est pas une sauvegarde lisible."); }
    if (!s || s.format !== FORMAT) throw new Error("Ce fichier n'est pas une sauvegarde des flashcards.");
    if (s.version > VERSION_FORMAT) throw new Error("Sauvegarde faite par une version plus récente de l'application.");
    for (const sorte of SORTES)
      if (!s.etat || typeof s.etat[sorte] !== "object" || s.etat[sorte] === null) throw new Error("Sauvegarde incomplète (" + sorte + ").");
    return s;
  }

  // Remplace tout ce qui est sur cet appareil par le contenu de la sauvegarde.
  async function importer(fichier) {
    const s = lireSauvegarde(await fichier.text());
    const blobs = {};
    for (const [id, dataUrl] of Object.entries(s.medias || {})) blobs[id] = await (await fetch(dataUrl)).blob();
    if (db) {
      await requete(magasin("media", "readwrite").clear());
      for (const [id, blob] of Object.entries(blobs)) await requete(magasin("media", "readwrite").put(blob, id));
    } else {
      memoire.clear();
      for (const [id, blob] of Object.entries(blobs)) memoire.set(id, blob);
    }
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    etat = etatVide();
    for (const sorte of SORTES) Object.assign(etat[sorte], s.etat[sorte]);
    const { medias: sons } = await retirerAnciensSons();
    await sauver();
    return {
      cartes: Object.keys(etat.cards).length,
      revues: Object.keys(etat.reviews).length,
      medias: Object.keys(blobs).filter((id) => !sons.has(id)).length,
      exporte_le: s.exporte_le,
    };
  }

  racine.Stockage = {
    charger, nouvelId, cleEntree,
    get etat() { return etat; },
    enregistrerCarte, enregistrerPaquet, enregistrerEntree, enregistrerSession, ajouterRevue,
    entrees, entree, ajouterMedia, lireMedia, urlMedia, urlMediaConnue, mettreMedia,
    exporter, importer,
  };
})(typeof self !== "undefined" ? self : this);
