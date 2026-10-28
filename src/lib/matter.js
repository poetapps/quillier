// Front and back matter: the pages around the chapters in a finished book. A copyright page,
// dedication and epigraph before chapter one; acknowledgments, about the author and the author's
// other books after the last. They're kept in `p.matter`, apart from the chapters, so word counts,
// the story bible and the submission manuscript never see them. A page with nothing on it is
// left out; the copyright page and the list of other books are switched on by hand.

export const FRONT = ['copyright', 'dedication', 'epigraph'];
export const BACK = ['acknowledgments', 'about', 'alsoBy'];

const DEFAULTS = {
  copyright: { on: false, custom: false, text: '', year: '', holder: '', isbn: '', publisher: '', edition: '', fiction: true },
  dedication: { text: '' },
  epigraph: { text: '', source: '' },
  acknowledgments: { text: '' },
  about: { text: '' },
  alsoBy: { on: false, extra: '' },
};

// p.matter with every page filled in (older files have none).
export function matterOf(p) {
  const m = p?.matter && typeof p.matter === 'object' ? p.matter : {};
  return Object.fromEntries(Object.entries(DEFAULTS).map(([id, d]) => [id, { ...d, ...(m[id] && typeof m[id] === 'object' ? m[id] : {}) }]));
}

const author = (p) => (p.meta?.author || '').trim();

// The copyright page as paragraphs, each a list of lines.
export function copyrightLines(p) {
  const c = matterOf(p).copyright;
  if (c.custom) return c.text.split(/\n\s*\n/).map((para) => para.split('\n').map((l) => l.trim()).filter(Boolean)).filter((l) => l.length);
  const year = c.year.trim() || String(new Date().getFullYear());
  const holder = c.holder.trim() || author(p) || 'the author';
  const out = [[`Copyright © ${year} ${holder}`, 'All rights reserved.']];
  if (c.fiction) {
    out.push([
      'This is a work of fiction. Names, characters, places and incidents are either the products of the author’s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events or locales is entirely coincidental.',
    ]);
  }
  out.push([
    'No part of this book may be reproduced in any form or by any electronic or mechanical means, including information storage and retrieval systems, without permission in writing from the author, except for the use of brief quotations in a book review.',
  ]);
  const facts = [c.isbn.trim() && `ISBN ${c.isbn.trim()}`, c.edition.trim(), c.publisher.trim() && `Published by ${c.publisher.trim()}`].filter(Boolean);
  if (facts.length) out.push(facts);
  return out;
}

// What the generated copyright page says, as text to start "Write my own" from.
export const copyrightAsText = (p) => copyrightLines({ ...p, matter: { ...matterOf(p), copyright: { ...matterOf(p).copyright, custom: false } } }).map((l) => l.join('\n')).join('\n\n');

export const alsoByTitle = (p) => (author(p) ? `Also by ${author(p)}` : 'Also by the Author');

// The author's other books: the rest of the series (from `series`: { title, books: [title] }, in
// series order) and any written in by hand, one per line. [{ heading, titles }]
export function alsoByGroups(p, series) {
  const groups = [];
  if (series?.books?.length) groups.push({ heading: /\bseries\b/i.test(series.title) ? series.title : `The ${series.title} series`, titles: series.books });
  const extra = matterOf(p)
    .alsoBy.extra.split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (extra.length) groups.push({ heading: groups.length ? 'Other books' : '', titles: extra });
  return groups;
}

// The pages to print, in order: { front: [item], back: [item] }. Items are
// { type: 'copyright', id, title, lines } | { type: 'dedication' | 'epigraph', id, title, md, source? }
// | { type: 'section', id, title, md } | { type: 'alsoBy', id, title, groups }.
export function matterItems(p, series) {
  const m = matterOf(p);
  const front = [];
  const back = [];
  if (m.copyright.on) front.push({ type: 'copyright', id: 'copyright', title: 'Copyright', lines: copyrightLines(p) });
  if (m.dedication.text.trim()) front.push({ type: 'dedication', id: 'dedication', title: 'Dedication', md: m.dedication.text });
  if (m.epigraph.text.trim()) front.push({ type: 'epigraph', id: 'epigraph', title: 'Epigraph', md: m.epigraph.text, source: m.epigraph.source.trim() });
  if (m.acknowledgments.text.trim()) back.push({ type: 'section', id: 'acknowledgments', title: 'Acknowledgments', md: m.acknowledgments.text });
  if (m.about.text.trim()) back.push({ type: 'section', id: 'about', title: 'About the Author', md: m.about.text });
  const groups = m.alsoBy.on ? alsoByGroups(p, series) : [];
  if (groups.length) back.push({ type: 'alsoBy', id: 'also-by', title: alsoByTitle(p), groups });
  return { front, back };
}

export const hasMatter = (p, series) => {
  const { front, back } = matterItems(p, series);
  return front.length + back.length > 0;
};
