[[Stackd|Stackd]]

A general-purpose study app. Any subject, any source, any language.

Paste text, drop a PDF, or give a URL. Stackd generates cards, groups them by topic, and schedules daily review.

---
## **1. Positioning**
### *1.1. The gap*
"AI cards plus SRS" is no longer a gap. Knowt, StudyGlen, RemNote, DeckStudy, Laxu AI and Quizlet Magic Notes all ship it, several for free.

The real gap is between the two apps everyone actually uses:

|               | Anki                 | Quizlet           | Stackd           |
| ------------- | -------------------- | ----------------- | ---------------- |
| Scheduler     | Best in class (FSRS) | Weak              | FSRS             |
| Card creation | Fully manual         | AI, shallow       | AI, deep         |
| Interface     | Hostile              | Good              | Good             |
| Setup time    | Hours                | Minutes           | Under 60 seconds |
| Free tier     | Free forever         | Gutted since 2024 | Usable forever   |

**Anki has the brain. Quizlet has the face. Nobody has both.**

That is the pitch, and it works for every subject. No narrowing required.
### *1.2. Audience*
**All of them.** Students, professionals, language learners, hobbyists.

But the first 1,000 users come from somewhere specific. That is a landing page decision, not an architecture decision. Build general, market narrow, widen as you grow.

**Launch door:** Vietnam and SEA. Local language, local pricing, local payment rails. Quizlet and Knowt are English-first American products with no local presence.

**Second door:** cert candidates (AWS, Azure, CompTIA). High intent, high willingness to pay, and they find you through search.

Nothing in the codebase hardcodes either.

### *1.3. What this costs*
General purpose is the right end state. Be clear-eyed about the trade.
- EdTech has the worst freemium conversion of any category: roughly 2.6% average
- SEA converts at about half the North American rate (1.37% vs 2.56% day-35)
- Students expect free. Quizlet Plus at $35.99/year is already "too expensive" to them
- AI apps earn 41% more per customer but churn 30% faster

**Practical effect:** at ~$6/month and ~2% conversion, $5k MRR needs roughly 42,000 free users. A cert-only product would need ~10,000.

You are trading a hard product problem for a hard distribution problem. Plan for distribution accordingly: SEO, public decks, Anki import, word of mouth.

## **2. Architecture**
### *2.1. Surfaces*

| Surface           | Status | Notes                                                   |
| ----------------- | ------ | ------------------------------------------------------- |
| Web app (PWA)     | v1     | Next.js, installable, push-capable                      |
| Mobile            | v2     | React Native / Expo, one codebase                       |
| Browser extension | v3     | Real value for language learners, low for everyone else |

Native Swift plus Kotlin is two extra codebases for a team this size. Revisit only when a real constraint appears.

### *2.2. Ingestion*
All inputs converge on the same generation step. Runs async on a job queue, never in a request handler.
1. **Text** received directly, chunked
2. **PDF** parsed, chunked
3. **URL** fetched via Jina Reader, returns markdown, chunked
4. **Images** OCR, for handwritten notes and textbook photos (v2, high student demand)

**PDF parser: use Docling, not markitdown.** Benchmarks put markitdown near 82% F1 versus Docling at 88%, and markitdown loses table structure on multi-column layouts with no OCR path. Tables matter across every subject.

Alternative worth testing: skip extraction, send the PDF straight to a multimodal model. Fewer moving parts.

Each chunk returns `{front, back, topic, card_type, source_ref}`.

`source_ref` is non-negotiable. Every card links back to its source chunk so users can verify. AI errors are silent otherwise.

**Language:** detect source language, generate cards in it by default. Do not force English. This is most of the Vietnam advantage.

### *2.3. Topic mastery (the moat)*
Cards are auto-clustered into topics at generation time. The dashboard shows mastery per topic, not one global percentage.

- Generic case: infer topics from the source material
- Known-exam case: snap to the official taxonomy (AWS domains, IELTS bands, CEFR levels)

Same feature, higher fidelity when structured data exists. This is what turns a flashcard app into a study app: it answers _where am I weak_, which nothing in this category does well.

