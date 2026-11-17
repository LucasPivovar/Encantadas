export type PublicationStatus = "draft" | "published" | "archived";
export type AssetStatus = "missing" | "processing" | "review" | "approved" | "disabled";

export interface DimensionsMm {
  totalWidth: number;
  lensWidth: number;
  lensHeight: number;
  bridge: number;
  templeLength: number;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  colorName: string;
  colorHex: string;
  lensDescription: string;
  materialDescription: string;
  gallery: string[];
  purchaseUrl: string;
  optionalDisplayPrice?: string;
  commercialAvailability: "available" | "out_of_stock" | "coming_soon";
  frameStyle: "imperial-lion" | "navigator-amber" | "rimless-panther" | "bold-tortoise" | "sculptural" | "wireframe" | "cat-eye";
  glbUrl?: string;
}

export interface Product {
  id: string;
  collectionId: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  dimensionsMm: DimensionsMm;
  heroImage: string;
  orthographicSheet?: string;
  glbUrl?: string;
  variants: Variant[];
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  heroMedia: string;
  publicationStatus: PublicationStatus;
  version: string;
}

export interface CatalogData {
  version: string;
  isPrototypeData: boolean;
  collection: Collection;
  products: Product[];
}

export interface TryOnAsset {
  id: string;
  variantId: string;
  sku: string;
  provider: "fittingbox" | "banuba" | "prototype-overlay";
  providerAssetId?: string;
  assetUrl?: string;
  version: string;
  calibrationVersion: string;
  status: AssetStatus;
  approvedAt?: string;
}

export interface TryOnConfig {
  enabled: boolean;
  provider: "fittingbox" | "banuba" | "prototype-overlay";
  publishedCatalogVersion: string;
  supportedCapabilities: string[];
}

export interface TryOnManifest {
  version: string;
  config: TryOnConfig;
  assets: TryOnAsset[];
}

export type TryOnState =
  | "closed"
  | "explanation"
  | "requesting_camera"
  | "loading_assets"
  | "searching_face"
  | "trying_on"
  | "ended"
  | "error";

export type TryOnErrorCode =
  | "CAMERA_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "UNSUPPORTED"
  | "ASSET_UNAVAILABLE"
  | "LICENSE_ERROR"
  | "TRACKING_LOST"
  | "LOAD_TIMEOUT";

export type TryOnHint = "none" | "low_light" | "multiple_faces" | "tracking_lost";
