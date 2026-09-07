export const GROUPS = [
  { id: 'home', label: 'Home', icon: 'home', pages: [['home','Overview'],['daily','Daily Life'],['dispatch','Progress board'],['takeover','Blackwood Takeover']] },
  { id: 'play', label: 'Play', icon: 'crimes', pages: [['crimes','Crimes'],['hustles','Street Work'],['operations','District Operations'],['missions','Campaign'],['factions','Factions'],['combat','Combat']] },
  { id: 'character', label: 'Character', icon: 'inventory', pages: [['inventory','Equipment & inventory'],['catalogue','Item Catalogue'],['gym','Training'],['work','Jobs'],['awards','Awards'],['rankings','Rankings']] },
  { id: 'city', label: 'City', icon: 'city', pages: [['city','City directory'],['civic','Civic Contracts'],['shop','Security & Tools'],['market','Blackwood Exchange'],['bank','Federal Trust'],['economy','Market Desk'],['property','Properties'],['arcade','Arcade'],['hospital','Hospital'],['jail','Jail']] },
  { id: 'family', label: 'Family', icon: 'family', pages: [['family','Your family'],['chat','World Chat'],['players','Players'],['social','Contacts & blocked players'],['mail','Messages'],['forums','Forums'],['safety','Help & Safety']] },
];
export const pageGroup = page => GROUPS.find(group => group.pages.some(([id]) => id === page)) || GROUPS[0];
export const pageLabel = page => GROUPS.flatMap(group => group.pages).find(([id]) => id === page)?.[1] || 'Home';
export const validPage = page => GROUPS.some(group => group.pages.some(([id]) => id === page));
