**YT-DL Studio — project audit, 20 September 2026**

Reviewed commit `ade2c6c` and the current working tree. This was an analysis exercise; application source was not changed. The pre-existing untracked `web/src/assets/hero.png` was left untouched. Temporary Go probes were removed after execution. The production frontend build regenerated ignored `web/dist` assets.

The project has a useful separation between handlers, command construction, workers, progress storage, and presentation. Its principal problems are incomplete integration between those layers, overstated security guarantees, and missing end-to-end tests. Passing unit tests do not establish that the advertised download workflows work.

Priorities below mean **P1: fix before relying on the affected workflow or security boundary**, **P2: substantive correctness/reliability issue**, and **P3: lower-priority usability or maintenance issue**. Reproduced means a local executable probe demonstrated the behavior. Code-confirmed means the relevant execution path was traced, but the complete user scenario was not run.

**Validation and limits**

| Check | Result |
| --- | --- |
| Existing Go tests | Passed again uncached with coverage, in the working tree with built frontend assets |
| Go static analysis | `go vet ./...` passed outside the restricted sandbox |
| Frontend production build | Passed; main JavaScript bundle approximately 1.324 MB, 370 KB gzip |
| Frontend lint | Passed |
| Root and frontend npm audits | Both reported zero advisories |
| Official Go vulnerability checker | Three symbol-level standard-library advisories under installed Go 1.26.5; detailed below |
| Go race detector | Could not run: CGO was disabled; enabling it revealed that `gcc` is not installed |
| Clean tracked-source export | Go tests/build setup failed because `web/dist/*` did not exist |
| Targeted audit probes | Reproduced request-boundary, settings, directory, cancellation, output-limit, and progress defects |
| Installed yt-dlp | 2026.08.19; exercised its actual template renderer, subtitle selection, format selector, and metadata parser offline |

No real media was downloaded, no external exploitation was attempted, and no Linux/macOS runtime or full interactive browser session was tested. Browser private-network restrictions may affect exploitability of cross-origin attacks; they do not provide a server-side authorization boundary. Dependency audit results describe the databases and versions available at audit time.

**1. [P1] Foreign-origin state-changing requests are accepted; Host is unchecked — reproduced.**

[Router](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/router.go:39), [download handler](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_download.go:18).

A request with `Origin: https://untrusted.example`, `Content-Type: text/plain`, and a JSON download body returned HTTP 202 and inserted a job. A request using an untrusted Host also returned HTTP 200. The CORS middleware omits response permissions for disallowed origins but still invokes the handler; it does not reject the action. The handler accepts JSON regardless of content type. This creates a CSRF risk for a local service, with missing Host validation also leaving a DNS-rebinding defense absent. The test proves server behavior, not exploitation in every browser.

Reject untrusted Origin/Host values before handlers execute, require the expected request content type, and establish a local-session token or equivalent request authorization. Derive legitimate origins from the configured address rather than only fixed ports. The dependency's own [CORS implementation](https://github.com/go-chi/cors/blob/master/cors.go) confirms that actual requests continue through the handler chain.

**2. [P1] Private-URL blocking covers only the submitted URL — code-confirmed, secondary-URL mechanism reproduced.**

[URL validation](C:/Users/movva/Documents/GitHub/yt-dls/internal/validation/validation.go:117), [metadata option](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:231), [secondary endpoint options](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:345).

Go resolves the initial hostname, then gives the original URL to another process that resolves it again. Redirects, extractor-selected URLs, and later DNS changes are not checked. Moreover, unrestricted `parseMetadata` can populate `additional_urls`: using the real CLI parser, `title:%(additional_urls)s` copied a synthetic media title containing a loopback URL into that field. An attacker-controlled public media page can supply such metadata. Custom SponsorBlock and proxy endpoints also bypass the initial target check. Thus `ALLOW_PRIVATE_URLS=false` is not an effective process-wide network policy. No private endpoint was contacted during this audit.

Restrict metadata transformations capable of changing network targets and validate configurable endpoints. A reliable restriction over redirects and extractor traffic needs enforcement at the downloader's connection layer or an egress policy, not just another initial DNS lookup. yt-dlp documents that [metadata can request additional downloads](https://github.com/yt-dlp/yt-dlp#modifying-metadata).

