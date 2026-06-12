// ═══════════════════════════════════════════════════════════════════
//  LABYRINTHE — labyrinthe.js
//  Moteur complet de génération et d'interaction pour le jeu de labyrinthe.
//  Le joueur trace son chemin à la souris (ou au toucher) depuis l'entrée
//  jusqu'à la sortie sans traverser de murs.
// ═══════════════════════════════════════════════════════════════════

// ── État global du labyrinthe ──────────────────────────────────────
// Toutes les données du jeu sont centralisées dans cet objet.
// Cela évite les collisions de variables globales avec pixel-creature.js.
var LAB = {
  active: false,       // Vrai si le labyrinthe est en cours d'exécution
  canvas: null,        // Élément <canvas> dédié au labyrinthe (#lab-canvas)
  ctx: null,           // Contexte 2D du canvas
  level: 1,            // Niveau actuel (1 à 5)
  cols: 0,             // Nombre de colonnes de la grille
  rows: 0,             // Nombre de lignes de la grille
  cellSize: 0,         // Taille d'une cellule en pixels
  grid: [],            // Grille 2D : grid[r][c] = {walls:[N,E,S,O], visited}
  path: [],            // Chemin courant du joueur : [{r,c,px,py}]
  explored: [],        // Cellules déjà visitées (trace fantôme grise)
  mouseInMaze: false,  // Indique si la souris est dans la zone du labyrinthe
  startCell: null,     // Cellule d'entrée {r, c}
  endCell: null,       // Cellule de sortie {r, c}
  solved: false,       // Vrai si le joueur a atteint la sortie
  attempts: 0,         // Nombre de tentatives depuis le début du niveau
  startTime: 0,        // Timestamp (ms) du début du niveau (pour le chrono)
  animFrame: null,     // ID de la boucle requestAnimationFrame en cours
  // Palette de couleurs vives pour les murs, chemins et cellules
  COLORS: [
  '#c9b8f5','#b8d4f5','#f5b8d4','#b8f5e0',
  '#f5d4b8','#d4b8f5','#b8f5f5','#f5f5b8'
],
  bgColor: '#0e0c16',              // Couleur de fond général
  wallColor: null,                 // Couleur des murs (tirée aléatoirement)
  pathColor: null,                 // Couleur du tracé du joueur
  ghostColor: 'rgba(255,255,255,0.07)', // Couleur de la trace fantôme (non utilisée directement)
  glowColor: null,                 // Couleur du halo du tracé
  offsetX: 0,                      // Décalage X pour centrer le labyrinthe dans le canvas
  offsetY: 0,                      // Décalage Y pour centrer le labyrinthe
  mazeW: 0,                        // Largeur totale du labyrinthe en pixels
  mazeH: 0                         // Hauteur totale du labyrinthe en pixels
};

// ── Configurations par niveau ──────────────────────────────────────
// Chaque entrée définit [colonnes, lignes] pour le niveau correspondant.
// Plus la grille est grande, plus le labyrinthe est complexe.
var LAB_CONFIGS = [
  [7,  7 ],  // Niveau 1 — très facile
  [11, 11],  // Niveau 2
  [15, 15],  // Niveau 3
  [21, 19],  // Niveau 4
  [29, 25]   // Niveau 5 — difficile
];

// ── INITIALISATION ─────────────────────────────────────────────────

/**
 * Point d'entrée principal du jeu Labyrinthe.
 * Appelée par selectMode() ou startGame() lorsque le mode "labyrinthe"
 * est sélectionné.
 *
 * Responsabilités :
 *  - Marque LAB comme actif et remet à zéro les compteurs
 *  - Crée le canvas HTML dédié (#lab-canvas) dans le div#canvas,
 *    sauf si ce canvas existe déjà (appels successifs)
 *  - Choisit les couleurs aléatoires du niveau (labPickColors)
 *  - Génère et affiche le premier labyrinthe (labBuildLevel)
 *  - Attache les écouteurs souris/toucher (labBindEvents)
 *  - Démarre la boucle de rendu (labLoop)
 */
function labInit() {
  console.log('🎲 labInit appelé');
  LAB.active = true;
  LAB.level = 1;
  LAB.solved = false;
  LAB.attempts = 0;

  // Crée le canvas du labyrinthe dans le div#canvas (s'il n'existe pas déjà)
  if (!LAB.canvas) {
    var canvasDiv = document.getElementById('canvas');
    if (!canvasDiv) {
      console.error('❌ div#canvas n\'existe pas !');
      return;
    }
    var c = document.createElement('canvas');
    c.id = 'lab-canvas';
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height = '100%';
    canvasDiv.appendChild(c);
    LAB.canvas = c;
    LAB.ctx = c.getContext('2d');
  }

  labPickColors();
  labBuildLevel();
  labBindEvents();
  labLoop();
  console.log('✓ Labyrinthe lancé');
}

