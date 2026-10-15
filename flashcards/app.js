// ==========================================================================
// INTERFACE. Départ (choisir l'enfant, le mode), écran de l'enfant (montrer,
// choisir), écran « fini », et côté parent (ajouter, cartes, tableau,
// réglages). L'état vit dans Stockage, sur l'appareil ; la planification dans
// Planificateur. Pas de serveur : on passe d'un appareil à l'autre par une
// sauvegarde exportée puis importée.
// ==========================================================================
(function () {
  "use strict";

  const P = Planificateur;
  const S = Stockage;

  const CONFIG = {
    verrouFini: 30000,     // « fini » verrouille l'écran 30 s
    appuiLong: 900,        // appui long = fin de séance
    seuilGlisser: 60,      // px pour qu'un geste soit un glissement
    attenteErreur: 1000,   // mode choix : silence après une erreur
    rappelSauvegarde: 14,  // jours sans sauvegarde avant un rappel au départ
  };
  const CHIFFRES = ["zéro", "un", "deux", "trois", "quatre", "cinq"];
  const NOMS_NOTES = { knew: "su", hesitant: "hésitant", didnt_know: "pas su" };
  const NOMS_TYPES = { word: "Mot", number: "Chiffre", letter: "Lettre" };
  const NOMS_MODES = { show: "montrer", choice: "choisir" };

  const $ = (id) => document.getElementById(id);

  function h(balise, attributs, ...enfants) {
    const el = document.createElement(balise);
    for (const [k, v] of Object.entries(attributs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const e of enfants.flat()) if (e != null && e !== false) el.append(e instanceof Node ? e : String(e));
    return el;
  }

  function options(select, paires, valeur) {
    select.textContent = "";
    for (const [v, t] of paires) select.append(h("option", { value: v }, t));
    if (valeur != null) select.value = valeur;
  }

  function paquets() { return Object.values(S.etat.decks).sort((a, b) => (a.id < b.id ? -1 : 1)); }
  function carte(id) { return S.etat.cards[id]; }

  function afficherVue(id) {
    for (const v of document.querySelectorAll(".vue")) v.hidden = v.id !== id;
  }

  // ======================================================================
  // IMAGES
  // ======================================================================

  // Une image de carte : un emoji (graine) ou un média (photo, dessin).
  function noeudImage(image) {
    if (!image) return h("span", { class: "glyphe" }, "·");
    if (image.emoji) return h("span", { class: "glyphe" }, image.emoji);
    const img = h("img", { alt: "", draggable: "false" });
    const connue = S.urlMediaConnue(image.media);
    if (connue) img.src = connue;
    else S.urlMedia(image.media).then((u) => { if (u) img.src = u; });
    return img;
  }

  function vignette(c) {
    const im = P.choisirImage(c, null);
    if (c.type === "letter") return h("div", { class: "vignette" }, h("span", { class: "lettre-vignette" }, c.extras.letter));
    if (c.type === "number") return h("div", { class: "vignette" }, h("span", { class: "lettre-vignette" }, String(c.extras.digit)));
    return h("div", { class: "vignette" }, noeudImage(im));
  }

  // Recadrage automatique au carré, 1024 px, WebP.
  async function recadrerCarre(fichier, cote) {
    cote = cote || 1024;
    let source;
    try { source = await createImageBitmap(fichier, { imageOrientation: "from-image" }); }
    catch (_) { source = await createImageBitmap(fichier); }
    const s = Math.min(source.width, source.height);
    const c = Math.min(cote, s);
    const toile = document.createElement("canvas");
    toile.width = c; toile.height = c;
    const ctx = toile.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c, c);
    ctx.drawImage(source, (source.width - s) / 2, (source.height - s) / 2, s, s, 0, 0, c, c);
    const enBlob = (type) => new Promise((ok) => toile.toBlob(ok, type, 0.85));
    let blob = await enBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await enBlob("image/jpeg");
    return blob;
  }

  // ======================================================================
  // DÉPART ET MODE
  // ======================================================================

  let paquetChoisi = null;
  let filtreChoisi = "tout";

  function portrait(paquet) {
    const p = h("span", { class: "portrait" });
    if (paquet.photo) {
      const img = h("img", { alt: "" });
      S.urlMedia(paquet.photo).then((u) => { if (u) img.src = u; });
      p.append(img);
    } else p.append((paquet.name || "?").trim().charAt(0).toUpperCase());
    return p;
  }

  function rendreDepart() {
    const zone = $("jumeaux");
    zone.textContent = "";
    for (const d of paquets())
      zone.append(h("button", { type: "button", class: "jumeau", "data-deck": d.id, onclick: () => choisirPaquet(d.id) },
        portrait(d), d.name));
    afficherRappelSauvegarde();
  }

  function revuesListe() { return Object.values(S.etat.reviews); }

  // Les filtres Lettres et Chiffres n'apparaissent que si le paquet a des
  // cartes actives de ce type : tant que les lettres sont en réserve, le
  // parent ne voit qu'un seul bouton de moins, pas un bouton qui ne fait rien.
  function rendreFiltres(deckId) {
    const maintenant = Date.now();
    const actives = (type) => S.entrees(deckId).some((e) => {
      const c = carte(e.card_id);
      return c && c.type === type && !P.estSuspendue(c, maintenant);
    });
    const visibles = { tout: true, lettres: actives("letter"), nombres: actives("number") };
    if (!visibles[filtreChoisi]) filtreChoisi = "tout";
    for (const b of $("filtre").querySelectorAll("button")) b.hidden = !visibles[b.dataset.filtre];
    $("filtre").hidden = !visibles.lettres && !visibles.nombres;
  }

  function choisirPaquet(id) {
    paquetChoisi = id;
    $("mode-titre").textContent = S.etat.decks[id].name;
    rendreFiltres(id);
    rendreInfoMode();
    afficherVue("vue-mode");
  }

  function rendreInfoMode() {
    const d = S.etat.decks[paquetChoisi];
    const restant = P.restantAujourdhui(revuesListe(), d.id, d.daily_cap, Date.now());
    const file = P.choisirSession(S.etat.cards, S.entrees(d.id), { cap: restant, filtre: filtreChoisi });
    const enChoix = P.choisirSession(S.etat.cards, S.entrees(d.id), { cap: restant, filtre: filtreChoisi, mode: "choice" });
    $("mode-info").textContent = restant === 0
      ? "Plafond du jour atteint (" + d.daily_cap + " cartes)."
      : file.length === 0
        ? "Rien à montrer aujourd'hui : tout est vu, suspendu ou au repos."
        : file.length + " carte" + (file.length > 1 ? "s" : "") + " pour cette séance.";
    // Choisir ne demande que ce qui a déjà été donné en montrer : tant qu'il
    // n'y a rien de tel, la tuile le dit et ne fait rien.
    const choisir = $("mode-choisir");
    const rienAChoisir = restant > 0 && enChoix.length === 0;
    choisir.disabled = rienAChoisir;
    choisir.querySelector(".tuile-sous").textContent = rienAChoisir ? "d'abord Montrer" : "« où est… ? »";
    for (const b of $("filtre").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.filtre === filtreChoisi));
  }

  // ======================================================================
  // SÉANCE
  // ======================================================================

  let seance = null;
  let verrou = null;
  let reveil = null;

  async function demarrer(mode) {
    const d = S.etat.decks[paquetChoisi];
    const maintenant = Date.now();
    const restant = P.restantAujourdhui(revuesListe(), d.id, d.daily_cap, maintenant);
    const file = P.choisirSession(S.etat.cards, S.entrees(d.id), { cap: restant, filtre: filtreChoisi, mode, maintenant });
    // Rien à montrer : on le dit et on reste là. Pas de « fini » verrouillé
    // trente secondes pour un appui de trop sur une tuile.
    if (file.length === 0) { rendreInfoMode(); return; }
    // En mode choisir, le distracteur de chaque carte est tiré dès maintenant,
    // pour que ses images soient résolues avec les autres : sinon la seconde
    // image arrivait en retard sur une tablette lente, ou pas du tout.
    const distracteurs = file.map((c) => mode === "choice" ? P.choisirDistracteur(c, S.etat.cards, S.entrees(d.id)) : null);
    seance = {
      id: S.nouvelId(), deck: d.id, mode, filtre: filtreChoisi, file, distracteurs, i: 0,
      enregistrement: { id: null, deck_id: d.id, mode, filter: filtreChoisi, started_at: maintenant, ended_at: null, ended_by: null },
      essai: null,
    };
    seance.enregistrement.id = seance.id;
    S.enregistrerSession(seance.enregistrement);
    // Les images sont résolues avant la première carte : l'écran de l'enfant
    // ne montre jamais une image en train de charger.
    const medias = new Set();
    for (const c of file.concat(distracteurs)) for (const im of (c && c.images) || []) if (im.media) medias.add(im.media);
    await Promise.all([...medias].map((m) => S.urlMedia(m)));
    try { if (navigator.wakeLock) reveil = await navigator.wakeLock.request("screen"); } catch (_) {}
    afficherVue("vue-enfant");
    montrerCarte();
  }

  function carteCourante() { return seance && seance.file[seance.i]; }

  function visuel(c, entree, enChoix) {
    const image = P.choisirImage(c, entree);
    if (c.type === "number") {
      const n = c.extras.digit || 1;
      const objets = h("div", { class: "objets" });
      // Un emoji est répété N fois ; une photo montre déjà ses N objets.
      for (let i = 0; i < (image && image.emoji ? n : 1); i++) objets.append(noeudImage(image));
      return h("div", { class: "visuel visuel-nombre" }, enChoix ? null : h("span", { class: "chiffre" }, String(n)), objets);
    }
    if (c.type === "letter")
      return h("div", { class: "visuel visuel-lettre" }, h("span", { class: "lettre" }, c.extras.letter),
        enChoix ? null : h("div", { class: "compagnon" }, noeudImage(image)));
    return h("div", { class: "visuel visuel-mot" }, noeudImage(image));
  }

  function motSouligne(mot) {
    return h("span", null, h("span", { class: "initiale" }, mot.charAt(0)), mot.slice(1));
  }

  function etiquette(c) {
    if (c.type === "number") return h("div", { class: "etiquette" }, h("span", null, String(c.extras.digit)), h("span", null, c.label));
    if (c.type === "letter") return h("div", { class: "etiquette" }, h("span", null, c.extras.letter), motSouligne(c.label));
    return h("div", { class: "etiquette" }, motSouligne(c.label));
  }

  // ---------- Le souffleur ----------
  const CLE_SOUFFLEUR = "flashcards.souffleur";
  function souffleurActif() { try { return localStorage.getItem(CLE_SOUFFLEUR) !== "0"; } catch (_) { return true; } }
  function reglerSouffleur(actif) { try { localStorage.setItem(CLE_SOUFFLEUR, actif ? "1" : "0"); } catch (_) {} }

  // En mode choisir, le mot à demander s'affiche toujours : sans lui, le
  // parent ne sait pas laquelle des deux images est la cible. Le reste
  // (nouveau / revu, relance, note de la carte) suit le réglage.
  function rendreSouffleur(c, entree, enChoix) {
    const el = $("souffleur");
    el.textContent = "";
    const s = Souffleur.souffler(c, entree, enChoix ? "choice" : "show");
    const morceaux = [];
    if (enChoix) morceaux.push(h("b", null, s.cible));
    if (souffleurActif() || enChoix) morceaux.push(s.phase);
    if (souffleurActif()) {
      // En choisir, le mot et la consigne suffisent : la ligne reste courte.
      if (s.relance && !enChoix) morceaux.push(s.relance);
      if (s.note) morceaux.push(s.note);
    }
    morceaux.forEach((m, i) => { if (i) el.append(" · "); el.append(m); });
    el.hidden = morceaux.length === 0;
  }

  function montrerCarte() {
    const c = carteCourante();
    const scene = $("scene");
    const entree = S.entree(seance.deck, c.id);
    scene.textContent = "";
    seance.essai = { touchers: 0, trouve: false, auto: null, bloque: false, distracteur: null, cote: 0 };

    const distracteur = seance.distracteurs[seance.i] || null;
    rendreSouffleur(c, entree, !!distracteur);
    if (!distracteur) {
      // Mode montrer (ou pas de distracteur possible pour cette carte).
      scene.className = "scene montrer";
      scene.dataset.carte = c.id;
      scene.append(visuel(c, entree, false), etiquette(c));
      return;
    }
    seance.essai.distracteur = distracteur;
    seance.essai.cote = Math.random() < 0.5 ? 0 : 1;
    scene.className = "scene choisir";
    scene.dataset.carte = c.id;
    const deux = [c, distracteur];
    if (seance.essai.cote === 1) deux.reverse();
    deux.forEach((x, i) => {
      scene.append(h("div", { class: "option", "data-option": i, "data-carte": x.id },
        visuel(x, S.entree(seance.deck, x.id), true), h("div", { class: "etiquette" })));
    });
  }

  function toucherOption(i) {
    const e = seance && seance.essai;
    if (!e || !e.distracteur || e.bloque || e.trouve) return;
    e.touchers++;
    const c = carteCourante();
    const options = $("scene").querySelectorAll(".option");
    if (i === e.cote) {
      e.trouve = true;
      e.auto = P.noteChoix(e.touchers, true);
      options[1 - i].classList.add("estompee");
      options[i].querySelector(".etiquette").replaceWith(etiquette(c));
      return;
    }
    if (e.touchers >= 2) e.auto = "didnt_know";
    // Erreur : rien pendant une seconde, puis on peut réessayer.
    e.bloque = true;
    setTimeout(() => {
      if (seance && seance.essai === e) e.bloque = false;
    }, CONFIG.attenteErreur);
  }

  function noterEtAvancer(note) {
    if (!seance) return;
    const c = carteCourante();
    const e = seance.essai;
    const maintenant = Date.now();
    const avant = S.entree(seance.deck, c.id) || P.nouvelleEntree(seance.deck, c.id, maintenant);
    S.enregistrerEntree(P.noter(avant, note, maintenant, { mode: seance.mode }));
    S.ajouterRevue({
      id: S.nouvelId(), session_id: seance.id, deck_id: seance.deck, card_id: c.id, grade: note,
      mode: e && e.distracteur ? "choice" : "show",
      distractor_card_id: e && e.distracteur ? e.distracteur.id : null,
      touches: e && e.distracteur ? e.touchers : null, at: maintenant,
    });
    seance.i++;
    if (seance.i >= seance.file.length) {
      // « cap » : le plafond du jour est atteint ; « epuise » : il n'y avait
      // plus rien à montrer avant.
      const d = S.etat.decks[seance.deck];
      finir(P.restantAujourdhui(revuesListe(), d.id, d.daily_cap, Date.now()) === 0 ? "cap" : "epuise");
    }
    else montrerCarte();
  }

  // Glissement vers le bas, en mode choix : on garde la note automatique.
  function suivantAvecNoteAuto() {
    const e = seance && seance.essai;
    if (e && e.distracteur && e.auto) noterEtAvancer(e.auto);
  }

  function finir(par) {
    if (seance) {
      seance.enregistrement.ended_at = Date.now();
      seance.enregistrement.ended_by = par;
      if (seance.file.length) S.enregistrerSession(seance.enregistrement);
    }
    seance = null;
    if (reveil) { reveil.release().catch(() => {}); reveil = null; }
    afficherVue("vue-fini");
    // L'écran reste « fini » et ignore tout pendant 30 s.
    clearTimeout(verrou);
    verrou = setTimeout(() => {
      verrou = null;
      rendreDepart();
      afficherVue("vue-depart");
    }, CONFIG.verrouFini);
  }

  // ---------- Gestes du parent sur l'écran de l'enfant ----------
  // L'enfant touche à un doigt : un tap sur une image (mode choisir), et rien
  // d'autre. Le parent note à DEUX doigts. Un doigt qui traîne, une main posée
  // ou un index qui reste appuyé — les gestes les plus naturels d'un enfant
  // de deux ans — ne notent donc jamais rien et ne terminent jamais la séance.
  //   deux doigts → : su     ↑ : hésitant     ← : pas su
  //   deux doigts ↓ : suivant (mode choix, note automatique)
  //   deux doigts posés 0,9 s : fin de séance
  //   trois doigts ou plus (une paume) : rien
  function brancherGestes(zone) {
    const doigts = new Map(); // pointerId → point de départ
    let geste = null;         // { max, cible, bouge, longFait, deltas }
    let long = null;

    zone.addEventListener("pointerdown", (ev) => {
      // Un nouveau geste repart de zéro, même si un relâchement s'est perdu.
      if (ev.isPrimary) { doigts.clear(); geste = { max: 0, cible: ev.target, bouge: false, longFait: false, deltas: [] }; }
      if (!geste) return;
      doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      geste.max = Math.max(geste.max, doigts.size);
      clearTimeout(long);
      if (doigts.size === 2 && !geste.bouge) {
        long = setTimeout(() => {
          if (geste && !geste.bouge && doigts.size === 2 && seance) { geste.longFait = true; finir("parent"); }
        }, CONFIG.appuiLong);
      }
    });
    zone.addEventListener("pointermove", (ev) => {
      const d = doigts.get(ev.pointerId);
      if (!d || !geste) return;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 15) { geste.bouge = true; clearTimeout(long); }
    });
    const lever = (ev, annule) => {
      const d = doigts.get(ev.pointerId);
      if (!d || !geste) return;
      doigts.delete(ev.pointerId);
      geste.deltas.push([ev.clientX - d.x, ev.clientY - d.y]);
      if (doigts.size > 0) return;
      clearTimeout(long);
      const g = geste;
      geste = null;
      if (annule || g.longFait || !seance) return;
      if (g.max === 1) {
        // L'enfant : un tap sur une image, s'il n'a pas traîné en chemin.
        if (g.bouge) return;
        const option = g.cible.closest && g.cible.closest(".option");
        if (option) toucherOption(Number(option.dataset.option));
        return;
      }
      if (g.max !== 2) return;
      const dx = g.deltas.reduce((t, v) => t + v[0], 0) / g.deltas.length;
      const dy = g.deltas.reduce((t, v) => t + v[1], 0) / g.deltas.length;
      if (Math.hypot(dx, dy) < CONFIG.seuilGlisser) return;
      if (Math.abs(dx) > Math.abs(dy)) noterEtAvancer(dx > 0 ? "knew" : "didnt_know");
      else if (dy < 0) noterEtAvancer("hesitant");
      else suivantAvecNoteAuto();
    };
    zone.addEventListener("pointerup", (ev) => lever(ev, false));
    zone.addEventListener("pointercancel", (ev) => lever(ev, true));
    zone.addEventListener("contextmenu", (ev) => ev.preventDefault());
  }

  // Le verrou de « fini » : rien ne passe.
  for (const t of ["pointerdown", "pointerup", "click", "contextmenu"])
    $("vue-fini").addEventListener(t, (ev) => { ev.preventDefault(); ev.stopPropagation(); });

  // ======================================================================
  // PARENT : AJOUTER UNE CARTE
  // ======================================================================

  const ajout = { type: "word", blob: null, emoji: "" };

  function cochesPaquets(zone, prefixe, coches) {
    zone.textContent = "";
    for (const d of paquets())
      zone.append(h("label", null, h("input", { type: "checkbox", value: d.id, name: prefixe, checked: coches ? coches.includes(d.id) : true }), d.name));
  }
  function paquetsCoches(zone) { return [...zone.querySelectorAll("input:checked")].map((i) => i.value); }

  function choisirTypeAjout(type) {
    ajout.type = type;
    for (const b of $("ajout-type").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.type === type));
    for (const el of $("onglet-ajouter").querySelectorAll("[data-pour]")) el.hidden = !el.dataset.pour.split(" ").includes(type);
    $("ajout-mot").required = type !== "number";
    $("ajout-mot-libelle").textContent = type === "letter" ? "Mot compagnon (même premier son)" : "Mot";
    $("ajout-mot").placeholder = type === "letter" ? "bateau" : "chien";
  }

  function apercuAjout() {
    const z = $("ajout-apercu");
    z.textContent = "";
    if (ajout.blob) z.append(h("img", { alt: "", src: URL.createObjectURL(ajout.blob) }));
    else if (ajout.emoji) z.append(h("span", { class: "glyphe" }, ajout.emoji));
    else z.append(h("span", null, "Prendre ou choisir une photo"));
  }

  function reinitialiserAjout() {
    ajout.blob = null; ajout.emoji = "";
    $("onglet-ajouter").reset();
    $("ajout-source").value = "photo";
    cochesPaquets($("ajout-paquets"), "ajout");
    choisirTypeAjout(ajout.type);
    apercuAjout();
  }

  function message(el, texte, erreur) {
    el.textContent = texte;
    el.classList.toggle("erreur", !!erreur);
  }

  async function enregistrerAjout(ev) {
    ev.preventDefault();
    const msg = $("ajout-message");
    const type = ajout.type;
    const mot = $("ajout-mot").value.trim().toLowerCase();
    const decks = paquetsCoches($("ajout-paquets"));
    if (type !== "number" && !mot) { message(msg, "Il manque le mot.", true); return; }
    if (!ajout.blob && !ajout.emoji) { message(msg, "Il manque une photo ou un emoji.", true); return; }
    if (!decks.length) { message(msg, "Choisir au moins un paquet.", true); return; }

    const id = S.nouvelId();
    const images = [];
    if (ajout.blob) images.push({ id: S.nouvelId(), media: await S.ajouterMedia(ajout.blob), emoji: null, is_primary: true, order: 0 });
    else images.push({ id: S.nouvelId(), media: null, emoji: ajout.emoji, is_primary: true, order: 0 });

    const nouvelle = {
      id, type, category: null, extras: {}, source: $("ajout-source").value, note: $("ajout-note").value.trim(),
      created_at: Date.now(), suspended: false, suspended_until: null, images,
    };
    if (type === "word") {
      nouvelle.label = mot;
      nouvelle.category = $("ajout-categorie").value;
    } else if (type === "number") {
      const n = Number($("ajout-chiffre").value);
      nouvelle.label = CHIFFRES[n];
      nouvelle.extras.digit = n;
    } else {
      nouvelle.label = mot;
      nouvelle.extras.letter = $("ajout-lettre").value;
    }
    S.enregistrerCarte(nouvelle, decks);
    message(msg, "« " + nouvelle.label + " » ajoutée : elle sera dans la prochaine séance.");
    reinitialiserAjout();
  }

  // ======================================================================
  // PARENT : LES CARTES
  // ======================================================================

  function drapeaux(c) {
    const maintenant = Date.now();
    const d = [];
    for (const p of paquets()) {
      const e = S.entree(p.id, c.id);
      if (!e) continue;
      d.push(h("span", { class: "drapeau" + (P.estSangsue(e) ? " alerte" : "") },
        p.name + " · b" + e.box + (P.enRepos(e, maintenant) ? " · repos" : "")));
    }
    if (P.estSuspendue(c, maintenant)) d.push(h("span", { class: "drapeau" }, "suspendue"));
    return h("div", { class: "drapeaux" }, d);
  }

  function rendreCartes() {
    const type = $("filtre-type").value, boite = $("filtre-boite").value, source = $("filtre-source").value;
    const etatF = $("filtre-etat").value, texte = $("filtre-texte").value.trim().toLowerCase();
    const maintenant = Date.now();
    const liste = Object.values(S.etat.cards).filter((c) => {
      if (type && c.type !== type) return false;
      if (source && c.source !== source) return false;
      if (texte && !(c.label.includes(texte) || (c.extras.letter || "").toLowerCase() === texte)) return false;
      if (boite) {
        const [deck, b] = boite.split(":");
        const e = S.entree(deck, c.id);
        if (!e || String(e.box) !== b) return false;
      }
      if (etatF === "suspendues" && !P.estSuspendue(c, maintenant)) return false;
      if (etatF === "signalees" && !paquets().some((p) => { const e = S.entree(p.id, c.id); return e && P.estSangsue(e); })) return false;
      return true;
    }).sort((a, b) => (b.created_at || 0) - (a.created_at || 0) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label, "fr"));

    const ul = $("liste-cartes");
    ul.textContent = "";
    for (const c of liste) {
      const titre = c.type === "letter" ? c.extras.letter + " " + c.label : c.type === "number" ? c.extras.digit + " " + c.label : c.label;
      ul.append(h("li", { "data-carte": c.id, onclick: () => ouvrirFiche(c.id) },
        vignette(c),
        h("div", null, h("div", { class: "titre" }, titre),
          h("div", { class: "infos" }, NOMS_TYPES[c.type] + (c.category ? " · " + (Graines.CATEGORIES[c.category] || c.category) : "") + " · " + (Graines.SOURCES[c.source] || c.source || ""))),
        drapeaux(c)));
    }
    $("cartes-compte").textContent = liste.length + " carte" + (liste.length > 1 ? "s" : "");
  }

  function remplirFiltres() {
    const boites = [["", "Toutes boîtes"]];
    for (const p of paquets()) for (let b = 1; b <= 5; b++) boites.push([p.id + ":" + b, p.name + " · boîte " + b]);
    options($("filtre-boite"), boites, $("filtre-boite").value);
    options($("filtre-source"), [["", "Toutes sources"]].concat(Object.entries(Graines.SOURCES)), $("filtre-source").value);
  }

  // ---------- La fiche d'une carte ----------

  function ouvrirFiche(id) {
    const c = JSON.parse(JSON.stringify(carte(id)));
    const fiche = $("fiche");
    fiche.textContent = "";

    const images = h("div", { class: "fiche-images" });
    const rendreImages = () => {
      images.textContent = "";
      c.images.forEach((im, i) => images.append(h("div", {
        class: "vignette" + (im.is_primary ? " principale" : ""), title: "Image principale",
        onclick: () => { c.images.forEach((x, j) => { x.is_primary = j === i; }); rendreImages(); },
      }, noeudImage(im))));
      images.append(h("label", { class: "vignette", title: "Ajouter une image" }, "+",
        h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (ev) => {
          const f = ev.target.files[0];
          if (!f) return;
          const media = await S.ajouterMedia(await recadrerCarre(f));
          // Reprendre la photo = la nouvelle devient la principale.
          c.images.forEach((x) => { x.is_primary = false; });
          c.images.push({ id: S.nouvelId(), media, emoji: null, is_primary: true, order: c.images.length });
          rendreImages();
        } })));
    };
    rendreImages();

    const label = h("input", { type: "text", value: c.label, autocapitalize: "none" });
    const cat = h("select");
    options(cat, Object.entries(Graines.CATEGORIES), c.category);
    const note = h("input", { type: "text", value: c.note || "" });
    const cochesFiche = h("div", { class: "cases" });
    const membres = paquets().filter((p) => S.entree(p.id, c.id)).map((p) => p.id);
    cochesPaquets(cochesFiche, "fiche", membres);
    // Retirer un enfant d'une carte effacerait son historique : on ne
    // propose que l'ajout ; pour écarter une carte, on la suspend.
    for (const i of cochesFiche.querySelectorAll("input")) if (membres.includes(i.value)) i.disabled = true;

    const maintenant = Date.now();
    const suspendue = P.estSuspendue(c, maintenant);
    const sangsues = paquets().filter((p) => { const e = S.entree(p.id, c.id); return e && P.estSangsue(e); });

    // Par enfant : reposer un mois, ou réveiller. C'est ce qui remplace
    // « retirer la carte de ce paquet » (qui effacerait son historique).
    const parEnfant = h("div", { class: "fiche-actions" });
    for (const p of paquets()) {
      const e = S.entree(p.id, c.id);
      if (!e) continue;
      const repos = P.enRepos(e, maintenant);
      parEnfant.append(h("button", { type: "button", class: "bouton" + (repos ? "" : " secondaire"), "data-repos": p.id,
        onclick: () => {
          S.enregistrerEntree(Object.assign({}, e, repos
            ? { rest_until: null, fail_count: 0, updated_at: maintenant }
            : { rest_until: maintenant + 30 * P.JOUR, updated_at: maintenant }));
          fiche.close(); rendreCartes(); rendreTableau();
        } },
        (repos ? "Réveiller pour " : "Reposer un mois pour ") + p.name));
    }

    const historique = h("table", { class: "historique" });
    const revues = revuesListe().filter((r) => r.card_id === c.id).sort((a, b) => b.at - a.at).slice(0, 40);
    for (const r of revues)
      historique.append(h("tr", null,
        h("td", null, new Date(r.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })),
        h("td", null, (S.etat.decks[r.deck_id] || {}).name || r.deck_id),
        h("td", null, NOMS_NOTES[r.grade] || r.grade),
        h("td", null, NOMS_MODES[r.mode] || r.mode)));

    async function sauverFiche(changements) {
      Object.assign(c, changements || {});
      c.label = label.value.trim().toLowerCase() || c.label;
      if (c.type === "word") c.category = cat.value;
      c.note = note.value.trim();
      S.enregistrerCarte(c, paquetsCoches(cochesFiche));
      fiche.close();
      rendreCartes();
      rendreTableau();
      }

    // `append` du DOM écrit « null » en toutes lettres : on filtre.
    fiche.append(...[
      h("header", { class: "entete" }, h("button", { type: "button", class: "lien", onclick: () => fiche.close() }, "Fermer"),
        h("h1", null, c.type === "letter" ? c.extras.letter + " " + c.label : c.type === "number" ? c.extras.digit + " " + c.label : c.label), h("span")),
      sangsues.length ? h("p", { class: "alerte-sangsue" }, "Ratée 4 fois de suite (" + sangsues.map((p) => p.name).join(", ") +
        ") : elle se repose une semaine. Reprendre la photo, ou la reposer un mois.") : null,
      images,
      h("div", { class: "formulaire" },
        h("label", { class: "champ" }, h("span", null, c.type === "letter" ? "Mot compagnon" : "Mot"), label),
        c.type === "word" ? h("label", { class: "champ" }, h("span", null, "Catégorie"), cat) : null,
        h("fieldset", { class: "champ" }, h("legend", null, "Paquets"), cochesFiche),
        h("label", { class: "champ" }, h("span", null, "Note"), note)),
      h("div", { class: "fiche-actions" },
        h("button", { type: "button", class: "bouton principal", onclick: () => sauverFiche() }, "Enregistrer"),
        suspendue
          ? h("button", { type: "button", class: "bouton", onclick: () => sauverFiche({ suspended: false, suspended_until: null }) }, "Réactiver")
          : h("button", { type: "button", class: "bouton secondaire", onclick: () => sauverFiche({ suspended_until: Date.now() + 30 * P.JOUR }) }, "Suspendre un mois"),
        suspendue ? null : h("button", { type: "button", class: "bouton danger", onclick: () => sauverFiche({ suspended: true }) }, "Suspendre")),
      parEnfant.childElementCount ? h("h2", null, "Par enfant") : null,
      parEnfant,
      h("h2", null, "Historique"),
      revues.length ? historique : h("p", { class: "discret" }, "Jamais montrée."),
    ].filter(Boolean));
    fiche.showModal();
  }

  // ======================================================================
  // PARENT : TABLEAU DE BORD
  // ======================================================================

  function statistiques(deckId) {
    const maintenant = Date.now();
    const semaine = maintenant - 7 * P.JOUR;
    const entrees = S.entrees(deckId).filter((e) => carte(e.card_id) && !P.estSuspendue(carte(e.card_id), maintenant));
    const boites = [0, 0, 0, 0, 0];
    for (const e of entrees) boites[e.box - 1]++;
    const revues = revuesListe().filter((r) => r.deck_id === deckId);
    // Un mot « dit » : le premier « su » noté par le parent en montrer. Une
    // réussite en choisir n'en est pas un (une chance sur deux au hasard).
    const premierSu = {};
    for (const r of revues) if (r.grade === "knew" && r.mode === "show" && (!premierSu[r.card_id] || r.at < premierSu[r.card_id])) premierSu[r.card_id] = r.at;
    const seances = Object.values(S.etat.sessions).filter((s) => s.deck_id === deckId && s.started_at >= semaine && s.ended_at);
    const duree = seances.length ? seances.reduce((t, s) => t + (s.ended_at - s.started_at), 0) / seances.length : 0;
    return {
      boites,
      connues: boites[3] + boites[4],
      jamais: entrees.filter((e) => !(e.reviews > 0)).length,
      nouveauxMots: Object.values(premierSu).filter((t) => t >= semaine).length,
      seances: seances.length,
      duree,
      parPlafond: seances.filter((s) => s.ended_by === "cap").length,
      parParent: seances.filter((s) => s.ended_by === "parent").length,
      echecs: entrees.filter((e) => (e.fail_count || 0) >= 3),
    };
  }

  // Un enfant à la fois : « jamais comparé » vaut aussi pour le parent. Deux
  // colonnes côte à côte invitaient à mesurer l'écart tous les soirs ; un
  // décalage entre jumeaux est fréquent et normal.
  let enfantTableau = null;

  function rendreTableau() {
    const zone = $("onglet-tableau");
    zone.textContent = "";
    const liste = paquets();
    if (!liste.some((p) => p.id === enfantTableau)) enfantTableau = liste.length ? liste[0].id : null;
    const choix = h("div", { class: "segments", id: "tableau-enfant", role: "radiogroup", "aria-label": "Enfant" });
    for (const p of liste)
      choix.append(h("button", { type: "button", role: "radio", "data-deck": p.id, "aria-checked": String(p.id === enfantTableau),
        onclick: () => { enfantTableau = p.id; rendreTableau(); } }, p.name));
    zone.append(choix);
    for (const p of liste) {
      if (p.id !== enfantTableau) continue;
      const s = statistiques(p.id);
      const minutes = s.duree ? Math.round(s.duree / 6000) / 10 + " min" : "—";
      zone.append(h("div", { class: "carte-stats", "data-deck": p.id },
        h("h3", null, p.name),
        h("div", { class: "boites" }, s.boites.map((n, i) => h("div", null, h("b", null, String(n)), h("small", null, "boîte " + (i + 1))))),
        h("dl", { class: "chiffres" },
          h("dt", null, "Boîtes 4–5 (connues)"), h("dd", null, String(s.connues)),
          h("dt", null, "Nouveaux mots dits (7 j)"), h("dd", null, String(s.nouveauxMots)),
          h("dt", null, "Jamais montrées"), h("dd", null, String(s.jamais)),
          h("dt", null, "Séances (7 j)"), h("dd", null, String(s.seances)),
          h("dt", null, "Durée moyenne"), h("dd", null, minutes),
          h("dt", null, "Fin : plafond / parent"), h("dd", null, s.parPlafond + " / " + s.parParent)),
        h("h4", null, "En échec 3 fois de suite"),
        s.echecs.length
          ? h("ul", { class: "mini-liste" }, s.echecs.map((e) => h("li", null, h("button", { type: "button", onclick: () => ouvrirFiche(e.card_id) },
            carte(e.card_id).label + (P.estSangsue(e) ? " (signalée)" : "")))))
          : h("p", { class: "discret" }, "Aucune.")));
    }
    zone.append(h("p", { class: "discret" }, "Si les séances finissent toujours par le parent, le plafond est trop haut. Changer un réglage à la fois."));
  }

  // ======================================================================
  // PARENT : RÉGLAGES
  // ======================================================================

  function rendreReglages() {
    const zone = $("reglages-paquets");
    zone.textContent = "";
    for (const p of paquets()) {
      const nom = h("input", { type: "text", value: p.name, "aria-label": "Prénom" });
      const cap = h("input", { type: "number", min: String(P.PLAFOND_MIN), max: String(P.PLAFOND_MAX), value: String(p.daily_cap), "aria-label": "Cartes par jour" });
      const sauver = () => {
        const n = Math.max(P.PLAFOND_MIN, Math.min(P.PLAFOND_MAX, Number(cap.value) || P.PLAFOND_DEFAUT));
        cap.value = String(n);
        S.enregistrerPaquet(Object.assign({}, S.etat.decks[p.id], { name: nom.value.trim() || p.name, daily_cap: n }));
        rendreDepart(); remplirFiltres();
          };
      nom.addEventListener("change", sauver);
      cap.addEventListener("change", sauver);
      const photo = h("label", { class: "portrait", title: "Photo" }, portrait(p).firstChild,
        h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (ev) => {
          const f = ev.target.files[0];
          if (!f) return;
          const media = await S.ajouterMedia(await recadrerCarre(f, 512));
          S.enregistrerPaquet(Object.assign({}, S.etat.decks[p.id], { photo: media }));
          rendreReglages(); rendreDepart();
              } }));
      zone.append(h("div", { class: "paquet-reglage", "data-deck": p.id }, photo,
        h("div", { class: "champs" },
          h("label", { class: "champ" }, h("span", null, "Prénom"), nom),
          h("label", { class: "champ" }, h("span", null, "Cartes / jour"), cap))));
    }
    $("souffleur-actif").checked = souffleurActif();
    rendreReserve();
    cochesPaquets($("import-paquets"), "import");
    afficherDerniereSauvegarde();
  }

  // La réserve, par groupe : un bouton réveille tout le groupe (ou l'y remet).
  // Réveiller ne touche pas à une suspension d'un mois posée depuis la fiche.
  function rendreReserve() {
    const zone = $("reserve");
    zone.textContent = "";
    for (const [groupe, nom] of Object.entries(Graines.RESERVE)) {
      const cartes = Object.values(S.etat.cards).filter((c) => Graines.groupeReserve(c) === groupe);
      if (!cartes.length) continue;
      const dormantes = cartes.filter((c) => c.suspended);
      const enReserve = dormantes.length > 0;
      const basculer = () => {
        const maintenant = Date.now();
        for (const c of enReserve ? dormantes : cartes) {
          c.suspended = !enReserve;
          c.updated_at = maintenant;
          S.enregistrerCarte(c, []);
        }
        rendreReserve();
      };
      zone.append(h("div", { class: "groupe", "data-groupe": groupe },
        h("div", null, nom, h("small", null, cartes.length + " carte" + (cartes.length > 1 ? "s" : "") +
          (enReserve ? (dormantes.length < cartes.length ? " · " + dormantes.length + " en réserve" : " · en réserve") : " · en séance"))),
        h("button", { type: "button", class: "bouton" + (enReserve ? "" : " secondaire"), onclick: basculer },
          enReserve ? "Réveiller" : "Mettre en réserve")));
    }
  }

  // ======================================================================
  // PARENT : SAUVEGARDE (exporter sur cet appareil, importer sur un autre)
  // ======================================================================

  const CLE_SAUVEGARDE = "flashcards.derniereSauvegarde";
  function derniereSauvegarde() { try { return Number(localStorage.getItem(CLE_SAUVEGARDE)) || null; } catch (_) { return null; } }

  function afficherDerniereSauvegarde() {
    const t = derniereSauvegarde();
    $("sauvegarde-statut").textContent = t
      ? "Dernière sauvegarde : " + new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) + "."
      : "Aucune sauvegarde exportée depuis cet appareil.";
  }

  // Un rappel discret au départ, seulement quand il y a des progrès à perdre.
  // Et, avant tout, l'appareil qui n'enregistre plus : ce n'est pas discret.
  function afficherRappelSauvegarde() {
    const statut = $("statut-depart");
    statut.classList.remove("erreur");
    if (!S.persistant) {
      statut.textContent = "Ce navigateur ne garde rien : les progrès seront perdus à la fermeture.";
      statut.classList.add("erreur");
      return;
    }
    if (S.derniereErreur) {
      statut.textContent = "L'appareil n'enregistre plus (stockage plein ?) : exporter une sauvegarde maintenant, puis libérer de la place.";
      statut.classList.add("erreur");
      return;
    }
    const t = derniereSauvegarde();
    const progres = Object.keys(S.etat.reviews).length > 0;
    const jours = t ? Math.floor((Date.now() - t) / P.JOUR) : Infinity;
    if (progres && jours >= CONFIG.rappelSauvegarde) {
      statut.textContent = (t ? "Dernière sauvegarde il y a " + jours + " jours" : "Aucune sauvegarde") + " : Parent → Réglages → Exporter.";
      return;
    }
    // Tant qu'aucune carte n'a de photo : à deux ans, un référent réel et
    // personnel vaut dix dessins. Les emoji attendent, les photos d'abord.
    const photos = Object.values(S.etat.cards).some((c) => (c.images || []).some((im) => im.media));
    statut.textContent = photos ? "" : "Pour commencer : une vingtaine de photos de la maison, Parent → Ajouter.";
  }

  async function exporterSauvegarde() {
    const msg = $("sauvegarde-message");
    message(msg, "Préparation de la sauvegarde…");
    try {
      const blob = await S.exporter();
      const date = new Date().toISOString().slice(0, 10);
      const lien = h("a", { href: URL.createObjectURL(blob), download: "flashcards-" + date + ".json" });
      document.body.append(lien);
      lien.click();
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
      try { localStorage.setItem(CLE_SAUVEGARDE, String(Date.now())); } catch (_) {}
      const mo = Math.max(0.1, Math.round(blob.size / 104857.6) / 10);
      message(msg, "Sauvegarde téléchargée (" + mo + " Mo) : flashcards-" + date + ".json, dans les téléchargements.");
      afficherDerniereSauvegarde();
    } catch (e) {
      message(msg, "Échec de l'export : " + e.message, true);
    }
  }

  async function importerSauvegarde(fichier) {
    const msg = $("sauvegarde-message");
    if (!fichier) return;
    if (!confirm("Remplacer tout ce qui est sur cet appareil (cartes, photos, progrès des enfants) par cette sauvegarde ?")) return;
    message(msg, "Import…");
    try {
      const r = await S.importer(fichier);
      const quand = r.exporte_le ? " du " + new Date(r.exporte_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
      message(msg, "Sauvegarde" + quand + " importée : " + r.cartes + " cartes, " + r.revues + " révisions, " + r.medias + " photos.");
      remplirFiltres();
      rendreDepart();
      rendreReglages();
    } catch (e) {
      message(msg, e.message, true);
    }
  }

  // Import en masse : chien.jpg, chien-2.jpg → une carte « chien », deux images.
  async function importer(fichiers) {
    const msg = $("import-message");
    const images = [...fichiers].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name));
    if (!images.length) { message(msg, "Aucune image trouvée.", true); return; }
    const decks = paquetsCoches($("import-paquets"));
    if (!decks.length) { message(msg, "Choisir au moins un paquet.", true); return; }
    const source = $("import-source").value, categorie = $("import-categorie").value;
    const groupes = new Map();
    for (const f of images) {
      const mot = f.name.replace(/\.[^.]+$/, "").replace(/[-_ ]?\d+$/, "").replace(/_/g, " ").trim().toLowerCase();
      if (!mot) continue;
      if (!groupes.has(mot)) groupes.set(mot, []);
      groupes.get(mot).push(f);
    }
    let creees = 0, ajoutees = 0, faites = 0;
    for (const [mot, liste] of groupes) {
      message(msg, "Import… " + faites + " / " + groupes.size);
      let c = Object.values(S.etat.cards).find((x) => x.type === "word" && P.motCle(x) === P.motCle({ label: mot }));
      const existante = !!c;
      c = existante ? JSON.parse(JSON.stringify(c)) : {
        id: S.nouvelId(), type: "word", label: mot, category: categorie, extras: {}, source,
        note: "", created_at: Date.now(), suspended: false, suspended_until: null, images: [],
      };
      for (const f of liste) {
        try {
          const media = await S.ajouterMedia(await recadrerCarre(f));
          c.images.push({ id: S.nouvelId(), media, emoji: null, is_primary: c.images.length === 0, order: c.images.length });
          ajoutees++;
        } catch (_) { /* image illisible : ignorée */ }
      }
      if (c.images.length) { S.enregistrerCarte(c, decks); if (!existante) creees++; }
      faites++;
    }
    message(msg, creees + " carte" + (creees > 1 ? "s" : "") + " créée" + (creees > 1 ? "s" : "") + ", " + ajoutees + " image" + (ajoutees > 1 ? "s" : "") + " importée" + (ajoutees > 1 ? "s" : "") + ".");
    rendreCartes();
  }

  // ======================================================================
  // NAVIGATION ET DÉMARRAGE
  // ======================================================================

  function ouvrirOnglet(nom) {
    for (const b of $("onglets").querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.onglet === nom));
    for (const o of ["ajouter", "cartes", "tableau", "reglages"]) $("onglet-" + o).hidden = o !== nom;
    if (nom === "cartes") { remplirFiltres(); rendreCartes(); }
    if (nom === "tableau") rendreTableau();
    if (nom === "reglages") rendreReglages();
  }

  function ouvrirParent() {
    afficherVue("vue-parent");
    if (location.hash !== "#parent") history.replaceState(null, "", "#parent");
    cochesPaquets($("ajout-paquets"), "ajout");
    ouvrirOnglet("ajouter");
  }

  function fermerParent() {
    history.replaceState(null, "", location.pathname + location.search);
    rendreDepart();
    afficherVue("vue-depart");
  }

  function brancher() {
    $("ouvrir-parent").addEventListener("click", ouvrirParent);
    $("parent-fermer").addEventListener("click", fermerParent);
    $("mode-retour").addEventListener("click", () => afficherVue("vue-depart"));
    for (const b of $("filtre").querySelectorAll("button"))
      b.addEventListener("click", () => { filtreChoisi = b.dataset.filtre; rendreInfoMode(); });
    $("mode-montrer").addEventListener("click", () => demarrer("show"));
    $("mode-choisir").addEventListener("click", () => demarrer("choice"));
    brancherGestes($("vue-enfant"));

    for (const b of $("onglets").querySelectorAll("button")) b.addEventListener("click", () => ouvrirOnglet(b.dataset.onglet));
    for (const b of $("ajout-type").querySelectorAll("button")) b.addEventListener("click", () => choisirTypeAjout(b.dataset.type));
    options($("ajout-categorie"), Object.entries(Graines.CATEGORIES), "animal");
    options($("ajout-chiffre"), [1, 2, 3, 4, 5].map((n) => [n, n + " " + CHIFFRES[n]]), 1);
    options($("ajout-lettre"), "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => [l, l]), "A");
    options($("ajout-source"), Object.entries(Graines.SOURCES), "photo");
    options($("import-source"), Object.entries(Graines.SOURCES), "photo");
    options($("import-categorie"), Object.entries(Graines.CATEGORIES), "objet");
    $("ajout-photo").addEventListener("change", async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      ajout.blob = await recadrerCarre(f);
      ajout.emoji = "";
      $("ajout-emoji").value = "";
      $("ajout-source").value = "photo";
      apercuAjout();
    });
    $("ajout-emoji").addEventListener("input", (ev) => {
      ajout.emoji = ev.target.value.trim();
      if (ajout.emoji) { ajout.blob = null; $("ajout-source").value = "emoji"; }
      apercuAjout();
    });
    $("onglet-ajouter").addEventListener("submit", enregistrerAjout);

    for (const id of ["filtre-type", "filtre-boite", "filtre-source", "filtre-etat"]) $(id).addEventListener("change", rendreCartes);
    $("filtre-texte").addEventListener("input", rendreCartes);

    $("souffleur-actif").addEventListener("change", (ev) => reglerSouffleur(ev.target.checked));
    $("exporter").addEventListener("click", exporterSauvegarde);
    $("importer-sauvegarde").addEventListener("change", (ev) => { importerSauvegarde(ev.target.files[0]); ev.target.value = ""; });
    $("import-dossier").addEventListener("change", (ev) => importer(ev.target.files));
    $("import-fichiers").addEventListener("change", (ev) => importer(ev.target.files));

    // Raccourcis de développement (et pour les tests) sur l'écran de l'enfant.
    document.addEventListener("keydown", (ev) => {
      if (!seance || $("vue-enfant").hidden) return;
      const t = { ArrowRight: () => noterEtAvancer("knew"), ArrowUp: () => noterEtAvancer("hesitant"),
        ArrowLeft: () => noterEtAvancer("didnt_know"), ArrowDown: suivantAvecNoteAuto,
        Escape: () => finir("parent"),
        1: () => toucherOption(0), 2: () => toucherOption(1) }[ev.key];
      if (t) { ev.preventDefault(); t(); }
    });
  }

  async function demarrerApplication() {
    await S.charger();
    brancher();
    choisirTypeAjout("word");
    reinitialiserAjout();
    rendreDepart();
    if (location.hash === "#parent") ouvrirParent();
    else afficherVue("vue-depart");
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol))
      navigator.serviceWorker.register("../sw.js").catch(() => {});
    window.flashcards.pret = true;
  }

  // Pour les tests et le débogage.
  window.flashcards = {
    config: CONFIG,
    get seance() { return seance; },
    get carteCourante() { return carteCourante(); },
    noter: noterEtAvancer,
    rendre: () => montrerCarte(),
    toucherOption,
    finir,
    ouvrirFiche,
    importer,
    pret: false,
  };

  demarrerApplication();
})();
