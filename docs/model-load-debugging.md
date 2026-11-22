# Slow on-device model loads: debugging record

On the dev machine, Chrome sometimes takes minutes to load Gemini Nano for the side panel
(`LanguageModel.create()`), while other loads take seconds. This file records everything we
measured, what it ruled out, and what is still open. Measured 15–22 Nov 2026.

**Result in short (22 Nov 2026, night):** the minutes are not spent loading the model. Chrome
loads the 4 GB weights in about 2.5 s. The wait is the first prefill of a freshly started
on-device model service: Chrome's ML library creates 334 GPU compute pipelines, and for about 80
of them the NVIDIA D3D12 driver blocks 1–7 s each with the CPU idle. Two threads do that work, so
the first prompt (or `create()`, when the session has `initialPrompts`) takes 107–315 s. Chrome
compiles the pipelines again for every new service process, which starts after every Chrome
restart and after the model was idle. The cause sits in the driver inside Chrome's sandboxed
utility process, outside the extension. Only one load after a PC restart was fast (14.1 s).
Demo routine stays: restart the PC, start Chrome, open the side panel once.

## Setup

- Windows 11 Home, Intel Core Ultra 7 265K (20 cores), 31.4 GB RAM, NVMe SSD.
- Two GPUs: NVIDIA GeForce RTX 5070 Ti (16 GB) and the CPU's Intel graphics. Windows is set to
  run Chrome on the high-performance GPU (`GpuPreference=2`).
- Chrome 157.0.8103.79 (installed 14 Nov 2026, unchanged since). NVIDIA driver 32.0.16.2101,
  updated to 32.0.16.2124 on 22 Nov.
- Model folder `%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel\2025.8.8.1141`:
  `weights.bin` 4,269,932,544 bytes. Chrome's model list (`OptimizationGuideModelsManifest`
  1.20261018.2) already names newer models (Gemma 4 configs), but the installed model is from
  August 2025.
- What the panel measures: the time of Chrome's own `LanguageModel.create()`
  (`loadOnDeviceModel()` in [`src/ai.ts`](../src/ai.ts)). The extension does nothing else in
  that time. The panel's sessions carry the system message as `initialPrompts`, so `create()`
  includes the first prefill (see "Where the time goes").

## All measured loads

| When                | Situation                                                          | Load    |
| ------------------- | ------------------------------------------------------------------ | ------- |
| 15 Nov              | `LanguageModel.create()` timed in the DevTools console             | 572 s   |
| 15 Nov              | GPU cache files moved aside, then a full Chrome exit               | 3.8 s   |
| 19 Nov              | first load after a full Chrome exit                                | 304.8 s |
| 19 Nov              | panel load 3.6 s, a new session minutes later (model was unloaded) | 249 s   |
| 21 Nov, about 22:30 | Chrome running since 19 Nov; a game and many apps open, 2 GB free  | 383.4 s |
| 21 Nov, 22:47 start | fresh Chrome, game closed, 9.7 GB free                             | 537.7 s |
| 21 Nov, 23:14 start | fresh Chrome, GPU cache files moved aside, monitor running         | 228.8 s |
| 21 Nov, 23:22 start | next Chrome restart, monitor running                               | 404.5 s |
| 21 Nov, 23:34 start | Chrome with verbose logging                                        | 193.6 s |
| 22 Nov, after 01:30 | NVIDIA driver update plus PC restart, first Chrome start           | 14.1 s  |
| 22 Nov              | next Chrome restart (`chrome://quit`)                              | 125.0 s |

Once the model is loaded, new sessions with any settings start in 0.0–0.1 s, and inference
takes about 1 s for short answers.

## Where the time goes (measured 22 Nov 2026, 02:00–02:30)

