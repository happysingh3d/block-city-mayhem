/* ============================================================
   BLOCK CITY MAYHEM — a tiny low-poly open-city game
   Three.js (CDN) + vanilla JS. No assets, no build step.
   ============================================================ */
(function () {
'use strict';

/* ---------- constants ---------- */
var CELL = 48;            // distance between road centerlines
var ROAD_W = 12;          // road width
var GRID = 3;             // road lines at -3..3 * CELL
var BOUND = GRID * CELL + ROAD_W / 2;   // world edge (150)
var LANE = 3;             // lane offset from road centerline
var SIDEWALK = 8;         // pedestrian rail offset from centerline

var WALK_SPEED = 5, RUN_SPEED = 9, JUMP_V = 7, GRAVITY = 20;
var CAR_ACCEL = 14, CAR_MAXSPD = 26, CAR_REV = -8, CAR_TURN = 1.9;
var AI_CARS = 14, PEDS = 24;

/* ---------- dom ---------- */
var canvas = document.getElementById('game');
var elHealth = document.getElementById('healthfill');
var elStars = document.getElementById('stars');
var elObj = document.getElementById('objective');
var elObjText = document.getElementById('objtext');
var elTimer = document.getElementById('timer');
var elToast = document.getElementById('toast');
var elMenu = document.getElementById('menu');
var elEnd = document.getElementById('endscreen');
var elEndTitle = document.getElementById('endtitle');
var elEndMsg = document.getElementById('endmsg');
var mini = document.getElementById('minimap');
var mctx = mini.getContext('2d');

/* ---------- three.js scene ---------- */
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x87b5e0, 90, 260);

var camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x54613e, 0.95));
var sun = new THREE.DirectionalLight(0xfff3d0, 0.9);
sun.position.set(60, 100, 40);
scene.add(sun);

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- helpers ---------- */
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerpAngle(a, b, t) {
  var d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: color }));
}

/* ---------- city generation ---------- */
var buildingAABBs = [];   // {x1,z1,x2,z2,h} for collision + minimap
var parks = [[-2, 1], [1, -3]];  // block indices [bx,bz] that are parks

function isPark(bx, bz) {
  for (var i = 0; i < parks.length; i++)
    if (parks[i][0] === bx && parks[i][1] === bz) return true;
  return false;
}

(function buildCity() {
  // ground (asphalt everywhere; blocks get sidewalk slabs on top)
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUND * 2 + 40, BOUND * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // lane dashes along roads (single merged geometry)
  var dashGeos = [];
  var dash = new THREE.BoxGeometry(0.35, 0.02, 2.4);
  var m4 = new THREE.Matrix4();
  for (var k = -GRID; k <= GRID; k++) {
    for (var t = -BOUND + 4; t < BOUND - 4; t += 8) {
      m4.makeTranslation(k * CELL, 0.02, t);
      dashGeos.push(dash.clone().applyMatrix4(m4));
      m4.makeTranslation(t, 0.02, k * CELL);
      var g2 = dash.clone();
      g2.rotateY(Math.PI / 2);
      g2.applyMatrix4(m4);
      dashGeos.push(g2);
    }
  }
  var merged = mergeGeos(dashGeos);
  scene.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xd8d8a8 })));

  // blocks: sidewalks + buildings (or parks)
  var blockSize = CELL - ROAD_W;               // 36
  var slabGeo = new THREE.BoxGeometry(blockSize + 2, 0.16, blockSize + 2);
  var slabs = new THREE.InstancedMesh(slabGeo,
    new THREE.MeshLambertMaterial({ color: 0x9a9a92 }), 36);
  var parkMat = new THREE.MeshLambertMaterial({ color: 0x5e8f4e });
  var slabIdx = 0;

  var palette = [0xc96b5a, 0x6b87c9, 0xc9b26b, 0x7ba8a0, 0x8d6bc9];
  var perColor = [[], [], [], [], []];

  for (var bx = -GRID; bx < GRID; bx++) {
    for (var bz = -GRID; bz < GRID; bz++) {
      var cx = bx * CELL + CELL / 2;            // block center
      var cz = bz * CELL + CELL / 2;
      if (isPark(bx, bz)) {
        var park = new THREE.Mesh(slabGeo, parkMat);
        park.position.set(cx, 0.08, cz);
        scene.add(park);
        for (var tr = 0; tr < 6; tr++) addTree(cx + rand(-14, 14), cz + rand(-14, 14));
        continue;
      }
      m4.makeTranslation(cx, 0.08, cz);
      slabs.setMatrixAt(slabIdx++, m4);

      // 2x2 building pads per block
      for (var px = 0; px < 2; px++) {
        for (var pz = 0; pz < 2; pz++) {
          if (Math.random() < 0.15) continue;   // occasional empty lot
          var w = rand(9, 14), d = rand(9, 14), h = rand(8, 36);
          var x = cx + (px === 0 ? -8.5 : 8.5);
          var z = cz + (pz === 0 ? -8.5 : 8.5);
          var ci = randInt(0, palette.length - 1);
          var mat = new THREE.Matrix4();
          mat.compose(
            new THREE.Vector3(x, h / 2 + 0.16, z),
            new THREE.Quaternion(),
            new THREE.Vector3(w, h, d));
          perColor[ci].push(mat);
          buildingAABBs.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2, h: h });
        }
      }
    }
  }
  slabs.count = slabIdx;
  slabs.instanceMatrix.needsUpdate = true;
  scene.add(slabs);

  var unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (var c = 0; c < palette.length; c++) {
    if (!perColor[c].length) continue;
    var im = new THREE.InstancedMesh(unitBox,
      new THREE.MeshLambertMaterial({ color: palette[c] }), perColor[c].length);
    for (var i = 0; i < perColor[c].length; i++) im.setMatrixAt(i, perColor[c][i]);
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }

  // streetlights at intersections
  for (var ix = -GRID; ix <= GRID; ix++)
    for (var iz = -GRID; iz <= GRID; iz++)
      addLamp(ix * CELL + ROAD_W / 2 + 1, iz * CELL + ROAD_W / 2 + 1);
})();