/**
 * Choisit aléatoirement un trio de couleurs cohérent pour le niveau
 * en piochant dans LAB.COLORS avec des décalages d'index fixes :
 *   - pathColor  : couleur du tracé du joueur (index de base)
 *   - glowColor  : couleur du halo (+2 dans la palette)
 *   - wallColor  : couleur des murs (+4 dans la palette)
 * Le décalage garantit que les trois couleurs sont contrastées.
 */
function labPickColors() {
  var idx = Math.floor(Math.random() * LAB.COLORS.length);
  LAB.pathColor  = LAB.COLORS[idx];
  LAB.glowColor  = LAB.COLORS[(idx + 2) % LAB.COLORS.length];
  LAB.wallColor  = LAB.COLORS[(idx + 4) % LAB.COLORS.length];
}

// ── GÉNÉRATION DU LABYRINTHE ───────────────────────────────────────

/**
 * Génère un nouveau labyrinthe parfait (sans îles, un seul chemin entre
 * deux cellules quelconques) via un algorithme DFS itératif (exploration
 * en profondeur avec backtracking).
 *
 * Étapes :
 *  1. Calcule la taille des cellules pour que le labyrinthe tienne dans
 *     la fenêtre (avec marges de 60px et réserve de 80px en bas pour l'UI).
 *  2. Centre le labyrinthe dans le canvas (offsetX, offsetY).
 *  3. Initialise la grille avec toutes les parois fermées.
 *  4. Exécute le DFS itératif : depuis (0,0), visite les voisins non visités
 *     dans un ordre aléatoire, abat les murs communs et empile la progression.
 *     Lorsqu'il n'y a plus de voisin, dépile (backtrack).
 *  5. Ouvre l'entrée (mur du haut de (0,0)) et la sortie (mur du bas de la
 *     dernière cellule).
 *  6. Lance le chrono et met à jour l'UI.
 *
 * Résultat : un labyrinthe parfait (toutes les cellules accessibles,
 * solution unique) différent à chaque appel grâce au tirage aléatoire.
 */
function labBuildLevel() {
  LAB.solved = false;
  LAB.path = [];
  LAB.explored = [];

  var cfg  = LAB_CONFIGS[LAB.level - 1];
  LAB.cols = cfg[0];
  LAB.rows = cfg[1];

  // Calcul de la taille de cellule pour s'adapter à la fenêtre
  var margin = 60;
  var maxW = window.innerWidth  - margin * 2;
  var maxH = window.innerHeight - margin * 2 - 80; // 80px réservés pour l'UI en bas
  LAB.cellSize = Math.floor(Math.min(maxW / LAB.cols, maxH / LAB.rows));
  LAB.cellSize = Math.max(LAB.cellSize, 10); // Taille minimale : 10px

  LAB.mazeW = LAB.cols * LAB.cellSize;
  LAB.mazeH = LAB.rows * LAB.cellSize;
  // Centrage horizontal et vertical (+20px pour décaler légèrement vers le bas)
  LAB.offsetX = Math.floor((window.innerWidth  - LAB.mazeW) / 2);
  LAB.offsetY = Math.floor((window.innerHeight - LAB.mazeH) / 2) + 20;

  LAB.canvas.width  = window.innerWidth;
  LAB.canvas.height = window.innerHeight;

  // Initialisation de la grille : toutes les parois fermées, non visitées
  // walls = [top, right, bottom, left] — true = paroi présente
  LAB.grid = [];
  for (var r = 0; r < LAB.rows; r++) {
    LAB.grid[r] = [];
    for (var c = 0; c < LAB.cols; c++) {
      LAB.grid[r][c] = { walls: [true, true, true, true], visited: false };
    }
  }

  // DFS itératif : génère un labyrinthe parfait par exploration aléatoire
  var stack = [];
  var sr = 0, sc = 0;
  LAB.grid[sr][sc].visited = true;
  stack.push([sr, sc]);

  while (stack.length > 0) {
    var cur   = stack[stack.length - 1];
    var cr    = cur[0], cc = cur[1];
    var nbrs  = labUnvisitedNeighbors(cr, cc);
    if (nbrs.length === 0) {
      stack.pop(); // Backtrack : aucun voisin non visité
    } else {
      // Choisit un voisin au hasard, abat le mur commun et l'empile
      var nb = nbrs[Math.floor(Math.random() * nbrs.length)];
      labRemoveWall(cr, cc, nb[0], nb[1]);
      LAB.grid[nb[0]][nb[1]].visited = true;
      stack.push(nb);
    }
  }

  // Définition de l'entrée (coin haut-gauche) et de la sortie (coin bas-droite)
  LAB.startCell = { r: 0, c: 0 };
  LAB.endCell   = { r: LAB.rows - 1, c: LAB.cols - 1 };
  // Ouvre les bords : mur du haut pour l'entrée, mur du bas pour la sortie
  LAB.grid[0][0].walls[0]                   = false;
  LAB.grid[LAB.rows-1][LAB.cols-1].walls[2] = false;

  LAB.startTime = Date.now();
  labUpdateUI();
}

