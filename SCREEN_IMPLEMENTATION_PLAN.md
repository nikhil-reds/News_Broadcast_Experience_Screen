# Screen-by-Screen Implementation Plan

## Overview
12 broadcast display screens with specific requirements. Current status: Screens 1-6 working, 7-12 are mockups needing real ffmpeg composition.

---

## 📺 SCREEN 1: Camera 01 Feed

**Current Status:** ✅ **WORKING**

### What It Does
- Displays raw Camera 1 video feed on loop
- Auto-plays the latest camera recording
- Full-screen continuous looping

### Current Implementation
- Component: `RecordingLooper` with `source={{ camera: 1 }}`
- File: `app/(screens)/screen1/page.tsx`
- Storage: MinIO `videos` bucket
- Logic: Fetches latest `cam1-*.webm` and loops it

### What to Fix
- ✅ No fixes needed - this works

### Testing
```bash
# 1. Navigate to http://localhost:3000/camera
# 2. Record Camera 1 for 30 seconds
# 3. Go to http://localhost:3000/screen1
# 4. Should see looping video
```

---

## 📺 SCREEN 2: Camera 02 Feed

**Current Status:** ✅ **WORKING**

### What It Does
- Displays raw Camera 2 video feed on loop
- Auto-plays the latest camera recording
- Full-screen continuous looping

### Current Implementation
- Component: `RecordingLooper` with `source={{ camera: 2 }}`
- File: `app/(screens)/screen2/page.tsx`
- Storage: MinIO `videos` bucket
- Logic: Fetches latest `cam2-*.webm` and loops it

### What to Fix
- ✅ No fixes needed - this works

### Testing
```bash
# 1. Navigate to http://localhost:3000/camera
# 2. Record Camera 2 for 30 seconds
# 3. Go to http://localhost:3000/screen2
# 4. Should see looping video
```

---

## 📺 SCREEN 3: Camera 03 Feed

**Current Status:** ✅ **WORKING**

### What It Does
- Displays raw Camera 3 video feed on loop
- Auto-plays the latest camera recording
- Full-screen continuous looping

### Current Implementation
- Component: `RecordingLooper` with `source={{ camera: 3 }}`
- File: `app/(screens)/screen3/page.tsx`
- Storage: MinIO `videos` bucket
- Logic: Fetches latest `cam3-*.webm` and loops it

### What to Fix
- ✅ No fixes needed - this works

### Testing
```bash
# 1. Navigate to http://localhost:3000/camera
# 2. Record Camera 3 for 30 seconds
# 3. Go to http://localhost:3000/screen3
# 4. Should see looping video
```

---

## 📺 SCREEN 4: Teleprompter (English + Audio)

**Current Status:** ⚠️ **MOSTLY WORKING** (minor UX improvements needed)

### What It Does
- Shows large animated text of English transcript
- Auto-syncs with audio playback
- Rotary knob controls volume
- Highlights current sentence being spoken
- Text fades in/out as segments play

### Current Implementation
- File: `app/(screens)/screen4/page.tsx` (600+ lines)
- Displays: Audio player + animated transcript display
- Hardware: Nexmosphere rotary knob for volume
- Auto-scroll: Active segment highlighted and scrolled into view
- Fade effect: Text fades out/in between segments

### Issues to Fix

#### 1️⃣ **Audio Selection UI**
**Status:** ⚠️ Minor
- Currently shows dropdown of all audio files
- **Fix needed:** Make the "Select Audio" dropdown cleaner
  - Show only latest 5 audio files
  - Add timestamp to each option
  - Sort by newest first (already done)

#### 2️⃣ **Transcript Display Size**
**Status:** ⚠️ Minor UX
- Current: Large but sometimes hard to read from distance
- **Fix needed:**
  - Increase base font size (currently `text-2xl`)
  - Change to `text-4xl` or `text-5xl` for broadcast view
  - Ensure text stays visible at 10+ feet distance

#### 3️⃣ **Fade Transition Timing**
**Status:** ⚠️ Edge case
- Current: 300ms fade in + out
- **Fix needed:**
  - If segments are < 2 seconds apart, fade might overlap
  - Add delay logic to prevent flashing
  - Test with fast-spoken content

#### 4️⃣ **Handle Missing Transcript**
**Status:** ⚠️ Edge case
- If audio is selected but no transcript exists yet
- Current: Shows "No transcript loaded"
- **Fix needed:**
  - Add "Transcribing..." status
  - Show progress (e.g., "Waiting for Whisper worker...")
  - Auto-refresh when transcript becomes available

### Implementation Tasks

```markdown
### Task 1: Increase Display Font Size
- [ ] Open app/(screens)/screen4/page.tsx
- [ ] Find: className="text-2xl" for displayText
- [ ] Change to: className="text-5xl font-bold"
- [ ] Test readability from 10+ feet away
- [ ] Adjust padding/line-height as needed
- Files: app/(screens)/screen4/page.tsx (line ~280)

### Task 2: Improve Audio File Dropdown
- [ ] Limit dropdown to last 5 files
- [ ] Add formatted timestamp (HH:MM format)
- [ ] Show file size
- [ ] Make styling match broadcast aesthetic
- Files: app/(screens)/screen4/page.tsx (line ~200-220)

### Task 3: Handle Transcription In Progress
- [ ] Add loading state when audio selected but transcript missing
- [ ] Show "Transcribing..." message
- [ ] Poll /api/transcript/english every 2 seconds
- [ ] Auto-load when transcript becomes available
- [ ] Show estimated time remaining
- Files: app/(screens)/screen4/page.tsx

### Task 4: Test Fade Timing Edge Cases
- [ ] Record audio with fast-paced talking (news anchor style)
- [ ] Verify no text flashing or overlapping
- [ ] Adjust fadeState transition timing if needed
- [ ] Test with multi-sentence segments
```

### Testing Checklist
```bash
# Test 1: Basic playback
# 1. Go to /camera and record 60 seconds of audio
# 2. Go to /screen4
# 3. Select audio from dropdown
# 4. Wait for transcription (check worker output)
# 5. Audio should play with synchronized text

# Test 2: Volume control
# 6. Rotate Nexmosphere knob (or use slider below video)
# 7. Volume should increase/decrease smoothly
# 8. Value should show 0-100%

# Test 3: Long transcript
# 9. Record 5+ minute audio
# 10. Verify text doesn't overflow screen
# 11. Verify active segment scrolls into view
# 12. Verify fades are smooth without flashing

# Test 4: Edge cases
# 13. Select audio before transcription completes
# 14. Should show "Transcribing..." message
# 15. Should auto-load when ready
```

---

## 📺 SCREEN 5: Language Selector + Audio Control

**Current Status:** ⚠️ **PARTIALLY WORKING** (needs refinement)

### What It Does
- Rotary knob to select language: English → German → Hindi → French → Spanish (circular)
- Displays transcript in selected language
- Auto-generates audio for selected language (if not cached)
- Shows translated text with segment timing
- Rotary knob changes language
- Full-bleed display like Screen 4

### Current Implementation
- File: `app/(screens)/screen5/page.tsx` (700+ lines)
- Uses: Nexmosphere rotary for language selection
- Backend: `/api/audio-language` (catalogue + job kickoff)
- Logic: Debounced language commits, on-demand translation+TTS
- Database: Caches translations to avoid re-generating