function mergeGeos(geos) {
  // minimal BufferGeometry merge (position + normal), enough for our dashes
  var total = 0, i, g;
  for (i = 0; i < geos.length; i++) total += geos[i].attributes.position.count;
  var pos = new Float32Array(total * 3);
  var nor = new Float32Array(total * 3);
  var idx = [], off = 0;
  for (i = 0; i < geos.length; i++) {
    g = geos[i];
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    var gi = g.index.array;
    for (var j = 0; j < gi.length; j++) idx.push(gi[j] + off);
    off += g.attributes.position.count;
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

function addTree(x, z) {
  var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6),
    new THREE.MeshLambertMaterial({ color: 0x6e4a2e }));
  trunk.position.set(x, 1.12, z);
  var top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.4, 7),
    new THREE.MeshLambertMaterial({ color: 0x3f7a3a }));
  top.position.set(x, 3.6, z);
  scene.add(trunk); scene.add(top);
}

function addLamp(x, z) {
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 5),
    new THREE.MeshLambertMaterial({ color: 0x555a60 }));
  pole.position.set(x, 2.5 + 0.16, z);
  var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  bulb.position.set(x, 5.1, z);
  scene.add(pole); scene.add(bulb);
}

/* ---------- road graph (node walk for AI) ---------- */
function nodePos(i, j) { return { x: i * CELL, z: j * CELL }; }
function randomNode() { return { i: randInt(-GRID, GRID), j: randInt(-GRID, GRID) }; }
function neighbors(n) {
  var out = [];
  if (n.i > -GRID) out.push({ i: n.i - 1, j: n.j });
  if (n.i < GRID) out.push({ i: n.i + 1, j: n.j });
  if (n.j > -GRID) out.push({ i: n.i, j: n.j - 1 });
  if (n.j < GRID) out.push({ i: n.i, j: n.j + 1 });
  return out;
}
// A "walker" moves node-to-node along roads with a sideways offset
function makeWalker(offset, speed) {
  var a = randomNode();
  var nb = neighbors(a);
  return { from: a, to: pick(nb), t: Math.random(), offset: offset, speed: speed, prev: null };
}
function walkerStep(w, dt) {
  var A = nodePos(w.from.i, w.from.j), B = nodePos(w.to.i, w.to.j);
  var len = CELL;
  w.t += (w.speed * dt) / len;
  if (w.t >= 1) {
    w.t -= 1;
    var opts = neighbors(w.to).filter(function (n) {
      return !(w.from.i === n.i && w.from.j === n.j);
    });
    var next = opts.length ? pick(opts) : w.from;
    w.from = w.to; w.to = next;
    A = nodePos(w.from.i, w.from.j); B = nodePos(w.to.i, w.to.j);
  }
  var dx = B.x - A.x, dz = B.z - A.z;
  var dl = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= dl; dz /= dl;
  // right-side offset perpendicular to travel direction
  var ox = dz * w.offset, oz = -dx * w.offset;
  return {
    x: A.x + (B.x - A.x) * w.t + ox,
    z: A.z + (B.z - A.z) * w.t + oz,
    yaw: Math.atan2(dx, dz)
  };
}

/* ---------- characters ---------- */
function makePerson(shirt, pants) {
  var g = new THREE.Group();
  var torso = box(0.62, 0.72, 0.36, shirt); torso.position.y = 1.06; g.add(torso);
  var head = box(0.34, 0.34, 0.34, 0xe8c39e); head.position.y = 1.62; g.add(head);
  var legL = box(0.22, 0.66, 0.24, pants); legL.position.set(-0.16, 0.37, 0); g.add(legL);
  var legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  var armL = box(0.16, 0.6, 0.2, shirt); armL.position.set(-0.44, 1.06, 0); g.add(armL);
  var armR = armL.clone(); armR.position.x = 0.44; g.add(armR);
  g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
  return g;
}
function animateWalk(g, phase, amount) {
  var L = g.userData.limbs;
  var s = Math.sin(phase) * amount;
  L.legL.rotation.x = s; L.legR.rotation.x = -s;
  L.armL.rotation.x = -s; L.armR.rotation.x = s;
}

