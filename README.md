# Cas'Design — maquette de site

Maquette du site de **Cas'Design — Pascal Casani, dessinateur · infographiste à Sisteron** : plans, permis de construire, modélisation 3D et images de synthèse.

**Version provisoire : https://exosuppra.github.io/casdesign/**

| Page | Adresse |
| --- | --- |
| Accueil — la maquette en motion design | https://exosuppra.github.io/casdesign/ |
| Fiche contact — la page simple atteinte par le QR code | https://exosuppra.github.io/casdesign/contact/ |

> Maquette de proposition, non définitive. Textes et visuels restent à valider ; la page est marquée `noindex`.

## L'idée : « Du premier trait à la dernière lumière »

On scrolle, et la maison se construit : le plan de masse coté bascule en volume, puis une ligne de balayage lui donne sa matière. Plus bas, les planches du dossier défilent sur la table, un curseur fait passer du trait au rendu, et le scroll fait tourner le soleil du matin au crépuscule.

Toutes les images sont calculées à partir d'une maquette 3D de maison individuelle : dessin au trait, maquette blanche, rendu texturé, étude d'ensoleillement.

## Technique

Site statique, sans étape de build.

- HTML / CSS / JavaScript natifs
- [GSAP 3](https://gsap.com/) + ScrollTrigger, [Lenis](https://lenis.darkroom.engineering/) pour le défilement fluide (CDN)
- Séquences d'images WebP dessinées dans un `<canvas>`, en deux jeux (`assets/seq/d` pour ordinateur, `assets/seq/m` allégé sous 900 px)
- Responsive, `prefers-reduced-motion` respecté, contenu lisible sans JavaScript

```
index.html
assets/css/style.css
assets/js/main.js     animations et interactions
assets/js/meta.js     plages d'images, points suivis, positions du soleil
assets/seq/           séquences du hero et de l'ensoleillement
assets/img/           planches, vues fixes, carte de visite
contact/              fiche contact : page autonome (styles, polices et images embarqués), sans dépendance
```

En local :

```bash
python -m http.server 4173
```
