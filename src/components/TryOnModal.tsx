"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import type { CatalogData, TryOnErrorCode, TryOnManifest, TryOnState } from "@/types/catalog";
import { getVariantById, isTryOnApproved } from "@/lib/catalog";
import { getProductMedia } from "@/lib/product-media";
import { PrototypeTryOnAdapter } from "@/lib/tryon-adapter";
import { trackEvent } from "@/lib/telemetry";
import { EyewearSvg } from "./EyewearSvg";
import { ArFaceTryOnCanvas } from "./ArFaceTryOnCanvas";

interface TryOnModalProps {
  isOpen: boolean;
  initialVariantId: string;
  catalog: CatalogData;
  manifest: TryOnManifest;
  onClose: () => void;
  onSelectVariant: (variantId: string) => void;
}

const ERRORS: Record<TryOnErrorCode, { title: string; body: string }> = {
  CAMERA_DENIED: {
    title: "A câmera não foi liberada.",
    body: "Autorize o acesso à câmera nas configurações do navegador para provar o óculos em 3D no seu rosto.",
  },
  CAMERA_UNAVAILABLE: {
    title: "Nenhuma câmera encontrada.",
    body: "Ela pode estar em uso por outro aplicativo. Feche-o e tente de novo.",
  },
  UNSUPPORTED: {
    title: "Este navegador não abre a câmera.",
    body: "Se você está no Instagram ou WhatsApp, abra o link no Safari ou no Chrome.",
  },
  ASSET_UNAVAILABLE: {
    title: "Este modelo ainda não está no provador.",
    body: "Escolha outro modelo abaixo.",
  },
  LICENSE_ERROR: {
    title: "O provador está indisponível agora.",
    body: "Tente novamente em instantes.",
  },
  TRACKING_LOST: {
    title: "Não encontramos seu rosto.",
    body: "Centralize o rosto na câmera.",
  },
  LOAD_TIMEOUT: {
    title: "A conexão está lenta.",
    body: "Tente novamente em instantes.",
  },
};

type StageMode = "intro" | "camera";