/* ---------- cars ---------- */
var CAR_COLORS = [0xd64545, 0x4573d6, 0x45d68a, 0xd6a545, 0xb0b6bf, 0x8a5fd0];
function makeCar(color, police) {
  var g = new THREE.Group();
  var body = box(1.9, 0.55, 3.8, police ? 0xf2f2f2 : color); body.position.y = 0.62; g.add(body);
  var cabin = box(1.7, 0.5, 1.9, police ? 0x1a1a2a : 0x232a33);
  cabin.position.set(0, 1.12, -0.25); g.add(cabin);
  var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 8);
  wheelGeo.rotateZ(Math.PI / 2);
  var wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  [[-0.95, 1.25], [0.95, 1.25], [-0.95, -1.25], [0.95, -1.25]].forEach(function (p) {
    var wme = new THREE.Mesh(wheelGeo, wheelMat);
    wme.position.set(p[0], 0.38, p[1]); g.add(wme);
  });
  var hl = box(0.3, 0.14, 0.06, 0xfff6c0);
  hl.material = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  hl.position.set(-0.6, 0.62, 1.92); g.add(hl);
  var hr = hl.clone(); hr.position.x = 0.6; g.add(hr);
  if (police) {
    var stripe = box(1.92, 0.2, 1.2, 0x2244cc); stripe.position.set(0, 0.66, 0.8); g.add(stripe);
    var lr = box(0.5, 0.18, 0.4, 0xff3333);
    lr.material = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    lr.position.set(-0.35, 1.46, -0.25); g.add(lr);
    var lb = box(0.5, 0.18, 0.4, 0x3355ff);
    lb.material = new THREE.MeshBasicMaterial({ color: 0x3355ff });
    lb.position.set(0.35, 1.46, -0.25); g.add(lb);
    g.userData.lights = [lr, lb];
  }
  return g;
}

/* ---------- collision ---------- */
function pointInAABB(x, z, b, pad) {
  return x > b.x1 - pad && x < b.x2 + pad && z > b.z1 - pad && z < b.z2 + pad;
}
// push a circle (x,z,r) out of buildings + world bounds; returns corrected pos + hit flag
function collideCircle(x, z, r) {
  var hit = false;
  if (x < -BOUND + r) { x = -BOUND + r; hit = true; }
  if (x > BOUND - r) { x = BOUND - r; hit = true; }
  if (z < -BOUND + r) { z = -BOUND + r; hit = true; }
  if (z > BOUND - r) { z = BOUND - r; hit = true; }
  for (var i = 0; i < buildingAABBs.length; i++) {
    var b = buildingAABBs[i];
    if (!pointInAABB(x, z, b, r)) continue;
    // smallest push-out
    var dl = x - (b.x1 - r), dr = (b.x2 + r) - x;
    var dn = z - (b.z1 - r), df = (b.z2 + r) - z;
    var m = Math.min(dl, dr, dn, df);
    if (m === dl) x = b.x1 - r;
    else if (m === dr) x = b.x2 + r;
    else if (m === dn) z = b.z1 - r;
    else z = b.z2 + r;
    hit = true;
  }
  return { x: x, z: z, hit: hit };
}

/* ---------- game state ---------- */
var G = {
  running: false, paused: false, mission: null, missionIndex: -1,
  health: 100, wanted: 0, lastCrime: -999, lastDecay: 0,
  inCar: null, time: 0, busy: false
};

var player = makePerson(0x3577d6, 0x2b3140);
player.position.set(3, 0, 20);
var playerVelY = 0, playerOnGround = true, playerYaw = 0, walkPhase = 0;
scene.add(player);

/* camera orbit */
var camYaw = 0, camPitch = 0.32, camDist = 9;
document.addEventListener('mousemove', function (e) {
  if (document.pointerLockElement !== canvas) return;
  camYaw -= e.movementX * 0.0026;
  camPitch = clamp(camPitch + e.movementY * 0.0022, -0.15, 1.15);
});
document.addEventListener('wheel', function (e) {
  camDist = clamp(camDist + Math.sign(e.deltaY) * 1.2, 5, 16);
});
canvas.addEventListener('click', function () {
  if (G.running && !G.paused) canvas.requestPointerLock();
});

/* input */
var keys = {};
document.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'Escape' && G.running) showMenu(true);
});
document.addEventListener('keyup', function (e) { keys[e.code] = false; });

/* ---------- traffic ---------- */
var aiCars = [];
for (var ci = 0; ci < AI_CARS; ci++) {
  var mesh = makeCar(pick(CAR_COLORS), false);
  scene.add(mesh);
  aiCars.push({
    mesh: mesh, walker: makeWalker(LANE, rand(7, 11)),
    stolen: false, speed: 0, yaw: 0, health: 100, wrecked: false, isTarget: false
  });
}
// a couple of parked cars near spawn so early missions start smoothly
var parked = [];
[[ -4, 30, 0 ], [ 4, 44, Math.PI ], [ 52, 4, Math.PI / 2 ]].forEach(function (p) {
  var mesh = makeCar(pick(CAR_COLORS), false);
  mesh.position.set(p[0], 0, p[1]);
  mesh.rotation.y = p[2];
  scene.add(mesh);
  parked.push({ mesh: mesh, stolen: false, speed: 0, yaw: p[2], health: 100, wrecked: false, parked: true });
});