/**
 * Retourne la liste des voisins non visités de la cellule (r, c).
 * Explore les 4 directions (haut, droite, bas, gauche) et garde
 * ceux qui sont dans les bornes de la grille et pas encore visités.
 * Utilisée par l'algorithme DFS de labBuildLevel().
 *
 * @param {number} r - Ligne de la cellule courante
 * @param {number} c - Colonne de la cellule courante
 * @returns {Array<[number, number]>} Liste de [ligne, colonne] des voisins valides
 */
function labUnvisitedNeighbors(r, c) {
  var dirs = [[-1,0],[0,1],[1,0],[0,-1]]; // haut, droite, bas, gauche
  var res  = [];
  for (var i = 0; i < dirs.length; i++) {
    var nr = r + dirs[i][0], nc = c + dirs[i][1];
    if (nr >= 0 && nr < LAB.rows && nc >= 0 && nc < LAB.cols && !LAB.grid[nr][nc].visited)
      res.push([nr, nc]);
  }
  return res;
}

/**
 * Abat le mur commun entre deux cellules adjacentes (r1,c1) et (r2,c2).
 * Met à jour les parois des deux cellules en miroir pour maintenir
 * la cohérence de la grille.
 *
 * Convention des parois : walls[0]=top, [1]=right, [2]=bottom, [3]=left.
 * Par exemple, si (r2,c2) est en dessous de (r1,c1) (dr=1) :
 *   → walls[2] de (r1,c1) et walls[0] de (r2,c2) passent à false.
 *
 * @param {number} r1 - Ligne de la première cellule
 * @param {number} c1 - Colonne de la première cellule
 * @param {number} r2 - Ligne de la deuxième cellule (adjacente)
 * @param {number} c2 - Colonne de la deuxième cellule (adjacente)
 */
function labRemoveWall(r1, c1, r2, c2) {
  var dr = r2 - r1, dc = c2 - c1;
  // Correspondance direction → index de paroi
  if (dr === -1) { LAB.grid[r1][c1].walls[0] = false; LAB.grid[r2][c2].walls[2] = false; } // voisin en haut
  if (dc ===  1) { LAB.grid[r1][c1].walls[1] = false; LAB.grid[r2][c2].walls[3] = false; } // voisin à droite
  if (dr ===  1) { LAB.grid[r1][c1].walls[2] = false; LAB.grid[r2][c2].walls[0] = false; } // voisin en bas
  if (dc === -1) { LAB.grid[r1][c1].walls[3] = false; LAB.grid[r2][c2].walls[1] = false; } // voisin à gauche
}

// ── GESTION DES ÉVÉNEMENTS ─────────────────────────────────────────

/**
 * Attache les écouteurs d'événements souris et toucher au canvas du labyrinthe.
 * Les références aux handlers sont stockées dans LAB._onMouseMove et LAB._onTouch
 * pour pouvoir être retirées proprement par labUnbindEvents().
 * L'événement touchmove est passif=false pour pouvoir appeler preventDefault()
 * et éviter le scroll de la page pendant le jeu sur mobile.
 */
function labBindEvents() {
  LAB._onMouseMove = function(e) { labOnMouseMove(e.clientX, e.clientY); };
  LAB._onTouch     = function(e) {
    e.preventDefault(); // Empêche le scroll de la page sur mobile
    if (e.touches.length > 0) labOnMouseMove(e.touches[0].clientX, e.touches[0].clientY);
  };
  LAB.canvas.addEventListener('mousemove', LAB._onMouseMove);
  LAB.canvas.addEventListener('touchmove', LAB._onTouch, { passive: false });
}

/**
 * Détache les écouteurs d'événements du canvas.
 * Appelée par labDestroy() pour nettoyer proprement les listeners
 * et éviter les fuites mémoire.
 */
function labUnbindEvents() {
  if (!LAB.canvas) return;
  LAB.canvas.removeEventListener('mousemove', LAB._onMouseMove);
  LAB.canvas.removeEventListener('touchmove', LAB._onTouch);
}

/**
 * Gestionnaire principal de mouvement souris/toucher.
 * Implémente toute la logique de progression du joueur dans le labyrinthe :
 *
 *  1. Si le labyrinthe est déjà résolu, ignore l'événement.
 *  2. Convertit les coordonnées pixel (mx,my) en coordonnées de cellule (cx,cy).
 *  3. Si la souris sort de la grille → réinitialise le chemin (labResetPath).
 *  4. Si le chemin est vide → ne commence que si la souris est sur l'entrée.
 *  5. Si même cellule que la dernière → met juste à jour px/py (tracé fin).
 *  6. Vérifie qu'il n'y a pas de mur entre la dernière cellule et la cible.
 *     Si mur → réinitialise (pénalité d'erreur).
 *  7. Détecte le backtrack (recul sur l'avant-dernière cellule) :
 *     déplace la cellule abandonnée dans explored et raccourcit le chemin.
 *  8. Sinon, ajoute la nouvelle cellule au chemin.
 *  9. Vérifie si la sortie est atteinte → déclenche labOnSolved().
 *
 * @param {number} mx - Position X de la souris/toucher en pixels (clientX)
 * @param {number} my - Position Y de la souris/toucher en pixels (clientY)
 */
