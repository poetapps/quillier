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
- **Story bible**: characters and places, the relationships between them, and where they all show up.
  - **Characters** and **Places**: name, a few words on who or what they are, aliases (“Maren” for “Maren Holt”), and notes. In a series, an entry has an Overview plus a tab per book for what's true as of that book, and entries are either shared by the series or kept to one book (**Move to series bible** shares one).
  - Mentions are found by name and alias, whole words and case-sensitive. Nothing is ever added to your text, so exports stay clean and pasted or imported chapters count too. Names that are also everyday words (Will, May, Hope) are checked with a few simple rules, and any that don't count can be confirmed by hand.
  - **Scenes**: every scene (the parts between *** breaks) with its opening words, where it's set and who's in it. Where and who are found by name and can be pinned by hand; scenes can have a note.
  - **Relationships**: a graph (drag the characters around) or a grid. A relationship can be labeled differently in each book of a series (“Betrothed” in Book 1, “Estranged” in Book 2), and characters who keep sharing chapters without a relationship show as a dashed suggestion.
  - **Dashboard**: who and what shows up in every chapter, characters who haven't appeared in a while, names that could mean two people, and who's often together.
  - A **This book / Whole series** switch shows one book or the whole series.
- **Name suggestions**: after a capital and two letters, a name from the story bible finishes itself in grey. **Tab** takes it, anything else keeps typing; when two names fit, a short list shows (↑/↓, Tab). Can be turned off in Settings.
- **Notes**: one free-form page for the whole project (characters, places, research).
- **Outline**: planning sections. Add with `+` on hover or ⌥⌘N.
- **Manuscript**: your chapters, numbered in order. Drag to reorder, double-click to rename, right-click for more.
  - **Drafts**: the "Draft 1" menu lets you branch the whole manuscript into a new draft and switch between them.
  - **Scenes**: type `***` on its own line and press Enter (or ⌘↵) to add a scene break.
- **Smart typing**: quotes curl, `--` becomes an em dash, `...` becomes an ellipsis. For anything else (`1/2`, `(c)`, `->`, `+/-`, `!=`, `<<`), a small popover offers the symbol. **Tab** takes it, **Space** keeps what you typed. Both can be turned off in Settings.
- **Notes panel** (right side, ⇧⌘\\): side notes for whatever page you're on, plus a **Details** tab with word counts, who and what from the story bible is in this chapter, a scene list, and your writing history.
- **Notes on text**: select a passage and press ⌥⌘M (or the note button in the formatting bar). The passage gets a faint dotted underline, and the note shows under "On the page" in the notes panel. Hover a noted passage, or click into it, and the note pops up just below the line; click the note to edit it. The pop-up never shows while text is selected, so it can't get in the formatting bar's way. In the panel, click the quoted text to jump back to the passage, or press Esc while typing a note. If you delete the passage, its note stays and is marked as detached. Notes are stored next to the chapter, never inside its Markdown, so exports stay clean.
- **Trash**: deleted chapters, sections, and drafts go here so you can restore them.
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
- **PDF** (book-style), **HTML**, one **Markdown** file, or a folder of per-chapter `.md` files. **Import** takes `.md`/`.txt` files. A single file is split into chapters at each `# Heading`.

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
| Export | ⌘E |

## Code map

- `electron/main.js`: window, menus, file I/O (atomic saves, backups, dialogs, export to PDF)
- `electron/preload.js`: the small `window.api` bridge
- `electron/updater.js`: update checks against GitHub Releases (quiet, no pop-ups)
- `src/store.js`: app state, autosave, every action
- `src/lib/project.js`: the `.quill` format, word counts, import parsing
- `src/lib/export.js`: Markdown/HTML export
- `src/components/`: the UI (TipTap editor with Markdown in/out)
- `site/`: the quillier.com landing page (plain HTML, deployed by Vercel on every push to main)
