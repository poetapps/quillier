# Quillier

[quillier.com](https://quillier.com)

A quiet, local Markdown writing app for books. Flat, simple, offline. Nothing you write leaves your computer. The only network request the app makes is a quiet check for new versions on GitHub, which you can turn off in Settings → Updates.

## Run it

```bash
npm install
npm start        # build + launch
npm run dev      # live-reload while hacking on it
npm run dist     # build an installable app into release/ (.dmg on macOS)
```

Shipping a new version, the website, and auto-updates are covered in [RELEASING.md](RELEASING.md).

## How it's organized

- **Library**: the home screen. Standalone books, and series of books that share one story bible. **Add to series…** on a standalone book walks you through joining a series (as a prequel, the next book, or an unnumbered companion) and combining its story bible with the series': entries that look like the same person or place can be merged or kept separate, and the rest can be shared with the series or kept to that book. Both files are backed up first, and a book can be taken back out of its series later.
- **Journals and notebooks**: **New…** can also start a journal or a notebook instead of a book. Same `.quill` file and editor, without chapters, the outline or the story bible.
  - A **journal** lists dated entries newest first, by month (click a month to fold it). ⌘N starts today's entry, clicking an entry's date moves it to another day, and exports print each entry under its date. Imported files whose name or first heading starts with a date (`2026-10-26 Rain all day`) keep that date.
  - A **notebook** (research and study notes) is unnumbered pages in folders, as deep as you like. Each page shows the folders it sits in above its title.
- **Story bible**: characters and places, the relationships between them, and where they all show up.
  - **Characters** and **Places**: name, a few words on who or what they are, aliases (“Maren” for “Maren Holt”), and notes. In a series, an entry has an Overview plus a tab per book for what's true as of that book, and entries are either shared by the series or kept to one book (**Move to series bible** shares one).
  - Mentions are found by name and alias, whole words and case-sensitive. Nothing is ever added to your text, so exports stay clean and pasted or imported chapters count too. Names that are also everyday words (Will, May, Hope) are checked with a few simple rules, and any that don't count can be confirmed by hand.
  - **Scenes**: every scene (the parts between *** breaks) with its opening words, where it's set and who's in it. Where and who are found by name and can be pinned by hand; scenes can have a note.
  - **Relationships**: a graph (drag the characters around) or a grid. A relationship can be labeled differently in each book of a series (“Betrothed” in Book 1, “Estranged” in Book 2), and characters who keep sharing chapters without a relationship show as a dashed suggestion.
  - **Dashboard**: who and what shows up in every chapter, characters who haven't appeared in a while, names that could mean two people, and who's often together.
  - A **This book / Whole series** switch shows one book or the whole series.
- **Name suggestions**: after a capital and two letters, a name from the story bible finishes itself in grey. **Tab** takes it, anything else keeps typing; when two names fit, a short list shows (↑/↓, Tab). Can be turned off in Settings.
- **Notes**: one free-form page for the whole project (characters, places, research).
- **Starting a book**: New project first asks how to start: blank, or from one of five story structures (Three-Act, Save the Cat!, The Hero’s Journey, Seven-Point, Story Circle). A structure fills the Outline with a folder per act and a page per beat, each holding a short explanation of what should happen there, meant to be written over. Optionally the acts get matching folders in the manuscript, and every beat gets an empty chapter.
- **Outline**: planning sections, in folders as deep as you like (say, Part One → Act I → beats). Add with `+` on hover or ⌥⌘N; right-click a folder to add a structure inside it.
  - **Show in manuscript**: a toggle on an outline folder's page (or its right-click menu) gives the manuscript a matching folder, plus one for every folder inside it. The two share a name; the manuscript folder keeps its own notes, and its notes panel shows what the outline says about it. Turning it off removes the manuscript folder only if nothing's been written in it, and turning it back on links the same one again.
- **Manuscript**: your chapters, numbered in order (folders don't affect the numbers). Drag to reorder or into a folder (drop on the middle of a folder row), double-click to rename, right-click for more. Folders collapse, and **Remove folder, keep contents** ungroups one.
  - **Book parts**: folders are only for organizing unless you turn on **Book part**. A part starts with its own “Part One” page in every export and nests its chapters in the EPUB contents.
  - **Linking chapters to beats**: the outline button under a chapter's title picks the beats it covers (as many as you like). Their outline text shows at the top of the chapter's notes panel, and each beat's page shows which chapters cover it.
  - **Drafts**: the "Draft 1" menu lets you branch the whole manuscript into a new draft and switch between them.
  - **Takes**: a chapter can have other takes to write in (a darker ending, another point of view), from the **Versions** tab in the notes panel. Only the take in the book is exported, counted and read by the story bible; **Put in the book** swaps one in, and the take it replaces is kept. When a chapter has more than one, a "Take:" button under its title switches between them.
  - **Saved versions**: **Save version** (⌥⌘S, or the Versions tab) keeps a copy of a chapter as it is, with an optional name. One is also saved automatically each time you sit down to write (after a break of 45 minutes or more) and when you mark a chapter Drafted, Revised or Done. Automatic ones older than three days thin out to the last of each day. Click a version to **compare** it with what's on the page: cut words are struck through, new words are tinted, and each change has **Use old** and **Keep** in the margin. **Side by side** puts the two texts next to each other, and **Only changed paragraphs** folds away the rest. **Restore this version** saves what you have first, so nothing is lost. Takes can be compared with each other the same way.
  - **Scenes**: type `***` on its own line and press Enter (or ⌘↵) to add a scene break.
- **Smart typing**: quotes curl, `--` becomes an em dash, `...` becomes an ellipsis. For anything else (`1/2`, `(c)`, `->`, `+/-`, `!=`, `<<`), a small popover offers the symbol. **Tab** takes it, **Space** keeps what you typed. Both can be turned off in Settings.
- **Dictation** (⇧⌘D, or the microphone in the top bar): talk, and the words show up in a small bar a sentence at a time; **Finish** (↵) puts them at the cursor as one undoable change, **Discard** (Esc) drops them. Say "new paragraph", "new line", "scene break", or "open quote" … "close quote". With **Put dialogue in quotation marks** on (the default), dialogue is quoted as it's written down: "Let's go to the movies, John said" becomes “Let’s go to the movies,” John said. Story bible names are passed along so they're spelled right. It needs a one-time download of an OpenAI Whisper model (Standard, 574 MB, or Light, 190 MB) and runs entirely on your computer, in its own process. Models and settings are in **Settings → Dictation**; `research/dictation-eval` has the measurements.
- **Notes panel** (right side, ⇧⌘\\): side notes for whatever page you're on, plus a **Details** tab with word counts, who and what from the story bible is in this chapter, a scene list, and your writing history.
- **Notes on text**: select a passage and press ⌥⌘M (or the note button in the formatting bar). The passage gets a faint dotted underline, and the note shows under "On the page" in the notes panel. Hover a noted passage, or click into it, and the note pops up just below the line; click the note to edit it. The pop-up never shows while text is selected, so it can't get in the formatting bar's way. In the panel, click the quoted text to jump back to the passage, or press Esc while typing a note. If you delete the passage, its note stays and is marked as detached. Notes are stored next to the chapter, never inside its Markdown, so exports stay clean. By default the panel lists only the notes on text you can see, following you as you scroll; **Show all** lists every note on the page.
- **Trash**: deleted chapters, takes, sections, folders (with everything in them), and drafts go here so you can restore them.
- **Themes**: light, dark, or follow the system. **Pure black** (Settings) makes dark mode true `#000` everywhere except the text, for OLED screens.

## The project file

Each book is a single `.quill` file. It's plain JSON, and every page's text inside it is Markdown. You pick where it lives when you create it, and it **autosaves as you type**:

- Writes are atomic (temp file, then rename), so a crash can't leave a half-written file.
- If the window closes mid-save, a final synchronous save runs first.
- Backups: a copy goes into the app's backups folder when you open a project and every 10 minutes while you write. The last 30 are kept per project (Settings → Backups → Open folder).
- If the file changes on disk from somewhere else (a sync tool, say), that version gets backed up before it's overwritten.

A **series** is one more small file (`.quillseries`, also plain JSON) that lists its books and holds the story bible they share. Each book stays in its own `.quill` file and points back at the series; entries only one book uses stay in that book. Links are stored relative to each other, so moving the whole folder keeps them working, and the series file is backed up like a project.

Double-clicking a `.quill` file opens it in the packaged app. Projects from when the app was called LibreDraft (`.ldraft`) still open and save as before, and settings, recent projects and backups move over automatically.

**Export** (⌘E) to:

- **Manuscript**: standard submission format as a PDF. 8.5×11, 1" margins, 12pt Courier Prime, double-spaced, ½" indents. The title page has your contact details top-left, a rounded word count top-right, and the title and byline centered. Every page after it carries a "Surname / TITLE / page" header, each chapter starts a third of the way down a new page, scene breaks print as `#`, and the book ends with END. Author and contact details are saved with the project.
- **EPUB ebook**: EPUB 3 (with EPUB 2 navigation for older readers). It validates cleanly with W3C epubcheck. Use your own cover image, or let it generate a simple typographic one.
- **Book PDF**: a print-ready paperback interior at 5×8, 5.5×8.5 or 6×9 inches. Mirrored margins with the wider one at the spine, justified and hyphenated text, chapters sunk a third of the way down a new page, folios at the foot, and running heads (book title on versos, chapter title on rectos). The title page and part pages are rectos with a blank verso behind them, and none of them, nor a chapter's opening page, carries a folio or head. The trim size is saved with the project.
- **HTML**, one **Markdown** file, or a folder of per-chapter `.md` files. **Import** takes `.md`/`.txt` files. A single file is split into chapters at each `# Heading`.

## Alpha features

Unfinished features stay hidden until you turn on **Settings → Alpha features**, and may change or go away. Right now there's one: an optional local language model (a one-time download, run entirely on your computer) that helps the story bible tell “May” the character from the month, see who's really in a scene, and suggest relationships.

## Shortcuts

| | |
|---|---|
| New chapter | ⌘N |
| New outline section | ⌥⌘N |
| New / open project | ⇧⌘N / ⌘O |
| Toggle sidebar / notes panel | ⌘\\ / ⇧⌘\\ |
| Focus mode | ⇧⌘F (Esc to exit) |
| Dark mode | ⇧⌘L |
| Text size | ⌘+ / ⌘− |
| Bold / italic | ⌘B / ⌘I |
| Scene break | ⌘↵ |
| Note on selected text | ⌥⌘M |
| Dictate | ⇧⌘D (↵ to finish, Esc to discard) |
| Export | ⌘E |

## Code map

- `electron/main.js`: window, menus, file I/O (atomic saves, backups, dialogs, export to PDF)
- `electron/preload.js`: the small `window.api` bridge
- `electron/updater.js`: update checks against GitHub Releases (quiet, no pop-ups)
- `src/store.js`: app state, autosave, every action
- `src/lib/project.js`: the `.quill` format, folders, word counts, import parsing
- `src/lib/structure.js`: how the outline and the manuscript link up, and starting from a structure
- `src/lib/templates.js`: the five story structures and their guidance text
- `src/lib/export.js`: Markdown/HTML/manuscript/EPUB export
- `src/dictation.js`, `src/lib/dictation*.js`, `electron/dictation/`: dictation (microphone and pauses, text rules, the whisper.cpp worker)
- `src/components/`: the UI (TipTap editor with Markdown in/out)
- `site/`: the quillier.com landing page (plain HTML, deployed by Vercel on every push to main)
