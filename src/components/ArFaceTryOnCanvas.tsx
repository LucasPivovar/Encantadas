"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

interface ArFaceTryOnCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  glbUrl: string;
  frontTextureUrl: string;
  frameStyle: string;
}

/**
 * Calcula coordenadas UV planares normalizadas (0..1) a partir do bounding box
 * de cada malha do GLB. Isso garante que o degradê vertical da lente e os
 * reflexos de vidro funcionem com perfeição em todos os vértices.
 */
function ensureMeshUVs(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position;
  if (!pos) return;

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return;

  const spanX = Math.max(1e-5, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-5, bb.max.y - bb.min.y);
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvs[i * 2] = (x - bb.min.x) / spanX;
    uvs[i * 2 + 1] = (y - bb.min.y) / spanY;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

/**
 * Textura óptica da lente: degradê translúcido real que permite ver os olhos
 * por trás do vidro, mais revestimento anti-reflexo sutil nas bordas.
 */
function createOpticalLensTintTexture(frameStyle: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  // No Canvas 2D, y=0 é o topo (v=1 no Three.js com flipY=true padrão)
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  if (frameStyle.includes("navigator")) {
    // Solaris: âmbar pêssego uniforme e luminoso igual à foto
    grad.addColorStop(0, "rgba(228, 138, 78, 0.92)");
    grad.addColorStop(0.55, "rgba(235, 150, 90, 0.88)");
    grad.addColorStop(1, "rgba(240, 162, 104, 0.84)");
  } else if (frameStyle.includes("rimless")) {
    // Pantera: degradê chá-cacau forte no topo até champagne quase transparente na base
    grad.addColorStop(0, "rgba(92, 54, 34, 0.96)");
    grad.addColorStop(0.45, "rgba(138, 94, 66, 0.68)");
    grad.addColorStop(1, "rgba(222, 198, 178, 0.22)");
  } else if (frameStyle.includes("bold")) {
    // Aurea: café sólido uniforme igual à foto
    grad.addColorStop(0, "rgba(70, 40, 24, 0.94)");
    grad.addColorStop(0.6, "rgba(78, 46, 28, 0.90)");
    grad.addColorStop(1, "rgba(84, 50, 32, 0.88)");
  } else {
    // Imperial Leão: degradê marrom espresso no topo até âmbar claro na base
    grad.addColorStop(0, "rgba(52, 28, 14, 0.96)");
    grad.addColorStop(0.52, "rgba(104, 62, 36, 0.72)");
    grad.addColorStop(1, "rgba(178, 134, 102, 0.36)");
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura procedural de Acetato Tartaruga Italiano para o aro e ponteiras.
 */
function createTortoiseTexture(dark: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = dark ? "#120803" : "#150903";
  ctx.fillRect(0, 0, 256, 256);

  const colors = dark
    ? ["rgba(82, 36, 12, 0.64)", "rgba(126, 58, 18, 0.42)", "rgba(14, 7, 3, 0.78)"]
    : ["rgba(196, 98, 24, 0.82)", "rgba(232, 138, 44, 0.68)", "rgba(18, 8, 3, 0.82)"];

  for (let i = 0; i < 110; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 256;
    const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * 256;
    const r = 12 + (i % 26);
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, colors[i % colors.length]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function ArFaceTryOnCanvas({
  videoRef,
  glbUrl,
  frameStyle,
}: ArFaceTryOnCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [trackingReady, setTrackingReady] = useState(false);
  const [faceLocked, setFaceLocked] = useState(false);

  const glbHolderRef = useRef<THREE.Group | null>(null);
  const reflectionTexRef = useRef<THREE.CanvasTexture | null>(null);
  const activeSpecRef = useRef({ glbUrl, frameStyle });
  activeSpecRef.current = { glbUrl, frameStyle };

  // Função centralizada que carrega o GLB e aplica o Vidro Realista + Ouro 18K + Acetato
  const loadAndStyleEyewear = (
    holder: THREE.Group,
    url: string,
    style: string
  ) => {
    const loader = new GLTFLoader();
    const tintTex = createOpticalLensTintTexture(style);
    const tortDarkTex = createTortoiseTexture(true);
    const tortClassicTex = createTortoiseTexture(false);

    loader.load(url, (gltf) => {
      const root = gltf.scene;

      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mName = mesh.name || "";
          ensureMeshUVs(mesh.geometry);

          if (mName.includes("Lens")) {
            // Vidro óptico físico translúcido com reflexo real da câmera/ambiente
            mesh.renderOrder = 3;
            const lensOpacity = style.includes("rimless")
              ? 0.62
              : style.includes("navigator")
              ? 0.68
              : style.includes("bold")
              ? 0.82
              : 0.76;
            mesh.material = new THREE.MeshPhysicalMaterial({
              map: tintTex,
              color: new THREE.Color(0xffffff),
              transparent: true,
              opacity: lensOpacity,
              roughness: 0.02,
              metalness: 0.0,
              ior: 1.52,
              reflectivity: 0.95,
              clearcoat: 1.0,
              clearcoatRoughness: 0.02,
              envMapIntensity: 1.25,
              depthWrite: false,
              side: THREE.FrontSide,
            });
          } else if (
            mName.includes("Gold") ||
            mName.includes("Lion") ||
            mName.includes("PantherBody") ||
            mName.includes("TempleMetal") ||
            mName.includes("RimlessBridge_Gold") ||
            mName.includes("LowerBridge_Gold") ||
            mName.includes("TopBrowBar_Gold") ||
            mName.includes("Rivet") ||
            mName.includes("NoseArm") ||
            mName.includes("NosePadCore")
          ) {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0.86, 0.70, 0.36),
              metalness: 0.95,
              roughness: 0.22,
              clearcoat: 0.35,
              clearcoatRoughness: 0.10,
              envMapIntensity: 1.35,
            });
          } else if (mName.includes("NosePad_")) {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0xfaf6f0),
              transparent: true,
              opacity: 0.48,
              roughness: 0.16,
              clearcoat: 0.8,
              depthWrite: false,
            });
          } else if (
            mName.includes("PantherSpot") ||
            style.includes("navigator")
          ) {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0x0f0e0d),
              metalness: 0.02,
              roughness: 0.12,
              clearcoat: 0.92,
              clearcoatRoughness: 0.05,
              envMapIntensity: 1.1,
            });
          } else {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              map: style.includes("bold") ? tortClassicTex : tortDarkTex,
              color: new THREE.Color(0xffffff),
              metalness: 0.0,
              roughness: 0.14,
              clearcoat: 0.90,
              clearcoatRoughness: 0.06,
              envMapIntensity: 1.05,
            });
          }
        }
      });

      holder.clear();
      holder.add(root);
    });
  };

  // Quando o usuário troca de modelo na barra inferior, atualiza o GLB e o vidro imediatamente
  useEffect(() => {
    if (!glbHolderRef.current) return;
    loadAndStyleEyewear(glbHolderRef.current, glbUrl, frameStyle);
  }, [glbUrl, frameStyle]);

  // Inicializa Cena Three.js + MediaPipe Face Landmarker Local (v1.2.3)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.01,
      10
    );
    camera.position.set(0, 0, 0.58);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Sonda de Luz Ambiente e Reflexo ao Vivo da Câmera (integra o 3D à iluminação real do local)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const fallbackEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const envCanvas = document.createElement("canvas");
    envCanvas.width = 128;
    envCanvas.height = 64;
    const envCtx = envCanvas.getContext("2d");
    if (envCtx) {
      envCtx.fillStyle = "#8a857e";
      envCtx.fillRect(0, 0, 128, 64);
    }
    const liveEnvTex = new THREE.CanvasTexture(envCanvas);
    liveEnvTex.mapping = THREE.EquirectangularReflectionMapping;
    liveEnvTex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = fallbackEnv;

    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = 24;
    probeCanvas.height = 16;
    const probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });

    const hemiLight = new THREE.HemisphereLight(0xf6f2ec, 0x7a6a5c, 1.0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.5);
    keyLight.position.set(0.25, 0.45, 0.75);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffe8c8, 0.55);
    rimLight.position.set(-0.45, 0.25, 0.45);
    scene.add(rimLight);

    const ambientState = {
      topR: 0.9,
      topG: 0.88,
      topB: 0.85,
      botR: 0.5,
      botG: 0.45,
      botB: 0.4,
      luma: 0.55,
      dirX: 0.25,
      hasLiveEnv: false,
      lastProbeMs: 0,
      lastEnvMs: 0,
    };

    // Grupo Âncora 3D — começa invisível até mapear o rosto
    const faceAnchor = new THREE.Group();
    faceAnchor.visible = false;
    scene.add(faceAnchor);

    // 1. Oclusor Craniano Invisível (calibrado com cabeça.glb: 64.9mm meia-largura)
    const headOccluder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.060, 0.21, 24),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true })
    );
    headOccluder.position.set(0, -0.01, -0.078);
    headOccluder.renderOrder = 0;
    faceAnchor.add(headOccluder);

    // 2. Sombra de Contato Anatômica sob a Ponte e Lentes
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 64;
    const sCtx = shadowCanvas.getContext("2d");
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 32, 4, 64, 32, 56);
      grad.addColorStop(0, "rgba(0,0,0,0.16)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 64);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.134, 0.044),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    shadowMesh.position.set(0, -0.004, 0.008);
    shadowMesh.renderOrder = 1;
    faceAnchor.add(shadowMesh);

    // 3. Holder do Modelo 3D (.GLB):
    // Calibrado pela cabeça humana realista: ponte nasal fica ~15mm à frente do plano dos olhos
    const glbHolder = new THREE.Group();
    glbHolder.position.set(0, -0.002, 0.015);
    faceAnchor.add(glbHolder);
    glbHolderRef.current = glbHolder;

    loadAndStyleEyewear(
      glbHolder,
      activeSpecRef.current.glbUrl,
      activeSpecRef.current.frameStyle
    );

    const targetPose = {
      pos: new THREE.Vector3(0, 0, 0),
      quat: new THREE.Quaternion(),
      scale: 0.01,
    };
    const currentPose = {
      pos: new THREE.Vector3(0, 0, 0),
      quat: new THREE.Quaternion(),
      scale: 0.01,
    };
    const eulerHelper = new THREE.Euler();

    let hasFirstLock = false;
    let consecutiveHits = 0;
    let consecutiveMisses = 0;

    let faceLandmarker: {
      detectForVideo: (
        video: HTMLVideoElement,
        timestamp: number
      ) => { faceLandmarks?: { x: number; y: number; z: number }[][] };
      close?: () => void;
    } | null = null;
    let cancelled = false;

    async function initMediaPipe() {
      const vision = await import("@mediapipe/tasks-vision");

      // Carrega o WASM v1.2.3 local (zero incompatibilidade de versão) com fallback CDN v1.2.3
      let fileset;
      try {
        fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      } catch {
        fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"
        );
      }
      if (cancelled) return;

      // Tenta delegate GPU primeiro; se o celular não suportar WebGL2 delegate no MediaPipe, usa CPU
      try {
        faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/mediapipe/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch {
        faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/mediapipe/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }

      if (!cancelled) {
        setTrackingReady(true);
      }
    }

    initMediaPipe().catch(() => {
      if (!cancelled) setTrackingReady(true);
    });

    let lastVideoTime = -1;
    let rafId = 0;

    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop);

      const video = videoRef.current;
      const cw = container.clientWidth;
      const ch = Math.max(1, container.clientHeight);
      const nowMs = performance.now();

      // Atualiza iluminação ambiente real a partir do vídeo da câmera (~10x/s)
      if (video && video.readyState >= 2 && probeCtx && nowMs - ambientState.lastProbeMs > 95) {
        ambientState.lastProbeMs = nowMs;
        try {
          probeCtx.save();
          probeCtx.scale(-1, 1);
          probeCtx.drawImage(video, -24, 0, 24, 16);
          probeCtx.restore();
          const data = probeCtx.getImageData(0, 0, 24, 16).data;

          let topR = 0, topG = 0, topB = 0, topCnt = 0;
          let botR = 0, botG = 0, botB = 0, botCnt = 0;
          let leftLuma = 0, rightLuma = 0;

          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 24; x++) {
              const idx = (y * 24 + x) * 4;
              const r = data[idx] / 255;
              const g = data[idx + 1] / 255;
              const b = data[idx + 2] / 255;
              const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

              if (y < 7) {
                topR += r; topG += g; topB += b; topCnt++;
              } else {
                botR += r; botG += g; botB += b; botCnt++;
              }
              if (x < 12) leftLuma += lum;
              else rightLuma += lum;
            }
          }

          if (topCnt > 0 && botCnt > 0) {
            const tR = topR / topCnt, tG = topG / topCnt, tB = topB / topCnt;
            const bR = botR / botCnt, bG = botG / botCnt, bB = botB / botCnt;
            const avgLuma = THREE.MathUtils.clamp((leftLuma + rightLuma) / (24 * 16), 0.12, 0.95);
            const dirBalance = THREE.MathUtils.clamp((rightLuma - leftLuma) / (leftLuma + rightLuma + 0.001) * 2.2, -0.8, 0.8);

            const s = 0.22;
            ambientState.topR += (tR - ambientState.topR) * s;
            ambientState.topG += (tG - ambientState.topG) * s;
            ambientState.topB += (tB - ambientState.topB) * s;
            ambientState.botR += (bR - ambientState.botR) * s;
            ambientState.botG += (bG - ambientState.botG) * s;
            ambientState.botB += (bB - ambientState.botB) * s;
            ambientState.luma += (avgLuma - ambientState.luma) * s;
            ambientState.dirX += (dirBalance - ambientState.dirX) * s;

            hemiLight.color.setRGB(
              Math.min(1, ambientState.topR * 1.15 + 0.12),
              Math.min(1, ambientState.topG * 1.15 + 0.12),
              Math.min(1, ambientState.topB * 1.15 + 0.12)
            );
            hemiLight.groundColor.setRGB(
              ambientState.botR * 0.95 + 0.08,
              ambientState.botG * 0.95 + 0.08,
              ambientState.botB * 0.95 + 0.08
            );
            hemiLight.intensity = 0.55 + ambientState.luma * 1.15;

            keyLight.color.setRGB(
              Math.min(1, ambientState.topR * 0.65 + 0.45),
              Math.min(1, ambientState.topG * 0.65 + 0.43),
              Math.min(1, ambientState.topB * 0.65 + 0.40)
            );
            keyLight.intensity = 0.75 + ambientState.luma * 1.65;
            keyLight.position.set(ambientState.dirX * 0.75, 0.48, 0.75);

            rimLight.intensity = 0.25 + ambientState.luma * 0.65;
            renderer.toneMappingExposure = 0.84 + ambientState.luma * 0.30;
          }

          // Atualiza mapa de reflexão PMREM ao vivo da câmera (~3x/s)
          if (envCtx && nowMs - ambientState.lastEnvMs > 320) {
            ambientState.lastEnvMs = nowMs;
            envCtx.save();
            envCtx.scale(-1, 1);
            envCtx.drawImage(probeCanvas, -128, 0, 128, 64);
            envCtx.restore();
            const skyGrad = envCtx.createLinearGradient(0, 0, 0, 26);
            skyGrad.addColorStop(0, "rgba(255, 252, 245, 0.28)");
            skyGrad.addColorStop(1, "rgba(255, 252, 245, 0)");
            envCtx.fillStyle = skyGrad;
            envCtx.fillRect(0, 0, 128, 26);

            liveEnvTex.needsUpdate = true;
            const prevEnv = scene.environment;
            const nextPmrem = pmrem.fromEquirectangular(liveEnvTex);
            scene.environment = nextPmrem.texture;
            if (prevEnv && prevEnv !== fallbackEnv) {
              prevEnv.dispose();
            }
            ambientState.hasLiveEnv = true;
          }
        } catch {
          // Ignore transient canvas security/video frame errors
        }
      }

      if (
        faceLandmarker &&
        video &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        try {
          const res = faceLandmarker.detectForVideo(video, performance.now());
          const landmarks = res.faceLandmarks?.[0];

          if (landmarks && landmarks.length > 454) {
            consecutiveHits++;
            consecutiveMisses = 0;

            const vw = video.videoWidth || 1280;
            const vh = video.videoHeight || 720;
            const videoAspect = vw / vh;
            const containerAspect = cw / ch;

            let scaleX = 1;
            let scaleY = 1;
            if (containerAspect > videoAspect) {
              scaleY = containerAspect / videoAspect;
            } else {
              scaleX = videoAspect / containerAspect;
            }

            const vFovRad = (camera.fov * Math.PI) / 180;
            const visHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z;
            const visWidth = visHeight * containerAspect;

            const toWorld = (pt: { x: number; y: number; z: number }) => {
              const mx = 1.0 - pt.x; // Vídeo espelhado (-scale-x-100)
              const wx = (mx - 0.5) * scaleX * visWidth;
              const wy = -(pt.y - 0.5) * scaleY * visHeight;
              const wz = -pt.z * scaleX * visWidth;
              return new THREE.Vector3(wx, wy, wz);
            };

            // Pontos Anatômicos do Tripé de Apoio Real de um Óculos:
            // Cantos externos e internos dos olhos (#33, #133, #362, #263) -> Centro Óptico das Lentes
            // Nasion / Ponte Nasal (#168) e Têmporas junto às orelhas (#234 e #454)
            const pLeftOuter = toWorld(landmarks[33]);
            const pLeftInner = toWorld(landmarks[133]);
            const pRightInner = toWorld(landmarks[362]);
            const pRightOuter = toWorld(landmarks[263]);
            const pForehead = toWorld(landmarks[10]);
            const pChin = toWorld(landmarks[152]);
            const pTempleL = toWorld(landmarks[234]);
            const pTempleR = toWorld(landmarks[454]);

            // Centro exato da linha dos olhos (onde o centro Y=0 das lentes deve ficar!)
            const midEyes = new THREE.Vector3()
              .add(pLeftOuter)
              .add(pLeftInner)
              .add(pRightInner)
              .add(pRightOuter)
              .multiplyScalar(0.25);

            targetPose.pos.set(midEyes.x, midEyes.y, 0);

            // Escala precisa baseada na largura facial (têmpora a têmpora e canto a canto dos olhos)
            const templeSpan = pTempleL.distanceTo(pTempleR);
            const eyeOuterSpan = pLeftOuter.distanceTo(pRightOuter);
            const targetFaceWidth = Math.max(templeSpan * 1.03, eyeOuterSpan * 1.44);
            // Largura de charneira a charneira no GLB calibrado = 0.134m
            targetPose.scale = Math.max(
              0.45,
              Math.min(2.6, targetFaceWidth / 0.134)
            );

            // Base ortonormal correta no vídeo espelhado (mx = 1 - x):
            // #33 (pLeftOuter) fica à direita (+X) na tela espelhada e #263 (pRightOuter) à esquerda (-X)
            const xAxis = new THREE.Vector3()
              .subVectors(pLeftOuter, pRightOuter)
              .normalize();
            if (xAxis.x < 0) xAxis.negate();

            // Eixo vertical anatômico da testa (#10) ao queixo (#152) -> sempre +Y
            const rawUp = new THREE.Vector3()
              .subVectors(pForehead, pChin)
              .normalize();

            // Z apontando para fora do rosto em direção à câmera (+Z = X × Y)
            const zAxis = new THREE.Vector3()
              .crossVectors(xAxis, rawUp)
              .normalize();

            // Ortonormalização final de Gram-Schmidt garantindo Y = Z × X
            const yAxis = new THREE.Vector3()
              .crossVectors(zAxis, xAxis)
              .normalize();

            const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
            targetPose.quat.setFromRotationMatrix(rotMat);

            if (consecutiveHits >= 1) {
              if (!hasFirstLock) {
                hasFirstLock = true;
                currentPose.pos.copy(targetPose.pos);
                currentPose.quat.copy(targetPose.quat);
                currentPose.scale = targetPose.scale;
              }
              faceAnchor.visible = true;
              setFaceLocked(true);
            }
          } else {
            consecutiveMisses++;
            consecutiveHits = 0;
            if (consecutiveMisses > 10) {
              faceAnchor.visible = false;
              hasFirstLock = false;
              setFaceLocked(false);
            }
          }
        } catch {
          // Ignore single frame detection error
        }
      }

      if (faceAnchor.visible) {
        // Suavização adaptativa por velocidade: resposta quase instantânea ao mexer o rosto, estável quando parado
        const posDelta = currentPose.pos.distanceTo(targetPose.pos);
        const rotDelta = currentPose.quat.angleTo(targetPose.quat);
        const posAlpha = posDelta > 0.002 ? 0.90 : 0.60;
        const rotAlpha = rotDelta > 0.015 ? 0.88 : 0.58;
        const scaleAlpha = Math.abs(targetPose.scale - currentPose.scale) > 0.015 ? 0.85 : 0.55;

        currentPose.pos.lerp(targetPose.pos, posAlpha);
        currentPose.quat.slerp(targetPose.quat, rotAlpha);
        currentPose.scale += (targetPose.scale - currentPose.scale) * scaleAlpha;

        faceAnchor.position.copy(currentPose.pos);
        faceAnchor.quaternion.copy(currentPose.quat);
        faceAnchor.scale.setScalar(currentPose.scale);
      }

      renderer.render(scene, camera);
    };

    renderLoop();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      if (faceLandmarker && typeof faceLandmarker.close === "function") {
        faceLandmarker.close();
      }
      shadowTex.dispose();
      liveEnvTex.dispose();
      fallbackEnv.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [videoRef]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div ref={mountRef} className="h-full w-full" />

      {/* Marcação Guia de Rosto ("Posicione seu rosto na marcação") — some assim que o óculos encaixa no rosto! */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${
          faceLocked ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="relative h-[290px] w-[215px] sm:h-[340px] sm:w-[250px]">
          <svg
            viewBox="0 0 240 320"
            fill="none"
            className="h-full w-full drop-shadow-[0_4px_20px_rgba(0,0,0,0.45)]"
          >
            <path
              d="M20 64 V36 C20 24 29 15 41 15 H70"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M220 64 V36 C220 24 211 15 199 15 H170"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M20 256 V284 C20 296 29 305 41 305 H70"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M220 256 V284 C220 296 211 305 199 305 H170"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            <ellipse
              cx="120"
              cy="158"
              rx="78"
              ry="106"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />

            <line
              x1="56"
              y1="138"
              x2="184"
              y2="138"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <circle cx="120" cy="138" r="3.5" fill="rgba(255,255,255,0.85)" />
          </svg>
        </div>

        <div className="mt-5 rounded-full bg-black/70 px-5 py-2 text-center text-[13px] font-medium tracking-[0.02em] text-white backdrop-blur-md">
          {!trackingReady
            ? "Iniciando sensor facial 3D…"
            : "Posicione seu rosto na marcação"}
        </div>
      </div>
    </div>
  );
}
