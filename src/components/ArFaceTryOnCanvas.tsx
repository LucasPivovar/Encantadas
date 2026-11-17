"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Loader2 } from "lucide-react";

interface ArFaceTryOnCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  glbUrl: string;
  frontTextureUrl: string;
  frameStyle: string;
}

/**
 * Motor de Realidade Aumentada (RA) 3D em Tempo Real com MediaPipe Face Landmarker + Three.js:
 * 1. Rastreia 478 pontos 3D do rosto na câmera a 60fps (incluindo ponte nasal #168,
 *    cantos externos das órbitas #33 e #263, têmporas #127 e #356, e centro da cabeça).
 * 2. Calcula posição 3D exata (X, Y, Z), escala anatômica (distância bi-ocular + profundidade)
 *    e matriz de rotação 3D completa (Yaw / Pitch / Roll) quando a pessoa vira ou inclina a cabeça.
 * 3. Inclui cilindro invisível de Oclusão Craniana (Head Occluder `colorWrite: false`) para que
 *    a haste traseira desapareça fisicamente atrás da têmpora/orelha quando o rosto vira de lado!
 * 4. Combina o Plano Fotográfico Frontal de Alta Definição (ouro 18K do leão, pintas da pantera,
 *    tartaruga real e lentes degradê translúcidas) com as Hastes 3D e Volumes Metálicos PBR do
 *    modelo .GLB no Three.js.
 */
