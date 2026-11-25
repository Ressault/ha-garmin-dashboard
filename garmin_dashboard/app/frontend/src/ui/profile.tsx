import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from "react";

import { api, type Profile } from "@/lib/api";

/* ---------- Profil partagé (prénom + photo) : serveur = référence, localStorage = affichage instantané ---------- */
const KEY = "profile-v1";
const DEFAULT: Profile = { name: "Antonin", photo: "" };

function load(): Profile {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v.name === "string") return { name: v.name, photo: v.photo || "" };
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT;
}

let current: Profile = load();
const subs = new Set<() => void>();
let fetched = false;

function set(p: Profile) {
  current = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* photo trop lourde pour le stockage local : on garde la version mémoire */
  }
  subs.forEach((f) => f());
}

export function useProfile(): Profile {
  useEffect(() => {
    if (fetched) return;
    fetched = true;
    api
      .profile()
      .then((p) => {
        // Serveur vide (premier lancement) : on garde les valeurs par défaut
        if (p.name || p.photo) set({ name: p.name || DEFAULT.name, photo: p.photo });
      })
      .catch(() => {
        fetched = false;
      });
  }, []);
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}

export function Avatar({ size = 64, className = "" }: { size?: number; className?: string }) {
  const { name, photo } = useProfile();
  const initial = (name.trim()[0] || "A").toUpperCase();
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-[0_0_0_3px_var(--card),0_6px_16px_-6px_rgb(40_60_140/0.4)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.44, background: photo ? `center/cover url(${photo})` : "linear-gradient(135deg,#7AB8FF,#B48CF2)" }}
    >
      {photo ? null : initial}
    </span>
  );
}

const OUT = 384; // taille de la photo enregistrée (px)
const VIEW = 272; // zone de recadrage affichée (px)
const PAD = 14;
const CROP = VIEW - PAD * 2; // diamètre du cercle de recadrage

