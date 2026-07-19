/**
 * Advanced QR camera session — BarcodeDetector (native) + html5-qrcode fallback.
 * High resolution, continuous focus, device switching with full stream disposal.
 */

import type { Html5Qrcode } from "html5-qrcode";
import { isAbortError, preferBackCamera } from "./bookingQrClient";

export { preferBackCamera };

export type CameraFacing = "front" | "back";
export type ScanEngine = "native" | "html5";

export type CameraDevice = { id: string; label: string };

export type ScannerStatus = {
  facing: CameraFacing;
  label: string;
  deviceIndex: number;
  deviceCount: number;
  canSwitch: boolean;
  engine: ScanEngine;
};

const SCAN_FPS = 15;
const SCAN_INTERVAL_MS = 1000 / SCAN_FPS;

const HTML5_SCANNER_CONFIG = {
  fps: SCAN_FPS,
  aspectRatio: 1.333333,
  disableFlip: false,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const edge = Math.min(viewfinderWidth, viewfinderHeight);
    const size = Math.max(160, Math.floor(edge * 0.82));
    return { width: size, height: size };
  },
};

const SCANNER_NOT_STARTED = 0;

function log(step: string, detail?: unknown) {
  if (typeof console !== "undefined") {
    console.log(`[QR Scanner] ${step}`, detail ?? "");
  }
}

export function isMobileOrTablet(): boolean {
  return preferBackCamera();
}

export function defaultCameraFacing(): CameraFacing {
  return isMobileOrTablet() ? "back" : "front";
}

export function otherCameraFacing(facing: CameraFacing): CameraFacing {
  return facing === "back" ? "front" : "back";
}

export function cameraFacingLabel(facing: CameraFacing): string {
  return facing === "back" ? "Back camera" : "Front camera";
}

export function isNotFoundError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "NotFoundError") return true;
  if (e instanceof Error) {
    if (e.name === "NotFoundError") return true;
    if (/device not found|overconstrained|no camera/i.test(e.message)) return true;
  }
  return false;
}

export function isNotAllowedError(e: unknown): boolean {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}

export function isNotReadableError(e: unknown): boolean {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  return name === "NotReadableError" || name === "TrackStartError";
}

export function isOverconstrainedError(e: unknown): boolean {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  if (name === "OverconstrainedError") return true;
  if (e instanceof Error && /overconstrained|constraint/i.test(e.message)) return true;
  return false;
}

export function cameraErrorMessage(e: unknown, secureContext: boolean): string {
  if (!secureContext) {
    return isMobileOrTablet()
      ? "Camera needs HTTPS on mobile. Open the site with https:// (not http:// or a raw IP address), then try again."
      : "Camera requires a secure page. Use https:// or http://localhost — not a plain http:// IP address.";
  }
  if (isNotAllowedError(e)) {
    return "Camera permission denied. In browser settings, allow camera for this site, then tap Open Camera again.";
  }
  if (isNotFoundError(e)) {
    return "No camera detected on this device. Use manual QR entry below.";
  }
  if (isNotReadableError(e)) {
    return "Camera is in use by another app. Close it and tap Open Camera again.";
  }
  if (isOverconstrainedError(e)) {
    return "Could not open camera with requested settings. Tap Open Camera to retry, or use Switch Camera.";
  }
  if (isAbortError(e)) {
    return "Camera was interrupted. Tap Open Camera again.";
  }
  if (e instanceof Error && /secure|https|insecure/i.test(e.message)) {
    return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Could not start camera. Tap Open Camera and allow access when prompted.";
}

export function cameraHint(isMobile: boolean): string {
  return isMobile
    ? "Tap Open Camera, allow access, then point the rear camera at the bill QR."
    : "Click Open Camera, allow access, then align the QR inside the frame.";
}

function isVirtualCamera(label: string): boolean {
  return /obs|virtual|manycam|snap camera|xsplit|nvidia broadcast|mmhmm|droidcam|epoc/i.test(
    label.toLowerCase()
  );
}

function scoreDevice(label: string, preferBack: boolean): number {
  const l = label.toLowerCase();
  let score = 0;
  if (isVirtualCamera(l)) score += 200;
  if (preferBack) {
    if (/back|rear|environment|wide|telephoto|main/i.test(l)) score -= 100;
    if (/front|user|selfie|face/i.test(l)) score += 40;
  } else {
    if (/front|user|selfie|face|facetime|integrated|webcam|hd webcam|usb video/i.test(l)) score -= 100;
    if (/back|rear|environment/i.test(l)) score += 40;
  }
  return score;
}

function sortDevices(devices: CameraDevice[], preferBack: boolean): CameraDevice[] {
  return [...devices].sort((a, b) => scoreDevice(a.label, preferBack) - scoreDevice(b.label, preferBack));
}

async function enumerateVideoDevices(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === "videoinput" && d.deviceId)
    .map((d) => ({ id: d.deviceId, label: d.label || "Camera" }));
}

