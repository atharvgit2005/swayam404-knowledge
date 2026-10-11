# 🎓 swayam404 — The SWAYAM/NPTEL Assignment Survival Kit

[![Build & Test](https://img.shields.io/badge/tests-357%20passing-brightgreen.svg?style=flat-square)](file:///Users/atharvpaharia100/Desktop/Projects/swayaam-hacked)
[![API Keys Required](https://img.shields.io/badge/API%20Keys-0%20(100%25%20FREE)-success.svg?style=flat-square)](file:///Users/atharvpaharia100/Desktop/Projects/swayaam-hacked)
[![Student Sanity](https://img.shields.io/badge/Sanity-Preserved-blue.svg?style=flat-square)](file:///Users/atharvpaharia100/Desktop/Projects/swayaam-hacked)
[![Side Eye Rating](https://img.shields.io/badge/Caution-Side%20Eye%20%F0%9F%91%80-critical.svg?style=flat-square)](file:///Users/atharvpaharia100/Desktop/Projects/swayaam-hacked)
[![License](https://img.shields.io/badge/license-MIT-black.svg?style=flat-square)](file:///Users/atharvpaharia100/Desktop/Projects/swayaam-hacked)

> **"Bro paid ₹1,000 for the NPTEL exam hall ticket just to scramble through Week 4 assignments at 11:58 PM on a Friday while SWAYAM's server runs on a single potato in an IIT basement."** — Every Engineering Student Ever.

A modern, privacy-focused Chrome Extension (Manifest V3) built with **React**, **TypeScript**, and **Vite** that turns the painful weekly SWAYAM/NPTEL grind into a breeze. 

**NO API KEYS. NO PAID SUBSCRIPTIONS. NO CLOUD LOGINS.** Just direct client-side superpowers, seamless Web AI bridging (ChatGPT, Claude & Gemini Web), verified question banks, and safe DOM auto-filling.

---

## 💀 Why Does This Exist? (The Universal Trauma)

Let's be completely honest with each other:
1. **The Lectures**: A 45-minute monotone lecture recorded on a 2004 webcam with chalkboard dust flying everywhere and audio captured through a broken headphone mic. Playing at 2.5x speed still feels like slow motion.
2. **The 11:59 PM Deadline**: Every single Friday night, thousands of panicked engineering students log in simultaneously, causing SWAYAM's fragile servers to throw instant `504 Gateway Timeout` errors.
3. **The Questions**: 10 questions testing some microscopic footnote on slide 47 that wasn't even mentioned in the video, recycled verbatim from the 2018 question bank.

**swayam404** exists so you can survive the semester, keep your credit requirements intact, and get back to actually learning things you care about.

---

## 👀 ⚠️ CAUTION: DON'T EVER TRY THIS 👀

*(Bombastic Side Eye... Criminal Offensive Side Eye)*

Look, we need to have a serious heart-to-heart before you install this:

* **Don't ever flex a 100/100 score in the class WhatsApp group** where the course TA and professor are admins. Please have at least two functional brain cells. If you do this, you are on your own.
* **If your attendance is 12%** and the professor doesn't even know what your face looks like, suddenly submitting flawless assignments with graduate-level reasoning might raise an eyebrow or two. Keep it humble.
* **The "Zero Auto-Submit" rule is your lifeline**: The extension will scan the quiz, resolve the answers, and mark the checkboxes, but **YOU MUST CLICK THE SUBMIT BUTTON YOURSELF**. If you sit there waiting for the extension to submit at 11:59:59 PM and your Wi-Fi trips, do not open an angry GitHub issue crying to us.
* **Canteen Rule**: If anyone asks where you got this from, you found an unmarked USB pendrive lying on a bench in the college canteen. You do not know who made it. We do not know you.
* **Legal / Academic Satire Disclaimer**: This software is strictly an *open-source educational DOM inspection research experiment* demonstrating browser automation and client-side storage architecture. Any resemblance between your weekly 10/10 grade and actual academic enlightenment is purely coincidental.

---

## ⚡ Key Superpowers (What It Actually Does)

### 1. 🆓 100% Free Web AI Bridge (Zero API Keys)
Forget paying Sam Altman for OpenAI API credits or begging Google Cloud for Gemini API quotas.
- Integrates with your **existing free browser sessions** of **ChatGPT Web**, **Claude Web**, and **Gemini Web**.
- One-click **"Copy Prompt"** formats the scanned questions into a structured AI-optimized schema.
- Uses floating browser bridges or clipboard transfer: paste into ChatGPT/Claude, copy the answers back, and click **"Fill Reviewed Answers"**.
- Built-in provider toggler lets you switch seamlessly between ChatGPT, Claude, and Gemini with zero key configuration.

### 2. 🎯 Precision DOM Marking (No Broken Portals)
- Automatically checks the correct radio buttons and checkboxes directly in the SWAYAM page DOM.
- **Auto-uncheck logic**: Correctly unselects previously clicked wrong choices.
- Native React input descriptor dispatch: triggers SWAYAM's underlying React event listeners so the portal actually registers your selections.
- **Strict Submission Immunity**: Never touches `Submit`, `Save & Submit`, or final grading forms. You retain 100% final review control.

### 3. 📦 Shared Knowledge Base & GitHub Bank Sync
- Sync verified course packs directly from public GitHub repositories (e.g. `swayam404-knowledge`).
- Offline caching in `chrome.storage.local` with SHA-256 integrity verification.
- Instant **"Take Answers from GitHub Bank"** loads historical confirmed answers right into your course profile.

### 4. 📸 Graded Assignment Feedback Capture
- After an assignment deadline passes and the portal displays correct solutions, hit **"Capture Graded Feedback"**.
- Detects portal-confirmed badges, green checkmarks, and `Accepted Answers` blocks.
- Distinguishes confirmed truths from student guesses, updating your local bank for future batches.

### 5. 📅 Course Completion & 12-Week Syllabus Expander
- Automatically unfolds all collapsed week accordions (Week 0 through Week 12) across the SWAYAM course outline.
- Instant visual progress tracker so you always know how many quizzes you have left before the final exam.

### 6. 🖤 High-Contrast Neo-Brutalist Aesthetic
- Designed with bold borders, crisp tactile typography, and system-aware dark mode that automatically respects your OS theme.
- Clean Lucide icons throughout — zero messy emojis or bloated UI libraries.

---

## 🛠️ Quick Installation (Takes 30 Seconds)

### Step 1: Clone & Build
```bash
# Clone the repository
git clone https://github.com/atharvgit2005/swayaam-hacked.git
cd swayaam-hacked

# Install dependencies
npm install

# Build the extension bundle
npm run build
```

### Step 2: Load into Chrome or Brave
1. Open **Brave** or **Google Chrome**.
2. Navigate to `brave://extensions` (or `chrome://extensions`).
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** (top-left button).
5. Select the **`dist/`** directory inside this project folder:
   ```
   path/to/swayaam-hacked/dist
   ```
6. Pin **swayam404** to your browser toolbar! 📌

---

## 🎮 How to Use (The 3-Step Routine)

```
[SWAYAM Assignment Tab] 
        │
        ▼ (Click "Scan Assignment")
[swayam404 Extension] ──▶ Checks Local Bank / GitHub Knowledge Base
        │
        ├─ If answers exist: 1-Click "Fill Reviewed Answers" ──▶ Done!
        │
        └─ If brand new quiz:
                │
                ▼ (Click "Copy Prompt" & open ChatGPT / Claude / Gemini Web)
           Paste Prompt ──▶ AI outputs structured JSON / letters
                │
                ▼ (Click "Send to Swayam404" or Paste)
           swayam404 auto-marks all checkboxes on SWAYAM tab!
                │
                ▼ (Review with your own human eyes)
           Click Submit manually! 🎉
```

1. **Open your weekly assignment** on `https://onlinecourses.swayam2.ac.in/...`.
2. **Open swayam404** from your extensions bar and click **"Scan Assignment"**.
3. If you have the GitHub bank synced, confirmed answers will light up immediately. Click **"Fill Reviewed Answers"**.
4. For brand-new quizzes without cached answers, click **"1. Copy Prompt"**, paste into your open ChatGPT/Claude tab, and apply the answers back in one click.
5. Review the selections and click the green **Submit** button yourself!

---

## 🧪 Bulletproof Testing (357 Automated Tests)

Even though we joke, this codebase is engineered like a tank. We run **357 automated unit and integration tests across 21 test suites** before every release:

```bash
# Run the entire automated test suite
npm test

# Run TypeScript typecheck
npm run typecheck

# Production build test
npm run build
```

### What We Test:
- **DOM Adapters & Injection**: Radio button selection, checkbox unchecking, React synthetic event triggering, and strict immunity against form submissions.
- **Web AI Bridge**: Parsing structured multi-batch prompts, markdown format variations, and resilience against AI hallucinations.
- **Knowledge Base Sync**: Offline fallback, SHA-256 integrity verification, and atomic cache preservation during network failures.
- **Conflict Resolution**: Preventing wrong answers from overwriting portal-verified records.

---

## ❓ Frequently Anticipated Panics (FAQ)

**Q: Do I need to buy an OpenAI API key or Google Cloud account?**  
**A:** NO! Absolutely zero API keys are required. The extension uses your regular browser login for ChatGPT Web, Claude Web, or Gemini Web, plus the open-source GitHub question bank. It costs ₹0.00.

**Q: Why didn't the extension submit the quiz for me?**  
**A:** Because we care about your graduation. Auto-submitting without student confirmation is how people accidentally submit empty forms or wrong answers. You have full control. Always verify before you submit.

**Q: Does this work on NPTEL and SWAYAM 2.0?**  
**A:** Yes! It supports `onlinecourses.swayam2.ac.in` and standard NPTEL portal course containers.

**Q: Will SWAYAM detect that I'm using an extension?**  
**A:** The extension runs standard client-side DOM queries (just like clicking with a mouse). It makes zero unauthorized background API requests to SWAYAM's servers and never harvests authentication cookies.

---

## 🤝 Contributing & Community

Found answers for a new course? Added a cleaner DOM selector?
1. Fork the repository.
2. Submit a PR or contribute course data to the `swayam404-knowledge` bank.
3. Star the repo if this saved your internal assessment grades! ⭐

---

*Made with ☕ and desperation by engineers, for engineers.*