### *2.4. Scheduler: FSRS, not SM-2*
SM-2 is from 1987. Anki made FSRS the default in 25.07 and it hits the same retention with 20 to 30 percent fewer reviews, trained on 700M+ real reviews.

Shipping SM-2 means shipping a worse engine than the free competitor, and losing the "same algorithm Anki uses" marketing line.
- Use an open-source FSRS implementation
- Per card: `stability`, `difficulty`, `due_date`
- **Four ratings, not five:** Again / Hard / Good / Easy
- `GET /review/queue` returns due cards, paginated, hard limit per page

Five-point scales add decision friction on every card. At 200 reviews a day that compounds.

### *2.5. Stack*

|Layer|Pick|Why|
|---|---|---|
|Frontend|Next.js, PWA|One codebase to start|
|DB + auth|Supabase Pro|Auth bundled, $25/mo|
|Queue|Supabase / Redis worker|Ingestion is slow and bursty|
|LLM|Gemini 3.1 Flash-Lite|Cheap, 1M context, strong multilingual|
|URL fetch|Jina Reader|$0.02/M tokens, handles PDFs|
|PDF parse|Docling|Table fidelity|
|Email|Resend|Digests only, not daily reminders|
|Push|Web Push, then native|Primary retention channel|
## **3. Retention**
### *3.1. The core principle*
Duolingo has to manufacture a reason to return daily. Stackd does not: due cards are a real obligation with real value. Guilt-heavy streak pressure inflates DAU short term, then gets the app muted and deleted.

Amplify the intrinsic loop. Do not fake one.

### *3.2. Mechanics, ranked*
1. **Goal date.** User sets an exam, test, or target date. "23 days left. 47 cards due." Works for a cert, a midterm, or an IELTS booking. Stronger than an abstract streak.
2. **Push notifications.** Email cannot carry daily reminders, and Resend's free tier caps at 100/day anyway.
3. **Streak with forgiveness.** Freezes and repairs. One bad day must not nuke months of progress.
4. **Mastery that moves.** Visible tick upward per topic after every session.
5. **Generate before signup.** Paste text on the landing page, see real cards, then sign up to save.

**Day 0 is everything.** Around half of paid conversions and most cancellations happen in the first session. Optimize the first 60 seconds harder than anything else.

**Skipped for now:** leagues and leaderboards. Revisit only if the student segment dominates and asks for it.

### *3.3. The free tier gate*
Capping free users at 30 cards for life kills the product before it works. Habits form over 1 to 2 weeks. A lifetime cap means the wall arrives on day one, before a single card comes due, so the user never experiences spaced repetition at all.

**Gate generation, not review.**

| |Old|New|
|---|---|---|
|Cap|30 cards, lifetime|50 new cards per month|
|Reviews|Capped by extension|Unlimited, forever|
|Trigger fires|Once, day one|Every month, on demand|

Your competitors are free. A hostile free tier loses to Knowt before the comparison starts. The free tier is a marketing channel, not a trap.

## **4. Pricing**
### *4.1. Tiers*

**Free**
- 50 new cards per month, unlimited reviews
- Text paste, unlimited decks
- Full FSRS queue and topic mastery
- Anki import and export

**Pro, $6/month or $48/year**
- Unlimited generation
- PDF, URL and image ingestion
- All card types including cloze and scenario
- Full history, leech detection, offline review
- Weekly digest

**Regional pricing:** 50 to 60 percent off in SEA, LATAM, South Asia. Standard practice, and mandatory if Vietnam is the launch door.

Anki export stays free. It is an acquisition wedge, not a paywall.

**Held back:** Exam mode (practice tests, official blueprint mapping, readiness score) as a later paid add-on around $12. Ship it only once cert users actually show up in the data. Do not build three tiers pre-revenue.

**Why $6 and not $12:** Quizlet Plus is $35.99/year, DeckStudy $3.99/month, Laxu $4.99/month, Knowt mostly free. General purpose means students, and students anchor on those numbers. $12 works for a professional with a $150 voucher, not for a sophomore.

