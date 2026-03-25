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

## Supabase Setup

Run these SQL statements in Supabase SQL Editor:

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_since TIMESTAMPTZ,
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