Method: a test page that times `LanguageModel.availability()`, `LanguageModel.create()` without
`initialPrompts` and one prompt ("Say OK."), opened once in the running Chrome and then in six
fresh Chrome starts on a copied test profile (`Local State` plus the model folder copied into a
separate user data directory, Chrome started with `--remote-debugging-port`, a Chrome trace
recorded over the DevTools protocol, `chrome://histograms` read at the end). A PowerShell sampler
recorded CPU, GPU, disk and memory of every process every 5 s. The harness is kept outside the
repo for now.

| Run                                                              | `create()` | first prompt |
| ---------------------------------------------------------------- | ---------- | ------------ |
| running Chrome (had loaded the model in 125 s at 01:48)          | 3.2 s      | 315.6 s      |
| test profile, fresh Chrome                                       | 6.3 s      | over 92 s    |
| test profile, fresh Chrome                                       | 3.1 s      | 134.3 s      |
| test profile, traced                                             | 3.1 s      | 161.0 s      |
| test profile, `on_device_model_use_low_power/true`               | 3.0 s      | 107.6 s      |
| test profile, `on_device_model_enable_host_mapped_pointer/false` | 3.1 s      | 153.0 s      |
| test profile, `--disable-features=OnDeviceModelWarmDrivers`      | 3.2 s      | 158.2 s      |