function labOnMouseMove(mx, my) {
  if (LAB.solved) return;

  // Conversion coordonnées pixel → cellule de grille
  var cx = Math.floor((mx - LAB.offsetX) / LAB.cellSize);
  var cy = Math.floor((my - LAB.offsetY) / LAB.cellSize);

  // Hors des limites de la grille → reset du chemin courant
  if (cx < 0 || cx >= LAB.cols || cy < 0 || cy >= LAB.rows) {
    labResetPath();
    return;
  }

  var cell = { r: cy, c: cx };

  // Chemin vide : n'autorise le départ que depuis la cellule d'entrée
  if (LAB.path.length === 0) {
    if (cy === LAB.startCell.r && cx === LAB.startCell.c) {
      LAB.path.push({ r: cy, c: cx, px: mx, py: my });
      LAB.attempts++;
      labUpdateUI();
    }
    return;
  }

  var last = LAB.path[LAB.path.length - 1];

  // Même cellule : met à jour la position fine du pointeur (pour le tracé continu)
  if (last.r === cell.r && last.c === cell.c) {
    last.px = mx; last.py = my;
    return;
  }

  // Mouvement invalide (mur présent ou cellule non adjacente) → reset
  if (!labCanMove(last.r, last.c, cell.r, cell.c)) {
    labResetPath();
    return;
  }

  // Backtrack : le joueur revient sur l'avant-dernière cellule
  // → retire la dernière cellule du chemin et la marque comme explorée
  if (LAB.path.length >= 2) {
    var prev = LAB.path[LAB.path.length - 2];
    if (prev.r === cell.r && prev.c === cell.c) {
      LAB.explored.push({ r: last.r, c: last.c });
      LAB.path.pop();
      return;
    }
  }

  // Avance vers une nouvelle cellule accessible
  LAB.path.push({ r: cell.r, c: cell.c, px: mx, py: my });

  // Vérifie si la sortie est atteinte
  if (cell.r === LAB.endCell.r && cell.c === LAB.endCell.c) {
    LAB.solved = true;
    labOnSolved();
  }
}

/**
 * Vérifie si le joueur peut se déplacer de la cellule (r1,c1) vers (r2,c2).
 * Les conditions sont :
 *  - Les cellules doivent être strictement adjacentes (distance de Manhattan = 1).
 *  - Il ne doit pas y avoir de mur entre elles dans la direction du déplacement.
 *
 * @param {number} r1 - Ligne de la cellule de départ
 * @param {number} c1 - Colonne de la cellule de départ
 * @param {number} r2 - Ligne de la cellule cible
 * @param {number} c2 - Colonne de la cellule cible
 * @returns {boolean} Vrai si le déplacement est autorisé
 */
function labCanMove(r1, c1, r2, c2) {
  var dr = r2 - r1, dc = c2 - c1;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return false; // non adjacent
  if (dr === -1) return !LAB.grid[r1][c1].walls[0]; // vers le haut
  if (dc ===  1) return !LAB.grid[r1][c1].walls[1]; // vers la droite
  if (dr ===  1) return !LAB.grid[r1][c1].walls[2]; // vers le bas
  if (dc === -1) return !LAB.grid[r1][c1].walls[3]; // vers la gauche
  return false;
}

/**
 * Réinitialise le chemin courant du joueur après une erreur (mur touché
 * ou sortie de la grille). Toutes les cellules du chemin sont ajoutées
 * à LAB.explored (trace fantôme grise) pour rappeler au joueur les cases
 * déjà tentées. Les doublons sont évités.
 */
function labResetPath() {
  for (var i = 0; i < LAB.path.length; i++) {
    var already = false;
    // Vérifie si la cellule est déjà dans explored pour éviter les doublons
    for (var j = 0; j < LAB.explored.length; j++) {
      if (LAB.explored[j].r === LAB.path[i].r && LAB.explored[j].c === LAB.path[i].c) {
        already = true; break;
      }
    }
    if (!already) LAB.explored.push({ r: LAB.path[i].r, c: LAB.path[i].c });
  }
  LAB.path = [];
}

// ── BOUCLE DE RENDU ────────────────────────────────────────────────

/**
 * Boucle de rendu principale, appelée par requestAnimationFrame.
 * S'arrête si LAB.active est false (jeu détruit ou suspendu).
 * Délègue le dessin à labDraw() puis se reprogramme pour la frame suivante.
 */
