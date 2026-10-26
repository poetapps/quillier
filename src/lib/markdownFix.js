import { MarkdownManager } from '@tiptap/markdown';

// @tiptap/markdown HTML-escapes every &, < and > in prose, so "Smith & Sons" would be saved
// as "Smith &amp; Sons". Keep the files readable: only escape what Markdown would actually
// misread (something that looks like an entity, an HTML tag, or a leading blockquote marker).

const proto = MarkdownManager?.prototype;
const original = proto?.encodeTextForMarkdown;

if (typeof original === 'function') {
  proto.encodeTextForMarkdown = function (text, node, parentNode) {
    const out = original.call(this, text, node, parentNode);
    const codeTypes = this.codeTypes instanceof Set ? this.codeTypes : new Set(['code', 'codeBlock']);
    const inCode =
      (parentNode?.type != null && codeTypes.has(parentNode.type)) ||
      (node?.marks || []).some((m) => codeTypes.has(typeof m === 'string' ? m : m.type));
    if (inCode) return out;
    return out
      .replace(/&(amp|lt|gt);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>' })[e])
      .replace(/&(?=#?[a-z0-9]+;)/gi, '&amp;')
      .replace(/<(?=[a-z/!?])/gi, '&lt;')
      .replace(/^>/, '\\>');
  };
}
