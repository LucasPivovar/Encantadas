/**
 * Gerador Standalone de Arquivos Binários glTF 2.0 (.glb) e Wavefront (.obj)
 * para os 4 Modelos de Óculos da Coleção Encantadas.
 *
 * Não requer dependências externas (usa apenas `fs` e `path` do Node.js).
 * Gera malhas 3D suaves com normais calculadas, materiais PBR (ouro 18K,
 * acetato tartaruga, esmalte preto, lentes translúcidas e plaquetas de silicone)
 * prontas para importação direta no Blender (File -> Import -> glTF 2.0) ou Three.js.
 */

import fs from "node:fs";
import path from "node:path";

// ============================================================================
// ESTRUTURAS DE CONSTRUÇÃO DE MALHA 3D
// ============================================================================

class MeshBuilder {
  constructor(name, materialIndex = 0) {
    this.name = name;
    this.materialIndex = materialIndex;
    this.positions = []; // [x, y, z, ...]
    this.normals = [];   // [nx, ny, nz, ...]
    this.indices = [];   // [i0, i1, i2, ...]
  }

  addVertex(x, y, z, nx = 0, ny = 1, nz = 0) {
    const idx = this.positions.length / 3;
    this.positions.push(x, y, z);
    const len = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / len, ny / len, nz / len);
    return idx;
  }

  addTriangle(i0, i1, i2) {
    this.indices.push(i0, i1, i2);
  }

  addQuad(i0, i1, i2, i3) {
    this.indices.push(i0, i1, i2);
    this.indices.push(i0, i2, i3);
  }

  recomputeNormals() {
    const vCount = this.positions.length / 3;
    const accum = new Float64Array(vCount * 3);

    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i];
      const b = this.indices[i + 1];
      const c = this.indices[i + 2];

      const ax = this.positions[a * 3], ay = this.positions[a * 3 + 1], az = this.positions[a * 3 + 2];
      const bx = this.positions[b * 3], by = this.positions[b * 3 + 1], bz = this.positions[b * 3 + 2];
      const cx = this.positions[c * 3], cy = this.positions[c * 3 + 1], cz = this.positions[c * 3 + 2];

      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;

      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;

      accum[a * 3] += nx; accum[a * 3 + 1] += ny; accum[a * 3 + 2] += nz;
      accum[b * 3] += nx; accum[b * 3 + 1] += ny; accum[b * 3 + 2] += nz;
      accum[c * 3] += nx; accum[c * 3 + 1] += ny; accum[c * 3 + 2] += nz;
    }

    for (let v = 0; v < vCount; v++) {
      const nx = accum[v * 3], ny = accum[v * 3 + 1], nz = accum[v * 3 + 2];
      const len = Math.hypot(nx, ny, nz) || 1;
      this.normals[v * 3] = nx / len;
      this.normals[v * 3 + 1] = ny / len;
      this.normals[v * 3 + 2] = nz / len;
    }
  }
}

// ============================================================================
// PRIMITIVAS PARAMÉTRICAS DE ÓPTICA E JOALHERIA
// ============================================================================

