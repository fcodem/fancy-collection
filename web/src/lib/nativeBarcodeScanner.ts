/** Native BarcodeDetector API — hardware-accelerated QR scanning. */

type NativeBarcodeDetector = {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
};

declare const BarcodeDetector: {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
};

export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

export async function applyAdvancedTrackSettings(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) return;

  type ZoomCap = { min?: number; max?: number; step?: number };
  const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
    zoom?: ZoomCap;
    focusMode?: string[];
  };

  const advanced: Record<string, unknown>[] = [{ focusMode: "continuous" }];

  if (caps?.zoom && typeof caps.zoom.max === "number") {
    const min = caps.zoom.min ?? 1;
    const max = caps.zoom.max;
    const zoom = Math.min(max, Math.max(min, min + (max - min) * 0.18));
    advanced.push({ zoom });
  }

  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
  } catch {
    try {
      await track.applyConstraints({ focusMode: "continuous" } as MediaTrackConstraints);
    } catch {
      /* device may not support focusMode */
    }
  }
}

export function buildHighResVideoConstraints(
  facing: "user" | "environment",
  deviceId?: string
): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    facingMode: { ideal: facing },
  };
  if (deviceId) {
    return { ...base, deviceId: { exact: deviceId } };
  }
  return base;
}

export class NativeBarcodeScanner {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private animId = 0;
  private detector: NativeBarcodeDetector | null = null;
  private scanning = false;

  async start(
    containerId: string,
    videoConstraints: MediaTrackConstraints,
    onDecode: (text: string) => void,
    fps = 15
  ): Promise<void> {
    await this.stop();

    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
    await applyAdvancedTrackSettings(stream);

    const container = document.getElementById(containerId);
    if (!container) throw new Error("Scanner container not found");

    container.innerHTML = "";

    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.display = "block";
    video.srcObject = stream;
    container.appendChild(video);
    await video.play();

    this.stream = stream;
    this.video = video;
    this.detector = new BarcodeDetector({ formats: ["qr_code"] });

    const intervalMs = 1000 / fps;
    let lastTick = 0;

    const loop = async (now: number) => {
      this.animId = requestAnimationFrame(loop);
      if (this.scanning || now - lastTick < intervalMs) return;
      lastTick = now;
      if (!this.video || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      try {
        this.scanning = true;
        const codes = await this.detector!.detect(this.video);
        const value = codes?.[0]?.rawValue;
        if (value) onDecode(value);
      } catch {
        /* frame decode miss — continue */
      } finally {
        this.scanning = false;
      }
    };

    this.animId = requestAnimationFrame(loop);
  }

  async stop(): Promise<void> {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    this.detector = null;
    this.scanning = false;
  }
}
