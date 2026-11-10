#!/usr/bin/env node
// Parses docs/roadmap.md and mirrors it into GitHub: labels, milestones, epic issues and task issues.
// Idempotent: existing labels/milestones/issues (matched by title) are reused and updated, never duplicated.
//
//   node scripts/roadmap-to-issues.mjs --dry-run      # parse and print what would be created
//   node scripts/roadmap-to-issues.mjs                # create / update everything
//   node scripts/roadmap-to-issues.mjs --no-subissues # skip the sub-issue linking pass
//
// Requires an authenticated `gh` CLI with repo scope. Writes nothing to disk.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROADMAP = join(here, '..', 'docs', 'roadmap.md');
const DRY = process.argv.includes('--dry-run');
const SUBISSUES = !process.argv.includes('--no-subissues');
const PAUSE_MS = 1100; // stay under GitHub's secondary rate limit for content creation

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gh(args, { json = false, allowFail = false } = {}) {
  try {
    const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return json ? JSON.parse(out || 'null') : out.trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`gh ${args.join(' ')} failed: ${e.stderr || e.message}`, { cause: e });
  }
}

const repo = gh(['repo', 'view', '--json', 'nameWithOwner,url'], { json: true });
const [owner, name] = repo.nameWithOwner.split('/');
const docsBase = `${repo.url}/blob/develop/docs`;

// ---------------------------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------------------------
const text = readFileSync(ROADMAP, 'utf8');
const lines = text.split('\n');

const milestones = new Map(); // "M0" -> {id, title, theme, exit, release}
const epics = []; // {id, title, milestone, tasks: []}
const tasks = []; // {id, title, desc, labels, size, depends, accepts, milestone, epic}
const backlog = []; // {title, milestone:'M8'}