function getLensContour2D(width, height, nExp = 3.6, topFlatness = 0.9, aviatorDrop = 0.0, segments = 64) {
  const pts = [];
  const rx = width / 2;
  const ry = height / 2;

  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    let x = rx * Math.pow(Math.abs(ct), 2 / nExp) * (ct >= 0 ? 1 : -1);
    let y = ry * Math.pow(Math.abs(st), 2 / nExp) * (st >= 0 ? 1 : -1);

    if (y > 0) y *= topFlatness;
    if (y < 0 && aviatorDrop !== 0) {
      y *= 1 + aviatorDrop * (x / rx);
    }
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Constrói uma lente óptica com curvatura esférica (camber) e wrap facial.
 * Coordenadas glTF padrão: X = largura, Y = altura, Z = profundidade (+Z frontal).
 */
function buildLensMesh(name, materialIndex, sideSign, centerX, centerY, width, height, thickness, nExp, topFlat, aviatorDrop) {
  const builder = new MeshBuilder(name, materialIndex);
  const contour = getLensContour2D(width, height, nExp, topFlat, aviatorDrop, 64);
  const n = contour.length;

  const centerFrontIdx = builder.addVertex(sideSign * centerX, centerY, 0.0022, 0, 0, 1);
  const centerBackIdx = builder.addVertex(sideSign * centerX, centerY, 0.0022 - thickness, 0, 0, -1);

  const frontRing = [];
  const backRing = [];

  for (let i = 0; i < n; i++) {
    const [lx, ly] = contour[i];
    const wx = sideSign * (centerX + lx);
    const wy = centerY + ly;

    const r2 = lx * lx + ly * ly;
    const camberZ = 0.0022 - r2 / (2 * 0.14);
    const wrapZ = -(wx * wx) / (2 * 0.21);
    const zFront = camberZ + wrapZ;
    const zBack = zFront - thickness;

    frontRing.push(builder.addVertex(wx, wy, zFront, 0, 0, 1));
    backRing.push(builder.addVertex(wx, wy, zBack, 0, 0, -1));
  }

  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    if (sideSign > 0) {
      builder.addTriangle(centerFrontIdx, frontRing[i], frontRing[ni]);
      builder.addTriangle(centerBackIdx, backRing[ni], backRing[i]);
    } else {
      builder.addTriangle(centerFrontIdx, frontRing[ni], frontRing[i]);
      builder.addTriangle(centerBackIdx, backRing[i], backRing[ni]);
    }
  }

  // Borda chanfrada da lente
  const edgeFront = [];
  const edgeBack = [];
  for (let i = 0; i < n; i++) {
    const vf = frontRing[i] * 3;
    const vb = backRing[i] * 3;
    edgeFront.push(builder.addVertex(builder.positions[vf], builder.positions[vf + 1], builder.positions[vf + 2]));
    edgeBack.push(builder.addVertex(builder.positions[vb], builder.positions[vb + 1], builder.positions[vb + 2]));
  }
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    if (sideSign > 0) {
      builder.addQuad(edgeFront[i], edgeBack[i], edgeBack[ni], edgeFront[ni]);
    } else {
      builder.addQuad(edgeFront[ni], edgeBack[ni], edgeBack[i], edgeFront[i]);
    }
  }

  builder.recomputeNormals();
  return builder;
}

/**
 * Constrói um aro de acetato 3D boleado com perfil elíptico suave ao redor da lente.
 */
function buildAcetateRimMesh(name, materialIndex, sideSign, centerX, centerY, width, height, rimThickRadial, rimDepthZ, nExp, topFlat, aviatorDrop) {
  const builder = new MeshBuilder(name, materialIndex);
  const contour = getLensContour2D(width, height, nExp, topFlat, aviatorDrop, 64);
  const n = contour.length;
  const profileSegs = 12;

  const rings = [];
  for (let i = 0; i < n; i++) {
    const [lx, ly] = contour[i];
    const dist = Math.hypot(lx, ly) || 1;
    const nx = lx / dist;
    const ny = ly / dist;

    // Espessura ligeiramente maior nas têmporas e parte superior
    const angle = Math.atan2(ly, lx);
    const localRadial = rimThickRadial * (1 + 0.22 * Math.pow(Math.sin(angle), 2));

    const midX = lx + nx * (localRadial * 0.5);
    const midY = ly + ny * (localRadial * 0.5);

    const ring = [];
    for (let p = 0; p < profileSegs; p++) {
      const phi = (2 * Math.PI * p) / profileSegs;
      const cPhi = Math.cos(phi);
      const sPhi = Math.sin(phi);

      const px = midX + nx * (localRadial * 0.55) * cPhi;
      const py = midY + ny * (localRadial * 0.55) * cPhi;

      const wx = sideSign * (centerX + px);
      const wy = centerY + py;
      const wrapZ = -(wx * wx) / (2 * 0.21);
      const wz = wrapZ + (rimDepthZ * 0.5) * sPhi;

      ring.push(builder.addVertex(wx, wy, wz));
    }
    rings.push(ring);
  }

  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    for (let p = 0; p < profileSegs; p++) {
      const np = (p + 1) % profileSegs;
      if (sideSign > 0) {
        builder.addQuad(rings[i][p], rings[ni][p], rings[ni][np], rings[i][np]);
      } else {
        builder.addQuad(rings[ni][p], rings[i][p], rings[i][np], rings[ni][np]);
      }
    }
  }

  builder.recomputeNormals();
  return builder;
}

