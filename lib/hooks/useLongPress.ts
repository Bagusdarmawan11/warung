'use client';

import { useRef } from 'react';

/**
 * Membedakan "tap" biasa dari "tekan & tahan" (long press) pada elemen yang
 * sama, baik di layar sentuh maupun mouse. Dipakai supaya menekan sebentar
 * pada baris produk membuka edit, sedangkan menekan agak lama mengaktifkan
 * mode pilih banyak.
 */
export function useLongPress(onLongPress: () => void, onClick: () => void, ms = 480) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  function start() {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, ms);
  }
  function clear() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }
  function handleClick() {
    if (firedRef.current) { firedRef.current = false; return; }
    onClick();
  }

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: handleClick,
  };
}
