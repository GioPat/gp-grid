export interface PointerEventData {
  clientX: number;
  clientY: number;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pointerId: number;
  pointerType: string;
}

export const toPointerEventData = (event: PointerEvent): PointerEventData => ({
  clientX: event.clientX,
  clientY: event.clientY,
  button: event.button,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  pointerId: event.pointerId,
  pointerType: event.pointerType,
});
