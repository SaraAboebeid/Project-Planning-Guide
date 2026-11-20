/* Window manager: open/close/focus/minimise/maximise, drag + resize, and
   modal message boxes. Apps get it through useWM(). */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import type { IconName } from "../icons/PixelIcon";
import { PixelIcon } from "../icons/PixelIcon";
import { t, useLang } from "../i18n";

/** A window's title in the current language. */
export const winTitle = (w: Win) => t(w.title) + (w.titleArg ? ` ${w.titleArg}` : "");

export type AppId = "stockmap" | "stocktable" | "csvimport" | "wizard" | "viewer" | "readme" | "about" | "reports"
  | "history" | "facade" | "report" | "catalogue";

export interface Win {
  id: string;
  key: string;              // same key = same window (focus instead of opening twice)
  app: AppId;
  title: string;            // English source string, shown through t()
  titleArg?: string;        // untranslated suffix, e.g. a building's address
  icon: IconName;
  x: number; y: number; w: number; h: number;
  min: boolean; max: boolean;
  props?: Record<string, unknown>;
}

export interface MsgBox {
  id: string;
  title: string;
  text: ReactNode;
  icon?: "error" | "warning" | "info";
  buttons?: string[];
  resolve: (button: string) => void;
}

interface OpenOpts {
  key?: string; title: string; titleArg?: string; icon: IconName;
  w: number; h: number; props?: Record<string, unknown>; max?: boolean;
}

interface WM {
  wins: Win[];
  activeId: string | null;
  open: (app: AppId, o: OpenOpts) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  toggleMin: (id: string) => void;
  toggleMax: (id: string) => void;
  patch: (id: string, p: Partial<Win>) => void;
  msg: (m: Omit<MsgBox, "id" | "resolve">) => Promise<string>;
  boxes: MsgBox[];
  dismiss: (id: string, button: string) => void;
}

const Ctx = createContext<WM | null>(null);
export const useWM = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWM outside provider");
  return v;
};

let seq = 0;

export function WMProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<Win[]>([]);        // array order = stacking order
  const [boxes, setBoxes] = useState<MsgBox[]>([]);

  const focus = useCallback((id: string) => {
    setWins((ws) => {
      const w = ws.find((x) => x.id === id);
      if (!w) return ws;
      return [...ws.filter((x) => x.id !== id), { ...w, min: false }];
    });
  }, []);

  const open = useCallback((app: AppId, o: OpenOpts) => {
    const key = o.key ?? app;
    setWins((ws) => {
      const existing = ws.find((x) => x.key === key);
      if (existing) {
        return [...ws.filter((x) => x.id !== existing.id), { ...existing, min: false, props: o.props ?? existing.props }];
      }
      const n = ws.length;
      const vw = window.innerWidth, vh = window.innerHeight - 30;
      const w = Math.min(o.w, vw - 16), h = Math.min(o.h, vh - 16);
      const x = Math.max(4, Math.min(vw - w - 4, 110 + n * 26));
      const y = Math.max(4, Math.min(vh - h - 4, 24 + n * 22));
      return [...ws, { id: `w${++seq}`, key, app, title: o.title, titleArg: o.titleArg, icon: o.icon, x, y, w, h, min: false, max: !!o.max, props: o.props }];
    });
  }, []);

  const close = useCallback((id: string) => setWins((ws) => ws.filter((x) => x.id !== id)), []);
  const patch = useCallback((id: string, p: Partial<Win>) => setWins((ws) => ws.map((x) => (x.id === id ? { ...x, ...p } : x))), []);
  const toggleMin = useCallback((id: string) => setWins((ws) => {
    const w = ws.find((x) => x.id === id);
    if (!w) return ws;
    const top = [...ws].reverse().find((x) => !x.min);
    // Clicking the active window's taskbar button minimises it; any other restores + raises it.
    if (!w.min && top?.id === id) return ws.map((x) => (x.id === id ? { ...x, min: true } : x));
    return [...ws.filter((x) => x.id !== id), { ...w, min: false }];
  }), []);
  const toggleMax = useCallback((id: string) => setWins((ws) => ws.map((x) => (x.id === id ? { ...x, max: !x.max } : x))), []);

  const msg = useCallback((m: Omit<MsgBox, "id" | "resolve">) => new Promise<string>((resolve) => {
    setBoxes((b) => [...b, { ...m, id: `m${++seq}`, resolve }]);
  }), []);
  const dismiss = useCallback((id: string, button: string) => {
    setBoxes((b) => {
      b.find((x) => x.id === id)?.resolve(button);
      return b.filter((x) => x.id !== id);
    });
  }, []);

  const activeId = useMemo(() => [...wins].reverse().find((w) => !w.min)?.id ?? null, [wins]);
  const value = useMemo<WM>(() => ({ wins, activeId, open, close, focus, toggleMin, toggleMax, patch, msg, boxes, dismiss }),
    [wins, activeId, open, close, focus, toggleMin, toggleMax, patch, msg, boxes, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ── Window frame ─────────────────────────────────────────── */

function TitleGlyph({ kind }: { kind: "min" | "max" | "restore" | "close" }) {
  const paths = {
    min: <rect x="1" y="6" width="6" height="2" />,
    max: <path d="M0 0h9v9H0zM1 2v6h7V2z" fillRule="evenodd" />,
    restore: <path d="M2 0h7v7H7V2H2zM0 3h7v6H0zM1 5v3h5V5z" fillRule="evenodd" />,
    close: <g>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
      <g key={i}><rect x={i} y={i} width="2" height="1" /><rect x={7 - i} y={i} width="2" height="1" /></g>
    ))}</g>,
  };
  return <svg className="px" width="9" height="9" viewBox="0 0 9 9" aria-hidden>{paths[kind]}</svg>;
}

