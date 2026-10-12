// ==========================================================================
// PLANIFICATEUR. Leitner à cinq boîtes, par jumeau, avec plafond quotidien.
// Fonctions pures, sans DOM ni stockage : chargées telles quelles par la
// tablette (navigateur) et par les tests (Node).
//
// Une « entrée » est une ligne deck_card : l'état d'une carte dans le paquet
// d'un enfant. { deck_id, card_id, box, due_at, streak, fail_count, reviews,
// last_seen_at, updated_at }. Les dates sont des millisecondes.
// ==========================================================================
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.Planificateur = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const JOUR = 86400000;
  // Boîte → délai avant la prochaine révision, en jours. La boîte 1 revient à
  // chaque séance ; la boîte 5 (« maîtrisée ») sert surtout de distracteur.
  const INTERVALLES = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };
  const NOTES = ["knew", "hesitant", "didnt_know"];
  const PLAFOND_DEFAUT = 10;
  const PLAFOND_MIN = 6;
  const PLAFOND_MAX = 15;
  const NOUVELLES_MAX = 3;
  const SERIE_BOITE_5 = 3; // trois « su » d'affilée en boîte 4 → boîte 5
  const SEUIL_SANGSUE = 4; // quatre échecs d'affilée en boîte 1 → signalée

  function debutDuJour(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // Une révision « dans N jours » tombe à minuit : une carte vue le soir est
  // due le lendemain matin, pas le lendemain soir.
  function echeance(box, maintenant) {
    const jours = INTERVALLES[box];
    return jours === 0 ? maintenant : debutDuJour(maintenant) + jours * JOUR;
  }

  function nouvelleEntree(deckId, cardId, maintenant) {
    return {
      deck_id: deckId, card_id: cardId, box: 1, due_at: maintenant,
      streak: 0, fail_count: 0, reviews: 0, last_seen_at: null, updated_at: maintenant,
    };
  }

  function estDue(entree, maintenant) {
    return entree.box === 1 || entree.due_at <= maintenant;
  }

  function estSuspendue(carte, maintenant) {
    return !!carte.suspended || (carte.suspended_until != null && carte.suspended_until > maintenant);
  }

  // `streak` compte les « su » d'affilée dans la boîte courante : il retombe à
  // zéro à chaque changement de boîte et à chaque note qui n'est pas « su ».
  // C'est ce qui rend lisible la règle « trois fois de suite en boîte 4 ».
  // `fail_count` compte les échecs d'affilée (remis à zéro par un « su »).
  function noter(entree, note, maintenant) {
    if (!NOTES.includes(note)) throw new Error("Note inconnue : " + note);
    const n = Object.assign({}, entree, {
      reviews: (entree.reviews || 0) + 1,
      last_seen_at: maintenant,
      updated_at: maintenant,
    });
    if (note === "knew") {
      n.fail_count = 0;
      if (entree.box < 4) {
        n.box = entree.box + 1;
        n.streak = 0;
      } else if (entree.box === 4) {
        n.streak = (entree.streak || 0) + 1;
        if (n.streak >= SERIE_BOITE_5) { n.box = 5; n.streak = 0; }
      } else {
        n.streak = (entree.streak || 0) + 1;
      }
      n.due_at = echeance(n.box, maintenant);
    } else if (note === "hesitant") {
      // Même boîte, mais due de nouveau dès la prochaine séance.
      n.streak = 0;
      n.due_at = maintenant;
    } else {
      n.box = 1;
      n.streak = 0;
      n.fail_count = (entree.fail_count || 0) + 1;
      n.due_at = maintenant;
    }
    return n;
  }

  // Signalée, jamais retirée : le parent décide (reprendre la photo,
  // réenregistrer le son, suspendre un mois).
  function estSangsue(entree) {
    return entree.box === 1 && (entree.fail_count || 0) >= SEUIL_SANGSUE;
  }

  // Le mot qui ne doit pas apparaître deux fois de suite. « B bateau » et
  // « bateau » partagent le mot « bateau ».
  function motCle(carte) {
    return String(carte.label || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }

  // Catégorie qui sépare cible et distracteur : un animal contre un objet,
  // jamais un chat contre un chien. Chiffres et lettres sont chacun leur
  // propre catégorie : deux chiffres différents sont toujours distinguables.
  function categorie(carte) {
    return carte.type === "word" ? (carte.category || "autre") : carte.type + ":" + motCle(carte);
  }

  function correspondFiltre(carte, filtre) {
    if (filtre === "lettres") return carte.type === "letter";
    if (filtre === "nombres") return carte.type === "number";
    return true;
  }

  function estLettreOuNombre(carte) {
    return carte.type === "letter" || carte.type === "number";
  }

  // Mélange de Fisher-Yates, puis on reconstruit la file en prenant chaque
  // fois, parmi les cartes dont le mot diffère de la précédente, celle dont le
  // mot reste le plus fréquent (à égalité, l'ordre mélangé décide). C'est ce
  // qui évite de se retrouver avec deux « bateau » à la fin.
  function melanger(cartesOrdonnees, alea) {
    const t = cartesOrdonnees.slice();
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(alea() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
    const file = [];
    while (t.length) {
      const precedent = file.length ? motCle(file[file.length - 1]) : null;
      const restants = {};
      for (const c of t) restants[motCle(c)] = (restants[motCle(c)] || 0) + 1;
      let k = -1;
      for (let i = 0; i < t.length; i++) {
        const m = motCle(t[i]);
        if (m === precedent) continue;
        if (k < 0 || restants[m] > restants[motCle(t[k])]) k = i;
      }
      file.push(t.splice(k < 0 ? 0 : k, 1)[0]);
    }
    return file;
  }

  // Sélection d'une séance. `cartes` : objet id → carte. `entrees` : lignes
  // deck_card du paquet. Renvoie les cartes, dans l'ordre de présentation.
  //   1. Les dues des boîtes 2 à 4 (puis 5), la plus anciennement due d'abord.
  //   2. Le reste en boîte 1 : les ratées avant les jamais vues.
  //   3. Au plus trois jamais vues par séance (les plus récemment ajoutées
  //      d'abord : une carte créée au téléphone apparaît à la séance suivante).
  //   4. Au plus 50 % de lettres + chiffres, sauf séance lettres ou chiffres.
  //   5. Mélange, jamais deux fois le même mot à la suite.
  function choisirSession(cartes, entrees, options) {
    const o = Object.assign({ cap: PLAFOND_DEFAUT, maxNouvelles: NOUVELLES_MAX, filtre: "tout", alea: Math.random }, options);
    const maintenant = o.maintenant != null ? o.maintenant : Date.now();
    if (o.cap <= 0) return [];

    const eligibles = [];
    for (const e of entrees) {
      const c = cartes[e.card_id];
      if (!c || estSuspendue(c, maintenant) || !correspondFiltre(c, o.filtre)) continue;
      eligibles.push([e, c]);
    }
    const dues = eligibles
      .filter(([e]) => e.box >= 2 && e.due_at <= maintenant)
      .sort(([a], [b]) => (a.box === 5) - (b.box === 5) || a.due_at - b.due_at);
    const ratees = eligibles
      .filter(([e]) => e.box === 1 && e.reviews > 0)
      .sort(([a], [b]) => (a.last_seen_at || 0) - (b.last_seen_at || 0));
    const nouvelles = eligibles
      .filter(([e]) => e.box === 1 && !(e.reviews > 0))
      .sort(([, a], [, b]) => (b.created_at || 0) - (a.created_at || 0) || (a.id < b.id ? -1 : 1));

    const limiteLN = o.filtre === "tout" ? Math.floor(o.cap / 2) : Infinity;
    const choisies = [];
    let nNouvelles = 0, nLN = 0;
    for (const [e, c] of dues.concat(ratees, nouvelles)) {
      if (choisies.length >= o.cap) break;
      const neuve = e.box === 1 && !(e.reviews > 0);
      if (neuve && nNouvelles >= o.maxNouvelles) continue;
      if (estLettreOuNombre(c) && nLN >= limiteLN) continue;
      if (neuve) nNouvelles++;
      if (estLettreOuNombre(c)) nLN++;
      choisies.push(c);
    }
    return melanger(choisies, o.alea);
  }

  // Distracteur du mode choix : même type, autre catégorie, autre mot, et une
  // carte que l'enfant connaît déjà (boîte 3+). À défaut, une carte déjà vue ;
  // à défaut encore, n'importe laquelle qui respecte la catégorie.
  function choisirDistracteur(cible, cartes, entrees, options) {
    const o = Object.assign({ alea: Math.random }, options);
    const maintenant = o.maintenant != null ? o.maintenant : Date.now();
    const candidats = [];
    for (const e of entrees) {
      const c = cartes[e.card_id];
      if (!c || c.id === cible.id || c.type !== cible.type || estSuspendue(c, maintenant)) continue;
      if (categorie(c) === categorie(cible) || motCle(c) === motCle(cible)) continue;
      candidats.push([e, c]);
    }
    const niveaux = [
      candidats.filter(([e]) => e.box >= 3),
      candidats.filter(([e]) => e.reviews > 0),
      candidats,
    ];
    for (const niveau of niveaux) {
      if (niveau.length) return niveau[Math.floor(o.alea() * niveau.length)][1];
    }
    return null;
  }

  // Image à montrer : la principale tant que la carte n'a pas atteint la
  // boîte 3, puis toutes à tour de rôle, pour que l'enfant apprenne le mot et
  // non l'image.
  function choisirImage(carte, entree, alea) {
    const images = (carte.images || []).slice().sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.order || 0) - (b.order || 0));
    if (images.length === 0) return null;
    if (!entree || entree.box < 3 || images.length === 1) return images[0];
    return images[Math.floor((alea || Math.random)() * images.length)];
  }

  // Le plafond est quotidien : une deuxième séance le même jour ne propose
  // que ce qui reste.
  function restantAujourdhui(revues, deckId, cap, maintenant) {
    const debut = debutDuJour(maintenant);
    let n = 0;
    for (const r of revues) if (r.deck_id === deckId && r.at >= debut) n++;
    return Math.max(0, cap - n);
  }

  // Note automatique du mode choix, d'après les touchers de l'enfant.
  function noteChoix(touchers, trouve) {
    if (trouve && touchers === 1) return "knew";
    if (trouve && touchers === 2) return "hesitant";
    return "didnt_know";
  }

  return {
    JOUR, INTERVALLES, NOTES, PLAFOND_DEFAUT, PLAFOND_MIN, PLAFOND_MAX, NOUVELLES_MAX, SEUIL_SANGSUE,
    debutDuJour, echeance, nouvelleEntree, estDue, estSuspendue, noter, estSangsue,
    motCle, categorie, melanger, choisirSession, choisirDistracteur, choisirImage,
    restantAujourdhui, noteChoix,
  };
});
