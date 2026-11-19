// Puerto Solano itself: the sunset sky, the avenue grid, tower blocks with lit
// windows, palms and streetlights, the beach, the harbor and the pier. Building
// the city also produces the collision boxes and the parking spots the rest of
// the game drives and walks against.
import * as THREE from 'three';
import { AVENUES, BLOCK_CENTERS, BLOCK_SIZE, COLORS, ROAD_WIDTH, WATER_Z } from './config.js';

/** A canvas texture helper: draw with the given painter, set repeat wrapping. */
function makeTexture(width, height, painter, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  painter(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Asphalt with speckle, pale edge lines and a dashed centre line, one 14 m tile. */
function roadTexture() {
  return makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = '#c8cdd2';
    ctx.fillRect(6, 0, 4, h);
    ctx.fillRect(w - 10, 0, 4, h);
    ctx.fillStyle = '#e8b23a';
    ctx.fillRect(w / 2 - 3, h * 0.28, 6, h * 0.44);
  });
}

/** Plain asphalt for intersections, where no lane lines belong. */
function asphaltTexture() {
  return makeTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

/** A building facade: coloured walls and a grid of windows, some lit for the dusk. */
function facadeTextures(rng, baseColor) {
  const lit = [];
  const map = makeTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.16)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 16; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const x = 12 + col * 30;
        const y = 14 + row * 30;
        const isLit = rng.chance(0.42);
        lit.push({ x, y, isLit });
        ctx.fillStyle = isLit ? '#ffd88a' : '#1c2a38';
        ctx.fillRect(x, y, 18, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fillRect(x, y, 18, 5);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - 26, w, 26);
  });
  const emissiveMap = makeTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    for (const win of lit) {
      if (!win.isLit) continue;
      ctx.fillStyle = '#ffb85c';
      ctx.fillRect(win.x, win.y, 18, 18);
    }
  });
  return { map, emissiveMap };
}

/** A palm frond drawn once and reused on every palm in the city. */
function frondTexture() {
  const texture = makeTexture(128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#2e6b2e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.quadraticCurveTo(w / 2, h * 0.4, w / 2, 6);
    ctx.stroke();
    ctx.lineWidth = 4;
    for (let i = 0; i < 11; i += 1) {
      const y = h - 14 - i * 20;
      const len = 52 - Math.abs(i - 5) * 5;
      ctx.strokeStyle = i % 2 ? '#35793a' : '#2a632c';
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 - len * 0.6, y - 12, w / 2 - len, y + 8);
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 + len * 0.6, y - 12, w / 2 + len, y + 8);
      ctx.stroke();
    }
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A billboard face with an original Puerto Solano advert. */
function billboardTexture(headline, subline, bg, fg) {
  return makeTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.fillText(headline, w / 2, h / 2 - 8);
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText(subline, w / 2, h / 2 + 52);
  });
}

/** Push an axis-aligned collision box into the list. */
function addCollider(colliders, cx, cz, halfW, halfD) {
  colliders.push({ minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD, maxZ: cz + halfD });
}

/**
 * Resolve a circle at (x, z) against every collider: returns the pushed-out
 * position and whether anything was hit (and how hard, for crash sounds).
 */
