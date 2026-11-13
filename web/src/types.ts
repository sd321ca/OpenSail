/**
 * Shared types for the dashboard client.
 *
 * These mirror the payloads produced by ``comfyui_ui/server.py``. They are
 * hand-maintained today; the backend has no ``response_model`` declarations
 * yet, so ``/openapi.json`` cannot be used as the source of truth.
 */

/** Shape returned by ``POST /api/uploads``. */
export interface UploadedFile {
  id: string;
  url: string;
  name: string;
  content_type: string;
  size: number;
}

/** A workflow file exposed by ``GET /api/bootstrap``. */
export interface WorkflowSummary {
  /** File name including its extension, used as the URL key. */
  name: string;
  /** Display label (the file name without its extension). */
  label: string;
}

/** One entry of the ``chat_models`` bootstrap list. */
export interface ChatModel {
  alias: string;
  path: string;
  multimodal: boolean;
}

/** One entry of the ``audio_models`` bootstrap list. */
export interface AudioModel {
  alias: string;
  id: string;
  family: string;
  task: string;
}

/** One entry of the ``tts_models`` bootstrap list. */
export interface TtsModel {
  alias: string;
  id: string;
}

/** One entry of the ``chat_personas`` bootstrap mapping. */
export interface ChatPersonaSettings {
  system_prompt: string;
  voice_engine: string;
  voice: string;
}

/** ``chat_personas`` is a ``name -> settings`` mapping, not a list. */
export type ChatPersonas = Record<string, ChatPersonaSettings>;

/** Response of ``GET /api/bootstrap``. */
export interface Bootstrap {
  workflows: WorkflowSummary[];
  default_workflow: string | null;
  chat_models: ChatModel[];
  default_chat_model: string | null;
  audio_models: AudioModel[];
  default_audio_model: string | null;
  tts_models: TtsModel[];
  chat_system_prompt: string;
  chat_personas: ChatPersonas;
  chat_loaded: boolean;
  chat_model: string | null;
  chat_status: string;
  audio_loaded: boolean;
  audio_status: string;
  max_image_inputs: number;
  comfy_url: string;
  comfy_configured: boolean;
  comfy_managed: boolean;
  server_name: string;
  server_port: number;
  auth_enabled: boolean;
}

/** Response of ``GET /api/status``. */
export interface ServerStatus {
  comfy: boolean;
  comfy_managed: boolean;
  comfy_configured: boolean;
  chat_loaded: boolean;
  chat_model: string | null;
  audio_loaded: boolean;
}

/** One entry returned by the gallery endpoints. */
export interface GalleryItem {
  filename: string;
  subfolder: string;
  /** ``"local"`` for files in the media folder, otherwise a ComfyUI source. */
  type: string;
  prompt_id?: string;
  prompt?: string;
  url: string;
  thumbnail_url?: string;
}

/** Response of ``GET /api/gallery/{images,audio,videos}``. */
export interface GalleryResponse {
  items: GalleryItem[];
}

/** A row of the pre-formatted metadata summary. */
export interface ImageMetadataRow {
  label?: string;
  value?: unknown;
}

/** Response of ``GET /api/gallery/image-metadata``. */
export interface ImageMetadataResponse {
  metadata?: {
    summary?: ImageMetadataRow[];
    prompt?: unknown;
    workflow?: unknown;
    parameters?: unknown;
    comment?: unknown;
    description?: unknown;
    title?: unknown;
  };
}

/** The three ComfyUI workflow families the dashboard understands. */
export type WorkflowKind = "image" | "audio" | "video";

/** The declarative field definition attached to a node candidate. */
export interface FieldDef {
  widget?: string;
  label?: string;
  choices?: string[];
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

/** One editable node input ("binding") exposed by ``list_node_candidates``. */
export interface NodeCandidate {
  /** ``node_id|input_key`` */
  id: string;
  node: string;
  input: string;
  class_type: string;
  title: string;
  field: string;
  label: string;
  display_name: string;
  value: unknown;
  field_def: FieldDef;
}

/** A node that accepts an uploaded/gallery media input. */
export interface WorkflowNodeRef {
  id: string;
  label: string;
}

/** Response of ``GET /api/workflows/{name}``. */
export interface WorkflowConfig {
  name: string;
  kind: WorkflowKind;
  candidates: NodeCandidate[];
  selected: string[];
  names: Record<string, string>;
  values: Record<string, unknown>;
  image_nodes: WorkflowNodeRef[];
  audio_nodes: WorkflowNodeRef[];
  video_nodes: WorkflowNodeRef[];
  presets: Record<string, Record<string, unknown>>;
  preset_names: string[];
  default_preset: string | null;
  notes: string | null;
  saved_selection: boolean;
}

/** A reference to an uploaded file or a gallery item. */
export interface MediaRef {
  upload?: string | null;
  gallery?: { filename: string; subfolder?: string; type?: string } | null;
  /** Local preview URL (upload proxy URL or the gallery item's URL). */
  previewUrl?: string;
  url?: string;
  name?: string;
  id?: string;
}

/** The finished (or failed) output of a generation. */
export interface GenerationResult {
  filename?: string;
  url?: string;
  kind?: string;
  [key: string]: unknown;
}

/** Progress reported by ``GET /api/generate/status``. */
export interface GenerationProgress {
  value?: number;
  message?: string;
  indeterminate?: boolean;
}

/** Response of ``GET /api/generate/status``. */
export interface GenerationSnapshot {
  running: boolean;
  result: GenerationResult | null;
  error: string;
  progress: GenerationProgress | null;
  workflow: string | null;
  elapsed_ms?: number;
  done_at?: number;
}

/**
 * The object every page renderer receives from ``app.ts``.
 *
 * Typing this is what keeps the app shell and the page modules in sync.
 */
export interface RenderContext {
  /** Bootstrap payload, available once boot has completed. */
  readonly boot: Bootstrap | null;
  /** Typed wrapper around ``api()`` re-exported for pages. */
  api: <T = any>(path: string, options?: import("./api").ApiOptions) => Promise<T>;
  toast: (message: unknown, type?: import("./ui").ToastType, timeout?: number) => void;
  /** Re-render the sidebar's service indicators. */
  refreshStatus: () => Promise<void>;
  /** Navigate to another page by route key. */
  navigate: (page: string) => void;
}

/** A page renderer. Returns an optional cleanup callback. */
export type PageRenderer = (
  root: HTMLElement,
  ctx: RenderContext,
) => Promise<void | (() => void)>;
