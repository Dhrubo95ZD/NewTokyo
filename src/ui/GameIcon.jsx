const paths = {
  home: "M4 11.5 12 4l8 7.5V20h-5v-6H9v6H4z", crimes: "M6 9V6a6 6 0 0 1 12 0v3h2v11H4V9zm3 0h6V6a3 3 0 0 0-6 0z",
  combat: "m5 19 14-14M7 5l12 12M4 4l4 1-3 3zm16 16-4-1 3-3z", gym: "M3 9h3v6H3zm15 0h3v6h-3zM7 7h3v10H7zm7 0h3v10h-3zM10 11h4v2h-4z",
  targets: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 10a2 2 0 1 0 2 2m4-8v4h4M16 6l5-5", contracts: "M7 4h10v3h3v14H4V7h3zm2 0V2h6v2M8 11h8M8 15h6", bounties: "M12 3 4 7l5 1-3.5 4 1 6-6.5-3-6.5 3 1-6L3 8l5-1z", history: "M12 8v5l3 2M4 5v5h5M4.5 10a8 8 0 1 0 2-5",
  work: "M8 6V4h8v2h5v14H3V6zm2 0h4V5h-4zm-5 6h14V8H5zm6-2h2v2h-2z", missions: "m5 12 4 4L19 6l-2-2-8 8-2-2z",
  city: "M4 20V8l8-4 8 4v12h-5v-6H9v6zm5-10h2V8H9zm4 0h2V8h-2z", shop: "M5 8h14l-1 12H6zm3 0a4 4 0 0 1 8 0h-2a2 2 0 0 0-4 0z",
  market: "M4 6h16M6 6l-3 6h6zm12 0-3 6h6zM12 3v17m-4 0h8", hustles: "M4 15c2-6 5-9 9-9h4l-2-2m2 2-2 2M20 9c-2 6-5 9-9 9H7l2 2m-2-2 2-2",
  bank: "M3 9 12 4l9 5v2H3zm2 4h2v5h2v-5h2v5h2v-5h2v5h2v-5h2v7H5z", hospital: "M9 4h6v5h5v6h-5v5H9v-5H4V9h5z",
  jail: "M5 3h14v18H5zm3 2H7v14h1zm5 0h-2v14h2zm4 0h-1v14h1z", property: "M3 11 12 3l9 8-2 2-1-1v9H6v-9l-1 1zm6 2v6h6v-6z",
  family: "M12 3 4 7v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V7zm0 4 2 4 4 .5-3 3 .8 4.5-3.8-2-3.8 2 .8-4.5-3-3 4-.5z",
  chat: "M3 5h18v12H9l-5 4v-4H3zm4 5h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z", players: "M8 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8m8-1a3 3 0 1 1 0-6 3 3 0 0 1 0 6M2 21v-3c0-3 3-5 6-5s6 2 6 5v3zm13 0v-3c0-1.5-.6-2.8-1.7-3.8 4.3-1.1 8.7.7 8.7 3.8v3z",
  social: "M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11", mail: "M3 5h18v14H3zm2 2 7 6 7-6",
  forums: "M4 4h16v11H9l-5 4zm4 4h8v2H8zm0 4h6v2H8z", rankings: "M5 4h14v3c0 4-2 6-5 7v2h3v2H7v-2h3v-2c-3-1-5-3-5-7zm-3 2h3v2H2zm17 0h3v6h-3z",
  awards: "m12 3 2.7 5.5 6 .9-4.4 4.3 1 6.1-5.3-2.9-5.3 2.9 1-6.1L3.3 9.4l6-.9z", inventory: "M4 7h16v14H4zm3-4h10l2 4H5zm2 8h6v2H9z",
  catalogue: "M5 3h13a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V4m3 14h13M8 7h8M8 11h6",
  arcade: "M5 7h14l3 12h-5l-2-3H9l-2 3H2zm4 3H7v2H5v2h2v2h2v-2h2v-2H9zm7 2h2v2h-2z", economy: "M3 18 8 12l4 3 7-9 2 2-9 11-4-3-3 4z",
  adviser: "M12 2a8 8 0 0 1 5 14.2V21H7v-4.8A8 8 0 0 1 12 2m-3 8h2V8H9zm4 0h2V8h-2zm-4 4h6v-2H9z"
};
export default function GameIcon({ name, size = 20 }) { return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.city}/></svg>; }