type StartAttempt =
  | { kind: "device"; id: string; label: string }
  | { kind: "facing"; mode: "user" | "environment"; label: string; facing: CameraFacing };

function buildAttempts(
  devices: CameraDevice[],
  deviceIndex: number,
  preferBack: boolean,
  facingOverride?: CameraFacing
): StartAttempt[] {
  const attempts: StartAttempt[] = [];
  const seen = new Set<string>();

  const addDevice = (d: CameraDevice) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    attempts.push({ kind: "device", id: d.id, label: d.label });
  };

  if (devices.length > 0) {
    for (let i = 0; i < devices.length; i++) {
      addDevice(devices[(deviceIndex + i) % devices.length]);
    }
  }

  const primaryFacing: CameraFacing = facingOverride ?? (preferBack ? "back" : "front");
  const secondaryFacing = otherCameraFacing(primaryFacing);
  const primaryMode = primaryFacing === "back" ? "environment" : "user";
  const secondaryMode = secondaryFacing === "back" ? "environment" : "user";

  attempts.push({
    kind: "facing",
    mode: primaryMode,
    label: cameraFacingLabel(primaryFacing),
    facing: primaryFacing,
  });
  attempts.push({
    kind: "facing",
    mode: secondaryMode,
    label: cameraFacingLabel(secondaryFacing),
    facing: secondaryFacing,
  });

  return attempts;
}

function buildHighResVideoConstraints(
  attempt: StartAttempt,
  preferBack: boolean
): MediaStreamConstraints[] {
  const facing =
    attempt.kind === "facing"
      ? attempt.mode
      : preferBack
        ? "environment"
        : "user";

  const highRes: MediaTrackConstraints =
    attempt.kind === "device"
      ? {
          deviceId: { ideal: attempt.id },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        }
      : {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        };

  const mediumRes: MediaTrackConstraints =
    attempt.kind === "device"
      ? {
          deviceId: { ideal: attempt.id },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };

  const facingOnly: MediaTrackConstraints =
    attempt.kind === "device"
      ? { deviceId: { ideal: attempt.id } }
      : { facingMode: { ideal: facing } };

  const facingExact: MediaTrackConstraints =
    attempt.kind === "device"
      ? { deviceId: { exact: attempt.id } }
      : { facingMode: { exact: facing } };

  return [{ video: highRes }, { video: mediumRes }, { video: facingOnly }, { video: facingExact }, { video: true }];
}

async function applyAdvancedTrackSettings(track: MediaStreamTrack): Promise<void> {
  try {
    const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
    if (!caps) return;

    const advanced: MediaTrackConstraintSet[] = [];

    const focusModes = caps.focusMode as string[] | undefined;
    if (Array.isArray(focusModes) && focusModes.includes("continuous")) {
      advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
    }

    const zoomCap = caps.zoom as { min?: number; max?: number } | undefined;
    if (zoomCap && typeof zoomCap.max === "number" && zoomCap.max > 1) {
      const min = zoomCap.min ?? 1;
      const target = Math.min(zoomCap.max, Math.max(min + 0.1, min * 1.15));
      advanced.push({ zoom: target } as MediaTrackConstraintSet);
      log("zoom applied", target);
    }

    if (advanced.length > 0) {
      await track.applyConstraints({ advanced } as MediaTrackConstraints);
      log("advanced track constraints applied", advanced);
    }
  } catch (e) {
    log("advanced constraints skipped", e);
  }
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string; format?: string }>>;
};

export type DetectedBarcodeFormat =
  | "QR_CODE"
  | "CODE_128"
  | "CODE_39"
  | "EAN_13"
  | "EAN_8"
  | "UPC_A"
  | "UPC_E"
  | "UNKNOWN";

