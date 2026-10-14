# Verification — October 13, 2026

Installed and launched `com.cwallyman.SolidCraftTest` on the connected physical iPad Air 11-inch (M3), iPadOS 27.0. The existing desktop SolidCraft application was not changed.

## Passed on the physical iPad

- The bundled WebAssembly application started without loading the CAD engine over the network.
- WebGL2 rendered the complete built-in sample plate, including its holes, fillets and boss. Screenshots were inspected.
- A real one-finger touch drag in Orbit mode visibly changed the camera. The bridge recorded 23 translated move events. An earlier input-adapter defect was fixed: eframe consumes `pointerdown`/`pointerup` and `mousemove`, rather than `mousedown`/`mouseup`.
- Origin-private storage passed a write/read/remove check.
- A debug-only test control drove the existing engine's palette via DOM pointer, paste and keyboard events: `parameters.change` changed thickness from 8 to 16 mm; `file.save` saved `/opfs/iPad-Test.solidcraft`; `doc.open` reopened it; `file.save` exported `/downloads/iPad-Test.json`.
- The thicker model visibly rebuilt. The native export bridge wrote the JSON to a unique folder in the app's Documents directory and enabled the share button.
- The 9,341-byte exported JSON was copied back from the physical device and parsed. Its thickness parameter was exactly `16 mm`.
- Final physical-device test run: **2 tests, 0 failures**, in `ModelBridgeTests.xcresult`.

## Mac build

The shared application compiled for Mac Catalyst. Xcode's Launch Services registration stalled on this Mac; rerunning with `REGISTER_APP_WITH_LAUNCH_SERVICES=NO` completed successfully. This is a compilation check, not a Mac application interaction test. Signing was disabled for this optional Mac build.

## Coverage boundaries

Pencil precision, pressure and hover, manual soft-keyboard entry into the upstream egui dialogs, native Files imports, STEP/STL exports, force-termination recovery, iCloud sync, large designs and Mac runtime behavior remain unverified. The first attempt to drive the palette with XCTest `typeText` did not enter commands; the successful workflow test uses the actual eframe DOM input events through a debug-only harness. It proves the real engine rebuild/save/export path, not the usability of every on-screen editing dialog.

This remains an offline browser-engine prototype with the upstream desktop layout. It is not a native Rust iOS renderer or a finished App Store release.

## Automatic finger navigation and Pencil selection update

The mode switch was removed. One finger sends orbit input, two fingers send centroid-based pan input, and changes in their distance send pinch zoom. Pencil sends primary-button picking/sketch input. All original touch events are stopped before egui can turn a finger contact into selection. iPad mouse clicks cannot bypass Pencil-only selection; Mac Catalyst retains mouse controls. Finger contacts during a Pencil stroke are ignored. Lifting one finger after pan pauses navigation until all fingers lift.

- `node --test scripts/input-tests.cjs`: **6 tests passed**, covering finger orbit, two-finger pan, pinch, Pencil selection and palm rejection, cancellation/focus loss, and mouse-selection gating.
- `PencilControlsTests.xcresult`: **2 physical-iPad tests passed**. The finger drag and two-finger pinch generated 23 orbit moves, 20 pan moves, 20 zoom events and **zero Pencil strokes**. Rendered screenshots were inspected. Save/reopen/export still passed.
- Real Apple Pencil hardware selection has not been exercised by automation; its pen-event routing is covered by the input regression tests.

## Evidence

## Finger interface, view buttons and browser update

The app now uses a locally compiled web target, based on upstream commit `2bb24d1`, with a touch-specific layout enabled by the Apple shell. Orbit, spin, pan, zoom and Home were removed from the lower floating navigation bar. The five remaining controls (Fit, Look At, projection, visual style and settings) use 40-point hit rectangles in a 44-point grid at the upper right; the orientation widget is below them.

Finger UI input is classified by the actual egui viewport, controls, divider, and floating-window/menu layers. Finger presses on the interface become primary-button input; finger input in model space remains navigation or double-tap view alignment. The browser divider is resizable, with an enlarged grab radius. The folder B toggle collapses to a 52-point rail and reopens to the retained width. Width and collapse state are included in saved preferences.

Double-tap face alignment preserves the engine's selection. Planar faces use their exact normal; curved faces use the nearest rendered triangle's normal at the hit. The camera switches to orthographic and looks normal to the face. The host action explicitly requests a repaint, including when the web painter is idle.

