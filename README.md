# LADOT Reporter

A small Next.js-based reporter for vehicle/plate analysis and review. This repository contains the reporter frontend (Next.js) and shared code used by the project.

The README covers how the project is organized, how to set up a local dev environment, how to run the app, environment variables, and troubleshooting tips (including Node and Next.js/Turbopack notes).

---

## Repository layout

- `ladot-reporter/` — The Next.js app. This is the main developer-facing app and contains `package.json`, `src/` and `public/`.
- `src/` — Top-level source for shared components and utilities used by the app.
- `ladot-reporter/.env.local` — Local environment file (not committed). Put API keys and tokens here.

If you see multiple `package-lock.json` files (root and inside `ladot-reporter`), Next.js/Turbopack may infer the wrong workspace root. See the Turbopack note below.

## Quick start (developer)

Prerequisites
- macOS (this doc assumes macOS and zsh)
- Homebrew installed (recommended)
- Node.js >= 20.9.0 (Next.js >= 16 requires Node >= 20.9.0)

1) Install Node 20 (system-wide via Homebrew)

```bash
brew update
brew install node@20
# make node@20 available in your shell (one-liner for this session)
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
# add the export to ~/.zshrc for future shells (if not already present)
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
```

2) Install dependencies for the Next.js app

```bash
cd ladot-reporter
npm ci
```

3) Start the dev server

```bash
npm run dev
# By default (in this project): http://localhost:8087
```

Notes
- If you prefer per-user toolchains, you can also use Volta or nvm instead of Homebrew.

## Environment variables

Create `ladot-reporter/.env.local` (this file should not be committed). The app expects keys such as:

- `PLATE_RECOGNIZER_TOKEN` — (optional) token for PlateRecognizer (if you use that service).
- `GEMINI_API_KEY` — API key for Gemini (or generative API) when using the server-side integration. Prefer service account/OAuth for production.

Do NOT commit secrets to the repository. Keep them in `.env.local` or the host environment.

Example `.env.local` (DO NOT CHECK IN):

```
# PlateRecognizer token (example placeholder)
PLATE_RECOGNIZER_TOKEN=your_plate_recognizer_token_here

# Gemini / Google Generative API key (server-side only)
GEMINI_API_KEY=your_gemini_api_key_here
```

## Gemini integration notes (vehicle characteristic extraction)

- We recommend using a compact/fast model (e.g. `gemini-3.1-flash-lite`) for high throughput and low latency when extracting vehicle characteristics (make, model, color, body type, year estimate).
- Keep all calls server-side (an API route) so you don't expose API keys to the browser.
- Use a strict prompt that instructs the model to return only JSON in a fixed schema (see `src/lib` or your API integration code if you add it).
- Implement retry/backoff and concurrency caps to handle rate limits.

If you'd like, this repo can include an API route to accept an image (URL or direct upload), call Gemini with a strict JSON-only prompt, validate the returned JSON, and return normalized results.

## Turbopack / Next.js notes

- Next.js 16 uses Turbopack. It may warn if multiple lockfiles exist and it inferred the workspace root incorrectly. If you see a startup warning like "Next.js inferred your workspace root," you can:
  - set `turbopack.root` in `next.config.js`, or
  - remove the extra lockfile if it's not needed.

- If you see permission errors writing to the `.next` folder (e.g. `Permission denied (os error 13)`), fix it by either:

  1) Deleting the `.next` directory and letting Next recreate it:

  ```bash
  cd ladot-reporter
  rm -rf .next
  npm run dev
  ```

  2) Or fix ownership/permissions (if .next was created by another user):

  ```bash
  cd ladot-reporter
  sudo chown -R $(id -u):$(id -g) .next
  chmod -R u+rwX .next
  npm run dev
  ```

## Troubleshooting

- `zsh: command not found: next` after `npm run dev` — ensure `node_modules/.bin` is present and Node is the correct version. Running `npm ci` then `npx next dev -p 8087` can help isolate issues.
- Model/API auth errors — validate `GEMINI_API_KEY` or use a service account token.
- High CPU/memory usage — consider using `gemini-3.1-flash-lite` or add rate-limiting and worker queues for heavy workloads.

## Contributing

If you want to contribute, open a PR against `main`. Keep the following in mind:

- Add tests for any new server-side logic (example: validation of model output JSON).
- Keep secrets out of code. Use `.env.local` for local testing.

## License

This project uses the license specified in the `package.json` (ISC).

---

If you'd like, I can also:
- Add an API route that calls Gemini and normalizes vehicle data.
- Add a CONTRIBUTING.md and PR checklist.
- Create a simple GitHub Actions workflow that runs linting/tests on push.

If you want any of those, tell me which and I will add them.