// Milestone table rows: | M0 Foundation | theme | exit | release |
for (const l of lines) {
  const m = l.match(/^\|\s*(M\d)\s+([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
  if (m) milestones.set(m[1], { id: m[1], title: `${m[1]} ${m[2]}`, theme: m[3], exit: m[4], release: m[5] });
}

let currentMilestone = null;
let currentEpic = null;
let inBacklog = false;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const mh = l.match(/^## \d+\. (M\d) — (.+?)(?: \(v[\d.]+\))?$/);
  if (mh) {
    currentMilestone = mh[1];
    currentEpic = null;
    inBacklog = currentMilestone === 'M8';
    continue;
  }
  if (/^## /.test(l)) {
    currentMilestone = null;
    inBacklog = false;
    continue;
  }
  const eh = l.match(/^### (E\d+\.\d+) (.+)$/);
  if (eh && currentMilestone) {
    currentEpic = {
      id: eh[1],
      title: eh[2].replace(/\s*\(.*\)$/, ''),
      milestone: currentMilestone,
      tasks: [],
    };
    epics.push(currentEpic);
    continue;
  }
  if (inBacklog && /^- /.test(l)) {
    backlog.push({ title: l.replace(/^- /, '').replace(/\.$/, ''), milestone: 'M8' });
    continue;
  }
  const th = l.match(/^- \*\*(M\d-T\d+) (.+?)\*\* — (.*)$/);
  if (th && currentMilestone && currentEpic) {
    let rest = th[3];
    let j = i + 1;
    while (j < lines.length && /^ {2}\S/.test(lines[j])) ((rest += ' ' + lines[j].trim()), j++);
    i = j - 1;
    const labelMatches = [...rest.matchAll(/`((?:area|type):[a-z-]+)`/g)];
    const labels = labelMatches.map((x) => x[1]);
    const first = labelMatches[0];
    const last = labelMatches[labelMatches.length - 1];
    const desc = first ? rest.slice(0, first.index).trim() : rest.trim();
    const tail = last ? rest.slice(last.index + last[0].length) : '';
    const size = (tail.match(/^\.?\s*([SML])\./) || [])[1] || null;
    const depends = (tail.match(/Depends:\s*([^.]*?)\.(?:\s|$)/) || [])[1] || '';
    const accepts = (tail.match(/Accepts:\s*(.*)$/) || [])[1] || '';
    const t = {
      id: th[1],
      title: th[2],
      desc,
      labels,
      size,
      depends: depends.trim(),
      accepts: accepts.trim(),
      milestone: currentMilestone,
      epic: currentEpic.id,
    };
    tasks.push(t);
    currentEpic.tasks.push(t.id);
  }
}

const taskById = new Map(tasks.map((t) => [t.id, t]));
function expandDepends(t) {
  if (!t.depends) return [];
  const out = new Set();
  for (let tok of t.depends
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const all = tok.match(/^all (M\d)$/);
    const range = tok.match(/^(M\d-T)(\d+)…\1(\d+)$/);
    if (all) tasks.filter((x) => x.milestone === all[1] && x.id !== t.id).forEach((x) => out.add(x.id));
    else if (range) for (let n = +range[2]; n <= +range[3]; n++) out.add(`${range[1]}${n}`);
    else if (taskById.has(tok)) out.add(tok);
    else console.warn(`  ! ${t.id}: unknown dependency "${tok}"`);
  }
  return [...out];
}

// Sanity report
console.log(
  `Parsed ${milestones.size} milestones, ${epics.length} epics, ${tasks.length} tasks, ${backlog.length} backlog items`,
);
for (const t of tasks) {
  if (!t.size) console.warn(`  ! ${t.id}: no size`);
  if (t.labels.length !== 2) console.warn(`  ! ${t.id}: labels = ${t.labels.join(',')}`);
}
if (DRY) {
  console.log(
    JSON.stringify(
      { milestones: [...milestones.values()], epics, tasks: tasks.slice(0, 3), backlog },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------
const LABELS = {
  'area:infra': 'c5def5',
  'area:docs': 'c5def5',
  'area:theory': '0e8a16',
  'area:sheet': '0e8a16',
  'area:sync': '1d76db',
  'area:grid': '1d76db',
  'area:lighting': 'fbca04',
  'area:midi': '5319e7',
  'area:launchpad': '5319e7',
  'area:routing': 'd93f0b',
  'area:ui': 'e99695',
  'area:storage': 'bfd4f2',
  'area:qa': 'f9d0c4',
  'type:feature': '0052cc',
  'type:spike': 'd4c5f9',
  'type:bug': 'b60205',
  'type:docs': '006b75',
  'type:chore': 'cccccc',
  'type:test': 'bfe5bf',
  'type:epic': '3e4b9e',
  'size:S': 'ededed',
  'size:M': 'd4d4d4',
  'size:L': 'b0b0b0',
};
console.log('Labels...');
for (const [label, color] of Object.entries(LABELS)) {
  gh(['label', 'create', label, '--color', color, '--force'], { allowFail: false });
}

// ---------------------------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------------------------
console.log('Milestones...');
const existingMs = gh(['api', `repos/${owner}/${name}/milestones?state=all&per_page=100`], { json: true });
const msNumber = new Map(); // "M0" -> number
for (const ms of milestones.values()) {
  const desc = `${ms.theme}\n\nExit criterion: ${ms.exit}\nRelease: ${ms.release}\n\nSee ${docsBase}/roadmap.md`;
  const found = existingMs.find((m) => m.title === ms.title);
  if (found) {
    gh([
      'api',
      '-X',
      'PATCH',
      `repos/${owner}/${name}/milestones/${found.number}`,
      '-f',
      `description=${desc}`,
    ]);
    msNumber.set(ms.id, found.number);
  } else {
    const created = gh(
      [
        'api',
        '-X',
        'POST',
        `repos/${owner}/${name}/milestones`,
        '-f',
        `title=${ms.title}`,
        '-f',
        `description=${desc}`,
      ],
      { json: true },
    );
    msNumber.set(ms.id, created.number);
    await sleep(PAUSE_MS);
  }
}

// ---------------------------------------------------------------------------------------------
// Issues: pass 1 creates (or finds) every task, backlog item and epic
// ---------------------------------------------------------------------------------------------
function listIssues() {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = gh(['api', `repos/${owner}/${name}/issues?state=all&per_page=100&page=${page}`], {
      json: true,
    });
    if (!batch.length) break;
    out.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return out;
}
let existing = listIssues();
const byTitle = new Map(existing.map((i) => [i.title, i]));

async function ensureIssue(title, body, labels, milestoneId) {
  const found = byTitle.get(title);
  const msTitle = milestones.get(milestoneId).title;
  if (found) {
    gh([
      'issue',
      'edit',
      String(found.number),
      '--body',
      body,
      '--milestone',
      msTitle,
      ...labels.flatMap((l) => ['--add-label', l]),
    ]);
    return found.number;
  }
  const url = gh([
    'issue',
    'create',
    '--title',
    title,
    '--body',
    body,
    '--milestone',
    msTitle,
    ...labels.flatMap((l) => ['--label', l]),
  ]);
  const number = +url.split('/').pop();
  byTitle.set(title, { number, title });
  await sleep(PAUSE_MS);
  return number;
}

const taskNumber = new Map();
console.log('Tasks (pass 1)...');
for (const t of tasks) {
  const body = provisionalTaskBody(t);
  const labels = [...t.labels, ...(t.size ? [`size:${t.size}`] : [])];
  const n = await ensureIssue(`${t.id} ${t.title}`, body, labels, t.milestone);
  taskNumber.set(t.id, n);
  process.stdout.write(`  #${n} ${t.id}\n`);
}

console.log('Backlog...');
for (const b of backlog) {
  const body = `Backlog item from the roadmap (M8, unscheduled). Re-plan after v1.0.0.\n\nSee ${docsBase}/roadmap.md#12-m8--backlog-unscheduled`;
  const n = await ensureIssue(b.title, body, ['type:feature'], 'M8');
  process.stdout.write(`  #${n} ${b.title}\n`);
}

const epicNumber = new Map();
console.log('Epics...');
for (const e of epics) {
  const list = e.tasks.map((id) => `- [ ] #${taskNumber.get(id)} ${id} ${taskById.get(id).title}`).join('\n');
  const body = `Epic **${e.id}** in milestone **${milestones.get(e.milestone).title}**.\n\n${list}\n\nSource: ${docsBase}/roadmap.md`;
  const n = await ensureIssue(`Epic ${e.id}: ${e.title}`, body, ['type:epic'], e.milestone);
  epicNumber.set(e.id, n);
  process.stdout.write(`  #${n} ${e.id}\n`);
}

// ---------------------------------------------------------------------------------------------
// Pass 2: rewrite task bodies with resolved epic and dependency numbers
// ---------------------------------------------------------------------------------------------
function provisionalTaskBody(t) {
  return finalTaskBody(t, null, null);
}
function finalTaskBody(t, epicNo, depNos) {
  const ms = milestones.get(t.milestone).title;
  const epicLine = epicNo
    ? `Part of epic #${epicNo} (${t.epic}) in milestone **${ms}**.`
    : `Epic ${t.epic}, milestone **${ms}**.`;
  const deps = depNos
    ? depNos.length
      ? depNos.map((n) => `#${n}`).join(', ')
      : 'none'
    : t.depends || 'none';
  return [
    epicLine,
    '',
    t.desc,
    '',
    `**Size:** ${t.size || 'unsized'}`,
    `**Depends on:** ${deps}`,
    `**Accepts:** ${t.accepts || 'n/a'} — see [docs/plan.md](${docsBase}/plan.md)`,
    `**Roadmap ID:** ${t.id} — see [docs/roadmap.md](${docsBase}/roadmap.md)`,
  ].join('\n');
}

console.log('Tasks (pass 2: links)...');
for (const t of tasks) {
  const depNos = expandDepends(t)
    .map((id) => taskNumber.get(id))
    .filter(Boolean);
  const body = finalTaskBody(t, epicNumber.get(t.epic), depNos);
  gh(['issue', 'edit', String(taskNumber.get(t.id)), '--body', body]);
  await sleep(300);
}

// ---------------------------------------------------------------------------------------------
// Pass 3: attach tasks to epics as GitHub sub-issues (best effort)
// ---------------------------------------------------------------------------------------------
if (SUBISSUES) {
  console.log('Sub-issues...');
  existing = listIssues();
  const idByNumber = new Map(existing.map((i) => [i.number, i.id]));
  for (const e of epics) {
    const epicNo = epicNumber.get(e.id);
    const current =
      gh(['api', `repos/${owner}/${name}/issues/${epicNo}/sub_issues?per_page=100`], {
        json: true,
        allowFail: true,
      }) || [];
    const have = new Set(current.map((s) => s.number));
    for (const id of e.tasks) {
      const n = taskNumber.get(id);
      if (have.has(n)) continue;
      const ok = gh(
        [
          'api',
          '-X',
          'POST',
          `repos/${owner}/${name}/issues/${epicNo}/sub_issues`,
          '-F',
          `sub_issue_id=${idByNumber.get(n)}`,
        ],
        { allowFail: true },
      );
      if (ok === null) console.warn(`  ! could not attach #${n} to epic #${epicNo}`);
      await sleep(300);
    }
  }
}

console.log(
  `Done. ${tasks.length} tasks, ${backlog.length} backlog items, ${epics.length} epics across ${milestones.size} milestones.`,
);