### Issues to Fix

#### 1️⃣ **Language Ring UI Clarity**
**Status:** ⚠️ Minor
- Current: Shows 5 languages in order, but unclear which is "active"
- **Fix needed:**
  - Add visual indicator (highlight, border, larger size) for current language
  - Show language name + flag emoji prominently
  - Add circular progress indicator showing position in language ring

#### 2️⃣ **TTS Generation Status**
**Status:** ⚠️ Important
- Current: Audio just plays when available
- **Fix needed:**
  - Show "Generating German audio..." while TTS worker is running
  - Show progress bar or spinner
  - Display how long it takes per language
  - Prevent user from changing language while TTS in progress

#### 3️⃣ **Segment Synchronization**
**Status:** ⚠️ Edge case
- Current: Text syncs to audio playback
- **Fix needed:**
  - Verify segment timing perfectly matches audio duration
  - Handle if TTS audio is slightly longer/shorter than original
  - Add small delay/speedup to stay in sync

#### 4️⃣ **Language Switching Mid-Playback**
**Status:** ⚠️ Critical
- Current: Can switch language while audio is playing
- **Fix needed:**
  - Stop current audio playback
  - Load new language audio
  - Restart from beginning OR preserve playback position
  - Decide on user experience (smooth transition vs reset)

#### 5️⃣ **Cache Management**
**Status:** ⚠️ Important
- Current: Translations cached in DB
- **Fix needed:**
  - Show "Cached" indicator if translation already exists
  - Show generation time on first use
  - Add ability to regenerate/refresh translation

### Implementation Tasks

```markdown
### Task 1: Add Active Language Indicator
- [ ] Create visual badge showing current language
- [ ] Use emoji flag for language (🇩🇪 🇮🇳 🇫🇷 🇪🇸 🏴󠁧󠁢󠁥󠁮󠁧󠁿)
- [ ] Show language name prominently (24px+ font)
- [ ] Add circular progress showing position (5 languages = 72° per step)
- [ ] Highlight background color changes per language
- Files: app/(screens)/screen5/page.tsx

### Task 2: Add TTS Generation Status
- [ ] When language selected, check if audio cached
- [ ] If not cached, show "Generating [Language] audio..."
- [ ] Poll /api/audio-language until audio is ready
- [ ] Show estimated time (typically 2-5 min per language)
- [ ] Disable language selector during generation
- [ ] Show spinner/progress bar
- Files: app/(screens)/screen5/page.tsx

### Task 3: Handle Language Switch During Playback
- [ ] When language changes, pause current audio
- [ ] Show toast: "Switched to [Language]"
- [ ] Load new language audio
- [ ] Ask user: "Resume from [current time] or start from beginning?"
- OR: Auto-resume at current position if timings match
- [ ] Add keyboard shortcut: Space to resume, R to restart
- Files: app/(screens)/screen5/page.tsx

### Task 4: Add Cache Indicators
- [ ] After TTS generation, mark as "✓ Cached"
- [ ] Show generation timestamp
- [ ] Add "Regenerate" button if user wants fresh audio
- [ ] Show which languages are cached vs not
- Files: app/(screens)/screen5/page.tsx

### Task 5: Sync Segment Timing
- [ ] Test each language audio: does it match transcript timing?
- [ ] Measure actual TTS duration vs expected
- [ ] If mismatch: adjust playback speed slightly OR re-align segments
- [ ] Log timing data for debugging
- Files: app/(screens)/screen5/page.tsx
```

### Dependencies
- ⏳ Requires: Screen 6 (Highlight Reel) to have timestamped segments
- ⏳ Requires: TTS worker to complete for each language
- ⏳ Requires: Translation segments saved to DB with accurate timing

### Testing Checklist
```bash
# Test 1: Language selection
# 1. Go to /screen5
# 2. Start with English audio playing
# 3. Rotate knob to German
# 4. Should see "Generating German audio..."
# 5. Wait for TTS to complete (2-5 min)
# 6. Audio should switch to German
# 7. Text should be German with timing synchronized

# Test 2: Multiple languages
# 8. Cycle through all 5 languages
# 9. Each should play correctly
# 10. Text should match audio

# Test 3: Cached languages
# 11. Switch to German again (already cached)
# 12. Should play instantly
# 13. Should show "✓ Cached" indicator
# 14. Should not re-generate audio

# Test 4: Edge cases
# 15. Change language while audio is playing
# 16. Verify audio stops and loads new language
# 17. Try pausing audio, then changing language
# 18. Verify playback position preserved (if implemented)
```

---

## 📺 SCREEN 6: Highlight Reel (Best Moments)

**Current Status:** ✅ **WORKING** (with Gemini + FFmpeg)

### What It Does
- Displays AI-selected highlight reel (30-120 seconds)
- Automatic: Gemini 2.5 Pro picks best moments from 3 cameras
- Auto-plays on loop
- Shows best dramatic/important moments only
- Combines all 3 camera angles intelligently

### Current Implementation
- File: `app/(screens)/screen6/page.tsx`
- Component: `RecordingLooper` with `source={{ highlight: true }}`
- Worker: `app/worker/highlight-reel.ts`
- Backend: `/api/save-recording` triggers pairing logic
- Pairing: Matches 3 camera uploads within 2-minute window
- Gemini: Watches all 3 videos, returns segment picks with reasoning
- FFmpeg: Cuts segments, normalizes, concatenates into final reel

### What to Fix

#### 1️⃣ **Gemini Prompt Optimization**
**Status:** ⚠️ Minor
- Current: Generic prompt for finding "engaging" moments
- **Fix needed:**
  - Tailor prompt for news broadcast (important quotes, reactions)
  - Ask Gemini to prefer moments with:
    - Speaker looking at camera
    - Dynamic lighting/background
    - Important gestures or expressions
    - Key narrative moments

#### 2️⃣ **Segment Validation**
**Status:** ⚠️ Edge case
- Current: `sanitizeSegments` checks basic validity
- **Fix needed:**
  - Verify timestamps are within video duration
  - Check minimum segment length (avoid < 1 second clips)
  - Ensure segments don't overlap
  - Add logging for rejected segments

#### 3️⃣ **Camera Selection Logic**
**Status:** ⚠️ Important
- Current: Gemini returns which camera for each segment
- **Fix needed:**
  - Verify camera numbers (1-3) are always valid
  - Handle if a camera's video is corrupt/missing
  - Fallback to another camera if selected one unavailable
  - Prefer camera with best framing (configurable)

#### 4️⃣ **Audio Handling**
**Status:** ⚠️ Important
- Current: Highlight reel is video-only
- **Fix needed:**
  - Extract audio from camera 1 (or best audio camera)
  - Include audio in highlight reel output
  - Sync audio timing with video cuts
  - Option: Use master audio instead

#### 5️⃣ **Duration Management**
**Status:** ⚠️ Minor
- Current: Reel length varies (30-120s)
- **Fix needed:**
  - Target reel length: 60 seconds (configurable)
  - If segments total < 60s: fill with buffer footage or static
  - If segments total > 60s: trim less important clips
  - Ensure smooth transitions between clips

### Implementation Tasks

