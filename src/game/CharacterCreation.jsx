import { useId, useMemo, useState } from "react";
import "./character-creation.css";

export const EMPTY_EQUIPMENT = Object.freeze({
  weapon: null,
  helmet: null,
  armor: null,
  boots: null,
});

export const CHARACTER_ROLES = Object.freeze([
  Object.freeze({
    id: "striker",
    name: "Striker",
    subtitle: "Decisive front-line pressure",
    description: "Break an opening, keep moving, and finish the fight before the district closes in.",
    specialty: "Power skills charge faster",
    legacyRole: "samurai",
    frame: "broad",
    colors: ["#ff5c7a", "#ffb45e"],
    stats: Object.freeze({ power: 8, guard: 5, mobility: 7, tech: 3 }),
  }),
  Object.freeze({
    id: "guardian",
    name: "Guardian",
    subtitle: "Steady control and protection",
    description: "Hold the line, create safe space, and turn enemy pressure into a patient counterattack.",
    specialty: "Guard actions restore resolve",
    legacyRole: "samurai",
    frame: "broad",
    colors: ["#36c9b7", "#8ce7d2"],
    stats: Object.freeze({ power: 5, guard: 9, mobility: 4, tech: 5 }),
  }),
  Object.freeze({
    id: "technician",
    name: "Technician",
    subtitle: "Tools, timing, and field control",
    description: "Read the arena, deploy smart utilities, and win through careful preparation.",
    specialty: "Utility effects last longer",
    legacyRole: "netrunner",
    frame: "slim",
    colors: ["#5b7cfa", "#8cecff"],
    stats: Object.freeze({ power: 4, guard: 5, mobility: 6, tech: 9 }),
  }),
]);

export const CHARACTER_ROLE_BY_ID = Object.freeze(
  Object.fromEntries(CHARACTER_ROLES.map((role) => [role.id, role])),
);

export function cleanCharacterName(value = "") {
  return String(value).replace(/[^A-Za-z0-9_]/g, "").slice(0, 14);
}

/**
 * Returns a compact character record that can live in the existing
 * account-save `character` field. `role` and `archetype` use the current
 * three-role identity while `legacyRole` preserves compatibility hints for
 * older combat/save migrations.
 */
export function createCharacterProfile({ codename, roleId = "striker" } = {}) {
  const role = CHARACTER_ROLE_BY_ID[roleId] || CHARACTER_ROLES[0];
  return {
    codename: cleanCharacterName(codename),
    role: role.id,
    legacyRole: role.legacyRole,
    archetype: role.id,
    frame: role.frame,
    skin: 1,
    eyes: role.id === "technician" ? 0 : role.id === "guardian" ? 2 : 1,
    jacket: role.id === "technician" ? 1 : role.id === "guardian" ? 2 : 0,
    hair: 0,
    augment: role.id === "technician" ? 1 : 0,
    equipment: { ...EMPTY_EQUIPMENT },
    creationVersion: 1,
  };
}

export function normalizeCharacterCreation(initial = {}) {
  const inferred = initial.archetype
    || (CHARACTER_ROLE_BY_ID[initial.role] ? initial.role : null)
    || (initial.role === "netrunner" ? "technician" : "striker");
  return {
    codename: cleanCharacterName(initial.codename || ""),
    roleId: CHARACTER_ROLE_BY_ID[inferred] ? inferred : "striker",
  };
}

