import { useCallback, useEffect, useRef, useState } from "react";
import {
  Canvas,
  Circle,
  Ellipse,
  FabricObject,
  Group,
  Line,
  Rect,
  Textbox,
  Triangle
} from "fabric";
import {
  commitHistory,
  createHistoryState,
  redoHistory,
  undoHistory,
  type HistoryState
} from "../history/historyStack";
import type {
  DrawCommand,
  ExecutableCommand,
  ExecutionResult,
  PositionIntent,
  ShapeKind,
  VoiceObjectMetadata
} from "../types";

type FabricVoiceObject = FabricObject & Partial<VoiceObjectMetadata>;

const SNAPSHOT_PROPS = ["id", "kind", "label", "createdBy"];
const DEFAULT_FILL = "rgba(148, 163, 184, 0.18)";
const DEFAULT_STROKE = "#111827";
const DEFAULT_TEXT = "#111827";

let objectCounter = 0;

FabricObject.customProperties = SNAPSHOT_PROPS;

export function useCanvasCommands(canvas: Canvas | null) {
  const [history, setHistory] = useState<HistoryState>(() => createHistoryState());
  const historyRef = useRef(history);
  const beforeTransformSnapshotRef = useRef<string>("");

  const setHistoryState = useCallback((nextHistory: HistoryState) => {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  }, []);

  const serialize = useCallback(() => {
    if (!canvas) {
      return "";
    }

    return JSON.stringify(canvas.toJSON());
  }, [canvas]);

  const restore = useCallback(
    async (snapshot: string) => {
      if (!canvas || !snapshot) {
        return;
      }

      await canvas.loadFromJSON(snapshot);
      canvas.requestRenderAll();
    },
    [canvas]
  );

  const recordExternalChange = useCallback(
    (beforeSnapshot: string) => {
      if (!canvas || !beforeSnapshot) {
        return;
      }

      const afterSnapshot = serialize();
      setHistoryState(commitHistory(historyRef.current, beforeSnapshot, afterSnapshot));
    },
    [canvas, serialize, setHistoryState]
  );

  useEffect(() => {
    if (!canvas) {
      return;
    }

    const captureBeforeTransform = () => {
      beforeTransformSnapshotRef.current = serialize();
    };

    const recordAfterModification = () => {
      recordExternalChange(beforeTransformSnapshotRef.current);
      beforeTransformSnapshotRef.current = "";
    };

    canvas.on("before:transform", captureBeforeTransform);
    canvas.on("object:modified", recordAfterModification);

    return () => {
      canvas.off("before:transform", captureBeforeTransform);
      canvas.off("object:modified", recordAfterModification);
    };
  }, [canvas, recordExternalChange, serialize]);

  const execute = useCallback(
    async (command: DrawCommand): Promise<ExecutionResult> => {
      if (!canvas) {
        return { ok: false, message: "画布还没有准备好" };
      }

      if (command.type === "clarify") {
        return { ok: false, message: command.question };
      }

      if (command.type === "undo") {
        const transition = undoHistory(historyRef.current, serialize());
        setHistoryState(transition.history);

        if (!transition.snapshot) {
          return { ok: false, message: "没有可以撤销的操作" };
        }

        await restore(transition.snapshot);
        return { ok: true, message: "已撤销" };
      }

      if (command.type === "redo") {
        const transition = redoHistory(historyRef.current, serialize());
        setHistoryState(transition.history);

        if (!transition.snapshot) {
          return { ok: false, message: "没有可以重做的操作" };
        }

        await restore(transition.snapshot);
        return { ok: true, message: "已重做" };
      }

      if (command.type === "export") {
        exportCanvas(canvas);
        return { ok: true, message: "已导出 PNG" };
      }

      const beforeSnapshot = serialize();
      const result = performCommand(canvas, command);
      const afterSnapshot = serialize();

      setHistoryState(commitHistory(historyRef.current, beforeSnapshot, afterSnapshot));
      canvas.requestRenderAll();

      return result;
    },
    [canvas, restore, serialize, setHistoryState]
  );

  return {
    execute,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0,
    undoCount: history.undoStack.length,
    redoCount: history.redoStack.length
  };
}