Validation:

- `node --test scripts/input-tests.cjs`: **12 passed**, including interface taps/drags and finger double-tap alignment without primary selection events.
- Native Rust UI tests (`cargo test --profile ci -p solidcraft-ui-egui apple_touch`): **4 passed**, covering view-control placement/hit testing, exact planar alignment without changing selection, real resize/collapse/reopen input, and preference restoration.
- `TouchInterfaceVerifiedTests.xcresult`: **3 physical-iPad tests passed**. This covers runtime/storage and navigation, finger browser resize/collapse/reopen, view-settings and toolbar taps, double-tap overhead view without selection, and parametric save/reopen/export. Captured screenshots were inspected.
- Source-built wasm target and signed iPad application built successfully. The current bundle's hashes and source revision are in `Web/asset-manifest.json`; the original downloaded build is backed up separately.
- Repository format, asset attribution, licence inventory and dependency-layer checks passed. Full upstream `cargo xtask ci` stopped at an existing `nonminimal_bool` lint in `crates/sketch/src/solver.rs:1937`. The UI-only strict Clippy check also exposed existing lints in `canvas.rs:221` and `issue_report.rs:478`; the newly introduced viewport expression was corrected. Full repository CI is therefore **not claimed to pass**, and no upstream commit or PR was published.
- Xcode initially timed out while enabling automation mode. Direct app installation followed by serialized UI testing (`-parallel-testing-enabled NO`) worked. A test assumption about default UI scaling was corrected for the device's 1.35 scale.

For the reported orientation nudge on two-finger contact, navigation now consumes cursor relocation in a released-button frame before pressing the navigation button. One-finger orbit starts only after 100 ms and 6 points of movement; a second contact before commitment cancels orbit intent and begins pan. Nine input regression tests passed, including staggered contacts with early movement, resting jitter, and released-button processing of centroid relocation. `StableGestureTests.xcresult` passed both physical-iPad runtime/navigation and model save/export tests. `ContactOrientationTests.xcresult` also passed: the orientation-widget pixels were identical before and after the first finger landed, followed by successful orbit/pan/pinch checks. XCTest's two-finger-tap APIs failed canvas hit testing before sending that specific gesture; staggered second-contact behavior is covered by the input regression tests.

The native top bar was subsequently removed entirely, including its title, control legend, status, share and help buttons. `NoBarTests.xcresult` passed both physical-iPad runtime/navigation and model workflow tests. The screenshot was inspected to confirm the CAD interface begins immediately beneath the system status area. Runtime diagnostics remain in Documents and the web view's accessibility value; exports remain available through Files.

- `ModelBridgeTests.xcresult`: passing physical-device tests and screenshots.
- `verification/model-final/`: exported screenshots and runtime diagnostic.
- `verification/device-documents/`: the exported public sample and runtime record copied from the app's own sandbox.
- `Web/asset-manifest.json`: original asset URLs and SHA-256 hashes.

## Native Files and restored Home — October 13 evening

Restored Home as a sixth 40-point navigation button. Apple Open bypasses the OPFS browser panel; Open and Insert present UIDocumentPickerViewController for Files/iCloud providers, read a copy with security-scoped access, and return it to the existing engine file pipeline. Imports have a 128 MB host limit; picker cancellation does not report an error. Separate host Insert service preserves insertion intent. ASCII DXF and SVG selections use existing sketch import commands (active sketch, or a new XY sketch); DWG gives a DXF conversion message. Desktop fallback remains available.

Local wasm release and signed iOS build passed; installed and relaunched on Sniglefritz Sr. Input tests: 12 passed. Rust apple_touch tests: 4 passed. Engine sketch_import round-trip test: 1 passed. Physical focused Home/native-picker test passed (NativeFilesFocusedTests.xcresult); native picker screenshot also observed in NativeFilesRetryTests.xcresult. No real user drawing was imported during verification.

The broader physical touch-interface retry failed its overhead-face pitch assertion with a curved-face-like orientation; its picker/Home steps succeeded. The initial test runner was interrupted before tests began. Do not claim the complete physical suite passed for this revision. Previous upstream full CI lint limitations remain.

## DXF Insert and native handle fix — October 13

