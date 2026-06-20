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
  aspectRatio: 1.777778,
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

export function cameraErrorMessage(e: unknown, secureContext: boolean): string {
  if (!secureContext) {
    return "Camera requires a secure page. On PC use http://localhost:3088/search-qr — if accessing via IP address, use HTTPS or localhost instead.";
  }
  if (isNotAllowedError(e)) {
    return "Camera permission denied. Allow camera in browser site settings, then try again.";
  }
  if (isNotFoundError(e)) {
    return "No camera detected. Connect a webcam or use manual QR entry below.";
  }
  if (isNotReadableError(e)) {
    return "Camera is in use by another app (Zoom, Teams, etc.). Close it and try again.";
  }
  if (isAbortError(e)) {
    return "Camera was interrupted. Click Allow Camera Access again.";
  }
  if (e instanceof Error && e.message) return e.message;
  return "Could not start camera.";
}

export function cameraHint(isMobile: boolean): string {
  return isMobile
    ? "Hold steady — rear camera scans small QRs on bills and phone screens."
    : "PC: webcam opens first. Hold QR inside the frame.";
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
          deviceId: { exact: attempt.id },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30 },
        }
      : {
          facingMode: { ideal: facing },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30 },
        };

  const mediumRes: MediaTrackConstraints =
    attempt.kind === "device"
      ? {
          deviceId: { exact: attempt.id },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };

  const basic: MediaTrackConstraints =
    attempt.kind === "device"
      ? { deviceId: { exact: attempt.id } }
      : { facingMode: { ideal: facing } };

  return [{ video: highRes }, { video: mediumRes }, { video: basic }, { video: true }];
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
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

async function createBarcodeDetector(): Promise<BarcodeDetectorLike | null> {
  if (typeof window === "undefined") return null;
  const BD = (window as Window & { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  if (!BD) return null;
  try {
    const detector = new BD({ formats: ["qr_code"] });
    log("BarcodeDetector native engine ready");
    return detector;
  } catch (e) {
    log("BarcodeDetector init failed", e);
    return null;
  }
}

function html5VideoConstraints(attempt: StartAttempt): MediaTrackConstraints {
  if (attempt.kind === "device") {
    return {
      deviceId: { exact: attempt.id },
      width: { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
      frameRate: { ideal: 30 },
    };
  }
  return {
    facingMode: { ideal: attempt.mode },
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    frameRate: { ideal: 30 },
  };
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

  private async disposeAll(): Promise<void> {
    await this.disposeNative();
    await this.disposeHtml5();
    await new Promise((r) => setTimeout(r, 200));
  }

  private startNativeLoop(onDecode: (text: string) => void): void {
    if (!this.detector || !this.videoEl) return;
    this.scanActive = true;
    this.lastScanAt = 0;

    const tick = async (now: number) => {
      if (!this.scanActive || !this.detector || !this.videoEl) return;

      if (now - this.lastScanAt >= SCAN_INTERVAL_MS && this.videoEl.readyState >= 2) {
        this.lastScanAt = now;
        try {
          const codes = await this.detector.detect(this.videoEl);
          const value = codes[0]?.rawValue;
          if (value) {
            log("native decode", value.slice(0, 40));
            onDecode(value);
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
    onDecode: (text: string) => void
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
    video.muted = true;
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
      void video.play().catch(reject);
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
    onDecode: (text: string) => void
  ): Promise<void> {
    const constraints = html5VideoConstraints(attempt);

    if (attempt.kind === "device") {
      await html5.start(attempt.id, HTML5_SCANNER_CONFIG, onDecode, () => undefined);
    } else {
      try {
        await html5.start(constraints, HTML5_SCANNER_CONFIG, onDecode, () => undefined);
      } catch (e) {
        if (isNotFoundError(e)) {
          await html5.start({ facingMode: attempt.mode }, HTML5_SCANNER_CONFIG, onDecode, () => undefined);
        } else {
          throw e;
        }
      }
    }

    this.engine = "html5";
    if (attempt.kind === "device") {
      this.activeLabel = attempt.label;
      this.facing = this.inferFacingFromLabel(attempt.label);
    } else {
      this.activeLabel = attempt.label;
      this.facing = attempt.facing;
    }
    log("html5 camera started", { label: this.activeLabel, engine: "html5" });
  }

  private inferFacingFromLabel(label: string): CameraFacing {
    const l = label.toLowerCase();
    if (/back|rear|environment|wide|telephoto|main/i.test(l)) return "back";
    if (/front|user|selfie|face|webcam|integrated/i.test(l)) return "front";
    return this.facing;
  }

  private async openCamera(onDecode: (text: string) => void, facingOverride?: CameraFacing): Promise<void> {
    await this.disposeAll();

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

  async start(onDecode: (text: string) => void): Promise<ScannerStatus> {
    await this.requestPermission();
    await this.loadDevices();
    this.facing = defaultCameraFacing();
    this.deviceIndex = 0;
    await this.openCamera(onDecode);
    return this.getStatus();
  }

  async switchCamera(onDecode: (text: string) => void): Promise<ScannerStatus> {
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
    await this.disposeAll();
    this.devices = [];
    this.deviceIndex = 0;
    this.detector = null;
  }
}
