import { useState, useRef, useEffect } from "react";
import { Bot, Send, User } from "lucide-react";
import { assistantApi } from "./assistantApi";

const SUGGESTION_GROUPS = [
  {
    label: "Getting Started",
    questions: [
      "How do I raise a new PR?",
      "What does the Dependency column mean?",
      "What are the different roles in the app?",
    ],
  },
  {
    label: "Approvals",
    questions: [
      "What happens during OH approval?",
      "What happens after Procurement submits a document to the VP?",
      "What if the VP asks for a revision on my document?",
      "What happens when VP rejects a document as Not Approved?",
    ],
  },
  {
    label: "Vendors & Documents",
    questions: [
      "How do I assign a vendor and generate a PO / WO / JO?",
      "How do I club or split items across vendors?",
      "What happens if only some vendors are approved on a split PO?",
      "Why is a vendor missing from the dropdown?",
      "I assigned the wrong vendor by mistake — how do I fix it?",
      "How do I unclub an item from a clubbed PO?",
    ],
  },
  {
    label: "PR Clarity Flow",
    questions: [
      "How do I send a PR back to Site Team for clarification?",
    ],
  },
  {
    label: "Bug Tracker",
    questions: [
      "How do I report a bug?",
      "Can I change a bug's attachment after submitting it?",
    ],
  },
  {
    label: "HR",
    questions: [
      "How do I check in / check out for attendance?",
      "How do I apply for leave or permission?",
      "How do I submit a petty cash / reimbursement claim?",
    ],
  },
  {
    label: "Dashboard",
    questions: [
      "Why doesn't the Total PRs count change when I filter?",
      "How do I manage vendors?",
    ],
  },
];

function StepFlow({ intro, steps, note }) {
  return (
    <div>
      {intro && <div style={{ fontWeight: 700, color: "#000", marginBottom: 10 }}>{intro}</div>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {(steps || []).map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff",
                  fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {i + 1}
                </div>
                {!isLast && <div style={{ width: 2, flex: 1, minHeight: 14, background: "#ddd6fe" }} />}
              </div>
              <div style={{ paddingBottom: isLast ? 0 : 12, color: "#000", fontSize: 20, lineHeight: 1.5 }}>
                {step}
              </div>
            </div>
          );
        })}
      </div>
      {note && <div style={{ marginTop: 10, color: "#374151", fontSize: 18.5, fontStyle: "italic" }}>{note}</div>}
    </div>
  );
}

function TopicsMenu({ onPick }) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: "#000", marginBottom: 12 }}>Here's what I can help with:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {SUGGESTION_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ fontSize: 16.5, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
              {group.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {group.questions.map(q => (
                <button key={q} onClick={() => onPick(q)}
                  style={{ textAlign: "left", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "8px 13px", background: "#fff", color: "#000", fontSize: 18.5, cursor: "pointer", fontFamily: "inherit" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiAssistant({ user }) {
  const [messages, setMessages] = useState([{ role: "assistant", topics: true }]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Clicking "Topics" sends a fresh topics menu into the conversation, same as any other reply.
  const sendTopics = () => {
    setMessages(m => [...m, { role: "assistant", topics: true }]);
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError("");
    const historyForApi = [...messages.map(m => ({ role: m.role, content: m.role === "user" ? m.content : (m.topics ? "Topics menu" : m.intro) })), { role: "user", content }];
    setMessages(m => [...m, { role: "user", content }]);
    setInput("");
    setSending(true);
    try {
      const r = await assistantApi.chat(historyForApi, user?.role);
      if (r.data?.success) {
        const { intro, steps, note } = r.data.data;
        setMessages(m => [...m, { role: "assistant", intro, steps, note }]);
      } else {
        setError(r.data?.message || "The assistant couldn't respond. Please try again.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "The assistant couldn't respond. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ minHeight: "calc(100vh - 108px)", background: "#f1f5f9", display: "flex", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 780, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 12px rgba(15,23,42,.06)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bot size={20} color="#fff" strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#000" }}>Happizo Chat Bot</div>
            <div style={{ fontSize: 18, color: "#000" }}>Ask how to use the PWJ Tracker — steps, statuses, workflows</div>
          </div>
          <button onClick={sendTopics}
            style={{ border: "1.5px solid #ddd6fe", borderRadius: 9, padding: "7px 14px", background: "#f5f3ff", color: "#4f46e5", fontWeight: 700, fontSize: 18, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            📋 Topics
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 360, maxHeight: "56vh", overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isUser ? "row-reverse" : "row" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: isUser ? "#1e3a5f" : "linear-gradient(135deg,#4f46e5,#7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isUser ? <User size={15} color="#fff" /> : <Bot size={15} color="#fff" />}
                </div>
                <div style={{
                  maxWidth: m.topics ? "100%" : "78%", fontSize: 20, lineHeight: 1.6, color: "#000",
                  background: isUser ? "#eff6ff" : "#f8fafc",
                  border: `1px solid ${isUser ? "#bfdbfe" : "#e2e8f0"}`,
                  borderRadius: 12, padding: "12px 16px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {isUser ? m.content
                    : m.topics ? <TopicsMenu onPick={send} />
                    : <StepFlow intro={m.intro} steps={m.steps} note={m.note} />}
                </div>
              </div>
            );
          })}

          {sending && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bot size={15} color="#fff" />
              </div>
              <div style={{ fontSize: 20, color: "#000", fontStyle: "italic" }}>Thinking…</div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ margin: "0 22px 12px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 19 }}>
            {error}
          </div>
        )}

        {/* Input */}
        <div style={{ display: "flex", gap: 10, padding: "16px 22px", borderTop: "1px solid #f1f5f9" }}>
          <textarea
            rows={1}
            placeholder="Ask a question about the PWJ Tracker…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, resize: "none", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 20, fontFamily: "inherit", outline: "none", color: "#000", maxHeight: 120 }}
          />
          <button onClick={() => send()} disabled={sending || !input.trim()}
            style={{ border: "none", borderRadius: 10, padding: "0 18px", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", fontWeight: 700, cursor: sending || !input.trim() ? "default" : "pointer", fontFamily: "inherit", opacity: sending || !input.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <Send size={16} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
