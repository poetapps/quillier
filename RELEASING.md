# Releasing Quillier

Everything ships through GitHub Releases on `poetapps/quillier`:

- **The website** (`site/`, hosted on Vercel) links its download buttons to `releases/latest/download/<file>`, so they always serve the newest published release. The file names never change: `Quillier-mac-arm64.dmg` (Apple Silicon), `Quillier-mac-x64.dmg` (Intel), `Quillier-Setup.exe`, `Quillier-linux.AppImage`. Mac apps are built per chip rather than universal, which roughly halves the download; the updater picks the right one for each Mac.
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

To try a build locally without publishing, run `npm run dist`. The output goes to `release/`. On a Mac without the Developer ID certificate in its keychain, run `npm run dist -- -c.mac.identity=-` instead: an Apple Silicon build that isn't signed at all won't open.

## How updates behave

| | Finds new versions | Installs them |
|---|---|---|
| macOS (signed) | yes | downloads quietly, installs when the app quits (or **Restart now** in Settings) |
| Windows | yes | same as macOS |
| Linux (AppImage) | yes | same as macOS |

macOS won't let an app update itself unless it's signed with an Apple Developer ID. The app checks its own signature at runtime: a build without one (a local `npm run dist`, or a CI build before the signing secrets exist) still finds new versions but offers **Download** instead, which opens the website.

Anyone can turn off **Check automatically** in Settings. After that, it only checks when they ask.

## Signing

### macOS

The website assumes Mac builds are signed: it has no "how to open an unsigned app" note for Mac. Unsigned builds would get a Gatekeeper warning on first open and couldn't update themselves.

Releases are signed with a **Developer ID Application** certificate (G2 Sub-CA, team `2SBDX72C95`, expires 2027-11-25) and notarized by Apple. Its private key, certificate and a setup script live in `~/.quillier-signing/` on the Mac that created them; back that folder up somewhere safe, since the key can't be downloaded again.

The Release workflow reads these repository secrets, which `~/.quillier-signing/set-github-secrets.sh` uploads:

- `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`: the certificate and key as a `.p12`, and its password
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: for notarization (make the app-specific password at account.apple.com → Sign-In and Security)

Without them, Mac builds come out unsigned. When the certificate expires, create a new one the same way (a CSR from the key, uploaded at developer.apple.com → Certificates) and run the script again.

### Windows (optional)

Unsigned installers get a SmartScreen "Windows protected your PC" screen; the website explains **More info → Run anyway**. To remove it, use a code-signing service such as Azure Trusted Signing (paid monthly) or SignPath's free program for open-source projects, then add the matching `win` signing settings to `package.json`.
