// Extrait les scripts « donnees » et « graphe » de index.html et les exécute
// dans un bac à sable Node : le fichier HTML reste la seule source de vérité.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CHEMIN_HTML = path.join(__dirname, "..", "index.html");

function extraireScript(html, id) {
  const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  if (!m) throw new Error("Script introuvable : " + id);
  return m[1];
}

function charger() {
  const html = fs.readFileSync(CHEMIN_HTML, "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(extraireScript(html, "donnees"), ctx, { filename: "donnees.js" });
  vm.runInContext(extraireScript(html, "graphe"), ctx, { filename: "graphe.js" });
  return vm.runInContext(
    "({ VOCABULAIRE, FAMILLES, NOTIONS, validerNotions, estChemin, score, voisins, etatSuivant })",
    ctx
  );
}

// Générateur pseudo-aléatoire déterministe (mulberry32) pour des tests rejouables.
function alea(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { charger, alea, CHEMIN_HTML, extraireScript };