export function TryOnModal({
  isOpen,
  initialVariantId,
  catalog,
  manifest,
  onClose,
  onSelectVariant,
}: TryOnModalProps) {
  const [state, setState] = useState<TryOnState>("closed");
  const [mode, setMode] = useState<StageMode>("intro");
  const [errorCode, setErrorCode] = useState<TryOnErrorCode | null>(null);
  const [variantId, setVariantId] = useState(initialVariantId);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const adapterRef = useRef<PrototypeTryOnAdapter | null>(null);
  const wasOpenRef = useRef(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  if (!adapterRef.current) adapterRef.current = new PrototypeTryOnAdapter(manifest);

  const selection = useMemo(() => getVariantById(variantId, catalog), [variantId, catalog]);

  const options = useMemo(
    () =>
      catalog.products.map((p) => ({
        product: p,
        variant: p.variants[0],
        approved: isTryOnApproved(p.variants[0].id, manifest),
      })),
    [catalog, manifest]
  );

  const stopCamera = useCallback(() => {
    adapterRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setVariantId(initialVariantId);
      setMode("intro");
      setErrorCode(null);
      setState("explanation");
      trackEvent("tryon_open", { variantId: initialVariantId });
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      stopCamera();
      setState("closed");
    }
  }, [isOpen, initialVariantId, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onVis = () => {
      if (document.hidden && mode === "camera") {
        stopCamera();
        setState("ended");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isOpen, mode, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (mode === "camera" && state === "trying_on" && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [mode, state]);

  const handleClose = useCallback(() => {
    stopCamera();
    setState("closed");
    onClose();
  }, [onClose, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  const startCamera = async () => {
    setMode("camera");
    setErrorCode(null);
    setState("requesting_camera");
    const result = await adapterRef.current!.open(variantId);
    if (!result.ok || !result.stream) {
      const code = result.errorCode ?? "CAMERA_UNAVAILABLE";
      setErrorCode(code);
      setState("error");
      trackEvent(code === "CAMERA_DENIED" ? "camera_denied" : "tryon_error", { variantId, errorCode: code });
      return;
    }
    streamRef.current = result.stream;
    trackEvent("camera_granted", { variantId });
    setState("trying_on");
    trackEvent("tryon_ready", { variantId, sku: selection?.variant.sku });
  };

  const selectVariant = async (nextId: string) => {
    if (nextId === variantId) return;
    const res = await adapterRef.current!.selectVariant(nextId);
    if (!res.ok) return;
    setVariantId(nextId);
    onSelectVariant(nextId);
    const match = getVariantById(nextId, catalog);
    trackEvent("variant_selected", { variantId: nextId, sku: match?.variant.sku, source: "tryon" });
  };

  if (!isOpen || !selection) return null;

  const { product, variant } = selection;
  const media = getProductMedia(product.id);
  const isCameraLive = mode === "camera" && state === "trying_on";
  const glbUrl = variant.glbUrl || product.glbUrl || "/models/oculos-01-imperial-leao.glb";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 backdrop-blur-sm md:items-center md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Provar ${media.shortName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white md:h-[min(86svh,760px)] md:max-w-[1080px] md:flex-row md:rounded-[28px] md:shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
        <button
          ref={closeBtnRef}
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-[#e8e8ed] text-[#1d1d1f] transition-colors hover:bg-[#dcdce1]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        {/* ================= PALCO PRINCIPAL (CÂMERA + RA 3D) ================= */}
        <div className={`relative min-h-0 flex-1 overflow-hidden ${isCameraLive ? "bg-black" : "bg-[#f5f5f7]"}`}>
          {/* Introdução limpa: Apenas 1 botão "Usar câmera" */}
          {mode === "intro" && (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <EyewearSvg variant={variant} className="h-auto w-full max-w-[300px] sm:max-w-[360px]" />
              <h2 className="t-headline mt-8 text-[#1d1d1f]">Veja em você.</h2>
              <p className="mt-2.5 max-w-[360px] text-[15px] sm:text-[17px] text-[#6e6e73]">
                O óculos em 3D acompanha os movimentos do seu rosto em tempo real.
              </p>
              <div className="mt-7">
                <button type="button" onClick={startCamera} className="btn btn-primary">
                  <Camera className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  <span>Usar câmera</span>
                </button>
              </div>
            </div>
          )}

          {/* Pedindo permissão */}
          {mode === "camera" && state === "requesting_camera" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[#6e6e73]">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
              <p className="text-[15px]">Abrindo câmera e rastreamento 3D…</p>
            </div>
          )}

          {/* Câmera ao vivo + Motor 3D MediaPipe Face Landmarker */}
          {isCameraLive && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              <ArFaceTryOnCanvas
                videoRef={videoRef}
                glbUrl={glbUrl}
                frontTextureUrl={media.front}
                frameStyle={variant.frameStyle}
              />
            </>
          )}

          {/* Câmera pausada ao sair da aba */}
          {state === "ended" && (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <p className="t-subhead text-[#1d1d1f]">A câmera foi pausada.</p>
              <button type="button" onClick={startCamera} className="btn btn-primary mt-6">
                Retomar câmera
              </button>
            </div>
          )}

          {/* Erros */}
          {state === "error" && errorCode && (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <p className="t-subhead text-[#1d1d1f]">{ERRORS[errorCode].title}</p>
              <p className="mt-3 max-w-[380px] text-[15px] sm:text-[17px] text-[#6e6e73]">{ERRORS[errorCode].body}</p>
              <div className="mt-7">
                <button type="button" onClick={startCamera} className="btn btn-primary">
                  Tentar novamente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================= LATERAL / BOTTOM SHEET (APENAS MODELOS + COMPRAR) ================= */}
        <aside className="flex shrink-0 flex-col gap-4 border-t border-[#d2d2d7] bg-white p-5 sm:p-6 md:w-[340px] md:gap-6 md:border-l md:border-t-0 md:p-8">
          <div className="md:pt-8">
            <h3 className="text-[22px] sm:text-[28px] font-semibold leading-tight tracking-[0.007em] text-[#1d1d1f]">
              {media.shortName}
            </h3>
            <p className="mt-0.5 sm:mt-1 text-[13px] sm:text-[14px] text-[#6e6e73]">{media.tagline}</p>
          </div>

          <div>
            <p className="text-[13px] sm:text-[14px] font-semibold text-[#1d1d1f]">Modelo</p>
            <div className="no-scrollbar mt-2.5 sm:mt-3 flex gap-2 overflow-x-auto md:grid md:grid-cols-2 md:overflow-visible">
              {options.map(({ product: p, variant: v, approved }) => {
                const m = getProductMedia(p.id);
                const active = p.id === product.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!approved}
                    onClick={() => selectVariant(v.id)}
                    aria-pressed={active}
                    className={`flex w-[108px] shrink-0 flex-col items-center gap-1.5 rounded-[14px] px-2 pb-2 pt-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:w-auto ${
                      active ? "bg-white ring-2 ring-[#1d1d1f]" : "bg-[#f5f5f7] hover:bg-[#ececf0]"
                    }`}
                  >
                    <img src={m.front} alt="" className="h-8 sm:h-9 w-full object-contain" />
                    <span className="text-[12px] text-[#1d1d1f]">{m.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Apenas o botão Comprar (Zero repetição de "Usar câmera" aqui embaixo) */}
          <div className="mt-auto pt-1">
            <a
              href={variant.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("purchase_click", { variantId: variant.id, sku: variant.sku, source: "tryon" })}
              className="btn btn-primary w-full"
            >
              Comprar
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
