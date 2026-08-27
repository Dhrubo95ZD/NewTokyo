import { useMemo, useState } from "react";
import { AndroidRunnerModel, ANDROID_FINISHES, ANDROID_MODELS, ANDROID_OPTICS, normalizeAndroidProfile } from "./AndroidRunner.jsx";
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
export function createCharacterProfile({ codename, roleId = "striker", androidModel = 0, optic = 0, finish = 0 } = {}) {
  const role = CHARACTER_ROLE_BY_ID[roleId] || CHARACTER_ROLES[0];
  return {
    codename: cleanCharacterName(codename),
    role: role.id,
    legacyRole: role.legacyRole,
    archetype: role.id,
    frame: role.frame,
    androidModel, helmet: ANDROID_MODELS[androidModel]?.helmet || 0, optic, finish,
    eyes: optic, jacket: finish, hair: 0, augment: 0,
    equipment: { ...EMPTY_EQUIPMENT },
    creationVersion: 2,
  };
}

export function normalizeCharacterCreation(initial = {}) {
  const inferred = initial.archetype
    || (CHARACTER_ROLE_BY_ID[initial.role] ? initial.role : null)
    || (initial.role === "netrunner" ? "technician" : "striker");
  return {
    codename: cleanCharacterName(initial.codename || ""),
    roleId: CHARACTER_ROLE_BY_ID[inferred] ? inferred : "striker",
    androidModel: normalizeAndroidProfile(initial).androidModel,
    optic: normalizeAndroidProfile(initial).optic,
    finish: normalizeAndroidProfile(initial).finish,
  };
}

function RolePortrait({ role, codename, appearance }) {
  return (
    <figure
      className={`nt-create__portrait nt-create__portrait--${role.id}`}
      style={{ "--role-a": role.colors[0], "--role-b": role.colors[1] }}
    >
      <div className="nt-create__role-aura" aria-hidden="true" />
      <AndroidRunnerModel profile={{codename,role:role.id,archetype:role.id,...appearance}} label={`${codename || "New runner"}, fully helmeted ${role.name} android preview`}/>
      <div className="nt-create__role-chip"><i>{role.name.slice(0,1)}</i><span><small>DISCIPLINE</small><b>{role.name}</b></span></div>
      <figcaption>
        <strong>{codename || "UNNAMED"}</strong>
        <span>{role.subtitle}</span>
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
  const [appearance,setAppearance]=useState({androidModel:normalized.androidModel,optic:normalized.optic,finish:normalized.finish});
  const role = CHARACTER_ROLE_BY_ID[roleId];
  const validName = /^[A-Za-z0-9_]{3,14}$/.test(codename);

  const finish = () => {
    if (!validName || busy || typeof onComplete !== "function") return;
    onComplete(createCharacterProfile({ codename, roleId, ...appearance }));
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
          <RolePortrait role={role} codename={codename} appearance={appearance} />
          <div className="nt-create__loadout-note"><b>Clean loadout</b><span>Weapon, helmet, armor and boots unlock through District One.</span></div>
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
          <section className="nt-create__android-custom" aria-label="Android customization"><label>Android configuration</label><div className="nt-create__model-grid">{ANDROID_MODELS.map((model)=><button type="button" key={model.id} className={appearance.androidModel===model.id?"is-selected":""} onClick={()=>setAppearance((value)=>({...value,androidModel:model.id}))}><AndroidRunnerModel profile={{...appearance,androidModel:model.id}} compact/><span><b>{model.name}</b><small>{model.frame} chassis</small></span></button>)}</div><div className="nt-create__signals"><span>OPTIC{ANDROID_OPTICS.map((color,index)=><button type="button" key={color} className={appearance.optic===index?"is-selected":""} style={{"--signal":color}} onClick={()=>setAppearance((value)=>({...value,optic:index}))}/>)}</span><span>FINISH{ANDROID_FINISHES.map((color,index)=><button type="button" key={color} className={appearance.finish===index?"is-selected":""} style={{"--signal":color}} onClick={()=>setAppearance((value)=>({...value,finish:index}))}/>)}</span></div></section>
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
