# Viewer Video Slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution here: Cody briefs `agy` one task per run, serially; Cody reviews the diff, runs the gates and commits.

**Goal:** Swiping in the photo viewer lands on videos as slides (poster + big play button); tapping play opens the existing player; closing the player returns to the same slide.

**Architecture:** `gallery.ts` stops closing the viewer when a neighbour is a video and returns it as a normal navigation item. `preview.ts` renders a video item as its thumbnail with a play button and never opens an original. Play calls a new optional `playVideo` on the navigation source, which hands off to `openVideoModal` and reopens the viewer when the player closes (new one-shot close hook in `video.ts`).

**Tech Stack:** Svelte 5, TypeScript, Vite, Vitest (jsdom DOM tests). Frontend only; no Go or bindings changes.

**Spec:** `docs/superpowers/specs/2026-11-25-viewer-video-slides-design.md`

## Global Constraints

- Work in `/root/src/TDrive/frontend` on branch `custom/viewer-video-slides`. Do NOT push, do NOT touch `master`, no Go/bindings edits, no new dependencies.
- A swipe must never call `openOriginalImage` or `openVideoModal` for a video. Only the play button does.
- Photo behaviour (zoom/pan, swipe-to-close, edge guard, original streaming) is unchanged.
- Thumbnails only through `acquireRendition(...,'viewer')` leases; do not create object URLs.
- Gates (run by Cody, not the implementer): `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Implementer cannot run commands; edit files only. Cody runs tests and commits.

## Review Focus

- Video is the first or last item in the list: Next/Prev disabled correctly, no crash.
- Run of consecutive videos: each is its own slide, no dead end.
- Video without a thumbnail: slide still shows the play button on the empty frame, no error banner.
- Encrypted video with no remembered password: locked state, not a play button that fails.
- Player closed via Android back or swipe-down: viewer reopens on the same item; closing the viewer afterwards does not reopen anything.
- Opening the player from the grid (not from the viewer): closing it must NOT open the viewer.

---

### Task 1: One-shot close hook in the video modal

**Files:**
- Modify: `frontend/src/modules/modals/video.ts` (near `closeVideoModal`, ~line 1411)
- Test: `frontend/src/modules/modals/video.dom.test.ts` (add one case; follow existing setup in that file)

**Interfaces:**
- Produces: `export function onNextVideoModalClose(handler: (() => void) | null): void` — stores one handler; `closeVideoModal()` calls it once after the modal is fully hidden (after `releaseActive`) and clears it. Passing `null` clears. Opening a new video via `openVideoModal` does NOT clear it. If `closeVideoModal` returns early because a newer transition superseded it, the handler is not called.

- [ ] **Step 1: Write failing test** `calls the registered handler once after close, then not again`: register a spy, open then close the modal, assert spy called once; open and close again, assert still once.
- [ ] **Step 2: Run** `npx vitest run src/modules/modals/video.dom.test.ts -t "registered handler"`. Expected: FAIL (export missing).
- [ ] **Step 3: Implement** `onNextVideoModalClose` in `video.ts`: module-level `let closeHandler: (() => void) | null`; invoke-and-clear at the end of `closeVideoModal` inside the same `isCurrent` guard that precedes `clearError()`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(video): one-shot close hook for the video modal`.

### Task 2: Video slide rendering in the photo viewer

**Files:**
- Modify: `frontend/src/ui/preview/PreviewModal.svelte` (add button inside `#preview-stage`)
- Modify: `frontend/src/modules/modals/preview-elements.ts` (add optional `playButton`)
- Modify: `frontend/src/modules/modals/preview.ts` (`loadPreview`, `PreviewNavigationSource`, play handler, cleanup)
- Modify: `frontend/src/styles/` (add rule for `.preview-play`; find the file that holds `.preview-nav` and put it beside it; use existing theme tokens)
- Test: new `frontend/src/modules/modals/preview-video-slide.dom.test.ts` (model setup on `preview-renditions.dom.test.ts`)

