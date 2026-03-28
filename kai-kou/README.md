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
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_APP_URL=http://localhost:5173
```

You can use `.env.example` as a template.

## WFD Audio De-risk Workflow (Google TTS)

### Runtime Mapping (Current Frontend Behavior)

WFD audio URL now resolves in this order:

1. `audio_path` mapped to public storage URL:
   `https://<supabase-url>/storage/v1/object/public/question-audio/<audio_path>`
2. fallback `audio_url` only when `audio_path` is missing
3. fallback by id:
   `https://<supabase-url>/storage/v1/object/public/question-audio/wfd/<id>.mp3`

This means you can keep `audio_path` like `wfd/WFD_001.mp3` if your uploaded file uses the same path.

### Prerequisites

1. Enable Google Cloud billing.
2. Enable `Cloud Text-to-Speech API`.
3. Create a service account with TTS permission and download JSON key.
4. Set local credential env:
   `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\gcp-service-account.json`
5. Prepare your source workbook:
   `WFD_cleaned_with_wordcount_difficulty.xlsx` (sheet: `WFD`).

### Install Dependencies

```bash
npm install
```

### Generate WFD MP3 Locally (Offline Batch)

Default command:

```bash
npm run wfd:tts:generate
```

Recommended explicit command:

```bash
npm run wfd:tts:generate -- --inputFile "d:\Desktop\WFD_cleaned_with_wordcount_difficulty.xlsx" --sheetName WFD --outputDir "d:\PTE\wfd\audio" --outputQuestionFile "d:\PTE\wfd\WFD_with_generated_audio.xlsx" --reportFile "d:\PTE\wfd\tts_generation_report.json" --skipExisting true
```

Outputs:

1. MP3 files under `outputDir` (preserving `audio_path` when present).
2. New workbook (`WFD_with_generated_audio.xlsx` by default), never overwriting original.
3. `tts_generation_report.json` with success/failure summary and failed ids.

### Optional: Upload Generated Audio to Supabase Storage

Required env:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`

Run upload:

```bash
npm run wfd:audio:upload -- --inputFile "d:\PTE\wfd\WFD_with_generated_audio.xlsx" --audioDir "d:\PTE\wfd\audio" --bucket question-audio --storagePrefix "" --outputQuestionFile "d:\PTE\wfd\WFD_with_uploaded_audio.xlsx" --reportFile "d:\PTE\wfd\tts_upload_report.json"
```

Upload script will:

1. Upload local MP3 files to Supabase Storage.
2. Fill `audio_url` in exported workbook using public URL.
3. Keep `audio_path` by default (set `WFD_UPLOAD_UPDATE_AUDIO_PATH=true` to rewrite).
4. Generate `tts_upload_report.json`.

### Verification Checklist

1. Confirm report JSON has `failedCount = 0` (or inspect failed ids).
2. Confirm exported workbook has:
   `audio_path`, `audio_file_size_bytes`, `audio_duration_seconds`.
3. Confirm uploaded objects are visible in bucket `question-audio`.
4. Confirm WFD pages can play new audio by question id/path.

## Supabase Setup

Run these SQL statements in Supabase SQL Editor:

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_since TIMESTAMPTZ,
  trial_days INTEGER DEFAULT 0,
  trial_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE practice_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  question_id TEXT NOT NULL,
  transcript TEXT,
  score_json JSONB,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own logs"
  ON practice_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own logs"
  ON practice_logs FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

If `profiles` already exists, run:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_granted_at TIMESTAMPTZ;
```

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

3. In Vercel project settings, add environment variables:

- `GEMINI_API_KEY` (Production + Preview + Development)
- `VITE_SUPABASE_URL` (Production + Preview + Development)
- `VITE_SUPABASE_ANON_KEY` (Production + Preview + Development)

4. Redeploy after saving env vars.

## Verify After Deployment

- Home page loads correctly.
- Register can receive confirmation email and sign in successfully.
- Login page has "忘记密码"入口 and reset flow works.
- `/ra` can request microphone permission on mobile.
- After recording and submit, result page shows real AI scoring output.
