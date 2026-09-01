import { useEffect, useMemo, useState } from "react";
import { supabase } from "../online/supabase.js";
import GameIcon from "../ui/GameIcon.jsx";
import "./item-catalogue.css";

const money=value=>`$${Number(value||0).toLocaleString()}`;
const FILTERS=["all","owned","relics","weapons","armor","accessories","supplies"];
const STATS=[["attack","ATK"],["defense","DEF"],["speed","SPD"],["dexterity","DEX"]];

function Artwork({item,large=false}) {
  const key=item.visualKey||"item";
  const shape={
    revolver:<><path d="M17 18h45l8 10-22 5-5 30H28l7-31H17z"/><path d="M62 18h31v10H68M46 33h17v12H46z"/></>,
    shotgun:<><path d="M11 31h66l17 8-17 8H11l9-8z"/><path d="M60 46 48 71H31l15-27"/></>,
    pistol:<><path d="M19 25h61l9 14-28 6-7 29H37l9-31H19z"/><path d="M31 20h51v8H31"/></>,
    blade:<><path d="m12 50 54-21 25 5-18 15-57 13z"/><path d="M14 46 8 38l8-8 14 14"/></>,
    gloves:<><path d="M24 64 17 39l7-19 8 23-1-29h9l3 27 2-29h9l1 30 5-25 9 3-4 36-15 20z"/></>,
    fedora:<><path d="M22 50 31 22h38l10 28z"/><path d="M8 49c18 8 66 8 84 0v12c-22 9-66 9-84 0z"/><path d="M28 39h45"/></>,
    coat:<><path d="m31 18 19 10 19-10 17 15-12 15-4-6v39H30V42l-5 6-11-15z"/><path d="m43 27 7 14 8-14M50 41v40"/></>,
    shoes:<><path d="M12 57c16 2 24-8 31-21l13 8-5 19H12zM53 66c15 0 25-9 31-21l12 9-6 19H53z"/></>,
    ring:<><circle cx="50" cy="52" r="24"/><circle cx="50" cy="52" r="13"/><path d="m37 29 6-13h15l7 14"/></>,
    watch:<><circle cx="50" cy="51" r="29"/><circle cx="50" cy="51" r="20"/><path d="M50 51V37m0 14 12 7M43 17v-7h14v7"/></>,
    medical:<><path d="M28 14h44v72H28z"/><path d="M44 29h12v14h14v12H56v14H44V55H30V43h14z"/></>,
    tonic:<><path d="M37 14h26v12l8 12v42H29V38l8-12z"/><path d="M37 45h34M41 10h18"/></>
  }[key]||<><path d="M20 25h60v55H20z"/><path d="m20 25 30-12 30 12-30 15zM50 40v40"/></>;
  return <div className={`item-art ${large?"large":""} ${item.rarity}`} style={{"--seed":`${[...item.id].reduce((a,c)=>a+c.charCodeAt(0),0)%360}`}}><svg viewBox="0 0 100 100" role="img" aria-label={`${item.name} illustration`}>{shape}</svg>{item.equipped&&<span>EQUIPPED</span>}{item.owned>0&&<b>×{item.owned}</b>}</div>;
}

