# Learnings

Non-obvious discoveries that cost time once. Newest first.

## 2026-10-22: lightbox exit motion (`lightbox-animate`)

- **An `inert` overlay is click-through.** Browsers skip inert nodes when hit-testing (as if `pointer-events: none`), so making the whole `.regive-lightbox` inert while its exit motion plays would let clicks land on the host page behind it. During `closing`, only the dialog's children (close button and `.regive-container`, which carries the iframe) get `inert`. The backdrop stays hit-testable and focus is parked on the dialog itself (`src/lib/regive-lightbox.ts`, `beginClose`).
- **jsdom queues a 0ms timer whenever focus moves.** Its Selection implementation schedules a `selectionchange` task (`node_modules/jsdom/lib/jsdom/living/selection/Selection-impl.js`, `_associateRange`), so `vi.getTimerCount()` is never 0 right after Regive restores focus. Flush zero-delay tasks first (`pendingTimers()` in `tests/unit/regive-lightbox-animation.test.ts`) before asserting that no Regive timer survived.
