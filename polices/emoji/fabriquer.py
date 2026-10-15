#!/usr/bin/env python3
"""Fabrique la police emoji embarquée : Noto Color Emoji (COLRv1), réduite
aux seuls emoji que les deux applications affichent.

Pourquoi : chaque appareil dessine les emoji avec SA police système, et une
tablette Android de quelques années n'a jamais reçu les glyphes récents
(brosse à dents, seau, poivron, cercles de couleur…) : la carte reste vide.
Avec cette police, tous les appareils qui comprennent COLRv1 (Chrome et
WebView ≥ 98, Firefox ≥ 105) dessinent les mêmes images ; les autres gardent
leur police système, comme avant.

Prérequis : node, python3 avec fonttools et brotli (pip install fonttools brotli).
Source : le paquet npm @infolektuell/noto-color-emoji (fichiers COLRv1 de
Google Fonts, licence OFL, voir LICENSE à côté).

    python3 polices/emoji/fabriquer.py

Relancer après avoir ajouté des emoji dans flashcards/graines.js ou dans
mot-a-mot/index.html. Un emoji tapé par le parent dans « Ajouter » n'est pas
dans la police : il s'affiche avec la police de l'appareil, s'il l'a.
"""
import glob, json, os, subprocess, sys, tarfile, tempfile
from fontTools import subset
from fontTools.ttLib import TTFont

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOSSIER = os.path.join(RACINE, "polices", "emoji")
PAQUET = "@infolektuell/noto-color-emoji@0.2.0"

# Les points de code utilisés, lus par Node dans les données elles-mêmes.
SCRIPT = r"""
const G = require(process.argv[1] + "/flashcards/graines.js");
const { charger } = require(process.argv[1] + "/test/charger.js");
const cps = new Set();
const add = (e) => { for (const ch of e) cps.add(ch.codePointAt(0)); };
for (const [e] of G.MOTS) add(e);
for (const [, , e] of G.LETTRES) add(e);
for (const [, , objs] of G.NOMBRES) for (const e of objs) add(e);
for (const n of charger().NOTIONS) add(n[0]);
console.log(JSON.stringify([...cps].sort((a, b) => a - b)));
"""
voulus = set(json.loads(subprocess.check_output(["node", "-e", SCRIPT, RACINE], text=True)))
voulus.discard(0xFE0F)  # sélecteur de variante : pas un glyphe

with tempfile.TemporaryDirectory() as tmp:
    archive = subprocess.check_output(["npm", "pack", PAQUET, "--silent"], cwd=tmp, text=True).strip()
    with tarfile.open(os.path.join(tmp, archive)) as t: t.extractall(tmp, filter="data")
    for ancien in glob.glob(os.path.join(DOSSIER, "*.woff2")): os.remove(ancien)
    regles, couverts = [], set()
    for f in sorted(glob.glob(os.path.join(tmp, "package", "files", "*.woff2")), key=lambda p: int(os.path.basename(p).split(".")[0])):
        police = TTFont(f)
        ici = voulus & set(police.getBestCmap().keys())
        if not ici: continue
        opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]; opts.notdef_outline = True
        s = subset.Subsetter(opts); s.populate(unicodes=sorted(ici | {0xFE0F})); s.subset(police)
        nom = os.path.basename(f)
        police.save(os.path.join(DOSSIER, nom))
        couverts |= ici
        plages = ", ".join("U+%X" % c for c in sorted(ici))
        regles.append("@font-face {\n  font-family: \"Jeux Emoji\";\n  font-display: block;\n"
                      "  src: url(\"emoji/%s\") format(\"woff2\") tech(color-COLRv1);\n  unicode-range: %s;\n}\n" % (nom, plages))

manquants = sorted(voulus - couverts)
if manquants: print("Non couverts par Noto :", ", ".join("U+%X" % c for c in manquants), file=sys.stderr)
with open(os.path.join(RACINE, "polices", "emoji.css"), "w") as out:
    out.write("/* Police emoji embarquée : Noto Color Emoji (COLRv1), réduite aux emoji des deux\n"
              "   applications. Fichier fabriqué par polices/emoji/fabriquer.py : ne pas éditer.\n"
              "   « tech(color-COLRv1) » : un navigateur trop ancien pour ce format ignore la\n"
              "   règle et garde sa police système, au lieu d'afficher des glyphes vides. */\n")
    out.write("".join(regles))
print("%d emoji, %d fichiers, %d octets" % (len(couverts), len(regles), sum(os.path.getsize(p) for p in glob.glob(os.path.join(DOSSIER, "*.woff2")))))