/**
 * Varre um perfil elíptico ao longo de uma polilinha 3D (para pontes, hastes e braços de plaqueta).
 */
function buildTubeAlongPath(name, materialIndex, pathPoints, radiusX, radiusY, radialSegs = 14) {
  const builder = new MeshBuilder(name, materialIndex);
  const m = pathPoints.length;
  const rings = [];

  for (let i = 0; i < m; i++) {
    const curr = pathPoints[i];
    const prev = i > 0 ? pathPoints[i - 1] : curr;
    const next = i < m - 1 ? pathPoints[i + 1] : curr;

    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    let tz = next[2] - prev[2];
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;

    // Vetor auxiliar perpendicular
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(ty) > 0.9) { ux = 1; uy = 0; uz = 0; }

    // Binormal B = T x U
    let bx = ty * uz - tz * uy;
    let by = tz * ux - tx * uz;
    let bz = tx * uy - ty * ux;
    const bLen = Math.hypot(bx, by, bz) || 1;
    bx /= bLen; by /= bLen; bz /= bLen;

    // Normal N = B x T
    const nx = by * tz - bz * ty;
    const ny = bz * tx - bx * tz;
    const nz = bx * ty - by * tx;

    const scale = curr[3] !== undefined ? curr[3] : 1.0;
    const ring = [];
    for (let s = 0; s < radialSegs; s++) {
      const phi = (2 * Math.PI * s) / radialSegs;
      const c = Math.cos(phi) * radiusX * scale;
      const sn = Math.sin(phi) * radiusY * scale;

      const vx = curr[0] + bx * c + nx * sn;
      const vy = curr[1] + by * c + ny * sn;
      const vz = curr[2] + bz * c + nz * sn;
      ring.push(builder.addVertex(vx, vy, vz));
    }
    rings.push(ring);
  }

  for (let i = 0; i < m - 1; i++) {
    for (let s = 0; s < radialSegs; s++) {
      const ns = (s + 1) % radialSegs;
      builder.addQuad(rings[i][s], rings[i + 1][s], rings[i + 1][ns], rings[i][ns]);
    }
  }

  // Tampas das extremidades (caps)
  const startCenter = builder.addVertex(pathPoints[0][0], pathPoints[0][1], pathPoints[0][2]);
  const endPt = pathPoints[m - 1];
  const endCenter = builder.addVertex(endPt[0], endPt[1], endPt[2]);
  for (let s = 0; s < radialSegs; s++) {
    const ns = (s + 1) % radialSegs;
    builder.addTriangle(startCenter, rings[0][ns], rings[0][s]);
    builder.addTriangle(endCenter, rings[m - 1][s], rings[m - 1][ns]);
  }

  builder.recomputeNormals();
  return builder;
}

/**
 * Cria elipsoide / escultura deformada (usado para o Leão, Pantera, Rebites e Plaquetas).
 */
function buildSculptedSphere(name, materialIndex, center, radii, uSegs = 24, vSegs = 18, sculptFn = null) {
  const builder = new MeshBuilder(name, materialIndex);
  const grid = [];

  for (let v = 0; v <= vSegs; v++) {
    const theta = (Math.PI * v) / vSegs;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    const row = [];

    for (let u = 0; u <= uSegs; u++) {
      const phi = (2 * Math.PI * u) / uSegs;
      let lx = radii[0] * st * Math.cos(phi);
      let ly = radii[1] * ct;
      let lz = radii[2] * st * Math.sin(phi);

      if (sculptFn) {
        const mod = sculptFn(lx, ly, lz, theta, phi);
        lx = mod[0]; ly = mod[1]; lz = mod[2];
      }

      row.push(builder.addVertex(center[0] + lx, center[1] + ly, center[2] + lz));
    }
    grid.push(row);
  }

  for (let v = 0; v < vSegs; v++) {
    for (let u = 0; u < uSegs; u++) {
      builder.addQuad(grid[v][u], grid[v + 1][u], grid[v + 1][u + 1], grid[v][u + 1]);
    }
  }

  builder.recomputeNormals();
  return builder;
}

/**
 * Adiciona plaquetas nasais (silicone + braço dourado em S) ao modelo.
 */