/** Recadrage : on déplace la photo avec le doigt, on zoome avec deux doigts ou le curseur. */
function Cropper({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (jpeg: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [bad, setBad] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setBad(true);
    im.src = src;
  }, [src]);

  const w = img?.naturalWidth ?? 1, h = img?.naturalHeight ?? 1;
  const k = (CROP / Math.min(w, h)) * zoom; // pixels écran par pixel de l'image
  const clamp = (o: { x: number; y: number }, kk = k) => {
    const mx = Math.max(0, (w * kk - CROP) / 2), my = Math.max(0, (h * kk - CROP) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setZ = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    setZoom(nz);
    setOff((o) => clamp(o, (CROP / Math.min(w, h)) * nz));
  };

  const down = (e: RPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
    }
  };
  const move = (e: RPointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, cur);
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      setZ(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
    } else if (pts.current.size === 1) {
      setOff((o) => clamp({ x: o.x + cur.x - prev.x, y: o.y + cur.y - prev.y }));
    }
  };
  const up = (e: RPointerEvent) => {
    pts.current.delete(e.pointerId);
    pinch.current = null;
  };

  const apply = () => {
    if (!img) return;
    const size = CROP / k; // côté de la zone à prélever dans l'image d'origine
    const sx = w / 2 - CROP / 2 / k - off.x / k;
    const sy = h / 2 - CROP / 2 / k - off.y / k;
    const c = document.createElement("canvas");
    c.width = c.height = OUT;
    c.getContext("2d")!.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
    onDone(c.toDataURL("image/jpeg", 0.86));
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onCancel} className="hk-press text-[17px] text-[#0a64d8] dark:text-[#409cff]">
          Annuler
        </button>
        <h2 className="m-0 text-[17px] font-semibold">Recadrer</h2>
        <button type="button" onClick={apply} disabled={!img} className="hk-press text-[17px] font-semibold text-[#0a64d8] disabled:opacity-40 dark:text-[#409cff]">
          Choisir
        </button>
      </div>
      <div
        className="relative mx-auto touch-none overflow-hidden rounded-[22px] bg-black select-none"
        style={{ width: VIEW, height: VIEW, cursor: "grab" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label="Zone de recadrage : fais glisser la photo pour la placer"
      >
        {img && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ position: "absolute", left: "50%", top: "50%", width: w * k, height: h * k, maxWidth: "none", transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))`, userSelect: "none", pointerEvents: "none" }}
          />
        )}
        <div className="pointer-events-none absolute rounded-full" style={{ inset: PAD, boxShadow: "0 0 0 999px rgb(0 0 0 / 0.58)", border: "2px solid rgb(255 255 255 / 0.9)" }} />
        {bad && <p className="absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-[15px] text-white">Image illisible. Essaie une photo JPEG ou PNG.</p>}
      </div>
      <label className="flex items-center gap-3 px-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--label2)" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="5" /></svg>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZ(Number(e.target.value))} aria-label="Zoom" className="h-8 min-w-0 flex-1 accent-[#0a84ff]" />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--label2)" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /></svg>
      </label>
      <p className="m-0 text-center text-[13px] text-label2">Fais glisser pour cadrer, pince ou utilise le curseur pour zoomer.</p>
    </div>
  );
}

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const cur = useProfile();
  const [name, setName] = useState(cur.name);
  const [photo, setPhoto] = useState(cur.photo);
  const [orig, setOrig] = useState(""); // dernière photo choisie, gardée en pleine taille pour pouvoir la recadrer à nouveau
  const [crop, setCrop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName(cur.name);
      setPhoto(cur.photo);
      setCrop(null);
      setErr("");
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => { if (orig) URL.revokeObjectURL(orig); }, [orig]);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr("Ce fichier n'est pas une image.");
      return;
    }
    setErr("");
    const url = URL.createObjectURL(f);
    setOrig(url);
    setCrop(url);
    if (file.current) file.current.value = ""; // permet de rechoisir la même photo
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.saveProfile({ name: name.trim() || DEFAULT.name, photo });
      set({ name: saved.name || DEFAULT.name, photo: saved.photo });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const initial = (name.trim()[0] || "A").toUpperCase();
  return (
    <dialog ref={ref} className="hk-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="profil-titre">
      {crop ? (
        <Cropper
          src={crop}
          onCancel={() => setCrop(null)}
          onDone={(jpeg) => {
            setPhoto(jpeg);
            setCrop(null);
          }}
        />
      ) : (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-5 p-5"
        >
          <div className="flex items-center justify-between">
            <button type="button" onClick={onClose} className="hk-press text-[17px] text-[#0a64d8] dark:text-[#409cff]">
              Annuler
            </button>
            <h2 id="profil-titre" className="m-0 text-[17px] font-semibold">
              Profil
            </h2>
            <button type="submit" disabled={busy} className="hk-press text-[17px] font-semibold text-[#0a64d8] disabled:opacity-50 dark:text-[#409cff]">
              {busy ? "…" : "OK"}
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button type="button" onClick={() => file.current?.click()} aria-label="Choisir une photo" className="hk-press relative rounded-full">
              <span
                className="flex size-28 items-center justify-center overflow-hidden rounded-full text-5xl font-semibold text-white"
                style={{ background: photo ? `center/cover url(${photo})` : "linear-gradient(135deg,#7AB8FF,#B48CF2)" }}
              >
                {photo ? null : initial}
              </span>
              <span className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-[#0a84ff] text-white ring-[3px] ring-[var(--card)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
            </button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[15px]">
              <button type="button" onClick={() => file.current?.click()} className="hk-press font-semibold text-[#0a64d8] dark:text-[#409cff]">
                {photo ? "Changer la photo" : "Ajouter une photo"}
              </button>
              {photo ? (
                <button type="button" onClick={() => setCrop(orig || photo)} className="hk-press font-semibold text-[#0a64d8] dark:text-[#409cff]">
                  Recadrer
                </button>
              ) : null}
              {photo ? (
                <button type="button" onClick={() => setPhoto("")} className="hk-press text-[#d70015] dark:text-[#ff6961]">
                  Supprimer
                </button>
              ) : null}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] text-label2">Prénom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              enterKeyHint="done"
              className="h-12 rounded-xl border-0 bg-[var(--fill)] px-4 text-[17px] text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
            />
          </label>
          {err ? (
            <p role="alert" className="m-0 text-[14px] text-[#d70015] dark:text-[#ff6961]">
              {err}
            </p>
          ) : null}
        </form>
      )}
    </dialog>
  );
}
