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

function getLensContour2D(width, height, nExp = 3.6, topFlatness = 0.9, aviatorDrop = 0.0, catEyeLift = 0.0, innerBottomTaper = 0.0, segments = 72) {
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
      const outerFactor = Math.max(0, x / rx);
      y *= 1 + aviatorDrop * outerFactor;
    }
    if (y > 0 && catEyeLift !== 0) {
      const outerFactor = Math.max(0, x / rx);
      y += catEyeLift * outerFactor * (y / ry);
    }
    if (x < 0 && innerBottomTaper !== 0) {
      // Inclinação diagonal da borda nasal inferior (clássico navigator/aviator)
      const downFactor = Math.max(0, -y / ry);
      x += rx * innerBottomTaper * downFactor * Math.min(1, -x / rx);
    }
    pts.push([x, y]);
  }
  return pts;
}

const PANTO_TILT_RAD = (5.5 * Math.PI) / 180;
function applyPantoTilt(x, y, z) {
  // Rotação positiva em torno de X empurra o topo (+Y) para frente (+Z) e a base (-Y) para trás (-Z)
  const c = Math.cos(PANTO_TILT_RAD);
  const s = Math.sin(PANTO_TILT_RAD);
  return [x, y * c - z * s, y * s + z * c];
}

/**
 * Constrói uma lente óptica com curvatura esférica (base 4), wrap facial e inclinação pantoscópica.
 * Coordenadas glTF padrão: X = largura, Y = altura, Z = profundidade (+Z frontal).
 */
