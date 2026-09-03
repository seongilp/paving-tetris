// 키보드 + 터치 입력. actions = { left, right, rotate, softDrop, hardDrop, togglePause }
const KEY_MAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'rotate',
  KeyZ: 'rotate',
  KeyX: 'rotate',
  ArrowDown: 'softDrop',
  Space: 'hardDrop',
  KeyP: 'togglePause',
};

export function attachKeyboard(target, actions) {
  const onKeyDown = (event) => {
    const name = KEY_MAP[event.code];
    if (!name) return;
    const handler = actions[name];
    if (!handler) return;
    event.preventDefault();
    handler();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

const TAP_MS = 280;
const TAP_SLOP = 14;

export function attachTouch(element, actions, getStep) {
  const state = { active: false, x: 0, y: 0, t: 0, dx: 0, dy: 0, moved: false };

  const reset = (touch) => {
    state.active = true;
    state.x = touch.clientX;
    state.y = touch.clientY;
    state.t = Date.now();
    state.dx = 0;
    state.dy = 0;
    state.moved = false;
  };

  const onStart = (event) => {
    if (event.touches.length !== 1) return;
    reset(event.touches[0]);
  };

  const onMove = (event) => {
    if (!state.active || event.touches.length !== 1) return;
    event.preventDefault();
    const step = Math.max(18, getStep());
    const touch = event.touches[0];
    let dx = touch.clientX - state.x;
    let dy = touch.clientY - state.y;
    state.dx += dx;
    state.dy += dy;

    if (Math.abs(dx) > Math.abs(dy)) {
      while (Math.abs(dx) >= step) {
        const dir = dx > 0 ? 'right' : 'left';
        actions[dir]();
        dx -= Math.sign(dx) * step;
        state.moved = true;
        state.x = touch.clientX - dx;
      }
    } else if (dy >= step) {
      actions.softDrop();
      state.moved = true;
      state.y = touch.clientY;
    }
  };

  const onEnd = () => {
    if (!state.active) return;
    state.active = false;
    const elapsed = Date.now() - state.t;
    const travel = Math.hypot(state.dx, state.dy);
    if (!state.moved && elapsed < TAP_MS && travel < TAP_SLOP) {
      actions.rotate();
      return;
    }
    const step = Math.max(18, getStep());
    if (state.dy > step * 5 && Math.abs(state.dy) > Math.abs(state.dx) * 1.5) actions.hardDrop();
  };

  element.addEventListener('touchstart', onStart, { passive: true });
  element.addEventListener('touchmove', onMove, { passive: false });
  element.addEventListener('touchend', onEnd);
  element.addEventListener('touchcancel', onEnd);
}
