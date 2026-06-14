import { describe, expect, it } from "vitest";
import { parseVoiceCommand, resolveClarificationResponse } from "./commandParser";

describe("parseVoiceCommand", () => {
  it("parses a basic colored circle", () => {
    expect(parseVoiceCommand("画一个红色圆形")).toMatchObject({
      type: "draw",
      shape: "circle",
      color: "#ef4444"
    });
  });

  it("parses a sized square in a corner", () => {
    expect(parseVoiceCommand("画一个蓝色正方形，边长200，放在左上角")).toMatchObject({
      type: "draw",
      shape: "square",
      color: "#2563eb",
      width: 200,
      height: 200,
      position: {
        type: "corner",
        corner: "top-left"
      }
    });
  });

  it("parses a relative-position triangle", () => {
    expect(parseVoiceCommand("在圆形右边画一个三角形")).toMatchObject({
      type: "draw",
      shape: "triangle",
      position: {
        type: "relative",
        targetKind: "circle",
        side: "right"
      }
    });
  });

  it("parses object modification", () => {
    expect(parseVoiceCommand("把这个矩形变成蓝色")).toMatchObject({
      type: "modify",
      target: {
        kind: "rect"
      },
      color: "#2563eb"
    });
  });

  it("parses undo and clear", () => {
    expect(parseVoiceCommand("撤销刚才的操作")).toMatchObject({ type: "undo" });
    expect(parseVoiceCommand("全部清空")).toMatchObject({ type: "clear" });
  });

  it("creates and resolves a clarification", () => {
    const parsed = parseVoiceCommand("画一个红色的");
    expect(parsed).toMatchObject({ type: "clarify" });

    if (parsed.type !== "clarify") {
      throw new Error("expected clarify");
    }

    expect(resolveClarificationResponse("第二个", parsed)).toMatchObject({
      type: "draw",
      shape: "circle"
    });
  });

  it("returns unknown for unsupported speech", () => {
    expect(parseVoiceCommand("今天晚饭吃什么")).toMatchObject({
      type: "unknown"
    });
  });
});