export function collideCircle(x, z, radius, colliders) {
  let hit = 0;
  for (const box of colliders) {
    const nearX = Math.max(box.minX, Math.min(x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - nearX;
    const dz = z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nearX + (dx / d) * radius;
      z = nearZ + (dz / d) * radius;
      hit = Math.max(hit, 1 - d / radius);
    } else {
      // Centre inside the box: leave by the shallowest side.
      const left = x - box.minX;
      const right = box.maxX - x;
      const top = z - box.minZ;
      const bottom = box.maxZ - z;
      const shallowest = Math.min(left, right, top, bottom);
      if (shallowest === left) x = box.minX - radius;
      else if (shallowest === right) x = box.maxX + radius;
      else if (shallowest === top) z = box.minZ - radius;
      else z = box.maxZ + radius;
      hit = 1;
    }
  }
  return { x, z, hit };
}

/** True when the point sits on a road (used to keep spawns and AI honest). */
export function isOnRoad(x, z) {
  const half = ROAD_WIDTH / 2 + 0.5;
  for (const a of AVENUES) {
    if (Math.abs(x - a) < half || Math.abs(z - a) < half) return true;
  }
  return false;
}

/**
 * Build the whole city into the scene. Returns the colliders, parking spots,
 * the water mesh (its texture scrolls in update) and a per-frame update.
 */
export function buildCity(scene, rng) {
  const colliders = [];
  const parkedSpots = [];
  const occluders = [];

  // --- Sky: a gradient dome, warm at the horizon, deep blue overhead. ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(COLORS.skyTop) },
        horizon: { value: new THREE.Color(COLORS.skyHorizon) },
        low: { value: new THREE.Color(COLORS.skyLow) },
      },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 low; varying vec3 vPos;'
        + 'void main(){ float h = normalize(vPos).y; vec3 c = h > 0.12 ? mix(horizon, top, smoothstep(0.12, 0.65, h)) : mix(low, horizon, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(COLORS.fog, 190, 780);

  const sun = new THREE.DirectionalLight(COLORS.sun, 2.9);
  sun.position.set(-260, 150, 190);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -210;
  sun.shadow.camera.right = 210;
  sun.shadow.camera.top = 210;
  sun.shadow.camera.bottom = -210;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x93b8e8, 0x6b4a35, 0.85));
  const bounce = new THREE.DirectionalLight(0xff8f5c, 0.5);
  bounce.position.set(200, 60, -160);
  scene.add(bounce);

  // --- Ground base under everything. ---
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x3c4147, roughness: 1 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.05;
  base.receiveShadow = true;
  scene.add(base);

  // --- Roads: strips along every avenue, plain squares at crossings. ---
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.94 });
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.94 });
  const span = AVENUES[AVENUES.length - 1] - AVENUES[0] + ROAD_WIDTH + 30;
  for (const a of AVENUES) {
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, span), roadMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.rotation.z = Math.PI / 2;
    alongZ.position.set(a, 0, 0);
    alongZ.receiveShadow = true;
    scene.add(alongZ);
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, span), roadMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.001, a);
    alongX.receiveShadow = true;
    scene.add(alongX);
    for (const b of AVENUES) {
      const crossing = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH), asphaltMat);
      crossing.rotation.x = -Math.PI / 2;
      crossing.position.set(a, 0.002, b);
      crossing.receiveShadow = true;
      scene.add(crossing);
    }
  }
  // Harbor Avenue runs on south to the pier.
  const harbor = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH + 10, 60), asphaltMat);
  harbor.rotation.x = -Math.PI / 2;
  harbor.rotation.z = Math.PI / 2;
  harbor.position.set(0, 0.001, 128);
  harbor.receiveShadow = true;
  scene.add(harbor);

  // --- Blocks: sidewalk slab, then towers, slabs, quads or a parking lot. ---
  const facadeVariants = ['#c96f4a', '#d9c9a8', '#5f8a8b', '#b8b0a4', '#7a6a8a', '#a85638'].map(
    (color) => facadeTextures(rng, color),
  );
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 1 });
  const slabGeo = new THREE.BoxGeometry(BLOCK_SIZE + 2, 0.36, BLOCK_SIZE + 2);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a423c, roughness: 1 });

  function addBuilding(cx, cz, w, d, h) {
    const facades = rng.pick(facadeVariants);
    const wallMat = new THREE.MeshStandardMaterial({
      map: facades.map,
      emissiveMap: facades.emissiveMap,
      emissive: 0xffb85c,
      emissiveIntensity: 0.85,
      roughness: 0.9,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat]);
    mesh.position.set(cx, h / 2 + 0.18, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    occluders.push(mesh);
    addCollider(colliders, cx, cz, w / 2, d / 2);
    if (rng.chance(0.5)) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 8), roofMat);
      tank.position.set(cx + rng.range(-w / 4, w / 4), h + 1.5, cz + rng.range(-d / 4, d / 4));
      tank.castShadow = true;
      scene.add(tank);
    }
  }

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const slab = new THREE.Mesh(slabGeo, sidewalkMat);
      slab.position.set(bx, 0.18, bz);
      slab.receiveShadow = true;
      scene.add(slab);
      const pattern = rng.next();
      if (pattern < 0.3) {
        addBuilding(bx, bz, rng.range(19, 27), rng.range(19, 27), rng.range(26, 58));
      } else if (pattern < 0.62) {
        for (const ox of [-11, 11]) {
          for (const oz of [-11, 11]) {
            addBuilding(bx + ox, bz + oz, rng.range(14, 18), rng.range(14, 18), rng.range(9, 30));
          }
        }
      } else if (pattern < 0.82) {
        addBuilding(bx - 10, bz, rng.range(15, 19), rng.range(26, 34), rng.range(12, 24));
        addBuilding(bx + 11, bz, rng.range(13, 17), rng.range(20, 28), rng.range(8, 18));
      } else {
        // Open parking lot: flat asphalt, palms, room to steal cars from.
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE - 2, BLOCK_SIZE - 2), asphaltMat);
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(bx, 0.38, bz);
        lot.receiveShadow = true;
        scene.add(lot);
        for (let i = 0; i < 5; i += 1) {
          parkedSpots.push({
            x: bx - 15 + i * 7.5,
            z: bz + (i % 2 === 0 ? -12 : 12),
            heading: i % 2 === 0 ? 0 : Math.PI,
          });
        }
      }
    }
  }

  // --- Palms and streetlights, instanced: promenade rows and block corners. ---
  const palmPositions = [];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      for (const ox of [-20, 20]) {
        for (const oz of [-20, 20]) {
          if (rng.chance(0.8)) palmPositions.push({ x: bx + ox + rng.range(-2, 2), z: bz + oz + rng.range(-2, 2) });
        }
      }
    }
  }
  for (let x = -140; x <= 140; x += 14) palmPositions.push({ x, z: 124.5 });
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 4.2, 5);
  trunkGeo.translate(0, 2.1, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPositions.length);
  const frondGeo = new THREE.PlaneGeometry(2.4, 3.4);
  frondGeo.translate(0, 1.5, 0);
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
  });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmPositions.length * 6);
  const dummy = new THREE.Object3D();
  let frondIndex = 0;
  palmPositions.forEach((pos, i) => {
    const lean = rng.range(-0.09, 0.09);
    dummy.position.set(pos.x, 0, pos.z);
    dummy.rotation.set(lean, rng.range(0, Math.PI * 2), lean);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    addCollider(colliders, pos.x, pos.z, 0.35, 0.35);
    for (let f = 0; f < 6; f += 1) {
      dummy.position.set(pos.x + lean * -8, 4.15, pos.z + lean * -8);
      dummy.rotation.set(0.9 + rng.range(-0.15, 0.15), (f / 6) * Math.PI * 2 + rng.range(-0.2, 0.2), 0);
      dummy.updateMatrix();
      fronds.setMatrixAt(frondIndex, dummy.matrix);
      frondIndex += 1;
    }
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.8 });
  const lampGeo = new THREE.SphereGeometry(0.28, 8, 6);
  lampGeo.translate(0, 5.6, 0);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc37a, emissiveIntensity: 1.6 });
  const lightPositions = [];
  for (const a of AVENUES) {
    for (let s = -130; s <= 130; s += 29) {
      lightPositions.push({ x: a + 8.2, z: s });
      lightPositions.push({ x: s, z: a - 8.2 });
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightPositions.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightPositions.length);
  lightPositions.forEach((pos, i) => {
    dummy.position.set(pos.x, 0, pos.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    lamps.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles);
  scene.add(lamps);

  // --- Billboards with the city's own adverts. ---
  const adverts = [
    billboardTexture('VIREO MOTORS', 'Feel the harbor wind', '#123a5c', '#ffd88a'),
    billboardTexture('CAFE SOLANO', 'Open all night - Pier 9', '#5c1f14', '#ffe9c9'),
    billboardTexture('NEON HARBOR FM', '101.3 - Sunset sounds', '#2c1454', '#7ae7ff'),
    billboardTexture('HOTEL MARINA', 'Rooms with a sea view', '#0f4d3a', '#fff3b0'),
  ];
  const boardSpots = [
    { x: -66, z: -66, ry: Math.PI / 4 }, { x: 66, z: -8, ry: -Math.PI / 2 },
    { x: -8, z: 66, ry: Math.PI }, { x: 124, z: 124, ry: Math.PI * 0.75 },
  ];
  boardSpots.forEach((spot, i) => {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(13, 5.5, 0.4),
      new THREE.MeshStandardMaterial({ map: adverts[i % adverts.length], emissiveMap: adverts[i % adverts.length], emissive: 0xffffff, emissiveIntensity: 0.35 }),
    );
    board.position.set(spot.x, 9, spot.z);
    board.rotation.y = spot.ry;
    board.castShadow = true;
    scene.add(board);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.5, 0.5), poleMat);
    legs.position.set(spot.x, 3.2, spot.z);
    scene.add(legs);
    addCollider(colliders, spot.x, spot.z, 0.6, 0.6);
  });

  // --- Beach, sea and the harbor pier. ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 34),
    new THREE.MeshStandardMaterial({ color: COLORS.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, 140);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterTexture = makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#14607e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 240; i += 1) {
      ctx.fillStyle = `rgba(255,210,150,${Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 14, 2);
    }
  }, 24, 24);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 500),
    new THREE.MeshStandardMaterial({ map: waterTexture, roughness: 0.25, metalness: 0.35 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.25, WATER_Z + 240);
  scene.add(water);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(26, 0.7, 42), woodMat);
  pier.position.set(0, 0.35, 156);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  occluders.push(pier);
  addCollider(colliders, -13.5, 156, 0.5, 21);
  addCollider(colliders, 13.5, 156, 0.5, 21);

  const crateColors = [0xc2543a, 0x3a7ac2, 0x4aa85e, 0xc2a03a];
  for (let i = 0; i < 14; i += 1) {
    const size = rng.range(1.8, 3);
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: rng.pick(crateColors), roughness: 0.85 }),
    );
    const onPier = i < 6;
    crate.position.set(
      onPier ? rng.pick([-9, 9]) : rng.pick([-1, 1]) * rng.range(34, 120),
      size / 2 + (onPier ? 0.7 : 0),
      onPier ? rng.range(142, 168) : rng.range(126, 133),
    );
    crate.rotation.y = rng.range(0, Math.PI);
    crate.castShadow = true;
    scene.add(crate);
    if (!onPier) addCollider(colliders, crate.position.x, crate.position.z, size / 2, size / 2);
  }

  // Two harbor cranes watching over the docks.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd86f2e, roughness: 0.7 });
  for (const cx of [-52, 52]) {
    const crane = new THREE.Group();
    const legA = new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, 1.4), craneMat);
    legA.position.set(-6, 13, 0);
    const legB = legA.clone();
    legB.position.x = 6;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 1.6), craneMat);
    jib.position.set(2, 26, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), craneMat);
    cab.position.set(8, 24, 0);
    crane.add(legA, legB, jib, cab);
    crane.position.set(cx, 0, 138);
    crane.traverse((m) => { m.castShadow = true; });
    scene.add(crane);
    addCollider(colliders, cx - 6, 138, 1, 1);
    addCollider(colliders, cx + 6, 138, 1, 1);
  }

  // The warehouse Sal works out of, down by the water.
  const warehouse = new THREE.Mesh(
    new THREE.BoxGeometry(34, 11, 16),
    new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.95 }),
  );
  warehouse.position.set(-88, 5.5, 132);
  warehouse.castShadow = true;
  warehouse.receiveShadow = true;
  scene.add(warehouse);
  occluders.push(warehouse);
  addCollider(colliders, -88, 132, 17, 8);

  // Extra street parking along Harbor Avenue and near the garage.
  for (let x = -130; x <= 130; x += 13) {
    if (Math.abs(x) > 16) parkedSpots.push({ x, z: 122.5, heading: Math.PI / 2 });
  }
  parkedSpots.push({ x: 110.5, z: -70, heading: 0 }, { x: 110.5, z: -98, heading: Math.PI });

  return {
    colliders,
    parkedSpots,
    occluders,
    water,
    /** Scroll the water texture a little so the harbor shimmers. */
    update(dt) {
      waterTexture.offset.y += dt * 0.008;
      waterTexture.offset.x += dt * 0.003;
    },
  };
}