function labLoop() {
  if (!LAB.active) return;
  labDraw();
  LAB.animFrame = requestAnimationFrame(labLoop);
}

/**
 * Dessine une frame complète du labyrinthe dans l'ordre suivant :
 *  1. Efface le canvas
 *  2. Fond général sombre (#0e0c16)
 *  3. Fond du labyrinthe légèrement plus clair (#1a1728)
 *  4. Couleurs discrètes des cellules (labDrawCells)
 *  5. Trace fantôme des cellules explorées (labDrawExplored)
 *  6. Tracé du chemin courant du joueur (labDrawPath)
 *  7. Marqueurs d'entrée et de sortie pulsants (labDrawStartEnd)
 *  8. Parois du labyrinthe (labDrawWalls)
 *  9. Animation de victoire si le labyrinthe est résolu (labDrawSolvedAnim)
 */

// ── PARTICULES FOND ÉTOILÉ ─────────────────────────────────────────
(function() {
  var _pts = [];
  var _cols = ['#c9b8f5','#b8d4f5','#e8d4ff','#d4eaff','#f5e8ff'];
  for (var i = 0; i < 60; i++) {
    _pts.push({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      s:  Math.random() * 2.5 + 1,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      col: _cols[Math.floor(Math.random() * _cols.length)],
      a:  Math.random() * 0.5 + 0.15,
      twinkleOffset: Math.random() * Math.PI * 2
    });
  }
  LAB._particles = _pts;
  LAB._particleCols = _cols;
})();

function labDrawParticles(ctx) {
  var W = LAB.canvas.width, H = LAB.canvas.height;
  var t = Date.now() / 1000;
  var pts = LAB._particles;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
    if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    // Scintillement sinusoïdal doux
    var twinkle = p.a * (0.6 + 0.4 * Math.sin(t * 1.2 + p.twinkleOffset));
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.s), Math.ceil(p.s));
  }
  ctx.globalAlpha = 1;
}
function labDraw() {
  var ctx = LAB.ctx;
  var W = LAB.canvas.width, H = LAB.canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#0e0c16';
  ctx.fillRect(0, 0, W, H);

  // Fond légèrement plus clair pour la zone du labyrinthe
  ctx.fillStyle = '#1a1728';
  ctx.fillRect(LAB.offsetX, LAB.offsetY, LAB.mazeW, LAB.mazeH);
   labDrawParticles(ctx);
  labDrawCells(ctx);
  labDrawExplored(ctx);
  labDrawPath(ctx);
  labDrawStartEnd(ctx);
  labDrawWalls(ctx);
  if (LAB.solved) labDrawSolvedAnim(ctx);
}

/**
 * Peint l'intérieur de chaque cellule avec une couleur de la palette,
 * à très faible opacité (6%). La couleur est déterminée par un hash
 * simple de (r,c) : (r*3 + c*5) % COLORS.length, ce qui donne un
 * motif coloré subtil et régulier.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas
 */
