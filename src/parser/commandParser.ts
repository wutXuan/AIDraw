import type {
  DrawCommand,
  ParsedVoiceCommand,
  PositionIntent,
  ShapeKind
} from "../types";

const EXAMPLES = [
  "画一个红色圆形",
  "画一个蓝色正方形，边长200，放在左上角",
  "在圆形右边画一个三角形",
  "把这个矩形变成蓝色",
  "撤销",
  "全部清空"
];

const COLOR_MAP: Record<string, string> = {
  红: "#ef4444",
  红色: "#ef4444",
  蓝: "#2563eb",
  蓝色: "#2563eb",
  绿: "#16a34a",
  绿色: "#16a34a",
  黄: "#facc15",
  黄色: "#facc15",
  黑: "#111827",
  黑色: "#111827",
  白: "#ffffff",
  白色: "#ffffff",
  紫: "#7c3aed",
  紫色: "#7c3aed",
  粉: "#ec4899",
  粉色: "#ec4899",
  橙: "#f97316",
  橙色: "#f97316",
  灰: "#64748b",
  灰色: "#64748b",
  棕: "#92400e",
  棕色: "#92400e",
  青: "#0891b2",
  青色: "#0891b2"
};

const SHAPE_PATTERNS: Array<[ShapeKind, RegExp]> = [
  ["square", /正方形|方形|方块/],
  ["rect", /矩形|长方形/],
  ["circle", /圆形|圆圈|圆/],
  ["triangle", /三角形|三角/],
  ["line", /直线|线条|线段|一条线/],
  ["text", /文字|文本|写上|写下/]
];

export function parseVoiceCommand(input: string): ParsedVoiceCommand {
  const text = normalize(input);

  if (!text) {
    return unknown("没有听到清晰的指令");
  }

  if (/撤销|退回|上一步|取消刚才/.test(text)) {
    return { type: "undo" };
  }

  if (/重做|恢复|下一步/.test(text)) {
    return { type: "redo" };
  }

  if (/全部清空|清空|清除画布|重新开始/.test(text)) {
    return { type: "clear" };
  }

  if (/导出|保存|下载/.test(text)) {
    return { type: "export" };
  }

  if (/删除|删掉|去掉|移除/.test(text)) {
    return {
      type: "delete",
      target: parseTarget(text)
    };
  }

  const moveCommand = parseMoveCommand(text);
  if (moveCommand) {
    return moveCommand;
  }

  const modifyCommand = parseModifyCommand(text);
  if (modifyCommand) {
    return modifyCommand;
  }

  const drawCommand = parseDrawCommand(text, input);
  if (drawCommand) {
    return drawCommand;
  }

  return unknown("暂时没有理解这句话");
}

export function resolveClarificationResponse(
  response: string,
  command: Extract<DrawCommand, { type: "clarify" }>
): DrawCommand | null {
  const text = normalize(response);

  if (/第?一|一号|前者|正方形|方形|方块/.test(text)) {
    return command.options[0]?.command ?? null;
  }

  if (/第?二|二号|后者|圆形|圆圈/.test(text)) {
    return command.options[1]?.command ?? null;
  }

  return (
    command.options.find((option) =>
      normalize(option.label).split(/\s+/).every((part) => text.includes(part))
    )?.command ?? null
  );
}

function parseDrawCommand(text: string, rawInput: string): DrawCommand | null {
  const hasDrawVerb = /画|绘制|添加|生成|放|写/.test(text);
  const shape = detectDrawShape(text);
  const color = extractColor(text);
  const position = parsePosition(text);
  const dimensions = extractDimensions(text);

  if (isCreativeScene(text) && hasDrawVerb) {
    return {
      type: "draw",
      shape: "group",
      text: rawInput.trim(),
      color,
      position: position ?? { type: "center" }
    };
  }

  if (!hasDrawVerb && !shape) {
    return null;
  }

  if (!shape) {
    if (color || dimensions.width || dimensions.height || dimensions.radius) {
      return createShapeClarification(color);
    }

    return null;
  }

  const command: Extract<DrawCommand, { type: "draw" }> = {
    type: "draw",
    shape,
    color,
    strokeWidth: dimensions.strokeWidth,
    position: position ?? { type: "center" }
  };

  if (shape === "text") {
    command.text = extractTextContent(text) ?? "语音文字";
  }

  if (shape === "square") {
    const side = dimensions.side ?? dimensions.width ?? dimensions.height;
    if (side) {
      command.width = side;
      command.height = side;
    }
  } else {
    command.width = dimensions.width ?? dimensions.side;
    command.height = dimensions.height ?? dimensions.side;
  }

  command.radius = dimensions.radius;

  return command;
}

function parseModifyCommand(
  text: string
): Extract<DrawCommand, { type: "modify" }> | null {
  const isModification =
    /变成|改成|换成|设置|设为|加粗|变粗|调大|放大|缩小|颜色/.test(text) &&
    !/画|绘制|添加|生成/.test(text);

  if (!isModification) {
    return null;
  }

  const color = extractColor(text);
  const dimensions = extractDimensions(text);
  const scale = /放大|调大/.test(text) ? 1.2 : /缩小|调小/.test(text) ? 0.8 : undefined;

  if (!color && !dimensions.strokeWidth && !/加粗|变粗/.test(text) && !scale) {
    return null;
  }

  return {
    type: "modify",
    target: parseTarget(text),
    color,
    strokeWidth: dimensions.strokeWidth ?? (/加粗|变粗|粗一点/.test(text) ? 8 : undefined),
    scale
  };
}