function buildLensMesh(name, materialIndex, sideSign, centerX, centerY, width, height, thickness, nExp, topFlat, aviatorDrop, catEyeLift = 0.0, innerBottomTaper = 0.0) {
  const builder = new MeshBuilder(name, materialIndex);
  const contour = getLensContour2D(width, height, nExp, topFlat, aviatorDrop, catEyeLift, innerBottomTaper, 72);
  const n = contour.length;

  const cWrap = -(centerX * centerX) / (2 * 0.22);
  const [cfx, cfy, cfz] = applyPantoTilt(sideSign * centerX, centerY, 0.0020 + cWrap);
  const [cbx, cby, cbz] = applyPantoTilt(sideSign * centerX, centerY, 0.0020 + cWrap - thickness);
  const centerFrontIdx = builder.addVertex(cfx, cfy, cfz, 0, 0, 1);
  const centerBackIdx = builder.addVertex(cbx, cby, cbz, 0, 0, -1);

  const frontRing = [];
  const backRing = [];

  for (let i = 0; i < n; i++) {
    const [lx, ly] = contour[i];
    const wx = sideSign * (centerX + lx);
    const wy = centerY + ly;

    const r2 = lx * lx + ly * ly;
    const camberZ = 0.0020 - r2 / (2 * 0.16);
    const wrapZ = -(wx * wx) / (2 * 0.22);
    const zFront = camberZ + wrapZ;
    const zBack = zFront - thickness;

    const [fx, fy, fz] = applyPantoTilt(wx, wy, zFront);
    const [bx, by, bz] = applyPantoTilt(wx, wy, zBack);
    frontRing.push(builder.addVertex(fx, fy, fz, 0, 0, 1));
    backRing.push(builder.addVertex(bx, by, bz, 0, 0, -1));
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
 * Constrói um aro de acetato 3D com perfil retangular chanfrado (CNC-milled) usando normal verdadeira do contorno.
 */
function buildAcetateRimMesh(name, materialIndex, sideSign, centerX, centerY, width, height, rimWidth, rimDepthZ, nExp, topFlat, aviatorDrop, catEyeLift = 0.0, innerBottomTaper = 0.0) {
  const builder = new MeshBuilder(name, materialIndex);
  const contour = getLensContour2D(width, height, nExp, topFlat, aviatorDrop, catEyeLift, innerBottomTaper, 72);
  const n = contour.length;

  // Perfil transversal chanfrado de 8 vértices (u = radial para fora, v = profundidade Z)
  const bev = 0.22;
  const profileUV = [
    [-0.08,  0.50], // frente interna
    [ 1 - bev, 0.50], // frente externa chanfro
    [ 1.00,  0.50 - bev], // externo frente
    [ 1.00, -0.50 + bev], // externo trás
    [ 1 - bev, -0.50], // trás externa chanfro
    [-0.08, -0.50], // trás interna
    [-0.14, -0.30], // canal interno trás
    [-0.14,  0.30], // canal interno frente
  ];
  const pLen = profileUV.length;

  const rings = [];
  for (let i = 0; i < n; i++) {
    const prev = contour[(i - 1 + n) % n];
    const [lx, ly] = contour[i];
    const next = contour[(i + 1) % n];

    // Tangente no sentido anti-horário -> normal externa é (ty, -tx)
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const tLen = Math.hypot(tx, ty) || 1;
    tx /= tLen;
    ty /= tLen;
    const nx = ty;
    const ny = -tx;

    // Leve reforço no arco superior (browline) e canto externo (endpiece)
    const upperBoost = ly > 0 ? 1 + 0.16 * (ly / (height * 0.5)) : 1.0;
    const outerBoost = lx > 0 ? 1 + 0.18 * Math.pow(lx / (width * 0.5), 2) : 1.0;
    const localW = rimWidth * upperBoost * outerBoost;

    const ring = [];
    for (let p = 0; p < pLen; p++) {
      const [u, v] = profileUV[p];
      const px = lx + nx * (u * localW);
      const py = ly + ny * (u * localW);

      const wx = sideSign * (centerX + px);
      const wy = centerY + py;
      const r2 = lx * lx + ly * ly;
      const camberZ = 0.0012 - r2 / (2 * 0.16);
      const wrapZ = -(wx * wx) / (2 * 0.22);
      const wz = camberZ + wrapZ + v * rimDepthZ;

      const [fx, fy, fz] = applyPantoTilt(wx, wy, wz);
      ring.push(builder.addVertex(fx, fy, fz));
    }
    rings.push(ring);
  }

  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    for (let p = 0; p < pLen; p++) {
      const np = (p + 1) % pLen;
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
 * Varre um perfil elíptico ou retangular chanfrado ao longo de uma polilinha 3D.
 */
function buildTubeAlongPath(name, materialIndex, pathPoints, radiusX, radiusY, radialSegs = 14, chamferRect = false) {
  const builder = new MeshBuilder(name, materialIndex);
  const m = pathPoints.length;
  const rings = [];

  const rectProfile = [
    [ 0.78,  1.00],
    [ 1.00,  0.72],
    [ 1.00, -0.72],
    [ 0.78, -1.00],
    [-0.78, -1.00],
    [-1.00, -0.72],
    [-1.00,  0.72],
    [-0.78,  1.00],
  ];
  const segCount = chamferRect ? rectProfile.length : radialSegs;

  for (let i = 0; i < m; i++) {
    const curr = pathPoints[i];
    const prev = i > 0 ? pathPoints[i - 1] : curr;
    const next = i < m - 1 ? pathPoints[i + 1] : curr;

    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    let tz = next[2] - prev[2];
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;

    // Vetor auxiliar perpendicular estável
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
    for (let s = 0; s < segCount; s++) {
      let c, sn;
      if (chamferRect) {
        c = rectProfile[s][0] * radiusX * scale;
        sn = rectProfile[s][1] * radiusY * scale;
      } else {
        const phi = (2 * Math.PI * s) / segCount;
        c = Math.cos(phi) * radiusX * scale;
        sn = Math.sin(phi) * radiusY * scale;
      }

      const vx = curr[0] + bx * c + nx * sn;
      const vy = curr[1] + by * c + ny * sn;
      const vz = curr[2] + bz * c + nz * sn;
      ring.push(builder.addVertex(vx, vy, vz));
    }
    rings.push(ring);
  }

  for (let i = 0; i < m - 1; i++) {
    for (let s = 0; s < segCount; s++) {
      const ns = (s + 1) % segCount;
      builder.addQuad(rings[i][s], rings[i + 1][s], rings[i + 1][ns], rings[i][ns]);
    }
  }

  // Tampas das extremidades (caps)
  const startCenter = builder.addVertex(pathPoints[0][0], pathPoints[0][1], pathPoints[0][2]);
  const endPt = pathPoints[m - 1];
  const endCenter = builder.addVertex(endPt[0], endPt[1], endPt[2]);
  for (let s = 0; s < segCount; s++) {
    const ns = (s + 1) % segCount;
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
      applyPantoTilt(side * bridgeHalfX, centerY + 0.003, -0.0015),
      applyPantoTilt(side * (bridgeHalfX + 0.0010), centerY + 0.0005, -0.0048),
      applyPantoTilt(side * (bridgeHalfX - 0.0014), centerY - 0.0042, -0.0075),
    ];
    meshes.push(buildTubeAlongPath(`NoseArm_${suffix}`, goldMatIdx, armPts, 0.00048, 0.00048, 10));

    const padCenter = applyPantoTilt(side * (bridgeHalfX - 0.0017), centerY - 0.0048, -0.0085);
    meshes.push(buildSculptedSphere(`NosePad_${suffix}`, padMatIdx, padCenter, [0.0022, 0.0052, 0.0011], 16, 12));
    meshes.push(buildSculptedSphere(`NosePadCore_${suffix}`, goldMatIdx, padCenter, [0.0011, 0.0026, 0.0006], 10, 8));
  }
}

/**
 * Adiciona o par de hastes laterais anatômicas calibradas com a cabeça humana realista (cabeça.glb).
 */
function addTemples(meshes, style, goldMatIdx, tipMatIdx, hingeX, hingeY, hingeZ, length = 0.136) {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const x0 = side * hingeX;

    if (style === "metal_plus_tip") {
      const zMid = hingeZ - length * 0.48;
      const metalPts = [
        [x0, hingeY, hingeZ, 1.05],
        [x0 + side * 0.0018, hingeY - 0.0005, hingeZ - length * 0.25, 1.0],
        [x0 + side * 0.0012, hingeY - 0.0012, zMid, 0.92],
      ];
      meshes.push(buildTubeAlongPath(`TempleMetal_${suffix}`, goldMatIdx, metalPts, 0.0010, 0.0015, 12, true));

      const tipPts = [
        [x0 + side * 0.0010, hingeY - 0.0005, zMid + 0.002, 0.90],
        [x0 - side * 0.0008, hingeY - 0.0012, hingeZ - length * 0.74, 1.05],
        [x0 - side * 0.0045, hingeY - 0.0080, hingeZ - length * 0.88, 1.12],
        [x0 - side * 0.0095, hingeY - 0.0195, hingeZ - length * 0.97, 1.0],
        [x0 - side * 0.0120, hingeY - 0.0235, hingeZ - length * 1.02, 0.70],
      ];
      meshes.push(buildTubeAlongPath(`TempleTip_${suffix}`, tipMatIdx, tipPts, 0.0014, 0.0023, 12, true));
    } else {
      const isBold = style === "full_acetate_bold";
      const rx = isBold ? 0.0016 : 0.0013;
      const ry = isBold ? 0.0038 : 0.0024;

      const fullPts = [
        [x0, hingeY, hingeZ, 1.05],
        [x0 + side * 0.0018, hingeY - 0.0002, hingeZ - length * 0.38, 0.98],
        [x0 - side * 0.0008, hingeY - 0.0012, hingeZ - length * 0.74, 0.86],
        [x0 - side * 0.0058, hingeY - 0.0100, hingeZ - length * 0.89, 0.92],
        [x0 - side * 0.0115, hingeY - 0.0220, hingeZ - length * 1.00, 0.68],
      ];
      meshes.push(buildTubeAlongPath(`TempleAcetate_${suffix}`, tipMatIdx, fullPts, rx, ry, 12, true));
    }
  }
}

// ============================================================================
// DEFINIÇÃO DOS 4 MODELOS DE ÓCULOS
// ============================================================================

const MATERIALS_CATALOG = [
  // 0: Ouro 18K Polido
  { name: "MAT_Gold_18K", baseColor: [0.88, 0.71, 0.34, 1.0], metallic: 1.0, roughness: 0.16, alphaMode: "OPAQUE" },
  // 1: Acetato Tartaruga Escuro (Modelo 1)
  { name: "MAT_Acetate_Tortoise_Dark", baseColor: [0.16, 0.07, 0.025, 1.0], metallic: 0.0, roughness: 0.18, alphaMode: "OPAQUE" },
  // 2: Acetato Tartaruga Clássico Âmbar/Mel (Modelo 4)
  { name: "MAT_Acetate_Tortoise_Classic", baseColor: [0.28, 0.12, 0.035, 1.0], metallic: 0.0, roughness: 0.18, alphaMode: "OPAQUE" },
  // 3: Acetato & Esmalte Preto Brilhante (Modelo 2 e manchas da Pantera)
  { name: "MAT_Black_Gloss_Enamel", baseColor: [0.02, 0.02, 0.025, 1.0], metallic: 0.0, roughness: 0.12, alphaMode: "OPAQUE" },
  // 4: Lente Degradê Marrom Imperial (Modelo 1)
  { name: "MAT_Lens_Brown_Gradient", baseColor: [0.24, 0.13, 0.07, 0.74], metallic: 0.02, roughness: 0.04, alphaMode: "BLEND" },
  // 5: Lente Laranja Âmbar Solar (Modelo 2)
  { name: "MAT_Lens_Orange_Amber", baseColor: [0.88, 0.42, 0.12, 0.66], metallic: 0.02, roughness: 0.04, alphaMode: "BLEND" },
  // 6: Lente Chá Degradê Suave (Modelo 3 Rimless)
  { name: "MAT_Lens_Tea_Gradient", baseColor: [0.42, 0.25, 0.15, 0.60], metallic: 0.02, roughness: 0.04, alphaMode: "BLEND" },
  // 7: Lente Café Escuro Sólido (Modelo 4)
  { name: "MAT_Lens_Dark_Coffee", baseColor: [0.14, 0.07, 0.035, 0.80], metallic: 0.02, roughness: 0.04, alphaMode: "BLEND" },
  // 8: Silicone Translúcido (Plaquetas Nasais)
  { name: "MAT_Silicone_Crystal", baseColor: [0.95, 0.94, 0.90, 0.50], metallic: 0.0, roughness: 0.22, alphaMode: "BLEND" },
];

function generateModel01_ImperialLeao() {
  const meshes = [];
  const cx = 0.036, cy = 0.0, lw = 0.055, lh = 0.043;

  // Lentes e Aros finos chanfrados de Acetato Tartaruga Escuro (2.2mm) com recorte navegador fiel à foto
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M01_Lens_${sfx}`, 4, side, cx, cy, lw, lh, 0.0018, 4.0, 0.95, 0.03, 0.0, 0.28));
    meshes.push(buildAcetateRimMesh(`M01_Rim_${sfx}`, 1, side, cx, cy, lw, lh, 0.0022, 0.0036, 4.0, 0.95, 0.03, 0.0, 0.28));
  }

  // Barra Superior Metálica Dourada visível na face frontal da borda superior + hastes diagonais
  const topBarPts = [
    applyPantoTilt(-0.026, cy + lh * 0.485, 0.0026),
    applyPantoTilt(-0.011, cy + lh * 0.475, 0.0031),
    applyPantoTilt(0.0,    cy + lh * 0.470, 0.0033),
    applyPantoTilt(0.011,  cy + lh * 0.475, 0.0031),
    applyPantoTilt(0.026,  cy + lh * 0.485, 0.0026),
  ];
  meshes.push(buildTubeAlongPath("M01_TopBrowBar_Gold", 0, topBarPts, 0.00085, 0.00085, 12));

  // Braços diagonais da barra superior até os cantos internos dos aros
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    const strutPts = [
      applyPantoTilt(side * 0.0125, cy + lh * 0.470, 0.0028),
      applyPantoTilt(side * 0.0095, cy + lh * 0.340, 0.0026),
    ];
    meshes.push(buildTubeAlongPath(`M01_BridgeStrut_Gold_${sfx}`, 0, strutPts, 0.00075, 0.00075, 10));
  }

  // Ponte inferior horizontal em ouro 18K com parafusos dourados na face frontal
  const lowerBridgePts = [
    applyPantoTilt(-0.0112, cy + lh * 0.17, 0.0022),
    applyPantoTilt(-0.005,  cy + lh * 0.18, 0.0027),
    applyPantoTilt(0.0,     cy + lh * 0.185, 0.0029),
    applyPantoTilt(0.005,   cy + lh * 0.18, 0.0027),
    applyPantoTilt(0.0112,  cy + lh * 0.17, 0.0022),
  ];
  meshes.push(buildTubeAlongPath("M01_LowerBridge_Gold", 0, lowerBridgePts, 0.00082, 0.00082, 12));

  // Parafusos dourados da ponte + Rebites Dourados Duplos na face frontal dos cantos superiores
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildSculptedSphere(`M01_BridgeScrew_${sfx}`, 0, applyPantoTilt(side * 0.0108, cy + lh * 0.17, 0.0027), [0.0009, 0.0009, 0.0007], 10, 8));
    meshes.push(buildSculptedSphere(`M01_RivetTop_${sfx}`, 0, applyPantoTilt(side * (cx + lw * 0.46), cy + lh * 0.34, 0.0024), [0.0008, 0.0008, 0.0006], 10, 8));
    meshes.push(buildSculptedSphere(`M01_RivetLow_${sfx}`, 0, applyPantoTilt(side * (cx + lw * 0.50), cy + lh * 0.23, 0.0020), [0.0008, 0.0008, 0.0006], 10, 8));
  }

  // Plaquetas Nasais
  addNosePadsAndArms(meshes, 0, 8, 0.0092, cy);

  // Escultura detalhada da Cabeça de Leão Dourada (juba + focinho + orelhas) nas charneiras
  const hingeX = cx + lw * 0.5 + 0.0034;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    const lionPos = applyPantoTilt(side * hingeX, cy + 0.0045, -0.0038);
    meshes.push(
      buildSculptedSphere(
        `M01_LionHead_${sfx}`,
        0,
        lionPos,
        [0.0026, 0.0036, 0.0038],
        32,
        24,
        (lx, ly, lz, theta, phi) => {
          const maneAngle = Math.atan2(ly, lz);
          const mane = 1 + 0.16 * Math.cos(14 * maneAngle) * Math.sin(phi);
          // Focinho projetado para frente (+Z / +X lateral)
          const snout = lz > 0 && Math.abs(ly) < 0.0018 ? 1.18 : 1.0;
          return [lx * mane * snout, ly * mane, lz * snout];
        }
      )
    );
  }

  // Hastes Douradas + Ponteiras Tartaruga
  const [hx, hy, hz] = applyPantoTilt(hingeX, cy + 0.0045, -0.0055);
  addTemples(meshes, "metal_plus_tip", 0, 1, Math.abs(hx), hy, hz, 0.136);

  return meshes;
}

function generateModel02_NavigatorAmbar() {
  const meshes = [];
  const cx = 0.0365, cy = 0.0, lw = 0.055, lh = 0.045;

  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M02_Lens_${sfx}`, 5, side, cx, cy, lw, lh, 0.0018, 3.8, 0.95, 0.07, 0.0, 0.36));
    meshes.push(buildAcetateRimMesh(`M02_Rim_${sfx}`, 3, side, cx, cy, lw, lh, 0.0030, 0.0042, 3.8, 0.95, 0.07, 0.0, 0.36));
  }

  // Barra Superior Contínua alinhada ao topo dos aros + Ponte Inferior formando janela trapezoidal exata
  const bridgeTopPts = [
    applyPantoTilt(-0.025, cy + lh * 0.485, 0.0014),
    applyPantoTilt(0.0,    cy + lh * 0.495, 0.0020),
    applyPantoTilt(0.025,  cy + lh * 0.485, 0.0014),
  ];
  meshes.push(buildTubeAlongPath("M02_Bridge_TopBar", 3, bridgeTopPts, 0.0021, 0.0022, 12, true));

  const bridgeMainPts = [
    applyPantoTilt(-0.0138, cy + lh * 0.14, 0.0016),
    applyPantoTilt(0.0,     cy + lh * 0.145, 0.0021),
    applyPantoTilt(0.0138,  cy + lh * 0.14, 0.0016),
  ];
  meshes.push(buildTubeAlongPath("M02_Bridge_Main", 3, bridgeMainPts, 0.0018, 0.0020, 12, true));

  // Grampos Metálicos Dourados Horizontais em T bem visíveis na face frontal das charneiras
  const hingeX = cx + lw * 0.5 + 0.0034;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    const tPts = [
      applyPantoTilt(side * (hingeX - 0.0032), cy + lh * 0.15, 0.0022),
      applyPantoTilt(side * (hingeX + 0.0016), cy + lh * 0.15, 0.0005),
      applyPantoTilt(side * (hingeX + 0.0016), cy + lh * 0.15, -0.0075),
    ];
    meshes.push(buildTubeAlongPath(`M02_GoldTAccent_${sfx}`, 0, tPts, 0.0010, 0.0014, 10, true));
  }

  // Hastes Finas em Acetato Preto
  const [hx, hy, hz] = applyPantoTilt(hingeX, cy + lh * 0.15, -0.0045);
  addTemples(meshes, "full_acetate_slim", 0, 3, Math.abs(hx), hy, hz, 0.138);

  return meshes;
}