```markdown
### Task 1: Improve Gemini Prompt
- [ ] Open lib/highlight-reel.ts
- [ ] Find: buildHighlightReel() function
- [ ] Update Gemini prompt to be news-specific
- [ ] Ask for: speaker eye contact, key moments, emotional reactions
- [ ] Test with 5 different recordings
- [ ] Verify results are news-appropriate
- Files: lib/highlight-reel.ts (line ~50-80)

### Task 2: Add Segment Validation
- [ ] Open lib/highlight-reel.ts
- [ ] Find: sanitizeSegments() function
- [ ] Add checks:
  -   [x] start < end
  -   [x] end <= videoDuration
  -   [x] duration >= 1 second
  -   [x] no overlapping segments
  - [ ] segment order is sequential
- [ ] Log rejected segments with reason
- Files: lib/highlight-reel.ts

### Task 3: Handle Missing/Corrupt Videos
- [ ] Before sending to Gemini, verify all 3 cameras exist in MinIO
- [ ] Check file size > 0
- [ ] Verify video is readable with ffprobe
- [ ] If any camera missing: still process other 2 cameras
- [ ] Log warnings for investigation
- Files: lib/highlight-reel.ts

### Task 4: Include Audio in Highlight Reel
- [ ] Extract audio from camera 1 video
- [ ] OR: Use master audio file (if available in job data)
- [ ] Sync audio to video cuts
- [ ] Use FFmpeg: copy audio stream without re-encoding
- [ ] Test audio/video sync (no lip-sync drift)
- Files: lib/ffmpeg.ts, lib/highlight-reel.ts

### Task 5: Target Reel to 60 Seconds
- [ ] Accept target duration parameter (default 60s)
- [ ] Calculate total segment duration
- [ ] If too short: pad with fade-to-black or B-roll
- [ ] If too long: trim based on Gemini's "reason" score
- [ ] Ensure minimum 3-4 segment cuts for variety
- Files: lib/highlight-reel.ts
```

### Testing Checklist
```bash
# Test 1: Highlight generation
# 1. Record 3 cameras for 2 minutes of news-style content
# 2. Include: looking at camera, gestures, changing scenes
# 3. Wait for highlight reel worker to complete (5-15 min)
# 4. Check /screen6 - should see 60-second highlight reel
# 5. Verify it shows best moments (not random clips)

# Test 2: Camera selection
# 6. Record with intentional camera variations
# 7. Verify reel switches between cameras smoothly
# 8. Verify cuts are timed to dramatic moments

# Test 3: Audio sync
# 9. Verify audio is present in highlight reel
# 10. Check for lip-sync issues
# 11. Audio should match video timing

# Test 4: Edge cases
# 12. Record with one camera offline
# 13. Reel should still generate from 2 cameras
# 14. Record very fast-paced content (multiple cuts per second)
# 15. Verify minimum 1-second segments enforced
```

---

## 📺 SCREEN 7: Green Screen Compositing

**Current Status:** ⚠️ **PARTIALLY WORKING** (needs backend worker)

### What It Does
- Live camera feed with virtual background replacement
- Chroma-key (green screen) removal and compositing
- Shows pre-loaded background images
- Real-time processing via FFmpeg
- Director selects background from UI

### Current Implementation
- File: `app/(screens)/screen7/page.tsx` (~400 lines)
- Component: Background selector grid + video preview
- Backend: `/api/green-screen/compose` endpoint
- Worker: `app/worker/green-screen-compose.ts`
- FFmpeg: `composeGreenScreenBackground()` in lib/ffmpeg.ts
- Storage: Backgrounds stored in `/public/backgrounds/`

### Issues to Fix

#### 1️⃣ **Background Library**
**Status:** ⚠️ Missing
- Current: Code references `/public/backgrounds/` but folder may be empty
- **Fix needed:**
  - Create `/public/backgrounds/` folder with 5-10 HD backgrounds
  - Add: News studio, cityscape, weather map, corporate office, abstract
  - Optimize: 1920×1080, < 200KB each, JPG/PNG
  - Update UI to show thumbnails + names

#### 2️⃣ **Pre-warming Backgrounds**
**Status:** ⚠️ Important
- Current: Page pre-loads backgrounds on mount
- **Fix needed:**
  - Load all backgrounds in parallel
  - Show progress bar (e.g., "Warming up backgrounds... 3/10")
  - Cache to browser localstorage for faster reload
  - Fallback if background load fails

#### 3️⃣ **Job Status Polling**
**Status:** ⚠️ Important
- Current: Polls BullMQ job status while compositing
- **Fix needed:**
  - Show clear progress: "Uploading to Gemini..." → "Processing..." → "Done"
  - Handle job failures gracefully
  - Show error message if composition fails
  - Add retry button

#### 4️⃣ **Real-time Processing**
**Status:** ⚠️ Critical
- Current: One-shot composition (upload, process, download)
- **Fix needed:**
  - EITHER: True real-time (stream to worker, return stream)
  - OR: Accept longer processing (10-30 seconds per frame)
  - OR: Pre-compose with stored camera video instead of live
  - Decision: Use camera video instead of live input for now

#### 5️⃣ **Despill Quality**
**Status:** ⚠️ Edge case
- Current: Basic chroma-key, may have green spill on hair/edges
- **Fix needed:**
  - Add despill algorithm (color correction)
  - Allow threshold adjustment (slider for sensitivity)
  - Test with different lighting conditions
  - Provide fallback (no green screen if too poor quality)

### Implementation Tasks

```markdown
### Task 1: Create Background Assets
- [ ] Create /public/backgrounds/ folder
- [ ] Find/create 10 HD backgrounds:
  - News studio set
  - City skyline
  - Weather map
  - Corporate office
  - Abstract/gradient
  - Green room (for testing)
  - + 4 more per your preference
- [ ] Resize all to 1920×1080
- [ ] Compress: target < 200KB each
- [ ] Name: background-1.jpg, background-2.jpg, etc.
- [ ] Update /public/backgrounds/index.json with metadata
- Files: /public/backgrounds/*

### Task 2: Add Background Thumbnails
- [ ] Show 3x3 grid of background thumbnails
- [ ] Each 200×112px preview
- [ ] Click to select
- [ ] Show "Selected" badge on chosen background
- [ ] Add background name/title below thumbnail
- Files: app/(screens)/screen7/page.tsx

### Task 3: Add Progress Indicators
- [ ] "Warming up backgrounds..." progress bar on mount
- [ ] Job status polling: show step (Uploading → Processing → Done)
- [ ] Show spinner during processing
- [ ] Display error toast if composition fails
- [ ] Add retry button for failed jobs
- Files: app/(screens)/screen7/page.tsx

### Task 4: Use Camera Video Instead of Live
- [ ] Change implementation: use latest camera1 video as input
- [ ] Instead of: real-time stream
- [ ] Process: camera1-*.webm through green-screen worker
- [ ] Output: green-screen-composed-*.webm
- [ ] Display: looping composed video
- [ ] Time: Should complete in 10-30 seconds (much faster)
- Files: app/(screens)/screen7/page.tsx, lib/green-screen.ts

### Task 5: Add Threshold Slider
- [ ] Add slider: Despill Threshold (0-100%)
- [ ] Lower = more aggressive chroma-key (more spill)
- [ ] Higher = conservative (keep more green)
- [ ] Real-time preview as slider moves
- [ ] Default: 50%
- [ ] Pass threshold to FFmpeg despill filter
- Files: app/(screens)/screen7/page.tsx, lib/ffmpeg.ts
```

