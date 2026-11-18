// Keyboard and mouse input. Held keys steer (WASD or arrows); one-shot presses (enter a
// car, punch, pause, mute, retry, confirm) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse
// aims the pistol on foot: its position is tracked in screen pixels and the game converts
// it through the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_RETRY = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);
const RETRY = new Set(['KeyR']);

export function createInput(canvas) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let run = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  function mark(code, event, value) {
    if (UP.has(code)) up = value;
    else if (DOWN.has(code)) down = value;
    else if (LEFT.has(code)) left = value;
    else if (RIGHT.has(code)) right = value;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') run = value;
    else return false;
    event.preventDefault();
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (mark(event.code, event, true)) return;
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (RETRY.has(event.code)) actions |= ACTION_RETRY;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    mark(event.code, event, false);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    run = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    mouseClicked = true;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Steering: -1..1 on each axis (up is -y). */
    axes() {
      return {
        x: (right ? 1 : 0) - (left ? 1 : 0),
        y: (down ? 1 : 0) - (up ? 1 : 0),
      };
    },
    isRunning() {
      return run;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** True once after a click, then cleared. */
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