**Interfaces:**
- Consumes: `isVideoFile(name: string): boolean` from `../media-types`.
- Produces:
  - `PreviewNavigationSource.playVideo?(item: PreviewNavigationItem): void`
  - `PreviewElements.playButton: HTMLButtonElement | null` (selector `#preview-play`, nullable so old markup still validates)
  - Behaviour: in `loadPreview`, when `isVideoFile(target.name)`: acquire the thumbnail lease and show it as today, call `warmNeighbors`, do NOT call `acquireOriginalViewerBudget` or `openOriginalImage`, hide the loading bar, un-hide `#preview-play` and set `modal.classList.add('is-video-slide')`. For any non-video item hide the button and remove the class. Clicking the button calls `navSource?.playVideo?.(activePreviewItem)`; if the source has no `playVideo`, the button stays hidden. Zoom/pan reset and disabled for video slides. Button `aria-label="Play video"`; encrypted-and-locked items take the existing locked path instead of showing the button. `closePreviewModal` hides the button and removes the class.

- [ ] **Step 1: Write failing tests** in the new file:
  - `video item shows play button and never opens an original`: open a source whose item is `clip.mp4`; assert `#preview-play` visible, `openOriginalImage` mock not called, `closeMedia` not called.
  - `photo item hides play button`.
  - `play button calls source.playVideo with the active item`.
  - `video without thumbnail still shows the play button and no error`.
  - `moving from a video slide to a photo hides the button and loads the original`.
- [ ] **Step 2: Run** `npx vitest run src/modules/modals/preview-video-slide.dom.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** markup, elements entry, loadPreview branch and click handler as specified; style the button as a large centered circular control (min 72px touch target) using existing tokens.
- [ ] **Step 4: Run** the new test file plus `preview-elements.dom.test.ts`, `preview.lifecycle.dom.test.ts`, `preview-renditions.dom.test.ts`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(preview): video slide with poster and play button`.

### Task 3: Gallery wiring (neighbours, play, return)

**Files:**
- Modify: `frontend/src/modules/gallery.ts` (`openGalleryLightbox` ~line 445–483, `openGalleryVideo` ~line 420)
- Test: `frontend/src/ui/gallery/gallery-module.dom.test.ts` (extend; follow its mocks for preview and video modules)

**Interfaces:**
- Consumes: `onNextVideoModalClose` (Task 1), `PreviewNavigationSource.playVideo` (Task 2), existing `previewItem(item, channelId)`.
- Produces (inside `openGalleryLightbox`): `getNeighbor` returns `previewItem(neighbor, channelId)` for every neighbour including videos (delete the `closePreviewModal` + `openGalleryVideo` branch); `peekNeighbor` returns video neighbours too (drop the `!isVideoFile` filter); new `playVideo(active)` which resolves the `GalleryItem` for `active.id`, registers `onNextVideoModalClose(() => reopen)`, calls `preview.closePreviewModal()` then `openGalleryVideo(item)`, where `reopen` re-runs `openGalleryLightbox(item)` only if `currentChannelId` still equals the captured `channelId`.
- `openGalleryItem` for a video tapped in the grid is UNCHANGED (opens the player directly, registers no close hook).

- [ ] **Step 1: Write failing tests**:
  - `swiping into a video returns a navigation item and does not open the player`.
  - `peekNeighbor returns the video neighbour`.
  - `playVideo closes the viewer, opens the player and reopens the viewer on the same item after close`.
  - `closing a player opened from the grid does not reopen the viewer`.
  - `reopen is skipped when the channel changed while the player was open`.
- [ ] **Step 2: Run** `npx vitest run src/ui/gallery/gallery-module.dom.test.ts`. Expected: FAIL on the new cases only.
- [ ] **Step 3: Implement** the changes above in `gallery.ts`; if `source.get`/`indexOf` cannot resolve `active.id` to a `GalleryItem`, `playVideo` does nothing.
- [ ] **Step 4: Run** the same file plus `npx vitest run src/ui/gallery`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gallery): swipe into videos, play on tap, return to viewer`.

### Task 4: Full gate and fork-readiness note

**Files:**
- Modify: `docs/superpowers/specs/2026-11-25-viewer-video-slides-design.md` (append a "Verified" section with the gate output summary)

- [ ] **Step 1 (Cody):** run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` in `frontend/`. Expected: all green, or failures identical to a baseline run on the base commit (recorded before Task 1).
- [ ] **Step 2 (Cody):** review `git diff master...` for scope (only files listed above plus tests/styles), secret scan, then local commit.
- [ ] **Step 3 (Cody):** report to Shadman; APK build and any push need his ok (fork + signing key decision).
