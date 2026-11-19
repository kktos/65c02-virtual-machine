/** Distance under which a moved or resized edge sticks to the window's edge (px) */
export const SNAP = 12;

/** `value` stuck to 0 or `max` when it's closer than SNAP to it */
export const snapToEdge = (value: number, max: number) => (value < SNAP ? 0 : max - value < SNAP ? max : value);

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));

/** Follow the pointer (primary button) until it's released: onMove gets the distance from the start */
export const trackPointer = (event: PointerEvent, onMove: (dx: number, dy: number) => void, onEnd: () => void) => {
	if (event.button !== 0) return;
	event.preventDefault();
	const target = event.currentTarget as HTMLElement;
	const startX = event.clientX;
	const startY = event.clientY;
	target.setPointerCapture(event.pointerId);

	const move = (e: PointerEvent) => onMove(e.clientX - startX, e.clientY - startY);
	const up = () => {
		target.removeEventListener("pointermove", move);
		target.removeEventListener("pointerup", up);
		target.removeEventListener("pointercancel", up);
		onEnd();
	};
	target.addEventListener("pointermove", move);
	target.addEventListener("pointerup", up);
	target.addEventListener("pointercancel", up);
};
