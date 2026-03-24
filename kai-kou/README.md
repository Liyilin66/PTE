# Kai-Kou (PTE Coach)

## Local Development

```bash
npm install
npm run dev
```

If you need to run the local API service for scoring:

```bash
npm run dev:api
```

## Environment Variables

Create `.env` in project root:

```bash
GEMINI_API_KEY=your_real_gemini_api_key
```

You can use `.env.example` as a template.

## Deploy to Vercel

1. Install and log in:

```bash
npm install -g vercel
vercel login
```

2. Deploy from project root:

```bash
vercel
```

3. In Vercel project settings, add environment variable:

- `GEMINI_API_KEY` (Production + Preview + Development)

4. Redeploy after saving env vars.

## Verify After Deployment

- Home page loads correctly.
- `/ra` can request microphone permission on mobile.
- After recording and submit, result page shows real AI scoring output.