(The second run's prompt was cut off at 92 s by a harness mistake; the others ran to the end.)

What the numbers say:

- `create()` without `initialPrompts` is fast; the first prompt is slow. The panel's sessions
  have `initialPrompts`, so for the panel the same wait sits inside `create()`. Chrome's own
  histograms agree: `OnDeviceModel.LoadModelDuration` was 2.4–2.6 s in every run (the model
  load itself), while `OptimizationGuide.ModelExecution.OnDeviceFirstResponseTime.PromptApi` was
  107–161 s and `OnDeviceModel.QueueTime.Foreground` showed the generate step waiting that long
  behind the prefill. Decoding afterwards ran at 63–85 tokens/s.
- The Chrome trace of the on-device model service process shows the wait: Dawn (Chrome's WebGPU
  implementation, D3D12 backend) created 334 compute pipelines on two worker threads
  (`DeviceBase::APICreateComputePipeline`). The shader compile inside each one
  (`CompileShaderDXC`) took 3–67 ms. About 80 of the 334 pipeline creations took 1–7 s each; the
  rest took 4–10 ms. The slow part is the driver's pipeline creation after the compile. Summed
  over the two threads: 215–314 s of pipeline creation per run, 107–161 s wall time.
- During those seconds the service process used about 20 ms CPU per second, 0 % GPU and read no
  files. The driver waits; it does not compute.
- The three Chrome switches above (prefer the integrated GPU, no host-mapped pointers, no driver
  warm-up) changed nothing.
- The loads of 125–572 s on earlier days are the same mechanism with more slow pipelines: the
  count of slow pipeline creations varies per service process.

Why it comes back: Chrome ends the service process after idle time (1 min without an open
session, 5 min without activity even with open sessions; both are Chrome defaults), and every
new service process creates all 334 pipelines again. Chrome's ML library has a program cache
for compiled pipelines (`program_cache.bin` in the model folder), but the file stays 0 bytes
after every load, so nothing is reused. The service runs in a low-privilege AppContainer
(`%LOCALAPPDATA%\Packages\cr.sb.odm…`). It cannot reach the NVIDIA driver's shader cache in
`%LOCALAPPDATA%\NVIDIA\DXCache`; its own D3D12 shader cache under that package folder was
written once, during the 14.1 s load after the PC restart, and did not grow during any slow run.

## What we checked on 21–22 Nov, and what it showed

### Chrome was not really closed (first test on 21 Nov)

Closing all windows left Chrome running in the background: its oldest process had started on
19 Nov at 00:36. "Exit Chrome" therefore means `chrome://quit` or Exit in the tray menu, or
turning off "Continue running background apps when Google Chrome is closed". With a real exit
the load was still slow, so this was not the cause.

### Memory pressure

During the 383.4 s load only 2.0 of 31.4 GB RAM were free (a game, a second browser, VS Code
and Claude used about 30 GB together, and the game also used the GPU). After closing them,
9–11 GB stayed free during every later load, and the loads stayed slow (193–537 s). Ruled out.

### Disk

Reading all of `weights.bin` (4,072 MB) took 0.7 s. That read probably came partly from the
Windows file cache, because the model had just been loaded; a cold read was not measured.
During slow loads, free RAM did not drop by the 4 GB the weights need, so Chrome was not reading
them then. Ruled out as the cause of the wait; the 22 Nov histograms confirm the model load
takes 2.5 s.

### Crash backoff

`chrome://on-device-internals` → Event Logs showed three lines at the moment the side panel was
closed:

```
ai_language_model.cc(654) Terminated on-device session for LanguageModel. Reason: Session crashed
```

They are the panel's three open sessions ending with the panel. Chrome's `Local State` file
(key `optimization_guide.on_device`) showed `model_crash_count: 0`, so Chrome did not count a
crash, and its pause after repeated crashes (3 crashes, then 1 min growing to 1 h) was not
active. Ruled out.

The same key showed `performance_class: 6` (the highest), measured on
`10de:2c05:D3D12 driver version 32.0.16.2101` with `vram_mb: 15995`: Chrome rates the RTX
5070 Ti as very fast and uses the GPU.

### GPU cache files

In the model folder, `adapter_cache.bin`, `encoder_cache.bin` and `program_cache.bin` were 0
bytes, unchanged since 15 Nov 12:36. A first theory (15 Nov) was that Chrome rebuilds its GPU
programs on every load because of that. On 15 Nov, moving the files aside and exiting Chrome
completely gave a 3.8 s load, but the new files were empty again, which already spoke against
the theory. On 21 Nov the same steps gave 228.8 s: Chrome created new files (again 0 bytes,
`program_cache.bin.dawn_version` 20 bytes), and the next load was no faster. The files are
writable (not read-only; the folder's access list denies only "execute"). In hindsight the
theory was half right: the pipelines are rebuilt on every load because the program cache stays
empty, but moving the files changes nothing, because they are empty either way.

### What Chrome does during the wait

A PowerShell script sampled every 5 s for 15 minutes, across two Chrome starts: CPU time per
Chrome process, Chrome's GPU use (Windows performance counter class
`Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine`, which works on a German Windows,
unlike `Get-Counter` with English counter names), free RAM and the cache file sizes.

- CPU: at most 0.1–0.4 s per 5 s in any Chrome process during the wait, i.e. nearly idle.
- GPU: 0 % for Chrome the whole time, except 1–4 % at Chrome's start and 7 % at 23:29:00,
  about when the second load finished.
- RAM: 9–11 GB free, no process grew by gigabytes.

The 22 Nov sampler covered every process on the machine: Defender (`MsMpEng`), the NVIDIA
services, the VPN client and the browser all stayed idle too. So no other process did the work
either; the wait is inside the driver's pipeline creation.

### Chrome's verbose log

Chrome was started with
`--enable-logging --v=0 --vmodule=*on_device*=3,*model_broker*=3,*ai_language_model*=3,*ai_manager*=3,*model_execution*=3,*model_quality*=3,*component_updater*=1`.
The log (`chrome_debug.log` in Chrome's user data folder) showed, for the 193.6 s load:

```
23:34:56.659 CrxUpdateService starting up. First update attempt will take place in 60 s seconds.
23:34:56.862 Update completed with error 0
23:35:18.310 GetSamplingParamsConfig for MODEL_EXECUTION_FEATURE_PROMPT_API yields: {top_k=64, temperature=1}
23:35:18.322 ERROR manifest_solution_factory.cc:846 Model recipe nano_v3_gpu_high_tier_model has 0 max_tokens, using fallback value 10240
23:35:56.694 Update completed with error 0
```

After the panel's request at 23:35:18, nothing until the model was ready about 193 s later. No
pending component update, no error. The `max_tokens` line is written by the browser process the
moment it sends the load request to the service, so the whole wait is inside the service. The
service and the ML library write nothing to this log during pipeline creation.

**Careful:** with `--enable-logging`, Chrome also writes console messages to the log, including
the App Check debug token that dev builds print. Delete `chrome_debug.log` after such a test
(it can only be deleted while Chrome is closed).

### Windows event log and GPU driver

The System log had no display driver errors or resets (`nvlddmkm`, `dxgkrnl`, event 4101) in
the test window. It had six "corrected hardware error" warnings (WHEA-Logger, event 17) at
22:48, at Chrome's start; the device in them is the Intel Wi-Fi card (`8086:272B`), not the
GPU or the SSD. Unrelated.

Updating the NVIDIA driver from 32.0.16.2101 to 32.0.16.2124 needed a PC restart. The first
Chrome start after it loaded in 14.1 s, and the next Chrome restart took 125.0 s again. So the
driver update did not fix it; the PC restart helped, once.

### Antivirus

Microsoft Defender real-time protection is on. On 22 Nov its process used no CPU during the
waits, and the service read no files then. Ruled out.

### Network

Chromium's source (release 157) has no network request between the load request and the ready
session once the model is installed, and the slow runs happened with the VPN client idle. Ruled
out.

## What is ruled out

- Our code: it only waits for `LanguageModel.create()`.
- Loading the weights (2.5 s), RAM, disk, CPU load, GPU load, a game on the same GPU.
- Chrome's crash pause, Chrome still running in the background, a Chrome update (version
  unchanged since 14 Nov), the NVIDIA driver update, Defender, the network.
- Chrome's switches for the integrated GPU, host-mapped pointers and the driver warm-up.

## What is still open

- Why the NVIDIA D3D12 driver blocks 1–7 s per compute pipeline inside Chrome's sandboxed
  service while the CPU is idle, and why the first load after a PC restart does not. A
  driver-internal wait (for example around its shader cache, which the sandbox cannot reach) is
  the best guess, but that is a guess.
- Why Chrome's program cache (`program_cache.bin`) stays empty, so the pipelines are rebuilt for
  every service process.
- Whether other machines see it at all. Nothing public matches this pattern; the one similar
  report in Chrome's early preview group was a broken GPU driver.

## Ideas for later (not before the submission)

1. Run the same measurement on a second PC (any GPU): fresh Chrome start, `create()`, first
   prompt, `chrome://histograms/OnDeviceModel`.
2. Try a clean NVIDIA driver reinstall and Chrome Canary (newer Dawn and ML library) here.
3. File a Chromium bug with the trace: 334 `DeviceBase::APICreateComputePipeline` events,
   about 80 of them 1–7 s, in the on-device model service.
4. Product side, if it stays: the panel's warm-up already does a real prefill (system message as
   `initialPrompts`), which is what triggers the pipeline creation. A small keep-alive prompt
   within Chrome's 5 min service idle time would avoid the reload while the panel is open. The
   first wait after a Chrome start cannot be avoided from the extension.
5. Reinstall the model: with Chrome closed, delete the `OptGuideOnDeviceModel` folder; Chrome
   downloads it again (about 4 GB, only when it considers the device idle). Unlikely to help, as
   the weights load in 2.5 s. Not before the demo video is recorded.

## Other findings from the same sessions

- **Deep check button missing:** `npm run check` (and `npm run build`) overwrite `dist` with a
  production build, which has no App Check, so the panel correctly says the deep check is not
  available. Run `npm run dev` again and reload the extension before testing in Chrome.
- **Cloud deep check works:** on a real Google "you shared data with debattr.com" email, the
  preview showed both addresses as `[email]@domain` and the links as hosts only;
  `gemini-3.5-flash-lite` answered in 1.9 s with a correct verdict and sound reasons in German.
- **Chrome accepts a copied model:** copying `Local State` and the `OptGuideOnDeviceModel`
  folder into a fresh user data directory gives a Chrome whose `LanguageModel.availability()`
  says `available` after 2 s, without a new 4 GB download. That makes automated load
  measurements possible without touching the real profile.