function performCommand(canvas: Canvas, command: ExecutableCommand): ExecutionResult {
  switch (command.type) {
    case "draw":
      return drawObject(canvas, command);
    case "modify":
      return modifyObject(canvas, command);
    case "move":
      return moveObject(canvas, command);
    case "delete":
      return deleteObject(canvas, command);
    case "clear":
      canvas.discardActiveObject();
      canvas.clear();
      canvas.backgroundColor = "#ffffff";
      return { ok: true, message: "画布已清空" };
    default:
      return { ok: false, message: "暂不支持这个命令" };
  }
}

function drawObject(
  canvas: Canvas,
  command: Extract<ExecutableCommand, { type: "draw" }>
): ExecutionResult {
  const objects = command.shape === "group" ? createSceneObjects(command) : [createShapeObject(command)];
  const primaryObject = objects[objects.length - 1];

  objects.forEach((object) => {
    setVoiceMetadata(object, command.shape, shapeLabel(command.shape, command.text));
    positionObject(canvas, object, command.position ?? { type: "center" });
    canvas.add(object);
  });

  if (primaryObject) {
    canvas.setActiveObject(primaryObject);
  }

  return {
    ok: true,
    message: command.shape === "group" ? "已生成语义图形" : `已绘制${shapeLabel(command.shape)}`
  };
}

function createShapeObject(command: Extract<ExecutableCommand, { type: "draw" }>): FabricObject {
  const color = command.color;
  const stroke = command.strokeColor ?? (command.shape === "line" ? color ?? DEFAULT_STROKE : DEFAULT_STROKE);
  const strokeWidth = command.strokeWidth ?? (command.shape === "line" ? 4 : 3);

  switch (command.shape) {
    case "rect":
      return new Rect({
        width: command.width ?? 160,
        height: command.height ?? 100,
        fill: color ?? DEFAULT_FILL,
        stroke,
        strokeWidth,
        rx: 6,
        ry: 6,
        originX: "center",
        originY: "center"
      });
    case "square":
      return new Rect({
        width: command.width ?? 160,
        height: command.height ?? command.width ?? 160,
        fill: color ?? DEFAULT_FILL,
        stroke,
        strokeWidth,
        rx: 6,
        ry: 6,
        originX: "center",
        originY: "center"
      });
    case "circle":
      return new Circle({
        radius: command.radius ?? 70,
        fill: color ?? DEFAULT_FILL,
        stroke,
        strokeWidth,
        originX: "center",
        originY: "center"
      });
    case "triangle":
      return new Triangle({
        width: command.width ?? 150,
        height: command.height ?? 135,
        fill: color ?? DEFAULT_FILL,
        stroke,
        strokeWidth,
        originX: "center",
        originY: "center"
      });
    case "line": {
      const length = command.width ?? 180;
      return new Line([-length / 2, 0, length / 2, 0], {
        stroke,
        strokeWidth,
        fill: stroke,
        originX: "center",
        originY: "center"
      });
    }
    case "text":
      return new Textbox(command.text ?? "语音文字", {
        width: command.width ?? 260,
        fontSize: command.height ?? 36,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fill: color ?? DEFAULT_TEXT,
        textAlign: "center",
        originX: "center",
        originY: "center"
      });
    default:
      return new Rect({
        width: 160,
        height: 100,
        fill: color ?? DEFAULT_FILL,
        stroke,
        strokeWidth,
        originX: "center",
        originY: "center"
      });
  }
}

