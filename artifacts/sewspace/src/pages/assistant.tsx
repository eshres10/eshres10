import { useState } from 'react';
import { useAskAssistant, useListProjects } from '@workspace/api-client-react';
import { ArrowRight, Loader2, MessageCircle, Scissors, Sparkles } from 'lucide-react';
import { Heading } from '@/components/common';
import { AnyRecord } from '@/lib/types';

export function Assistant() {
  const ask = useAskAssistant();
  const projects = useListProjects();
  const [text, setText] = useState('');
  const [project, setProject] = useState('');
  const [messages, setMessages] = useState<AnyRecord[]>([]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || ask.isPending) return;
    const message = text.trim();
    setText('');
    setMessages(current => [...current, { role: 'maker', text: message }]);
    ask.mutate({ data: { message, projectId: project ? Number(project) : null } }, {
      onSuccess: response => setMessages(current => [...current, { role: 'assistant', text: response.answer, mode: response.mode }]),
      onError: () => setMessages(current => [...current, { role: 'assistant', text: 'The assistant could not answer just now. Please try again.', mode: 'offline' }]),
    });
  };

  return (
    <>
      <div className="hidden md:block">
        <Heading eyebrow="The workbench / conversation" title="Sewing assistant" copy="OpenAI-powered help for technique questions, fitting puzzles, fabric choices, and project-specific next steps." />
      </div>
      <section aria-label="Sewing assistant conversation" className="mx-auto flex h-[calc(100dvh-190px)] min-h-[460px] max-w-3xl flex-col overflow-hidden rounded-[26px] bg-white md:h-[min(720px,calc(100dvh-280px))] md:min-h-[500px] md:rounded-[30px]">
        <header className="flex shrink-0 items-center gap-3 bg-ink px-4 py-3.5 text-white md:bg-canvas md:px-5 md:py-4 md:text-ink">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-yellow text-ink"><Sparkles size={19} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[18px] tracking-[-.03em] md:text-base">Sewing assistant</h2>
            <p className="text-[11px] text-white/70 md:font-mono-custom md:text-[.6rem] md:uppercase md:text-subtle">Private, project-aware sewing help</p>
          </div>
          <MessageCircle size={19} className="md:hidden" aria-hidden="true" />
        </header>
        <div className="border-b border-line px-4 py-2 text-center text-[12px] leading-relaxed text-subtle md:px-5">
          The assistant only reads what you can already see. It never posts for you.
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4 sm:px-5 md:p-8" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex min-h-[220px] h-full flex-col items-center justify-center text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-yellow"><Scissors size={22} aria-hidden="true" /></span>
              <h3 className="mt-4 font-display text-xl">What are you working on?</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-subtle">Ask about construction, fitting, fabric choices, or a tricky next step in your project.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} data-testid={`message-${index}`} className={`flex ${message.role === 'maker' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] whitespace-pre-wrap rounded-[20px] px-4 py-3 text-[14px] leading-[1.55] sm:max-w-[82%] ${message.role === 'maker' ? 'rounded-br-md bg-yellow text-ink' : 'rounded-bl-md bg-canvas text-ink'}`}>
                {message.text}
                {message.mode && <div className="mt-2 font-mono-custom text-[.58rem] uppercase opacity-60">{message.mode === 'live' ? 'Assistant response' : `${message.mode} response`}</div>}
              </div>
            </div>
          ))}
          {ask.isPending && <div className="flex items-center gap-2 text-xs text-red-ink" role="status"><Loader2 className="animate-spin" size={16} />Thinking through your sewing question…</div>}
        </div>
        <div className="shrink-0 border-t border-line bg-white px-3.5 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4">
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <span>Project context</span>
            <select value={project} onChange={e => setProject(e.target.value)} data-testid="select-assistant-project" className="min-h-[38px] min-w-0 flex-1 rounded-full border border-line bg-canvas px-3 text-xs sm:flex-none">
              <option value="">General sewing question</option>
              {(projects.data || []).map((item: AnyRecord) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <form onSubmit={send} className="flex items-center gap-2 rounded-full bg-canvas p-1.5">
            <label htmlFor="assistant-message" className="sr-only">Ask about fit, fabric, or technique</label>
            <input id="assistant-message" value={text} onChange={e => setText(e.target.value)} data-testid="input-assistant-message" placeholder="Ask about fit, fabric, technique…" className="min-h-[42px] min-w-0 flex-1 border-0 bg-transparent px-3 text-[14px] outline-none placeholder:text-subtle" />
            <button disabled={ask.isPending || !text.trim()} type="submit" aria-label="Send question" data-testid="button-send-assistant" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-yellow text-ink disabled:opacity-50"><ArrowRight size={19} aria-hidden="true" /></button>
          </form>
        </div>
      </section>
    </>
  );
}