function generateModel03_RimlessPantera() {
  const meshes = [];
  const cx = 0.0355, cy = 0.0, lw = 0.055, lh = 0.044;

  // Lentes Rimless (Sem Aro) com cantos mais orgânicos e leve lift borboleta externo (igual foto)
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M03_Lens_${sfx}`, 6, side, cx, cy, lw, lh, 0.0020, 3.1, 0.94, 0.02, 0.0038, 0.10));
  }

  // Ponte Central Rimless Delicada em Ouro 18K com pinças horizontais nas bordas internas
  const bridgePts = [
    applyPantoTilt(-0.0128, cy + lh * 0.19, 0.0016),
    applyPantoTilt(-0.0055, cy + lh * 0.23, 0.0026),
    applyPantoTilt(0.0,     cy + lh * 0.245, 0.0029),
    applyPantoTilt(0.0055,  cy + lh * 0.23, 0.0026),
    applyPantoTilt(0.0128,  cy + lh * 0.19, 0.0016),
  ];
  meshes.push(buildTubeAlongPath("M03_RimlessBridge_Gold", 0, bridgePts, 0.00085, 0.00085, 12));

  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildSculptedSphere(`M03_BridgeClasp_Gold_${sfx}`, 0, applyPantoTilt(side * 0.0125, cy + lh * 0.19, 0.0020), [0.0022, 0.0009, 0.0009], 10, 8));
  }

  // Plaquetas Nasais
  addNosePadsAndArms(meshes, 0, 8, 0.0086, cy);

  // Escultura esguia da Pantera Dourada com orelhas e manchas pretas esmaltadas mordendo a lente
  const hingeX = cx + lw * 0.5;
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    const py = cy + lh * 0.16;
    const pantherPts = [
      applyPantoTilt(side * (hingeX - 0.0068), py, 0.0008, 0.45),
      applyPantoTilt(side * (hingeX - 0.0020), py, 0.0010, 1.00),
      applyPantoTilt(side * (hingeX + 0.0024), py, -0.0018, 0.90),
      applyPantoTilt(side * (hingeX + 0.0024), py, -0.0098, 0.60),
    ];
    meshes.push(buildTubeAlongPath(`M03_PantherBody_${sfx}`, 0, pantherPts, 0.0015, 0.0019, 14));

    // Orelhas discretas da pantera
    meshes.push(buildSculptedSphere(`M03_PantherEar1_${sfx}`, 0, applyPantoTilt(side * (hingeX - 0.0010), py + 0.0018, 0.0004), [0.0006, 0.0008, 0.0006], 8, 6));
    meshes.push(buildSculptedSphere(`M03_PantherEar2_${sfx}`, 0, applyPantoTilt(side * (hingeX - 0.0010), py - 0.0015, 0.0004), [0.0005, 0.0006, 0.0005], 8, 6));

    const spots = [
      [-0.0038, py + 0.0007, 0.0018],
      [-0.0038, py - 0.0007, 0.0018],
      [-0.0008, py + 0.0009, 0.0015],
      [-0.0008, py - 0.0009, 0.0015],
      [0.0023,  py + 0.0005, -0.0035],
      [0.0023,  py - 0.0006, -0.0062],
    ];
    spots.forEach((sp, idx) => {
      meshes.push(
        buildSculptedSphere(
          `M03_PantherSpot_${sfx}_${idx}`,
          3,
          applyPantoTilt(side * (hingeX + sp[0]), sp[1], sp[2]),
          [0.00060, 0.00060, 0.00060],
          8,
          6
        )
      );
    });
  }

  // Hastes Finas Douradas com Ponteiras Tartaruga
  const [hx, hy, hz] = applyPantoTilt(hingeX + 0.0024, cy + lh * 0.16, -0.0085);
  addTemples(meshes, "metal_plus_tip", 0, 1, Math.abs(hx), hy, hz, 0.135);

  return meshes;
}

function generateModel04_BoldTartaruga() {
  const meshes = [];
  const cx = 0.0348, cy = 0.0, lw = 0.050, lh = 0.036;

  // Lentes Café Escuro + Aro Retangular Bold Tartaruga Clássico (4.5mm frontal bem marcado igual à foto)
  for (const side of [-1, 1]) {
    const sfx = side < 0 ? "L" : "R";
    meshes.push(buildLensMesh(`M04_Lens_${sfx}`, 7, side, cx, cy, lw, lh, 0.0018, 4.4, 0.95, 0.0, 0.0, 0.08));
    meshes.push(buildAcetateRimMesh(`M04_Rim_${sfx}`, 2, side, cx, cy, lw, lh, 0.0045, 0.0048, 4.4, 0.95, 0.0, 0.0, 0.08));
  }

  // Ponte Central Bold Esculpida contínua com os aros (sem emblema dourado na frente, fiel à foto)
  const bridgePts = [
    applyPantoTilt(-0.014, cy + lh * 0.22, 0.0012),
    applyPantoTilt(0.0,    cy + lh * 0.24, 0.0018),
    applyPantoTilt(0.014,  cy + lh * 0.22, 0.0012),
  ];
  meshes.push(buildTubeAlongPath("M04_BoldBridge", 2, bridgePts, 0.0024, 0.0030, 12, true));

  // Hastes Bold em Acetato Tartaruga
  const hingeX = cx + lw * 0.5 + 0.0045;
  const [hx, hy, hz] = applyPantoTilt(hingeX, cy + 0.0025, -0.0035);
  addTemples(meshes, "full_acetate_bold", 0, 2, Math.abs(hx), hy, hz, 0.136);

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
