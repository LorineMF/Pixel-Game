// ═══════════════════════════════════════════════════════════════════
//  PIXEL CREATURE — pixel-creature.js
//  Lorine Magnin-Feysot
//  Moteur p5.js : génération procédurale d'organismes pixel-art
//  interactifs, avec système d'énergie, niveaux et galerie.
// ═══════════════════════════════════════════════════════════════════

// ── Variables de mise en page ──────────────────────────────────────
// CW/CH : dimensions du canvas.  UI_W : largeur du panneau latéral.
// ART_X/ART_W : position et largeur de la zone de dessin.
// UI_DRAG : vrai si l'utilisateur est en train de redimensionner l'UI.
// UI_W_MIN/MAX : limites de redimensionnement.
// UI_HANDLE_W : épaisseur de la poignée de redimensionnement.
// MARGIN : marge en pixels autour de la zone de dessin.
var CW,CH,UI_W=220,ART_X,ART_W,UI_DRAG=false,UI_W_MIN=140,UI_W_MAX=380,UI_HANDLE_W=8;
var MARGIN=38;

// ── Définition des espèces ─────────────────────────────────────────
// Chaque espèce a : une symétrie (radial/vertical/chaos), des types
// d'appendices, un niveau de rondeur, une forme de base et un comportement
// d'animation.
var ESPECES={
  "Brume":  {symmetry:"radial",   appendices:["membrane","bulle"],       roundness:0.92, shape:"ellipse_h", behavior:"trembler"},
  "Astre":  {symmetry:"radial",   appendices:["antenne","rayon"],         roundness:0.7,  shape:"square", behavior:"ondulant"},
  "Mycene": {symmetry:"vertical", appendices:["branche","ramification"],  roundness:0.45, shape:"branch", behavior:"fragmente"},
  "Vortex": {symmetry:"chaos",    appendices:["tentacule","satellite"],   roundness:0.3,  shape:"spiral", behavior:"rotatif"}
};

var ESPECE_NAMES=["Brume","Astre","Mycene","Vortex"];

// Mots neutres utilisés pour composer les noms poétiques locaux.
var NAMES_NEUTRAL=["Reve","Glacier","Cascade","Soleil","Harmonie","Prisme","Onde","Sphere"];

// Adjectifs associés à chaque palette, pour la génération de noms poétiques.
var ADJECTIVES_PAL={
  "Rose dragee":      ["Rose","Tendre","Doux","Nacre"],
  "Bleu glacier":     ["Glacial","Froid","Azure","Arctique"],
  "Couleurs joyeuses":["Arc-en-ciel","Joyeux","Vif","Prismatique"],
  "Mimosa":           ["Dore","Solaire","Chaud","Ambre"],
  "Lavande":          ["Lavande","Violet","Celeste","Nocturne"],
  "Peche":            ["Peche","Rose","Cuivre","Chaleureux"],
  "Triste blob":      ["Pale","Terne","Gris","Brumeux"],
  "Menthe":           ["Menthe","Aqueux","Frais","Limpide"]
};

// ── Stades d'évolution ─────────────────────────────────────────────
// Chaque stade est atteint à partir d'un level minimum.
// Le stade courant détermine la complexité visuelle de l'organisme
// (nombre d'appendices, orbitaux, etc.).
var STADES=[
  {name:"Germe",    minLevel:1,  desc:"Cellule simple, noyau naissant"},
  {name:"Bourgeon", minLevel:3,  desc:"Membrane plus epaisse, corps qui s'eveille"},
  {name:"Echo",     minLevel:5,  desc:"Premiers appendices organiques"},
  {name:"Vortex",   minLevel:8,  desc:"Satellites orbitaux, pulsions intenses"},
  {name:"Entite",   minLevel:12, desc:"Structure complexe et ramifiee"},
  {name:"Mythe",    minLevel:16, desc:"Organisme spectaculaire, forme rare"}
];

// Tableaux des palettes (initialisés par initPalettes).
var PALETTES={};
var PAL_NAMES=["Rose dragee","Bleu glacier","Couleurs joyeuses","Mimosa","Lavande","Peche","Triste blob","Menthe"];
var BG_NAMES=["Blanc","Creme","Grille","Perle"];

// ── État global de l'application ───────────────────────────────────
// `st` contient toutes les données de l'organisme actif, de l'UI
// et du système de progression.
var st={
  palName:"Lavande",bgIdx:0,masse:120,     // Palette, fond, taille de masse
  formSeed:12345,morphologie:20,artNo:1,   // Graine aléatoire, zoom pixel, compteur export
  poeticName:"",                           // Nom affiché de la créature
  espece:"Brume",favs:[],view:"create",    // Espèce active, favoris, vue courante
  slider:null,                             // Slider en cours de drag
  organism:null,animFrame:0,               // Données de l'organisme, compteur d'animation
  energie:0,energieMax:100,level:1,        // Système d'énergie et de level
  totalEclatsAbsorbes:0,ageFrames:0,       // Stats : éclats collectés, âge en frames
  eclats:[],                               // Éclats d'énergie actifs à l'écran
  lastEclatSpawn:0,nameEnriching:false,    // Dernière frame de spawn, flag enrichissement API
  ejectedRecently:{},transitPixels:[]      // Pixels éjectés récemment, pixels en transit
};

// Registres internes : positions des éléments UI pour la détection de clic.
var secY={},sliderReg={},actionBtns={},palRects=[],bgRects=[],especeRects=[];
var lastPulseFrame=0;

// ── NOMS ───────────────────────────────────────────────────────────

/**
 * Génère un nom poétique localement (sans API) en combinant un adjectif
 * lié à la palette et un mot neutre, suivi d'un numéro aléatoire.
 * Utilisé comme nom par défaut ou de secours.
 *
 * @param {string} palName - Nom de la palette active (clé de ADJECTIVES_PAL)
 * @returns {string} Nom du type "Glacial Prisme #42"
 */
function generatePoetName(palName){
  var adjs=ADJECTIVES_PAL[palName]||["Mystique","Etrange","Obscur","Radieux"];
  var adj=adjs[Math.floor(Math.random()*adjs.length)];
  var pool=NAMES_NEUTRAL;
  var name=pool[Math.floor(Math.random()*pool.length)];
  return adj+" "+name+" #"+(Math.floor(Math.random()*100)+1);
}

/**
 * Appelle l'API Claude (Anthropic) pour générer un nom poétique unique
 * adapté à l'espèce, à la palette et au stade de la créature.
 * En cas d'échec réseau ou de réponse invalide, retourne null
 * (le nom local est alors conservé).
 *
 * ATTENTION : cette fonction expose la clé API côté client — à sécuriser
 * en production via un proxy serveur.
 *
 * @param {Object} creature - Objet avec les champs espece, palName, stadeName
 * @returns {Promise<string|null>} Nom enrichi (2-4 mots) ou null si échec
 */
