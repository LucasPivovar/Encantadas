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
  if (frameStyle === "navigator-amber") {
    grad.addColorStop(0, "rgba(218, 90, 22, 0.56)");
    grad.addColorStop(0.55, "rgba(235, 122, 42, 0.42)");
    grad.addColorStop(1, "rgba(248, 165, 88, 0.24)");
  } else if (frameStyle === "rimless-panther") {
    grad.addColorStop(0, "rgba(76, 40, 22, 0.60)");
    grad.addColorStop(0.5, "rgba(138, 90, 60, 0.34)");
    grad.addColorStop(1, "rgba(220, 192, 168, 0.10)");
  } else if (frameStyle === "bold-tortoise") {
    grad.addColorStop(0, "rgba(38, 22, 12, 0.66)");
    grad.addColorStop(0.65, "rgba(58, 34, 20, 0.52)");
    grad.addColorStop(1, "rgba(82, 50, 30, 0.36)");
  } else {
    // Imperial Leão
    grad.addColorStop(0, "rgba(54, 28, 14, 0.64)");
    grad.addColorStop(0.55, "rgba(110, 64, 36, 0.38)");
    grad.addColorStop(1, "rgba(182, 132, 95, 0.14)");
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Leve vinheta interna de espessura de cristal na borda da lente
  const edgeGrad = ctx.createRadialGradient(128, 128, 88, 128, 128, 134);
  edgeGrad.addColorStop(0, "rgba(255,255,255,0)");
  edgeGrad.addColorStop(1, "rgba(255,248,235,0.22)");
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura de Reflexo Specular Dinâmico de Vidro (Softbox + Brilho Anti-Reflexo):
 * Desliza sobre a superfície curva da lente conforme a pessoa gira a cabeça!
 */
function createDynamicGlassReflectionTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  ctx.clearRect(0, 0, 512, 512);

  ctx.save();
  ctx.translate(256, 256);
  ctx.rotate(-0.42);

  // Faixa principal de reflexo de janela/estúdio no vidro
  const mainBand = ctx.createLinearGradient(-220, 0, 220, 0);
  mainBand.addColorStop(0, "rgba(255,255,255,0)");
  mainBand.addColorStop(0.34, "rgba(255,255,255,0)");
  mainBand.addColorStop(0.44, "rgba(255,253,248,0.34)");
  mainBand.addColorStop(0.5, "rgba(255,255,255,0.52)");
  mainBand.addColorStop(0.54, "rgba(220,240,255,0.24)");
  mainBand.addColorStop(0.62, "rgba(255,255,255,0)");
  mainBand.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = mainBand;
  ctx.fillRect(-320, -320, 640, 640);

  // Segunda faixa fina de reflexo óptico secundário
  const secondBand = ctx.createLinearGradient(-220, 0, 220, 0);
  secondBand.addColorStop(0, "rgba(255,255,255,0)");
  secondBand.addColorStop(0.66, "rgba(255,255,255,0)");
  secondBand.addColorStop(0.71, "rgba(255,252,245,0.22)");
  secondBand.addColorStop(0.75, "rgba(255,255,255,0)");
  secondBand.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = secondBand;
  ctx.fillRect(-320, -320, 640, 640);

  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
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

  ctx.fillStyle = dark ? "#190C05" : "#261207";
  ctx.fillRect(0, 0, 256, 256);

  const colors = dark
    ? ["rgba(98, 44, 15, 0.58)", "rgba(148, 70, 22, 0.36)", "rgba(18, 9, 4, 0.72)"]
    : ["rgba(172, 84, 24, 0.68)", "rgba(218, 122, 40, 0.52)", "rgba(30, 14, 6, 0.68)"];

  for (let i = 0; i < 95; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 256;
    const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * 256;
    const r = 14 + (i % 28);
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
            // Vidro óptico físico translúcido com reflexo natural do ambiente (sem manchas brancas artificiais)
            mesh.renderOrder = 3;
            const lensOpacity =
              style === "rimless"
                ? 0.64
                : style === "navigator"
                ? 0.72
                : style === "bold"
                ? 0.82
                : 0.78;
            mesh.material = new THREE.MeshPhysicalMaterial({
              map: tintTex,
              color: new THREE.Color(0xffffff),
              transparent: true,
              opacity: lensOpacity,
              roughness: 0.04,
              metalness: 0.02,
              ior: 1.52,
              reflectivity: 0.9,
              clearcoat: 1.0,
              clearcoatRoughness: 0.03,
              envMapIntensity: 1.45,
              depthWrite: false,
              side: THREE.DoubleSide,
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
              color: new THREE.Color(0.92, 0.76, 0.39),
              metalness: 1.0,
              roughness: 0.16,
              clearcoat: 0.5,
              clearcoatRoughness: 0.08,
              envMapIntensity: 2.0,
            });
          } else if (mName.includes("NosePad_")) {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0xfaf6f0),
              transparent: true,
              opacity: 0.5,
              roughness: 0.14,
              clearcoat: 0.9,
              depthWrite: false,
            });
          } else if (
            mName.includes("PantherSpot") ||
            style === "navigator-amber"
          ) {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0x11100f),
              metalness: 0.04,
              roughness: 0.07,
              clearcoat: 1.0,
              clearcoatRoughness: 0.02,
              envMapIntensity: 1.9,
            });
          } else {
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              map: style === "bold-tortoise" ? tortClassicTex : tortDarkTex,
              color: new THREE.Color(0xffffff),
              metalness: 0.02,
              roughness: 0.1,
              clearcoat: 1.0,
              clearcoatRoughness: 0.02,
              envMapIntensity: 1.7,
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 3.2);
    keyLight.position.set(0.28, 0.48, 0.75);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffe099, 2.2);
    rimLight.position.set(-0.45, 0.25, 0.45);
    scene.add(rimLight);

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

            if (consecutiveHits >= 2) {
              if (!hasFirstLock) {
                hasFirstLock = true;
                currentPose.pos.copy(targetPose.pos);
                currentPose.quat.copy(targetPose.quat);
                currentPose.scale = targetPose.scale * 0.9;
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
        currentPose.pos.lerp(targetPose.pos, 0.45);
        currentPose.quat.slerp(targetPose.quat, 0.4);
        currentPose.scale += (targetPose.scale - currentPose.scale) * 0.38;

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
