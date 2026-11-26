import { useEffect, type RefObject } from "react";

const LONG_PRESS_MS = 260; // appui prolongé avant d'entrer en mode glissement
const STEP_PX = 56; // distance de glissement pour passer à la page suivante
const SLOP_PX = 8; // en dessous, le doigt est considéré immobile

/**
 * Appui long puis glissement horizontal sur une rangée d'onglets : les pages défilent au fur et à mesure.
 * Un glissement immédiat (sans appui long) reste un défilement normal de la rangée.
 * Les écouteurs restent sur l'élément touché : la rangée est recréée à chaque changement de page,
 * mais le geste en cours continue d'être suivi.
 */
export function useScrubNav(ref: RefObject<HTMLElement | null>, itemSelector: string) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let timer = 0;
    let active = false;
    let pushed = false;
    let startX = 0, startY = 0, startIdx = 0, lastIdx = 0;
    let hrefs: string[] = [];

    const go = (href: string) => {
      if (!pushed) {
        pushed = true;
        window.location.hash = href; // la première étape garde l'écran d'origine dans l'historique
      } else {
        history.replaceState(null, "", href);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    };
    const detach = () => {
      window.clearTimeout(timer);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
      delete document.documentElement.dataset.scrub;
      active = false;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (!active) {
        if (Math.hypot(t.clientX - startX, t.clientY - startY) > SLOP_PX) detach(); // glissement rapide : défilement normal
        return;
      }
      if (e.cancelable) e.preventDefault();
      const idx = Math.min(hrefs.length - 1, Math.max(0, startIdx + Math.round((t.clientX - startX) / STEP_PX)));
      if (idx !== lastIdx) {
        lastIdx = idx;
        go(hrefs[idx]);
        navigator.vibrate?.(6);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (active && e.cancelable) e.preventDefault(); // pas de clic fantôme à la fin du glissement
      detach();
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const items = Array.from(node.querySelectorAll<HTMLAnchorElement>(itemSelector));
      if (items.length < 2) return;
      hrefs = items.map((a) => a.getAttribute("href") ?? "#/");
      startIdx = items.findIndex((a) => a.getAttribute("aria-current") === "page");
      if (startIdx < 0) return; // pas de page courante (raccourcis de la Synthèse) : pas de glissement entre pages
      lastIdx = startIdx;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pushed = false;
      active = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        active = true;
        document.documentElement.dataset.scrub = "1";
        navigator.vibrate?.(12);
      }, LONG_PRESS_MS);
      node.addEventListener("touchmove", onMove, { passive: false });
      node.addEventListener("touchend", onEnd);
      node.addEventListener("touchcancel", onEnd);
    };
    const noMenu = (e: Event) => e.preventDefault(); // pas de menu « ouvrir le lien » sur appui long

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("contextmenu", noMenu);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("contextmenu", noMenu);
      // si le geste est en cours, les écouteurs touchmove/touchend se retirent d'eux-mêmes à la fin
    };
  }, [ref, itemSelector]);
}

const SWIPE_MIN_PX = 110; // grand balayage seulement
const SWIPE_RATIO = 2.4; // nettement plus horizontal que vertical
const SWIPE_MAX_MS = 800;
const EDGE_PX = 28; // on laisse les bords à l'Android (geste retour)

/**
 * Grand balayage horizontal n'importe où sur la page : passe à l'onglet voisin de la rangée du haut.
 * Ignoré sur les zones qui défilent ou se manipulent horizontalement (rangées, graphiques, champs, fenêtres).
 */
export function usePageSwipe() {
  useEffect(() => {
    let x0 = 0, y0 = 0, t0 = 0, ok = false;
    const blocked = (el: EventTarget | null) =>
      el instanceof Element && !!el.closest('.hk-scroll, [data-noswipe], dialog, input, textarea, select, canvas, .leaflet-container, .hk-tabbar, [role="slider"]');
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      ok = e.touches.length === 1 && !blocked(e.target) && t.clientX > EDGE_PX && t.clientX < window.innerWidth - EDGE_PX && !document.documentElement.dataset.scrub;
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    };
    const end = (e: TouchEvent) => {
      if (!ok) return;
      ok = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO || Date.now() - t0 > SWIPE_MAX_MS) return;
      const chips = Array.from(document.querySelectorAll<HTMLAnchorElement>("nav.hk-scroll a.hk-chip"));
      const cur = chips.findIndex((a) => a.getAttribute("aria-current") === "page");
      if (cur < 0) return;
      const next = chips[cur + (dx < 0 ? 1 : -1)];
      if (next) window.location.hash = next.getAttribute("href") ?? "";
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
    };
  }, []);
}

/** Pose --fl / --fr (0 ou 1) sur chaque rangée .hk-scroll : le fondu n'apparaît que du côté où il reste du contenu. */
export function useEdgeFades() {
  useEffect(() => {
    const upd = (el: HTMLElement) => {
      const max = el.scrollWidth - el.clientWidth;
      el.style.setProperty("--fl", el.scrollLeft > 2 ? "1" : "0");
      el.style.setProperty("--fr", max > 2 && el.scrollLeft < max - 2 ? "1" : "0");
    };
    const all = () => document.querySelectorAll<HTMLElement>(".hk-scroll").forEach(upd);
    const onScroll = (e: Event) => e.target instanceof HTMLElement && e.target.classList.contains("hk-scroll") && upd(e.target);
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(all); };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", later);
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true });
    all();
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", later);
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
}
