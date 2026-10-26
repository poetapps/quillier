import { useCallback, useEffect, useRef } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import Typography from '@tiptap/extension-typography';
import { Bold, Italic, Strikethrough, Heading1, Heading2, Quote, List, Asterisk, MessageSquarePlus } from 'lucide-react';
import { registerFlusher } from '../store.js';
import { SymbolHints } from '../lib/symbolHints.js';
import { NameHints } from '../lib/nameHints.js';
import '../lib/markdownFix.js';
import { NoteMark, applyAnchors, readAnchors, removeNoteMarks, noteIdsAtCursor } from '../lib/inlineNotes.js';

// Prose-friendly smart typography: curly quotes, em dashes, ellipses. Nothing else.
const ProseTypography = Typography.configure(
  Object.fromEntries(
    [
      'copyright', 'laquo', 'leftArrow', 'multiplication', 'notEqual', 'oneHalf', 'oneQuarter', 'threeQuarters',
      'plusMinus', 'raquo', 'registeredTrademark', 'rightArrow', 'servicemark', 'superscriptTwo', 'superscriptThree', 'trademark',
    ].map((k) => [k, false])
  )
);

const SCENE_BREAK_TEXT = /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|—-+|⁂)$/;

// ⌘↵ inserts a scene break; so does typing *** (or ---, * * *) on its own line and pressing Enter.
const SceneBreakKey = Extension.create({
  name: 'sceneBreakKey',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.chain().focus().setHorizontalRule().run(),
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph') return false;
        if (!SCENE_BREAK_TEXT.test($from.parent.textContent.trim())) return false;
        return this.editor
          .chain()
          .deleteRange({ from: $from.start(), to: $from.end() })
          .setHorizontalRule()
          .run();
      },
    };
  },
});

function FormatBar({ editor, onAddNote }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      quote: e.isActive('blockquote'),
      list: e.isActive('bulletList'),
    }),
  });
  const btn = (key, Icon, run, title) => (
    <button
      key={key}
      title={title}
      className={on[key] ? 'on' : ''}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(editor.chain().focus()).run()}
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
  return (
    <div className="format-bar">
      {btn('bold', Bold, (c) => c.toggleBold(), 'Bold  ⌘B')}
      {btn('italic', Italic, (c) => c.toggleItalic(), 'Italic  ⌘I')}
      {btn('strike', Strikethrough, (c) => c.toggleStrike(), 'Strikethrough')}
      <span className="sep" />
      {btn('h1', Heading1, (c) => c.toggleHeading({ level: 1 }), 'Heading')}
      {btn('h2', Heading2, (c) => c.toggleHeading({ level: 2 }), 'Subheading')}
      {btn('quote', Quote, (c) => c.toggleBlockquote(), 'Quote')}
      {btn('list', List, (c) => c.toggleBulletList(), 'List')}
      {btn('scene', Asterisk, (c) => c.setHorizontalRule(), 'Scene break  ⌘↵')}
      {onAddNote && (
        <>
          <span className="sep" />
          <button title="Add a note to this text  ⌥⌘M" onMouseDown={(e) => e.preventDefault()} onClick={onAddNote}>
            <MessageSquarePlus size={15} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  typography = true,
  symbolHints = true,
  getNames, // enables name suggestions from the story bible
  spellcheck = true,
  className = '',
  formatBar = false,
  onReady,
  getNotes, // enables notes on selected text: () => current inlineNotes for this page
  onAddNote,
  onActiveNote,
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const getNotesRef = useRef(getNotes);
  getNotesRef.current = getNotes;
  const getNamesRef = useRef(getNames);
  getNamesRef.current = getNames;
  const onAddNoteRef = useRef(onAddNote);
  onAddNoteRef.current = onAddNote;
  const onActiveNoteRef = useRef(onActiveNote);
  onActiveNoteRef.current = onActiveNote;
  const withNotes = !!getNotes;
  const timer = useRef(null);
  const pending = useRef(false);
  const editorRef = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current) return;
    pending.current = false;
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    let anchors;
    if (getNotesRef.current) {
      anchors = readAnchors(ed.state.doc);
      // Drop marks whose note no longer exists (e.g. brought back by undo after deleting the note).
      const known = new Set(getNotesRef.current().map((n) => n.id));
      const stray = Object.keys(anchors).filter((id) => !known.has(id));
      if (stray.length) {
        removeNoteMarks(ed, stray);
        stray.forEach((id) => delete anchors[id]);
      }
    }
    onChangeRef.current(ed.getMarkdown(), anchors);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Markdown,
      Placeholder.configure({ placeholder }),
      ...(typography ? [ProseTypography] : []),
      ...(symbolHints ? [SymbolHints] : []),
      ...(getNames ? [NameHints.configure({ getNames: () => getNamesRef.current?.() || [] })] : []),
      SceneBreakKey,
      ...(withNotes ? [NoteMark.configure({ onAdd: () => onAddNoteRef.current?.() })] : []),
    ],
    content: value || '',
    contentType: 'markdown',
    editorProps: {
      attributes: { class: `md ${className}`, spellcheck: spellcheck ? 'true' : 'false' },
    },
    onCreate: ({ editor: ed }) => {
      if (getNotesRef.current) applyAnchors(ed, getNotesRef.current());
    },
    onSelectionUpdate: ({ editor: ed }) => {
      onActiveNoteRef.current?.(noteIdsAtCursor(ed.state)[0] || null);
    },
    onUpdate: () => {
      pending.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    },
    shouldRerenderOnTransaction: false,
  });
  editorRef.current = editor;

  useEffect(() => {
    const unregister = registerFlusher(flush);
    return () => {
      unregister();
      flush();
    };
  }, [flush]);

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {formatBar && editor && (
        <BubbleMenu editor={editor} options={{ placement: 'top', offset: 8 }}>
          <FormatBar editor={editor} onAddNote={withNotes ? () => onAddNoteRef.current?.() : null} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </>
  );
}
