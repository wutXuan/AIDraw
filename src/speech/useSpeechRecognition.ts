import { useCallback, useMemo, useRef } from "react";

type SpeechRecognitionOptions = {
  onStart?: () => void;
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  onRecovering?: (message: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

const getMicrophoneErrorMessage = (error: unknown) => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "麦克风权限被拒绝，请允许浏览器访问麦克风";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "没有检测到可用麦克风";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "麦克风正被其他应用占用，请关闭占用后再试";
    }
  }

  return "无法访问麦克风，请检查浏览器权限";
};

const getRecognitionErrorMessage = (error: string) => {
  if (error === "audio-capture") {
    return "没有检测到可用麦克风";
  }

  if (error === "not-allowed") {
    return "麦克风权限被拒绝，请允许浏览器访问麦克风";
  }

  if (error === "service-not-allowed") {
    return "当前地址或浏览器不允许语音识别，请使用 Chrome/Edge 并通过 localhost 访问";
  }

  if (error === "language-not-supported") {
    return "当前浏览器不支持中文语音识别";
  }

  return `语音识别失败：${error}`;
};

export function useSpeechRecognition({
  onStart,
  onInterimResult,
  onFinalResult,
  onRecovering,
  onError,
  onEnd
}: SpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const didEmitFinalRef = useRef(false);
  const didNotifyStartRef = useRef(false);
  const sessionIdRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const restartTimerRef = useRef<number | undefined>();
  const transientErrorCountRef = useRef(0);

  const RecognitionConstructor = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return window.SpeechRecognition ?? window.webkitSpeechRecognition;
  }, []);

  const supported = Boolean(RecognitionConstructor);

  const emitFinalResult = useCallback(() => {
    if (didEmitFinalRef.current) {
      return;
    }

    didEmitFinalRef.current = true;
    const finalTranscript = finalTranscriptRef.current.trim();
    onEnd?.();

    if (finalTranscript) {
      onFinalResult?.(finalTranscript);
    } else {
      onError?.("没有得到可执行的语音文本");
    }
  }, [onEnd, onError, onFinalResult]);

  const stop = useCallback(() => {
    sessionActiveRef.current = false;
    stopRequestedRef.current = true;
    window.clearTimeout(restartTimerRef.current);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (!didNotifyStartRef.current) {
      onEnd?.();
      return;
    }

    emitFinalResult();
  }, [emitFinalResult, onEnd]);

  const abort = useCallback(() => {
    sessionActiveRef.current = false;
    stopRequestedRef.current = true;
    sessionIdRef.current += 1;
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!RecognitionConstructor) {
      onError?.("当前浏览器不支持语音识别，请使用最新版 Chrome 或 Edge");
      return;
    }

    if (sessionActiveRef.current) {
      return;
    }

    window.clearTimeout(restartTimerRef.current);
    const activeSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = activeSessionId;
    const previousRecognition = recognitionRef.current;
    recognitionRef.current = null;
    previousRecognition?.abort();
    finalTranscriptRef.current = "";
    didEmitFinalRef.current = false;
    didNotifyStartRef.current = false;
    transientErrorCountRef.current = 0;
    sessionActiveRef.current = true;
    stopRequestedRef.current = false;

    if (!window.isSecureContext) {
      sessionActiveRef.current = false;
      stopRequestedRef.current = true;
      didEmitFinalRef.current = true;
      onError?.("浏览器要求安全地址才能使用麦克风，请通过 localhost 或 HTTPS 访问");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      sessionActiveRef.current = false;
      stopRequestedRef.current = true;
      didEmitFinalRef.current = true;
      onError?.("当前浏览器无法访问麦克风，请使用最新版 Chrome 或 Edge");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      if (sessionIdRef.current !== activeSessionId || stopRequestedRef.current) {
        return;
      }

      sessionActiveRef.current = false;
      stopRequestedRef.current = true;
      didEmitFinalRef.current = true;
      onError?.(getMicrophoneErrorMessage(error));
      return;
    }

    const startRecognition = () => {
      if (
        sessionIdRef.current !== activeSessionId ||
        !sessionActiveRef.current ||
        stopRequestedRef.current
      ) {
        return;
      }

      const prev = recognitionRef.current;
      if (prev) {
        recognitionRef.current = null;
        prev.onstart = null;
        prev.onresult = null;
        prev.onerror = null;
        prev.onend = null;
        try { prev.abort(); } catch { /* ignore */ }
      }

      const recognition = new RecognitionConstructor();
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (sessionIdRef.current !== activeSessionId) {
          return;
        }

        if (!didNotifyStartRef.current) {
          didNotifyStartRef.current = true;
          onStart?.();
        }
      };

      recognition.onresult = (event) => {
        if (sessionIdRef.current !== activeSessionId) {
          return;
        }

        let interim = "";
        transientErrorCountRef.current = 0;

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript ?? "";

          if (result.isFinal) {
            finalTranscriptRef.current += transcript;
          } else {
            interim += transcript;
          }
        }

        onInterimResult?.(`${finalTranscriptRef.current}${interim}`.trim());
      };

      recognition.onerror = (event) => {
        if (sessionIdRef.current !== activeSessionId) {
          return;
        }

        if (event.error === "aborted") {
          return;
        }

        if (
          (event.error === "no-speech" || event.error === "network") &&
          sessionActiveRef.current &&
          !stopRequestedRef.current
        ) {
          transientErrorCountRef.current += 1;
          if (event.error === "network") {
            onRecovering?.("语音识别服务连接中，正在保持监听");
          }

          window.clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => {
            if (
              sessionIdRef.current === activeSessionId &&
              sessionActiveRef.current &&
              !stopRequestedRef.current
            ) {
              startRecognition();
            }
          }, Math.min(250 + transientErrorCountRef.current * 250, 5000));
          return;
        }

        sessionActiveRef.current = false;
        stopRequestedRef.current = true;
        didEmitFinalRef.current = true;
        onError?.(
          event.error === "no-speech"
            ? "没有听到声音，请再试一次"
            : getRecognitionErrorMessage(event.error)
        );
      };

      recognition.onend = () => {
        if (sessionIdRef.current !== activeSessionId) {
          return;
        }

        const wasActive = recognitionRef.current === recognition;
        if (wasActive) {
          recognitionRef.current = null;
        }

        if (wasActive && sessionActiveRef.current && !stopRequestedRef.current) {
          window.clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => {
            if (sessionIdRef.current === activeSessionId) {
              startRecognition();
            }
          }, Math.min(250 + transientErrorCountRef.current * 250, 5000));
          return;
        }

        if (wasActive) {
          emitFinalResult();
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }

        if (sessionActiveRef.current && !stopRequestedRef.current) {
          restartTimerRef.current = window.setTimeout(() => {
            if (sessionIdRef.current === activeSessionId) {
              startRecognition();
            }
          }, Math.min(250 + transientErrorCountRef.current * 250, 5000));
        }
      }
    };

    if (sessionIdRef.current !== activeSessionId || stopRequestedRef.current) {
      return;
    }

    startRecognition();
  }, [
    RecognitionConstructor,
    emitFinalResult,
    onError,
    onInterimResult,
    onRecovering,
    onStart
  ]);

  return {
    supported,
    start,
    stop,
    abort
  };
}
