"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson, ApiError } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";
import type {
  AssistantItemAnswer,
  AssistantStatus,
  DateRange,
} from "@/lib/services/bookingAssistant";

// Minimal typings for the Web Speech API (no dependency needed).
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type AssistantResponse = {
  status: AssistantStatus;
  message: string;
  intent: "availability" | "extend" | "move";
  requested_range: DateRange | null;
  results: AssistantItemAnswer[];
};

type ChatEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: AssistantResponse };

const EXAMPLES = [
  "Is the red Sherwani available from 20 July to 23 July?",
  "Is LR-102 free this weekend?",
  "Extend booking #145 by two days",
  "Will booking #245 conflict if moved to 18 July?",
];

const STATUS_META: Record<AssistantStatus, { icon: string; color: string; label: string }> = {
  available: { icon: "fa-circle-check", color: "var(--success)", label: "Available" },
  available_with_warning: { icon: "fa-triangle-exclamation", color: "#E65100", label: "Available with Warning" },
  not_available: { icon: "fa-circle-xmark", color: "var(--danger)", label: "Not Available" },
  not_found: { icon: "fa-magnifying-glass", color: "var(--text-muted)", label: "Not Found" },
  needs_info: { icon: "fa-circle-question", color: "var(--text-muted)", label: "Need More Info" },
};

function ItemAnswerCard({ answer }: { answer: AssistantItemAnswer }) {
  const meta = STATUS_META[answer.status];
  return (
    <div
      className="card"
      style={{ marginBottom: 12, borderLeft: `4px solid ${meta.color}` }}
    >
      <div className="card-body">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className={`fa-solid ${meta.icon}`} style={{ color: meta.color, fontSize: 18 }} />
          <strong>{answer.item.display_name}</strong>
          {answer.item.sku && (
            <span className="free-item-meta" style={{ color: "var(--text-muted)" }}>
              {answer.item.sku}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontWeight: 700, color: meta.color }}>{meta.label}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {answer.range.delivery} → {answer.range.return}
        </div>

        {answer.warnings.map((w, i) => (
          <div
            key={i}
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(230,81,0,0.08)",
              border: "1px solid rgba(230,81,0,0.25)",
              fontSize: 13,
            }}
          >
            <i className="fa-solid fa-triangle-exclamation" style={{ color: "#E65100", marginRight: 6 }} />
            {w.message}
          </div>
        ))}

        {answer.conflict && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(198,40,40,0.08)",
              border: "1px solid rgba(198,40,40,0.25)",
              fontSize: 13,
            }}
          >
            <div>{answer.conflict.reason}</div>
            {answer.conflict.customer && (
              <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                Customer: {answer.conflict.customer}
                {answer.conflict.serial_no != null && ` · Serial #${String(answer.conflict.serial_no).padStart(2, "0")}`}
              </div>
            )}
          </div>
        )}

        {answer.suggestions.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Similar available in {answer.item.category}: </span>
            {answer.suggestions.map((s, i) => (
              <span key={s.id}>
                {i > 0 ? ", " : ""}
                {s.display_name}
                {s.sku ? ` (${s.sku})` : ""}
              </span>
            ))}
          </div>
        )}

        {answer.notes.map((n, i) => (
          <div key={i} style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantBubble({ answer }: { answer: AssistantResponse }) {
  const meta = STATUS_META[answer.status];
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <i className={`fa-solid ${meta.icon}`} style={{ color: meta.color }} />
        <span>{answer.message}</span>
      </div>
      {answer.results.map((r, i) => (
        <ItemAnswerCard key={`${r.item.id}-${i}`} answer={r} />
      ))}
    </div>
  );
}

export default function BookingAssistantClient() {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setEntries((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const answer = await fetchJson<AssistantResponse>("/api/booking-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      setEntries((prev) => [...prev, { role: "assistant", answer }]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong.";
      toast(msg, "error");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  // Keep the latest `ask` reachable from recognition callbacks without
  // recreating the recognition instance on every render.
  const askRef = useRef(ask);
  askRef.current = ask;

  // Set up the Web Speech API once (client-only, guarded against SSR).
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final.trim()) {
        setInput(final.trim());
        // Route the spoken query through the exact same submit path as typing.
        askRef.current(final);
      } else {
        setInput(interim);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      const msg =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Please allow mic permission and try again."
          : event.error === "no-speech"
            ? "Didn't catch that — please try speaking again."
            : event.error === "audio-capture"
              ? "No microphone was found."
              : "Voice input failed. Please try again.";
      toast(msg, "error");
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setVoiceSupported(true);

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [toast]);

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition || loading) return;
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    setInput("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if already started; keep state consistent.
      setListening(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-robot" style={{ marginRight: 8 }} />
            AI Booking Assistant
          </h3>
        </div>
        <div className="card-body">
          <p style={{ color: "var(--text-muted)", marginTop: 0, fontSize: 14 }}>
            Ask about dress availability in plain language. Availability is checked against the
            live booking engine — the same one the New Booking page uses.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="btn btn-sm"
                style={{ background: "var(--cream-dark)", fontSize: 12 }}
                onClick={() => ask(ex)}
                disabled={loading}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={listRef} style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
        {entries.map((entry, i) =>
          entry.role === "user" ? (
            <div key={i} style={{ textAlign: "right", marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-block",
                  background: "var(--primary, #5A1433)",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: 12,
                  fontSize: 14,
                  maxWidth: "80%",
                }}
              >
                {entry.text}
              </span>
            </div>
          ) : (
            <AssistantBubble key={i} answer={entry.answer} />
          ),
        )}
        {loading && (
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
            Checking availability…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        style={{ display: "flex", gap: 8, marginTop: 16 }}
      >
        <input
          type="text"
          className="form-control"
          placeholder='e.g. "Is LR-102 free from 20 July to 23 July?"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          disabled={loading}
        />
        {voiceSupported && (
          <button
            type="button"
            className="btn"
            onClick={toggleListening}
            disabled={loading}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            aria-pressed={listening}
            title={listening ? "Listening… click to stop" : "Speak your question"}
            style={{
              background: listening ? "var(--danger, #C62828)" : "var(--cream-dark)",
              color: listening ? "#fff" : undefined,
              minWidth: 44,
              animation: listening ? "ba-mic-pulse 1.2s ease-in-out infinite" : undefined,
            }}
          >
            <i className={`fa-solid ${listening ? "fa-microphone-lines" : "fa-microphone"}`} />
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
          <i className="fa-solid fa-paper-plane" /> Ask
        </button>
      </form>

      {voiceSupported && listening && (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--danger, #C62828)", display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--danger, #C62828)",
              animation: "ba-mic-pulse 1.2s ease-in-out infinite",
            }}
          />
          Listening… speak your question now.
        </div>
      )}

      <style>{`
        @keyframes ba-mic-pulse {
          0% { box-shadow: 0 0 0 0 rgba(198, 40, 40, 0.5); }
          70% { box-shadow: 0 0 0 8px rgba(198, 40, 40, 0); }
          100% { box-shadow: 0 0 0 0 rgba(198, 40, 40, 0); }
        }
      `}</style>
    </div>
  );
}
