# Viewer video slides (short design)

Status: draft, awaiting approval. Base: `master` (includes PR #180 swipe-seek and #181 viewer fixes; neither is in release v2.3.0).

## Intent
Shadman browses Media on Android. Swiping a photo reaches the next photo, but a video needs a tap to load, and the video player feels heavy. He wants one continuous swipe through photos and videos, with each video shown as its poster and a big play button. Playback starts only on tap.

## Goals
- Swiping left/right in the photo viewer lands on videos as normal slides: poster + big play button.
- Tapping play opens the existing video player on that item.
- Closing the player returns to the same slide in the viewer (not to the grid).
- Video neighbours get their poster warmed like photo neighbours.

## Non-goals
- No change to the video player internals (streaming, tracks, seek/brightness/volume gestures).
- No inline playback inside the slide (possible later, approach B).
- No autoplay on swipe. No backend or Go changes.
- Gallery grid smoothness is a separate follow-up.

## Anti-goals
- A swipe must never start a Telegram range stream by itself.
- Must not break the swipe-to-close, zoom/pan or edge-guard gestures of photo slides.

## Constraints
- Android first; desktop and iOS must not regress (shared frontend).
- Upstream rule: frontend goes through the API adapter; thumbnails through the rendition broker (lease/release), no ad-hoc object URL ownership.
- Fork APK needs its own signing key (cannot install over upstream APK); build runs on GitHub Actions, VPS cannot build Android.

## Approaches
- A (chosen): video slides in the photo viewer, tap hands off to the existing player.
- B: embed the player in the slide. Rejected for now: ~1.9k-line video.ts owns lifecycle; gesture conflict with horizontal seek.
- C: new unified viewer. Rejected: largest rewrite, drifts from upstream.

## Design
1. `gallery.ts` `openGalleryLightbox`: `getNeighbor` returns `previewItem(neighbor)` for videos too (no close+open handoff). `peekNeighbor` returns video neighbours so posters are warmed.
2. `preview.ts`: when the active item is a video, render the poster (thumbnail lease, same path as photo thumbs), hide zoom/pan, show a large centered play button. Never request an original for a video. Tap on button (not on stage) calls the existing video-open path with the same posterUrl and scope.
3. Return path: on player close, reopen the viewer at that item (via the same source). Exact mechanism is the builder's call after reading video.ts close flow.
4. Tests: extend preview/gallery DOM tests (video neighbour is a slide, no stream opened on swipe, tap opens player, close returns).

## Left to the builder
Play-button visuals (use existing theme tokens), poster fallback when a video has no thumbnail, counter/position display for video slides, desktop behaviour (same slide model is fine).

## Gates
`npm test` (Vitest) + `npm run build` in frontend/; ESLint. Android APK via GitHub Actions on the fork before SHIP.