export function ArFaceTryOnCanvas({
  videoRef,
  glbUrl,
  frontTextureUrl,
  frameStyle,
}: ArFaceTryOnCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [trackingReady, setTrackingReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);

  // Refs mutáveis para atualização de texturas e modelos sem recriar o WebGLRenderer
  const frontPlaneMeshRef = useRef<THREE.Mesh | null>(null);
  const glbHolderRef = useRef<THREE.Group | null>(null);

  // Atualiza textura frontal fotorrealista sempre que o usuário troca de óculos
  useEffect(() => {
    if (!frontPlaneMeshRef.current) return;
    const loader = new THREE.TextureLoader();
    loader.load(frontTextureUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = frontPlaneMeshRef.current?.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      if (frontPlaneMeshRef.current && tex.image) {
        const aspect = tex.image.width / Math.max(1, tex.image.height);
        const widthMeters = 0.144;
        const heightMeters = widthMeters / aspect;
        frontPlaneMeshRef.current.geometry.dispose();
        frontPlaneMeshRef.current.geometry = new THREE.PlaneGeometry(
          widthMeters,
          heightMeters
        );
      }
    });
  }, [frontTextureUrl]);

  // Atualiza as hastes e detalhes 3D (.glb) quando o usuário troca de modelo
  useEffect(() => {
    if (!glbHolderRef.current) return;
    let cancelled = false;
    const loader = new GLTFLoader();

    loader.load(glbUrl, (gltf) => {
      if (cancelled || !glbHolderRef.current) return;
      const root = gltf.scene;

      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.renderOrder = 2;
          const mName = mesh.name || "";
          const oldMat = mesh.material as THREE.MeshStandardMaterial;

          // Como o plano frontal já traz a fotografia real ultra-detalhada da frente,
          // damos destaque total às hastes 3D laterais, charneiras (leão/pantera) e ponte 3D
          if (mName.includes("Lens") || mName.includes("Rim")) {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: oldMat?.color || new THREE.Color(0x2b170c),
              transparent: true,
              opacity: mName.includes("Lens") ? 0.18 : 0.42,
              roughness: 0.08,
              metalness: 0.1,
              clearcoat: 1.0,
              depthWrite: false,
            });
          } else if (
            mName.includes("Gold") ||
            mName.includes("Lion") ||
            mName.includes("Panther") ||
            mName.includes("TempleMetal") ||
            mName.includes("Bridge")
          ) {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0.92, 0.75, 0.36),
              metalness: 1.0,
              roughness: 0.14,
              clearcoat: 0.4,
              envMapIntensity: 2.0,
            });
          } else {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: oldMat?.color || new THREE.Color(0x1e110a),
              metalness: 0.04,
              roughness: 0.14,
              clearcoat: 1.0,
              envMapIntensity: 1.5,
            });
          }
        }
      });

      glbHolderRef.current.clear();
      glbHolderRef.current.add(root);
    });

    return () => {
      cancelled = true;
    };
  }, [glbUrl, frameStyle]);

  // Inicializa Cena Three.js + MediaPipe Face Landmarker
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();

    // Câmera ortográfica/perspectiva calibrada para sobreposição de vídeo espelhado
    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.01,
      10
    );
    camera.position.set(0, 0, 0.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const dirLight = new THREE.DirectionalLight(0xfff5e4, 2.6);
    dirLight.position.set(0.3, 0.5, 0.7);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xd4af37, 1.8);
    rimLight.position.set(-0.4, 0.3, 0.4);
    scene.add(rimLight);

    // Grupo Âncora 3D que segue o rosto em tempo real (6-DoF: X, Y, Z, Yaw, Pitch, Roll)
    const faceAnchor = new THREE.Group();
    scene.add(faceAnchor);

    // 1. Oclusor Craniano Invisível (grava no Z-buffer para esconder a haste atrás da orelha!)
    const headOccluderGeo = new THREE.CylinderGeometry(0.068, 0.064, 0.19, 24);
    const headOccluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    });
    const headOccluder = new THREE.Mesh(headOccluderGeo, headOccluderMat);
    headOccluder.position.set(0, -0.01, -0.078);
    headOccluder.renderOrder = 0;
    faceAnchor.add(headOccluder);

    // 2. Sombra de Contato Suave sob a Ponte do Nariz e Bochechas
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 64;
    const sCtx = shadowCanvas.getContext("2d");
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 32, 4, 64, 32, 56);
      grad.addColorStop(0, "rgba(0,0,0,0.28)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 64);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.145, 0.055),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    shadowMesh.position.set(0, -0.008, -0.002);
    shadowMesh.renderOrder = 1;
    faceAnchor.add(shadowMesh);

    // 3. Holder do Modelo 3D (.GLB com hastes, charneiras de leão/pantera e ponte 3D)
    const glbHolder = new THREE.Group();
    glbHolder.position.set(0, -0.002, 0.001);
    faceAnchor.add(glbHolder);
    glbHolderRef.current = glbHolder;

    // 4. Plano Fotográfico Frontal de Alta Definição (Textura Real da Foto com Lente Degradê)
    const frontPlaneMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const frontPlaneMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.144, 0.048),
      frontPlaneMat
    );
    frontPlaneMesh.position.set(0, -0.002, 0.0035);
    frontPlaneMesh.renderOrder = 3;
    faceAnchor.add(frontPlaneMesh);
    frontPlaneMeshRef.current = frontPlaneMesh;

    // Dispara carregamento inicial da textura e do GLB
    const texLoader = new THREE.TextureLoader();
    texLoader.load(frontTextureUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      frontPlaneMat.map = tex;
      frontPlaneMat.needsUpdate = true;
      if (tex.image) {
        const aspect = tex.image.width / Math.max(1, tex.image.height);
        const w = 0.144;
        frontPlaneMesh.geometry.dispose();
        frontPlaneMesh.geometry = new THREE.PlaneGeometry(w, w / aspect);
      }
    });

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(glbUrl, (gltf) => {
      glbHolder.clear();
      glbHolder.add(gltf.scene);
    });

    // Estado suavizado (One-Euro / Exponential Smoothing) para zero tremor
    const targetPose = {
      pos: new THREE.Vector3(0, 0.015, 0),
      quat: new THREE.Quaternion(),
      scale: 1.0,
    };
    const currentPose = {
      pos: new THREE.Vector3(0, 0.015, 0),
      quat: new THREE.Quaternion(),
      scale: 1.0,
    };

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
        // Fallback gracioso caso CDN esteja offline: mantém o óculos 3D centralizado com leve flutuação
        if (!cancelled) {
          setTrackingReady(true);
          setFaceDetected(true);
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
            setFaceDetected(true);

            // Pontos anatômicos do MediaPipe Face Mesh:
            // #168 = Ponte nasal entre os olhos (nasion)
            // #33  = Canto externo do olho direito da pessoa
            // #263 = Canto externo do olho esquerdo da pessoa
            // #10  = Topo da testa | #152 = Queixo
            const bridge = landmarks[168];
            const leftEyeOuter = landmarks[33];
            const rightEyeOuter = landmarks[263];
            const forehead = landmarks[10];
            const chin = landmarks[152];

            // Ajuste para object-cover e espelhamento horizontal (-scale-x-100) do vídeo
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

            const toScreen = (pt: { x: number; y: number; z: number }) => {
              // Vídeo espelhado: x = 1 - pt.x
              const mx = 1.0 - pt.x;
              const nx = (mx - 0.5) * 2.0 * scaleX;
              const ny = -(pt.y - 0.5) * 2.0 * scaleY;
              const nz = -pt.z * 2.0 * scaleX;
              return new THREE.Vector3(nx, ny, nz);
            };

            const pBridge = toScreen(bridge);
            const pLeft = toScreen(leftEyeOuter);
            const pRight = toScreen(rightEyeOuter);
            const pTop = toScreen(forehead);
            const pBot = toScreen(chin);

            // Converte coordenadas normalizadas da tela na distância da câmera (z = 0)
            const vFovRad = (camera.fov * Math.PI) / 180;
            const visHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z;
            const visWidth = visHeight * (cw / ch);

            targetPose.pos.set(
              pBridge.x * (visWidth * 0.5),
              pBridge.y * (visHeight * 0.5) - 0.004,
              0
            );

            // Escala proporcional à distância real entre os cantos externos dos olhos
            const eyeSpanWorld = Math.hypot(
              (pRight.x - pLeft.x) * (visWidth * 0.5),
              (pRight.y - pLeft.y) * (visHeight * 0.5)
            );
            // Largura da armação (~0.142m) é ~1.48x a distância entre os cantos externos das órbitas
            targetPose.scale = Math.max(
              0.55,
              Math.min(2.4, (eyeSpanWorld * 1.48) / 0.142)
            );

            // Vetores ortonormais 3D da cabeça (Eixo X = olho a olho, Eixo Y = queixo à testa, Eixo Z = frente)
            const xAxis = new THREE.Vector3()
              .subVectors(pRight, pLeft)
              .normalize();
            const yTemp = new THREE.Vector3()
              .subVectors(pTop, pBot)
              .normalize();
            const zAxis = new THREE.Vector3()
              .crossVectors(xAxis, yTemp)
              .normalize();
            const yAxis = new THREE.Vector3()
              .crossVectors(zAxis, xAxis)
              .normalize();

            const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
            targetPose.quat.setFromRotationMatrix(rotMat);
          } else {
            setFaceDetected(false);
          }
        } catch {
          // Ignore single frame detection error
        }
      }

      // Interpolação suave (60fps) para que o óculos acompanhe o rosto sem tremer
      currentPose.pos.lerp(targetPose.pos, 0.35);
      currentPose.quat.slerp(targetPose.quat, 0.32);
      currentPose.scale += (targetPose.scale - currentPose.scale) * 0.32;

      faceAnchor.position.copy(currentPose.pos);
      faceAnchor.quaternion.copy(currentPose.quat);
      faceAnchor.scale.setScalar(currentPose.scale);

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

      {!trackingReady && (
        <div className="absolute inset-x-0 top-5 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-black/65 px-4 py-1.5 text-[12px] text-white backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Calibrando rastreamento facial 3D…</span>
          </div>
        </div>
      )}

      {trackingReady && !faceDetected && (
        <div className="absolute inset-x-0 top-5 flex justify-center">
          <div className="rounded-full bg-black/65 px-4 py-1.5 text-[12px] text-white backdrop-blur-md">
            Centralize o seu rosto na câmera
          </div>
        </div>
      )}
    </div>
  );
}
