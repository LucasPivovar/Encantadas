import type { TryOnErrorCode, TryOnManifest } from "@/types/catalog";
import { isTryOnApproved } from "./catalog";

export interface TryOnAdapterResult {
  ok: boolean;
  stream?: MediaStream;
  errorCode?: TryOnErrorCode;
}

export interface TryOnAdapter {
  open(variantId: string): Promise<TryOnAdapterResult>;
  selectVariant(variantId: string): Promise<TryOnAdapterResult>;
  close(): void;
}

/**
 * Isolates camera lifecycle and future AR SDK integration (e.g. Fittingbox / Banuba).
 * In this prototype, it manages real local getUserMedia video-only streams
 * without transmitting frames or facial geometry.
 */
export class PrototypeTryOnAdapter implements TryOnAdapter {
  private stream: MediaStream | null = null;
  private manifest: TryOnManifest;

  constructor(manifest: TryOnManifest) {
    this.manifest = manifest;
  }

  async open(variantId: string): Promise<TryOnAdapterResult> {
    if (!isTryOnApproved(variantId, this.manifest)) {
      return { ok: false, errorCode: "ASSET_UNAVAILABLE" };
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      return { ok: false, errorCode: "UNSUPPORTED" };
    }

    try {
      this.close();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      this.stream = stream;
      return { ok: true, stream };
    } catch (err) {
      const errorName = err instanceof DOMException ? err.name : "";
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        return { ok: false, errorCode: "CAMERA_DENIED" };
      }
      if (
        errorName === "NotFoundError" ||
        errorName === "DevicesNotFoundError" ||
        errorName === "NotReadableError" ||
        errorName === "TrackStartError"
      ) {
        return { ok: false, errorCode: "CAMERA_UNAVAILABLE" };
      }
      return { ok: false, errorCode: "UNSUPPORTED" };
    }
  }

  async selectVariant(variantId: string): Promise<TryOnAdapterResult> {
    if (!isTryOnApproved(variantId, this.manifest)) {
      return { ok: false, errorCode: "ASSET_UNAVAILABLE" };
    }
    // Preserves the active camera session while swapping the digital frame asset
    await new Promise((resolve) => setTimeout(resolve, 260));
    return { ok: true, stream: this.stream ?? undefined };
  }

  close(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
  }
}