export default function ItemCatalogue() {
  const [data,setData]=useState(null),[error,setError]=useState(""),[query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[rarity,setRarity]=useState("all"),[collection,setCollection]=useState("all"),[selected,setSelected]=useState(null);
  const load=async()=>{setError("");const{data:value,error:problem}=await supabase.rpc("bw_item_catalogue");if(problem)setError(problem.message);else setData(value)};
  useEffect(()=>{load()},[]);
  const items=useMemo(()=>data?.items?.filter(item=>{
    const text=`${item.name} ${item.description} ${item.slot||""} ${item.collection}`.toLowerCase();
    const category=filter==="all"||filter==="owned"&&item.owned>0||filter==="relics"&&item.dropOnly||filter==="weapons"&&item.kind==="weapon"||filter==="armor"&&item.kind==="armor"||filter==="accessories"&&item.kind==="accessory"||filter==="supplies"&&["medical","booster"].includes(item.kind);
    return text.includes(query.trim().toLowerCase())&&category&&(rarity==="all"||item.rarity===rarity)&&(collection==="all"||item.collection===collection);
  })||[],[data,query,filter,rarity,collection]);
  if(!data)return <div className="catalogue-page"><header className="catalogue-hero"><small>BLACKWOOD COLLECTION</small><h1>The Item Catalogue</h1><p>{error||"Opening the authenticated city archive…"}</p>{error&&<button onClick={load}>Retry</button>}</header></div>;
  const summary=data.summary;
  return <div className="catalogue-page"><header className="catalogue-hero"><div><small>BLACKWOOD COLLECTION · LIVE ARCHIVE</small><h1>The Item Catalogue</h1><p>Every known item, its equipment stats, ownership and server-verified acquisition odds.</p></div><div className="catalogue-progress"><strong>{summary.owned}<i>/ {summary.total}</i></strong><span>unique items owned</span><figure><i style={{width:`${summary.owned/Math.max(1,summary.total)*100}%`}}/></figure></div></header>
    <section className="catalogue-summary">{[["Known items",summary.total],["Owned",summary.owned],["Equipped",summary.equipped],["Relics",`${summary.ownedRelics}/${summary.relics}`]].map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</section>
    <section className="catalogue-tools"><label className="catalogue-search"><GameIcon name="catalogue"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search item, slot or description" aria-label="Search catalogue"/></label><select value={rarity} onChange={event=>setRarity(event.target.value)} aria-label="Filter rarity"><option value="all">All rarities</option>{["common","uncommon","rare","epic","legendary"].map(value=><option value={value} key={value}>{value}</option>)}</select><select value={collection} onChange={event=>setCollection(event.target.value)} aria-label="Filter collection"><option value="all">All collections</option>{data.collections.map(value=><option value={value.name} key={value.name}>{value.name} · {value.owned}/{value.total}</option>)}</select></section>
    <nav className="catalogue-filters" aria-label="Item categories">{FILTERS.map(value=><button className={filter===value?"active":""} onClick={()=>setFilter(value)} key={value}>{value}</button>)}</nav>
    <div className="catalogue-results"><span><b>{items.length}</b> matching items</span><em>Drop percentages are disclosed per item</em></div>
    {items.length?<section className="catalogue-grid">{items.map(item=><button className={`catalogue-card ${item.rarity} ${item.owned?"owned":""}`} onClick={()=>setSelected(item)} key={item.id}><Artwork item={item}/><div><small>{item.collection} · {item.rarity}</small><h2>{item.name}</h2><span>{item.slot||item.kind} · Level {item.levelRequired}</span><dl>{STATS.map(([key,label])=><div className={item[key]>0?"active":""} key={key}><dt>{label}</dt><dd>{item[key]}</dd></div>)}</dl><footer><b>{item.owned?`${item.owned} owned`:money(item.price)}</b><em>View record →</em></footer></div></button>)}</section>:<div className="catalogue-empty"><b>No records match</b><p>Clear a filter or search for another item.</p></div>}
    {selected&&<div className="catalogue-modal" role="dialog" aria-modal="true" aria-label={selected.name} onMouseDown={event=>event.target===event.currentTarget&&setSelected(null)}><article><button className="catalogue-close" onClick={()=>setSelected(null)} aria-label="Close item record">×</button><Artwork item={selected} large/><header><small>{selected.collection} · {selected.rarity}</small><h2>{selected.name}</h2><p>{selected.description}</p></header><section className="catalogue-detail-stats">{STATS.map(([key,label])=><div key={key}><small>{label}</small><b>{selected[key]}</b></div>)}<div><small>LEVEL</small><b>{selected.levelRequired}</b></div><div><small>VALUE</small><b>{money(selected.price)}</b></div></section><section className="obtain-routes"><h3>How to obtain</h3>{selected.obtain.map((route,index)=><div key={`${route.source}-${index}`}><i><GameIcon name={route.kind==="combat"?"combat":route.kind==="market"?"market":route.kind==="shop"?"shop":route.kind==="contract"?"contracts":"hustles"}/></i><span><small>{route.source}</small><b>{route.chance}</b>{route.exactChance&&<em>{route.exactChance}</em>}<p>{route.detail}</p></span></div>)}</section><footer className="catalogue-ownership"><span><small>YOUR RECORD</small><b>{selected.owned?`${selected.owned} owned${selected.equipped?" · equipped":""}`:"Not yet owned"}</b></span><button onClick={()=>setSelected(null)}>Back to catalogue</button></footer></article></div>}
  </div>;
}
