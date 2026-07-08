export type PipelineStage =
  | "none"
  | "queued"
  | "generating_recognition"
  | "generating_embeddings"
  | "completed"
  | "failed";

export type PipelineStatus = {
  stage: PipelineStage;
  label: string;
  is_processing: boolean;
  photo_url: string;
  display_photo_url: string;
  error: string | null;
  stages: {
    upload: "completed" | "pending";
    recognition: "completed" | "processing" | "pending";
    embeddings: "completed" | "processing" | "pending";
  };
};
