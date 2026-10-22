## **1. Overview**
Stackd is an AI-powered flashcard generation and spaced repetition study tool targeting professionals preparing for high-stakes certification exams.

Users feed raw material - pasted text, PDFs, or URLs - into Stackd, which generates structured flashcards automatically using AI and schedules them for review using the SM-2 spaced repetition algorithm.

### *1.1. Problem statement*
Existing flashcard tools fail certification exam candidates in two critical ways:
- Quizlet relies on user-generated content that is frequently inaccurate, outdated, or too shallow for scenario-based exam formats like AWS certifications.
- Anki has superior SRS mechanics but zero modern UX and no AI generation.

No current tool combines high-quality AI card generation from any source format with a proper SRS scheduler in a clean, fast interface.

-> **Stackd** automates the most painful part of exam prep - turning raw study material into a daily, structured review queue - so users can spend time actually learning instead of formatting cards.

### *1.2. Target*
The primary beachhead audience is working professionals and career-switchers preparing for cloud and IT certification exams.

> AWS (CLF-C02, SAA-C03, DVA-C02), Azure, GCP, CompTIA (A+, Security+, Network+), and similar.

The secondary expansion audience is English language exam candidates (IELTS, TOEFL, TOEIC), particularly in Vietnam and Southeast Asia.

Stackd **SHOULD BE** a general-purpose study app. It should scale to all audiences and topics.

## **2. Architecture**
### *2.1. System overview*
Stackd consists of three client surfaces sharing one backend:
- a web app
- a browser extension (one-click card creation from any webpage)
- a mobile app
	- Swift for iOS
	- Kotlin for Android

All surfaces authenticate against the same backend and share the same card and deck data.

### *2.2. Proposed Ingestion pipeline*
All three input types converge on the same card generation step:
1. Text input - received directly, chunked
2. PDF input - extracted with lib (probably `markitdown` or any other suitable libs, we want to retain tables and images), then chunked
3. URL input - fetched via Reader API, returns clean markdown, then chunked
4. Future input implementations for other file types.

Each chunk is sent to an LLM API with a structured prompt that returns a JSON array of `{front, back, tags, card_type}` objects. Cards are written to Postgres and associated with the target deck.

> research which API is suitable

### *2.3. SRS scheduler*
Stackd implements the SM-2 algorithm. Each card carries `ease_factor` (default 2.5), `interval` (days), and `due_date` fields. On each review, the user rates the card 1-5. The scheduler updates ease factor and interval and sets the next due date. Cards are surfaced via `GET /review/queue` which returns all cards where `due_date <= today`, ordered by due date.

### *2.4. Infrastructure*
WIP

## **3. Features and paywall**
The appeal of gamification is real and we need to take advantage of that, most users now lack a lot of discipline, so we need to HOOK them

> this is a great matter of research that needs hours and hours to figure out the right pattern, right now I could only think of streaks (like Duolingo), make it adapted to brainrotted people (which is everyone basically).
>
> should probably use Claude Design to design the UI

### *3.1. Free tier*
The free tier is designed to let users fully experience the core loop - generate cards, do a review session - but cap them at a volume that hits the wall naturally after one serious study session.
- 30 cards total (lifetime cap across all decks)
- Text paste input only
- Up to 3 decks
- Full SRS review queue and flip-card UI
- Today's stats only (no history)
- No PDF or URL ingestion
- No browser extension access
- No export

The 30-card cap is the primary conversion trigger. A typical AWS certification lecture or whitepaper section generates 40-80 cards.

The user hits the wall at card 31, at which point the upgrade prompt appears inline.

### *3.2. Plus tier - $6/month or $58/year*
- Unlimited cards and decks
- PDF ingestion
- URL ingestion
- Browser extension
- Export to many formats
- 30-day review history
- Weekly email digest with streak and progress summary
- Streak tracking and daily review reminders via Resend

### 3.3. Pro tier - $12/month or $115/year*
- Everything in Plus
- Smart mode - card generation uses a **better AI model than the Pro tier**; produces scenario-based question fronts, cloze deletions, and explanation-enriched backs
- Shared and public decks (SEO-indexed deck pages)
- API access for custom integrations
- Priority ingestion queue

### *3.4. Card types*
Stackd supports three card types surfaced through the review UI:
- `qa` - standard question/answer, default for all tiers
- `cloze` - fill-in-the-blank format rendered as masked text with reveal; generated in Smart mode
- `definition` - term on front, definition plus usage example on back; generated in Smart mode

### *3.5. Smart mode prompt design*
Smart mode (Pro) switches the ingestion model to ***the better model*** and uses a cert-specific prompt that generates scenario-based question fronts matching the actual exam format.

> For AWS content, this means questions framed as "A company needs X - which service and configuration?" rather than "What is X?"
>
> This is the primary differentiator against Quizlet's Magic Notes, which generates surface-level definition cards from the same input.
