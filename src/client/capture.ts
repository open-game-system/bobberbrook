/** Keeps a finger's pointer on this element; harmless if the browser refuses (a synthetic or ended pointer). */
export function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* no live pointer to capture */
  }
}