Fixed “not a file”: native getFile handles are structural JavaScript objects; requiring instanceof FileSystemFileHandle rejected them before reading. The picker now validates name/getFile, awaits an actual File, checks its byte limit, and feeds bytes through the existing importer. Added Insert DXF and Insert SVG to SOLID INSERT through the existing shared-panel command list.

Signed iPad build and install succeeded. Physical test DXFPickerEndToEndTests.xcresult passed: finger opens SOLID INSERT, selects Insert DXF, selects our 152-byte four-line rectangle from native Files, and verifies active sketch creation. Screenshot inspected: four editable sketch edges visible, “Insert DXF done”, no file error. Four Rust apple_touch regression tests passed. Earlier UI automation attempts failed locating our fixture because Files restored the user's last browsing location; the debug-only ui-test launch now sets picker.directoryURL to the app Documents directory. Normal launches retain user browsing behavior.

Evidence: verification/dxf-picker-success/A264CBB0-9606-4AF1-AF9A-007688894785.png (Insert menu) and A3517A9E-A681-494E-AF1E-5B9257967E87.png (imported sketch). DWG remains unsupported. Remote HEAD checked: eea49922bdab85755775edf382f8e8422d2113a1; no upstream integration, commit or PR performed.

## Large DXF import — October 13

Diagnosed the supplied 4.5 MB drawing: 42,683 supported geometric entities (38,853 lines, 141 arcs, 3,689 standalone points), 16 layers, and 197 unsupported HATCH entities. Previous one-sketch import exceeded MAX_POINTS=20,000. Original source was read without modification; only a byte-for-byte copy was placed in the iPad app Documents for testing. No drawing contents were added to source control or published.

Large DXF imports now retain layer grouping and split oversized layers into editable parts bounded at 8,000 points including the origin (up to 256 parts). Units, coordinates and the active sketch plane are preserved. Every supported curve is retained; curve insertion errors now propagate instead of silently dropping geometry. One undo removes the full import. Import results report part counts and unsupported entity types, plus the limitation that profiles crossing parts must be joined before extrusion. Small DXF imports keep their original order and single-sketch behavior. Legacy POLYLINE vertices remain in their parent's layer; block geometry groups by the top-level insertion layer.

Verification: two engine sketch-import tests passed, including a 22,000-point import with plane preservation, visibility and atomic undo; three IO DXF tests passed. Actual-file engine import completed in about one second on Mac: 38,994 curves, 44,037 stored points, 23 sketches. Local release WASM and signed iPad build/install passed. Physical LargeDXFDeviceTests.xcresult passed: native Files selects the supplied drawing, live engine state confirms 38,994 curves in 23 parts, settings still open/close. Actual screenshot inspected (kept local in verification/large-dxf-device/927FA4EF-DF55-4343-84DC-AB221D005A9B.png). This confirms the import and responsiveness, not full CAD fidelity of every source entity: HATCH remains unsupported.

An initial synthetic regression expected 8,000 new points but omitted each sketch's origin; the point budget/test was corrected and rerun successfully. Upstream HEAD checked: 2dcfea8df7278e498dd15217fbf45daa93d1dd5e. No upstream integration, commit, push or PR was performed; prior baseline CI lint limitations remain.

## Faceted mesh conversion — October 13 late evening

Added a Faceted method alongside existing Prismatic conversion. It welds nearly coincident vertices, removes duplicate triangles, separates edge-touching closed shells, normalizes shell winding, merges coplanar facets and creates separate CAD bodies under one timeline feature. Input is bounded to 5,000 triangles and 256 shells. Open/non-manifold shells and potential nested inward cavity shells are refused; parts are not fused and holes are not filled.

The supplied STL has 1,100 triangles, 24 duplicate triangles and 40 four-use edges before repair. Faceted conversion produced 38 valid CAD bodies and 436 faces. Cold design reopening preserved the result. STEP export contains 38 independent manifold solids and no void-body records; reimport returned 38 valid bodies without warnings. The sum of outward-shell volumes was 216.36805509063853 mm³, matching the repaired mesh shell sum, not a Boolean union volume. Original STL bytes were only read; device testing used a separately named copy.

Four final kernel tests, five final engine conversion tests (including actual-file conversion/export/reimport), and 12 JavaScript input tests passed. Final source-built web release, signed iPad build, install and launch passed. The user confirmed conversion works on the installed iPad app.