function addNosePadsAndArms(meshes, goldMatIdx, padMatIdx, bridgeHalfX, centerY) {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const armPts = [
      [side * bridgeHalfX, centerY + 0.003, -0.001],
      [side * (bridgeHalfX + 0.0012), centerY + 0.001, -0.0042],
      [side * (bridgeHalfX - 0.0016), centerY - 0.004, -0.0068],
    ];
    meshes.push(buildTubeAlongPath(`NoseArm_${suffix}`, goldMatIdx, armPts, 0.00055, 0.00055, 10));

    const padCenter = [side * (bridgeHalfX - 0.0019), centerY - 0.005, -0.0078];
    meshes.push(buildSculptedSphere(`NosePad_${suffix}`, padMatIdx, padCenter, [0.0028, 0.0060, 0.0013], 18, 14));
    meshes.push(buildSculptedSphere(`NosePadCore_${suffix}`, goldMatIdx, padCenter, [0.0015, 0.0032, 0.0008], 12, 10));
  }
}

/**
 * Adiciona o par de hastes laterais anatômicas (orientadas para -Z, atrás das lentes).
 */
function addTemples(meshes, style, goldMatIdx, tipMatIdx, hingeX, hingeY, hingeZ, length = 0.142) {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const x0 = side * hingeX;

    if (style === "metal_plus_tip") {
      const zMid = hingeZ - length * 0.44;
      const metalPts = [
        [x0, hingeY, hingeZ, 1.1],
        [x0 + side * 0.001, hingeY, hingeZ - length * 0.22, 1.0],
        [x0 + side * 0.0004, hingeY, zMid, 0.95],
      ];
      meshes.push(buildTubeAlongPath(`TempleMetal_${suffix}`, goldMatIdx, metalPts, 0.0013, 0.0018, 12));

      const tipPts = [
        [x0 + side * 0.0004, hingeY, zMid + 0.002, 0.9],
        [x0 - side * 0.0010, hingeY - 0.0005, hingeZ - length * 0.68, 1.15],
        [x0 - side * 0.0045, hingeY - 0.0075, hingeZ - length * 0.84, 1.25],
        [x0 - side * 0.0105, hingeY - 0.0210, hingeZ - length * 0.96, 1.1],
        [x0 - side * 0.0135, hingeY - 0.0255, hingeZ - length * 1.01, 0.75],
      ];
      meshes.push(buildTubeAlongPath(`TempleTip_${suffix}`, tipMatIdx, tipPts, 0.0018, 0.0028, 14));
    } else {
      const isBold = style === "full_acetate_bold";
      const rx = isBold ? 0.0022 : 0.0017;
      const ry = isBold ? 0.0052 : 0.0032;

      const fullPts = [
        [x0, hingeY, hingeZ, 1.05],
        [x0 + side * 0.0010, hingeY, hingeZ - length * 0.35, 1.0],
        [x0 - side * 0.0015, hingeY - 0.0010, hingeZ - length * 0.70, 0.85],
        [x0 - side * 0.0065, hingeY - 0.0105, hingeZ - length * 0.88, 0.95],
        [x0 - side * 0.0135, hingeY - 0.0240, hingeZ - length * 1.00, 0.70],
      ];
      meshes.push(buildTubeAlongPath(`TempleAcetate_${suffix}`, tipMatIdx, fullPts, rx, ry, 14));
    }
  }
}

// ============================================================================
// DEFINIÇÃO DOS 4 MODELOS DE ÓCULOS
// ============================================================================

