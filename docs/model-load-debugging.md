# Slow on-device model loads: debugging record

On the dev machine, Chrome sometimes takes minutes to load Gemini Nano for the side panel
(`LanguageModel.create()`), while other loads take seconds. This file records everything we
measured, what it ruled out, and what is still open. Measured 15–22 Nov 2026.

**Result in short:** during a slow load Chrome waits idle: no CPU, no GPU work, no memory
growth, and nothing in its verbose log. The cause lies outside the extension. Only a PC restart
helped (14.1 s), and only for the first Chrome start after it. Demo routine: restart the PC,
start Chrome, open the side panel once.

## Setup

- Windows 11 Home, Intel Core Ultra 7 265K (20 cores), 31.4 GB RAM, NVMe SSD.
- Two GPUs: NVIDIA GeForce RTX 5070 Ti (16 GB) and the CPU's Intel graphics. Windows is set to
  run Chrome on the high-performance GPU (`GpuPreference=2`).
- Chrome 157.0.8103.79 (installed 14 Nov 2026, unchanged since).
- Model folder `%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel\2025.8.8.1141`:
  `weights.bin` 4,269,932,544 bytes. Chrome's model list (`OptimizationGuideModelsManifest`
  1.20261018.2) already names newer models (Gemma 4 configs), but the installed model is from
  August 2025.
- What the panel measures: the time of Chrome's own `LanguageModel.create()`
  (`loadOnDeviceModel()` in [`src/ai.ts`](../src/ai.ts)). The extension does nothing else in
  that time.

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

## What we checked, and what it showed

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
them then. Ruled out as the cause of the wait.

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
writable (not read-only; the folder's access list denies only "execute"). Ruled out.

### What Chrome does during the wait

A PowerShell script sampled every 5 s for 15 minutes, across two Chrome starts: CPU time per
Chrome process, Chrome's GPU use (Windows performance counter class
`Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine`, which works on a German Windows,
unlike `Get-Counter` with English counter names), free RAM and the cache file sizes.

- CPU: at most 0.1–0.4 s per 5 s in any Chrome process during the wait, i.e. nearly idle.
- GPU: 0 % for Chrome the whole time, except 1–4 % at Chrome's start and 7 % at 23:29:00,
  about when the second load finished.
- RAM: 9–11 GB free, no process grew by gigabytes.

So the model itself loads in seconds, after Chrome has waited for minutes. Neither CPU-bound
work (such as compiling GPU programs) nor GPU work explains the wait.

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
pending component update, no error. The model service runs in its own sandboxed process, which
did not write to this log, so the wait inside it stays invisible.

**Careful:** with `--enable-logging`, Chrome also writes console messages to the log, including
the App Check debug token that dev builds print. Delete `chrome_debug.log` after such a test
(it can only be deleted while Chrome is closed).

### Windows event log and GPU driver

The System log had no display driver errors or resets (`nvlddmkm`, `dxgkrnl`, event 4101) in
the test window. It had six "corrected hardware error" warnings (WHEA-Logger, event 17) at
22:48, at Chrome's start, not during the loads; probably unrelated.

Updating the NVIDIA driver from 32.0.16.2101 to 32.0.16.2124 needed a PC restart. The first
Chrome start after it loaded in 14.1 s, and the next Chrome restart took 125.0 s again. So the
driver did not fix it; the PC restart helped, once.

### Antivirus

Microsoft Defender real-time protection is on. Not tested separately; since nothing in Chrome
read the 4 GB weights during the wait, a scan of them does not explain it.

## What is ruled out

- Our code: it only waits for `LanguageModel.create()`.
- RAM, disk, CPU load, GPU load, a game on the same GPU.
- Chrome's crash pause, Chrome's GPU cache files, Chrome still running in the background.
- A Chrome update (version unchanged since 14 Nov) and the NVIDIA driver.

## What is still open

- What Chrome waits for. It looks like state that survives a Chrome exit and is cleared only by
  a PC restart (in Windows, the GPU driver or a Chrome-wide service), but that is a guess.
- Whether the old model (2025.8.8) next to a newer model list plays a part.
- Whether other machines see it at all.

## Ideas for later (not before the submission)

1. Test on a second PC: a fresh Chrome profile with the downloaded model, and the load time
   after a Chrome restart.
2. Reinstall the model: with Chrome closed, delete the `OptGuideOnDeviceModel` folder; Chrome
   downloads it again (about 4 GB, only when it considers the device idle). Not before the demo
   video is recorded, because the AI check is gone until the download ends.
3. A second PC restart followed by two Chrome restarts, to see whether the first start after a
   restart is reliably fast.
4. File a Chromium bug with this record.

## Other findings from the same session

- **Deep check button missing:** `npm run check` (and `npm run build`) overwrite `dist` with a
  production build, which has no App Check, so the panel correctly says the deep check is not
  available. Run `npm run dev` again and reload the extension before testing in Chrome.
- **Cloud deep check works:** on a real Google "you shared data with debattr.com" email, the
  preview showed both addresses as `[email]@domain` and the links as hosts only;
  `gemini-3.5-flash-lite` answered in 1.9 s with a correct verdict and sound reasons in German.