### *4.2. Payments*
**Stripe does not offer merchant accounts in Vietnam.** Two options:

|Path|Cost|Trade-off|
|---|---|---|
|Merchant of Record|~4 to 5% + $0.50|Tax handled, fastest to launch|
|Foreign entity (SG/US/UK)|Stripe rates plus setup|Cheaper long term, slower start|

MoR candidates: Creem (3.9% + 40c), Dodo (4% + 40c), Paddle and Polar (5% + 50c). Lemon Squeezy is Stripe-owned with a quiet roadmap.

At $6/month a 5% + $0.50 MoR takes 13 percent of revenue. On the $48 annual plan it takes 6 percent. **Push annual hard.** Small-ticket monthly billing is where fixed per-transaction fees hurt most.

Mobile adds Apple's cut: 15% under the Small Business Program (under $1M/yr). US external links are 0% today but Apple has proposed 5 to 15% and the courts have not settled it. Model 15%.

Vietnam needs MoMo and ZaloPay. Card penetration is low.

### *4.3. Unit economics*

AI cost is not the constraint. Distribution is.

|Item|Cost|
|---|---|
|60-page PDF, ~40k in / 8k out|~$0.02|
|Heavy user, 50 docs/month|~$1.00|
|Supabase Pro|$25/mo|
|Resend|$0 to $20/mo|
|Hosting and domain|~$20/mo|
|**Fixed, pre-revenue**|**~$50 to $80/mo**|

Gemini 2.5 Flash-Lite retires 16 Oct 2026. Budget on 3.1 Flash-Lite at $0.25/$1.50 per million tokens.

**Watch the free-tier burn.** At 50 cards/month per free user, 40,000 free users costs a few hundred dollars a month in generation with nothing coming back. Rate-limit hard and cache aggressively.

## **5. Card types**

|Type|Front|Back|Tier|
|---|---|---|---|
|`qa`|Question|Answer|All|
|`cloze`|Masked text|Reveal|Pro|
|`definition`|Term|Definition plus usage|Pro|
|`scenario`|Applied situation|Answer plus why others fail|Pro|
|`vocab`|Word|Meaning, example, audio|Pro|

`scenario` and `vocab` are the two that generalize furthest. Scenario serves certs, medicine, and law. Vocab serves language learners, which is half the flashcard market.

## **6. Design**
**The review screen is the product.** It is 90 percent of usage. Everything else is scaffolding.
- Keyboard first: space to flip, 1 to 4 to rate
- Sub-100ms transitions, zero layout shift on flip
- Inline edit and delete during review (AI cards will be wrong sometimes)
- Show the next interval. Invisible schedulers breed distrust
- Dark mode is table stakes for evening study
- Mobile: rating buttons in the thumb zone
- Verify the font stack renders Vietnamese diacritics. Many display fonts do not

**Anki's real weakness is not "dated UI."** It is setup complexity and manual card creation. Time to first review is the metric to beat. Target under 60 seconds from paste.

## **7. Distribution**
Now the hardest problem. Budget real time here, not leftover time.
- **Anki import.** One-click `.apkg` import, free forever. Every Anki user is a qualified lead.
- **Quizlet import.** Knowt's single most effective growth lever. Copy it.
- **Public decks, SEO-indexed.** At general scale this is a real channel. Needs moderation.
- **Vietnam-language content and community.** Zero competition here today.
- **Free tier as the funnel.** Free users are the marketing channel, not a leak to be plugged.

## **8. Open questions**
- Which door first: Vietnam students, or English-language cert search traffic?
- How to validate card accuracy at scale? User reporting alone will lag
- Free-tier generation burn: what is the real per-user cost at 10k, 50k users?
- Public deck moderation: manual, automated, or delayed until v2?
- MoR versus foreign entity: decide before writing any billing code

## **9. Cut list**
Do not rebuild these without a reason:
- Native Swift and Kotlin apps
- Public API access
- Lifetime free card cap
- Three-tier pricing pre-revenue
- $12 flat pricing (professional tier only, later)
- Browser extension before mobile