function RolePortrait({ role, codename }) {
  const gradientId = useId();
  const glowId = useId();
  return (
    <figure
      className={`nt-create__portrait nt-create__portrait--${role.id}`}
      style={{ "--role-a": role.colors[0], "--role-b": role.colors[1] }}
    >
      <svg viewBox="0 0 360 460" role="img" aria-label={`${codename || "New runner"}, ${role.name} preview`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop stopColor={role.colors[1]} />
            <stop offset="1" stopColor={role.colors[0]} />
          </linearGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path className="nt-create__sun" d="M40 300A140 140 0 0 1 320 300Z" fill={`url(#${gradientId})`} />
        <path className="nt-create__skyline" d="M13 350v-58h20v-33h29v61h22v-96h27v33h21v-54h30v72h30v-106h29v71h26v-38h26v92h25v-63h27v119Z" />
        <ellipse cx="180" cy="421" rx="116" ry="20" fill="#092f4a" opacity=".2" />
        <path className="nt-create__coat" d={role.frame === "slim" ? "M104 423q8-127 76-138 68 11 76 138Z" : "M74 423q11-127 106-138 95 11 106 138Z"} fill={`url(#${gradientId})`} />
        <path d="M139 276h82l-16 54-25 25-25-25Z" fill="#f4b992" />
        <path d="M113 150q4-82 67-82t67 82l-14 96q-13 45-53 48-40-3-53-48Z" fill="#f4b992" stroke="#273456" strokeWidth="5" />
        <path d="M111 162q-3-85 69-98 69 13 69 94l-32-31-41 18-36-24Z" fill="#18395c" stroke="#152842" strokeWidth="7" />
        <path d="M137 194h27m31 0h27" stroke="#203353" strokeWidth="8" strokeLinecap="round" />
        <path d="M147 201h15m36 0h15" stroke={role.colors[0]} strokeWidth="5" strokeLinecap="round" filter={`url(#${glowId})`} />
        <path d="M164 250q16 9 32 0" fill="none" stroke="#96566a" strokeWidth="5" strokeLinecap="round" />
        {role.id === "technician" && <><circle cx="224" cy="197" r="12" fill="none" stroke={role.colors[1]} strokeWidth="5" /><path d="M236 197h35" stroke={role.colors[1]} strokeWidth="5" /></>}
        {role.id === "guardian" && <path d="M84 377l51-40 45 33 45-33 51 40" fill="none" stroke="#e9fff9" strokeWidth="15" opacity=".85" />}
        {role.id === "striker" && <path d="M90 408l42-85 48 48 48-48 42 85" fill="none" stroke="#fff3dd" strokeWidth="10" opacity=".9" />}
        {role.id === "technician" && <path d="M111 397h138M125 372h110" stroke="#e9fdff" strokeWidth="8" strokeDasharray="18 9" opacity=".9" />}
      </svg>
      <figcaption>
        <strong>{codename || "UNNAMED"}</strong>
        <span>{role.name}</span>
      </figcaption>
    </figure>
  );
}

function StatIdentity({ role }) {
  return (
    <section className="nt-create__stats" aria-label={`${role.name} starting attributes`}>
      {Object.entries(role.stats).map(([name, value]) => (
        <div className="nt-create__stat" key={name}>
          <div><span>{name}</span><b>{value}</b></div>
          <meter min="0" max="10" value={value}>{value} out of 10</meter>
        </div>
      ))}
    </section>
  );
}

export default function CharacterCreation({
  initial = null,
  onComplete,
  onCancel,
  busy = false,
  title = "Choose your path",
}) {
  const normalized = useMemo(() => normalizeCharacterCreation(initial || {}), [initial]);
  const [codename, setCodename] = useState(normalized.codename);
  const [roleId, setRoleId] = useState(normalized.roleId);
  const role = CHARACTER_ROLE_BY_ID[roleId];
  const validName = /^[A-Za-z0-9_]{3,14}$/.test(codename);

  const finish = () => {
    if (!validName || busy || typeof onComplete !== "function") return;
    onComplete(createCharacterProfile({ codename, roleId }));
  };

  return (
    <main className="nt-create" aria-labelledby="nt-create-title">
      <div className="nt-create__wash" aria-hidden="true" />
      <header className="nt-create__header">
        <div>
          <span>NEO-TOKYO // ARRIVAL 01</span>
          <h1 id="nt-create-title">{title}</h1>
          <p>Your role shapes your first skills, not your future. Every equipment slot begins empty.</p>
        </div>
        {onCancel && <button className="nt-create__close" type="button" onClick={onCancel} aria-label="Close character creation">Close</button>}
      </header>

      <div className="nt-create__layout">
        <section className="nt-create__visual" aria-live="polite">
          <div className="nt-create__district-label"><span /> EAST WARD INTAKE</div>
          <RolePortrait role={role} codename={codename} />
          <div className="nt-create__slots" aria-label="Starting equipment slots">
            {Object.keys(EMPTY_EQUIPMENT).map((slot) => (
              <div key={slot}><i aria-hidden="true">+</i><span>{slot}</span><b>Empty</b></div>
            ))}
          </div>
        </section>

        <form
          className="nt-create__panel"
          style={{ "--role-a": role.colors[0], "--role-b": role.colors[1] }}
          onSubmit={(event) => { event.preventDefault(); finish(); }}
        >
          <section className="nt-create__identity">
            <label htmlFor="nt-create-name">Runner name</label>
            <input
              id="nt-create-name"
              value={codename}
              onChange={(event) => setCodename(cleanCharacterName(event.target.value))}
              minLength={3}
              maxLength={14}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              placeholder="3–14 letters or numbers"
              aria-describedby="nt-create-name-help"
              aria-invalid={codename.length > 0 && !validName}
            />
            <small id="nt-create-name-help" className={validName ? "is-valid" : ""}>
              {validName ? "Identity ready" : "Letters, numbers, and underscore only"}
            </small>
          </section>

          <fieldset className="nt-create__roles">
            <legend>Starting role</legend>
            {CHARACTER_ROLES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={roleId === option.id}
                className={roleId === option.id ? "is-selected" : ""}
                style={{ "--role-a": option.colors[0], "--role-b": option.colors[1] }}
                onClick={() => setRoleId(option.id)}
              >
                <span className="nt-create__role-mark" aria-hidden="true">{option.name.slice(0, 1)}</span>
                <span><b>{option.name}</b><small>{option.subtitle}</small></span>
                <i aria-hidden="true">✓</i>
              </button>
            ))}
          </fieldset>

          <div className="nt-create__role-copy">
            <span>{role.specialty}</span>
            <p>{role.description}</p>
          </div>
          <StatIdentity role={role} />

          <footer className="nt-create__actions">
            <p><b>Empty loadout confirmed.</b> Your first district mission awards your first weapon.</p>
            <button type="submit" disabled={!validName || busy}>
              {busy ? "Saving runner…" : "Begin district one"}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
