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
 * Cria um shader / textura procedural de Vidro Óptico Degradê + Reflexo Specular
 * para que a lente do óculos 3D tenha transparência real de cristal, veja os olhos
 * por trás e brilhe conforme o rosto se move na luz!
 */
function createGlassLensTexture(frameStyle: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  if (frameStyle === "navigator-amber") {
    grad.addColorStop(0, "rgba(218, 92, 24, 0.58)");
    grad.addColorStop(0.55, "rgba(235, 125, 45, 0.44)");
    grad.addColorStop(1, "rgba(245, 165, 90, 0.28)");
  } else if (frameStyle === "rimless-panther") {
    grad.addColorStop(0, "rgba(82, 44, 24, 0.62)");
    grad.addColorStop(0.55, "rgba(148, 98, 66, 0.34)");
    grad.addColorStop(1, "rgba(225, 198, 175, 0.12)");
  } else if (frameStyle === "bold-tortoise") {
    grad.addColorStop(0, "rgba(42, 24, 14, 0.68)");
    grad.addColorStop(1, "rgba(68, 42, 26, 0.48)");
  } else {
    // Imperial Leão
    grad.addColorStop(0, "rgba(58, 30, 16, 0.66)");
    grad.addColorStop(0.6, "rgba(115, 68, 40, 0.38)");
    grad.addColorStop(1, "rgba(185, 135, 98, 0.16)");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Reflexo diagonal suave de cristal anti-reflexo (AR coating sheen)
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(-0.45);
  const sheen = ctx.createLinearGradient(-128, 0, 128, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,252,245,0.28)");
  sheen.addColorStop(0.58, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-180, -180, 360, 360);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Gera textura 3D procedural de Acetato Tartaruga Italiano para o modelo 3D.
 */
function createTortoiseTexture(dark: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = dark ? "#1A0D06" : "#281308";
  ctx.fillRect(0, 0, 256, 256);

  const colors = dark
    ? ["rgba(95, 42, 14, 0.55)", "rgba(145, 68, 22, 0.35)", "rgba(20, 10, 5, 0.7)"]
    : ["rgba(168, 82, 24, 0.65)", "rgba(212, 118, 38, 0.48)", "rgba(32, 15, 7, 0.65)"];

  for (let i = 0; i < 90; i++) {
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
  const faceAnchorRef = useRef<THREE.Group | null>(null);

  // Carrega e aplica materiais PBR de Joalheria + Vidro Óptico Real no modelo 3D (.GLB)
  useEffect(() => {
    if (!glbHolderRef.current) return;
    let cancelled = false;
    const loader = new GLTFLoader();

    const glassTex = createGlassLensTexture(frameStyle);
    const tortDarkTex = createTortoiseTexture(true);
    const tortClassicTex = createTortoiseTexture(false);

    loader.load(glbUrl, (gltf) => {
      if (cancelled || !glbHolderRef.current) return;
      const root = gltf.scene;

      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mName = mesh.name || "";

          if (mName.includes("Lens")) {
            // Lente de Vidro Cristal com Degradê, Specular, Clearcoat e Transmissão
            mesh.renderOrder = 3;
            mesh.material = new THREE.MeshPhysicalMaterial({
              map: glassTex,
              color: new THREE.Color(0xffffff),
              transparent: true,
              opacity: 0.88,
              roughness: 0.03,
              metalness: 0.08,
              ior: 1.54,
              reflectivity: 0.95,
              clearcoat: 1.0,
              clearcoatRoughness: 0.02,
              envMapIntensity: 2.4,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
          } else if (
            mName.includes("Gold") ||
            mName.includes("Lion") ||
            mName.includes("PantherBody") ||
            mName.includes("TempleMetal") ||
            mName.includes("Bridge") ||
            mName.includes("Rivet") ||
            mName.includes("NoseArm") ||
            mName.includes("NosePadCore")
          ) {
            // Ouro 18K Polido de Alta Joalheria
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0.94, 0.78, 0.42),
              metalness: 1.0,
              roughness: 0.14,
              clearcoat: 0.5,
              clearcoatRoughness: 0.08,
              envMapIntensity: 2.2,
            });
          } else if (mName.includes("NosePad_")) {
            // Plaqueta Nasal de Silicone Cristal
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0xfaf6f0),
              transparent: true,
              opacity: 0.48,
              roughness: 0.15,
              clearcoat: 0.8,
              depthWrite: false,
            });
          } else if (
            mName.includes("PantherSpot") ||
            frameStyle === "navigator-amber"
          ) {
            // Acetato / Esmalte Preto Obsidiana de Alto Brilho
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0x0f0e0d),
              metalness: 0.04,
              roughness: 0.08,
              clearcoat: 1.0,
              clearcoatRoughness: 0.03,
              envMapIntensity: 1.8,
            });
          } else {
            // Acetato Italiano Tartaruga Polido
            mesh.renderOrder = 2;
            mesh.material = new THREE.MeshPhysicalMaterial({
              map:
                frameStyle === "bold-tortoise" ? tortClassicTex : tortDarkTex,
              color: new THREE.Color(0xffffff),
              metalness: 0.02,
              roughness: 0.11,
              clearcoat: 1.0,
              clearcoatRoughness: 0.03,
              envMapIntensity: 1.6,
            });
          }
        }
      });

      glbHolderRef.current.clear();
      glbHolderRef.current.add(root);
    });

    return () => {
      cancelled = true;
      glassTex.dispose();
      tortDarkTex.dispose();
      tortClassicTex.dispose();
    };
  }, [glbUrl, frameStyle]);

  // Inicializa Cena Three.js + MediaPipe Face Landmarker
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

    // Key Light frontal superior (cria o reflexo branco realista no vidro da lente)
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 3.2);
    keyLight.position.set(0.25, 0.45, 0.75);
    scene.add(keyLight);

    // Rim Light dourada lateral para acender o leão e a pantera 18K
    const rimLight = new THREE.DirectionalLight(0xffe099, 2.2);
    rimLight.position.set(-0.45, 0.25, 0.45);
    scene.add(rimLight);

    // Grupo Âncora 3D que segue o rosto em tempo real — começa INVISÍVEL até mapear o rosto!
    const faceAnchor = new THREE.Group();
    faceAnchor.visible = false;
    scene.add(faceAnchor);
    faceAnchorRef.current = faceAnchor;

    // 1. Oclusor Craniano Invisível (esconde a haste atrás da têmpora/orelha quando vira o rosto)
    const headOccluder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.062, 0.2, 24),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true })
    );
    headOccluder.position.set(0, -0.008, -0.078);
    headOccluder.renderOrder = 0;
    faceAnchor.add(headOccluder);

    // 2. Holder do Modelo 3D (.GLB) calibrado no encaixe exato da ponte nasal
    const glbHolder = new THREE.Group();
    // No GLB, a ponte do óculos está em Y = +0.008m; deslocamos -0.007m para repousar no nariz
    glbHolder.position.set(0, -0.007, 0.004);
    faceAnchor.add(glbHolder);
    glbHolderRef.current = glbHolder;

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
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );
        if (cancelled) return;
        faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (!cancelled) {
          setTrackingReady(true);
        }
      } catch {
        if (!cancelled) {
          setTrackingReady(true);
        }
      }
    }

    initMediaPipe();

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

          if (landmarks && landmarks.length > 356) {
            consecutiveHits++;
            consecutiveMisses = 0;

            const vw = video.videoWidth || 1280;
            const vh = video.videoHeight || 720;
            const videoAspect = vw / vh;
            const containerAspect = cw / ch;

            // Mapeamento exato do vídeo object-cover espelhado (-scale-x-100) para a câmera Three.js
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
              const mx = 1.0 - pt.x; // Vídeo espelhado
              const wx = (mx - 0.5) * scaleX * visWidth;
              const wy = -(pt.y - 0.5) * scaleY * visHeight;
              // No MediaPipe, pt.z é escalado pela largura da imagem de vídeo
              const wz = -pt.z * scaleX * visWidth;
              return new THREE.Vector3(wx, wy, wz);
            };

            // Pontos anatômicos precisos:
            // #168 = Nasion (ponte nasal entre os olhos)
            // #6   = Dorso do nariz logo abaixo da ponte
            // #33  = Canto externo do olho direito da pessoa
            // #263 = Canto externo do olho esquerdo da pessoa
            // #10  = Testa central | #152 = Ponta do queixo
            const pNasion = toWorld(landmarks[168]);
            const pNoseBridge = toWorld(landmarks[6]);
            const pLeftOuter = toWorld(landmarks[33]);
            const pRightOuter = toWorld(landmarks[263]);
            const pForehead = toWorld(landmarks[10]);
            const pChin = toWorld(landmarks[152]);

            // Centro exato de apoio do óculos (entre o nasion #168 e o topo da ponte #6)
            const anchorPos = new THREE.Vector3().lerpVectors(
              pNasion,
              pNoseBridge,
              0.35
            );
            targetPose.pos.set(anchorPos.x, anchorPos.y, 0);

            // Distância 3D real entre os cantos externos das órbitas oculares
            const eyeOuterDist = pLeftOuter.distanceTo(pRightOuter);
            // Nos nossos modelos GLB, a distância entre as charneiras é 0.136m,
            // que corresponde a 1.38x a distância entre os cantos externos dos olhos
            const desiredScale = (eyeOuterDist * 1.38) / 0.136;
            targetPose.scale = Math.max(0.45, Math.min(2.6, desiredScale));

            // Base ortonormal 3D em espaço métrico real (sem distorção de aspect-ratio!)
            const xAxis = new THREE.Vector3()
              .subVectors(pRightOuter, pLeftOuter)
              .normalize();
            const upApprox = new THREE.Vector3()
              .subVectors(pForehead, pChin)
              .normalize();
            const zAxis = new THREE.Vector3()
              .crossVectors(xAxis, upApprox)
              .normalize();
            const yAxis = new THREE.Vector3()
              .crossVectors(zAxis, xAxis)
              .normalize();

            const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
            targetPose.quat.setFromRotationMatrix(rotMat);

            // Assim que confirmar 2 quadros seguidos do rosto, encaixa o óculos instantaneamente!
            if (consecutiveHits >= 2) {
              if (!hasFirstLock) {
                hasFirstLock = true;
                currentPose.pos.copy(targetPose.pos);
                currentPose.quat.copy(targetPose.quat);
                currentPose.scale = targetPose.scale * 0.85;
              }
              faceAnchor.visible = true;
              setFaceLocked(true);
            }
          } else {
            consecutiveMisses++;
            consecutiveHits = 0;
            if (consecutiveMisses > 8) {
              faceAnchor.visible = false;
              hasFirstLock = false;
              setFaceLocked(false);
            }
          }
        } catch {
          // Ignore frame detection error
        }
      }

      if (faceAnchor.visible) {
        currentPose.pos.lerp(targetPose.pos, 0.42);
        currentPose.quat.slerp(targetPose.quat, 0.38);
        currentPose.scale += (targetPose.scale - currentPose.scale) * 0.35;

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
      pmrem.dispose();
      renderer.dispose();
    };
  }, [videoRef]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div ref={mountRef} className="h-full w-full" />

      {/* Marcação Guia de Rosto ("Posicione seu rosto aqui") — some assim que o óculos encaixa no rosto! */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${
          faceLocked ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="relative h-[300px] w-[220px] sm:h-[340px] sm:w-[250px]">
          <svg
            viewBox="0 0 240 320"
            fill="none"
            className="h-full w-full drop-shadow-[0_4px_20px_rgba(0,0,0,0.45)]"
          >
            {/* Cantoneiras de escaneamento estilo Face ID */}
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

            {/* Contorno oval anatômico do rosto */}
            <ellipse
              cx="120"
              cy="158"
              rx="78"
              ry="106"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />

            {/* Linha guia da altura dos olhos / ponte nasal */}
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
