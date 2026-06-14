import { useCallback, useRef, useState } from "react";
import { Download, Mic, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import type { Canvas } from "fabric";
import { DrawingCanvas } from "./components/DrawingCanvas";
import { useCanvasCommands } from "./canvas/useCanvasCommands";
import { parseVoiceCommand, resolveClarificationResponse } from "./parser/commandParser";
import { useSpeechRecognition } from "./speech/useSpeechRecognition";
import { useAppStore } from "./stores/useAppStore";
import type { DrawCommand, ParsedVoiceCommand } from "./types";

const STATUS_LABELS = {
  idle: "准备就绪",
  listening: "录音中",
  recognizing: "识别中",
  parsing: "解析中",
  executing: "执行中",
  success: "完成",
  error: "出错"
};

function App() {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const recordingIntentRef = useRef(false);
  const startedAtRef = useRef(0);
  const {
    voiceStatus,
    transcript,
    interimTranscript,
    feedback,
    error,
    pendingClarification,
    setVoiceStatus,
    setTranscript,
    setInterimTranscript,
    setFeedback,
    setError,
    setPendingClarification,
    resetSpeech
  } = useAppStore();
  const { execute, canUndo, canRedo } = useCanvasCommands(canvas);

  const runExecutableCommand = useCallback(
    async (command: DrawCommand) => {
      setVoiceStatus("executing");
      const result = await execute(command);
      setVoiceStatus(result.ok ? "success" : "error");
      setFeedback(result.message);
      setError(result.ok ? undefined : result.message);
    },
    [execute, setError, setFeedback, setVoiceStatus]
  );

  const handleParsedCommand = useCallback(
    async (parsed: ParsedVoiceCommand) => {
      if (parsed.type === "unknown") {
        setVoiceStatus("error");
        setError(`${parsed.message}：${parsed.examples.join(" / ")}`);
        setFeedback(parsed.message);
        return;
      }

      if (parsed.type === "clarify") {
        setPendingClarification(parsed);
        setVoiceStatus("idle");
        setFeedback(parsed.question);
        setError(undefined);
        return;
      }

      setPendingClarification(undefined);
      await runExecutableCommand(parsed);
    },
    [
      runExecutableCommand,
      setError,
      setFeedback,
      setPendingClarification,
      setVoiceStatus
    ]
  );

  const handleVoiceText = useCallback(
    async (text: string) => {
      const cleanText = text.trim();
      if (!cleanText) {
        setVoiceStatus("error");
        setError("没有得到可执行的语音文本");
        return;
      }

      setTranscript(cleanText);
      setInterimTranscript("");
      setVoiceStatus("parsing");
      setError(undefined);

      if (pendingClarification) {
        const resolved = resolveClarificationResponse(cleanText, pendingClarification);
        setPendingClarification(undefined);

        if (!resolved) {
          setVoiceStatus("error");
          setFeedback("已取消确认");
          setError("没有匹配到确认选项");
          return;
        }

        await runExecutableCommand(resolved);
        return;
      }

      await handleParsedCommand(parseVoiceCommand(cleanText));
    },
    [
      handleParsedCommand,
      pendingClarification,
      runExecutableCommand,
      setError,
      setFeedback,
      setInterimTranscript,
      setPendingClarification,
      setTranscript,
      setVoiceStatus
    ]
  );

  const speech = useSpeechRecognition({
    onStart: () => {
      setError(undefined);
    },
    onRecovering: (message) => {
      if (recordingIntentRef.current) {
        setFeedback(message);
      }
    },
    onInterimResult: (text) => {
      setInterimTranscript(text);
    },
    onFinalResult: (text) => {
      void handleVoiceText(text);
    },
    onEnd: () => {
      if (recordingIntentRef.current && useAppStore.getState().voiceStatus === "listening") {
        recordingIntentRef.current = false;
        setVoiceStatus("recognizing");
        setFeedback("正在识别");
      }
    },
    onError: (message) => {
      recordingIntentRef.current = false;
      setVoiceStatus("error");
      setError(message);
      setFeedback(message);
    }
  });

  const stopListening = useCallback(() => {
    speech.stop();
    recordingIntentRef.current = false;
    setVoiceStatus("recognizing");
    setFeedback("正在识别");
  }, [setFeedback, setVoiceStatus, speech]);

  const startListening = useCallback(() => {
    if (voiceStatus === "parsing" || voiceStatus === "executing") {
      return;
    }

    if (recordingIntentRef.current || voiceStatus === "listening") {
      return;
    }

    recordingIntentRef.current = true;
    startedAtRef.current = Date.now();
    resetSpeech();
    setVoiceStatus("listening");
    setFeedback("正在聆听，再点一次麦克风结束");
    speech.start();
  }, [resetSpeech, setFeedback, setVoiceStatus, speech, voiceStatus]);

  const handleMicClick = useCallback(() => {
    if (recordingIntentRef.current || voiceStatus === "listening") {
      if (Date.now() - startedAtRef.current < 500) {
        return;
      }

      stopListening();
      return;
    }

    startListening();
  }, [startListening, stopListening, voiceStatus]);

  const quickCommand = useCallback(
    (command: DrawCommand) => {
      void runExecutableCommand(command);
    },
    [runExecutableCommand]
  );

  const visibleTranscript = interimTranscript || transcript || " ";

  return (
    <div className="app-shell">
      <DrawingCanvas onReady={setCanvas} />

      <section className="top-strip" aria-live="polite">
        <div>
          <p className="eyebrow">AI语音绘图工具</p>
          <p className="status-line">
            <span className={`status-dot status-${voiceStatus}`} />
            {STATUS_LABELS[voiceStatus]} · {feedback}
          </p>
        </div>
        <div className="transcript" title={visibleTranscript}>
          {visibleTranscript}
        </div>
      </section>

      <section className="control-dock" aria-label="绘图控制">
        <button
          className="icon-button"
          type="button"
          title="撤销"
          aria-label="撤销"
          onClick={() => quickCommand({ type: "undo" })}
          disabled={!canUndo}
        >
          <Undo2 size={22} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="重做"
          aria-label="重做"
          onClick={() => quickCommand({ type: "redo" })}
          disabled={!canRedo}
        >
          <Redo2 size={22} />
        </button>
        <button
          className={`mic-button ${voiceStatus === "listening" ? "is-listening" : ""}`}
          type="button"
          title={voiceStatus === "listening" ? "结束录音" : "开始录音"}
          aria-label={voiceStatus === "listening" ? "结束录音" : "开始录音"}
          aria-pressed={voiceStatus === "listening"}
          onClick={handleMicClick}
          onContextMenu={(event) => event.preventDefault()}
          disabled={!speech.supported || voiceStatus === "parsing" || voiceStatus === "executing"}
        >
          <Mic size={34} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="清空"
          aria-label="清空"
          onClick={() => quickCommand({ type: "clear" })}
        >
          <Trash2 size={22} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="导出"
          aria-label="导出"
          onClick={() => quickCommand({ type: "export" })}
        >
          <Download size={22} />
        </button>
      </section>

      {pendingClarification ? (
        <aside className="prompt-panel" aria-live="polite">
          <RotateCcw size={18} />
          <span>{pendingClarification.question}</span>
        </aside>
      ) : null}

      {error ? (
        <aside className="error-panel" aria-live="assertive">
          {error}
        </aside>
      ) : null}
    </div>
  );
}

export default App;
