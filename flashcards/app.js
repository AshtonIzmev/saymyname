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
  function voixParDefaut() { try { return localStorage.getItem("flashcards.voix") || ""; } catch (_) { return ""; } }

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
  // VOIX : enregistrements du parent, normalisés ; voix de synthèse sinon
  // ======================================================================

  const Voix = (function () {
    let ctx = null;
    let enCours = null;
    const tampons = new Map();

    function contexte() {
      if (!ctx && (window.AudioContext || window.webkitAudioContext)) ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx;
    }

    // Appelé dans un geste de l'utilisateur, sans quoi Chrome refuse le son.
    function deverrouiller() {
      const c = contexte();
      if (c && c.state === "suspended") c.resume().catch(() => {});
    }

    function arreter() {
      if (enCours) { try { enCours(); } catch (_) {} enCours = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    async function tampon(mediaId) {
      if (tampons.has(mediaId)) return tampons.get(mediaId);
      const blob = await S.lireMedia(mediaId);
      if (!blob || !contexte()) return null;
      const t = await contexte().decodeAudioData(await blob.arrayBuffer());
      tampons.set(mediaId, t);
      return t;
    }

    function jouerTampon(t, gain) {
      return new Promise((ok) => {
        const c = contexte();
        const src = c.createBufferSource();
        const g = c.createGain();
        g.gain.value = gain || 1;
        src.buffer = t;
        src.connect(g).connect(c.destination);
        let fini = false;
        const terminer = () => { if (!fini) { fini = true; ok(); } };
        src.onended = terminer;
        enCours = () => { try { src.stop(); } catch (_) {} terminer(); };
        src.start();
      });
    }

    function dire(texte) {
      return new Promise((ok) => {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { ok(); return; }
        const u = new SpeechSynthesisUtterance(texte);
        u.lang = "fr-FR";
        u.rate = 0.85;
        const fr = window.speechSynthesis.getVoices().find((v) => /^fr/i.test(v.lang));
        if (fr) u.voice = fr;
        let fini = false;
        const terminer = () => { if (!fini) { fini = true; clearTimeout(garde); ok(); } };
        // Certaines voix n'émettent jamais « end » : on ne bloque pas la séance.
        const garde = setTimeout(terminer, 1500 + texte.length * 150);
        u.onend = terminer;
        u.onerror = terminer;
        enCours = terminer;
        window.speechSynthesis.speak(u);
      });
    }

    function texteDeSecours(c, question) {
      let t;
      if (c.type === "letter") t = c.extras.sound || c.extras.letter;
      else if (c.type === "number") t = c.label;
      else t = (c.extras && c.extras.phrase) || c.label;
      return question ? "Où est " + t + " ?" : t;
    }

    // Joue la voix de la carte une fois. En mode choix, la voix de synthèse
    // pose la question ; l'enregistrement du parent dit simplement le mot.
    async function jouer(c, question) {
      arreter();
      if (c.audio && c.audio.media) {
        try {
          const t = await tampon(c.audio.media);
          if (t) { await jouerTampon(t, c.audio.gain); return; }
        } catch (_) { /* format illisible : voix de secours */ }
      }
      await dire(texteDeSecours(c, question));
    }

    // Normalisation : gain pour amener le niveau moyen (RMS) vers -20 dBFS,
    // sans jamais dépasser le plafond de crête.
    async function mesurerGain(blob) {
      try {
        const c = contexte();
        if (!c) return 1;
        const t = await c.decodeAudioData(await blob.arrayBuffer());
        let somme = 0, n = 0, crete = 0;
        for (let k = 0; k < t.numberOfChannels; k++) {
          const d = t.getChannelData(k);
          for (let i = 0; i < d.length; i++) { somme += d[i] * d[i]; crete = Math.max(crete, Math.abs(d[i])); }
          n += d.length;
        }
        const rms = Math.sqrt(somme / Math.max(1, n));
        if (rms < 1e-4) return 1;
        return Math.max(0.25, Math.min(6, 0.1 / rms, 0.95 / Math.max(crete, 1e-4)));
      } catch (_) { return 1; }
    }

    async function jouerBlob(blob, gain) {
      arreter();
      const c = contexte();
      if (!c) return;
      const t = await c.decodeAudioData(await blob.arrayBuffer());
      await jouerTampon(t, gain);
    }

    function oublier(mediaId) { tampons.delete(mediaId); }

    return { deverrouiller, jouer, arreter, mesurerGain, jouerBlob, oublier };
  })();

  // Bouton « maintenir pour enregistrer ». `surFin({blob, gain})`.
  function brancherEnregistreur(bouton, surFin, surErreur) {
    let enregistreur = null, flux = null, morceaux = [], relache = false;
    const libelle = bouton.textContent;

    async function commencer(e) {
      e.preventDefault();
      relache = false;
      Voix.deverrouiller();
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        surErreur("Micro indisponible (il faut https ou localhost).");
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (_) { surErreur("Micro refusé."); return; }
      const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      enregistreur = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
      morceaux = [];
      enregistreur.ondataavailable = (ev) => { if (ev.data.size) morceaux.push(ev.data); };
      enregistreur.onstop = async () => {
        flux.getTracks().forEach((t) => t.stop());
        bouton.classList.remove("actif");
        bouton.textContent = libelle;
        const blob = new Blob(morceaux, { type: (enregistreur.mimeType || "audio/webm").split(";")[0] });
        if (blob.size < 800) { surErreur("Trop court : maintenir le bouton pendant qu'on parle."); return; }
        surFin({ blob, gain: await Voix.mesurerGain(blob) });
      };
      enregistreur.start();
      bouton.classList.add("actif");
      bouton.textContent = "J'écoute… relâcher pour finir";
      if (relache) arreter();
    }
    function arreter() {
      relache = true;
      if (enregistreur && enregistreur.state === "recording") enregistreur.stop();
    }
    bouton.addEventListener("pointerdown", commencer);
    bouton.addEventListener("pointerup", arreter);
    bouton.addEventListener("pointercancel", arreter);
    bouton.addEventListener("pointerleave", arreter);
    bouton.addEventListener("contextmenu", (e) => e.preventDefault());
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

  function choisirPaquet(id) {
    paquetChoisi = id;
    $("mode-titre").textContent = S.etat.decks[id].name;
    rendreInfoMode();
    afficherVue("vue-mode");
  }

  function rendreInfoMode() {
    const d = S.etat.decks[paquetChoisi];
    const restant = P.restantAujourdhui(revuesListe(), d.id, d.daily_cap, Date.now());
    const file = P.choisirSession(S.etat.cards, S.entrees(d.id), { cap: restant, filtre: filtreChoisi });
    $("mode-info").textContent = restant === 0
      ? "Plafond du jour atteint (" + d.daily_cap + " cartes)."
      : file.length + " carte" + (file.length > 1 ? "s" : "") + " pour cette séance.";
    for (const b of $("filtre").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.filtre === filtreChoisi));
  }

  // ======================================================================
  // SÉANCE
  // ======================================================================

  let seance = null;
  let verrou = null;
  let reveil = null;

  async function demarrer(mode) {
    Voix.deverrouiller();
    const d = S.etat.decks[paquetChoisi];
    const maintenant = Date.now();
    const restant = P.restantAujourdhui(revuesListe(), d.id, d.daily_cap, maintenant);
    const file = P.choisirSession(S.etat.cards, S.entrees(d.id), { cap: restant, filtre: filtreChoisi, maintenant });
    seance = {
      id: S.nouvelId(), deck: d.id, mode, filtre: filtreChoisi, file, i: 0,
      enregistrement: { id: null, deck_id: d.id, mode, filter: filtreChoisi, started_at: maintenant, ended_at: null, ended_by: null },
      essai: null,
    };
    seance.enregistrement.id = seance.id;
    if (file.length === 0) { finir("cap"); return; }
    S.enregistrerSession(seance.enregistrement);
    // Les images sont résolues avant la première carte : l'écran de l'enfant
    // ne montre jamais une image en train de charger.
    const medias = new Set();
    for (const c of file) for (const im of c.images || []) if (im.media) medias.add(im.media);
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

  function montrerCarte() {
    const c = carteCourante();
    const scene = $("scene");
    const entree = S.entree(seance.deck, c.id);
    scene.textContent = "";
    Voix.arreter();
    seance.essai = { touchers: 0, trouve: false, auto: null, bloque: false, distracteur: null, cote: 0 };

    let distracteur = null;
    if (seance.mode === "choice") distracteur = P.choisirDistracteur(c, S.etat.cards, S.entrees(seance.deck));
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
    Voix.jouer(c, true);
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
      Voix.jouer(c, false);
      return;
    }
    if (e.touchers >= 2) e.auto = "didnt_know";
    // Erreur : rien pendant une seconde, puis la question revient.
    e.bloque = true;
    setTimeout(() => {
      if (seance && seance.essai === e) { e.bloque = false; Voix.jouer(c, true); }
    }, CONFIG.attenteErreur);
  }

  function noterEtAvancer(note) {
    if (!seance) return;
    const c = carteCourante();
    const e = seance.essai;
    const maintenant = Date.now();
    const avant = S.entree(seance.deck, c.id) || P.nouvelleEntree(seance.deck, c.id, maintenant);
    S.enregistrerEntree(P.noter(avant, note, maintenant));
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
    Voix.arreter();
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
  //   glisser → : su        glisser ↑ : hésitant      glisser ← : pas su
  //   glisser ↓ : suivant (mode choix, note automatique)
  //   appui long : fin       tap à deux doigts : réécouter, sans note
  //   tap sur l'image : écouter (montrer) / désigner (choisir)
  function brancherGestes(zone) {
    const doigts = new Map();
    let depart = null, long = null, multi = false, longFait = false, bouge = false;

    zone.addEventListener("pointerdown", (ev) => {
      // Un nouveau geste repart de zéro, même si un relâchement s'est perdu.
      if (ev.isPrimary) doigts.clear();
      doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (doigts.size === 1) {
        depart = { x: ev.clientX, y: ev.clientY, cible: ev.target };
        bouge = false; longFait = false; multi = false;
        clearTimeout(long);
        long = setTimeout(() => {
          if (!bouge && !multi && doigts.size === 1 && seance) { longFait = true; finir("parent"); }
        }, CONFIG.appuiLong);
      } else {
        multi = true;
        clearTimeout(long);
      }
    });
    zone.addEventListener("pointermove", (ev) => {
      if (!depart || !doigts.has(ev.pointerId)) return;
      if (Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) > 15) { bouge = true; clearTimeout(long); }
    });
    const lever = (ev, annule) => {
      if (!doigts.has(ev.pointerId)) return;
      doigts.delete(ev.pointerId);
      if (doigts.size > 0) return;
      clearTimeout(long);
      if (annule || !depart || longFait || !seance) { depart = null; return; }
      const dx = ev.clientX - depart.x, dy = ev.clientY - depart.y;
      const cible = depart.cible;
      depart = null;
      if (multi) { if (!bouge) Voix.jouer(carteCourante(), false); return; }
      if (Math.hypot(dx, dy) >= CONFIG.seuilGlisser) {
        if (Math.abs(dx) > Math.abs(dy)) noterEtAvancer(dx > 0 ? "knew" : "didnt_know");
        else if (dy < 0) noterEtAvancer("hesitant");
        else suivantAvecNoteAuto();
        return;
      }
      if (bouge) return;
      const option = cible.closest && cible.closest(".option");
      if (option) { toucherOption(Number(option.dataset.option)); return; }
      if (cible.closest && cible.closest(".visuel")) Voix.jouer(carteCourante(), false);
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

  const ajout = { type: "word", blob: null, emoji: "", audio: null };

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
    ajout.blob = null; ajout.emoji = ""; ajout.audio = null;
    $("onglet-ajouter").reset();
    $("ajout-ecouter").disabled = true;
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
    let audio = null;
    if (ajout.audio)
      audio = { id: S.nouvelId(), media: await S.ajouterMedia(ajout.audio.blob), gain: ajout.audio.gain, recorded_by: $("voix-nom").value || voixParDefaut() || null };

    const nouvelle = {
      id, type, category: null, extras: {}, source: $("ajout-source").value, note: $("ajout-note").value.trim(),
      created_at: Date.now(), suspended: false, suspended_until: null, images, audio,
    };
    if (type === "word") {
      nouvelle.label = mot;
      nouvelle.category = $("ajout-categorie").value;
      nouvelle.extras.phrase = $("ajout-phrase").value.trim() || mot;
    } else if (type === "number") {
      const n = Number($("ajout-chiffre").value);
      nouvelle.label = CHIFFRES[n];
      nouvelle.extras.digit = n;
    } else {
      nouvelle.label = mot;
      nouvelle.extras.letter = $("ajout-lettre").value;
      nouvelle.extras.sound = $("ajout-son").value.trim() || $("ajout-lettre").value.toLowerCase();
    }
    S.enregistrerCarte(nouvelle, decks);
    message(msg, "« " + nouvelle.label + " » ajoutée : elle sera dans la prochaine séance." + (audio ? "" : " Pensez à enregistrer la voix."));
    reinitialiserAjout();
  }

  // ======================================================================
  // PARENT : LES CARTES
  // ======================================================================

  function aVoix(c) { return !!(c.audio && c.audio.media); }

  function drapeaux(c) {
    const maintenant = Date.now();
    const d = [];
    for (const p of paquets()) {
      const e = S.entree(p.id, c.id);
      if (!e) continue;
      d.push(h("span", { class: "drapeau" + (P.estSangsue(e) ? " alerte" : "") }, p.name + " · b" + e.box));
    }
    if (!aVoix(c)) d.push(h("span", { class: "drapeau alerte" }, "à enregistrer"));
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
      if (etatF === "sans-voix" && aVoix(c)) return false;
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
    let nouvelleVoix = null;
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
    const phrase = h("input", { type: "text", value: c.extras.phrase || "", autocapitalize: "none" });
    const son = h("input", { type: "text", value: c.extras.sound || "", autocapitalize: "none" });
    const cat = h("select");
    options(cat, Object.entries(Graines.CATEGORIES), c.category);
    const note = h("input", { type: "text", value: c.note || "" });
    const cochesFiche = h("div", { class: "cases" });
    const membres = paquets().filter((p) => S.entree(p.id, c.id)).map((p) => p.id);
    cochesPaquets(cochesFiche, "fiche", membres);
    // Retirer un enfant d'une carte effacerait son historique : on ne
    // propose que l'ajout ; pour écarter une carte, on la suspend.
    for (const i of cochesFiche.querySelectorAll("input")) if (membres.includes(i.value)) i.disabled = true;

    const enregistrerVoix = h("button", { type: "button", class: "bouton enregistrer" }, aVoix(c) ? "Maintenir pour réenregistrer" : "Maintenir pour enregistrer");
    const ecouter = h("button", { type: "button", class: "bouton secondaire", onclick: () => {
      Voix.deverrouiller();
      if (nouvelleVoix) Voix.jouerBlob(nouvelleVoix.blob, nouvelleVoix.gain);
      else Voix.jouer(c, false);
    } }, "Écouter");
    const msg = h("p", { class: "message", role: "status" });
    brancherEnregistreur(enregistrerVoix, (v) => { nouvelleVoix = v; message(msg, "Nouvelle voix prête : enregistrer la fiche pour la garder."); },
      (t) => message(msg, t, true));

    const maintenant = Date.now();
    const suspendue = P.estSuspendue(c, maintenant);
    const sangsues = paquets().filter((p) => { const e = S.entree(p.id, c.id); return e && P.estSangsue(e); });

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
      if (c.type === "word") { c.extras.phrase = phrase.value.trim() || c.label; c.category = cat.value; }
      if (c.type === "letter") c.extras.sound = son.value.trim() || c.extras.sound;
      c.note = note.value.trim();
      if (nouvelleVoix) {
        const media = await S.ajouterMedia(nouvelleVoix.blob);
        if (c.audio) Voix.oublier(c.audio.media);
        c.audio = { id: S.nouvelId(), media, gain: nouvelleVoix.gain, recorded_by: $("voix-nom").value || voixParDefaut() || null };
      }
      S.enregistrerCarte(c, paquetsCoches(cochesFiche));
      fiche.close();
      rendreCartes();
      rendreTableau();
      }

    fiche.append(
      h("header", { class: "entete" }, h("button", { type: "button", class: "lien", onclick: () => fiche.close() }, "Fermer"),
        h("h1", null, c.type === "letter" ? c.extras.letter + " " + c.label : c.type === "number" ? c.extras.digit + " " + c.label : c.label), h("span")),
      sangsues.length ? h("p", { class: "alerte-sangsue" }, "Ratée 4 fois de suite (" + sangsues.map((p) => p.name).join(", ") +
        ") : reprendre la photo, réenregistrer la voix, ou suspendre un mois.") : null,
      images,
      h("div", { class: "formulaire" },
        h("label", { class: "champ" }, h("span", null, c.type === "letter" ? "Mot compagnon" : "Mot"), label),
        c.type === "word" ? h("label", { class: "champ" }, h("span", null, "La voix dit"), phrase) : null,
        c.type === "word" ? h("label", { class: "champ" }, h("span", null, "Catégorie"), cat) : null,
        c.type === "letter" ? h("label", { class: "champ" }, h("span", null, "Son de la lettre"), son) : null,
        h("div", { class: "voix" }, enregistrerVoix, ecouter),
        h("fieldset", { class: "champ" }, h("legend", null, "Paquets"), cochesFiche),
        h("label", { class: "champ" }, h("span", null, "Note"), note)),
      msg,
      h("div", { class: "fiche-actions" },
        h("button", { type: "button", class: "bouton principal", onclick: () => sauverFiche() }, "Enregistrer"),
        suspendue
          ? h("button", { type: "button", class: "bouton", onclick: () => sauverFiche({ suspended: false, suspended_until: null }) }, "Réactiver")
          : h("button", { type: "button", class: "bouton secondaire", onclick: () => sauverFiche({ suspended_until: Date.now() + 30 * P.JOUR }) }, "Suspendre un mois"),
        suspendue ? null : h("button", { type: "button", class: "bouton danger", onclick: () => sauverFiche({ suspended: true }) }, "Suspendre")),
      h("h2", null, "Historique"),
      revues.length ? historique : h("p", { class: "discret" }, "Jamais montrée."));
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
    const premierSu = {};
    for (const r of revues) if (r.grade === "knew" && (!premierSu[r.card_id] || r.at < premierSu[r.card_id])) premierSu[r.card_id] = r.at;
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

  function rendreTableau() {
    const zone = $("onglet-tableau");
    zone.textContent = "";
    const colonnes = h("div", { class: "cote-a-cote" });
    for (const p of paquets()) {
      const s = statistiques(p.id);
      const minutes = s.duree ? Math.round(s.duree / 6000) / 10 + " min" : "—";
      colonnes.append(h("div", { class: "carte-stats", "data-deck": p.id },
        h("h3", null, p.name),
        h("div", { class: "boites" }, s.boites.map((n, i) => h("div", null, h("b", null, String(n)), h("small", null, "boîte " + (i + 1))))),
        h("dl", { class: "chiffres" },
          h("dt", null, "Boîtes 4–5 (connues)"), h("dd", null, String(s.connues)),
          h("dt", null, "Nouveaux mots reconnus (7 j)"), h("dd", null, String(s.nouveauxMots)),
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
    zone.append(colonnes);
    const sansVoix = Object.values(S.etat.cards).filter((c) => !aVoix(c)).length;
    zone.append(h("p", { class: "discret" }, sansVoix + " carte" + (sansVoix > 1 ? "s" : "") + " sans voix enregistrée (voix de synthèse en attendant). ",
      h("button", { type: "button", class: "lien", onclick: () => { $("filtre-etat").value = "sans-voix"; ouvrirOnglet("cartes"); } }, "Les voir")));
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
    $("voix-nom").value = voixParDefaut();
    cochesPaquets($("import-paquets"), "import");
    afficherDerniereSauvegarde();
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
  function afficherRappelSauvegarde() {
    const t = derniereSauvegarde();
    const progres = Object.keys(S.etat.reviews).length > 0;
    const jours = t ? Math.floor((Date.now() - t) / P.JOUR) : Infinity;
    $("statut-depart").textContent = progres && jours >= CONFIG.rappelSauvegarde
      ? (t ? "Dernière sauvegarde il y a " + jours + " jours" : "Aucune sauvegarde") + " : Parent → Réglages → Exporter."
      : "";
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
    if (!confirm("Remplacer tout ce qui est sur cet appareil (cartes, photos, voix, progrès des enfants) par cette sauvegarde ?")) return;
    message(msg, "Import…");
    try {
      const r = await S.importer(fichier);
      const quand = r.exporte_le ? " du " + new Date(r.exporte_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
      message(msg, "Sauvegarde" + quand + " importée : " + r.cartes + " cartes, " + r.revues + " révisions, " + r.medias + " photos et voix.");
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
        id: S.nouvelId(), type: "word", label: mot, category: categorie, extras: { phrase: mot }, source,
        note: "", created_at: Date.now(), suspended: false, suspended_until: null, images: [], audio: null,
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
    $("ajout-mot").addEventListener("input", (ev) => {
      if (ajout.type === "word" && !$("ajout-phrase").dataset.touche) $("ajout-phrase").placeholder = "le " + (ev.target.value.trim().toLowerCase() || "chien");
    });
    $("ajout-phrase").addEventListener("input", (ev) => { ev.target.dataset.touche = "1"; });
    brancherEnregistreur($("ajout-enregistrer"), (v) => {
      ajout.audio = v;
      $("ajout-ecouter").disabled = false;
      message($("ajout-message"), "Voix enregistrée.");
    }, (t) => message($("ajout-message"), t, true));
    $("ajout-ecouter").addEventListener("click", () => { if (ajout.audio) { Voix.deverrouiller(); Voix.jouerBlob(ajout.audio.blob, ajout.audio.gain); } });
    $("onglet-ajouter").addEventListener("submit", enregistrerAjout);

    for (const id of ["filtre-type", "filtre-boite", "filtre-source", "filtre-etat"]) $(id).addEventListener("change", rendreCartes);
    $("filtre-texte").addEventListener("input", rendreCartes);

    $("voix-nom").addEventListener("change", (ev) => { try { localStorage.setItem("flashcards.voix", ev.target.value.trim()); } catch (_) {} });
    $("exporter").addEventListener("click", exporterSauvegarde);
    $("importer-sauvegarde").addEventListener("change", (ev) => { importerSauvegarde(ev.target.files[0]); ev.target.value = ""; });
    $("import-dossier").addEventListener("change", (ev) => importer(ev.target.files));
    $("import-fichiers").addEventListener("change", (ev) => importer(ev.target.files));

    // Raccourcis de développement (et pour les tests) sur l'écran de l'enfant.
    document.addEventListener("keydown", (ev) => {
      if (!seance || $("vue-enfant").hidden) return;
      const t = { ArrowRight: () => noterEtAvancer("knew"), ArrowUp: () => noterEtAvancer("hesitant"),
        ArrowLeft: () => noterEtAvancer("didnt_know"), ArrowDown: suivantAvecNoteAuto,
        Escape: () => finir("parent"), " ": () => Voix.jouer(carteCourante(), false),
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