const NATIVE_BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

export function normalizeDetectedBarcodeFormat(raw?: string | null): DetectedBarcodeFormat {
  const value = (raw || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (value === "QR_CODE" || value === "QR") return "QR_CODE";
  if (value === "CODE_128" || value === "CODE128") return "CODE_128";
  if (value === "CODE_39" || value === "CODE39") return "CODE_39";
  if (value === "EAN_13" || value === "EAN13") return "EAN_13";
  if (value === "EAN_8" || value === "EAN8") return "EAN_8";
  if (value === "UPC_A" || value === "UPCA") return "UPC_A";
  if (value === "UPC_E" || value === "UPCE") return "UPC_E";
  return "UNKNOWN";
}

async function createBarcodeDetector(): Promise<BarcodeDetectorLike | null> {
  if (typeof window === "undefined") return null;
  const BD = (window as Window & { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  if (!BD) return null;
  try {
    const detector = new BD({ formats: NATIVE_BARCODE_FORMATS });
    log("BarcodeDetector native engine ready");
    return detector;
  } catch (e) {
    log("BarcodeDetector init failed", e);
    return null;
  }
}

function html5CameraArgs(attempt: StartAttempt): Array<string | MediaTrackConstraints> {
  if (attempt.kind === "device") return [attempt.id];
  return [
    { facingMode: attempt.mode },
    { facingMode: { ideal: attempt.mode } },
    { facingMode: { exact: attempt.mode } },
  ];
}

type ScannerHandle = Html5Qrcode & { getState?: () => number };

/** Advanced QR session with native BarcodeDetector + html5-qrcode fallback. */
export class QrCameraSession {
  private readonly elementId: string;
  private readonly preferBack: boolean;
  private scanner: ScannerHandle | null = null;
  private devices: CameraDevice[] = [];
  private deviceIndex = 0;
  private facing: CameraFacing;
  private activeLabel = "Camera";
  private engine: ScanEngine = "html5";

  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private detector: BarcodeDetectorLike | null = null;
  private scanActive = false;
  private paused = false;
  private rafId = 0;
  private lastScanAt = 0;

  constructor(elementId: string) {
    this.elementId = elementId;
    this.preferBack = isMobileOrTablet();
    this.facing = defaultCameraFacing();
  }

  getStatus(): ScannerStatus {
    return {
      facing: this.facing,
      label: this.activeLabel,
      deviceIndex: this.deviceIndex,
      deviceCount: Math.max(this.devices.length, 2),
      canSwitch: true,
      engine: this.engine,
    };
  }

  async requestPermission(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported in this browser.");
    }

    const facing = this.preferBack ? "environment" : "user";
    const tries: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      },
      { video: { facingMode: { ideal: facing } } },
      { video: true },
    ];

    let lastError: unknown;
    for (const constraints of tries) {
      try {
        log("requestPermission", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());
        return;
      } catch (e) {
        lastError = e;
        if (isAbortError(e) || isNotAllowedError(e)) throw e;
      }
    }
    throw lastError ?? new Error("No camera found");
  }

  private async loadDevices(): Promise<void> {
    this.devices = sortDevices(await enumerateVideoDevices(), this.preferBack);
    this.deviceIndex = 0;
    log("devices enumerated", { count: this.devices.length, devices: this.devices });
  }

  private stopNativeLoop(): void {
    this.scanActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private clearContainer(): void {
    const container = document.getElementById(this.elementId);
    if (container) container.innerHTML = "";
  }

  private async disposeNative(): Promise<void> {
    this.stopNativeLoop();
    this.detector = null;

    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
        log("native track stopped", track.label);
      });
      this.stream = null;
    }

    this.clearContainer();
  }

  private async disposeHtml5(): Promise<void> {
    const scanner = this.scanner;
    this.scanner = null;
    if (!scanner) return;

    try {
      const state = scanner.getState?.() ?? SCANNER_NOT_STARTED;
      if (state !== SCANNER_NOT_STARTED) await scanner.stop();
    } catch (e) {
      log("html5 stop error (ignored)", e);
    }

    try {
      scanner.clear();
    } catch (e) {
      log("html5 clear error (ignored)", e);
    }
  }

  private async disposeAll(opts?: { settle?: boolean }): Promise<void> {
    await this.disposeNative();
    await this.disposeHtml5();
    // Settling delay only matters when reopening a camera on the same page
    // (e.g. switching lenses). The success-navigation path must NOT wait.
    if (opts?.settle) await new Promise((r) => setTimeout(r, 200));
  }

  /**
   * Synchronously halt scanning + release media tracks so the camera light turns
   * off and no further decode callbacks fire. Safe to call from the decode handler
   * right before navigation. Finish nonessential teardown via disposeInBackground().
   */
  stopImmediately(): void {
    this.stopNativeLoop();
    this.detector = null;
    if (this.videoEl) {
      try {
        this.videoEl.srcObject = null;
      } catch {
        /* ignore */
      }
      this.videoEl = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      this.stream = null;
    }
  }

  /** Non-blocking cleanup of the html5 fallback + DOM. Run without awaiting on nav. */
  async disposeInBackground(): Promise<void> {
    try {
      await this.disposeHtml5();
    } catch {
      /* ignore */
    }
    this.clearContainer();
    this.devices = [];
    this.deviceIndex = 0;
    this.detector = null;
  }

  /** Stop tracks now, then finish teardown in the background (returns cleanup promise). */
  stopAfterDecode(): Promise<void> {
    this.stopImmediately();
    return this.disposeInBackground();
  }

  private startNativeLoop(
    onDecode: (text: string, format?: DetectedBarcodeFormat) => void,
  ): void {
    if (!this.detector || !this.videoEl) return;
    this.scanActive = true;
    this.paused = false;
    this.lastScanAt = 0;

    const tick = async (now: number) => {
      if (!this.scanActive || !this.detector || !this.videoEl) return;

      if (!this.paused && now - this.lastScanAt >= SCAN_INTERVAL_MS && this.videoEl.readyState >= 2) {
        this.lastScanAt = now;
        try {
          const codes = await this.detector.detect(this.videoEl);
          const detected = codes[0];
          const value = detected?.rawValue;
          if (value) {
            log("native decode", value.slice(0, 40));
            onDecode(value, normalizeDetectedBarcodeFormat(detected.format));
            return;
          }
        } catch {
          /* skip bad frame */
        }
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private async tryOpenNative(
    attempt: StartAttempt,
    onDecode: (text: string, format?: DetectedBarcodeFormat) => void
  ): Promise<boolean> {
    if (!this.detector) return false;

    const constraintSets = buildHighResVideoConstraints(attempt, this.preferBack);
    let stream: MediaStream | null = null;
    let lastError: unknown;

    for (const constraints of constraintSets) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        lastError = e;
        if (isAbortError(e) || isNotAllowedError(e)) throw e;
      }
    }

    if (!stream) {
      log("native stream failed", lastError);
      return false;
    }

    const track = stream.getVideoTracks()[0];
    if (track) await applyAdvancedTrackSettings(track);

    this.clearContainer();
    const container = document.getElementById(this.elementId);
    if (!container) throw new Error("Scanner container not found");

    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.display = "block";
    container.appendChild(video);

    this.stream = stream;
    this.videoEl = video;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video failed to load"));
      void video.play().catch((err) => {
        reject(err instanceof Error ? err : new Error("Video failed to play"));
      });
    });

    this.engine = "native";
    if (attempt.kind === "device") {
      this.activeLabel = attempt.label;
      this.facing = this.inferFacingFromLabel(attempt.label);
    } else {
      this.activeLabel = attempt.label;
      this.facing = attempt.facing;
    }

    this.startNativeLoop(onDecode);
    log("native camera started", { label: this.activeLabel, engine: "native" });
    return true;
  }

  private async tryOpenHtml5(
    html5: ScannerHandle,
    attempt: StartAttempt,
    onDecode: (text: string, format?: DetectedBarcodeFormat) => void
  ): Promise<void> {
    const cameraArgs = html5CameraArgs(attempt);
    let lastError: unknown;

    for (const cameraArg of cameraArgs) {
      try {
        await html5.start(
          cameraArg,
          HTML5_SCANNER_CONFIG,
          (text, result) =>
            onDecode(
              text,
              normalizeDetectedBarcodeFormat(result?.result?.format?.formatName),
            ),
          () => undefined,
        );
        this.engine = "html5";
        if (attempt.kind === "device") {
          this.activeLabel = attempt.label;
          this.facing = this.inferFacingFromLabel(attempt.label);
        } else {
          this.activeLabel = attempt.label;
          this.facing = attempt.facing;
        }
        log("html5 camera started", { label: this.activeLabel, engine: "html5", cameraArg });
        return;
      } catch (e) {
        lastError = e;
        log("html5 camera arg failed", { cameraArg, error: e });
        if (isAbortError(e) || isNotAllowedError(e)) throw e;
        try {
          const state = html5.getState?.() ?? SCANNER_NOT_STARTED;
          if (state !== SCANNER_NOT_STARTED) await html5.stop();
        } catch {
          /* ignore */
        }
      }
    }

    throw lastError ?? new Error("No camera found");
  }

  private inferFacingFromLabel(label: string): CameraFacing {
    const l = label.toLowerCase();
    if (/back|rear|environment|wide|telephoto|main/i.test(l)) return "back";
    if (/front|user|selfie|face|webcam|integrated/i.test(l)) return "front";
    return this.facing;
  }

  private async openCamera(
    onDecode: (text: string, format?: DetectedBarcodeFormat) => void,
    facingOverride?: CameraFacing,
  ): Promise<void> {
    await this.disposeAll({ settle: true });

    if (!this.detector) {
      this.detector = await createBarcodeDetector();
    }

    const attempts = buildAttempts(this.devices, this.deviceIndex, this.preferBack, facingOverride);
    let lastError: unknown;

    for (const attempt of attempts) {
      if (this.detector) {
        try {
          const ok = await this.tryOpenNative(attempt, onDecode);
          if (ok) return;
          await this.disposeNative();
        } catch (e) {
          lastError = e;
          await this.disposeNative();
          if (isAbortError(e) || isNotAllowedError(e)) throw e;
        }
      }
    }

    log("falling back to html5-qrcode");
    const { Html5Qrcode } = await import("html5-qrcode");
    const html5 = new Html5Qrcode(this.elementId, { verbose: false }) as ScannerHandle;
    this.scanner = html5;

    for (const attempt of attempts) {
      try {
        await this.tryOpenHtml5(html5, attempt, onDecode);
        return;
      } catch (e) {
        lastError = e;
        log("html5 attempt failed", { attempt, error: e });
        if (isAbortError(e) || isNotAllowedError(e)) {
          await this.disposeAll();
          throw e;
        }
        try {
          const state = html5.getState?.() ?? SCANNER_NOT_STARTED;
          if (state !== SCANNER_NOT_STARTED) await html5.stop();
        } catch {
          /* ignore */
        }
      }
    }

    await this.disposeAll();
    throw lastError ?? new Error("No camera found");
  }

  async start(
    onDecode: (text: string, format?: DetectedBarcodeFormat) => void,
  ): Promise<ScannerStatus> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported in this browser.");
    }

    this.facing = defaultCameraFacing();
    this.deviceIndex = 0;
    await this.openCamera(onDecode);
    await this.loadDevices();
    return this.getStatus();
  }

  /**
   * Pause decode work while leaving the active media stream/camera session
   * alive. This avoids a permission prompt or camera restart between scans.
   */
  pause(): void {
    this.paused = true;
    try {
      this.scanner?.pause(true);
    } catch {
      /* html5-qrcode may already be paused/stopped */
    }
  }

  /** Resume decoding on the existing stream without reopening the camera. */
  resume(): void {
    this.paused = false;
    try {
      this.scanner?.resume();
    } catch {
      /* native engine or html5-qrcode not currently paused */
    }
  }

  async switchCamera(
    onDecode: (text: string, format?: DetectedBarcodeFormat) => void,
  ): Promise<ScannerStatus> {
    log("switchCamera", { before: this.getStatus() });

    if (this.devices.length > 1) {
      this.deviceIndex = (this.deviceIndex + 1) % this.devices.length;
      await this.openCamera(onDecode);
    } else {
      await this.openCamera(onDecode, otherCameraFacing(this.facing));
    }

    return this.getStatus();
  }

  async stop(): Promise<void> {
    this.paused = false;
    await this.disposeAll();
    this.devices = [];
    this.deviceIndex = 0;
    this.detector = null;
  }
}
