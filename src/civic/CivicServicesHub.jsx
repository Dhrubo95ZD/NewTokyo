import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../online/supabase.js";
import "./civic.css";

const money = value => `$${Number(value || 0).toLocaleString()}`;
const districtLabel = value => String(value || "Blackwood").replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

export default function CivicServicesHub({ onState, onNavigate }) {
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [donations, setDonations] = useState({});

  const load = useCallback(async () => {
    setError("");
    const { data, error: problem } = await supabase.rpc("bw_civic_services_snapshot");
    if (problem) {
      setError(problem.message || "Could not open City Services.");
      return;
    }
    setSnapshot(data || null);
    onState?.(data?.state?.player || data?.player || null);
  }, [onState]);

  useEffect(() => { load(); }, [load]);

  const active = snapshot?.active || null;
  useEffect(() => {
    if (!active?.startedAt) { setSeconds(0); return undefined; }
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active?.startedAt]);

  const act = async (rpc, params, success) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const { data, error: problem } = await supabase.rpc(rpc, params);
    if (problem) setError(problem.message || "City Services could not complete that request.");
    else {
      setSnapshot(data?.services || data || null);
      onState?.(data?.state?.player || data?.player || null);
      setNotice(success);
    }
    setBusy(false);
  };

  const contracts = useMemo(() => Array.isArray(snapshot?.contracts) ? snapshot.contracts : [], [snapshot]);
  const projects = useMemo(() => Array.isArray(snapshot?.projects) ? snapshot.projects : [], [snapshot]);
  const selectedProject = project => Number(donations[project.id] || 100);

  if (error && !snapshot) return <section className="civic-page"><header className="civic-hero"><small>CITY SERVICES</small><h1>Blackwood Civic Desk</h1><p>{error}</p><button className="civic-primary" onClick={load}>Retry connection</button></header></section>;
  if (!snapshot) return <section className="civic-page"><header className="civic-hero"><small>CITY SERVICES</small><h1>Opening the civic desk…</h1><p>Loading the authoritative city record.</p></header></section>;

  return <section className="civic-page">
    <header className="civic-hero">
      <div>
        <small>CITY SERVICES · CIVIC CONTRACTS · NO INTEREST · NO LEVERAGE</small>
        <h1>Blackwood Civic Desk</h1>
        <p>Do useful work for the districts, build standing, and leave each neighbourhood stronger than you found it.</p>
        <div className="civic-hero-actions"><button className="civic-primary" onClick={() => onNavigate?.("city")}>Back to directory</button><span>Contracts are server-recorded and feed district control when a Takeover season is active.</span></div>
      </div>
      <div className="civic-seal" aria-hidden="true">✦<small>PUBLIC<br/>RECORD</small></div>
    </header>

    {error && <div className="civic-alert bad" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
    {notice && <div className="civic-alert good" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

    {active && <section className="civic-active">
      <header><div><small>ACTIVE CONTRACT · {districtLabel(active.district)}</small><h2>{active.title}</h2><p>{active.summary}</p></div><span className="civic-timer">{seconds < 8 ? `${8 - seconds}s` : "Ready"}<small>server minimum</small></span></header>
      <footer><span>Started {new Date(active.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><button className="civic-primary" disabled={busy || seconds < 8} onClick={() => act("bw_civic_contract_complete", { p_request_id: active.requestId }, "Contract completed. District standing updated.")}>{seconds < 8 ? "Work in progress…" : "Complete contract"}</button></footer>
    </section>}

    <section className="civic-section">
      <header><div><small>PUBLIC WORKS</small><h2>Civic Contracts</h2><p>One active contract at a time. Rewards are transparent and paid as ordinary city cash.</p></div><b>{contracts.length} available</b></header>
      <div className="civic-contract-grid">{contracts.map(contract => <article className={active?.contractId === contract.id ? "active" : ""} key={contract.id}>
        <div className="civic-contract-mark">{contract.icon || "◆"}</div>
        <div className="civic-contract-copy"><small>{districtLabel(contract.district)} · {contract.category}</small><h3>{contract.title}</h3><p>{contract.summary}</p></div>
        <dl><div><dt>Cash</dt><dd>{money(contract.rewardCash)}</dd></div><div><dt>XP</dt><dd>+{contract.rewardXp}</dd></div><div><dt>Standing</dt><dd>+{contract.rewardRespect}</dd></div></dl>
        <button className="civic-secondary" disabled={busy || Boolean(active)} onClick={() => act("bw_civic_contract_start", { p_contract_id: contract.id, p_request_id: crypto.randomUUID() }, "Contract started. Check back when the work is complete.")}>{active ? "Another contract active" : "Start contract"}</button>
      </article>)}</div>
    </section>

    <section className="civic-section">
      <header><div><small>CHARITY HOUSE · COMMUNITY FUND</small><h2>Build the neighbourhood</h2><p>Optional donations are cash-only contributions. There is no interest, chance reward, or hidden fee.</p></div><b>{projects.filter(project => project.complete).length}/{projects.length} complete</b></header>
      <div className="civic-project-grid">{projects.map(project => {
        const progress = Math.min(100, Number(project.total || 0) / Math.max(1, Number(project.target || 1)) * 100);
        return <article key={project.id} className={project.complete ? "complete" : ""}><div className="civic-project-head"><div><h3>{project.name}</h3><p>{project.description}</p></div><strong>{Math.round(progress)}%</strong></div><figure><i style={{ width: `${progress}%` }} /></figure><div className="civic-project-footer"><span>{money(project.total)} / {money(project.target)}</span>{project.complete ? <b>Completed</b> : <label><span>DONATE CITY CASH</span><input type="number" min="1" max="50000" step="50" value={selectedProject(project)} onChange={event => setDonations(current => ({ ...current, [project.id]: Math.max(1, Number(event.target.value)) }))} /><button className="civic-secondary" disabled={busy} onClick={() => act("bw_civic_donate", { p_project_id: project.id, p_amount: selectedProject(project), p_request_id: crypto.randomUUID() }, "Donation recorded. The project ledger is public.")}>Donate</button></label>}</div></article>;
      })}</div>
    </section>
  </section>;
}