var peds = [];
for (var pi = 0; pi < PEDS; pi++) {
  var pm = makePerson(pick(CAR_COLORS), 0x333a44);
  scene.add(pm);
  peds.push({ mesh: pm, walker: makeWalker(SIDEWALK * (Math.random() < 0.5 ? 1 : -1), rand(1.4, 2.4)),
    down: 0, phase: Math.random() * 6 });
}

var cops = [];
function spawnCop() {
  var mesh = makeCar(0xffffff, true);
  var px = player.position.x, pz = player.position.z;
  var ang = Math.random() * Math.PI * 2;
  var pos = collideCircle(px + Math.cos(ang) * 70, pz + Math.sin(ang) * 70, 1.4);
  mesh.position.set(pos.x, 0, pos.z);
  scene.add(mesh);
  cops.push({ mesh: mesh, speed: 0, yaw: 0, health: 120, wrecked: false, blink: 0 });
}
function clearCops() {
  cops.forEach(function (c) { scene.remove(c.mesh); });
  cops = [];
}

/* ---------- car enter / exit ---------- */
function allEnterableCars() { return aiCars.concat(parked); }
function tryEnterExitCar() {
  if (!G.running || G.paused || G.busy) return;
  if (G.inCar) {   // exit
    var c = G.inCar;
    c.stolen = false;
    c.parked = true;          // abandoned cars stay where you left them
    var side = new THREE.Vector3(2.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
    var out = collideCircle(c.mesh.position.x + side.x, c.mesh.position.z + side.z, 0.5);
    player.position.set(out.x, 0, out.z);
    playerYaw = c.yaw;
    player.visible = true;
    G.inCar = null;
    return;
  }
  var best = null, bestD = 4.2;
  allEnterableCars().forEach(function (c) {
    if (c.wrecked || c.isTarget) return;
    var d = c.mesh.position.distanceTo(player.position);
    if (d < bestD) { best = c; bestD = d; }
  });
  if (best) {
    G.inCar = best;
    best.stolen = true;
    best.speed = 0;
    player.visible = false;
    toast('Car jacked!');
  }
}

/* ---------- markers & mission plumbing ---------- */
var markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.4 });
function makeMarker(color) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 7, 16, 1, true),
    color ? new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
          : markerMat.clone());
  m.visible = false;
  scene.add(m);
  return m;
}
var markerA = makeMarker(0xffd23f);
var markerB = makeMarker(0x53d769);
var chaseArrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 6),
  new THREE.MeshBasicMaterial({ color: 0xffd23f }));
chaseArrow.rotation.x = Math.PI;
chaseArrow.visible = false;
scene.add(chaseArrow);

function playerPos() { return G.inCar ? G.inCar.mesh.position : player.position; }
function distTo(v) {
  var p = playerPos();
  var dx = p.x - v.x, dz = p.z - v.z;
  return Math.sqrt(dx * dx + dz * dz);
}
function setObjective(text) { elObjText.innerHTML = text; }
function toast(t) {
  elToast.textContent = t;
  elToast.style.opacity = 1;
  setTimeout(function () { elToast.style.opacity = 0; }, 1800);
}

