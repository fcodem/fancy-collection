"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cameraErrorMessage,
  defaultCameraFacing,
  isMobileOrTablet,
  otherCameraFacing,
  type CameraFacing,
} from "@/lib/cameraScanner";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onCapture: (file: File) => void;
};

export default function CameraCaptureModal({
  open,
  title = "Take Photo",
  onClose,
  onCapture,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<CameraFacing>(() => defaultCameraFacing());
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setReady(false);
  }, []);

  const startStream = useCallback(
    async (face: CameraFacing) => {
      stopStream();
      setError("");
      setStarting(true);
      setReady(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not supported in this browser.");
        setStarting(false);
        return;
      }

      const secureContext = typeof window !== "undefined" && window.isSecureContext;
      if (!secureContext) {
        setError(cameraErrorMessage(new Error("insecure"), false));
        setStarting(false);
        return;
      }

      const mode = face === "back" ? "environment" : "user";
      const tries: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        { video: { facingMode: { ideal: mode } } },
        { video: true },
      ];

      let stream: MediaStream | null = null;
      let lastError: unknown;
      for (const constraints of tries) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (e) {
          lastError = e;
        }
      }

      if (!stream) {
        setError(cameraErrorMessage(lastError, secureContext));
        setStarting(false);
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        setStarting(false);
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
        setReady(true);
      } catch (e) {
        setError(cameraErrorMessage(e, secureContext));
      } finally {
        setStarting(false);
      }
    },
    [stopStream],
  );

  useEffect(() => {
    if (!open) {
      stopStream();
      setError("");
      return;
    }
    setFacing(defaultCameraFacing());
    void startStream(defaultCameraFacing());
    return () => stopStream();
  }, [open, startStream, stopStream]);

  function switchCamera() {
    const next = otherCameraFacing(facing);
    setFacing(next);
    void startStream(next);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !ready || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        onClose();
      },
      "image/jpeg",
      0.88,
    );
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ position: "relative", background: "#000", aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {(starting || !ready) && !error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 14,
              }}
            >
              {starting ? "Opening camera…" : "Starting camera…"}
            </div>
          )}
          {error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                textAlign: "center",
                color: "#fff",
                fontSize: 13,
                background: "rgba(0,0,0,0.6)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 16,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            onClick={capturePhoto}
          >
            <i className="fa-solid fa-camera" style={{ marginRight: 6 }} />
            Capture
          </button>
          <button type="button" className="btn btn-outline" onClick={switchCamera} disabled={starting}>
            <i className="fa-solid fa-camera-rotate" style={{ marginRight: 6 }} />
            Switch camera
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
        </div>

        <p style={{ margin: "0 0 14px", padding: "0 16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          {isMobileOrTablet()
            ? "Hold steady and tap Capture. Use Switch camera for front/rear."
            : "Allow camera access when prompted, then click Capture."}
        </p>
      </div>
    </div>
  );
}
