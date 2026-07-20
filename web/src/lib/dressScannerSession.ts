import { normalizeSessionScanCode } from "./dressScanSession";

export const DRESS_AVAILABILITY_CAMERA_ID = "dress-availability-camera";

export type CameraUiState =
  | "idle"
  | "opening"
  | "scanning"
  | "code_detected"
  | "checking"
  | "result_displayed"
  | "camera_error";

export type ScannerSessionHandle = {
  stopImmediately?: () => void;
  stopAfterDecode?: () => Promise<void>;
  stop?: () => Promise<void>;
};

export type CameraSessionLock = {
  sessionId: number;
  locked: boolean;
  acceptedCode: string | null;
};

export function createCameraSessionLock(sessionId: number): CameraSessionLock {
  return { sessionId, locked: false, acceptedCode: null };
}

export function tryAcceptCameraDecode(
  lock: CameraSessionLock,
  activeSessionId: number,
  rawCode: string,
): { accepted: true; code: string } | { accepted: false; reason: string } {
  if (activeSessionId !== lock.sessionId) {
    return { accepted: false, reason: "stale-session" };
  }
  if (lock.locked) {
    return { accepted: false, reason: "session-locked" };
  }
  const code = normalizeSessionScanCode(rawCode);
  if (!code) return { accepted: false, reason: "empty" };
  lock.locked = true;
  lock.acceptedCode = code;
  return { accepted: true, code };
}

export async function closeScannerSession(
  session: ScannerSessionHandle | null,
  elementId = DRESS_AVAILABILITY_CAMERA_ID,
): Promise<void> {
  if (!session) {
    if (typeof document !== "undefined" && elementId) {
      const container = document.getElementById(elementId);
      if (container) container.innerHTML = "";
    }
    return;
  }

  try {
    session.stopImmediately?.();
  } catch {
    /* already stopped */
  }

  try {
    if (typeof session.stopAfterDecode === "function") {
      await session.stopAfterDecode();
    } else if (typeof session.stop === "function") {
      await session.stop();
    }
  } catch {
    /* ignore teardown races */
  }

  if (typeof document !== "undefined" && elementId) {
    const container = document.getElementById(elementId);
    if (container) container.innerHTML = "";
  }
}