const MATERIALS_CATALOG = [
  // 0: Ouro 18K Polido
  { name: "MAT_Gold_18K", baseColor: [0.88, 0.71, 0.34, 1.0], metallic: 1.0, roughness: 0.15, alphaMode: "OPAQUE" },
  // 1: Acetato Tartaruga Escuro (Modelo 1)
  { name: "MAT_Acetate_Tortoise_Dark", baseColor: [0.16, 0.07, 0.025, 1.0], metallic: 0.0, roughness: 0.12, alphaMode: "OPAQUE" },
  // 2: Acetato Tartaruga Clássico Âmbar/Mel (Modelo 4)
  { name: "MAT_Acetate_Tortoise_Classic", baseColor: [0.32, 0.14, 0.04, 1.0], metallic: 0.0, roughness: 0.11, alphaMode: "OPAQUE" },
  // 3: Acetato & Esmalte Preto Brilhante (Modelo 2 e manchas da Pantera)
  { name: "MAT_Black_Gloss_Enamel", baseColor: [0.02, 0.02, 0.025, 1.0], metallic: 0.0, roughness: 0.08, alphaMode: "OPAQUE" },
  // 4: Lente Degradê Marrom Imperial (Modelo 1)
  { name: "MAT_Lens_Brown_Gradient", baseColor: [0.28, 0.15, 0.08, 0.74], metallic: 0.05, roughness: 0.05, alphaMode: "BLEND" },
  // 5: Lente Laranja Âmbar Solar (Modelo 2)
  { name: "MAT_Lens_Orange_Amber", baseColor: [0.91, 0.41, 0.11, 0.68], metallic: 0.05, roughness: 0.05, alphaMode: "BLEND" },
  // 6: Lente Chá Degradê Suave (Modelo 3 Rimless)
  { name: "MAT_Lens_Tea_Gradient", baseColor: [0.46, 0.27, 0.16, 0.62], metallic: 0.05, roughness: 0.05, alphaMode: "BLEND" },
  // 7: Lente Café Escuro Sólido (Modelo 4)
  { name: "MAT_Lens_Dark_Coffee", baseColor: [0.15, 0.08, 0.04, 0.82], metallic: 0.05, roughness: 0.05, alphaMode: "BLEND" },
  // 8: Silicone Translúcido (Plaquetas Nasais)
  { name: "MAT_Silicone_Crystal", baseColor: [0.95, 0.94, 0.90, 0.52], metallic: 0.0, roughness: 0.20, alphaMode: "BLEND" },
];