### Dependencies
- ⏳ Requires: Camera 1 video available in MinIO
- ⏳ Requires: FFmpeg with libav filters (despill, overlay)
- ⏳ Requires: Background assets in /public/backgrounds/
- ⏳ Requires: Green-screen-compose worker running

### Testing Checklist
```bash
# Test 1: Background loading
# 1. Go to /screen7
# 2. Should see "Warming up backgrounds..." progress
# 3. Should show grid of 10 backgrounds after load
# 4. Click each background - should show "Selected" badge

# Test 2: Composition
# 5. Record camera 1 with green screen background
# 6. Select background from grid
# 7. Wait for "Processing..." indicator
# 8. Should see composed video in preview
# 9. Background should replace green screen

# Test 3: Quality
# 10. Check for green spill on hair/edges
# 11. Adjust threshold slider
# 12. Verify spill reduces with higher threshold
# 13. Test under different lighting conditions

# Test 4: Edge cases
# 14. No green screen in camera (all colors) - should fail gracefully
# 15. Very bright green screen - might have chroma spill, adjust threshold
# 16. Multiple people - verify all get background replaced
```

---

## 📺 SCREEN 8: Language + Subtitles Editor

**Current Status:** ⚠️ **MOSTLY WORKING** (but is duplicate of Screen 5)

### What It Does
- Shows transcript in current language
- Manual language selection buttons (not rotary knob like Screen 5)
- Option to retranscribe with Whisper
- Display translated text with segment timing
- Different UX from Screen 5 (buttons instead of knob)

### Current Implementation
- File: `app/(screens)/screen8/page.tsx` (~600 lines)
- Header still says "Screen 05" (label bug)
- Uses: Manual buttons for language selection
- Backend: `/api/transcript/[language]` endpoint
- No audio playback (unlike Screen 4/5)
- Focus: Text editing/review rather than real-time playback

### Issues to Fix

#### 1️⃣ **Screen Number Label**
**Status:** 🐛 Bug
- Current: Header says "Screen 05" but it's actually Screen 8
- **Fix needed:**
  - Change title to "Screen 08"
  - Update subtitle to reflect actual purpose

#### 2️⃣ **Duplication with Screen 5**
**Status:** ⚠️ Design issue
- Current: Screen 5 (knob) and Screen 8 (buttons) do similar things
- **Fix needed:**
  - Option A: Keep both (knob for operators, buttons for directors)
  - Option B: Merge into one screen with both UX options
  - Decision: Keep both BUT make distinct purposes
    - Screen 5: Real-time broadcast (rotary knob, audio playback)
    - Screen 8: Editorial review (buttons, text editing capability)

#### 3️⃣ **Text Editing Capability**
**Status:** ⚠️ Missing
- Current: Read-only text display
- **Fix needed:**
  - Allow editing individual segments
  - Save edits to database
  - Show "Edited" badge on modified segments
  - Version control (original vs edited)
  - Ability to undo edits

#### 4️⃣ **Transcription Re-run**
**Status:** ✅ Implemented
- Current: "↻ Transcribe" button exists
- Already: Calls `/api/transcribe` to run Whisper again
- Status: This works fine

#### 5️⃣ **Audio Playback**
**Status:** ⚠️ Missing
- Current: Screen 8 shows text only
- **Fix needed:**
  - EITHER: Add audio player for current language
  - OR: Keep text-only for editorial purposes
  - If adding audio: sync with text like Screen 4

### Implementation Tasks

```markdown
### Task 1: Fix Screen Number Label
- [ ] Open app/(screens)/screen8/page.tsx
- [ ] Find: header text "Screen 05"
- [ ] Change to: "Screen 08"
- [ ] Update subtitle to: "Language Translator & Subtitle Editor"
- [ ] Verify on page load
- Files: app/(screens)/screen8/page.tsx (line ~1-30)

### Task 2: Make Screen 8 Distinct (Editorial Purpose)
- [ ] Add header: "EDITORIAL REVIEW MODE"
- [ ] Add timestamp of last edit
- [ ] Show segment indicators: [EDITED] badge for modified segments
- [ ] Add export button: "Export Final Transcript"
- [ ] Keep language buttons (distinct from Screen 5's knob)
- Files: app/(screens)/screen8/page.tsx

### Task 3: Add Segment Editing
- [ ] Make transcript segments editable
- [ ] Click segment → inline text editor appears
- [ ] On save: update TranscriptSegment in DB
- [ ] Show "Edited" badge + timestamp
- [ ] Add undo button (restore from DB last version)
- [ ] Show change history (optional, advanced)
- Files: app/(screens)/screen8/page.tsx, app/api/transcript/*/route.ts

### Task 4: Optional - Add Audio Playback
- [ ] Decide: does editorial team need to hear audio?
- [ ] If YES: Add audio player for current language
- [ ] Sync with text like Screen 4
- [ ] If NO: Remove audio playback requirement
- [ ] Document decision in CLAUDE.md
- Files: app/(screens)/screen8/page.tsx

### Task 5: Add Export Functionality
- [ ] "Export Transcript" button
- [ ] Format options: TXT, SRT, JSON, PDF
- [ ] Includes: language, timestamp, segment timings
- [ ] Save to MinIO and download to user
- Files: app/(screens)/screen8/page.tsx, app/api/transcript/*/route.ts
```

