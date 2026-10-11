# Note Taker

Note Taker (version 2.0) is a local desktop app for taking meeting notes. Version 1.0 was originally built by [Tunde Alao](https://github.com/tunde-alao) before then modified by [TMB](https://tmb.it.com). It records your microphone and the audio playing on your computer (optionally the screen too), saves everything on your machine, and sends the audio to [Gladia](https://gladia.io) to get a transcript with speaker labels and a summary.

Built with Electron, React, TypeScript and Tailwind/shadcn, using electron-vite and electron-builder.

You bring your own Gladia account and API key. Gladia bills you directly for what you transcribe.

## Features

- Record microphone plus system audio, or microphone plus system audio plus the screen.
- Start and stop from the app, the tray icon, or a keyboard shortcut you choose.
- Upload an existing audio or video file and transcribe it.
- Transcript with speaker labels. Click a speaker name to rename it. Click a timestamp to play from that point.
- Built-in player for the saved recording.
- Summaries in three styles: Bullet points, Concise, General.
- An Android app (APK) that records with the microphone and uses the same notes screens. See the Android section.
- Copy the transcript or a summary, export a meeting to Markdown, search all meetings, delete meetings (with a 30-day Trash).
- Settings for language and default summary style.
- Meetings interrupted by a crash or forced quit are kept and can be retried.

## Get a Gladia API key

Transcription does not work without a key.

1. Create an account at [app.gladia.io](https://app.gladia.io) (the sign-in page has a "Sign up" link and Google sign-in).
2. Open the API keys page in the console, [app.gladia.io/apikeys](https://app.gladia.io/apikeys). New accounts get a default key you can use, or you can create your own.
3. In Note Taker, click **Settings** (bottom of the left sidebar), paste the key into **Gladia API key**, and click **Save**.

Until a key is saved, the app shows "Gladia API key required" and the Start Meeting and Upload Audio buttons are disabled.

Gladia documentation: [docs.gladia.io](https://docs.gladia.io). Getting started: [docs.gladia.io/chapters/introduction/getting-started](https://docs.gladia.io/chapters/introduction/getting-started). Gladia's docs mention a one-time trial credit for new accounts; check their site for current credit, pricing and plan terms, since they can change.

Each person must use their own key. Do not share keys or commit them to a repository. Usage is billed by Gladia to the account that owns the key.

### How the key is stored

The key is saved in `settings.json` in the app's data folder (see [Where your data lives](#where-your-data-lives)), file mode `0600`.

- If the operating system keyring is available, the key is encrypted with Electron `safeStorage` and stored as `gladiaApiKeyEncrypted`.
- On Linux, if Electron can only use its `basic_text` fallback (no usable keyring such as GNOME Keyring or KWallet), the app treats encryption as unavailable and stores the key as plain text in `settings.json`. Anyone who can read your files can read it. Install and unlock a keyring if that matters to you.
- A plain-text key from an older version is re-saved encrypted the next time settings are read, if encryption is available.
- If the keyring is reset or changed, the stored key can no longer be decrypted and you must paste it again.

## Install and run

Builds are not code-signed. Expect operating system warnings, described per platform below.

**Testing status:** only Linux has been run by the author. The macOS and Windows builds are configured but have not been tested yet. Treat those two as unverified.

There are no pre-built downloads described here. You get the app either as installer files someone sends you, or by building it yourself (see [Build from source](#build-from-source)). Build output goes to the `dist/` folder.

### Linux

Targets (from `electron-builder.yml`): AppImage, snap, deb. File names look like `note-taker-<version>.AppImage`.

AppImage:

```bash
chmod +x note-taker-*.AppImage
./note-taker-*.AppImage
```

On newer distributions the AppImage may fail to start because FUSE 2 is missing. Either install FUSE 2 (package name varies, for example `libfuse2`) or run without FUSE:

```bash
./note-taker-*.AppImage --appimage-extract-and-run
```

deb:

```bash
sudo apt install ./note-taker_*.deb
```

snap builds are produced too; they have not been tested by the author.

System audio capture on Linux relies on your desktop's PipeWire or PulseAudio setup. See [Troubleshooting](#troubleshooting).

### macOS

Target: dmg (`note-taker-<version>.dmg`).

1. Open the dmg and drag Note Taker to Applications.
2. The app is not signed or notarized, so Gatekeeper will block a normal double-click. Right-click (or Control-click) the app, choose **Open**, then confirm **Open** in the dialog.
3. Grant permissions when macOS asks, or in **System Settings > Privacy & Security**:
   - **Microphone**.
   - **Screen & System Audio Recording** (this is what allows system audio, and the screen if you record it).

If system audio stays missing, turn the Note Taker toggle on under **Privacy & Security > Screen & System Audio Recording**, then stop and start a new meeting. The app shows a help panel with a button that opens that settings pane. The app declares `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription` in its Info.plist (set in `electron-builder.yml`).

macOS keeps the app running after you close the window, so you can reopen it from the Dock.

### Windows

Target: NSIS installer (`note-taker-<version>-setup.exe`), which creates a desktop shortcut.

1. Run the installer.
2. Windows SmartScreen will warn that the publisher is unknown, because the build is unsigned. Click **More info**, then **Run anyway**.
3. Allow microphone access if Windows asks.

### Android

A ready-made APK is not published yet. The Android app is built and the code is in this repo, but it has not been run on a phone, so a download will be added once it has been tested. You can build it yourself in the meantime (see Android development below).

Once you have an APK:

1. Copy the file to your phone and tap it.
2. Android will ask you to allow installs from that source (your browser or file manager). Allow it for this install. This is needed because the app is not distributed through Google Play.
3. Open Note Taker, go to **Settings**, paste your Gladia API key and save.
4. The first time you record, allow the microphone permission.

The Android app uses the same screens as the desktop app, laid out for a phone: the meeting list fills the screen and opening a meeting shows it full-screen with a **Meetings** back button. It requires Android 7.0 (API 24) or newer.

What differs from desktop:

- **Microphone only.** Android does not let an app capture other apps' audio or the screen, so there is no system-audio capture and no Audio + screen mode. For a call, put it on speaker or record in the same room.
- **Keep the screen on while recording.** Recording stops being reliable if Android suspends the app (screen off, switching apps for long). There is no background recording service yet.
- **No keyboard shortcuts or tray.** Those are desktop only, so Settings hides the shortcuts section.
- **Export** opens the Android share sheet with the meeting as Markdown text instead of saving a file.
- **Your API key is stored in the app's private storage, not in an encrypted keystore.** Other apps cannot read it, but it is not encrypted at rest. Auto-backup is turned off so it does not leave the device in a cloud backup.
- Meetings live in the app's private storage. Uninstalling the app deletes them.

### Where your data lives

The app stores settings and meetings in Electron's `userData` folder. The folder is named after the app. `package.json` sets the name to `note-taker`, and the packaged product name is `Note Taker`. A packaged build may use either, so look for both folder names.

| OS | Folder |
| --- | --- |
| Linux | `~/.config/note-taker` (or `~/.config/Note Taker`) |
| macOS | `~/Library/Application Support/note-taker` (or `.../Note Taker`) |
| Windows | `%APPDATA%\note-taker` (or `%APPDATA%\Note Taker`) |

Inside:

- `settings.json` - API key (encrypted when possible), language, summary style, shortcuts.
- `meetings/<id>/meeting.json` - title, date, duration, status, transcript, summaries, speaker names.
- `meetings/<id>/audio.webm` (or the original extension for uploads) - the audio.
- `meetings/<id>/screen.webm` - the screen recording, only for Audio + screen meetings.
- `trash/<id>/` - meetings you deleted, same layout as `meetings/<id>/`, kept for 30 days.

## Using Note Taker

### Record a meeting

1. Click **New Meeting** in the sidebar (the record screen is also the start screen).
2. Choose **Audio only** or **Audio + screen**. The choice is remembered.
3. Click **Start Meeting**. A timer and badges show what is being captured: Microphone, System audio, and Screen when applicable.
4. Click **Stop Meeting**. The app uploads the audio and transcribes it, then opens the notes automatically.

The microphone is recorded with echo cancellation, noise suppression and auto gain. System audio is mixed into the same recording. If system audio cannot be captured, the app records the microphone only, shows a warning and turns the System audio badge red with help text.

You can browse other meetings while recording. Recording continues.

### Upload an existing file

Click **Upload Audio** and pick a file. Accepted extensions: mp3, wav, m4a, aac, ogg, opus, flac, webm, mp4, mov, mkv. The file is copied into the app's data folder, titled after the file name, and transcribed. Note that the whole file you choose is what gets sent to Gladia.

### Read and use the notes

Select a meeting in the sidebar. A status badge shows Recording, Uploading, Transcribing, Done or Error.

- **Title:** edit it at the top; it saves when you click away.
- **Player:** an audio player, or a video player for Audio + screen meetings. Use the standard controls.
- **Transcript tab:** consecutive lines from the same speaker are grouped. Speakers are labelled "Speaker 1", "Speaker 2" and so on, and Gladia is asked to detect between 1 and 8 speakers.
  - Click a speaker name to rename it. Press Enter to save or Escape to cancel. The new name applies to every line from that speaker in this meeting. Clearing the name restores the default.
  - Click the timestamp next to a speaker (the play icon with a time) to seek the player to that point and start playing.
- **Bullet points / Concise / General tabs:** summaries in each style. The style you chose in Settings is generated automatically. For another style, the tab offers a "Generate ... summary" button. **Generating a style that does not exist yet re-runs transcription on the saved audio, which uses Gladia credit.** If that extra run fails, your existing transcript is kept and an error is shown.
- **Copy:** copies the active tab (transcript with timestamps and speaker names, or that summary) to the clipboard.
- **Export:** saves a Markdown file named after the meeting title, containing every summary that exists plus the transcript. It is saved through the app's normal download behavior; the destination folder is not set by the app. Export is only enabled once a meeting is Done.
- **Search:** the box in the sidebar filters meetings by title, transcript and summary text.
- **Delete:** the trash icon (on the notes page, or on hover in the sidebar) asks for confirmation, then moves the meeting to the Trash. Nothing is removed from disk yet.
- **Trash:** open **Trash** in the sidebar to see deleted meetings and how many days each has left. **Restore** puts a meeting back in your list. The bin icon next to it deletes that one meeting permanently, and **Empty trash** (with a confirmation) deletes everything in it permanently. Meetings are removed automatically 30 days after they were deleted; this check runs when the app starts. Permanent deletion removes the audio, screen recording, transcript and summaries from your computer and cannot be undone. It does not delete anything stored by Gladia.
- **Retry:** if transcription fails, an alert shows the error and a **Retry transcription** button.

### Settings

Open **Settings** from the sidebar.

- **Gladia API key:** see above.
- **Summary style:** default style generated for new meetings (Bullet points, General, Concise).
- **Language:** Auto-detect, English, French, German, Spanish or Italian. With Auto-detect, Gladia detects the language and allows code-switching. A specific language is passed to Gladia as the only language.
- **Sound effects:** short chimes when recording starts, when it stops, and when a transcript is ready (or has failed). On by default; untick to turn them off. The start chime plays before capture begins and the stop chime after it ends, so neither is recorded into your meeting.
- **Keyboard shortcuts:** see next section.

The app version ("v 2.0") is shown at the bottom of the sidebar, under the Settings button.

## Keyboard shortcuts

Settings has two shortcuts, both empty by default:

- **Open Note Taker** - shows the window.
- **Start / stop meeting** - shows the window and starts or stops a recording.

To set one: click the field, press the combination, click **Save**. Press Escape while capturing to cancel; use the X to clear. The combination must include Ctrl, Alt or Super (Shift alone is rejected), and the two shortcuts must differ. Shortcuts are applied when you click Save and re-applied at startup where relevant.

Suggested combinations: `Ctrl+Alt+R` for start/stop and `Ctrl+Alt+N` to open. Avoid combinations that text editing relies on, such as `Ctrl+Shift+Home`, `Ctrl+C`, or `Ctrl+Shift+Left`, because they would stop working in every app.

How it works depends on the platform:

| Platform | Mechanism | Works when the app is closed? |
| --- | --- | --- |
| Linux, GNOME, installed build | Real GNOME custom keybindings written with `gsettings` | Yes |
| Linux, other desktops | Electron global shortcuts | No, only while the app is running |
| macOS | Electron global shortcuts | No |
| Windows | Electron global shortcuts | No |

**GNOME (installed build):** saving writes two custom keybindings under `org.gnome.settings-daemon.plugins.media-keys` named "Note Taker: open app" and "Note Taker: start/stop meeting". They are stored by GNOME, so they keep working after Note Taker quits. The open shortcut launches the app; the toggle shortcut runs `note-taker --toggle-meeting`, which launches the app if needed (or tells the running instance) and starts or stops a recording. Only keybindings with the `note-taker-` slug prefix are touched. If writing the keybindings fails, the app falls back to Electron global shortcuts and shows a warning. When you run from source with `npm run dev`, GNOME keybindings are not used (the executable would be the bare Electron binary), so Electron shortcuts are used instead.

**Everywhere else:** Electron global shortcuts exist only while the process runs, so **Open Note Taker cannot launch a closed app**. Start the app once, then the shortcuts work, including while it is in the background or the window is hidden. On Linux, Wayland sessions generally block Electron global shortcuts outside GNOME; if registration fails you will see "Could not register: ...". Use your desktop's own keyboard settings instead and point a custom shortcut at the command below.

### Command line flag

```bash
note-taker --toggle-meeting
```

Starts the app if it is not running, or signals the running instance, and toggles recording. Only one instance runs at a time; launching a second one just focuses the first (and applies the flag). Use this to bind a recording toggle in any desktop environment, launcher or automation tool. For an AppImage, use the AppImage path in place of `note-taker`.

## Tray and background behavior

- The app adds a tray icon with a menu: **Open Note Taker**, **Start / stop meeting**, **Quit**. Clicking the icon shows the window. If the desktop has no tray, the app still works without it.
- On GNOME the tray icon only appears if the AppIndicator / KStatusNotifierItem extension is installed and enabled.
- **Closing the window while recording does not quit or stop the recording.** The window hides and a notification says Note Taker is still recording. Stop it from the tray menu or your meeting shortcut; the window reappears to show progress.
- Closing the window when nothing is recording quits the app on Linux and Windows. On macOS the app stays running.
- **Interrupted meetings:** at startup, any meeting left in Recording, Uploading or Transcribing (after a crash or forced quit) is turned into an error. If audio was saved, the message says so and you can click **Retry transcription**. If no audio was saved, the message says that instead.

## Privacy and data

Stays on your computer, in the data folder above: all recordings, the screen recording, transcripts, summaries, speaker names and settings, including meetings sitting in the Trash.

Sent to Gladia (`api.gladia.io`): the audio file of a meeting (the recorded `audio.webm`, or the file you uploaded), uploaded for transcription. The language setting, summary style and diarization options are sent with the request. The API key is sent as a request header.

Never sent: the screen recording. For Audio + screen meetings the picture is recorded into a separate `screen.webm` that the app plays locally and never uploads; only the audio file is read for transcription.

Whatever Gladia then does with uploaded audio is governed by your Gladia account and their terms. Check them if that matters for your meetings. Make sure you have the consent of the people you record.

## Troubleshooting

**No system audio / the System audio badge is red (microphone only).**
- Linux: system audio needs a working PipeWire or PulseAudio session; confirm other apps can capture desktop audio and that the desktop's screen-share/audio permission was not denied. Then stop and start a new meeting.
- macOS: enable Note Taker under **System Settings > Privacy & Security > Screen & System Audio Recording**, then start a new meeting. When running from source use `npm run dev:app`, not `npm run dev`.
- Windows: untested; check that audio is actually playing on the default output device.

**"Gladia API key required".** Open Settings and paste your key. If you did and it still shows after a restart on Linux, the keyring may have been reset; paste it again.

**"Transcription failed" with Retry.** Read the message. Typical causes are a wrong or exhausted key, no internet, or a Gladia error (messages include the HTTP status from Gladia). Fix the cause and click **Retry transcription**. The app polls Gladia for up to about 40 minutes before giving up with "Transcription timed out".

**Shortcuts do not work on Wayland.** Electron global shortcuts are generally blocked on Wayland outside GNOME. Use GNOME (the app writes real keybindings), or bind `note-taker --toggle-meeting` in your desktop's keyboard settings.

**Shortcut works only after the app is started.** Expected outside GNOME. See the table above.

**Tray icon missing on GNOME.** Install and enable the AppIndicator extension.

**AppImage will not start.** Install FUSE 2 or run `--appimage-extract-and-run`.

**macOS says the app is damaged or from an unidentified developer.** Right-click > Open, as described above.

## Project structure

```
src/main       Electron main process: window, tray, IPC, storage, Gladia client, shortcuts, settings
src/preload    Preload script exposing window.api to the renderer
src/renderer   React UI (components, recorder in lib/recorder.ts, formatting in lib/meeting-format.ts)
src/shared     Types shared between processes
scripts        patch-dev-plist.mjs, run-dev-app.mjs (macOS dev helpers)
build          App icons and macOS entitlements
resources      Runtime icon
electron-builder.yml   Packaging configuration
```

## Build from source

Requirements: Node.js and npm. Node 22 was used for development. Vite 7 needs a recent Node (20.19+ or 22.12+). The macOS dev scripts use `/usr/libexec/PlistBuddy`, which ships with macOS.

```bash
npm install          # also runs electron-builder install-app-deps and patches the dev Info.plist (macOS)
npm run dev          # start in development mode with hot reload
npm run typecheck    # node + web type checks
npm run lint
npm run format
```

Build installers (output in `dist/`; build on the OS you are targeting):

```bash
npm run build:linux  # AppImage, snap, deb
npm run build:mac    # dmg (unsigned, not notarized)
npm run build:win    # NSIS installer
npm run build:unpack # unpacked app directory, for inspection
```

`npm run build` runs the type checks and then `electron-vite build`; `build:win` and `build:unpack` run it first. `build:linux` and `build:mac` skip the type check.

### Android development

The Android app is the same React code wrapped with [Capacitor](https://capacitorjs.com). The code in `src/renderer/src/mobile/api.ts` replaces the Electron main process on the phone (storage, settings, Gladia calls, recording) behind the same `window.api` interface. `capabilities` on that interface tells the UI what a platform supports.

You need JDK 21 and the Android SDK (platform 36, build-tools 36). Then:

```bash
npm install
npm run android:sync        # typecheck, build the web bundle, copy it into android/
cd android
./gradlew assembleRelease   # APK at app/build/outputs/apk/release/
```

Release signing reads a properties file (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) from the path in `NOTE_TAKER_KEYSTORE_PROPS`, or `~/.android-keystores/note-taker-release.properties` by default. Keep that keystore and its password safe and out of the repo: Android only installs an update over an existing install if it is signed with the same key. Without the file the APK is built unsigned and cannot be installed until you sign it.

### macOS development

`npm run dev:app` is macOS only. macOS attributes the system-audio permission prompt to the "responsible process", so launching Electron from a terminal or IDE suppresses the prompt. `dev:app` builds the app and launches `Electron.app` through `open` so macOS asks for permission on Electron itself. In development the permission entry is named **Electron**, not Note Taker. Flags: `--reset-permission` resets the saved audio capture grant for `com.github.Electron`; `--verbose` writes Chromium logs to `chromium.log` in the project folder.

### Configuration note

The `publish` section in `electron-builder.yml` points at `https://example.com/auto-updates`, a placeholder. The app contains no auto-update code, so it does not self-update.

## Known limitations

- Screen recording captures the first screen automatically; there is no screen or window picker.
- Gladia returns one summary style per transcription job, so each additional style costs another transcription run.
- Builds are unsigned (Gatekeeper and SmartScreen warnings).
- macOS and Windows builds are untested; only Linux has been run.
- The Android app has been built but not yet run on a device by the author; treat it as untested until you have tried it.
- Audio-only meetings still request a (tiny, discarded) screen capture in order to obtain system audio, so your OS may show a screen-sharing indicator.
- Language choices are limited to the six listed in Settings.
