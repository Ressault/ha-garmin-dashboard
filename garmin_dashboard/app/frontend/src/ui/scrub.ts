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
      startIdx = Math.max(0, items.findIndex((a) => a.getAttribute("aria-current") === "page"));
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
