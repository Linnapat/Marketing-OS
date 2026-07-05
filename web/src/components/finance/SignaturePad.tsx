"use client";

import { useRef, useState, useEffect } from "react";

/** Canvas signature pad for online expense approval (mouse + touch).
 *  onSave receives the drawn signature as a PNG data URL so callers can persist
 *  it and reuse it on later approvals. */
export function SignaturePad({ onSave, confirmLabel = "Confirm & Approve" }: { onSave: (dataUrl: string) => void; confirmLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#211F1C";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };
  const up = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={440}
        height={150}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full rounded-card border border-line2 bg-ivory touch-none cursor-crosshair"
        style={{ maxWidth: 440 }}
      />
      <div className="flex items-center gap-2 mt-3">
        <button onClick={clear} className="text-[12px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[7px]">Clear</button>
        <button
          onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}
          disabled={!hasInk}
          className="text-[12.5px] font-bold text-white rounded-[9px] px-4 py-[8px] disabled:opacity-40"
          style={{ background: "#211F1C" }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
