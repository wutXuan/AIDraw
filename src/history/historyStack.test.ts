import { describe, expect, it } from "vitest";
import {
  commitHistory,
  createHistoryState,
  redoHistory,
  undoHistory
} from "./historyStack";

describe("historyStack", () => {
  it("commits undo snapshots and clears redo", () => {
    const initial = createHistoryState();
    const first = commitHistory(initial, "A", "B");
    const withRedo = { ...first, redoStack: ["C"] };
    const next = commitHistory(withRedo, "B", "D");

    expect(next.undoStack).toEqual(["A", "B"]);
    expect(next.redoStack).toEqual([]);
  });

  it("ignores unchanged snapshots", () => {
    const history = createHistoryState();
    expect(commitHistory(history, "A", "A")).toBe(history);
  });

  it("undoes and redoes snapshots", () => {
    const history = commitHistory(createHistoryState(), "A", "B");
    const undo = undoHistory(history, "B");

    expect(undo.snapshot).toBe("A");
    expect(undo.history.undoStack).toEqual([]);
    expect(undo.history.redoStack).toEqual(["B"]);

    const redo = redoHistory(undo.history, "A");

    expect(redo.snapshot).toBe("B");
    expect(redo.history.undoStack).toEqual(["A"]);
    expect(redo.history.redoStack).toEqual([]);
  });
});