async function enrichName(creature){
  try{
    var prompt="Nom poetique unique pour un organisme microscopique (radiolaire, amibe). Espece: "+creature.espece+
      ". Palette: "+creature.palName+
      ". Stade: "+creature.stadeName+". Reponds UNIQUEMENT avec 2 a 4 mots francais poetiques, sans ponctuation.";
    var resp=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
        messages:[{role:"user",content:prompt}]})
    });
    var data=await resp.json();
    var raw=data.content&&data.content[0]&&data.content[0].text;
    if(raw){var name=raw.trim().replace(/["""''\.!?\n]/g,"").trim();if(name.length>3&&name.length<60)return name;}
  }catch(e){}
  return null;
}

// ── PALETTES ───────────────────────────────────────────────────────

/**
 * Initialise toutes les palettes de couleurs dans l'objet PALETTES.
 * Chaque palette est un tableau de 200 couleurs RGB [r,g,b].
 * - Les palettes simples sont des dégradés linéaires (generateGradient).
 * - "Couleurs joyeuses" utilise un arc-en-ciel pastel (generateRainbowPastel).
 */
function initPalettes(){
  var palData={
    "Rose dragee":       {start:[252,220,225],end:[210,100,120]},
    "Bleu glacier":      {start:[210,232,248],end:[90,148,192]},
    "Couleurs joyeuses": {start:[255,200,220],end:[160,200,255],multi:true},
    "Mimosa":            {start:[255,245,195],end:[235,192,70]},
    "Lavande":           {start:[228,215,248],end:[145,122,212]},
    "Peche":             {start:[255,225,205],end:[230,142,108]},
    "Triste blob":       {start:[245,245,248],end:[165,165,175]},
    "Menthe":            {start:[195,242,228],end:[82,180,152]}
  };
  for(var n in palData){
    if(palData[n].multi){
      PALETTES[n]=generateRainbowPastel(200);
    }else{
      PALETTES[n]=generateGradient(palData[n].start,palData[n].end,200);
    }
  }
}

/**
 * Génère un tableau de couleurs arc-en-ciel pastel en interpolant
 * entre une liste de teintes (hues) prédéfinies.
 * La saturation et la luminosité sont fixées pour un rendu doux.
 *
 * @param {number} steps - Nombre de couleurs à générer
 * @returns {Array<[number,number,number]>} Tableau de couleurs RGB
 */
function generateRainbowPastel(steps){
  var p=[];
  var hues=[0,30,60,100,160,200,240,280,320,360];
  for(var i=0;i<steps;i++){
    var t=i/(steps-1);
    var hIdx=t*(hues.length-1);
    var h1=Math.floor(hIdx),h2=Math.min(h1+1,hues.length-1);
    var frac=hIdx-h1;
    var h=hues[h1]+(hues[h2]-hues[h1])*frac;
    var rgb=hslToRgb(h/360,0.55,0.82);
    p.push([rgb[0],rgb[1],rgb[2]]);
  }
  return p;
}

/**
 * Convertit une couleur HSL (teinte, saturation, luminosité) en RGB.
 * Utilise l'algorithme standard avec la fonction auxiliaire hue2rgb.
 *
 * @param {number} h - Teinte [0, 1]
 * @param {number} s - Saturation [0, 1]
 * @param {number} l - Luminosité [0, 1]
 * @returns {[number,number,number]} Tableau [r, g, b] avec valeurs [0, 255]
 */
function hslToRgb(h,s,l){
  var r,g,b;
  if(s===0){r=g=b=l;}else{
    function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;}
    var q=l<0.5?l*(1+s):l+s-l*s,p2=2*l-q;
    r=hue2rgb(p2,q,h+1/3);g=hue2rgb(p2,q,h);b=hue2rgb(p2,q,h-1/3);
  }
  return[Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}

/**
 * Génère un dégradé linéaire entre deux couleurs RGB en `steps` étapes.
 * Interpolation linéaire composante par composante.
 *
 * @param {[number,number,number]} s - Couleur de départ [r, g, b]
 * @param {[number,number,number]} e - Couleur d'arrivée [r, g, b]
 * @param {number} steps - Nombre de couleurs dans le dégradé
 * @returns {Array<[number,number,number]>} Tableau de couleurs RGB
 */
function generateGradient(s,e,steps){
  var p=[];
  for(var i=0;i<steps;i++){var t=i/(steps-1);p.push([Math.floor(s[0]+(e[0]-s[0])*t),Math.floor(s[1]+(e[1]-s[1])*t),Math.floor(s[2]+(e[2]-s[2])*t)]);}
  return p;
}

// ── STADES ─────────────────────────────────────────────────────────

/**
 * Retourne l'objet stade correspondant au level actuel de la créature.
 * Parcourt STADES et retourne le dernier dont minLevel <= st.level.
 *
 * @returns {Object} Stade actuel {name, minLevel, desc}
 */
function getCurrentStade(){var s=STADES[0];for(var i=0;i<STADES.length;i++)if(st.level>=STADES[i].minLevel)s=STADES[i];return s;}

/**
 * Retourne l'index (0-based) du stade actuel dans le tableau STADES.
 * Utilisé pour moduler la complexité visuelle (appendices, orbitaux...).
 *
 * @returns {number} Index du stade actuel
 */
function getStadeIndex(){return STADES.indexOf(getCurrentStade());}

/**
 * Calcule le centre de la créature en pixels, ancré sur la grille.
 * Le centre est arrondi au multiple de cellSize (st.morphologie) le plus
 * proche du centre géométrique de la zone de dessin. Cela garantit que
 * tous les pixels de l'organisme s'alignent parfaitement sur la grille.
 *
 * @returns {{cx: number, cy: number}} Coordonnées du centre en pixels
 */
function getCreatureCenter(){
  var cellSize=st.morphologie;
  var zoneX=ART_X+MARGIN;
  var zoneW=ART_W-MARGIN*2;
  var zoneY=MARGIN;
  var zoneH=CH-MARGIN*2;
  // Centre en pixels, arrondi au multiple de cellSize pour aligner sur la grille
  var rawCx=zoneX+zoneW/2;
  var rawCy=zoneY+zoneH/2;
  // Ancre cx/cy sur la grille (multiple de cellSize depuis l'origine)
  var cx=Math.round(rawCx/cellSize)*cellSize;
  var cy=Math.round(rawCy/cellSize)*cellSize;
  return {cx:cx,cy:cy};
}

// ── INITIALISATION P5.JS ───────────────────────────────────────────

/**
 * Fonction d'initialisation p5.js, appelée une seule fois au démarrage.
 * Crée le canvas, configure la densité de pixels (Retina), la police,
 * calcule la mise en page, génère les palettes, l'organisme initial
 * et charge les favoris depuis le localStorage.
 */
function setup(){
  CW=windowWidth;CH=windowHeight;
  var cnv=createCanvas(CW,CH);
  pixelDensity(window.devicePixelRatio||1);
  textFont("monospace");updateLayout();initPalettes();generateOrganism();loadFavs();
}

/**
 * Appelée par p5.js à chaque redimensionnement de la fenêtre.
 * Met à jour les dimensions du canvas et recalcule la mise en page.
 */
function windowResized(){CW=windowWidth;CH=windowHeight;resizeCanvas(CW,CH);updateLayout();}

/**
 * Recalcule la position de la zone de dessin (ART_X, ART_W)
 * en fonction de la largeur actuelle du panneau UI (UI_W).
 */
function updateLayout(){ART_X=UI_W;ART_W=CW-UI_W;}

/**
 * Calcule le décalage d'animation (offsetX, offsetY) d'un pixel
 * en fonction du comportement de l'espèce et du temps écoulé.
 * Chaque comportement produit un mouvement distinct :
 *   - "trembler"  : vibration sinusoïdale rapide sur les deux axes
 *   - "ondulant"  : vague horizontale dépendante de la position Y
 *   - "fragmente" : oscillation chaotique sur les deux axes
 *   - "rotatif"   : rotation orbitale autour du centre (Vortex)
 *
 * @param {number} px - Position X du pixel dans la grille (relatif au centre)
 * @param {number} py - Position Y du pixel dans la grille (relatif au centre)
 * @param {string} behavior - Comportement de l'espèce
 * @param {number} time - Temps courant en secondes (Date.now()/1000)
 * @returns {{x: number, y: number}} Décalage en pixels
 */
function getPixelOffset(px, py, behavior, time) {
  var offsetX = 0, offsetY = 0;

  if(behavior === "trembler") {
    offsetX = Math.sin(time * 8 + px * 0.3) * 0.4;
    offsetY = Math.cos(time * 9 + py * 0.3) * 0.4;
  }
  else if(behavior === "ondulant") {
    var waveOffset = Math.sin(py * 0.2 - time * 3) * 0.6;
    offsetX = waveOffset;
  }
  else if(behavior === "fragmente") {
    offsetX = Math.sin(time * 5 + px) * 0.35;
    offsetY = Math.cos(time * 5 + py) * 0.35;
  }
  else if(behavior === "rotatif") {
    var dx = px;
    var dy = py;
    var angle = Math.atan2(dy, dx) + time * 0.8;
    var dist = Math.sqrt(dx*dx + dy*dy);
    offsetX = Math.cos(angle) * dist - dx;
    offsetY = Math.sin(angle) * dist - dy;
  }

  return {x: offsetX, y: offsetY};
}

// ── BOUCLE PRINCIPALE ──────────────────────────────────────────────

/**
 * Boucle de rendu p5.js, exécutée ~60 fois par seconde.
 * Gère le curseur, incrémente les compteurs, dessine fond/scène/UI,
 * et contrôle le spawn des éclats d'énergie (au plus 2 simultanément,
 * à une cadence inversement proportionnelle à la morphologie).
 */
function draw(){
  background(14,12,22);
  var onHandle=mouseX>=UI_W-UI_HANDLE_W&&mouseX<=UI_W+UI_HANDLE_W;
  if(UI_DRAG){cursor('ew-resize');}
  else if(onHandle){cursor('col-resize');}
  else{cursor(ARROW);}
  st.ageFrames++;st.animFrame++;
  drawBgPanel();
  if(st.view==="gallery")drawGallery();
  else drawOrganismScene();
  drawUI();drawUIHandle();
  if(st.view==="create"){
    // Cadence de spawn : lente pour les petites cellules, rapide pour les grandes
    var rate=map(st.morphologie,3,60,30,90);
    if(st.eclats.length<2||frameCount-st.lastEclatSpawn>rate){
      while(st.eclats.length<2)spawnEclat();
      st.lastEclatSpawn=frameCount;
    }
  }
  // Décrémente les compteurs de pixels éjectés récemment (anti-doublon)
  for(var k in st.ejectedRecently){st.ejectedRecently[k]--;if(st.ejectedRecently[k]<=0)delete st.ejectedRecently[k];}
}

// ── GÉNÉRATION DE L'ORGANISME ──────────────────────────────────────

/**
 * Génère un nouvel organisme pixel-art à partir des paramètres courants.
 * Processus en plusieurs étapes :
 *  1. Détermine la morphologie (taille du corps, épaisseur de membrane,
 *     nombre d'appendices) selon l'espèce et le stade.
 *  2. Remplit une grille 60×60 en testant chaque pixel contre la forme
 *     de base (ellipse, carré, spirale…) modulée par du bruit de Perlin
 *     et la symétrie de l'espèce.
 *  3. Ajoute les appendices (antennes, tentacules, branches…) en rayonnant
 *     depuis le corps avec des angles calculés selon la symétrie.
 *  4. Ajoute des orbitaux (pixels satellites) aux stades avancés.
 *  5. Mappe les types de cellules (noyau=1, corps=2, membrane=3,
 *     appendice=4, orbital=5) sur des couleurs de palette.
 *  6. Prépare les appendices animés (liste séparée pour l'animation fluide).
 *  7. Réinitialise l'état de l'organisme (énergie, éclats, nom...).
 *
 * Types de cellules :
 *   1 = noyau central  |  2 = corps  |  3 = membrane
 *   4 = appendice      |  5 = orbital/satellite  |  6 = pixel de croissance (level up)
 */
function generateOrganism(){
  randomSeed(st.formSeed);noiseSeed(st.formSeed+1000);
  var esp=ESPECES[st.espece];
  var pal=PALETTES[st.palName];
  var stadeIdx=getStadeIndex();
  var cellSize=st.morphologie;
  var bodyRadius=4+Math.floor(st.masse/30);
  bodyRadius=Math.max(3,Math.min(18,bodyRadius));
  var membraneThick=1+Math.floor(stadeIdx*0.5);membraneThick=Math.min(membraneThick,3);
  var appendiceCount=Math.max(0,stadeIdx-1);
  if(st.espece==="Vortex")appendiceCount+=2;
  if(st.espece==="Astre")appendiceCount+=1;

  var GS=60,half=Math.floor(GS/2);
  var grid=[];
  for(var gy=0;gy<GS;gy++){grid[gy]=[];for(var gx=0;gx<GS;gx++)grid[gy][gx]=0;}

  var symmetry=esp.symmetry;
  var shapeType=esp.shape;
  var chaosAmt=(st.espece==="Vortex")?0.85:(st.espece==="Astre")?0.1:0.45;

  // Ratios hRatio/vRatio déforment l'ellipse horizontalement pour "Brume"
  var hRatio=1.0,vRatio=1.0;
  if(shapeType==="ellipse_h"){hRatio=1.55;vRatio=0.65;}

  // ── Étape 1 : remplissage du corps ────────────────────────────────
  for(var y=-bodyRadius;y<=bodyRadius;y++){
    for(var x=-bodyRadius;x<=bodyRadius;x++){
      var dist_r;
      if(shapeType==="ellipse_h"){
        dist_r=Math.sqrt((x/hRatio)*(x/hRatio)+(y/vRatio)*(y/vRatio));
        dist_r*=Math.min(hRatio,vRatio);
      }else if(shapeType==="square"){
        dist_r=Math.max(Math.abs(x),Math.abs(y))*0.88;
      }else if(shapeType==="spiral"){
        dist_r=Math.sqrt(x*x+y*y);
      }else{
        dist_r=Math.sqrt(x*x+y*y);
      }
      if(dist_r>bodyRadius+0.5)continue;
      var angle=Math.atan2(y,x);
      var noiseVal=noise((x+half)*0.18,(y+half)*0.18);
      // Le bruit de Perlin distord le contour selon le niveau de chaos de l'espèce
      var distort=(noiseVal-0.5)*chaosAmt*bodyRadius*0.7;
      var shapeVal=dist_r;
      if(symmetry==="radial"){
        // Lobes sinusoïdaux pour Brume et Astre
        var lobes=(st.espece==="Brume")?4:(st.espece==="Astre")?4:6;
        var lobScale=(st.espece==="Astre")?0.28:0.18;
        var lobDist=Math.cos(angle*lobes)*bodyRadius*lobScale;
        shapeVal=dist_r-lobDist+distort;
      }else if(symmetry==="vertical"){
        // Symétrie gauche/droite pour Mycene
        var ax=Math.abs(x);
        shapeVal=Math.sqrt(ax*ax+y*y)+distort*0.6;
        shapeVal-=Math.abs(x)*0.08;
      }else{
        // Chaos + spirale pour Vortex
        var spiralBias=Math.sin(angle*2+dist_r*0.5)*bodyRadius*0.25;
        shapeVal=dist_r+distort*1.8+spiralBias;
      }
      if(shapeVal>bodyRadius+0.5)continue;
      var gx2=x+half,gy2=y+half;
      if(gx2<0||gx2>=GS||gy2<0||gy2>=GS)continue;
      // Pour la symétrie verticale, on écrit aussi le pixel mirroir
      if(symmetry==="vertical"){
        var mx2=GS-1-gx2;
        if(mx2>=0&&mx2<GS&&grid[gy2][mx2]===0){
          var ct2=shapeVal<1.5?1:shapeVal>bodyRadius-membraneThick?3:2;
          grid[gy2][mx2]=ct2;
        }
      }
      var cellType=shapeVal<1.5?1:shapeVal>bodyRadius-membraneThick?3:2;
      if(grid[gy2][gx2]===0||cellType<grid[gy2][gx2])grid[gy2][gx2]=cellType;
    }
  }

  // ── Étape 2 : ajout des appendices ───────────────────────────────
  if(appendiceCount>0){
    var baseAngles=[];
    if(symmetry==="radial"||symmetry==="chaos"){
      // Angles répartis uniformément autour du corps avec légère perturbation
      for(var ai=0;ai<appendiceCount;ai++){
        baseAngles.push((TWO_PI/appendiceCount)*ai+random(-0.3,0.3)*chaosAmt);
      }
    }else{
      // Paires symétriques pour symétrie verticale
      var pairs=Math.ceil(appendiceCount/2);
      for(var ai2=0;ai2<pairs;ai2++){
        var baseAng=(PI/(pairs+1))*(ai2+1)-HALF_PI;
        baseAngles.push(baseAng+random(-0.2,0.2));
        baseAngles.push(PI-baseAng+random(-0.2,0.2));
      }
    }
    for(var ai3=0;ai3<baseAngles.length;ai3++){
      var appAngle=baseAngles[ai3];
      var appLength=2+Math.floor(random(stadeIdx,stadeIdx+3));
      var appType=esp.appendices[Math.floor(random(esp.appendices.length))];
      var spiralOffset=(st.espece==="Vortex")?(ai3*TWO_PI/baseAngles.length*0.4):0;
      // Trace chaque segment de l'appendice depuis le corps vers l'extérieur
      for(var seg=1;seg<=appLength;seg++){
        var spiralAngle=(st.espece==="Vortex")?(appAngle+spiralOffset+seg*0.22):appAngle;
        var segAngle=spiralAngle+(appType==="tentacule"?Math.sin(seg*0.8)*0.4*chaosAmt:0);
        var sr=bodyRadius+seg;
        var sx=Math.round(half+Math.cos(segAngle)*sr);
        var sy=Math.round(half+Math.sin(segAngle)*sr);
        if(sx>=0&&sx<GS&&sy>=0&&sy<GS){
          grid[sy][sx]=4;
          var thick=Math.max(0,1-seg*(1.0/appLength));
          // Branches/ramifications : épaississement perpendiculaire
          if((appType==="branche"||appType==="ramification")&&thick>0.3){
            var perpA=segAngle+HALF_PI;
            var px1=Math.round(sx+Math.cos(perpA));var py1=Math.round(sy+Math.sin(perpA));
            if(px1>=0&&px1<GS&&py1>=0&&py1<GS&&grid[py1][px1]===0)grid[py1][px1]=4;
            if(symmetry==="vertical"){var mx3=GS-1-sx;if(mx3>=0&&mx3<GS&&grid[sy][mx3]===0)grid[sy][mx3]=4;}
          }
          // Satellites : petit cluster de pixels au bout des appendices
          if(appType==="satellite"&&seg===appLength){
            for(var dy2=-1;dy2<=1;dy2++)for(var dx2=-1;dx2<=1;dx2++){
              if(sx+dx2>=0&&sx+dx2<GS&&sy+dy2>=0&&sy+dy2<GS&&grid[sy+dy2][sx+dx2]===0)grid[sy+dy2][sx+dx2]=5;
            }
          }
        }
      }
    }
  }

  // ── Étape 3 : orbitaux aux stades avancés (stadeIdx >= 5) ────────
  if(stadeIdx>=5){
    var orbCount=2+Math.floor(random(2));
    for(var oi=0;oi<orbCount;oi++){
      var orbAngle=TWO_PI*oi/orbCount+random(0.5);
      var orbR=bodyRadius+4+Math.floor(random(3));
      var ox2=Math.round(half+Math.cos(orbAngle)*orbR);
      var oy2=Math.round(half+Math.sin(orbAngle)*orbR);
      if(ox2>=1&&ox2<GS-1&&oy2>=1&&oy2<GS-1){
        for(var dy3=-1;dy3<=1;dy3++)for(var dx3=-1;dx3<=1;dx3++){
          if(grid[oy2+dy3][ox2+dx3]===0)grid[oy2+dy3][ox2+dx3]=5;
        }
      }
    }
  }

  // ── Étape 4 : conversion grille → tableau de pixels avec couleurs ─
  // Chaque type de cellule est mappé sur une plage de la palette :
  //   noyau(1) → début foncé | corps(2) → milieu | membrane(3) → clair
  //   appendice(4) → milieu-clair | orbital(5) → début
  var pixels_out=[];var pal_len=pal.length;
  for(var py2=0;py2<GS;py2++){
    for(var px2=0;px2<GS;px2++){
      var cell=grid[py2][px2];if(cell===0)continue;
      var colorIdx;
      if(cell===1)colorIdx=Math.floor(pal_len*0.05);
      else if(cell===2)colorIdx=Math.floor(pal_len*0.35+random(pal_len*0.25));
      else if(cell===3)colorIdx=Math.floor(pal_len*0.65+random(pal_len*0.15));
      else if(cell===4)colorIdx=Math.floor(pal_len*0.55+random(pal_len*0.2));
      else colorIdx=Math.floor(pal_len*0.15+random(pal_len*0.1));
      colorIdx=Math.max(0,Math.min(pal_len-1,colorIdx));
      pixels_out.push({gx:px2-half,gy:py2-half,type:cell,colorIdx:colorIdx});
    }
  }

  // ── Étape 5 : appendices animés (liste séparée pour l'animation) ──
  // Ces appendices sont redessinés à chaque frame avec des positions
  // calculées dynamiquement (ondes, spirales...).
  var animApp=[];
  if(appendiceCount>0){
    var aCount2=Math.min(appendiceCount,8);
    for(var aai=0;aai<aCount2;aai++){
      var ang=(TWO_PI/aCount2)*aai+random(-0.4,0.4)*chaosAmt;
      var len2=2+stadeIdx+Math.floor(random(2));
      animApp.push({
        angle:ang,length:len2,phase:random(TWO_PI),speed:0.02+random(0.02),
        wavAmp:0.15+chaosAmt*0.3,type:esp.appendices[Math.floor(random(esp.appendices.length))],
        colorIdx:Math.floor(pal_len*0.55),
        spiralBase:(st.espece==="Vortex")?(aai*TWO_PI/aCount2*0.4):0
      });
    }
  }

  // Stocke l'organisme et réinitialise l'état
  st.organism={pixels:pixels_out,grid:grid,gridSize:GS,bodyRadius:bodyRadius,
    cellSize:cellSize,animAppendices:animApp,stadeIdx:stadeIdx,espece:st.espece};
  st.poeticName=generatePoetName(st.palName);
  st.transitPixels=[];st.ejectedRecently={};
  st.energie=0;st.level=1;st.totalEclatsAbsorbes=0;
  st.ageFrames++;st.eclats=[];st.lastEclatSpawn=0;
  st.nameEnriching=false;st.animFrame=0;
}


// ── RENDU DE L'ORGANISME ───────────────────────────────────────────

/**
 * Dessine la scène complète de l'organisme :
 *  1. Halo d'aura pulsant autour du corps
 *  2. Appendices animés (drawAnimAppendices)
 *  3. Corps pixel par pixel avec animation selon le comportement de l'espèce
 *     - Type 1 (noyau) : pulsation et reflet blanc
 *     - Type 2 (corps) : reflet subtil
 *     - Type 3 (membrane) : coins plus arrondis
 *     - Type 5 (orbital) : halo supplémentaire
 *     - Type 6 (croissance) : pixel ajouté au level up
 *  4. Pixels en transit (drawTransitPixels)
 *  5. Éclats d'énergie (drawEclats)
 *  6. Label d'informations (drawLabel)
 *
 * Les pixels sont placés pixel-perfect sur la grille ; seuls les appendices
 * animés peuvent déborder de la zone.
 */
function drawOrganismScene(){
  if(!st.organism)return;
  var org=st.organism,pal=PALETTES[st.palName],cellSize=st.morphologie;
  var stadeIdx=getStadeIndex(),t=st.animFrame;

  var ctr=getCreatureCenter();
  var cx=ctr.cx,cy=ctr.cy;

  // Halo d'aura (3 couches concentriques semi-transparentes)
  var auraR=org.bodyRadius*cellSize*2.2+Math.sin(t*0.015)*4;
  var auraCol=pal[Math.floor(pal.length*0.3)];
  noStroke();
  for(var ai=3;ai>0;ai--){fill(auraCol[0],auraCol[1],auraCol[2],8*ai);ellipse(cx,cy,auraR*(1+ai*0.3),auraR*(1+ai*0.3));}

  drawAnimAppendices(org,cx,cy,cellSize,pal,t);

  var gap=Math.max(1,Math.floor(cellSize*0.1));
  var sz=cellSize-gap;
  noStroke();
  var behavior=ESPECES[st.espece].behavior;
  var time=Date.now()*0.001;

  for(var pi=0;pi<org.pixels.length;pi++){
    var pxl=org.pixels[pi];
    // Décalage d'animation selon le comportement de l'espèce
    var offset=getPixelOffset(pxl.gx, pxl.gy, behavior, time);
    var ex=cx+pxl.gx*cellSize+offset.x;
    var ey=cy+pxl.gy*cellSize+offset.y;

    var col=pal[Math.min(Math.max(pxl.colorIdx,0),pal.length-1)];

    // Noyau : pulsation lente + halo + reflet blanc
    if(pxl.type===1){
      var pulse=1+Math.sin(t*0.04)*0.22;
      fill(col[0],col[1],col[2],40);ellipse(ex,ey,cellSize*2.5*pulse,cellSize*2.5*pulse);
      fill(col[0],col[1],col[2],255);var nsz=sz*pulse;rect(ex-nsz/2,ey-nsz/2,nsz,nsz,3);
      fill(255,255,255,180);rect(ex-nsz*0.3,ey-nsz*0.3,nsz*0.35,nsz*0.25,2);
      continue;
    }

    // Type 6 : pixels de croissance ajoutés au level up (rendu simple)
    if(pxl.type===6){
  fill(col[0],col[1],col[2],255);
  rect(ex-sz/2,ey-sz/2,sz,sz,2);
  fill(255,255,255,28);
  rect(ex-sz/2,ey-sz/2,sz*0.4,sz*0.3,1);
  continue;
}

    fill(col[0],col[1],col[2],255);
    rect(ex-sz/2,ey-sz/2,sz,sz,pxl.type===3?1:2);
    if(pxl.type===2){fill(255,255,255,28);rect(ex-sz/2,ey-sz/2,sz*0.4,sz*0.3,1);}
    if(pxl.type===5){fill(col[0],col[1],col[2],50);ellipse(ex,ey,cellSize*1.8,cellSize*1.8);}
  }

  drawTransitPixels(cx,cy,cellSize,pal);
  drawEclats(cx,cy,cellSize,pal);
  drawLabel();
}

/**
 * Anime et dessine les appendices de l'organisme à chaque frame.
 * Chaque appendice est dessiné segment par segment en calculant sa position
 * via des fonctions sinusoïdales (wave) et, pour Vortex, une composante
 * spirale progressive.
 * Les types d'appendices ont des rendus différents :
 *   - "antenne"  : petites ellipses, boule lumineuse au bout
 *   - "rayon"    : petits carrés fins
 *   - "membrane" : ellipses semi-transparentes + carré
 *   - autres     : carrés arrondis standards
 *
 * @param {Object} org - Données de l'organisme (animAppendices, bodyRadius, espece)
 * @param {number} cx - Centre X de la créature (pixels)
 * @param {number} cy - Centre Y de la créature (pixels)
 * @param {number} cellSize - Taille d'une cellule en pixels
 * @param {Array} pal - Palette de couleurs active
 * @param {number} t - Compteur de frames (st.animFrame)
 */
function drawAnimAppendices(org,cx,cy,cellSize,pal,t){
  if(!org.animAppendices||org.animAppendices.length===0)return;
  var pal_len=pal.length,stadeIdx=getStadeIndex();
  for(var ai=0;ai<org.animAppendices.length;ai++){
    var app=org.animAppendices[ai];
    app.phase+=app.speed;
    var baseR=org.bodyRadius*cellSize;
    var segments=Math.round(app.length*(1+stadeIdx*0.15));
    var attAngle=app.angle+Math.sin(app.phase*0.7)*0.08;
    noStroke();
    for(var si=0;si<segments;si++){
      var ratio=si/segments;
      var wave=Math.sin(app.phase+si*0.55)*app.wavAmp;
      var spiralAdd=(org.espece==="Vortex")?(app.spiralBase+si*0.18*Math.sin(app.phase*0.3)):0;
      var segAng=attAngle+wave+spiralAdd+(app.type==="tentacule"?Math.sin(app.phase*1.3+si)*0.3:0);
      var sx2=cx+Math.cos(segAng)*(baseR+(si+1)*cellSize*0.9);
      var sy2=cy+Math.sin(segAng)*(baseR+(si+1)*cellSize*0.9);
      var segSz=cellSize*(1-ratio*0.7);
      var cIdx=Math.floor(pal_len*(0.45+ratio*0.3));
      cIdx=Math.max(0,Math.min(pal_len-1,cIdx));
      var col=pal[cIdx];
      var alpha=Math.floor(220*(1-ratio*0.5));
      fill(col[0],col[1],col[2],alpha);
      if(app.type==="antenne"){
        ellipse(sx2,sy2,Math.max(2,segSz*0.5),Math.max(2,segSz*0.5));
        if(si===segments-1){fill(pal[Math.floor(pal_len*0.1)][0],pal[Math.floor(pal_len*0.1)][1],pal[Math.floor(pal_len*0.1)][2],200);ellipse(sx2,sy2,segSz*1.4,segSz*1.4);}
      }else if(app.type==="rayon"){
        var rSz=Math.max(1,segSz*0.4);rect(sx2-rSz/2,sy2-rSz/2,rSz,rSz,1);
      }else if(app.type==="membrane"){
        fill(col[0],col[1],col[2],Math.floor(alpha*0.45));ellipse(sx2,sy2,segSz*1.8,segSz*1.8);
        fill(col[0],col[1],col[2],alpha);rect(sx2-segSz*0.4,sy2-segSz*0.4,segSz*0.8,segSz*0.8,2);
      }else{
        rect(sx2-segSz/2,sy2-segSz/2,segSz,segSz,3);
      }
    }
  }
}

// ── ÉCLATS D'ÉNERGIE ───────────────────────────────────────────────

/**
 * Fait apparaître un éclat d'énergie à capturer sur la créature.
 * L'éclat est positionné sur un pixel de corps (type 2) ou de membrane (type 3)
 * choisi aléatoirement, en évitant les positions déjà occupées par un autre éclat.
 * Il disparaît seul après 170 frames s'il n'est pas capturé.
 * Maximum 2 éclats simultanés (limite dans draw()).
 */
function spawnEclat(){
  if(!st.organism||st.eclats.length>=2)return;
  var org=st.organism,cellSize=st.morphologie;
  var ctr=getCreatureCenter();
  var bodyPx=org.pixels.filter(function(p){return p.type===2||p.type===3;});
  if(bodyPx.length===0)return;
  var tries=0,found=null;
  while(tries<40&&!found){
    var candidate=bodyPx[Math.floor(random(bodyPx.length))];
    var alreadyUsed=st.eclats.some(function(e){return e.gx===candidate.gx&&e.gy===candidate.gy;});
    if(!alreadyUsed)found=candidate;
    tries++;
  }
  if(!found)return;
  // Position pixel-perfect sur la grille
  var ex=ctr.cx+found.gx*cellSize;
  var ey=ctr.cy+found.gy*cellSize;
  st.eclats.push({gx:found.gx,gy:found.gy,px:ex,py:ey,phase:random(TWO_PI),born:frameCount});
}

/**
 * Retourne un nom de palette aléatoire parmi toutes les palettes disponibles,
 * en excluant la palette actuellement active.
 * Utilisé pour l'effet de flash coloré lors de la capture d'un éclat.
 *
 * @returns {string} Nom d'une palette différente de st.palName
 */
function getRandomPaletteName(){
  var keys=Object.keys(PALETTES).filter(function(k){ return k !== st.palName; });
  return keys[Math.floor(Math.random()*keys.length)];
}

/**
 * Dessine tous les éclats actifs et gère leur cycle de vie.
 * Chaque éclat est affiché avec un halo pulsant, un carré central
 * et un reflet blanc clignotant.
 * Après capture, l'éclat flashe avec une palette aléatoire pendant 1 seconde
 * avant de disparaître. Les éclats trop anciens (>170 frames) sont supprimés.
 *
 * @param {number} cx - Centre X de la créature
 * @param {number} cy - Centre Y de la créature
 * @param {number} cellSize - Taille d'une cellule
 * @param {Array} pal - Palette active (utilisée si l'éclat n'est pas capturé)
 */
function drawEclats(cx,cy,cellSize,pal){
  var toRemove=[];
  var now=Date.now();
  for(var i=0;i<st.eclats.length;i++){
    var e=st.eclats[i];e.phase+=0.04;
    var age=frameCount-e.born;
    var flashDone=e.captured && now>e.flashUntil;
    if(age>170||flashDone){toRemove.push(i);continue;}
    e.px=cx+e.gx*cellSize;
    e.py=cy+e.gy*cellSize;
    var lifeRatio=1-age/170,pulse=0.8+0.22*Math.sin(e.phase*4);

    // Flash coloré si capturé, sinon palette normale
    var activePal=(e.captured && now<e.flashUntil)
      ? PALETTES[e.flashPal]
      : pal;
    var bright=activePal[Math.floor(activePal.length*0.1)];

    noStroke();
    fill(bright[0],bright[1],bright[2],Math.floor(35*lifeRatio));
    ellipse(e.px,e.py,cellSize*3.5*pulse,cellSize*3.5*pulse);
    fill(bright[0],bright[1],bright[2],Math.floor(210*lifeRatio));
    var sz2=cellSize*1.6*pulse*lifeRatio;
    rect(e.px-sz2/2,e.py-sz2/2,sz2,sz2,3);
    fill(255,255,255,Math.floor(130*lifeRatio*Math.abs(Math.sin(e.phase*6))));
    var ts=sz2*0.38;rect(e.px-ts/2,e.py-ts/2,ts,ts,2);
  }
  // Suppression en sens inverse pour préserver les index
  for(var j=toRemove.length-1;j>=0;j--)st.eclats.splice(toRemove[j],1);
}

/**
 * Vérifie si le clic ou le survol de la souris capture un éclat.
 * Le rayon de capture est volontairement généreux (2.8× cellSize)
 * pour faciliter l'interaction.
 * Un même éclat ne peut être capturé qu'une seule fois (flag e.captured).
 * Déclenche absorbEclat() pour chaque éclat capturé.
 *
 * @param {number} mx - Position X de la souris
 * @param {number} my - Position Y de la souris
 * @returns {boolean} Vrai si au moins un éclat a été capturé
 */
function checkEclatCapture(mx,my){
  var capR=st.morphologie*2.8;
  var captured=false;
  for(var i=st.eclats.length-1;i>=0;i--){
    var e=st.eclats[i],dx=e.px-mx,dy=e.py-my;
    if(Math.sqrt(dx*dx+dy*dy)<=capR && !e.captured){
      e.captured=true;
      e.flashUntil=Date.now()+1000;
      e.flashPal=getRandomPaletteName();
      absorbEclat();
      captured=true;
    }
  }
  return captured;
}

/**
 * Applique les effets de l'absorption d'un éclat :
 *  - Ajoute 10 points d'énergie (max: energieMax)
 *  - Incrémente le compteur total d'éclats
 *  - Affiche un toast de notification
 *  - Si l'énergie est pleine : passe au niveau suivant
 *    → régénère l'organisme en conservant les pixels de croissance précédents
 *    → applique les décalages de couleur du nouveau level
 *    → ajoute de nouveaux pixels de croissance (spawnExtraPixels)
 *    → tente d'enrichir le nom via l'API Claude (tryEnrichName)
 */
function absorbEclat() {
  st.energie = Math.min(st.energieMax, st.energie + 10);
  st.totalEclatsAbsorbes++;
  showToast("✦ Eclat absorbe  +10 energie");
  if (st.energie >= st.energieMax) {
    st.energie = 0;
    st.level++;
    var stade = getCurrentStade();
    showEvolution(stade);
    var oldLevel = st.level;
    var oldName = st.poeticName;
    // Sauvegarde les pixels de croissance des levels précédents avant régénération
    var oldGrowthPixels = st.organism ? st.organism.pixels.filter(function(p){ return p.type === 6; }) : [];
    generateOrganism();
    st.level = oldLevel;
    st.poeticName = oldName;
    // Réinjecte les anciens pixels de croissance dans le nouvel organisme
    for(var i = 0; i < oldGrowthPixels.length; i++){
      var op = oldGrowthPixels[i];
      var occupied = st.organism.pixels.some(function(p){ return p.gx === op.gx && p.gy === op.gy; });
      if(!occupied) st.organism.pixels.push(op);
    }
    initLevelColorShifts();   // NOTE: définie dans un autre fichier ou module
    applyLevelColorShifts();  // NOTE: définie dans un autre fichier ou module
    // Ajoute les nouveaux pixels de croissance pour ce level
    spawnExtraPixels();
    tryEnrichName();
  }
  st.lastEclatSpawn = frameCount;
}

/**
 * Ajoute des pixels de croissance (type 6) autour de la membrane de l'organisme
 * lors d'un passage de niveau. Ces pixels sont visuellement distincts grâce
 * à une couleur différente par level (rotation dans colorOffsets).
 *
 * Processus :
 *  - Sélectionne un pixel de bordure (type 2 ou 3) aléatoirement
 *  - Place un nouveau pixel à distance 1 ou 2 dans une direction aléatoire
 *  - Vérifie que la case cible est libre
 *  - Répète jusqu'à avoir ajouté 3 pixels ou épuisé 120 tentatives
 */
function spawnExtraPixels() {
  if (!st.organism) return;
  var org = st.organism;
  var pal = PALETTES[st.palName];
  var pal_len = pal.length;
  var level = st.level;

  var toAdd = 3; // 3 pixels de croissance par level

  var borderPx = org.pixels.filter(function(p) { return p.type === 3 || p.type === 2; });
  if (borderPx.length === 0) return;

  // Décalage de couleur cyclique selon le level pour rendre les strates visibles
  var colorOffsets = [0.88, 0.12, 0.72, 0.05, 0.60, 0.92, 0.18, 0.78, 0.35, 0.95];
  var colorBase = Math.floor(pal_len * colorOffsets[(level - 2) % colorOffsets.length]);

  var added = 0;
  var tries = 0;
  while (added < toAdd && tries < 120) {
    tries++;
    var base = borderPx[Math.floor(Math.random() * borderPx.length)];

    var angle2 = Math.random() * Math.PI * 2;
    var dist1 = Math.floor(Math.random() * 2) + 1;
    var ngx = Math.round(base.gx + Math.cos(angle2) * dist1);
    var ngy = Math.round(base.gy + Math.sin(angle2) * dist1);

    var occupied = org.pixels.some(function(p) { return p.gx === ngx && p.gy === ngy; });
    if (occupied) continue;

    var colorIdx = Math.min(pal_len - 1, Math.max(0, colorBase));

    org.pixels.push({
      gx: ngx,
      gy: ngy,
      type: 6,
      colorIdx: colorIdx,
      birthLevel: level
    });
    added++;
  }
}

/**
 * Tente de remplacer le nom de la créature par un nom enrichi via l'API Claude.
 * Non-bloquant : utilise un flag (st.nameEnriching) pour éviter les appels parallèles.
 * Si l'API retourne un nom valide, met à jour st.poeticName et affiche un toast.
 */
async function tryEnrichName(){
  if(st.nameEnriching)return;st.nameEnriching=true;
  var enriched=await enrichName({palName:st.palName,espece:st.espece,stadeName:getCurrentStade().name});
  if(enriched){st.poeticName=enriched;showToast("✦ Nouveau nom : "+enriched);}
  st.nameEnriching=false;
}

/**
 * Anime et dessine les pixels en transit : pixels qui se déplacent
 * d'une position à une autre avec un arc parabolique (rebond vers le haut).
 * Utilise une interpolation ease-out cubique pour un mouvement naturel.
 * Les pixels terminés (progress >= 1) sont supprimés de la liste.
 *
 * @param {number} cx - Centre X de la créature
 * @param {number} cy - Centre Y de la créature
 * @param {number} cellSize - Taille d'une cellule
 * @param {Array} pal - Palette active
 */
function drawTransitPixels(cx,cy,cellSize,pal){
  var toRemove=[],sz=cellSize-Math.max(1,Math.floor(cellSize*0.1));
  for(var i=0;i<st.transitPixels.length;i++){
    var tp=st.transitPixels[i];if(tp.delay>0){tp.delay--;continue;}
    tp.progress+=0.07;if(tp.progress>=1){tp.progress=1;toRemove.push(i);}
    var t2=tp.progress,ease=1-Math.pow(1-t2,3);
    var fromX=cx+tp.fromGx*cellSize,fromY=cy+tp.fromGy*cellSize;
    var toX=cx+tp.toGx*cellSize,toY=cy+tp.toGy*cellSize;
    // Arc parabolique : décalage vertical sinusoïdal au milieu du trajet
    var rx=fromX+(toX-fromX)*ease,ry=fromY+(toY-fromY)*ease-cellSize*1.2*Math.sin(t2*PI);
    var sc2=1+0.25*Math.sin(t2*PI); // légère mise à l'échelle pendant le trajet
    var col=pal[Math.min(Math.max(tp.colorIdx,0),pal.length-1)];
    noStroke();push();translate(rx,ry);scale(sc2);translate(-sz/2,-sz/2);
    fill(col[0],col[1],col[2],255);rect(0,0,sz,sz,2);
    fill(255,255,255,60);rect(0,0,sz*0.35,sz*0.25,1);pop();
  }
  for(var j=toRemove.length-1;j>=0;j--)st.transitPixels.splice(toRemove[j],1);
}

// ── FOND ───────────────────────────────────────────────────────────

/**
 * Dessine le panneau de fond de la zone de jeu (avec marges arrondies).
 * Quatre thèmes disponibles : Blanc, Crème, Perle, Grille.
 * Pour "Grille", appelle drawAlignedGrid() après avoir rempli le fond.
 */
function drawBgPanel(){
  var bgName=BG_NAMES[st.bgIdx];noStroke();
  if(bgName==="Blanc")fill(255);
  else if(bgName==="Creme")fill(253,249,242);
  else if(bgName==="Perle")fill(245,242,252);
  else fill(248,246,255);
  rect(ART_X+MARGIN,MARGIN,ART_W-MARGIN*2,CH-MARGIN*2,6);
  if(bgName==="Grille")drawAlignedGrid();
}

/**
 * Dessine une grille infinie alignée sur le centre de la créature.
 * Les lignes sont espacées de cellSize (st.morphologie) et couvrent
 * exactement la zone de jeu (de ART_X+MARGIN à ART_X+ART_W-MARGIN).
 * Utilisée uniquement pour le fond "Grille".
 */
function drawAlignedGrid(){
  if(!st.organism)return;
  var cellSize=st.morphologie;
  var ctr=getCreatureCenter();
  var cx=ctr.cx,cy=ctr.cy;
  var xMin=ART_X+MARGIN,xMax=ART_X+ART_W-MARGIN;
  var yMin=MARGIN,yMax=CH-MARGIN;
  stroke(200,196,210,90);strokeWeight(0.7);
  // Lignes verticales ancrées sur cx
  var startGx=Math.ceil((xMin-cx)/cellSize);
  var endGx=Math.floor((xMax-cx)/cellSize);
  for(var gx2=startGx;gx2<=endGx;gx2++){
    var lx=cx+gx2*cellSize;
    line(lx,yMin,lx,yMax);
  }
  // Lignes horizontales ancrées sur cy
  var startGy=Math.ceil((yMin-cy)/cellSize);
  var endGy=Math.floor((yMax-cy)/cellSize);
  for(var gy2=startGy;gy2<=endGy;gy2++){
    var ly=cy+gy2*cellSize;
    line(xMin,ly,xMax,ly);
  }
  noStroke();
}

/**
 * Affiche le label d'informations de la créature en bas à gauche
 * de la zone de jeu : nom de la collection, masse, palette, espèce,
 * stade et niveau. Le fond du label utilise la couleur de la palette active.
 */
function drawLabel(){
  var pal=PALETTES[st.palName],mc=pal[Math.floor(pal.length*0.3)];
  var stade=getCurrentStade();noStroke();
  var lx=ART_X+MARGIN+14;
  var ly=CH-MARGIN-56;
  var lw=ART_W-MARGIN*2-28;
  fill(mc[0],mc[1],mc[2],20);rect(lx,ly,lw,44,8);
  fill(Math.floor(mc[0]*0.55),Math.floor(mc[1]*0.55),Math.floor(mc[2]*0.55));
  textSize(10);textAlign(LEFT,CENTER);
  text("Collection Pixel Creature",lx+14,ly+14);
  var infoStr=st.masse+"px  "+st.palName+"  "+st.espece+"  "+stade.name+" Niv."+st.level;
  text(infoStr,lx+14,ly+30);
  textAlign(LEFT,TOP);
}

// ── GALERIE ────────────────────────────────────────────────────────

/**
 * Affiche la galerie des créatures sauvegardées (st.favs).
 * Chaque créature est représentée par une carte avec :
 *  - un aperçu de sa palette (bandes de couleur)
 *  - son nom poétique, espèce, stade, niveau
 *  - son âge et le nombre d'éclats absorbés
 * Au survol, affiche les boutons "CHARGER" et "X" (supprimer).
 * Les interactions (clic sur CHARGER/X) sont gérées dans mousePressed().
 */
function drawGallery(){
  var gx0=ART_X+MARGIN,gy0=MARGIN,gw=ART_W-MARGIN*2,gh=CH-MARGIN*2;
  noStroke();textSize(11);textAlign(CENTER,TOP);fill(140,130,170);
  text("COLLECTION ("+st.favs.length+")",gx0+gw/2,gy0+10);textAlign(LEFT,TOP);
  if(st.favs.length===0){
    fill(160,155,185);textSize(11);textAlign(CENTER,CENTER);
    text("Aucune creature sauvegardee\nAppuyez GARDER pour en conserver une",gx0+gw/2,gy0+gh/2);
    textAlign(LEFT,TOP);return;
  }
  var cols=3,pad=16,gap=10;
  var tw=Math.floor((gw-pad*2-gap*(cols-1))/cols),th=tw+72;
  for(var i=0;i<st.favs.length;i++){
    var fv=st.favs[i],fx=gx0+pad+(i%cols)*(tw+gap),fy=gy0+36+Math.floor(i/cols)*(th+gap);
    var hov=overR(fx,fy,tw,th),p=PALETTES[fv.palName]||PALETTES["Lavande"];
    fill(hov?248:242,hov?244:238,hov?255:252);rect(fx,fy,tw,th,8);
    var bw2=Math.floor((tw-16)/20);
    for(var j=0;j<20;j++){var c=p[Math.floor((j/20)*(p.length-1))];fill(c[0],c[1],c[2]);rect(fx+8+j*bw2,fy+6,bw2,14,2);}
    fill(80,72,108);textSize(9);textAlign(CENTER,CENTER);text("o",fx+tw/2,fy+35);
    fill(60,50,90);textSize(9);textAlign(CENTER,TOP);
    var nm=fv.poeticName||"";
    text(nm,fx+4,fy+46,tw-8);
    fill(100,90,140);textSize(8);textAlign(CENTER,TOP);
    text((fv.espece||"")+"  "+fv.stadeName+"  Niv."+fv.level,fx+tw/2,fy+60);
    text(fv.masse+"px  "+fv.palName,fx+tw/2,fy+70);
    text("Age: "+formatAge(fv.ageFrames)+"  "+fv.totalEclats+" eclats",fx+tw/2,fy+80);
    if(hov){
      fill(220,210,245,200);rect(fx,fy+th-24,tw,24,8);
      fill(70,60,100);textSize(11);textAlign(CENTER,CENTER);text("CHARGER",fx+tw/2,fy+th-12);
      fill(200,100,100,150);rect(fx+tw-30,fy+th-24,30,24,8);
      fill(255,100,100);text("X",fx+tw-15,fy+th-12);
    }
  }
  textAlign(LEFT,TOP);
}

/**
 * Convertit un nombre de frames en chaîne lisible.
 * En dessous de 60s : "Xs". Au-delà : "Xm Ys".
 *
 * @param {number} f - Nombre de frames (à 60fps)
 * @returns {string} Durée formatée, ex. "1m 23s"
 */
function formatAge(f){var s=Math.floor(f/60);if(s<60)return s+"s";return Math.floor(s/60)+"m "+(s%60)+"s";}

// ── INTERFACE UTILISATEUR ──────────────────────────────────────────

/**
 * Dessine le panneau latéral complet de l'interface.
 * Réinitialise les registres de zones cliquables (palRects, bgRects, etc.)
 * puis appelle en séquence toutes les sections de l'UI.
 * Le layout est vertical : chaque section retourne le Y suivant disponible.
 */
function drawUI(){
  noStroke();fill(18,15,28);rect(0,0,UI_W,CH);fill(36,30,55,200);rect(0,0,UI_W,CH);fill(255,255,255,6);rect(UI_W-1,0,1,CH);
  palRects=[];bgRects=[];sliderReg={};actionBtns={};especeRects=[];
  var y=8;
  y=uiHeader(y);
  y=uiSection("ESPECE",y);y=uiEspeces(y);
  y=uiSection("PALETTE",y);y=uiPalettes(y);
  y=uiSection("FOND",y);y=uiBgs(y);
  y=uiSection("GENETIQUE",y);
  y=uiSlider(y,"MASSE",st.masse,10,2000,"masse");y+=8;
  y=uiSlider(y,"ADN",st.formSeed,0,99999,"formSeed");y+=8;
  y=uiSlider(y,"ZOOM",st.morphologie,3,60,"morphologie");
  y=uiSection("CREATURE",y);y=uiCreatureStats(y);
  y=uiSection("ACTIONS",y);uiActions(y);
}

/**
 * Dessine l'en-tête du panneau UI avec le titre "PIXEL CREATURE",
 * le nom de l'auteur et le nom poétique actif de la créature
 * (tronqué si trop long pour tenir dans la largeur disponible).
 *
 * @param {number} y - Position Y de départ
 * @returns {number} Y après l'en-tête
 */
function uiHeader(y){
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)];
  noStroke();fill(ac[0],ac[1],ac[2],180);rect(12,y+14,3,28,2);
  fill(240,236,255);textSize(13);textAlign(LEFT,TOP);textLeading(16);text("PIXEL",20,y+14);
  fill(ac[0],ac[1],ac[2]);text("CREATURE",20,y+30);
  fill(65,58,90);textSize(9);text("Lorine Magnin-Feysot",20,y+46);
  fill(28,24,44);rect(10,y+62,UI_W-20,24,6);
  fill(ac[0],ac[1],ac[2]);textSize(8);textAlign(LEFT,CENTER);text("Active",22,y+74);
  var maxW=UI_W-80;fill(55,48,78);textSize(9);textAlign(RIGHT,CENTER);
  var nm=st.poeticName;while(textWidth(nm)>maxW&&nm.length>4)nm=nm.slice(0,-1);if(nm!==st.poeticName)nm+="...";
  text(nm,UI_W-14,y+74);textAlign(LEFT,TOP);return y+100;
}

/**
 * Dessine un séparateur de section dans le panneau UI avec son label.
 * Enregistre la position Y de la section dans secY pour référence future.
 *
 * @param {string} lbl - Nom de la section (ex. "ESPECE", "PALETTE"...)
 * @param {number} y - Position Y courante
 * @returns {number} Y après le séparateur
 */
function uiSection(lbl,y){
  noStroke();fill(255,255,255,5);rect(0,y,UI_W,1);fill(75,68,105);textSize(9);textAlign(LEFT,CENTER);textLeading(14);
  text(lbl,12,y+12);textAlign(LEFT,TOP);secY[lbl]=y+24;return y+24;
}

/**
 * Dessine les boutons de sélection d'espèce (grille 2×2).
 * Le bouton actif est mis en évidence avec un contour coloré.
 * Enregistre les zones dans especeRects pour la détection de clic.
 *
 * @param {number} y - Position Y de départ
 * @returns {number} Y après les boutons
 */
function uiEspeces(y){
  var cols=2,gap=5,bw=Math.floor((UI_W-24-gap)/2),bh=28;
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)];
  for(var i=0;i<ESPECE_NAMES.length;i++){
    var cx2=9+(i%cols)*(bw+gap),cy2=y+Math.floor(i/cols)*(bh+gap);
    var act=st.espece===ESPECE_NAMES[i],hov=overR(cx2,cy2,bw,bh);
    especeRects.push({name:ESPECE_NAMES[i],x:cx2,y:cy2,w:bw,h:bh});
    noStroke();fill(act?30:hov?28:20,act?26:hov?22:16,act?48:hov?40:30);rect(cx2,cy2,bw,bh,5);
    fill(act?255:hov?210:95,act?255:hov?205:88,act?255:hov?235:118);
    textSize(9);textAlign(CENTER,CENTER);textLeading(14);
    text(ESPECE_NAMES[i],cx2+bw/2,cy2+bh/2);
    if(act){stroke(ac[0],ac[1],ac[2],150);strokeWeight(1.2);noFill();rect(cx2,cy2,bw,bh,5);noStroke();}
  }
  textAlign(LEFT,TOP);return y+Math.ceil(ESPECE_NAMES.length/2)*(bh+gap)+4;
}

/**
 * Dessine les boutons de sélection de palette (grille 2×N).
 * Chaque bouton affiche un aperçu du dégradé de la palette (20 bandes)
 * et son nom. Le bouton actif est mis en évidence.
 * Enregistre les zones dans palRects pour la détection de clic.
 *
 * @param {number} y - Position Y de départ
 * @returns {number} Y après les boutons
 */
function uiPalettes(y){
  var cols=2,gap=5,bw=Math.floor((UI_W-24-gap)/2),bh=42;
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)];
  palRects=[];
  for(var i=0;i<PAL_NAMES.length;i++){
    var cx3=9+(i%cols)*(bw+gap),cy3=y+Math.floor(i/cols)*(bh+gap);
    var act=st.palName===PAL_NAMES[i],hov=overR(cx3,cy3,bw,bh),p=PALETTES[PAL_NAMES[i]];
    palRects.push({name:PAL_NAMES[i],x:cx3,y:cy3,w:bw,h:bh});
    noStroke();fill(act?30:hov?28:20,act?26:hov?22:16,act?48:hov?40:30);rect(cx3,cy3,bw,bh,5);
    var gx3=cx3+4,gy3=cy3+4,gw=bw-8;
    for(var j=0;j<20;j++){var c=p[Math.floor((j/20)*(p.length-1))];fill(c[0],c[1],c[2]);rect(gx3+j*(gw/20),gy3,gw/20+1,14,1);}
    fill(act?255:hov?210:95,act?255:hov?205:88,act?255:hov?235:118);textSize(7.5);textAlign(CENTER,TOP);textLeading(12);text(PAL_NAMES[i],cx3+bw/2,cy3+22);
    if(act){stroke(ac[0],ac[1],ac[2],150);strokeWeight(1.2);noFill();rect(cx3,cy3,bw,bh,5);noStroke();}
  }
  textAlign(LEFT,TOP);return y+Math.ceil(PAL_NAMES.length/2)*(bh+gap)+4;
}

/**
 * Dessine les boutons de sélection du fond (grille 2×2).
 * Enregistre les zones dans bgRects pour la détection de clic.
 *
 * @param {number} y - Position Y de départ
 * @returns {number} Y après les boutons
 */
function uiBgs(y){
  var cols=2,bw=Math.floor((UI_W-18-4)/cols),bh=22,gap=4;
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)];bgRects=[];
  for(var i=0;i<BG_NAMES.length;i++){
    var cx4=9+(i%cols)*(bw+gap),cy4=y+Math.floor(i/cols)*(bh+gap);
    var act=st.bgIdx===i,hov=overR(cx4,cy4,bw,bh);
    bgRects.push({idx:i,x:cx4,y:cy4,w:bw,h:bh});
    noStroke();fill(act?34:hov?28:20,act?28:hov?24:16,act?52:hov?42:32);rect(cx4,cy4,bw,bh,4);
    textSize(9);textAlign(CENTER,CENTER);textLeading(14);fill(act?255:hov?210:95,act?255:hov?205:88,act?255:hov?238:120);
    text(BG_NAMES[i],cx4+bw/2,cy4+bh/2);
    if(act){stroke(ac[0],ac[1],ac[2],150);strokeWeight(1.2);noFill();rect(cx4,cy4,bw,bh,4);noStroke();}
  }
  textAlign(LEFT,TOP);return y+Math.ceil(BG_NAMES.length/cols)*(bh+gap)+4;
}

/**
 * Dessine un slider interactif lié à un champ numérique de `st`.
 * Le slider s'illumine lorsque la souris est proche de la poignée.
 * La position de la poignée est calculée en fonction de la valeur courante
 * et des bornes min/max. Enregistre le slider dans sliderReg pour
 * le drag dans mouseDragged().
 *
 * @param {number} y - Position Y de départ
 * @param {string} label - Nom affiché (ex. "MASSE", "ADN", "ZOOM")
 * @param {number} value - Valeur actuelle
 * @param {number} minV - Valeur minimale
 * @param {number} maxV - Valeur maximale
 * @param {string} field - Clé correspondante dans l'objet `st`
 * @returns {number} Y après le slider
 */
function uiSlider(y,label,value,minV,maxV,field){
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)];
  var tx=12,tw=UI_W-24,ty=y+24;
  var ratio=(value-minV)/(maxV-minV),kx=tx+ratio*tw;
  var lit=dist(mouseX,mouseY,kx,ty)<14||(overR(tx,ty-10,tw,20)&&st.slider===label)||st.slider===label;
  noStroke();fill(lit?200:85,lit?195:78,lit?228:108);textSize(9);textAlign(LEFT,TOP);textLeading(14);text(label,tx,y+6);
  fill(ac[0],ac[1],ac[2]);textAlign(RIGHT,TOP);text(Math.round(value),tx+tw,y+6);textAlign(LEFT,TOP);
  fill(22,18,35);rect(tx,ty-2,tw,4,2);fill(ac[0],ac[1],ac[2],lit?200:100);rect(tx,ty-2,kx-tx,4,2);
  fill(255,255,255,lit?255:200);circle(kx,ty,lit?14:10);
  stroke(ac[0],ac[1],ac[2],lit?220:80);strokeWeight(1.5);noFill();circle(kx,ty,lit?20:15);noStroke();
  sliderReg[label]={x:tx,w:tw,y:ty,min:minV,max:maxV,field:field};return y+44;
}

/**
 * Dessine le panneau de statistiques de la créature dans l'UI latérale.
 * Affiche (dans un panneau arrondi) :
 *  - Nom poétique tronqué si nécessaire
 *  - Espèce, stade, niveau
 *  - Âge en secondes et minutes
 *  - Barre de progression de l'énergie
 *  - Indicateurs de stades (petits rectangles colorés)
 *  - Nombre total d'éclats absorbés
 *
 * @param {number} y - Position Y de départ
 * @returns {number} Y après le panneau
 */
function uiCreatureStats(y){
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)],acBright=pal[Math.floor(pal.length*0.2)];
  var stade=getCurrentStade(),stadeIdx=getStadeIndex();
  var pad=10,panX=6,panW=UI_W-12,panH=170;
  noStroke();fill(ac[0],ac[1],ac[2],18);rect(panX-2,y-2,panW+4,panH+4,10);
  fill(52,44,80);rect(panX,y,panW,panH,8);fill(ac[0],ac[1],ac[2],90);rect(panX,y,panW,2,8);
  fill(255,255,255,12);rect(panX,y+2,2,panH-4,6);
  var ix=panX+pad,iw=panW-pad*2,cy5=y+pad;
  noStroke();textLeading(15);

  fill(255,240,180);textSize(10);textAlign(LEFT,TOP);
  var nmDisp=st.poeticName;
  var maxNW=iw;
  while(textWidth(nmDisp)>maxNW&&nmDisp.length>4)nmDisp=nmDisp.slice(0,-1);
  if(nmDisp!==st.poeticName)nmDisp+="...";
  text(nmDisp,ix,cy5);cy5+=15;

  fill(200,192,230);textSize(9);textAlign(LEFT,TOP);text(st.espece,ix,cy5);
  fill(acBright[0],acBright[1],acBright[2]);textSize(9);textAlign(CENTER,TOP);text(stade.name,ix+iw/2,cy5);
  fill(acBright[0],acBright[1],acBright[2]);textSize(10);textAlign(RIGHT,TOP);text("Niv."+st.level,ix+iw,cy5);
  cy5+=16;

  fill(180,172,215);textSize(9);textAlign(LEFT,TOP);
  var ageSec=Math.floor(st.ageFrames/60);
  text("Age  "+ageSec+"s  ("+formatAge(st.ageFrames)+")",ix,cy5);cy5+=14;

  fill(180,172,215);textSize(9);textAlign(LEFT,TOP);text("Energie",ix,cy5);
  fill(ac[0],ac[1],ac[2]);textAlign(RIGHT,TOP);text(st.energie+"/"+st.energieMax,ix+iw,cy5);cy5+=13;
  fill(20,16,32);rect(ix,cy5,iw,8,4);
  var eR=st.energie/st.energieMax;fill(ac[0],ac[1],ac[2],220);rect(ix,cy5,iw*eR,8,4);
  if(eR>0.02){fill(255,255,255,55);rect(ix,cy5,iw*eR*0.6,4,4);}cy5+=15;

  fill(180,172,215);textSize(9);textAlign(LEFT,TOP);text("Progression",ix,cy5);cy5+=13;
  // Indicateurs de stades : un rectangle par stade, coloré si atteint
  var dotW=Math.floor(iw/STADES.length)-2,dotH=7;
  for(var i=0;i<STADES.length;i++){
    var bx2=ix+i*(dotW+2),active=stadeIdx>=i;
    fill(active?ac[0]:28,active?ac[1]:22,active?ac[2]:40,active?210:255);rect(bx2,cy5,dotW,dotH,3);
    if(active){fill(255,255,255,55);rect(bx2,cy5,dotW*0.55,3,3);}
  }
  cy5+=dotH+4;
  fill(ac[0],ac[1],ac[2],160);textSize(7.5);textAlign(LEFT,TOP);text(STADES[0].name,ix,cy5);
  textAlign(RIGHT,TOP);text(STADES[STADES.length-1].name,ix+iw,cy5);
  fill(acBright[0],acBright[1],acBright[2],230);textSize(8);textAlign(CENTER,TOP);
  var stX=ix+(stadeIdx/(STADES.length-1))*iw;stX=Math.max(ix+20,Math.min(ix+iw-20,stX));
  text(stade.name,stX,cy5);
  cy5+=14;

  fill(160,152,195);textSize(9);textAlign(LEFT,TOP);textLeading(14);
  text("Eclats  "+st.totalEclatsAbsorbes,ix,cy5);cy5+=14;

  textAlign(LEFT,TOP);return y+panH+6;
}

/**
 * Dessine les boutons d'action dans le panneau UI :
 *  - COLLECTION : bascule entre vue créature et galerie
 *  - GARDER (IMMORTALISER) : sauvegarde la créature courante dans les favoris
 *  - PNG (PORTRAIT) : exporte la créature en image PNG
 *  - NOUVELLE ESPECE : régénère un nouvel organisme aléatoire
 * Enregistre les zones dans actionBtns pour la détection de clic dans mousePressed().
 *
 * @param {number} y - Position Y de départ
 */
function uiActions(y){
  var pal=PALETTES[st.palName],ac=pal[Math.floor(pal.length*0.4)];
  var bh=30,gap=5,hw=Math.floor((UI_W-18-gap)/2);
  var b1={x:9,y:y,w:UI_W-18,h:bh},b2={x:9,y:y+36,w:hw,h:bh};
  var b3={x:9+hw+gap,y:y+36,w:hw,h:bh},b4={x:9,y:y+72,w:UI_W-18,h:bh};
  actionBtns["COLLECTION"]=b1;actionBtns["IMMORTALISER"]=b2;actionBtns["PORTRAIT"]=b3;actionBtns["NOUVELLE"]=b4;
  var h1=overR(b1.x,b1.y,b1.w,b1.h),h2=overR(b2.x,b2.y,b2.w,b2.h);
  var h3=overR(b3.x,b3.y,b3.w,b3.h),h4=overR(b4.x,b4.y,b4.w,b4.h);
  noStroke();textSize(10);textAlign(CENTER,CENTER);textLeading(14);
  fill(h1?ac[0]*0.55:24,h1?ac[1]*0.5:20,h1?ac[2]*0.6:38);rect(b1.x,b1.y,b1.w,b1.h,7);
  fill(h1?255:140,h1?255:132,h1?255:170);text(st.view==="gallery"?"<- RETOUR":"COLLECTION ("+st.favs.length+")",b1.x+b1.w/2,b1.y+b1.h/2);
  fill(h2?ac[0]*0.55:24,h2?ac[1]*0.5:20,h2?ac[2]*0.6:38);rect(b2.x,b2.y,b2.w,b2.h,7);
  fill(h2?255:140,h2?255:132,h2?255:170);text("GARDER",b2.x+b2.w/2,b2.y+b2.h/2);
  fill(h3?ac[0]*0.55:24,h3?ac[1]*0.5:20,h3?ac[2]*0.6:38);rect(b3.x,b3.y,b3.w,b3.h,7);
  fill(h3?255:140,h3?255:132,h3?255:170);text("PNG",b3.x+b3.w/2,b3.y+b3.h/2);
  fill(h4?ac[0]*0.55:24,h4?ac[1]*0.5:20,h4?ac[2]*0.6:38);rect(b4.x,b4.y,b4.w,b4.h,7);
  fill(h4?255:140,h4?255:132,h4?255:170);text("NOUVELLE ESPECE",b4.x+b4.w/2,b4.y+b4.h/2);
  textAlign(LEFT,TOP);
}

/**
 * Dessine la poignée de redimensionnement entre le panneau UI et la zone de jeu.
 * Elle s'illumine au survol ou pendant le drag, et affiche l'icône "◄►".
 */
function drawUIHandle(){
  var hov=mouseX>=UI_W-UI_HANDLE_W&&mouseX<=UI_W+UI_HANDLE_W;
  var alpha=UI_DRAG?255:hov?200:90;
  noStroke();
  fill(100,90,150,UI_DRAG?60:hov?40:18);
  rect(UI_W-UI_HANDLE_W/2-1,0,UI_HANDLE_W+2,CH);
  fill(255,255,255,alpha);rect(UI_W-2,CH*0.3,4,CH*0.4,2);
  fill(255,255,255,alpha*0.8);
  for(var i=0;i<3;i++)rect(UI_W-1,CH*0.3+CH*0.4/2-8+i*8,2,4,1);
  if(hov||UI_DRAG){
    fill(255,255,255,alpha*0.7);textSize(9);textAlign(CENTER,CENTER);
    text("◄►",UI_W,CH*0.3+CH*0.4/2+20);
  }
  noStroke();
}

// ── INTERACTIONS SOURIS & CLAVIER ──────────────────────────────────

/**
 * Gestionnaire de clic souris (p5.js).
 * Ordre de priorité :
 *  1. Démarrage du drag de la poignée UI
 *  2. Clics dans la galerie (charger/supprimer une créature)
 *  3. Capture d'un éclat dans la zone de jeu
 *  4. Activation d'un slider
 *  5. Sélection d'une espèce, d'une palette ou d'un fond
 *  6. Boutons d'action (Collection, Garder, PNG, Nouvelle espèce)
 */
function mousePressed(){
  if(mouseX>=UI_W-UI_HANDLE_W&&mouseX<=UI_W+UI_HANDLE_W){UI_DRAG=true;return;}

  if(st.view==="gallery"&&st.favs.length>0){
    var gx0=ART_X+MARGIN,gy0=MARGIN,gw=ART_W-MARGIN*2;
    var cols=3,pad=16,gap=10,tw=Math.floor((gw-pad*2-gap*(cols-1))/cols),th=tw+72;
    for(var i=0;i<st.favs.length;i++){
      var fx=gx0+pad+(i%cols)*(tw+gap),fy=gy0+36+Math.floor(i/cols)*(th+gap);
      if(overR(fx+tw-30,fy+th-24,30,24)){st.favs.splice(i,1);saveFavs();return;}
      if(overR(fx,fy,tw,th)){
        var fv=st.favs[i];
        st.palName=fv.palName;st.bgIdx=fv.bgIdx;st.masse=fv.masse;
        st.formSeed=fv.formSeed;st.morphologie=fv.morphologie;st.espece=fv.espece||"Brume";
        st.poeticName=fv.poeticName;generateOrganism();st.view="create";return;
      }
    }
  }
  if(st.view==="create"&&mouseX>ART_X&&mouseX<CW&&mouseY>0&&mouseY<CH){
    if(checkEclatCapture(mouseX,mouseY))return;
  }

  for(var key in sliderReg){
    var s=sliderReg[key],sv=st[s.field]!==undefined?st[s.field]:0;
    var kx=s.x+((sv-s.min)/(s.max-s.min))*s.w;
    if(dist(mouseX,mouseY,kx,s.y)<16||(overR(s.x,s.y-10,s.w,20)&&st.slider===key)){st.slider=key;return;}
  }
  for(var ei=0;ei<especeRects.length;ei++){
    var er=especeRects[ei];if(overR(er.x,er.y,er.w,er.h)){st.espece=er.name;generateOrganism();return;}
  }
  for(var pi=0;pi<palRects.length;pi++){
    var pr=palRects[pi];if(overR(pr.x,pr.y,pr.w,pr.h)){st.palName=pr.name;generateOrganism();return;}
  }
  for(var bi=0;bi<bgRects.length;bi++){
    var br=bgRects[bi];if(overR(br.x,br.y,br.w,br.h)){st.bgIdx=br.idx;return;}
  }
  var b;
  b=actionBtns["COLLECTION"];if(b&&overR(b.x,b.y,b.w,b.h)){st.view=(st.view==="gallery")?"create":"gallery";return;}
  b=actionBtns["IMMORTALISER"];if(b&&overR(b.x,b.y,b.w,b.h)){saveFav();return;}
  b=actionBtns["PORTRAIT"];if(b&&overR(b.x,b.y,b.w,b.h)){doExport();return;}
  b=actionBtns["NOUVELLE"];if(b&&overR(b.x,b.y,b.w,b.h)){generateOrganism();return;}
}

/**
 * Gestionnaire de glisser-déposer souris (p5.js).
 * - Si la poignée UI est en drag : redimensionne UI_W entre ses bornes min/max.
 * - Si un slider est actif : met à jour la valeur du champ lié dans `st`,
 *   et régénère l'organisme si le champ est "masse" ou "formSeed".
 */
function mouseDragged(){
  if(UI_DRAG){UI_W=Math.max(UI_W_MIN,Math.min(UI_W_MAX,mouseX));updateLayout();return;}
  if(!st.slider)return;
  var s=sliderReg[st.slider];if(!s)return;
  var newVal=Math.max(s.min,Math.min(s.max,Math.round(map(mouseX,s.x,s.x+s.w,s.min,s.max))));
  st[s.field]=newVal;
  if(s.field==="masse"||s.field==="formSeed")generateOrganism();
}

/**
 * Gestionnaire de mouvement souris (p5.js).
 * Tente de capturer des éclats au survol (sans clic) pour les rendre
 * plus faciles à collecter. Limité à une vérification tous les 6 frames
 * pour éviter de surcharger le rendu.
 */
function mouseMoved(){
  if(st.view!=="create"||!st.organism)return;
  if(mouseX<ART_X||mouseX>CW||mouseY<0||mouseY>CH)return;
  if(frameCount-lastPulseFrame<6)return;
  lastPulseFrame=frameCount;
  checkEclatCapture(mouseX,mouseY);
}

/**
 * Gestionnaire de relâchement de souris (p5.js).
 * Réinitialise le slider actif et le flag de drag de la poignée UI.
 */
function mouseReleased(){st.slider=null;UI_DRAG=false;}

/**
 * Gestionnaire de touches clavier (p5.js).
 * Raccourcis :
 *   F : sauvegarder la créature (saveFav)
 *   S : exporter en PNG (doExport)
 *   N : générer une nouvelle créature (generateOrganism)
 */
function keyPressed(){
  if(key==="f"||key==="F")saveFav();
  if(key==="s"||key==="S")doExport();
  if(key==="n"||key==="N")generateOrganism();
}

// ── NOTIFICATIONS & OVERLAYS ───────────────────────────────────────

/**
 * Affiche une notification temporaire (toast) via l'élément HTML #toast.
 * Le message disparaît après 2,8 secondes. Un timer précédent est annulé
 * si un nouveau toast arrive avant la fin du précédent.
 *
 * @param {string} msg - Texte à afficher dans le toast
 */
function showToast(msg){
  var el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");
  clearTimeout(window._toastTimer);window._toastTimer=setTimeout(function(){el.classList.remove("show");},2800);
}

/**
 * Affiche l'overlay d'évolution (#evo-overlay) lors d'un passage de niveau.
 * Montre le numéro de niveau, le nom du stade atteint et sa description.
 * L'overlay disparaît automatiquement après 2,6 secondes.
 *
 * @param {Object} stade - Stade atteint {name, desc}
 */
function showEvolution(stade){
  var el=document.getElementById("evo-overlay"),txt=document.getElementById("evo-text"),sub=document.getElementById("evo-sub");
  txt.textContent="NIVEAU "+st.level+"  "+stade.name.toUpperCase();sub.textContent=stade.desc;
  el.classList.add("show");setTimeout(function(){el.classList.remove("show");},2600);
}

// ── FAVORIS & EXPORT ───────────────────────────────────────────────

/**
 * Sauvegarde la créature courante dans la liste des favoris (st.favs).
 * Insère en tête de liste un snapshot complet (palette, taille, graine,
 * morphologie, espèce, nom, énergie, niveau, stade, stats, âge).
 * Limite la collection à 50 créatures (les plus anciennes sont supprimées).
 * Déclenche ensuite une régénération pour repartir sur une nouvelle créature.
 */
function saveFav(){
  var stade=getCurrentStade();
  st.favs.unshift({palName:st.palName,bgIdx:st.bgIdx,masse:st.masse,
    formSeed:st.formSeed,morphologie:st.morphologie,espece:st.espece,artNo:st.artNo,
    poeticName:st.poeticName,energie:st.energie,level:st.level,stadeName:stade.name,
    totalEclats:st.totalEclatsAbsorbes,ageFrames:st.ageFrames});
  if(st.favs.length>50)st.favs.pop();saveFavs();st.artNo++;
  showToast("Immortalise : "+st.poeticName);generateOrganism();
}

/**
 * Persiste la liste des favoris dans le localStorage du navigateur
 * sous la clé "pixelCreatureFavs2".
 * Silencieux en cas d'erreur (localStorage indisponible en navigation privée).
 */
function saveFavs(){try{localStorage.setItem("pixelCreatureFavs2",JSON.stringify(st.favs));}catch(e){}}

/**
 * Charge la liste des favoris depuis le localStorage.
 * Si aucune donnée n'est trouvée ou en cas d'erreur, initialise st.favs à [].
 */
function loadFavs(){try{var d=localStorage.getItem("pixelCreatureFavs2");st.favs=d?JSON.parse(d):[];}catch(e){st.favs=[];}}

/**
 * Exporte la créature courante en image PNG via p5.js (createGraphics).
 * Dessine l'organisme centré sur un canvas off-screen de taille ajustée
 * (bounding box des pixels + marges), ajoute le nom et les infos en bas,
 * puis déclenche le téléchargement du fichier.
 * Le nom du fichier est dérivé du nom poétique (espaces et # remplacés par _).
 */
function doExport(){
  if(!st.organism)return;
  var pal=PALETTES[st.palName],org=st.organism,cellSize=st.morphologie,margin=30;
  var maxGx=0,maxGy=0,minGx=99,minGy=99;
  for(var i=0;i<org.pixels.length;i++){
    var p2=org.pixels[i];
    maxGx=Math.max(maxGx,p2.gx);maxGy=Math.max(maxGy,p2.gy);
    minGx=Math.min(minGx,p2.gx);minGy=Math.min(minGy,p2.gy);
  }
  var pw=(maxGx-minGx+1)*cellSize+margin*2,ph=(maxGy-minGy+1)*cellSize+margin*2+40;
  var pg=createGraphics(pw,ph);pg.pixelDensity(2);pg.noStroke();pg.background(248,245,255);
  var cx2=pw/2,cy2=(ph-40)/2;
  for(var i2=0;i2<org.pixels.length;i2++){
    var pxl2=org.pixels[i2];
    var ex=cx2+pxl2.gx*cellSize,ey=cy2+pxl2.gy*cellSize;
    var col=pal[Math.min(Math.max(pxl2.colorIdx,0),pal.length-1)];
    var sz3=cellSize-Math.max(1,Math.floor(cellSize*0.1));
    if(pxl2.type===1){pg.fill(col[0],col[1],col[2]);pg.rect(ex-sz3/2,ey-sz3/2,sz3,sz3,3);pg.fill(255,255,255,160);pg.rect(ex-sz3*0.3,ey-sz3*0.3,sz3*0.35,sz3*0.25,2);}
    else{pg.fill(col[0],col[1],col[2]);pg.rect(ex-sz3/2,ey-sz3/2,sz3,sz3,2);}
  }
  var stade2=getCurrentStade();pg.fill(120,110,160);pg.textFont("monospace");pg.textSize(11);
  pg.text(st.poeticName+"  "+st.espece+"  "+stade2.name+" Niv."+st.level,16,ph-28);
  pg.save(st.poeticName.replace(/\s/g,"_").replace(/#/g,"_")+".png");pg.remove();st.artNo++;
  showToast("Portrait exporte : "+st.poeticName);
}

// ── UTILITAIRES ────────────────────────────────────────────────────

/**
 * Teste si la souris se trouve dans un rectangle défini par
 * son coin supérieur gauche (x, y) et ses dimensions (w, h).
 * Utilisé pour toutes les détections de survol et de clic dans l'UI.
 *
 * @param {number} x - Position X du coin supérieur gauche
 * @param {number} y - Position Y du coin supérieur gauche
 * @param {number} w - Largeur du rectangle
 * @param {number} h - Hauteur du rectangle
 * @returns {boolean} Vrai si la souris est dans le rectangle
 */
function overR(x,y,w,h){return mouseX>=x&&mouseX<=x+w&&mouseY>=y&&mouseY<=y+h;}

// ── NAVIGATION (MENU / JEU) ────────────────────────────────────────

/**
 * Lance le jeu Pixel Creature en masquant l'écran d'introduction.
 * Affiche le bouton retour, le titre, et active le canvas p5.js.
 */
function startGame() {
  var intro = document.getElementById('intro-screen');
  intro.classList.add('hidden');
  setTimeout(function(){ intro.style.display='none'; }, 800);
  document.getElementById('back-btn').style.display = 'block';
  document.getElementById('game-title').style.display = 'block';

  var p5c = document.querySelector('canvas:not(#menu-bg)');
  if (p5c) {
    p5c.style.display = 'block';
    p5c.style.pointerEvents = 'all';
  }
}

/**
 * Retourne au menu principal depuis le jeu Pixel Creature.
 * Remet le canvas p5 en mode passif (sans capture des événements souris),
 * masque le bouton retour et le titre, et réaffiche l'écran d'introduction
 * avec une transition d'opacité.
 */
function backToMenu() {
  var p5c = document.querySelector('canvas:not(#menu-bg)');
  if (p5c) { p5c.style.display = 'block'; p5c.style.pointerEvents = 'none'; }

  document.getElementById('game-title').style.display = 'none';
  var intro = document.getElementById('intro-screen');
  intro.style.display = 'flex';
  intro.style.opacity = '0';
  document.getElementById('back-btn').style.display = 'none';
  setTimeout(function(){ intro.style.opacity='1'; intro.style.transition='opacity 0.6s'; }, 10);
  intro.classList.remove('hidden');
}