/* ---------- missions ---------- */
var LEVELS = [
  {
    name: 'Pizza Rush',
    desc: 'Pick up the pizza, deliver it hot. 90 seconds.',
    timer: 90,
    start: function (M) {
      M.stage = 0;
      M.pickup = { x: -48, z: 96 };       // intersection (-1, 2)
      M.dropoff = { x: 96, z: -96 };      // intersection (2, -2)
      markerA.position.set(M.pickup.x, 3.5, M.pickup.z); markerA.visible = true;
      setObjective('Grab the <b>pizza</b> at the yellow marker.');
    },
    update: function (M) {
      if (M.stage === 0 && distTo(M.pickup) < 3.5) {
        M.stage = 1; markerA.visible = false;
        markerB.position.set(M.dropoff.x, 3.5, M.dropoff.z); markerB.visible = true;
        toast('Pizza secured!');
        setObjective('Deliver it to the <b>green marker</b> before it gets cold!');
      } else if (M.stage === 1 && distTo(M.dropoff) < 3.5) {
        win('Delivered with ' + Math.ceil(M.timeLeft) + 's to spare. Tip included.');
      }
    }
  },
  {
    name: 'Repo Man',
    desc: 'That red car? Bank owns it now. Ram it 3 times to make the point. 2 minutes.',
    timer: 120,
    start: function (M) {
      M.hits = 0; M.cool = 0;
      M.target = aiCars[0];
      M.target.isTarget = true;
      M.target.walker.speed = 13.5;
      M.target.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0xff2222 });
      chaseArrow.visible = true;
      setObjective('Ram the <b>red car</b> — hits: <b>0 / 3</b>');
    },
    update: function (M, dt) {
      M.cool -= dt;
      var t = M.target.mesh.position;
      chaseArrow.position.set(t.x, 4 + Math.sin(G.time * 4) * 0.4, t.z);
      if (G.inCar && M.cool <= 0 && G.inCar.mesh.position.distanceTo(t) < 3.4 && Math.abs(G.inCar.speed) > 8) {
        M.hits++; M.cool = 1.5;
        toast('HIT ' + M.hits + '/3');
        setObjective('Ram the <b>red car</b> — hits: <b>' + M.hits + ' / 3</b>');
        G.inCar.speed *= 0.4;
        if (M.hits >= 3) win('Repo complete. The bank sends its regards.');
      }
    },
    cleanup: function (M) {
      chaseArrow.visible = false;
      if (M.target) {
        M.target.isTarget = false;
        M.target.walker.speed = rand(7, 11);
        M.target.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: pick(CAR_COLORS) });
      }
    }
  },
  {
    name: 'Heat Wave',
    desc: 'You are wanted. Survive the heat for 45 seconds without getting busted.',
    timer: 45, countUpWin: true,
    start: function () {
      G.wanted = 2; G.lastCrime = G.time;
      setObjective('<b>Survive!</b> Don\'t get busted, don\'t get wasted.');
    },
    update: function (M) {
      G.lastCrime = G.time;               // heat never decays during this mission
      if (M.timeLeft <= 0) {
        G.wanted = 0;
        win('You outran the heat. The streets remember.');
      }
    }
  },
  {
    name: 'Checkpoint Run',
    desc: 'A street race, city rules: 6 checkpoints, 100 seconds. Bring a fast car.',
    timer: 100,
    start: function (M) {
      M.points = [
        { x: -96, z: -96 }, { x: 0, z: -96 }, { x: 96, z: 0 },
        { x: 96, z: 96 }, { x: 0, z: 96 }, { x: -96, z: 0 }
      ];
      M.idx = 0;
      markerA.position.set(M.points[0].x, 3.5, M.points[0].z);
      markerA.visible = true;
      setObjective('Checkpoint <b>1 / 6</b>');
    },
    update: function (M) {
      var p = M.points[M.idx];
      if (distTo(p) < 4.5) {
        M.idx++;
        if (M.idx >= M.points.length) { markerA.visible = false; win('Fastest wheels in Block City.'); return; }
        var n = M.points[M.idx];
        markerA.position.set(n.x, 3.5, n.z);
        toast('Checkpoint ' + M.idx + '/6');
        setObjective('Checkpoint <b>' + (M.idx + 1) + ' / 6</b>');
      }
    }
  },
  {
    name: 'The Big Score',
    desc: 'Hit the vault downtown, then vanish. The whole force will come for you.',
    timer: 0,
    start: function (M) {
      M.stage = 0;
      M.vault = { x: 0, z: 0 };
      M.escape = { x: -144, z: 144 };     // far corner
      markerA.position.set(M.vault.x, 3.5, M.vault.z); markerA.visible = true;
      setObjective('Crack the <b>vault</b> at the yellow marker.');
    },
    update: function (M) {
      if (M.stage === 0 && distTo(M.vault) < 3.5) {
        M.stage = 1; markerA.visible = false;
        markerB.position.set(M.escape.x, 3.5, M.escape.z); markerB.visible = true;
        G.wanted = 3; G.lastCrime = G.time;
        toast('ALARM! Get out of the city!');
        setObjective('You have the loot. <b>Escape</b> to the green marker!');
      } else if (M.stage === 1) {
        G.lastCrime = G.time;             // full heat until you escape
        if (distTo(M.escape) < 4.5) {
          G.wanted = 0;
          win('Clean getaway. Retire somewhere sunny.');
        }
      }
    }
  }
];

function startLevel(i) {
  resetWorld();
  G.missionIndex = i;
  var def = LEVELS[i];
  G.mission = { def: def, timeLeft: def.timer, timeUp: 0 };
  def.start(G.mission);
  elObj.classList.remove('hidden');
  beginPlay();
  toast(def.name);
}
function startFreeRoam() {
  resetWorld();
  G.missionIndex = -1;
  G.mission = null;
  elObj.classList.add('hidden');
  beginPlay();
  toast('Free Roam — cause a little chaos');
}
function beginPlay() {
  elMenu.classList.add('hidden');
  elEnd.classList.add('hidden');
  G.running = true; G.paused = false; G.busy = false;
  canvas.requestPointerLock();
}
function resetWorld() {
  G.health = 100; G.wanted = 0; G.lastCrime = -999;
  if (G.inCar) { G.inCar.stolen = false; G.inCar = null; }
  player.visible = true;
  player.position.set(3, 0, 20);
  playerYaw = 0; playerVelY = 0; camYaw = 0; camPitch = 0.32;
  markerA.visible = false; markerB.visible = false; chaseArrow.visible = false;
  clearCops();
  if (G.mission && G.mission.def.cleanup) G.mission.def.cleanup(G.mission);
  G.mission = null;
  aiCars.forEach(function (c) {
    c.stolen = false; c.wrecked = false; c.health = 100; c.isTarget = false; c.parked = false;
    c.mesh.rotation.z = 0;
    c.walker = makeWalker(LANE, rand(7, 11));
  });
  parked.forEach(function (c) { c.stolen = false; c.wrecked = false; c.health = 100; });
}

/* ---------- win / lose ---------- */
var save = { unlocked: 1 };
try {
  var s = localStorage.getItem('bcm_save');
  if (s) save = JSON.parse(s);
} catch (e) { /* storage unavailable — progress just won't persist */ }
function persist() {
  try { localStorage.setItem('bcm_save', JSON.stringify(save)); } catch (e) {}
}

