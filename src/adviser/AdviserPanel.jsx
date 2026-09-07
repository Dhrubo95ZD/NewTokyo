import { useEffect, useRef, useState } from 'react';
import { supabase } from '../online/supabase.js';
import Dialog from '../ui/Dialog.jsx';
import { pageLabel, validPage } from '../ui/navigation.js';

export default function AdviserPanel({ onNavigate, open, onClose, page = 'home' }) {
  const [question, setQuestion] = useState(''), [messages, setMessages] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), alive = useRef(true), latest = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (open) latest.current?.scrollIntoView({ block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [messages, busy, open]);
  const ask = async text => {
    const prompt = String(text || question).trim().slice(0,800);
    if (!prompt || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const { data, error: problem } = await supabase.functions.invoke('blackwood-adviser', { body:{ question: prompt } });
      if (problem || data?.error) throw new Error(problem?.message || data.error);
      if (!data?.answer) throw new Error('No answer arrived. Please try again.');
      if (alive.current) { setMessages(items => [...items.slice(-9), { ...data, question:prompt }]); setQuestion(''); }
    } catch (problem) { if (alive.current) { setError(problem.message || 'The adviser is unavailable. Try again.'); setQuestion(prompt); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  if (!open) return null;
  return <Dialog label="Ask Adviser" onClose={onClose} className="bw-adviser">
    <header className="bw-dialog-head"><div><span className="bw-eyebrow">THE CONSIGLIERE</span><h2>Ask Adviser</h2></div><button className="bw-close" aria-label="Close adviser" onClick={onClose}>×</button></header>
    <div className="bw-adviser-body"><p className="bw-adviser-intro">A little direction goes a long way. Ask about your record, your next move, or how a system works.</p><div className="bw-prompts">{['What should I do next?','What can I claim today?','Explain '+pageLabel(page)+' and how I can use it.','How can I play without energy?'].map(text => <button key={text} disabled={busy} onClick={() => ask(text)}>{text}</button>)}</div>
    <div className="bw-conversation" role="log" aria-label="Adviser conversation" aria-live="polite">{messages.map((message,index) => <article key={index}><div className="bw-question">{message.question}</div><div className="bw-answer"><span className="bw-eyebrow">ADVISER</span><p>{message.answer}</p>{message.suggestions?.filter(suggestion => validPage(suggestion.page)).map(suggestion => <button className="bw-adviser-link" key={suggestion.page+suggestion.label} onClick={() => { onNavigate(suggestion.page); onClose(); }}><b>{suggestion.label} →</b><small>{suggestion.reason}</small></button>)}</div></article>)}{busy && <p role="status"><span className="bw-spinner"/> Reading your record…</p>}<div ref={latest}/></div>
    {error && <p className="bw-warning" role="alert">{error} Your question is below; send it again to retry.</p>}</div>
    <form className="bw-adviser-compose" onSubmit={event => { event.preventDefault(); ask(); }}><label htmlFor="adviser-question">Your question</label><textarea id="adviser-question" value={question} maxLength={800} onChange={event => setQuestion(event.target.value)} placeholder="What would you like to know?" rows={2}/><button className="bw-primary" disabled={busy || !question.trim()}>{busy ? 'Asking…' : 'Send question'} <span aria-hidden="true">↑</span></button><small>Reads your record. Cannot spend money or play for you. Answers may be inaccurate.</small></form>
  </Dialog>;
}