function generateModel01_ImperialLeao() {
  const meshes = [];
  const cx = 0.0355, cy = 0.0, lw = 0.055, lh = 0.043;

  // Lentes e Aros de Acetato Tartaruga Escuro
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M01_Lens_${sfx}`, 4, side, cx, cy, lw, lh, 0.0022, 3.7, 0.90, 0.06));
    meshes.push(buildAcetateRimMesh(`M01_Rim_${sfx}`, 1, side, cx, cy, lw, lh, 0.0038, 0.0046, 3.7, 0.90, 0.06));
  }

  // Ponte Dupla Metálica Dourada + Barra Superior (Brow Bar)
  const topBarPts = [
    [-cx - 0.006, cy + lh * 0.49, 0.0024],
    [-0.012,      cy + lh * 0.50, 0.0028],
    [0.0,         cy + lh * 0.50, 0.0029],
    [0.012,       cy + lh * 0.50, 0.0028],
    [cx + 0.006,  cy + lh * 0.49, 0.0024],
  ];
  meshes.push(buildTubeAlongPath("M01_TopBrowBar_Gold", 0, topBarPts, 0.0011, 0.0011, 14));

  const lowerBridgePts = [
    [-0.0095, cy + 0.0075, 0.0018],
    [-0.0045, cy + 0.0092, 0.0026],
    [0.0,     cy + 0.0095, 0.0028],
    [0.0045,  cy + 0.0092, 0.0026],
    [0.0095,  cy + 0.0075, 0.0018],
  ];
  meshes.push(buildTubeAlongPath("M01_LowerBridge_Gold", 0, lowerBridgePts, 0.0012, 0.0012, 14));

  // Rebites Dourados Duplos nos cantos superiores
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildSculptedSphere(`M01_RivetTop_${sfx}`, 0, [side * (cx + lw * 0.46), cy + lh * 0.36, -0.0016], [0.0011, 0.0011, 0.0009], 12, 10));
    meshes.push(buildSculptedSphere(`M01_RivetLow_${sfx}`, 0, [side * (cx + lw * 0.51), cy + lh * 0.25, -0.0018], [0.0011, 0.0011, 0.0009], 12, 10));
  }

  // Plaquetas Nasais
  addNosePadsAndArms(meshes, 0, 8, 0.0092, cy);

  // Escultura 3D da Cabeça de Leão Dourada nas Dobradiças
  const hingeX = cx + lw * 0.5 + 0.0042;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(
      buildSculptedSphere(
        `M01_LionHead_${sfx}`,
        0,
        [side * hingeX, cy + 0.005, -0.0038],
        [0.0036, 0.0048, 0.0054],
        32,
        24,
        (lx, ly, lz, theta, phi) => {
          const maneAngle = Math.atan2(ly, lz);
          const wave = 1 + 0.16 * Math.cos(12 * maneAngle) + 0.08 * Math.sin(6 * maneAngle);
          return [lx * wave, ly * wave, lz * wave];
        }
      )
    );
  }

  // Hastes Douradas + Ponteiras Tartaruga
  addTemples(meshes, "metal_plus_tip", 0, 1, hingeX, cy + 0.005, -0.005, 0.142);

  return meshes;
}

function generateModel02_NavigatorAmbar() {
  const meshes = [];
  const cx = 0.036, cy = 0.0, lw = 0.056, lh = 0.046;

  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M02_Lens_${sfx}`, 5, side, cx, cy, lw, lh, 0.0022, 3.5, 0.92, 0.10));
    meshes.push(buildAcetateRimMesh(`M02_Rim_${sfx}`, 3, side, cx, cy, lw, lh, 0.0046, 0.0052, 3.5, 0.92, 0.10));
  }

  // Ponte Dupla em Acetato Preto
  const bridgeMainPts = [
    [-0.011, cy + 0.008, 0.001],
    [0.0,    cy + 0.0095, 0.002],
    [0.011,  cy + 0.008, 0.001],
  ];
  meshes.push(buildTubeAlongPath("M02_Bridge_Main", 3, bridgeMainPts, 0.0024, 0.0026, 14));

  const bridgeTopPts = [
    [-0.016, cy + lh * 0.45, 0.0012],
    [0.0,    cy + lh * 0.46, 0.0022],
    [0.016,  cy + lh * 0.45, 0.0012],
  ];
  meshes.push(buildTubeAlongPath("M02_Bridge_TopBar", 3, bridgeTopPts, 0.0022, 0.0024, 14));

  // Grampos Metálicos Dourados Horizontais em T nas Charneiras
  const hingeX = cx + lw * 0.5 + 0.0048;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    const tPts = [
      [side * (hingeX - 0.002), cy + 0.008, 0.001],
      [side * (hingeX + 0.0015), cy + 0.008, -0.001],
      [side * (hingeX + 0.0015), cy + 0.008, -0.008],
    ];
    meshes.push(buildTubeAlongPath(`M02_GoldTAccent_${sfx}`, 0, tPts, 0.0012, 0.0016, 12));
  }

  // Hastes em Acetato Preto
  addTemples(meshes, "full_acetate_slim", 0, 3, hingeX, cy + 0.008, -0.004, 0.144);

  return meshes;
}