Device automation did not establish a passing conversion test: recovery/picker state blocked those runs. An existing recovery read returned “design file is not UTF-8 JSON”; the original pending recovery document was not proven restored. Experimental mesh-specific test hooks were removed, and device testing stopped when the user confirmed success. Full CI remains blocked by pre-existing strict lints in sketch solver and coplanar kernel code. Remote HEAD checked: 15b5b51bf5cf51d33d337bc3a4f6e294b8857ece; no upstream commit, integration, push or PR.

Details and the generated STEP are in `verification/mesh-conversion/`. The main implementation handoff has been extended with the new conversion method.


## Pencil, mouse and toolbar interactions — October 14, 2026

Final installed behavior:

- Pencil hover displays button-name tooltips. The first implementation failed in hands-on use; simultaneous gesture recognition, shared pen/native hover routing, cursor stabilization and compatibility-event handling corrected it. The user then confirmed “works now.”
- Create, Modify and other panel dropdowns close on a second click/tap, including collapsed panel triggers.
- Sketch press-and-drag places the start at the press origin, previews while held, and places the next point on release. Two-point shapes complete; multi-point tools retain their remaining stages. Ordinary point-by-point input remains available.
- “Click” means mouse and “tap” means Pencil. Pencil taps add or toggle individual sketch lines, edges and faces; an empty-space tap clears the selection. Mouse clicks replace selection; Shift-click adds/removes. Mouse model selection now works on iPad. Source identification does not emulate Shift and ignored palm events do not reset active Pencil input.
- Removed the B text overlay from the browser folder toggle.

Verification: two dropdown tests passed; three sketch drawing/undo/multi-point regressions passed and were rerun successfully after source changes; two final Pencil-selection tests passed, including edge/face toggling, empty-space clearing and mouse/Shift behavior. JavaScript input routing reached 16 passing tests; the hover-correction revision had 14 passing tests. The full current JavaScript output is retained in `2026-10-14-interactions/final-input-tests.log`.

WASM release builds, signed iPad builds, installation and launch succeeded. Final delivery is the folder-icon revision with all prior interaction changes. The attempted physical startup UI test failed to initialize with “Authentication canceled”; no automated device UI or screenshot pass is claimed for this session. Hover has explicit user confirmation; the other latest interactions still need explicit hands-on confirmation. No full CI rerun, upstream publication or App Store release occurred.

Retained evidence is in `2026-10-14-interactions/`. See `../IPAD_APP_IMPLEMENTATION.md` section 20 for the complete behavior, source map, correction history and limitations. These results supersede older descriptions of gated iPad mouse selection, non-toggling Pencil selection and the folder B overlay.


## GitHub checkpoint checks — October 14, 2026

Ran `cargo fmt --all`, then `cargo xtask ci` before committing the project as `cwallyman/ipad-solidcraft`. Formatting, assets (42 attributed files), license inventory and dependency layers passed. Strict Clippy stopped on existing `nonminimal_bool` findings in the sketch solver and coplanar kernel. Full CI therefore remains incomplete; this checkpoint does not claim a fresh device UI pass or App Store release. See the root README for subtree update instructions and excluded local artifacts.


## Physical-iPad screenshots — October 14, 2026 afternoon

`RuntimeTests/testFingerInterfaceBrowserResizeCollapseAndFaceAlignment` passed on the physical iPad with zero failures in approximately 18 seconds. Its native screenshot attachments show the browser resized, collapsed to the plain folder icon, view settings and face-normal alignment. This is a focused pass, not a complete device-suite pass; the earlier authentication-canceled attempt remains a separate failed attempt.

Twelve reviewed PNGs are committed at `../../docs/screenshots/ipad/2026-10-14/`, with a gallery at `../../docs/screenshots/ipad/README.md`. Additional native device screenshots use a temporary DEBUG workflow fixture and injected input to show hover, dropdown open/close, face selection (two selected then one), and sketch rectangle preview/completion. They show the actual local engine renderer on the device but do not independently validate physical Pencil contact/hover hardware. Only the public sample and demonstration sketch are included.

Unsuccessful sketch-selection capture attempts were excluded after visual review because the line tool remained active. Device lock prevented additional retakes; no screenshot claim is made for those attempts. Temporary fixture code was removed from the app source. The normal signed app build was restored after capture. Full repository CI remains subject to the previously documented Clippy limitations.
