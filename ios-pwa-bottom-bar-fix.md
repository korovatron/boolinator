# iOS PWA Intermittent Bottom Bar Fix

## The Problem

When the app opens in full-screen PWA mode on iPhone, there is sometimes a bar
across the bottom of the screen. It is intermittent — sometimes present,
sometimes not. Rotating to landscape and back to portrait makes it disappear.

This is caused by a race condition: iOS does not always have the
`safe-area-inset-*` values ready at the moment the app launches. The app
calculates its height too early, gets an incorrect value, and renders with a
gap at the bottom. When you rotate and rotate back, iOS recalculates everything
and the correct height is used.

There is also a secondary bug: in PWA/standalone mode, iOS incorrectly
**subtracts** `safe-area-inset-top` from `window.innerHeight`, making the
reported height about 59px too short on iPhone (32px on iPad). This leaves the
gap at the bottom.

---

## How It Was Fixed in Graphiti

The fix lives in the `fixIOSViewportBug()` method in `main.js`, which is called
from the constructor as the very first thing.

### The CSS side

`html`, `body`, and `#app-container` all use `var(--actual-vh, 100vh)` instead
of `100vh` directly:

```css
html, body {
    height: var(--actual-vh, 100vh);
}

#app-container {
    height: var(--actual-vh, 100vh);
}
```

This means the JavaScript can set the correct height at runtime instead of
relying on the browser's `100vh` calculation.

### The JavaScript side (`fixIOSViewportBug()`)

```js
fixIOSViewportBug() {
    let lastKnownHeight = 0;

    const setActualViewportHeight = () => {
        // 1. Use visualViewport API when available (more reliable than innerHeight on iOS)
        let viewportHeight = window.innerHeight;
        if (window.visualViewport && window.visualViewport.height) {
            viewportHeight = window.visualViewport.height;
        }

        // 2. Detect PWA mode (bug only occurs in PWA, not Safari browser)
        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: fullscreen)').matches ||
                      window.navigator.standalone === true;

        // 3. Portrait mode compensation (iPhone & iPad)
        const isPortrait = window.innerHeight > window.innerWidth;

        if (isPWA && isPortrait) {
            // iOS subtracts safe-area-inset-top from innerHeight incorrectly
            // Compare actual viewport with expected screen height
            const screenPortraitHeight = Math.max(window.screen.height, window.screen.width);
            const difference = screenPortraitHeight - viewportHeight;

            // iPhone diff ~59px, iPad diff ~32px - use 15px threshold
            if (difference > 15) {
                const computedStyle = getComputedStyle(document.documentElement);
                const safeTop = computedStyle.getPropertyValue('--safe-area-top');
                const safeTopPx = parseInt(safeTop) || 0;

                if (safeTopPx > 0) {
                    viewportHeight += safeTopPx;
                }
            }
        }
        // Landscape mode: skip compensation - CSS env() handles it automatically

        // Set the CSS custom property used by html/body/#app-container
        document.documentElement.style.setProperty('--actual-vh', `${viewportHeight}px`);

        // If height changed significantly, trigger a resize to update canvas layout
        if (lastKnownHeight > 0 && Math.abs(viewportHeight - lastKnownHeight) > 30) {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);
        }

        lastKnownHeight = viewportHeight;
    };

    // Run immediately, then stagger multiple attempts because iOS doesn't
    // always have safe-area values ready right away on launch
    setActualViewportHeight();
    setTimeout(setActualViewportHeight, 50);
    setTimeout(setActualViewportHeight, 150);
    setTimeout(setActualViewportHeight, 300);
    setTimeout(setActualViewportHeight, 500);
    setTimeout(setActualViewportHeight, 800);
    setTimeout(setActualViewportHeight, 1200);

    // Keep it updated on resize and orientation change
    window.addEventListener('resize', setActualViewportHeight);
    window.addEventListener('orientationchange', () => {
        setTimeout(setActualViewportHeight, 100);
        setTimeout(setActualViewportHeight, 300);
    });

    // visualViewport is more reliable in PWA mode
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setActualViewportHeight);
    }

    // Re-run when app comes back from background (handles app-switching on iOS)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(setActualViewportHeight, 50);
            setTimeout(setActualViewportHeight, 200);
        }
    });
}
```

### Key points for the fix to work

1. **Call `fixIOSViewportBug()` first** — in Graphiti it is literally the first
   line of the constructor, before anything else runs.

2. **Use `var(--actual-vh, 100vh)`** for every element that needs to fill the
   full screen height. The fallback `100vh` ensures desktop browsers still work.

3. **The safe-area-top CSS variable must exist.** In Graphiti's `index.html`:
   ```css
   :root {
       --safe-area-top: env(safe-area-inset-top);
       --safe-area-bottom: env(safe-area-inset-bottom);
       /* etc. */
   }
   ```

4. **The viewport meta tag must include `viewport-fit=cover`:**
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0,
       maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
   ```
   Without this, `env(safe-area-inset-*)` returns zero on iOS.

5. **The Apple PWA meta tags must be present:**
   ```html
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
   ```
   `black-translucent` is important — it tells iOS to draw behind the status bar
   and notch, which is what causes the safe-area behaviour in the first place.

---

## Why the staggered timeouts?

iOS calculates `env(safe-area-inset-top)` asynchronously after launch. If you
read it too early you get `0`, which means the height compensation does nothing,
and you get the gap. Running at 50ms, 150ms, 300ms, 500ms, 800ms, 1200ms covers
all the devices/conditions seen in testing — some are fast, some slow. The
`lastKnownHeight` guard triggers a resize event only when the value actually
changes significantly (>30px), so there is no visual flicker on devices where
the first read is already correct.

---

## Relevant git commits in Graphiti (oldest → newest)

| Commit    | Description |
|-----------|-------------|
| `06a008b` | Original JS fix — `setActualViewportHeight()` + `--actual-vh` CSS var |
| `c0ae93b` | Added `void document.body.offsetHeight` reflow trick + `visibilitychange` handler for app-switching |
| `9dec2be` | Comprehensive rewrite ported from Mandelscope — portrait-mode safe-area-top compensation, staggered timeouts up to 1200ms, `visualViewport` listener |
| `bb2210f` | Added `(display-mode: fullscreen)` to PWA detection (iOS can use either) |