function createSceneObjects(
  command: Extract<ExecutableCommand, { type: "draw" }>
): FabricObject[] {
  const text = command.text ?? "";

  if (/猫/.test(text)) {
    const head = new Circle({
      radius: 70,
      fill: command.color ?? "#f8fafc",
      stroke: DEFAULT_STROKE,
      strokeWidth: 3,
      left: 0,
      top: 10,
      originX: "center",
      originY: "center"
    });
    const leftEar = new Triangle({
      width: 54,
      height: 64,
      fill: command.color ?? "#f8fafc",
      stroke: DEFAULT_STROKE,
      strokeWidth: 3,
      left: -44,
      top: -62,
      angle: -18,
      originX: "center",
      originY: "center"
    });
    const rightEar = new Triangle({
      width: 54,
      height: 64,
      fill: command.color ?? "#f8fafc",
      stroke: DEFAULT_STROKE,
      strokeWidth: 3,
      left: 44,
      top: -62,
      angle: 18,
      originX: "center",
      originY: "center"
    });
    const leftEye = new Circle({
      radius: 7,
      fill: "#111827",
      left: -24,
      top: -4,
      originX: "center",
      originY: "center"
    });
    const rightEye = new Circle({
      radius: 7,
      fill: "#111827",
      left: 24,
      top: -4,
      originX: "center",
      originY: "center"
    });
    const nose = new Triangle({
      width: 18,
      height: 16,
      fill: "#f97316",
      left: 0,
      top: 18,
      originX: "center",
      originY: "center"
    });

    return [
      new Group([leftEar, rightEar, head, leftEye, rightEye, nose], {
        originX: "center",
        originY: "center"
      })
    ];
  }

  const mountainBack = new Triangle({
    width: 270,
    height: 190,
    fill: "#94a3b8",
    stroke: "#334155",
    strokeWidth: 3,
    left: -54,
    top: -36,
    originX: "center",
    originY: "center"
  });
  const mountainFront = new Triangle({
    width: 230,
    height: 170,
    fill: "#64748b",
    stroke: "#1f2937",
    strokeWidth: 3,
    left: 72,
    top: -20,
    originX: "center",
    originY: "center"
  });
  const lake = new Ellipse({
    rx: 170,
    ry: 46,
    fill: "#38bdf8",
    stroke: "#0369a1",
    strokeWidth: 3,
    left: 0,
    top: 92,
    originX: "center",
    originY: "center"
  });
  const sun = new Circle({
    radius: 28,
    fill: "#facc15",
    stroke: "#ca8a04",
    strokeWidth: 3,
    left: 158,
    top: -104,
    originX: "center",
    originY: "center"
  });

  return [
    new Group([sun, mountainBack, mountainFront, lake], {
      originX: "center",
      originY: "center"
    })
  ];
}

function modifyObject(
  canvas: Canvas,
  command: Extract<ExecutableCommand, { type: "modify" }>
): ExecutionResult {
  const object = findTargetObject(canvas, command.target);
  if (!object) {
    return { ok: false, message: "没有找到要修改的对象" };
  }

  applyObjectMutation(object, (target) => {
    if (command.color) {
      if (target.type === "line") {
        target.set("stroke", command.color);
      } else {
        target.set("fill", command.color);
      }
    }

    if (command.strokeColor) {
      target.set("stroke", command.strokeColor);
    }

    if (command.strokeWidth) {
      target.set("strokeWidth", command.strokeWidth);
    }
  });

  if (command.scale) {
    object.scale((object.scaleX || 1) * command.scale);
  }

  object.setCoords();
  canvas.setActiveObject(object);

  return { ok: true, message: "已修改对象" };
}

function moveObject(
  canvas: Canvas,
  command: Extract<ExecutableCommand, { type: "move" }>
): ExecutionResult {
  const object = findTargetObject(canvas, command.target);
  if (!object) {
    return { ok: false, message: "没有找到要移动的对象" };
  }

  if (command.position) {
    positionObject(canvas, object, command.position);
  } else {
    object.set({
      left: (object.left ?? 0) + (command.dx ?? 0),
      top: (object.top ?? 0) + (command.dy ?? 0)
    });
  }

  object.setCoords();
  canvas.setActiveObject(object);

  return { ok: true, message: "已移动对象" };
}

function deleteObject(
  canvas: Canvas,
  command: Extract<ExecutableCommand, { type: "delete" }>
): ExecutionResult {
  const object = findTargetObject(canvas, command.target);
  if (!object) {
    return { ok: false, message: "没有找到要删除的对象" };
  }

  canvas.remove(object);
  canvas.discardActiveObject();

  return { ok: true, message: "已删除对象" };
}