export function WindowFrame({ win, active, children, menu, status }: {
  win: Win; active: boolean; children: ReactNode; menu?: ReactNode; status?: ReactNode;
}) {
  const { focus, close, toggleMin, toggleMax, patch } = useWM();
  useLang();
  const drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);

  const start = (mode: "move" | "size") => (e: RPointerEvent) => {
    if (e.button !== 0 || (mode === "move" && win.max)) return;
    if ((e.target as HTMLElement).closest(".title-btn")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
  };
  const moveTo = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (d.mode === "move") {
      patch(win.id, {
        x: Math.max(-d.w + 80, Math.min(window.innerWidth - 60, d.x + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, d.y + dy)),
      });
    } else {
      patch(win.id, { w: Math.max(260, d.w + dx), h: Math.max(160, d.h + dy) });
    }
  };
  const end = () => { drag.current = null; };

  if (win.min) return null;
  return (
    <div
      className={`window${active ? " active" : ""}${win.max ? " maximized" : ""}`}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
      onPointerDownCapture={() => { if (!active) focus(win.id); }}
      role="dialog" aria-label={winTitle(win)}
    >
      <div className="title-bar" onPointerDown={start("move")} onPointerMove={moveTo} onPointerUp={end}
        onDoubleClick={() => toggleMax(win.id)}>
        <PixelIcon name={win.icon} size={16} />
        <span className="title">{winTitle(win)}</span>
        <div className="title-btns">
          <button className="title-btn" aria-label={t("Minimize")} onClick={() => toggleMin(win.id)}><TitleGlyph kind="min" /></button>
          <button className="title-btn" aria-label={t(win.max ? "Restore" : "Maximize")} onClick={() => toggleMax(win.id)}>
            <TitleGlyph kind={win.max ? "restore" : "max"} />
          </button>
          <button className="title-btn close" aria-label={t("Close")} onClick={() => close(win.id)}><TitleGlyph kind="close" /></button>
        </div>
      </div>
      {menu}
      {children}
      {status}
      {!win.max && <div className="resize-grip" onPointerDown={start("size")} onPointerMove={moveTo} onPointerUp={end} />}
    </div>
  );
}

/* ── Message boxes (modal) ─────────────────────────────────── */

export function MessageBoxes() {
  const { boxes, dismiss } = useWM();
  useLang();
  if (!boxes.length) return null;
  const b = boxes[boxes.length - 1];
  // Buttons are English source strings: the caller gets the English label
  // back, the user sees it translated.
  const buttons = b.buttons ?? ["OK"];
  return (
    <div className="modal-shade">
      <div className="window active" role="alertdialog" aria-label={b.title}
        style={{ left: "50%", top: "38%", transform: "translate(-50%,-50%)", width: 380, minHeight: 0 }}>
        <div className="title-bar">
          <span className="title">{t(b.title)}</span>
          <div className="title-btns">
            <button className="title-btn close" aria-label={t("Close")} onClick={() => dismiss(b.id, buttons[buttons.length - 1])}><TitleGlyph kind="close" /></button>
          </div>
        </div>
        <div className="msgbox-body">
          {b.icon && <PixelIcon name={b.icon} size={32} />}
          <div style={{ paddingTop: 4, lineHeight: 1.45 }}>{b.text}</div>
        </div>
        <div className="msgbox-btns">
          {buttons.map((label, i) => (
            <button key={label} className={`btn${i === 0 ? " default" : ""}`} autoFocus={i === 0} onClick={() => dismiss(b.id, label)}>{t(label)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
