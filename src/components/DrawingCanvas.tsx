import { useEffect, useRef } from "react";
import { Canvas } from "fabric";

type DrawingCanvasProps = {
  onReady: (canvas: Canvas | null) => void;
};

export function DrawingCanvas({ onReady }: DrawingCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = canvasElementRef.current;
    const container = containerRef.current;

    if (!element || !container) {
      return;
    }

    const canvas = new Canvas(element, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true
    });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.setDimensions({
        width: Math.max(Math.floor(rect.width), 320),
        height: Math.max(Math.floor(rect.height), 320)
      });
      canvas.requestRenderAll();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    onReady(canvas);

    return () => {
      onReady(null);
      resizeObserver.disconnect();
      void canvas.dispose();
    };
  }, [onReady]);

  return (
    <main className="canvas-shell" ref={containerRef}>
      <canvas ref={canvasElementRef} />
    </main>
  );
}
