import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const starterQuestions = [
  "How should I prepare for a backend engineering interview?",
  "Review this resume bullet and make it more measurable.",
  "What is a focused 30-day coding practice plan?",
  "How do I write a strong application for a junior role?",
];

function MarkdownContent({ content }) {
  const containerRef = useRef(null);
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(String(content || ""), { breaks: true })),
    [content],
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll("pre").forEach((block) => {
      if (block.querySelector("[data-copy-code]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.copyCode = "true";
      button.textContent = "Copy";
      button.className = "absolute right-2 top-2 rounded-md bg-slate-700 px-2 py-1 text-xs font-bold text-white";
      block.style.position = "relative";
      button.addEventListener("click", () => navigator.clipboard?.writeText(block.innerText));
      block.appendChild(button);
    });
  }, [html]);
  return <div ref={containerRef} className="prose prose-sm max-w-none wrap-break-word dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MentorPage() {
  const client = useQueryClient();
  const scrollRef = useRef(null);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [provider, setProvider] = useState("");
  const conversations = useQuery({
    queryKey: ["mentor-conversations"],
    queryFn: async () => (await api.get("/me/mentor/conversations")).data.data,
  });
  const active = useMemo(
    () => conversations.data?.find((item) => item.id === selectedId) || null,
    [conversations.data, selectedId],
  );
  const send = useMutation({
    mutationFn: () => selectedId
      ? api.post(`/me/mentor/conversations/${selectedId}/messages`, { message })
      : api.post("/me/mentor/conversations", { message }),
    onSuccess: ({ data }) => {
      setSelectedId(data.data.id);
      setProvider(data.data.provider);
      setMessage("");
      client.invalidateQueries({ queryKey: ["mentor-conversations"] });
    },
  });
  const retry = useMutation({
    mutationFn: () => api.post(`/me/mentor/conversations/${selectedId}/retry-last`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mentor-conversations"] }),
  });
  const rename = useMutation({
    mutationFn: () => api.patch(`/me/mentor/conversations/${editingId}`, { subject: editTitle }),
    onSuccess: () => {
      setEditingId(null);
      client.invalidateQueries({ queryKey: ["mentor-conversations"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/me/mentor/conversations/${id}`),
    onSuccess: (_response, id) => {
      if (selectedId === id) setSelectedId(null);
      client.invalidateQueries({ queryKey: ["mentor-conversations"] });
    },
  });
  const activeMessages = active?.messages || [];

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [activeMessages.length, send.isPending]);

  function clearChat() {
    setSelectedId(null);
    setProvider("");
    setMessage("");
  }

  function deleteConversation(id, subject) {
    if (window.confirm(`Delete "${subject || "this conversation"}"? This cannot be undone.`)) {
      remove.mutate(id);
    }
  }

  return (
    <div className="mx-auto max-w-7xl text-slate-900 dark:text-slate-100">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Career support</p>
        <h1 className="mt-2 text-3xl font-bold">AI career mentor</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Private guidance for resumes, interviews, coding practice, and job search.</p>
      </header>
      <div className="mt-7 grid min-h-136 gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button onClick={clearChat} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">New conversation</button>
          <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">Recent conversations</h2>
          {conversations.isLoading ? <p role="status" className="text-sm text-slate-500">Loading conversations…</p>
            : conversations.isError ? <div role="alert" className="text-sm text-red-700"><p>{getApiError(conversations.error)}</p><button onClick={() => conversations.refetch()} className="mt-2 font-bold underline">Retry</button></div>
            : conversations.data?.length ? <ul className="space-y-2">{conversations.data.map((item) => (
              <li key={item.id} className={`rounded-xl p-3 ${selectedId === item.id ? "bg-indigo-50 dark:bg-indigo-950" : "bg-slate-50 dark:bg-slate-800"}`}>
                {editingId === item.id
                  ? <form onSubmit={(event) => { event.preventDefault(); rename.mutate(); }} className="space-y-2">
                    <input aria-label="Conversation title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={80} className="w-full rounded-lg border px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" />
                    <div className="flex gap-2"><button disabled={rename.isPending || !editTitle.trim()} className="text-xs font-bold text-indigo-700">Save</button><button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate-500">Cancel</button></div>
                  </form>
                  : <div className="flex items-start gap-2">
                    <button onClick={() => { setSelectedId(item.id); setProvider(""); }} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold">{item.subject || "Career mentor"}</span>
                      <span className="mt-1 block text-xs text-slate-500">{item.messages.length} messages</span>
                    </button>
                    <button aria-label={`Rename ${item.subject || "conversation"}`} onClick={() => { setEditingId(item.id); setEditTitle(item.subject || "Career mentor"); }} className="text-xs font-semibold text-indigo-700">Rename</button>
                    <button aria-label={`Delete ${item.subject || "conversation"}`} onClick={() => deleteConversation(item.id, item.subject)} disabled={remove.isPending} className="text-xs font-semibold text-red-600">Delete</button>
                  </div>}
              </li>
            ))}</ul>
              : <p className="text-sm text-slate-500">Your conversations will appear here.</p>}
        </aside>
        <section className="flex min-h-136 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div><h2 className="font-bold">{active?.subject || "New conversation"}</h2><p className="mt-1 text-xs text-slate-500">Career planning · resume · interviews · technical learning</p></div>
            {(provider || activeMessages.at(-1)?.modelAlias) && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{provider === "mock" || activeMessages.at(-1)?.modelAlias?.includes("fallback") ? "Fallback response" : "AI mentor"}</span>}
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-5" aria-live="polite">
            {activeMessages.map((item) => (
              <article key={item.id} className={`max-w-[92%] rounded-xl p-4 sm:max-w-[85%] ${item.role === "USER" ? "ml-auto bg-indigo-50 dark:bg-indigo-950" : "bg-slate-50 dark:bg-slate-800"}`}>
                {item.role === "ASSISTANT" ? <MarkdownContent content={item.content} /> : <p className="whitespace-pre-wrap text-sm">{item.content}</p>}
                <time className="mt-2 block text-right text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</time>
              </article>
            ))}
            {!activeMessages.length && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-300">Try a starting question:</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {starterQuestions.map((question) => <button key={question} onClick={() => setMessage(question)} className="rounded-xl bg-slate-50 p-3 text-left text-sm font-semibold hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950">{question}</button>)}
                </div>
              </div>
            )}
            {send.isPending && <p role="status" className="text-sm text-slate-500">The mentor is preparing a response…</p>}
            {send.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"><p>{getApiError(send.error)}</p><div className="mt-2 flex gap-3"><button onClick={() => send.mutate()} className="font-bold underline">Retry</button><button onClick={() => send.reset()} className="font-bold underline">Dismiss</button></div></div>}
            {retry.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"><p>{getApiError(retry.error)}</p><button onClick={() => retry.reset()} className="mt-2 font-bold underline">Dismiss</button></div>}
          </div>
          {selectedId && <button onClick={() => retry.mutate()} disabled={retry.isPending} className="mb-3 self-start rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">{retry.isPending ? "Retrying…" : "Retry last answer"}</button>}
          <form onSubmit={(event) => { event.preventDefault(); if (message.trim()) send.mutate(); }} className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <label htmlFor="mentor-message" className="sr-only">Message the AI mentor</label>
            <textarea id="mentor-message" value={message} onChange={(event) => setMessage(event.target.value)} rows="3" maxLength={5000} placeholder="Ask about your preparation…" className="w-full resize-y rounded-xl border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-950" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">{message.length}/5000</span>
              <button type="submit" disabled={!message.trim() || send.isPending} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{send.isPending ? "Sending…" : "Send message"}</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