**3. [P1] Dangerous opt-ins can be combined with a public bind address — code-confirmed.**

[Configuration loading](C:/Users/movva/Documents/GitHub/yt-dls/internal/config/config.go:69), [command execution option](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:498), [server bind](C:/Users/movva/Documents/GitHub/yt-dls/cmd/server/main.go:64).

The README says these combinations are refused, but configuration returns without checking them. `HOST=0.0.0.0` together with `ALLOW_DANGEROUS_OPTIONS=true` exposes an unauthenticated API that permits `--exec` and other powerful options. This requires an unsafe operator configuration; those options are off by default.

Reject non-loopback binds when these opt-ins are enabled, or require an explicit authenticated deployment design. Make the README describe the actual enforced rule.

**4. [P1] Metadata extraction has no output cap or concurrency limit — output cap reproduced.**

[Metadata subprocess](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:62), [output collection](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:91).

A helper emitting more than the documented 16 MiB metadata limit received HTTP 200. `cmd.Output()` buffers all stdout, then JSON decoding allocates more memory. Each `/info` request starts another process outside the download pool. Neither `INFO_MAX_OUTPUT_BYTES` nor the two documented request-rate settings are implemented. Large playlists or concurrent metadata requests can exhaust memory/process resources even though download concurrency is bounded.

Use bounded output collection, stop the child when the cap is reached, and apply a separate metadata concurrency limit and admission policy. Treat configured limits as real configuration fields and test their enforcement.

**5. [P1] A fresh install cannot download until its output folder already exists — reproduced.**

[Worker startup](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/worker.go:79), [directory resolution](C:/Users/movva/Documents/GitHub/yt-dls/internal/config/config.go:89).

The worker sets `cmd.Dir` to the download directory before starting yt-dlp. Nothing creates it. A fresh temporary destination failed immediately with `The directory name is invalid`. yt-dlp cannot create its output directory because the operating system refuses to start it in that missing working directory. The repository's existing ignored `downloads` folder hides the defect during development.

Create and validate the output directory before spawning the process; report permission errors early.

**6. [P1] Saving even untouched advanced settings breaks subsequent downloads — reproduced.**

[Settings defaults](C:/Users/movva/Documents/GitHub/yt-dls/web/src/pages/Settings.jsx:5), [change handler](C:/Users/movva/Documents/GitHub/yt-dls/web/src/pages/Settings.jsx:53), [Go request types](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:51).

The UI persists `socket-timeout` and `extractor-retries` as strings, initially empty strings. Go expects `*int`. Sending the untouched saved values returned HTTP 400 with `Invalid JSON payload`; entering a number still produces a string. Users can therefore download initially and then break downloads merely by pressing Save All Settings.

Normalize numeric fields to numbers and omit empty values at the API boundary; migrate existing saved values. Return field-specific validation errors. Go's [JSON decoder](https://pkg.go.dev/encoding/json#Unmarshal) does not ordinarily accept a JSON string into an integer field.

**7. [P1] Cancellation and hard timeouts do not terminate the process tree — reproduced.**

[Worker cancellation and pipe wait](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/worker.go:74), [Windows process setup](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/proc_windows.go:11), [Unix process setup](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/proc_unix.go:8).

With a 150 ms deadline, a synthetic downloader spawning a child that inherited its pipes kept the worker blocked for 2.21 seconds, until that child exited. Only the immediate process is killed. Real FFmpeg/runtime descendants may continue writing or hold pipes open; `readerWg.Wait()` then blocks the worker and potentially `Pool.Stop()` indefinitely. This undermines both cancellation and the configured maximum duration.

