import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Send, Trash2 } from "lucide-react";
import { api, getApiError } from "../lib/api";

export default function MentorPage() {
  const client = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [message, setMessage] = useState("");
  const [localMessages, setLocalMessages] = useState([]);
  const [responseProvider, setResponseProvider] = useState("");
  const [contextStatus, setContextStatus] = useState("READY");
  const bottomRef = useRef(null);

  // Load conversation history list
  const conversations = useQuery({
    queryKey: ["mentor-conversations"],
    queryFn: async () => (await api.get("/me/mentor/conversations")).data.data,
  });

  // When user selects a conversation, load its messages
  const activeConversation = conversations.data?.find((c) => c.id === activeConversationId);

  useEffect(() => {
    if (activeConversation) {
      setLocalMessages(activeConversation.messages || []);
    } else {
      setLocalMessages([]);
    }
  }, [activeConversationId, conversations.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const send = useMutation({
    mutationFn: (text) =>
      api.post("/me/mentor/conversations", {
        message: text,
        conversationId: activeConversationId || undefined,
      }),
    onSuccess: ({ data }) => {
      const newData = data.data;
      setActiveConversationId(newData.id);
      setLocalMessages(newData.messages);
      setResponseProvider(newData.provider || "");
      setContextStatus(newData.contextStatus || "READY");
      setMessage("");
      client.invalidateQueries({ queryKey: ["mentor-conversations"] });
    },
  });

  function handleSend() {
    const text = message.trim();
    if (!text || send.isPending) return;
    // Optimistic user message
    setLocalMessages((prev) => [...prev, { id: `opt-${Date.now()}`, role: "USER", content: text }]);
    send.mutate(text);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setLocalMessages([]);
    setResponseProvider("");
    setContextStatus("READY");
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Sidebar — conversation history */}
      <aside className="hidden w-72 flex-col border-r border-slate-100 md:flex">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-indigo-600" />
            <p className="font-bold text-slate-900">AI Mentor</p>
          </div>
          <button
            onClick={startNewConversation}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.isLoading && (
            <p className="px-3 py-2 text-sm text-slate-400">Loading…</p>
          )}
          {!conversations.isLoading && conversations.data?.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-slate-400">
              No conversations yet. Start asking a question.
            </p>
          )}
          {conversations.data?.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setActiveConversationId(conv.id);
                setResponseProvider("");
                setContextStatus("READY");
              }}
              className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                conv.id === activeConversationId
                  ? "bg-indigo-50 font-semibold text-indigo-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <p className="truncate font-medium">
                {conv.messages?.[0]?.content?.slice(0, 45) || "New conversation"}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {new Date(conv.lastMessageAt || conv.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">AI Mentor</h1>
            <p className="text-xs text-slate-500">
              Guidance based on your performance data. Responses are suggestions, not verified records.
            </p>
            {responseProvider === "local-fallback" && (
              <p role="status" className="mt-1 text-xs font-semibold text-amber-700">AI service unavailable; showing local guidance.</p>
            )}
            {contextStatus === "UNAVAILABLE" && (
              <p role="status" className="mt-1 text-xs font-semibold text-amber-700">Performance data is unavailable; this conversation uses general guidance.</p>
            )}
          </div>
          <button
            onClick={startNewConversation}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus size={14} />
            New chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {localMessages.length === 0 && !send.isPending && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="rounded-2xl bg-indigo-50 p-5 mb-4">
                <Bot size={36} className="text-indigo-600 mx-auto" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">What would you like to learn today?</h2>
              <p className="mt-2 text-sm text-slate-500 max-w-sm">
                Ask about DSA concepts, web dev, system design, HR prep or any placement topic. The mentor uses your actual performance to give personalized guidance.
              </p>
              <div className="mt-6 grid gap-2 w-full max-w-sm">
                {[
                  "Explain dynamic programming with examples",
                  "What are my weakest topics based on assessments?",
                  "How do I prepare for HR interviews?",
                  "Explain the difference between BFS and DFS",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setMessage(prompt); }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 hover:border-indigo-200 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {localMessages.map((msg, i) => (
            <div
              key={msg.id || i}
              className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "ASSISTANT" && (
                <div className="mr-2 mt-1 shrink-0 rounded-xl bg-indigo-100 p-1.5">
                  <Bot size={14} className="text-indigo-600" />
                </div>
              )}
              <div
                className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "USER"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              </div>
            </div>
          ))}

          {send.isPending && (
            <div className="flex justify-start">
              <div className="mr-2 mt-1 shrink-0 rounded-xl bg-indigo-100 p-1.5">
                <Bot size={14} className="text-indigo-600" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {send.isError && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {getApiError(send.error)}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask your mentor a question… (Enter to send)"
              className="flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              style={{ minHeight: "1.5rem", maxHeight: "8rem" }}
            />
            <button
              disabled={!message.trim() || send.isPending}
              onClick={handleSend}
              className="shrink-0 rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-2 text-xs text-center text-slate-400">
            Responses use your recorded performance data as context. They are educational guidance, not official evaluations.
          </p>
        </div>
      </div>
    </div>
  );
}