function win(msg) {
  if (G.busy) return;
  G.busy = true;
  if (G.missionIndex >= 0 && G.missionIndex + 1 >= save.unlocked) {
    save.unlocked = Math.min(LEVELS.length, G.missionIndex + 2);
    persist();
  }
  endScreen('LEVEL COMPLETE', msg, true);
}
function lose(title, msg) {
  if (G.busy) return;
  G.busy = true;
  endScreen(title, msg, false);
}
function endScreen(title, msg, wonIt) {
  G.running = false;
  document.exitPointerLock();
  elEndTitle.textContent = title;
  elEndMsg.textContent = msg;
  var next = document.getElementById('nextbtn');
  next.style.display = (wonIt && G.missionIndex >= 0 && G.missionIndex + 1 < LEVELS.length) ? '' : 'none';
  var retry = document.getElementById('retrybtn');
  retry.textContent = G.missionIndex >= 0 ? 'Retry' : 'Back to it';
  elEnd.classList.remove('hidden');
  buildMenu();
}

/* ---------- menu ---------- */
function buildMenu() {
  var holder = document.getElementById('levels');
  holder.innerHTML = '';
  if (G.paused) {
    var rb = document.createElement('button');
    rb.className = 'btn';
    rb.style.width = '100%';
    rb.textContent = '▶ Resume';
    rb.onclick = function () {
      elMenu.classList.add('hidden');
      G.running = true; G.paused = false;
      canvas.requestPointerLock();
    };
    holder.appendChild(rb);
  }
  LEVELS.forEach(function (lv, i) {
    var b = document.createElement('button');
    b.className = 'btn lvbtn';
    var locked = i + 1 > save.unlocked;
    b.disabled = locked;
    b.innerHTML = (locked ? '🔒 ' : '') + (i + 1) + '. ' + lv.name;
    b.title = lv.desc;
    b.onclick = function () { startLevel(i); };
    holder.appendChild(b);
  });
}
function showMenu(pausing) {
  if (pausing) { G.paused = true; document.exitPointerLock(); }
  G.running = false;
  buildMenu();
  elMenu.classList.remove('hidden');
}
document.getElementById('freeroam').onclick = startFreeRoam;
document.getElementById('retrybtn').onclick = function () {
  if (G.missionIndex >= 0) startLevel(G.missionIndex); else startFreeRoam();
};
document.getElementById('nextbtn').onclick = function () { startLevel(G.missionIndex + 1); };
document.getElementById('menubtn').onclick = function () {
  elEnd.classList.add('hidden'); showMenu(false);
};
buildMenu();

/* ---------- damage / wanted ---------- */
function addWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 3);
  G.lastCrime = G.time;
}
function damagePlayer(n, cause) {
  if (!G.running || G.busy) return;
  G.health -= n;
  if (G.health <= 0) {
    G.health = 0;
    lose('WASTED', cause || 'The city wins this round.');
  }
}

/* ---------- minimap (static layer pre-rendered) ---------- */
var mapStatic = document.createElement('canvas');
mapStatic.width = mini.width; mapStatic.height = mini.height;
(function drawStatic() {
  var c = mapStatic.getContext('2d');
  var S = mini.width / (BOUND * 2 + 12);
  function wx(x) { return (x + BOUND + 6) * S; }
  function wz(z) { return (z + BOUND + 6) * S; }
  c.fillStyle = '#3a3d42';
  c.fillRect(0, 0, mini.width, mini.height);
  // blocks
  for (var bx = -GRID; bx < GRID; bx++) {
    for (var bz = -GRID; bz < GRID; bz++) {
      var x = bx * CELL + ROAD_W / 2, z = bz * CELL + ROAD_W / 2;
      c.fillStyle = isPark(bx, bz) ? '#4e7a42' : '#84847c';
      c.fillRect(wx(x), wz(z), (CELL - ROAD_W) * S, (CELL - ROAD_W) * S);
    }
  }
  c.fillStyle = '#5c5e64';
  buildingAABBs.forEach(function (b) {
    c.fillRect(wx(b.x1), wz(b.z1), (b.x2 - b.x1) * S, (b.z2 - b.z1) * S);
  });
})();
function drawMinimap() {
  var S = mini.width / (BOUND * 2 + 12);
  function wx(x) { return (x + BOUND + 6) * S; }
  function wz(z) { return (z + BOUND + 6) * S; }
  mctx.drawImage(mapStatic, 0, 0);
  // mission markers
  function dot(v, color, r) {
    mctx.fillStyle = color;
    mctx.beginPath();
    mctx.arc(wx(v.x), wz(v.z), r, 0, 7);
    mctx.fill();
  }
  if (markerA.visible) dot(markerA.position, '#ffd23f', 4);
  if (markerB.visible) dot(markerB.position, '#53d769', 4);
  if (chaseArrow.visible) dot(chaseArrow.position, '#ff4444', 3.5);
  cops.forEach(function (cp) { dot(cp.mesh.position, '#4488ff', 3); });
  // player triangle
  var p = playerPos();
  var yaw = G.inCar ? G.inCar.yaw : playerYaw;
  mctx.save();
  mctx.translate(wx(p.x), wz(p.z));
  mctx.rotate(-yaw);
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  mctx.moveTo(0, -5); mctx.lineTo(3.5, 4); mctx.lineTo(-3.5, 4);
  mctx.closePath(); mctx.fill();
  mctx.restore();
}

