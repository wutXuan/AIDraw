export type HistoryState = {
  undoStack: string[];
  redoStack: string[];
};

export type HistoryTransition = {
  history: HistoryState;
  snapshot?: string;
};

export function createHistoryState(): HistoryState {
  return {
    undoStack: [],
    redoStack: []
  };
}

export function commitHistory(
  history: HistoryState,
  beforeSnapshot: string,
  afterSnapshot: string
): HistoryState {
  if (beforeSnapshot === afterSnapshot) {
    return history;
  }

  return {
    undoStack: [...history.undoStack, beforeSnapshot],
    redoStack: []
  };
}

export function undoHistory(
  history: HistoryState,
  currentSnapshot: string
): HistoryTransition {
  const snapshot = history.undoStack[history.undoStack.length - 1];
  if (!snapshot) {
    return { history };
  }

  return {
    snapshot,
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, currentSnapshot]
    }
  };
}

export function redoHistory(
  history: HistoryState,
  currentSnapshot: string
): HistoryTransition {
  const snapshot = history.redoStack[history.redoStack.length - 1];
  if (!snapshot) {
    return { history };
  }

  return {
    snapshot,
    history: {
      undoStack: [...history.undoStack, currentSnapshot],
      redoStack: history.redoStack.slice(0, -1)
    }
  };
}