function labDrawCells(ctx) {
  for (var r = 0; r < LAB.rows; r++) {
    for (var c = 0; c < LAB.cols; c++) {
      var col = LAB.COLORS[(r * 3 + c * 5) % LAB.COLORS.length];
      ctx.globalAlpha = 0.03;
      ctx.fillStyle = col;
      ctx.fillRect(
        LAB.offsetX + c * LAB.cellSize + 1,
        LAB.offsetY + r * LAB.cellSize + 1,
        LAB.cellSize - 2,
        LAB.cellSize - 2
      );
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Dessine la trace fantôme des cellules déjà explorées par le joueur
 * (cellules ayant appartenu à un chemin erroné ou backtraqué).
 * Chaque cellule est remplie en blanc à 12% d'opacité, avec 2px de marge
 * par rapport aux bords de la cellule.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas
 */
function labDrawExplored(ctx) {
  ctx.globalAlpha = 0.12;
ctx.fillStyle = '#c9b8f5'; 
  for (var i = 0; i < LAB.explored.length; i++) {
    var e = LAB.explored[i];
    ctx.fillRect(
      LAB.offsetX + e.c * LAB.cellSize + 2,
      LAB.offsetY + e.r * LAB.cellSize + 2,
      LAB.cellSize - 4,
      LAB.cellSize - 4
    );
  }
  ctx.globalAlpha = 1;
}

/**
 * Dessine le tracé du chemin courant du joueur sous forme d'une ligne
 * connectant les centres des cellules visitées.
 * Effets visuels : glow (shadowBlur=8) et opacité légèrement réduite (85%).
 * L'épaisseur du trait est proportionnelle à la taille des cellules (18%),
 * avec un minimum de 1.5px.
 * Ne dessine rien si le chemin contient moins de 2 cellules.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas
 */
function labDrawPath(ctx) {
  if (LAB.path.length < 2) return;

  ctx.shadowColor  = LAB.pathColor;
  ctx.shadowBlur   = 8;
  ctx.strokeStyle  = LAB.pathColor;
ctx.lineWidth    = Math.max(1.5, LAB.cellSize * 0.18);
  ctx.lineCap      = 'round';
  ctx.lineJoin     = 'round';
  ctx.globalAlpha  = 0.85;

  // Trace la polyligne en passant par les centres des cellules
  ctx.beginPath();
  var p0 = LAB.path[0];
  ctx.moveTo(
    LAB.offsetX + p0.c * LAB.cellSize + LAB.cellSize / 2,
    LAB.offsetY + p0.r * LAB.cellSize + LAB.cellSize / 2
  );
  for (var i = 1; i < LAB.path.length; i++) {
    var p = LAB.path[i];
    ctx.lineTo(
      LAB.offsetX + p.c * LAB.cellSize + LAB.cellSize / 2,
      LAB.offsetY + p.r * LAB.cellSize + LAB.cellSize / 2
    );
  }
  ctx.stroke();

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}

/**
 * Dessine les parois de toutes les cellules du labyrinthe.
 * Pour chaque cellule, trace uniquement les parois présentes (walls[i] === true)
 * en dessinant des segments entre les coins de la cellule.
 * Épaisseur des parois : 10% de cellSize, minimum 1px. Opacité : 90%.
 *
 * ⚠️ NOTE : la variable `t` (Date.now()/1000) est calculée mais inutilisée.
 * Elle est probablement un vestige d'une animation de parois prévue et non implémentée.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas
 */
function labDrawWalls(ctx) {
  var cs  = LAB.cellSize;
  var ox  = LAB.offsetX, oy = LAB.offsetY;
  var t   = Date.now() / 1000; // ⚠️ inutilisé — vestige d'une animation de parois

  ctx.strokeStyle = LAB.wallColor;
  ctx.lineWidth   = Math.max(1, cs * 0.1);
  ctx.globalAlpha = 0.9;

  for (var r = 0; r < LAB.rows; r++) {
    for (var c = 0; c < LAB.cols; c++) {
      var cell = LAB.grid[r][c];
      var x1 = ox + c * cs, y1 = oy + r * cs; // coin haut-gauche
      var x2 = x1 + cs,     y2 = y1 + cs;      // coin bas-droite

      ctx.beginPath();
      if (cell.walls[0]) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); } // top
      if (cell.walls[1]) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); } // right
      if (cell.walls[2]) { ctx.moveTo(x1, y2); ctx.lineTo(x2, y2); } // bottom
      if (cell.walls[3]) { ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); } // left
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Dessine les marqueurs pulsants d'entrée et de sortie du labyrinthe.
 * L'opacité oscille sinusoïdalement dans le temps pour créer un effet de pulsation.
 *   - Entrée (coin haut-gauche) : carré vert (#6bcb77), centré dans sa cellule (50% de la taille)
 *   - Sortie (coin bas-droite)  : carré jaune/or (#ffd93d), même taille
 * Les deux marqueurs partagent la même animation de pulse.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas
 */
function labDrawStartEnd(ctx) {
  var cs = LAB.cellSize, ox = LAB.offsetX, oy = LAB.offsetY;
  var t  = Date.now() / 600; // Période de pulse (~3.8s)
  var pulse = 0.7 + 0.3 * Math.sin(t); // Oscillation [0.4, 1.0]

  // Entrée — vert
  ctx.globalAlpha = pulse;
 // Entrée — lilas doux
ctx.fillStyle   = '#b8f5e0';
ctx.shadowColor = '#b8f5e0';
  ctx.shadowBlur  = 10;
  ctx.fillRect(
    ox + LAB.startCell.c * cs + cs * 0.25,
    oy + LAB.startCell.r * cs + cs * 0.25,
    cs * 0.5, cs * 0.5
  );

  // Sortie — rose poudré
  ctx.fillStyle   = '#f5b8d4';
ctx.shadowColor = '#f5b8d4';
  ctx.fillRect(
    ox + LAB.endCell.c * cs + cs * 0.25,
    oy + LAB.endCell.r * cs + cs * 0.25,
    cs * 0.5, cs * 0.5
  );

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}

/**
 * Dessine l'animation de victoire : un voile coloré (pathColor) qui se
 * remplit progressivement sur tout le canvas après la résolution.
 * L'opacité augmente de 0 à 0.45 en ~1.1 secondes (t * 0.4, clamped à 0.45).
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas
 */
function labDrawSolvedAnim(ctx) {
  var W = LAB.canvas.width, H = LAB.canvas.height;
  var t = (Date.now() - LAB._solvedAt) / 1000; // Temps écoulé depuis la victoire
  var alpha = Math.min(0.45, t * 0.4);

  ctx.globalAlpha = alpha;
  ctx.fillStyle   = LAB.pathColor;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

// ── VICTOIRE ───────────────────────────────────────────────────────

/**
 * Appelée lorsque le joueur atteint la cellule de sortie.
 * Enregistre le timestamp de résolution (pour labDrawSolvedAnim),
 * calcule le temps écoulé, met à jour l'UI, puis affiche un panneau
 * de victoire (#lab-msg) avec :
 *   - Le résumé (niveau, temps, nombre d'essais)
 *   - Un bouton "RÉESSAYER" (labRestartLevel)
 *   - Un bouton "NIVEAU SUIVANT" ou "REJOUER" selon le niveau actuel
 *     (labNextLevel)
 * Le panneau est créé dynamiquement s'il n'existe pas encore.
 */
function labOnSolved() {
  LAB._solvedAt = Date.now();
  var elapsed = Math.floor((Date.now() - LAB.startTime) / 1000);

  labUpdateUI();

  // Crée le panneau de victoire s'il n'existe pas déjà
  var msg = document.getElementById('lab-msg');
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'lab-msg';
    msg.style.cssText = [
      'position:fixed','top:50%','left:50%',
      'transform:translate(-50%,-50%)',
      'z-index:200','font-family:monospace',
      'text-align:center','pointer-events:all',
      'background:rgba(14,12,22,0.92)',
      'border:1.5px solid #a78bfa',
      'padding:32px 48px','border-radius:4px'
    ].join(';');
    document.body.appendChild(msg);
  }

  // Bouton "Suivant" ou "Rejouer" selon qu'il reste des niveaux
  var nextBtn = LAB.level < 5
    ? '<button onclick="labNextLevel()" style="'+labBtnStyle('#6bcb77')+'">NIVEAU SUIVANT →</button>'
    : '<button onclick="labNextLevel()" style="'+labBtnStyle('#ffd93d')+'">REJOUER ✦</button>';

  msg.innerHTML = [
    '<div style="font-size:28px;color:#ffd93d;letter-spacing:6px;margin-bottom:8px">SORTIE !</div>',
    '<div style="font-size:12px;color:#a78bfa;letter-spacing:3px;margin-bottom:6px">',
      'NIVEAU ' + LAB.level + ' — ' + elapsed + 's — ' + LAB.attempts + ' essai(s)',
    '</div>',
    '<div style="margin-top:20px;display:flex;gap:12px;justify-content:center">',
      '<button onclick="labRestartLevel()" style="'+labBtnStyle('#ff6b9d')+'">↺ RÉESSAYER</button>',
      nextBtn,
    '</div>'
  ].join('');
  msg.style.display = 'block';
}

/**
 * Retourne une chaîne CSS inline pour styliser les boutons du panneau de victoire.
 * Le bouton est transparent avec une bordure et un texte de la couleur fournie,
 * en police monospace.
 *
 * @param {string} col - Couleur CSS (ex. '#6bcb77') pour la bordure et le texte
 * @returns {string} Style CSS inline complet
 */
function labBtnStyle(col) {
  return [
    'background:transparent',
    'border:1px solid ' + col,
    'color:' + col,
    'font-family:monospace',
    'font-size:11px',
    'letter-spacing:3px',
    'padding:8px 18px',
    'cursor:pointer'
  ].join(';');
}

/**
 * Passe au niveau suivant (ou revient au niveau 1 si on est au niveau 5).
 * Masque le panneau de victoire, choisit de nouvelles couleurs et
 * régénère un nouveau labyrinthe.
 */
function labNextLevel() {
  var msg = document.getElementById('lab-msg');
  if (msg) msg.style.display = 'none';
  if (LAB.level < 5) LAB.level++;
  else               LAB.level = 1; // Cycle sur le niveau 1 après le niveau 5
  labPickColors();
  labBuildLevel();
}

/**
 * Redémarre le niveau actuel à l'identique : masque le panneau de victoire
 * et régénère un nouveau labyrinthe de même taille (grille différente car
 * labBuildLevel() utilise Math.random()).
 */
function labRestartLevel() {
  var msg = document.getElementById('lab-msg');
  if (msg) msg.style.display = 'none';
  labBuildLevel();
}

// ── INTERFACE UTILISATEUR ──────────────────────────────────────────

/**
 * Met à jour l'élément #lab-ui avec les informations du niveau en cours.
 * Affiche en haut (centré) : le numéro de niveau, la légende entrée/sortie.
 * Affiche en bas (centré) : les boutons de sélection rapide de niveau (labLevelBtns).
 * Ne fait rien si l'élément #lab-ui n'existe pas dans le DOM.
 */
function labUpdateUI() {
  var ui = document.getElementById('lab-ui');
  if (!ui) return;
  var elapsed = Math.floor((Date.now() - LAB.startTime) / 1000);
  ui.innerHTML = [
    '<div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);',
    'font-family:monospace;font-size:11px;letter-spacing:4px;color:#5a4e7a;white-space:nowrap">',
    'NIVEAU <span style="color:#a78bfa">' + LAB.level + '/5</span>',
    '  —  ',
    '<span style="color:#b8f5e0">▶ ENTRÉE</span>',
    '  →  ',
    '<span style="color:#f5b8d4">■ SORTIE</span>',
    '</div>',
    // Boutons de sélection de niveau
    '<div style="position:absolute;bottom:18px;left:50%;transform:translateX(-50%);',
    'display:flex;gap:8px;align-items:center">',
    labLevelBtns(),
    '</div>'
  ].join('');
}

/**
 * Génère le HTML des 5 boutons de sélection de niveau.
 * Le bouton du niveau actuel est rempli (fond coloré, texte sombre) ;
 * les autres sont transparents avec une bordure colorée.
 * Chaque bouton appelle labSetLevel(i) au clic via un attribut onclick inline.
 *
 * @returns {string} Chaîne HTML contenant les 5 boutons
 */
function labLevelBtns() {
  var btns = '';
  for (var i = 1; i <= 5; i++) {
    var active = i === LAB.level;
    var col    = LAB.COLORS[(i - 1) * 2 % LAB.COLORS.length]; // Couleur unique par niveau
    btns += '<button onclick="labSetLevel(' + i + ')" style="' + [
      'background:' + (active ? col : 'transparent'),
      'border:1px solid ' + col,
      'color:' + (active ? '#0e0c16' : col),
      'font-family:monospace',
      'font-size:10px',
      'letter-spacing:2px',
      'padding:5px 12px',
      'cursor:pointer',
      'pointer-events:all'
    ].join(';') + '">' + i + '</button>';
  }
  return btns;
}

/**
 * Sélectionne directement un niveau par son numéro (1 à 5).
 * Masque le panneau de victoire s'il est visible, choisit de nouvelles
 * couleurs et régénère le labyrinthe au niveau choisi.
 *
 * @param {number} n - Numéro du niveau cible (1–5)
 */
function labSetLevel(n) {
  LAB.level = n;
  labPickColors();
  labBuildLevel();
  var msg = document.getElementById('lab-msg');
  if (msg) msg.style.display = 'none';
}

// ── DESTRUCTION ────────────────────────────────────────────────────

// ⚠️ ANOMALIE : labDestroy est définie DEUX FOIS.
// La première définition (ci-dessous) retire le canvas, l'UI et le message
// par leur ID. La seconde (après) retire uniquement le canvas via LAB.canvas.
// La deuxième définition écrase la première en JavaScript — seule la deuxième
// est réellement exécutée. La première devrait être supprimée ou fusionnée.

/**
 * Détruit le labyrinthe : désactive LAB, détache les events, annule la boucle
 * d'animation et retire tous les éléments DOM créés (#lab-canvas, #lab-ui, #lab-msg).
 * (Les deux définitions précédemment dupliquées ont été fusionnées ici.)
 */
function labDestroy() {
  LAB.active = false;
  labUnbindEvents();
  if (LAB.animFrame) { cancelAnimationFrame(LAB.animFrame); LAB.animFrame = null; }
  if (LAB.canvas) { LAB.canvas.remove(); LAB.canvas = null; LAB.ctx = null; }
  var u = document.getElementById('lab-ui');  if (u) u.remove();
  var m = document.getElementById('lab-msg'); if (m) m.remove();
}

// ── NAVIGATION (MENU / JEU) ────────────────────────────────────────
// Ces fonctions gèrent la transition entre l'écran d'intro et le jeu.
// Déplacées depuis pixel-creature.js où elles contenaient du code labyrinthe.

/**
 * Lance le jeu Labyrinthe en masquant l'écran d'introduction.
 * Affiche le bouton retour et le titre, puis initialise le labyrinthe
 * avec un léger délai pour laisser la transition CSS se terminer.
 */
function startGame() {
  var intro = document.getElementById('intro-screen');
  intro.classList.add('hidden');
  setTimeout(function(){ intro.style.display='none'; }, 800);
  document.getElementById('back-btn').style.display = 'block';
  document.getElementById('game-title').style.display = 'block';
  setTimeout(function(){ labInit(); }, 850);
}

/**
 * Retourne au menu principal depuis le jeu Labyrinthe.
 * Détruit le labyrinthe actif (labDestroy), masque le bouton retour
 * et le titre, puis réaffiche l'écran d'introduction avec une
 * transition d'opacité.
 */
function backToMenu() {
  if (LAB && LAB.active) labDestroy();

  document.getElementById('game-title').style.display = 'none';
  var intro = document.getElementById('intro-screen');
  intro.style.display = 'flex';
  intro.style.opacity = '0';
  document.getElementById('back-btn').style.display = 'none';
  setTimeout(function(){ intro.style.opacity='1'; intro.style.transition='opacity 0.6s'; }, 10);
  intro.classList.remove('hidden');
}