Manage the whole process tree using appropriate platform mechanisms and ensure pipe reads are bounded during cancellation. Preserve the documented pipe-read ordering while designing that cleanup; adding a wait delay without addressing the earlier reader wait is insufficient. Go documents both the [default CommandContext kill behavior and inherited-pipe waits](https://pkg.go.dev/os/exec#Cmd).

**8. [P2] Progress fallbacks generate invalid JSON when string metadata is absent — reproduced with yt-dlp.**

[Progress template](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:25).

The installed yt-dlp rendered absent codec values as `"vcodec":none,"acodec":none`, and an absent format ID as `"format_id":` with no value. Both are invalid JSON. Numeric fallback literals worked, but the string fallbacks are not JSON-quoted. Such progress is discarded by `HandleProgress`, so generic/extractor-dependent downloads may appear stalled until completion. Current tests feed hand-written valid JSON rather than evaluating the real template.

Use valid JSON fallback literals, or emit a structured object that tolerates absent fields. Test the actual template with missing fields and a supported yt-dlp installation. Relevant upstream contract: [output templates](https://github.com/yt-dlp/yt-dlp#output-template).

**9. [P2] Recoverable stderr retries are marked terminal failures — reproduced.**

[Error matching](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/worker.go:18), [status mutation](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/worker.go:202), [polling termination](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/downloads/useDownloads.js:49).

A normal-looking `HTTP Error 503 ... Retrying (1/3)` message immediately set status to `failed` while the process could still run. The frontend stops polling terminal jobs, so it can miss later recovery or successful completion. Stderr matching is also broad enough to match unrelated text containing one of the phrases.

Keep retry diagnostics in the log and derive terminal state from process completion or an explicit, trustworthy terminal signal. Avoid removing a job from tracking while the process is alive.

**10. [P2] The global 60-second deadline defeats the default 120-second metadata timeout — code-confirmed.**

[Global middleware](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/router.go:37), [metadata child context](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:63).

The metadata context inherits the earlier router deadline, so the advertised 120-second allowance cannot be used. The browser can retry 504 responses, repeating expensive work rather than allowing the original extraction to finish. DNS validation also happens before the metadata timeout and uses non-contextual `net.LookupHost`.

Assign timeouts per route, propagate context into DNS lookups, and make the browser's retry policy distinguish startup failures from expensive extraction failures. This follows the documented behavior of [Go contexts](https://pkg.go.dev/context#WithTimeout) and [chi's timeout middleware](https://github.com/go-chi/chi/blob/master/middleware/timeout.go).

**11. [P2] Metadata inspection ignores the authentication/network settings needed to reach the content — code-confirmed.**

[Info request](C:/Users/movva/Documents/GitHub/yt-dls/web/src/services/api.js:70), [metadata request shape](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:37), [metadata arguments](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:72).

Settings are loaded only when submitting a download. Inspection sends just the URL, and the handler accepts no proxy, credentials, cookie choice, or extractor settings. Content needing those settings cannot reach the configuration screen through the normal UI. This remains a problem after fixing numeric serialization.

Define a shared, validated subset of extraction settings for info and download requests, honoring the same dangerous-option policy in both places.

**12. [P2] Multi-select silently discards selected streams — reproduced with yt-dlp.**

[Selector construction](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:261), [command builder](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:152).

The submitted selector joins selected IDs with `+`, but the backend never enables multiple video/audio streams. For a synthetic set of four valid formats, `137+248+140+251/best` selected only `137+140`. The preview instead uses commas and represents a different set of outputs. Multiple default “best” IDs can trigger the problem even before explicitly turning on multi-select.

Decide whether multi-select means separate files or multiple tracks, then implement that meaning consistently, including output names and byte estimates. Upstream explains the [multistream selection rules](https://github.com/yt-dlp/yt-dlp#format-selection).

**13. [P2] “All subtitles” selects only the default subtitle language — reproduced.**

[Subtitle arguments](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:183), [test encoding the defect](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command_test.go:170).

The builder deliberately omits `--sub-langs` for `all`. With English and French available, the installed yt-dlp selected only English under that configuration. The existing unit test explicitly expects the omission.

Emit `--sub-langs all` and replace the incorrect assertion with a behavior test. This is the syntax documented in [yt-dlp's subtitle options](https://github.com/yt-dlp/yt-dlp#subtitle-options).

**14. [P2] The editable command preview does not represent the submitted job — code-confirmed.**

[Client command generator](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:214), [submission](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:259), [editable preview](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:705), [server preview](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_download.go:91).

The UI never calls the existing server preview endpoint. It constructs another command with different format separators, omitted advanced settings, different overwrite behavior, and other discrepancies. Editing the textarea changes only `commandDraft`; clicking Download ignores those edits. The server preview also skips the actual download-directory validation, so it can preview a destination the real endpoint rejects.

Use a single normalized request model and the server's command builder for previews. Either make the preview read-only or provide an explicitly designed editing workflow. Do not imply arbitrary shell text will be executed.

**15. [P2] “Overwrite Files” never enables media-file overwriting — code-confirmed.**

[UI payload](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:278), [overwrite flag](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:176).

The checkbox sends `postOverwrites`, while media overwriting requires the separate `overwrite` field. That field is never sent, so `--no-overwrites` remains active. A user can explicitly request overwriting and still have an existing media file skipped.

Expose media and postprocessing overwrite policies clearly and wire each to its corresponding field.

**16. [P2] Collapsing an accordion changes download semantics — code-confirmed.**

[Postprocessing UI state](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:273), [metadata payload](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/config/ConfigSection.jsx:280).

`openPost` is used as `enablePostprocessing`, and `openMeta` gates metadata transformations. Closing a section after selecting options silently disables some of them. Extraction is inconsistent: `extractAudio` can keep the backend postprocessing branch active even when the closed accordion's preview omits it.

Keep presentation state separate from feature-enabled state. Collapsing a section should preserve the selected job configuration.

**17. [P2] Playlist submission overfills the bounded queue and ignores configuration — code-confirmed.**

[Playlist submission](C:/Users/movva/Documents/GitHub/yt-dls/web/src/pages/Home.jsx:166), [pool capacity](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/pool.go:32).

The “Configure & Download Selected” action immediately sends every entry concurrently with hard-coded defaults. It does not open configuration or include saved advanced settings. The default pool has three worker slots and twelve buffered jobs, with at most one extra job held by the dispatcher. If those jobs remain occupied, larger selections receive 429 responses. Rejected entries are not retried; only a count is shown before navigating away.

Implement playlist admission with backpressure or a batch endpoint, preserve failed-entry identities, and apply the user's selected configuration consistently.

**18. [P2] Title-only output names cause false success and concurrent file collisions — code-confirmed.**

[Default filename](C:/Users/movva/Documents/GitHub/yt-dls/internal/validation/validation.go:186), [suggested filename](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:512), [playlist filename](C:/Users/movva/Documents/GitHub/yt-dls/web/src/pages/Home.jsx:173).

Distinct videos with the same title share an output path. The normal no-overwrite behavior can skip the second video's contents while the worker treats a clean exit as success. Concurrent jobs can also target the same partial file. Sanitizing non-ASCII-only titles down to `video` increases collisions.

Include stable media IDs in default names, coordinate duplicate destinations, and distinguish an existing-file skip from a newly completed download.

**19. [P2] Cancelling a queued job does not update its visible state or free its queue slot — reproduced.**

[Cancel handler](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_status.go:91), [Cancel implementation](C:/Users/movva/Documents/GitHub/yt-dls/internal/store/progress.go:115), [dispatcher](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/pool.go:69).

Cancellation only cancels a context. The queued item remains `initializing` and occupies the queue until it reaches a worker. A worker later changes it to `starting` before checking cancellation through the context bridge; some start failures can be recorded as `failed` instead of `cancelled`.

Publish cancellation immediately, discard cancelled jobs before acquiring scarce execution capacity, and make terminal transitions consistent and idempotent.

**20. [P2] SSE drops client cancellation and has no bounded write/shutdown path — cancellation loss reproduced.**

[Deadline removal](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/router.go:139), [SSE loop](C:/Users/movva/Documents/GitHub/yt-dls/internal/sse/gateway.go:183), [HTTP timeouts](C:/Users/movva/Documents/GitHub/yt-dls/cmd/server/main.go:63).

`context.WithoutCancel` removes client disconnect cancellation as well as the deadline; the SSE loop's Done case cannot fire. Normal disconnects may eventually be noticed by writes, but a slow reader can block a write because there is no write deadline. Closing that client's queue does not interrupt an already blocked write. There is also no gateway shutdown signal.

Exclude the SSE route from the general timeout middleware while preserving its original request context. Bound individual writes and explicitly close SSE clients during shutdown. These properties are described in [WithoutCancel](https://pkg.go.dev/context#WithoutCancel), [HTTP response control](https://pkg.go.dev/net/http#ResponseController.SetWriteDeadline), and [Server.Shutdown](https://pkg.go.dev/net/http#Server.Shutdown).

**21. [P2] Polling can retain deleted jobs forever and never discover external changes — code-confirmed.**

[Polling hook](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/downloads/useDownloads.js:32), [batch truncation](C:/Users/movva/Documents/GitHub/yt-dls/web/src/services/api.js:138).

The initial list is fetched once. Null snapshots for deleted/missing IDs are explicitly kept in `downloadIds`, and their stale cards remain. Jobs started in another tab never appear automatically. An initial list-fetch failure leaves an empty queue with no retry. Requests use asynchronous intervals without aborting older polls, allowing overlap and out-of-order results when the API is slow. Only the first fifty IDs are queried per batch.

Reconcile with authoritative lists periodically or consume SSE with reconnect/resync; remove confirmed-missing jobs, batch all IDs, retry initial load, and allow only one in-flight polling cycle. Despite the README, no frontend `EventSource` implementation exists.

**22. [P2] Filenames containing “audio” override explicit video codec information — reproduced.**

[Stream classification](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/progress.go:91).

A video-only progress event for `audio tutorial.f137.mp4` with `vcodec=avc1` and `acodec=none` credited 25 bytes to audio and zero to video. The audio filename heuristic is tested before the explicit video-codec branch. Depending on expected streams, aggregate progress can then omit the bytes entirely.

Use explicit codec information first and filename heuristics only when metadata is genuinely absent.

**23. [P2] Final byte totals are discarded, and fragment fallback overstates completion — reproduced/code-confirmed.**

[Finished-event handling](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/progress.go:194), [fragment fallback](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/progress.go:163).

A stream with an unknown total followed by a finished event carrying `100/100` bytes remained at `50/0`; the finished branch never consumes the final counters. It instead copies an earlier estimate if one exists. Separately, the fragment fallback adds one to yt-dlp's progress counter; upstream increments that counter on fragment completion before publishing it, so completed-fragment events can be one fragment ahead. The existing fallback test encodes that assumption.

Consume final counters and test actual fragment hook sequences. Relevant implementation: [yt-dlp fragment downloader](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/downloader/fragment.py).

**24. [P2] The recorded filename can refer to an intermediate file that no longer exists — code-confirmed.**

[Progress template](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:25), [filename updates](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/progress.go:210).

The backend tracks only download-stage filenames. Merging, audio extraction, remuxing, and conversion can change the final name or delete intermediate files. No after-move result is captured, so a completed job can show the last audio/video component rather than its finished output.

Capture an explicit final filepath event and distinguish job title, temporary filenames, and final output paths.

**25. [P2] Valid metadata replacements with an empty replacement cannot be expressed — reproduced.**

[Argument tokenizer](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:671), [three-argument validation](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:234).

`title foo ""` should remove `foo`, but the tokenizer discards the quoted empty token and reports that only two arguments were provided. It also does not reject unbalanced quotes or implement the escaping implied by its shell-like interface.

Represent these three values as structured fields or use a correctly specified tokenizer that preserves empty arguments and validates quoting.

**26. [P2] Ambient yt-dlp configuration can override the app's promised behavior — code-confirmed.**

[Download command initialization](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:143), [metadata arguments](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_info.go:72), [NoExec handling](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:498).

Neither process invocation disables external configuration loading. Existing user/system configuration can add execution hooks, alternate outputs, simulation, or other behavior absent from the UI's validated request. Selecting “Disable --exec” only suppresses adding a new flag; it does not emit a disabling flag. This is a predictability/policy issue involving local configuration, not a demonstrated remote code-execution exploit under default settings.

Use a deliberately controlled configuration source, or explicitly incorporate external configuration into the trust model and preview. yt-dlp documents its [configuration loading](https://github.com/yt-dlp/yt-dlp#configuration).

**27. [P2] The default Node.js setup is incomplete for YouTube extraction — reproduced/configuration-confirmed.**

[JS runtime default](C:/Users/movva/Documents/GitHub/yt-dls/internal/config/config.go:74), [conditional runtime flag](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:148).

The README suggests installing Node.js is sufficient, but the default configuration leaves the runtime flag empty. The installed yt-dlp enabled only Deno by default. A Node-only machine following these instructions therefore does not enable Node for extraction. Python-module selection also needs the appropriate EJS dependency, not merely a successful version check.

Detect/report runtime and EJS availability, document `YTDLP_JS_RUNTIME=node` for that setup, and verify the selected downloader's prerequisites. The official [EJS setup guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS) explicitly requires enabling Node.

**28. [P2] Clean-source setup and documented build instructions are incomplete — reproduced.**

[Embedding](C:/Users/movva/Documents/GitHub/yt-dls/web/embed.go:8), [root scripts](C:/Users/movva/Documents/GitHub/yt-dls/package.json:6), [Makefile](C:/Users/movva/Documents/GitHub/yt-dls/Makefile:4), [README](C:/Users/movva/Documents/GitHub/yt-dls/README.md:1).

A clean tracked-source export failed with `pattern dist/*: no matching files found`. Built frontend files are ignored, but `go run`, `go test`, and Makefile targets embed them unconditionally. The root install does not install `web` dependencies through a workspace or setup step. The README references a nonexistent `go/` directory and `requirements.txt`, claims Go 1.21 while go.mod requires 1.23, and documents obsolete scripts/layout. The Makefile's dev tag has no corresponding alternate frontend implementation. The npm build always names the executable `.exe`, even on other platforms.

Provide a tested fresh-clone bootstrap sequence that installs both dependency sets and builds assets before Go compilation; make build targets enforce prerequisites and align documentation. Go requires every [embed pattern](https://pkg.go.dev/embed) to match.

**29. [P2] Pause and health controls do not match implemented capabilities — code-confirmed.**

[Pause/resume handlers](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_download.go:133), [pause UI](C:/Users/movva/Documents/GitHub/yt-dls/web/src/features/downloads/DownloadItem.jsx:115), [health handler](C:/Users/movva/Documents/GitHub/yt-dls/internal/handlers/handler_health.go:8), [health button](C:/Users/movva/Documents/GitHub/yt-dls/web/src/pages/Home.jsx:102).

Pause/resume return 501 on every platform, but the UI presents the action for active jobs and does not catch its rejection. Health always returns `{ "status": "ok" }`, without checking yt-dlp, FFmpeg, runtime, or output-directory readiness. The System Health button has no handler. The unused platform-info helper treats absent support data as supported. The app can appear healthy while every download fails.

Return actual capability/readiness information, disable unsupported controls, and show action errors. The hidden Clear Completed control is also only a refetch stub; either implement it or remove the associated promise.

**30. [P2] Proxy credentials bypass both secret-storage and preview-redaction policies — reproduced/code-confirmed.**

[Secret settings list](C:/Users/movva/Documents/GitHub/yt-dls/web/src/services/api.js:12), [command redaction](C:/Users/movva/Documents/GitHub/yt-dls/internal/worker/command.go:529).

An authenticated proxy URL retains its password in `RedactCommand`. The same proxy value is persisted in localStorage because only five specifically named password fields use sessionStorage. This contradicts the UI/storage distinction between persistent preferences and session secrets. The proxy field itself illustrates a username/password URL.

Parse credentials within URL-valued settings, keep those credentials session-scoped, and redact userinfo for preview/log output. Apply the same treatment to the geo-verification proxy.

**31. [P3] Theme switching mixes class-based and system-based dark styles — built-output confirmed.**

[Theme toggle](C:/Users/movva/Documents/GitHub/yt-dls/web/src/components/ThemeToggle.jsx:12), [Tailwind import](C:/Users/movva/Documents/GitHub/yt-dls/web/src/index.css:1).

The toggle changes the HTML `dark` class, but no custom dark variant is declared. The built stylesheet contains nineteen `prefers-color-scheme` occurrences for dark utilities, while handwritten rules use `.dark`. Switching the app theme can therefore leave utility-styled elements in the operating system's theme and others in the chosen app theme.

Use one theme strategy consistently and persist the user's preference. Tailwind explains [manual dark-mode variants](https://tailwindcss.com/docs/dark-mode).

**Toolchain advisories, separate from demonstrated application exploits**

The official `govulncheck` run reported these symbol-level findings against Go 1.26.5:

| Advisory | Area | Fixed in the 1.26 line |
| --- | --- | --- |
| [GO-2026-6090](https://pkg.go.dev/vuln/GO-2026-6090) | TLS post-handshake resource consumption | 1.26.6 |
| [GO-2026-6089](https://pkg.go.dev/vuln/GO-2026-6089) | Header timeout for unencrypted HTTP/2 detection | 1.26.6 |
| [GO-2026-5972](https://pkg.go.dev/vuln/GO-2026-5972) | ASN.1 recursion depth | 1.26.6 |

Upgrade the build toolchain and rebuild release binaries. Scanner reachability is not proof of exploitability in this deployment: this entrypoint uses plain HTTP, does not explicitly enable unencrypted HTTP/2, and hands media-network operations to yt-dlp. Five additional package/module-level findings were reported without called vulnerable symbols; they should not be described as five more proven application vulnerabilities.

**Additional review observations**

- Frontend build size is substantial for a local download UI. The continuously rendered Three.js background is loaded with the main application; lazy loading and an accessible reduced-motion/performance setting would reduce startup and rendering costs.
- Main download/configuration actions have no in-flight guard, so repeated clicks can create duplicate jobs. Combined with shared output paths, this is more than a cosmetic duplicate-card problem.
- The audio-only selector has no combined-format fallback; on sources offering only muxed media, the MP3 preset's `bestaudio` can fail before extraction. “Video only” also permits selecting a combined format, which does not itself remove audio.
- The exported command formatter is not shell-safe across platforms: double quotes still allow substitutions on POSIX shells, parentheses are considered unquoted-safe, and Windows/PowerShell use different escaping. This does not turn the backend's direct `os/exec` use into shell injection, but a copied preview should not be presented as safely runnable shell text.
- The private-IP classifier omits ranges such as shared address space and is a hand-maintained mix of string prefixes and IP predicates. Custom path confinement is lexical and does not account for symlinks/junctions. These are further policy limitations, distinct from the demonstrated secondary-URL bypass.
- `HOST=::1` is interpolated as `::1:7391` rather than joined with IPv6 brackets; use `net.JoinHostPort` for binding and origin construction.
- User-configured downloader paths are silently ignored when the two-second version probe fails. Automatic Python-module preference may select a different installation than the user's standalone executable. The advertised check-timeout setting is unused.
- Unknown `/api/...` GET paths fall through to the SPA and return HTML with status 200. Frontend helpers for impersonation targets and Adobe providers have no matching API routes.
- The README's speed-history display, independent stream panels, browser auto-open, rotating logs, Unix pause/resume, and automatic SSE fallback do not describe the current implementation. Several declared environment variables are unused. The favicon points to `/vite.svg`, which is not a public asset in the tracked source.
- The configuration modal lacks the usual dialog semantics, focus containment, and Escape behavior; format rows are mouse-click targets without equivalent keyboard controls. This was source review, not a full accessibility audit.

**Why the existing tests missed this**

There were no handler or configuration tests before the temporary probes. The worker tests largely cover command construction and synthetic progress parsing, not `Worker.Run` with subprocess descendants or new directories. SSE tests publish events but do not assert the received terminal frames or throttle behavior. The all-subtitles test explicitly expects the incorrect argument omission. No frontend test command or CI workflow is present in the tracked source.

Measured statement coverage was 0% in handlers and configuration, 54.3% in workers, 80.8% in validation, 82.3% in SSE, 86.0% in storage, and 100% in the small bus and queue packages. In particular, a high SSE percentage should not be mistaken for assertions about event correctness.

The most useful regression suite would exercise the real router with representative frontend JSON, a controllable fake downloader for timeout/cancellation/output-limit cases, actual yt-dlp rendering and format selection, and browser workflows for save-settings → inspect → configure → download → cancel. Run race detection in CI with the required C toolchain; do not treat its unavailability here as a passing result.

**Suggested repair order**

1. Restore the request/network boundaries and reject dangerous public configurations; bound metadata work.
2. Fix saved-setting serialization and first-run directory creation so the normal workflow works reliably.
3. Repair process-tree cancellation and terminal-state handling, then progress-template validity.
4. Consolidate request/preview configuration and correct format, subtitle, overwrite, and playlist semantics.
5. Add integration coverage, capability reporting, a tested clean-clone build, and documentation that matches the shipped UI.
