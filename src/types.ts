export type VoiceStatus =
  | "idle"
  | "listening"
  | "recognizing"
  | "parsing"
  | "executing"
  | "success"
  | "error";

export type ShapeKind =
  | "rect"
  | "square"
  | "circle"
  | "line"
  | "text"
  | "triangle"
  | "image"
  | "group";

export type PositionIntent =
  | { type: "center" }
  | {
      type: "corner";
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    }
  | { type: "absolute"; x: number; y: number }
  | {
      type: "relative";
      targetKind?: ShapeKind;
      targetId?: string;
      side: "left" | "right" | "above" | "below";
      gap?: number;
    };

export type DrawCommand =
  | {
      type: "draw";
      shape: ShapeKind;
      text?: string;
      color?: string;
      strokeColor?: string;
      width?: number;
      height?: number;
      radius?: number;
      strokeWidth?: number;
      position?: PositionIntent;
    }
  | {
      type: "modify";
      target: "selected" | { kind?: ShapeKind; id?: string };
      color?: string;
      strokeColor?: string;
      strokeWidth?: number;
      scale?: number;
    }
  | {
      type: "move";
      target: "selected" | { kind?: ShapeKind; id?: string };
      dx?: number;
      dy?: number;
      position?: PositionIntent;
    }
  | { type: "delete"; target: "selected" | { kind?: ShapeKind; id?: string } }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "export" }
  | {
      type: "clarify";
      question: string;
      options: Array<{ label: string; command: DrawCommand }>;
    };

export type ExecutableCommand = Exclude<DrawCommand, { type: "clarify" }>;

export type UnknownCommand = {
  type: "unknown";
  message: string;
  examples: string[];
};

export type ParsedVoiceCommand = DrawCommand | UnknownCommand;

export type VoiceObjectMetadata = {
  id: string;
  kind: ShapeKind;
  label: string;
  createdBy: "voice";
};

export type ExecutionResult = {
  ok: boolean;
  message: string;
};