function parseMoveCommand(
  text: string
): Extract<DrawCommand, { type: "move" }> | null {
  if (!/向左|往左|左移|向右|往右|右移|向上|往上|上移|向下|往下|下移|移动/.test(text)) {
    return null;
  }

  const amount = extractFirstNumber(text) ?? (/一点|一些/.test(text) ? 32 : 56);
  let dx = 0;
  let dy = 0;

  if (/向左|往左|左移/.test(text)) {
    dx = -amount;
  } else if (/向右|往右|右移/.test(text)) {
    dx = amount;
  } else if (/向上|往上|上移/.test(text)) {
    dy = -amount;
  } else if (/向下|往下|下移/.test(text)) {
    dy = amount;
  }

  return {
    type: "move",
    target: parseTarget(text),
    dx,
    dy
  };
}

function parsePosition(text: string): PositionIntent | undefined {
  if (/左上/.test(text)) {
    return { type: "corner", corner: "top-left" };
  }

  if (/右上/.test(text)) {
    return { type: "corner", corner: "top-right" };
  }

  if (/左下/.test(text)) {
    return { type: "corner", corner: "bottom-left" };
  }

  if (/右下/.test(text)) {
    return { type: "corner", corner: "bottom-right" };
  }

  const relative = text.match(/在(.+?)(右边|左边|上面|下面|下方|上方)/);
  if (relative) {
    const sideText = relative[2];
    return {
      type: "relative",
      targetKind: detectShape(relative[1]),
      side:
        sideText === "右边"
          ? "right"
          : sideText === "左边"
            ? "left"
            : sideText === "上面" || sideText === "上方"
              ? "above"
              : "below",
      gap: 32
    };
  }

  const absolute = text.match(/x\s*([0-9]+)\s*y\s*([0-9]+)/i);
  if (absolute) {
    return {
      type: "absolute",
      x: Number(absolute[1]),
      y: Number(absolute[2])
    };
  }

  if (/中央|中间|中心|正中/.test(text)) {
    return { type: "center" };
  }

  return undefined;
}

function parseTarget(text: string): "selected" | { kind?: ShapeKind; id?: string } {
  if (/这个|当前|选中|它/.test(text)) {
    const kind = detectShape(text);
    return kind ? { kind } : "selected";
  }

  const kind = detectShape(text);
  return kind ? { kind } : "selected";
}

function detectDrawShape(text: string): ShapeKind | undefined {
  const drawMatch = text.match(/(?:画|绘制|添加|生成|放|写)(?:一个|一只|一条|个|只|条)?(.+)$/);
  if (drawMatch) {
    return detectShape(drawMatch[1]) ?? detectShape(text);
  }

  return detectShape(text);
}

function detectShape(text: string): ShapeKind | undefined {
  return SHAPE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0];
}

function extractColor(text: string): string | undefined {
  const hex = text.match(/#[0-9a-fA-F]{3,8}/);
  if (hex) {
    return hex[0];
  }

  const colorName = Object.keys(COLOR_MAP)
    .sort((a, b) => b.length - a.length)
    .find((name) => text.includes(name));

  return colorName ? COLOR_MAP[colorName] : undefined;
}

function extractDimensions(text: string) {
  const side = extractValueAfter(text, ["边长"]);
  const width = extractValueAfter(text, ["宽度", "宽"]);
  const height = extractValueAfter(text, ["高度", "高"]);
  const radius = extractValueAfter(text, ["半径"]);
  const strokeWidth = extractValueAfter(text, ["线宽", "粗细", "线条宽度"]);

  return { side, width, height, radius, strokeWidth };
}

function extractValueAfter(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(
      new RegExp(`${escaped}(?:为|是|=|:|：)?\\s*([0-9]+|[一二三四五六七八九十百两]+)`)
    );

    if (match) {
      return parseSpokenNumber(match[1]);
    }
  }

  return undefined;
}

function extractFirstNumber(text: string): number | undefined {
  const match = text.match(/[0-9]+|[一二三四五六七八九十百两]+/);
  return match ? parseSpokenNumber(match[0]) : undefined;
}

function parseSpokenNumber(value: string): number {
  if (/^[0-9]+$/.test(value)) {
    return Number(value);
  }

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };

  if (value.includes("百")) {
    const [hundreds, rest = ""] = value.split("百");
    return (digits[hundreds] || 1) * 100 + (rest ? parseSpokenNumber(rest) : 0);
  }

  if (value.includes("十")) {
    const [tens, ones = ""] = value.split("十");
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }

  return digits[value] ?? 0;
}

function extractTextContent(text: string): string | undefined {
  const quoted = text.match(/[“"']([^”"']+)[”"']/);
  if (quoted) {
    return quoted[1];
  }

  const content = text.match(/(?:写上|写下|添加文字|输入文字|文字|文本)(.+)$/);
  return content?.[1]?.trim();
}

function createShapeClarification(color?: string): DrawCommand {
  return {
    type: "clarify",
    question: "你是要画红色正方形还是红色圆形？",
    options: [
      {
        label: "红色正方形",
        command: {
          type: "draw",
          shape: "square",
          color,
          width: 160,
          height: 160,
          position: { type: "center" }
        }
      },
      {
        label: "红色圆形",
        command: {
          type: "draw",
          shape: "circle",
          color,
          radius: 70,
          position: { type: "center" }
        }
      }
    ]
  };
}

function isCreativeScene(text: string): boolean {
  return /猫|雪山|湖|山|树|太阳|房子|风景|天空/.test(text);
}

function unknown(message: string): ParsedVoiceCommand {
  return {
    type: "unknown",
    message,
    examples: EXAMPLES
  };
}

function normalize(input: string): string {
  return input
    .trim()
    .replace(/[，。,.!！?？；;]/g, " ")
    .replace(/\s+/g, " ");
}
