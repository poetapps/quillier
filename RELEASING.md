# Releasing Quillier

Everything ships through GitHub Releases on `poetapps/quillier`:

- **The website** (`site/`, hosted on Vercel) links its download buttons to `releases/latest/download/<file>`, so they always serve the newest published release. The file names never change: `Quillier-mac.dmg`, `Quillier-Setup.exe`, `Quillier-linux.AppImage`.
- **The app** checks the same releases (`electron/updater.js`, using electron-updater and the `latest*.yml` files each build uploads). It checks quietly about 20 seconds after launch and every 12 hours after that, plus whenever someone clicks **Check for Updates…** (app menu on macOS, Help menu elsewhere) or **Check now** in Settings → Updates. It never shows a pop-up.

## One-time setup

1. Create the public repo and push:

   ```bash
   gh repo create poetapps/quillier --public --source . --push
   ```

   If you use a different name, update `repository` and `build.publish` in `package.json`, and the `poetapps/quillier` links in `site/index.html`.

2. The website is the `quillier` project on Vercel (team poetapps' projects), connected to this repo with **Root Directory** `site` and no build step. Every push to `main` deploys it; other branches get preview URLs. `quillier.com` is registered through Vercel and uses its nameservers, and `www.quillier.com` redirects to it.

## Cutting a release

```bash
npm version patch          # or minor / major: bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

The **Release** workflow builds macOS, Windows and Linux in parallel (about 10 minutes) and uploads everything to a **draft** release. Open it on GitHub, write the notes, and click **Publish**. Until you publish, nobody sees it: not the website and not the app.

To try a build locally without publishing, run `npm run dist`. The output goes to `release/`.

## How updates behave

| | Finds new versions | Installs them |
|---|---|---|
| macOS (signed) | yes | downloads quietly, installs when the app quits (or **Restart now** in Settings) |
| Windows | yes | same as macOS |
| Linux (AppImage) | yes | same as macOS |

macOS won't let an app update itself unless it's signed with an Apple Developer ID. The app checks its own signature at runtime: a build without one (a local `npm run dist`, or a CI build before the signing secrets exist) still finds new versions but offers **Download** instead, which opens the website.

Anyone can turn off **Check automatically** in Settings. After that, it only checks when they ask.

## Signing

### macOS (do this before the first public release)

The website assumes Mac builds are signed: it has no "how to open an unsigned app" note for Mac. Unsigned builds would get a Gatekeeper warning on first open and couldn't update themselves. Signing needs the Apple Developer Program, $99/year.

1. In your Apple Developer account, create a **Developer ID Application** certificate and export it from Keychain Access as a `.p12`.
2. Add these repository secrets (**Settings → Secrets and variables → Actions**):
   - `MAC_CERT_P12_BASE64`: the output of `base64 -i certificate.p12`
   - `MAC_CERT_PASSWORD`: the `.p12` password
   - `APPLE_ID`: your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD`: create one at appleid.apple.com
   - `APPLE_TEAM_ID`: from the Membership page of your developer account
3. In `package.json` under `build.mac`, delete `"identity": "-"` and `"hardenedRuntime": false`. (They make local builds ad-hoc signed so they run at all; leave them until you have the certificate.)

From then on every release is signed and notarized. Sign the very first public release, so nobody ends up on a version that can't update itself.

### Windows (optional)

Unsigned installers get a SmartScreen "Windows protected your PC" screen; the website explains **More info → Run anyway**. To remove it, use a code-signing service such as Azure Trusted Signing (paid monthly) or SignPath's free program for open-source projects, then add the matching `win` signing settings to `package.json`.
