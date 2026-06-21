"use client";

import { useState } from "react";
import CameraCaptureModal from "@/components/CameraCaptureModal";

type Props = {
  label?: string;
  modalTitle?: string;
  previewUrl?: string | null;
  savedUrl?: string | null;
  onCapture: (file: File) => void;
  emptyHeight?: number;
};

export default function PhotoCaptureButton({
  label = "Photo",
  modalTitle = "Take Photo",
  previewUrl,
  savedUrl,
  onCapture,
  emptyHeight = 120,
}: Props) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const displayUrl = previewUrl || savedUrl;
  const hasPhoto = Boolean(displayUrl);

  return (
    <>
      {hasPhoto ? (
        <div style={{ position: "relative" }}>
          <a href={displayUrl!} target="_blank" rel="noreferrer" style={{ display: "block" }}>
            <img
              src={displayUrl!}
              alt={label}
              style={{
                width: "100%",
                maxHeight: 180,
                objectFit: "cover",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            />
          </a>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 11,
              padding: "4px 10px",
            }}
            onClick={() => setCameraOpen(true)}
          >
            <i className="fa-solid fa-camera-rotate" style={{ marginRight: 4 }} />
            Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline"
          style={{
            width: "100%",
            height: emptyHeight,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 10,
            border: "2px dashed var(--border)",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
          onClick={() => setCameraOpen(true)}
        >
          <i className="fa-solid fa-camera" style={{ fontSize: 24 }} />
          Open Camera
        </button>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        title={modalTitle}
        onClose={() => setCameraOpen(false)}
        onCapture={onCapture}
      />
    </>
  );
}