function generateModel03_RimlessPantera() {
  const meshes = [];
  const cx = 0.0355, cy = 0.0, lw = 0.056, lh = 0.045;

  // Lentes Rimless (Sem Aro) Chanfradas
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M03_Lens_${sfx}`, 6, side, cx, cy, lw, lh, 0.0028, 3.8, 0.90, 0.04));
  }

  // Ponte Central Rimless em Ouro 18K
  const bridgePts = [
    [-0.012, cy + 0.006, 0.0022],
    [-0.005, cy + 0.008, 0.0034],
    [0.0,    cy + 0.0085, 0.0036],
    [0.005,  cy + 0.008, 0.0034],
    [0.012,  cy + 0.006, 0.0022],
  ];
  meshes.push(buildTubeAlongPath("M03_RimlessBridge_Gold", 0, bridgePts, 0.0011, 0.0011, 14));

  // Plaquetas Nasais
  addNosePadsAndArms(meshes, 0, 8, 0.0088, cy);

  // Escultura da Pantera Dourada com Manchas Pretas Esmaltadas mordendo a lente
  const hingeX = cx + lw * 0.5;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    // Cabeça e corpo alongado da pantera
    const pantherPts = [
      [side * (hingeX - 0.008), cy + 0.005, 0.0012, 0.65],
      [side * (hingeX - 0.003), cy + 0.005, 0.0015, 1.15],
      [side * (hingeX + 0.002), cy + 0.005, -0.0015, 1.05],
      [side * (hingeX + 0.002), cy + 0.005, -0.010, 0.75],
    ];
    meshes.push(buildTubeAlongPath(`M03_PantherBody_${sfx}`, 0, pantherPts, 0.0026, 0.0032, 16));

    // Manchas pretas esmaltadas (olhos e pintas da pantera)
    const spots = [
      [-0.0045, 0.0062, 0.0022],
      [-0.0045, 0.0038, 0.0022],
      [-0.0010, 0.0065, 0.0020],
      [-0.0010, 0.0035, 0.0020],
      [0.0022,  0.0058, -0.0035],
      [0.0022,  0.0042, -0.0065],
    ];
    spots.forEach((sp, idx) => {
      meshes.push(
        buildSculptedSphere(
          `M03_PantherSpot_${sfx}_${idx}`,
          3,
          [side * (hingeX + sp[0]), cy + sp[1], sp[2]],
          [0.0009, 0.0009, 0.0009],
          10,
          8
        )
      );
    });
  }

  // Hastes Finas Douradas com Ponteiras Tartaruga
  addTemples(meshes, "metal_plus_tip", 0, 1, hingeX + 0.002, cy + 0.005, -0.009, 0.140);

  return meshes;
}

function generateModel04_BoldTartaruga() {
  const meshes = [];
  const cx = 0.035, cy = 0.0, lw = 0.052, lh = 0.036;

  // Lentes Café Escuro + Aro Retangular Bold Tartaruga Clássico
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M04_Lens_${sfx}`, 7, side, cx, cy, lw, lh, 0.0024, 4.2, 0.95, 0.0));
    meshes.push(buildAcetateRimMesh(`M04_Rim_${sfx}`, 2, side, cx, cy, lw, lh, 0.0058, 0.0060, 4.2, 0.95, 0.0));
  }

  // Ponte Central Bold Esculpida
  const bridgePts = [
    [-0.011, cy + 0.005, 0.0012],
    [0.0,    cy + 0.0065, 0.0024],
    [0.011,  cy + 0.005, 0.0012],
  ];
  meshes.push(buildTubeAlongPath("M04_BoldBridge", 2, bridgePts, 0.0032, 0.0038, 14));

  // Emblema Dourado Duplo nas Têmporas
  const hingeX = cx + lw * 0.5 + 0.0058;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(
      buildSculptedSphere(
        `M04_GoldTempleBadge_${sfx}`,
        0,
        [side * (hingeX + 0.0014), cy + 0.002, -0.012],
        [0.0008, 0.0018, 0.0028],
        14,
        12
      )
    );
  }

  // Hastes Largas Bold em Acetato Tartaruga
  addTemples(meshes, "full_acetate_bold", 0, 2, hingeX, cy + 0.002, -0.003, 0.142);

  return meshes;
}

// ============================================================================
// EMPACOTADOR BINÁRIO GLTF 2.0 (.GLB) E WAVEFRONT (.OBJ)
// ============================================================================

