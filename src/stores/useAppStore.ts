import { create } from "zustand";
import type { DrawCommand, VoiceStatus } from "../types";

type AppState = {
  voiceStatus: VoiceStatus;
  transcript: string;
  interimTranscript: string;
  feedback: string;
  error?: string;
  pendingClarification?: Extract<DrawCommand, { type: "clarify" }>;
  setVoiceStatus: (status: VoiceStatus) => void;
  setTranscript: (transcript: string) => void;
  setInterimTranscript: (transcript: string) => void;
  setFeedback: (feedback: string) => void;
  setError: (error?: string) => void;
  setPendingClarification: (
    command?: Extract<DrawCommand, { type: "clarify" }>
  ) => void;
  resetSpeech: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  voiceStatus: "idle",
  transcript: "",
  interimTranscript: "",
  feedback: "准备就绪",
  setVoiceStatus: (voiceStatus) => set({ voiceStatus }),
  setTranscript: (transcript) => set({ transcript }),
  setInterimTranscript: (interimTranscript) => set({ interimTranscript }),
  setFeedback: (feedback) => set({ feedback }),
  setError: (error) => set({ error }),
  setPendingClarification: (pendingClarification) =>
    set({ pendingClarification }),
  resetSpeech: () =>
    set({
      transcript: "",
      interimTranscript: "",
      error: undefined
    })
}));
