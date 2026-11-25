import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

/** Recadre en carré au centre et réduit à 256 px : ~20 Ko, assez net pour un avatar. */
async function toAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close?.();
  return c.toDataURL("image/jpeg", 0.85);
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

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const cur = useProfile();
  const [name, setName] = useState(cur.name);
  const [photo, setPhoto] = useState(cur.photo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName(cur.name);
      setPhoto(cur.photo);
      setErr("");
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (f?: File | null) => {
    if (!f) return;
    try {
      setPhoto(await toAvatar(f));
      setErr("");
    } catch {
      setErr("Image illisible. Essaie une photo JPEG ou PNG.");
    }
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
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <div className="flex gap-4 text-[15px]">
            <button type="button" onClick={() => file.current?.click()} className="hk-press font-semibold text-[#0a64d8] dark:text-[#409cff]">
              {photo ? "Changer la photo" : "Ajouter une photo"}
            </button>
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
    </dialog>
  );
}