function exportToGLB(meshes, filepath) {
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const gltfNodes = [];
  const binChunks = [];
  let byteOffset = 0;

  for (let mIdx = 0; mIdx < meshes.length; mIdx++) {
    const m = meshes[mIdx];
    const vCount = m.positions.length / 3;
    const iCount = m.indices.length;

    // Calcula bounding box (min/max) exigido pelo padrão glTF 2.0
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2];
      if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
    }

    const posArray = new Float32Array(m.positions);
    const normArray = new Float32Array(m.normals);
    const idxArray = new Uint32Array(m.indices);

    const posBuf = Buffer.from(posArray.buffer);
    const normBuf = Buffer.from(normArray.buffer);
    const idxBuf = Buffer.from(idxArray.buffer);

    // 1. Positions
    const posViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: posBuf.length, target: 34962 });
    binChunks.push(posBuf);
    byteOffset += posBuf.length;

    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      componentType: 5126, // FLOAT
      count: vCount,
      type: "VEC3",
      min,
      max,
    });

    // 2. Normals
    const normViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: normBuf.length, target: 34962 });
    binChunks.push(normBuf);
    byteOffset += normBuf.length;

    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      componentType: 5126, // FLOAT
      count: vCount,
      type: "VEC3",
    });

    // 3. Indices
    const idxViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: idxBuf.length, target: 34963 });
    binChunks.push(idxBuf);
    byteOffset += idxBuf.length;

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx,
      componentType: 5125, // UNSIGNED_INT
      count: iCount,
      type: "SCALAR",
    });

    gltfMeshes.push({
      name: m.name,
      primitives: [
        {
          attributes: { POSITION: posAccIdx, NORMAL: normAccIdx },
          indices: idxAccIdx,
          material: m.materialIndex,
        },
      ],
    });

    gltfNodes.push({ name: m.name, mesh: mIdx });
  }

  // Padding do buffer binário para múltiplo de 4 bytes
  const binRemainder = byteOffset % 4;
  if (binRemainder > 0) {
    const pad = Buffer.alloc(4 - binRemainder, 0);
    binChunks.push(pad);
    byteOffset += pad.length;
  }
  const binaryBuffer = Buffer.concat(binChunks);

  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "Encantadas Procedural Eyewear Studio (Blender/glTF 2.0)",
    },
    scene: 0,
    scenes: [{ name: "Encantadas_Eyewear", nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials: MATERIALS_CATALOG.map((mat) => ({
      name: mat.name,
      doubleSided: true,
      alphaMode: mat.alphaMode,
      pbrMetallicRoughness: {
        baseColorFactor: mat.baseColor,
        metallicFactor: mat.metallic,
        roughnessFactor: mat.roughness,
      },
    })),
    buffers: [{ byteLength: binaryBuffer.length }],
    bufferViews,
    accessors,
  };

  let jsonStr = JSON.stringify(gltfJson);
  while (Buffer.byteLength(jsonStr, "utf8") % 4 !== 0) {
    jsonStr += " ";
  }
  const jsonBuf = Buffer.from(jsonStr, "utf8");

  const totalByteLength = 12 + 8 + jsonBuf.length + 8 + binaryBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF' magic
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalByteLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binaryBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  const glbBuffer = Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binaryBuffer]);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, glbBuffer);
  return glbBuffer.length;
}

function exportToOBJ(meshes, filepath) {
  let out = "# Encantadas Eyewear 3D Model (Wavefront OBJ)\n";
  let vertexOffset = 1;

  for (const m of meshes) {
    out += `\no ${m.name}\n`;
    out += `usemtl ${MATERIALS_CATALOG[m.materialIndex].name}\n`;
    for (let i = 0; i < m.positions.length; i += 3) {
      out += `v ${m.positions[i].toFixed(6)} ${m.positions[i + 1].toFixed(6)} ${m.positions[i + 2].toFixed(6)}\n`;
    }
    for (let i = 0; i < m.normals.length; i += 3) {
      out += `vn ${m.normals[i].toFixed(5)} ${m.normals[i + 1].toFixed(5)} ${m.normals[i + 2].toFixed(5)}\n`;
    }
    for (let i = 0; i < m.indices.length; i += 3) {
      const a = m.indices[i] + vertexOffset;
      const b = m.indices[i + 1] + vertexOffset;
      const c = m.indices[i + 2] + vertexOffset;
      out += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
    vertexOffset += m.positions.length / 3;
  }

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, out, "utf8");
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

const outDirPublic = path.resolve(process.cwd(), "public/models");
const outDirBlender = path.resolve(process.cwd(), "blender/exports");

const models = [
  { slug: "oculos-01-imperial-leao", fn: generateModel01_ImperialLeao },
  { slug: "oculos-02-navigator-ambar", fn: generateModel02_NavigatorAmbar },
  { slug: "oculos-03-rimless-pantera", fn: generateModel03_RimlessPantera },
  { slug: "oculos-04-bold-tartaruga", fn: generateModel04_BoldTartaruga },
];

for (const item of models) {
  const meshes = item.fn();
  const glbPublicPath = path.join(outDirPublic, `${item.slug}.glb`);
  const glbBlenderPath = path.join(outDirBlender, `${item.slug}.glb`);
  const objBlenderPath = path.join(outDirBlender, `${item.slug}.obj`);

  const bytes = exportToGLB(meshes, glbPublicPath);
  exportToGLB(meshes, glbBlenderPath);
  exportToOBJ(meshes, objBlenderPath);

  console.log(`[OK] ${item.slug}.glb (${(bytes / 1024).toFixed(1)} KB) e .obj gerados com sucesso.`);
}
