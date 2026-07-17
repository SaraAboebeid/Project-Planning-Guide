import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { api } from "../api/client";

type Turn = { role: "user" | "assistant"; content: string };

const GREETING: Turn = {
  role: "assistant",
  content:
    "Hi! Ask me about the Gothenburg building data — EPC coverage, energy use, a neighborhood, an address. " +
    "You can write in English or Swedish.\n\n" +
    "Hej! Fråga mig om byggnadsdatan i Göteborg — energideklarationer, energianvändning, ett primärområde eller en adress. " +
    "Du kan skriva på svenska eller engelska.",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Turn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: Turn[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      // Send only real turns (skip the local greeting) so the model sees a clean history.
      const history = next.filter((m) => m !== GREETING);
      const res = await api.chat(history);
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Sorry, I couldn't reach the assistant. / Kunde inte nå assistenten." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-teal px-4 py-3 text-white shadow-lg shadow-teal/30 hover:brightness-110 transition"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:inline">Ask the data</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[60] flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl shadow-black/50"
             style={{ height: "min(70vh, 560px)" }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal/20 text-teal">
                <MessageCircle className="w-4 h-4" />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white/90">Data assistant</div>
                <div className="text-[10px] text-white/40">Gothenburg buildings · EN / SV</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-white/40 hover:text-white/80">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-teal text-white rounded-br-sm"
                    : "bg-white/[0.06] text-white/85 rounded-bl-sm border border-white/5"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/5 bg-white/[0.06] px-3 py-2 text-[13px] text-white/50">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-2.5">
            <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 focus-within:border-teal/60">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask in English or Swedish… / Fråga på svenska eller engelska…"
                className="max-h-24 flex-1 resize-none bg-transparent text-[13px] text-white/90 placeholder:text-white/30 outline-none"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                aria-label="Send"
                className="mb-0.5 text-teal disabled:text-white/20 hover:brightness-125"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