### Dependencies
- ✅ Independent (doesn't block other screens)
- ✅ Uses existing transcription/translation pipeline

### Testing Checklist
```bash
# Test 1: Language switching
# 1. Go to /screen8
# 2. Select German button
# 3. Should show German transcript
# 4. Click Hindi button
# 5. Should switch to Hindi

# Test 2: Text editing (if implemented)
# 6. Click on a segment to edit
# 7. Change text slightly
# 8. Save
# 9. Should show [EDITED] badge
# 10. Refresh page
# 11. Edit should persist

# Test 3: Transcribe button
# 12. Click "↻ Transcribe"
# 13. Should show "Transcribing..."
# 14. Wait for Whisper worker
# 15. Should show new transcript
# 16. Original edits should be preserved (if not re-transcribed)

# Test 4: Export
# 17. Click "Export Transcript"
# 18. Choose format (SRT, TXT, etc.)
# 19. File should download
# 20. Verify content is correct
```

---

## 📺 SCREEN 9: Ad Campaign Rotation + Status

**Current Status:** ⚠️ **MOCKUP ONLY** (needs backend + persistence)

### What It Does
- Plays video with rotating ad banners overlay
- Shows campaign rotation schedule
- Clock display (broadcast time)
- Ad monitoring dashboard
- Status indicators for each ad campaign

### Current Implementation
- File: `app/(screens)/screen9/page.tsx` (~500 lines)
- Display: Demo video + ad banner overlay UI
- Features: Clock, rotating banner animation, "live" status indicators
- **Issue:** All cosmetic - no real ad data or rotation

### Issues to Fix

#### 1️⃣ **Ad Banner Database**
**Status:** ❌ Missing entirely
- Current: No `AdBanner` or `AdCampaign` table in schema
- **Fix needed:**
  - Create Prisma model: `AdCampaign`
  - Create Prisma model: `AdBanner` 
  - Fields: name, startTime, endTime, image, duration, priority

#### 2️⃣ **Ad Rotation Logic**
**Status:** ❌ Missing entirely
- Current: UI animates but uses hardcoded demo data
- **Fix needed:**
  - Fetch ad campaigns from database
  - Rotate based on: schedule time OR random order
  - Track impressions (optional: how many times shown)
  - API endpoint: `/api/ad-campaigns` to get active campaigns

#### 3️⃣ **Video Overlay Compositing**
**Status:** ⚠️ Partial
- Current: React overlay (web-based)
- **Fix needed:**
  - EITHER: Keep as React overlay (works for broadcast preview)
  - OR: Compose into actual video file using FFmpeg
  - Decision: Use React overlay for now (simpler, live updates)

#### 4️⃣ **Status/Health Monitoring**
**Status:** ⚠️ Minor
- Current: Shows static status badges
- **Fix needed:**
  - Show real status from ad database
  - Track if ad played successfully
  - Show click-through rate (if click tracking added)
  - Error indicators if ad failed to display

#### 5️⃣ **Schedule Persistence**
**Status:** ❌ Missing entirely
- Current: No way to create/edit ad schedules
- **Fix needed:**
  - Admin page: `/admin/ads` to create campaigns
  - Form: name, image upload, start time, end time, priority
  - Save to database
  - UI to activate/deactivate campaigns

### Implementation Tasks

```markdown
### Task 1: Create Ad Database Models
- [ ] Open prisma/schema.prisma
- [ ] Add model: AdCampaign
  - [ ] id (uuid)
  - [ ] name: string
  - [ ] startTime: DateTime
  - [ ] endTime: DateTime
  - [ ] priority: Int (1-10, higher = priority)
  - [ ] isActive: boolean
  - [ ] createdAt: DateTime
  - [ ] banners: [] → AdBanner[]
- [ ] Add model: AdBanner
  - [ ] id (uuid)
  - [ ] campaign: FK → AdCampaign
  - [ ] imageUrl: string
  - [ ] bucket: string (default "ad-banners")
  - [ ] objectKey: string
  - [ ] displayDuration: Int (seconds, e.g., 10)
  - [ ] impressions: Int (default 0)
  - [ ] createdAt: DateTime
- [ ] Run migration: npx prisma migrate dev --name add_ads
- Files: prisma/schema.prisma

### Task 2: Create Ad API Endpoint
- [ ] Create: app/api/ad-campaigns/route.ts
- [ ] Endpoint: GET /api/ad-campaigns
- [ ] Logic:
  - [ ] Find campaigns where startTime <= now <= endTime
  - [ ] Filter by isActive = true
  - [ ] Sort by priority (descending)
  - [ ] Return: [{name, imageUrl, duration}, ...]
- [ ] Add caching (5-minute TTL) for performance
- Files: app/api/ad-campaigns/route.ts

### Task 3: Update Screen 9 UI
- [ ] Open app/(screens)/screen9/page.tsx
- [ ] Remove hardcoded ad data
- [ ] Fetch from /api/ad-campaigns on mount
- [ ] Map over fetched campaigns
- [ ] Rotate: cycle through campaigns with timing
- [ ] Track impressions: POST /api/ad-campaigns/impression
- [ ] Handle no campaigns: show "No active campaigns"
- Files: app/(screens)/screen9/page.tsx

### Task 4: Create Ad Campaign Dashboard
- [ ] Create: /admin/ads/page.tsx
- [ ] Layout:
  - [ ] List of active campaigns (table)
  - [ ] Create new campaign button
  - [ ] Edit/delete options
  - [ ] Impression count display
  - [ ] Schedule timeline (visual)
- [ ] Form to create campaign:
  - [ ] Name input
  - [ ] Image upload → MinIO
  - [ ] Start/end datetime pickers
  - [ ] Priority slider (1-10)
  - [ ] Save button
- Files: app/(admin)/ads/page.tsx

### Task 5: Create Impression Tracking
- [ ] Create: app/api/ad-campaigns/impression/route.ts
- [ ] Endpoint: POST /api/ad-campaigns/impression
- [ ] Body: { campaignId, bannerId }
- [ ] Logic: Increment impressions counter
- [ ] Return: { success: true }
- [ ] Call from Screen 9 when banner rotates
- Files: app/api/ad-campaigns/impression/route.ts, app/(screens)/screen9/page.tsx
```

### Dependencies
- 🚫 Blocks Screen 10 (also uses ad campaigns)
- ✅ Independent from other screens

### Testing Checklist
```bash
# Test 1: Database setup
# 1. Run: npx prisma migrate dev --name add_ads
# 2. Verify tables created: AdCampaign, AdBanner

# Test 2: Admin dashboard
# 3. Go to /admin/ads
# 4. Create new campaign:
#    - Name: "Test Campaign"
#    - Upload image (1920×1080)
#    - Start: now
#    - End: 1 hour from now
#    - Priority: 5
# 5. Save campaign
# 6. Should appear in list

# Test 3: Screen 9 display
# 7. Go to /screen9
# 8. Should show video with your ad banner
# 9. Banner should rotate based on schedule
# 10. Clock should show accurate time

# Test 4: Impressions
# 11. Watch /screen9 for 60 seconds
# 12. Go to /admin/ads
# 13. Impression count should increase (every ~10 sec = 1 impression)

# Test 5: Edge cases
# 14. Create ad with startTime in future
# 15. Screen 9 should NOT show it (schedule not started)
# 16. Wait until startTime or manually adjust system clock
# 17. Ad should appear
# 18. Create ad with endTime in past
# 19. Should not display
```

---

## 📺 SCREEN 10: Ad Campaign Monitoring + Analytics

**Current Status:** ⚠️ **MOCKUP ONLY** (depends on Screen 9)

### What It Does
- Dashboard showing all ad campaigns and performance
- Displays: impressions, active duration, priority
- Real-time status of each campaign
- Scheduling timeline visualization
- Performance metrics (optional)

### Current Implementation
- File: `app/(screens)/screen10/page.tsx` (~400 lines)
- Display: Static mockup dashboard
- Features: Clock, campaign cards, status indicators
- **Issue:** All cosmetic - no real ad data

### Issues to Fix

#### 1️⃣ **Ad Campaign Data**
**Status:** ⚠️ Depends on Screen 9
- Current: No real ad data
- **Fix needed:**
  - Fetch campaigns from `/api/ad-campaigns`
  - Same as Screen 9 (data reuse)
  - Display in dashboard format instead of rotating banners

#### 2️⃣ **Impression Display**
**Status:** ⚠️ Missing
- Current: Shows static numbers
- **Fix needed:**
  - Fetch impression counts per campaign
  - Update in real-time (poll every 5 seconds)
  - Show: current impressions, target, percentage

#### 3️⃣ **Performance Metrics**
**Status:** ⚠️ Optional
- Current: Not tracked
- **Fix needed (optional):**
  - CTR (click-through rate) - if clicks tracked
  - Engagement time
  - Geographic data - if available
  - Device breakdowns

#### 4️⃣ **Timeline Visualization**
**Status:** ⚠️ Minor
- Current: Hardcoded timeline
- **Fix needed:**
  - Generate timeline from campaign start/end times
  - Show today's campaigns
  - Visual: bar chart or timeline
  - Color: by priority or status

#### 5️⃣ **Alert System**
**Status:** ⚠️ Nice-to-have
- Current: None
- **Fix needed (optional):**
  - Alert if campaign ends soon
  - Alert if no active campaigns
  - Alert if impression count drops

### Implementation Tasks

```markdown
### Task 1: Update Screen 10 Data Fetch
- [ ] Open app/(screens)/screen10/page.tsx
- [ ] Replace hardcoded campaign data
- [ ] Fetch from /api/ad-campaigns on mount
- [ ] Fetch campaign impressions from database
- [ ] Query: SELECT name, impressions, priority, startTime, endTime
- [ ] Poll every 5 seconds to update impressions live
- Files: app/(screens)/screen10/page.tsx

### Task 2: Display Campaign Cards
- [ ] Layout: Grid of campaign cards (4 per row)
- [ ] Each card shows:
  - [ ] Campaign name
  - [ ] Status: ACTIVE / SCHEDULED / EXPIRED
  - [ ] Impressions: "1,234 impressions"
  - [ ] Duration: "2 hours remaining"
  - [ ] Priority: "High (8/10)"
  - [ ] Progress bar: (impressions / target)
- Files: app/(screens)/screen10/page.tsx

### Task 3: Create Timeline Visualization
- [ ] Use Chart.js or simple SVG
- [ ] Draw horizontal timeline for today
- [ ] Each campaign = colored bar
- [ ] Color: by priority (red=high, green=low)
- [ ] Show current time as vertical line
- [ ] Hover: show campaign details
- [ ] X-axis: time (00:00 - 23:59)
- [ ] Y-axis: campaign names
- Files: app/(screens)/screen10/page.tsx, components/ad-timeline.tsx

### Task 4: Add Alert Indicators
- [ ] Show alert badge if:
  - [ ] No active campaigns
  - [ ] Campaign ending in < 30 min
  - [ ] Impression count unusually low
- [ ] Color code: red for critical, yellow for warning
- [ ] Dismiss button for each alert
- Files: app/(screens)/screen10/page.tsx

### Task 5: Add Export Button
- [ ] "Export Report" button
- [ ] Generate CSV: campaign name, impressions, duration, priority
- [ ] Date range: today or custom
- [ ] Download to user
- Files: app/(screens)/screen10/page.tsx, app/api/ad-campaigns/report/route.ts
```

### Dependencies
- 🚫 **Requires:** Screen 9 to be complete (Ad Database)
- 🚫 **Requires:** /api/ad-campaigns endpoint
- ✅ Otherwise independent

### Testing Checklist
```bash
# Test 1: Data display
# 1. Complete Screen 9 implementation first
# 2. Go to /screen10
# 3. Should show list/grid of ad campaigns
# 4. Should match campaigns created in /admin/ads

# Test 2: Real-time updates
# 5. Watch /screen10 for 60 seconds
# 6. Create new campaign in /admin/ads (in another window)
# 7. Should appear in /screen10 automatically (poll every 5s)
# 8. Watch impression count increase

# Test 3: Timeline visualization
# 9. Should see timeline with campaigns as bars
# 10. Current time = vertical line
# 11. Campaigns color-coded by priority
# 12. Click campaign → should show details

# Test 4: Status indicators
# 13. Create campaign with startTime in future
# 14. Status should show SCHEDULED (not ACTIVE)
# 15. Create campaign with endTime in past
# 16. Status should show EXPIRED

# Test 5: Alerts
# 17. Create campaign ending in 10 minutes
# 18. Should show alert: "Campaign ending soon"
# 19. Create 0 campaigns
# 20. Should show alert: "No active campaigns"
```

---

## 📺 SCREEN 11: Final Output (Portrait 9:16)

**Current Status:** ⚠️ **MOCKUP ONLY** (needs ffmpeg composition)

### What It Does
- Displays polished final video in portrait orientation (9:16)
- Target: Mobile/social media output
- Includes: video, subtitles, branding, timestamps
- Composition of highlight reel + translated audio
- Ready for YouTube Shorts / TikTok / Instagram Reels

### Current Implementation
- File: `app/(screens)/screen11/page.tsx` (~300 lines)
- Display: Static mockup with demo video in 9:16 frame
- **Issue:** No actual FFmpeg composition backend

### What to Fix

#### 1️⃣ **Portrait Video Composition**
**Status:** ❌ Missing entirely
- Current: Shows demo video in 9:16 container
- **Fix needed:**
  - Create FFmpeg pipeline: `composePortraitVideo()`
  - Input: Highlight reel (16:9)
  - Output: Portrait crop/zoom (9:16)
  - Logic: Center crop OR scale with letterbox OR intelligent reframe

#### 2️⃣ **Subtitle Overlay**
**Status:** ❌ Missing entirely
- Current: No subtitles burned into video
- **Fix needed:**
  - Use ffmpeg `subtitles` filter
  - Input: SRT file from translation
  - Style: White text, black outline, bottom-center
  - Font: Large (36pt+) for readability
  - Language: Current language (configurable)

#### 3️⃣ **Branding / Watermarks**
**Status:** ❌ Missing entirely
- Current: No logos or watermarks
- **Fix needed:**
  - Add logo overlay (top-left corner)
  - Add watermark text: "Channel Name" or URL
  - Add timestamp overlay: HH:MM:SS
  - Use ffmpeg `overlay` filter

#### 4️⃣ **Audio Track**
**Status:** ❌ Missing entirely
- Current: No audio in output
- **Fix needed:**
  - Use translated audio for current language
  - OR: Use master audio (English)
  - Copy audio stream (no re-encoding needed)
  - Ensure sync with video

#### 5️⃣ **Video Worker/Queue**
**Status:** ❌ Missing entirely
- Current: No background worker for composition
- **Fix needed:**
  - Create worker: `app/worker/portrait-video.ts`
  - Queue: `portrait-video` BullMQ queue
  - Trigger: After highlight reel generated
  - Status: User can poll `/api/video-jobs/{jobId}` for progress

### Implementation Tasks

```markdown
### Task 1: Create composePortraitVideo() FFmpeg Function
- [ ] Open lib/ffmpeg.ts
- [ ] Add function: composePortraitVideo(inputPath, subtitlePath, logoPath, outputPath)
- [ ] Logic:
  - [ ] Scale input to 1080×1920 (maintain aspect, letterbox if needed)
  - [ ] OR: Crop to 9:16 centered on face
  - [ ] Burn subtitles (ffmpeg subtitles filter with SRT)
  - [ ] Overlay logo (top-left, 100×100px)
  - [ ] Overlay watermark text
  - [ ] Copy audio stream unchanged
  - [ ] Output: H.264, AAC audio, MP4 container
  - [ ] Target bitrate: 5 Mbps (good for mobile)
- [ ] Return: {outputPath, duration, size}
- Files: lib/ffmpeg.ts

### Task 2: Create Portrait Video Worker
- [ ] Create: app/worker/portrait-video.ts
- [ ] Setup: BullMQ worker for "portrait-video" queue
- [ ] Input: {highlightReelFilename, language, logoUrl, brandName}
- [ ] Process:
  - [ ] Download highlight reel from MinIO
  - [ ] Download SRT subtitle file for language
  - [ ] Download logo image
  - [ ] Call composePortraitVideo()
  - [ ] Upload output to MinIO ("portrait-*.mp4")
  - [ ] Save metadata to database
- [ ] Concurrency: 1 (heavy FFmpeg processing)
- [ ] Lock duration: 30 minutes
- [ ] Return: {filename, url, duration}
- Files: app/worker/portrait-video.ts

### Task 3: Create Video Jobs Database Model
- [ ] Open prisma/schema.prisma
- [ ] Add model: VideoJob
  - [ ] id (uuid)
  - [ ] jobId (from BullMQ)
  - [ ] type: "portrait" | "landscape"
  - [ ] status: "queued" | "processing" | "completed" | "failed"
  - [ ] inputFilename: string
  - [ ] outputFilename: string (null until completed)
  - [ ] outputUrl: string (null until completed)
  - [ ] language: string
  - [ ] duration: Int (null until completed)
  - [ ] errorMessage: string (null unless failed)
  - [ ] createdAt: DateTime
  - [ ] completedAt: DateTime (null until done)
- [ ] Run migration: npx prisma migrate dev --name add_video_jobs
- Files: prisma/schema.prisma

### Task 4: Create Portrait Video API Endpoint
- [ ] Create: app/api/portrait-video/route.ts
- [ ] Endpoint: POST /api/portrait-video
- [ ] Body: { highlightReelFilename, language, brandName }
- [ ] Logic:
  - [ ] Create VideoJob record (status: queued)
  - [ ] Enqueue portrait-video job
  - [ ] Return: { jobId, status, estimatedTime }
- [ ] Endpoint: GET /api/portrait-video/{jobId}
- [ ] Return: Full VideoJob record with current status
- Files: app/api/portrait-video/route.ts

### Task 5: Update Screen 11 UI
- [ ] Open app/(screens)/screen11/page.tsx
- [ ] Remove hardcoded demo video
- [ ] Add:
  - [ ] Language selector (dropdown or buttons)
  - [ ] "Generate Portrait Video" button
  - [ ] Status: Show "Queued → Processing → Done"
  - [ ] Progress bar during composition (polling every 2 sec)
  - [ ] Video preview once ready
  - [ ] Download button: "Export Video"
  - [ ] Copy URL button: Share link
- Files: app/(screens)/screen11/page.tsx

### Task 6: Create Logo/Branding Assets
- [ ] Create: /public/branding/ folder
- [ ] Add: logo.png (transparent, 100×100px)
- [ ] Add: watermark.txt content (channel name)
- [ ] Customize: Match your news channel branding
- Files: /public/branding/

### Task 7: Integrate into Highlight Reel Queue
- [ ] Open: app/worker/highlight-reel.ts
- [ ] After highlight reel complete:
  - [ ] For each language in [German, Hindi, French, Spanish]:
  - [ ] Enqueue portrait-video job
  - [ ] Enqueue landscape-video job (for Screen 12)
  - [ ] Pass: highlightReelFilename, language, brandName
- Files: app/worker/highlight-reel.ts
```

### Dependencies
- ⏳ **Requires:** Highlight Reel complete (Screen 6)
- ⏳ **Requires:** Translation complete (Screen 5)
- ⏳ **Requires:** FFmpeg with filters (subtitles, overlay, scale)
- 🚫 **Blocks:** Screen 12 (landscape variant)

### Testing Checklist
```bash
# Test 1: Worker setup
# 1. Run: npm run worker:all (includes portrait-video worker)
# 2. Check logs: "portrait-video-worker ready and listening"

# Test 2: Manual composition
# 3. Record 3 cameras for 1 minute
# 4. Wait for highlight reel generation (5-15 min)
# 5. Go to /screen11
# 6. Select German
# 7. Click "Generate Portrait Video"
# 8. Should show "Processing..." with progress bar
# 9. Wait 5-10 minutes for composition
# 10. Should show preview of 9:16 video

# Test 3: Video quality
# 11. Download the portrait video
# 12. Play in VLC or browser
# 13. Verify:
#     - Dimensions: 1080×1920 (9:16)
#     - Subtitles: German text visible
#     - Logo: Top-left corner
#     - Watermark: Bottom or corner
#     - Audio: Synced with video
#     - Duration: Same as highlight reel

# Test 4: Multiple languages
# 14. Generate portrait for each language
# 15. Each should have correct language subtitles
# 16. All should have same video but different audio/subs

# Test 5: Edge cases
# 17. Generate without language selection
# 18. Should default to English
# 19. Generate with invalid highlight reel
# 20. Should fail gracefully with error message
```

---

## 📺 SCREEN 12: Final Output (Landscape 16:9)

**Current Status:** ⚠️ **MOCKUP ONLY** (identical task to Screen 11)

### What It Does
- Displays polished final video in landscape orientation (16:9)
- Target: Broadcast / YouTube
- Includes: video, subtitles, branding, timestamps
- Composition of highlight reel + translated audio
- Ready for broadcast or YouTube upload

### Current Implementation
- File: `app/(screens)/screen12/page.tsx` (~300 lines)
- Display: Static mockup with demo video in 16:9 frame
- **Issue:** No actual FFmpeg composition backend (same as Screen 11)

### What to Fix

#### 1️⃣ **Landscape Video Composition**
**Status:** ❌ Missing entirely
- Current: Shows demo video in 16:9 container
- **Fix needed:**
  - Create FFmpeg pipeline: `composeLandscapeVideo()`
  - Input: Highlight reel (16:9)
  - Output: Landscape as-is (16:9) OR add pillarbox for vertical source
  - Logic: No scaling needed if source is already 16:9

#### 2️⃣ **Subtitle Overlay (Broadcast Style)**
**Status:** ❌ Missing entirely
- Current: No subtitles
- **Fix needed:**
  - Use ffmpeg `subtitles` filter
  - Input: SRT file from translation
  - Style: White text, black outline, bottom-center
  - Font: Slightly smaller than portrait (28pt, less mobile-centric)
  - Option: Position lower-thirds (for news style)

#### 3️⃣ **Branding / Lower-Thirds**
**Status:** ❌ Missing entirely
- Current: No logos or graphics
- **Fix needed:**
  - Add news channel logo (top-left)
  - Add lower-third: "News Title | Location | Date"
  - Add breaking news banner (optional animation)
  - Use ffmpeg `drawtext` or `overlay` filters

#### 4️⃣ **Timecode Overlay**
**Status:** ❌ Missing entirely
- Current: None
- **Fix needed:**
  - Show HH:MM:SS in corner
  - Increment in real-time (ffmpeg can burn timestamp)
  - OR: Simple static timestamp at publish time

#### 5️⃣ **Video Worker/Queue**
**Status:** ❌ Missing entirely
- Current: No background worker
- **Fix needed:**
  - Create worker: `app/worker/landscape-video.ts`
  - Queue: `landscape-video` BullMQ queue
  - Trigger: After highlight reel generated (same as portrait)

### Implementation Tasks

```markdown
### Task 1: Create composeLandscapeVideo() FFmpeg Function
- [ ] Open lib/ffmpeg.ts
- [ ] Add function: composeLandscapeVideo(inputPath, subtitlePath, logoPath, bannerPath, outputPath)
- [ ] Logic:
  - [ ] Input already 16:9, no scaling needed
  - [ ] Burn subtitles (ffmpeg subtitles filter with SRT)
  - [ ] Overlay logo (top-left, 120×120px)
  - [ ] Overlay lower-third banner (optional, configurable)
  - [ ] Overlay timecode (bottom-right, ffmpeg drawtext)
  - [ ] Copy audio stream unchanged
  - [ ] Output: H.264, AAC audio, MP4 container
  - [ ] Target bitrate: 8 Mbps (broadcast quality)
- [ ] Return: {outputPath, duration, size}
- Files: lib/ffmpeg.ts

### Task 2: Create Landscape Video Worker
- [ ] Create: app/worker/landscape-video.ts
- [ ] Setup: BullMQ worker for "landscape-video" queue
- [ ] Input: {highlightReelFilename, language, logoUrl, brandName, bannerImageUrl}
- [ ] Process:
  - [ ] Download highlight reel from MinIO
  - [ ] Download SRT subtitle file for language
  - [ ] Download logo and banner images
  - [ ] Call composeLandscapeVideo()
  - [ ] Upload output to MinIO ("landscape-*.mp4")
  - [ ] Save metadata to database
- [ ] Concurrency: 1 (heavy FFmpeg processing)
- [ ] Lock duration: 30 minutes
- [ ] Return: {filename, url, duration}
- Files: app/worker/landscape-video.ts

### Task 3: Update Screen 12 UI
- [ ] Open app/(screens)/screen12/page.tsx
- [ ] Mirror Screen 11 implementation:
  - [ ] Language selector
  - [ ] "Generate Landscape Video" button
  - [ ] Status polling with progress bar
  - [ ] Video preview once ready
  - [ ] Download button
  - [ ] Copy URL button
- [ ] Key difference: Show 16:9 aspect ratio
- Files: app/(screens)/screen12/page.tsx

### Task 4: Create Lower-Third Banner Design
- [ ] Create: /public/branding/banner-landscape.png
- [ ] Design: 1920×200px banner
- [ ] Content: "NEWS TITLE | LOCATION | DATE"
- [ ] Style: Match your news channel branding
- [ ] Colors: Semi-transparent background with text
- Files: /public/branding/banner-landscape.png

### Task 5: Add Landscape Worker to Queue
- [ ] Open lib/queue.ts
- [ ] Add: LANDSCAPE_VIDEO_QUEUE definition
- [ ] Add: landscapeVideoQueue instance
- [ ] Add: enqueueLandscapeVideo() function
- [ ] Mirror portrait queue setup (same pattern)
- Files: lib/queue.ts

### Task 6: Integrate into Highlight Reel Queue
- [ ] Open: app/worker/highlight-reel.ts
- [ ] After highlight reel complete:
  - [ ] (Already enqueues portrait from Task 7 of Screen 11)
  - [ ] Also enqueue landscape-video job
  - [ ] For each language: enqueueLandscapeVideo()
  - [ ] Pass: same params as portrait (language, brandName, etc.)
- Files: app/worker/highlight-reel.ts

### Task 7: Create Broadcast Export API
- [ ] Create: app/api/broadcast-export/route.ts
- [ ] Endpoint: POST /api/broadcast-export
- [ ] Body: { highlightReelId, languages: ["German", "Hindi", ...] }
- [ ] Logic:
  - [ ] Enqueue portrait + landscape for each language
  - [ ] Return: {jobIds: [...], estimatedTime: "15 minutes"}
- [ ] Useful for bulk exporting all languages at once
- Files: app/api/broadcast-export/route.ts
```

### Dependencies
- ⏳ **Requires:** Highlight Reel complete (Screen 6)
- ⏳ **Requires:** Portrait Video worker (Screen 11)
- ⏳ **Requires:** FFmpeg with filters
- ✅ Otherwise independent

### Testing Checklist
```bash
# Test 1: Worker setup
# 1. Ensure landscape-video worker running
# 2. Check logs: "landscape-video-worker ready"

# Test 2: Manual composition
# 3. Complete Screen 11 first (highlight reel ready)
# 4. Go to /screen12
# 5. Select German
# 6. Click "Generate Landscape Video"
# 7. Should show "Processing..."
# 8. Wait 5-10 minutes
# 9. Should show preview of 16:9 video

# Test 3: Video quality
# 10. Download landscape video
# 11. Play in VLC
# 12. Verify:
#     - Dimensions: 1920×1080 (16:9)
#     - Subtitles: German text visible
#     - Logo: Top-left
#     - Lower-third: News title visible
#     - Timecode: Bottom-right shows HH:MM:SS
#     - Audio: Synced
#     - Bitrate: ~8 Mbps (broadcast quality)

# Test 4: Multi-language export
# 13. Use /api/broadcast-export
# 14. Request all 4 languages at once
# 15. All should complete successfully
# 16. Check landscape videos for each language

# Test 5: Archive
# 17. Store final landscape videos in archive bucket
# 18. Implement retention: keep 1 month, auto-delete older
```

---

# 📋 Implementation Priority & Timeline

## Priority 1: Core Broadcasting (Immediate - Screens 1-6)
✅ **Status:** COMPLETE
- Screens 1-3: Camera feeds looping
- Screen 4: Teleprompter (minor UX fixes)
- Screen 5: Language selector (refinements)
- Screen 6: Highlight reel (optimizations)
- **Timeline:** 2-3 hours (testing + fixes)

## Priority 2: Ad System (Week 1 - Screens 9-10)
⚠️ **Status:** Needs implementation
- Database models for ads
- Admin dashboard for campaign management
- Screen 9: Ad rotation display
- Screen 10: Ad analytics dashboard
- **Timeline:** 2-3 days (full stack)

## Priority 3: Final Video Exports (Week 1-2 - Screens 11-12)
⚠️ **Status:** Needs implementation
- FFmpeg composition functions
- Portrait video worker
- Landscape video worker
- Integration with highlight reel queue
- **Timeline:** 3-4 days (complex FFmpeg work)

## Priority 4: Refinements (Week 2-3)
- Screen 8: Editorial features
- Error handling & logging
- Performance optimization
- Testing & QA
- **Timeline:** 2-3 days

---

# 🎯 Quick Start Guide

### To Get Started Immediately:

1. **Test existing screens (1-6):**
   ```bash
   npm run dev
   # Open 3 terminals for workers
   npm run worker:audio
   npm run worker:highlight
   npm run worker:translations
   ```

2. **Record first broadcast:**
   - Go to http://localhost:3000/camera
   - Record 3 cameras for 1 minute
   - Record audio simultaneously
   - Wait for workers to complete (5-10 min)
   - View screens 1-6

3. **Implement Screen 9:**
   - Add AdCampaign/AdBanner models to Prisma
   - Create /api/ad-campaigns endpoint
   - Update Screen 9 UI to fetch real data
   - (Fastest win: 2-3 hours)

4. **Implement Screen 11-12:**
   - Add FFmpeg composition functions
   - Create portrait/landscape workers
   - Test with real highlight reel
   - (Most time-consuming: 3-4 days)

---

*Updated: 2026-08-07*