/* ---------- HUD ---------- */
function updateHUD() {
  elHealth.style.width = G.health + '%';
  var s = '';
  for (var i = 0; i < 3; i++) s += '<span class="' + (i < G.wanted ? '' : 'off') + '">★</span>';
  elStars.innerHTML = s;
  if (G.mission && G.mission.def.timer > 0) {
    var t = Math.max(0, G.mission.timeLeft);
    elTimer.textContent = Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2);
    elTimer.className = t < 15 ? 'low' : '';
  } else {
    elTimer.textContent = '';
  }
}

/* ---------- per-frame updates ---------- */
function updatePlayerOnFoot(dt) {
  var f = 0, r = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyA || keys.ArrowLeft) r -= 1;
  if (keys.KeyD || keys.ArrowRight) r += 1;
  var spd = (keys.ShiftLeft || keys.ShiftRight) ? RUN_SPEED : WALK_SPEED;
  var moving = (f !== 0 || r !== 0);
  if (moving) {
    var ang = camYaw + Math.atan2(-r, f);
    var vx = Math.sin(ang) * spd, vz = Math.cos(ang) * spd;
    var res = collideCircle(player.position.x + vx * dt, player.position.z + vz * dt, 0.45);
    player.position.x = res.x; player.position.z = res.z;
    playerYaw = lerpAngle(playerYaw, ang, 10 * dt);
    walkPhase += dt * (spd === RUN_SPEED ? 13 : 9);
    animateWalk(player, walkPhase, 0.7);
  } else {
    animateWalk(player, 0, 0);
  }
  // jump / gravity
  if ((keys.Space) && playerOnGround) { playerVelY = JUMP_V; playerOnGround = false; }
  if (!playerOnGround) {
    playerVelY -= GRAVITY * dt;
    player.position.y += playerVelY * dt;
    if (player.position.y <= 0) { player.position.y = 0; playerVelY = 0; playerOnGround = true; }
  }
  player.rotation.y = playerYaw;
}

function updatePlayerCar(car, dt) {
  var thr = 0;
  if (keys.KeyW || keys.ArrowUp) thr = 1;
  if (keys.KeyS || keys.ArrowDown) thr = -1;
  var steer = 0;
  if (keys.KeyA || keys.ArrowLeft) steer = 1;
  if (keys.KeyD || keys.ArrowRight) steer = -1;

  if (thr > 0) car.speed += CAR_ACCEL * dt;
  else if (thr < 0) car.speed -= (car.speed > 0 ? 22 : CAR_ACCEL * 0.7) * dt;
  else car.speed *= (1 - 1.2 * dt);
  if (keys.Space) car.speed *= (1 - 5 * dt);
  car.speed = clamp(car.speed, CAR_REV, CAR_MAXSPD);

  var grip = clamp(Math.abs(car.speed) / 8, 0, 1);
  car.yaw += steer * CAR_TURN * grip * dt * (car.speed >= 0 ? 1 : -1);

  var nx = car.mesh.position.x + Math.sin(car.yaw) * car.speed * dt;
  var nz = car.mesh.position.z + Math.cos(car.yaw) * car.speed * dt;
  var res = collideCircle(nx, nz, 1.5);
  if (res.hit) {
    var impact = Math.abs(car.speed);
    if (impact > 14) { car.health -= impact; toast('CRUNCH'); }
    car.speed *= -0.25;
  }
  car.mesh.position.set(res.x, 0, res.z);
  car.mesh.rotation.y = car.yaw;

  // ram AI traffic: bounce them, lose a little speed
  aiCars.forEach(function (o) {
    if (o === car || o.stolen) return;
    var d = o.mesh.position.distanceTo(car.mesh.position);
    if (d < 2.8 && Math.abs(car.speed) > 4) {
      car.speed *= 0.75;
      o.walker = makeWalker(LANE, rand(7, 11));  // scare it onto a new route
    }
  });

  // run over pedestrians (cartoon knockdown, no gore)
  if (Math.abs(car.speed) > 6) {
    peds.forEach(function (pd) {
      if (pd.down > 0) return;
      if (pd.mesh.position.distanceTo(car.mesh.position) < 1.9) {
        pd.down = 8;
        pd.mesh.rotation.x = -Math.PI / 2;
        pd.mesh.position.y = 0.35;
        addWanted(1);
        toast('Hit and run! ★');
      }
    });
  }

  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    car.mesh.rotation.z = 0.12;
    G.inCar = null;
    car.stolen = false;
    var out = collideCircle(car.mesh.position.x + 2.2, car.mesh.position.z, 0.5);
    player.position.set(out.x, 0, out.z);
    player.visible = true;
    damagePlayer(30, 'Never trust a lease.');
    toast('Car totaled!');
  }
}