function positionObject(canvas: Canvas, object: FabricObject, position: PositionIntent) {
  const size = getObjectSize(object);
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();
  const marginX = canvasWidth * 0.12;
  const marginY = canvasHeight * 0.12;
  let left = canvasWidth / 2;
  let top = canvasHeight / 2;

  if (position.type === "absolute") {
    left = position.x;
    top = position.y;
  }

  if (position.type === "corner") {
    left = position.corner.includes("left")
      ? marginX + size.width / 2
      : canvasWidth - marginX - size.width / 2;
    top = position.corner.includes("top")
      ? marginY + size.height / 2
      : canvasHeight - marginY - size.height / 2;
  }

  if (position.type === "relative") {
    const target = findTargetObject(canvas, {
      id: position.targetId,
      kind: position.targetKind
    });

    if (target) {
      const targetBox = target.getBoundingRect();
      const gap = position.gap ?? 32;
      const targetCenterX = targetBox.left + targetBox.width / 2;
      const targetCenterY = targetBox.top + targetBox.height / 2;

      left =
        position.side === "right"
          ? targetBox.left + targetBox.width + gap + size.width / 2
          : position.side === "left"
            ? targetBox.left - gap - size.width / 2
            : targetCenterX;
      top =
        position.side === "below"
          ? targetBox.top + targetBox.height + gap + size.height / 2
          : position.side === "above"
            ? targetBox.top - gap - size.height / 2
            : targetCenterY;
    }
  }

  object.set({
    left: clamp(left, size.width / 2 + 8, canvasWidth - size.width / 2 - 8),
    top: clamp(top, size.height / 2 + 8, canvasHeight - size.height / 2 - 8)
  });
  object.setCoords();
}

function findTargetObject(
  canvas: Canvas,
  target: "selected" | { kind?: ShapeKind; id?: string }
): FabricObject | undefined {
  const activeObject = canvas.getActiveObject() as FabricVoiceObject | undefined;

  if (target === "selected") {
    return activeObject ?? latestVoiceObject(canvas);
  }

  if (target.id) {
    return canvas.getObjects().find((object) => (object as FabricVoiceObject).id === target.id);
  }

  if (target.kind && activeObject?.kind === target.kind) {
    return activeObject;
  }

  if (target.kind) {
    return [...canvas.getObjects()]
      .reverse()
      .find((object) => (object as FabricVoiceObject).kind === target.kind);
  }

  return activeObject ?? latestVoiceObject(canvas);
}

function latestVoiceObject(canvas: Canvas): FabricObject | undefined {
  return [...canvas.getObjects()]
    .reverse()
    .find((object) => (object as FabricVoiceObject).createdBy === "voice");
}

function setVoiceMetadata(object: FabricObject, kind: ShapeKind, label: string) {
  const voiceObject = object as FabricVoiceObject;
  voiceObject.id = `voice-${Date.now()}-${objectCounter += 1}`;
  voiceObject.kind = kind;
  voiceObject.label = label;
  voiceObject.createdBy = "voice";
}

function getObjectSize(object: FabricObject) {
  return {
    width: Math.max(object.getScaledWidth(), 1),
    height: Math.max(object.getScaledHeight(), 1)
  };
}

function shapeLabel(shape: ShapeKind, fallback?: string) {
  const labels: Record<ShapeKind, string> = {
    rect: "矩形",
    square: "正方形",
    circle: "圆形",
    line: "直线",
    text: fallback ?? "文字",
    triangle: "三角形",
    image: "图片",
    group: fallback ?? "组合图形"
  };

  return labels[shape];
}

function applyObjectMutation(
  object: FabricObject,
  mutate: (target: FabricObject) => void
) {
  mutate(object);

  if (object instanceof Group) {
    object.getObjects().forEach((child) => {
      mutate(child);
      child.setCoords();
    });
  }
}

function exportCanvas(canvas: Canvas) {
  const dataUrl = canvas.toDataURL({
    format: "png",
    quality: 1,
    multiplier: 2
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `voice-drawing-${formatDate(new Date())}.png`;
  link.click();
}

function formatDate(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return value;
  }

  return Math.min(Math.max(value, min), max);
}