function updateTraffic(dt) {
  aiCars.forEach(function (c) {
    if (c.stolen || c.wrecked || c.parked) return;
    var s = walkerStep(c.walker, dt);
    c.mesh.position.set(s.x, 0, s.z);
    c.mesh.rotation.y = s.yaw;
    c.yaw = s.yaw;
    c.speed = c.walker.speed;
  });
  peds.forEach(function (pd) {
    if (pd.down > 0) {
      pd.down -= dt;
      if (pd.down <= 0) {   // dust off and walk away
        pd.mesh.rotation.x = 0;
        pd.mesh.position.y = 0;
        pd.walker = makeWalker(SIDEWALK * (Math.random() < 0.5 ? 1 : -1), rand(1.4, 2.4));
      }
      return;
    }
    var s = walkerStep(pd.walker, dt);
    pd.mesh.position.set(s.x, 0, s.z);
    pd.mesh.rotation.y = s.yaw;
    pd.phase += dt * 7;
    animateWalk(pd.mesh, pd.phase, 0.5);
  });
}

function updateCops(dt) {
  // spawn / despawn with wanted level
  var want = G.wanted > 0 ? G.wanted + 1 : 0;
  while (cops.length < want) spawnCop();
  if (G.wanted === 0 && cops.length) clearCops();

  var p = playerPos();
  cops.forEach(function (cp) {
    if (cp.wrecked) return;
    cp.blink += dt;
    if (cp.mesh.userData.lights) {
      var on = Math.floor(cp.blink * 6) % 2 === 0;
      cp.mesh.userData.lights[0].visible = on;
      cp.mesh.userData.lights[1].visible = !on;
    }
    var dx = p.x - cp.mesh.position.x, dz = p.z - cp.mesh.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var desired = Math.atan2(dx, dz);
    cp.yaw = lerpAngle(cp.yaw, desired, 2.2 * dt);
    var targetSpeed = dist > 6 ? 20 + G.wanted * 2 : 8;
    cp.speed += clamp(targetSpeed - cp.speed, -30 * dt, 14 * dt);
    var nx = cp.mesh.position.x + Math.sin(cp.yaw) * cp.speed * dt;
    var nz = cp.mesh.position.z + Math.cos(cp.yaw) * cp.speed * dt;
    var res = collideCircle(nx, nz, 1.5);
    if (res.hit) cp.speed *= 0.4;
    cp.mesh.position.set(res.x, 0, res.z);
    cp.mesh.rotation.y = cp.yaw;

    // contact with the player
    if (!G.inCar && dist < 2.4 && G.wanted > 0) {
      lose('BUSTED', 'Should have kept driving.');
    } else if (G.inCar && dist < 3.0 && cp.speed > 10) {
      G.inCar.health -= 14;
      G.inCar.speed *= 0.8;
      cp.speed *= 0.3;
      toast('PIT maneuver!');
    }
  });

  // heat decay: stay clean and far away long enough
  if (G.wanted > 0 && G.time - G.lastCrime > 20) {
    var nearest = 1e9;
    cops.forEach(function (cp) {
      nearest = Math.min(nearest, cp.mesh.position.distanceTo(p));
    });
    if (nearest > 50 && G.time - G.lastDecay > 12) {
      G.wanted--;
      G.lastDecay = G.time;
      toast(G.wanted === 0 ? 'You lost them.' : 'Heat cooling off…');
    }
  }
}

function updateCamera(dt) {
  var target = playerPos().clone();
  target.y += G.inCar ? 2.2 : 1.7;
  var d = camDist * (G.inCar ? 1.25 : 1);
  var dir = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch));
  // occlusion: march the ray, stop before entering a building
  var steps = 12, safe = d;
  for (var s = 1; s <= steps; s++) {
    var f = (d * s) / steps;
    var px = target.x - dir.x * f, pz = target.z - dir.z * f;
    var py = target.y + dir.y * f;
    var blocked = false;
    for (var i = 0; i < buildingAABBs.length; i++) {
      var b = buildingAABBs[i];
      if (py < b.h + 0.3 && pointInAABB(px, pz, b, 0.4)) { blocked = true; break; }
    }
    if (blocked) { safe = Math.max(1.6, (d * (s - 1)) / steps); break; }
  }
  camera.position.set(
    target.x - dir.x * safe,
    Math.max(0.6, target.y + dir.y * safe),
    target.z - dir.z * safe);
  camera.lookAt(target);
}

/* ---------- main loop ---------- */
var last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.running) { renderer.render(scene, camera); return; }
  G.time += dt;

  if (G.inCar) updatePlayerCar(G.inCar, dt);
  else updatePlayerOnFoot(dt);

  updateTraffic(dt);
  updateCops(dt);

  // markers pulse
  var pulse = 1 + Math.sin(G.time * 3.5) * 0.12;
  markerA.scale.set(pulse, 1, pulse);
  markerB.scale.set(pulse, 1, pulse);

  // mission tick
  if (G.mission && !G.busy) {
    var M = G.mission;
    if (M.def.timer > 0) {
      M.timeLeft -= dt;
      if (M.timeLeft <= 0 && !M.def.countUpWin) {
        lose('OUT OF TIME', 'The clock is undefeated.');
      }
    }
    if (!G.busy) M.def.update(M, dt);
  }

  updateCamera(dt);
  updateHUD();
  drawMinimap();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* first paint of camera before any game starts */
camera.position.set(30, 26, 60);
camera.lookAt(0, 0, 0);

})();
