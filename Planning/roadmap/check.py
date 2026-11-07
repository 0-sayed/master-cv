#!/usr/bin/env python3
"""Check roadmap IDs, dependencies, ownership and all local planning links (no network)."""
from collections import Counter
from pathlib import Path
from urllib.parse import unquote
import argparse
import json
import re
import sys
import unicodedata
from urllib.parse import urlsplit


def registry_claim_errors(text, inventory, figma):
    """Reject stale prose only when the published registries contradict it."""
    inventory_screens = {screen['id']: screen for screen in inventory['screens']}
    mapped = figma['screens']
    mobile_ids = {'S37', 'S38', 'S39'}
    published = mobile_ids <= inventory_screens.keys() and mobile_ids <= mapped.keys()
    published = published and all(
        {'desktop', 'mobile'} <= set(inventory_screens[sid]['platforms'])
        and all(mapped[sid].get(vp, {}).get('nodeId') for vp in ('desktop', 'mobile'))
        for sid in mobile_ids)
    errors = []
    for paragraph in re.split(r'\n\s*\n', text):
        prose = ' '.join(paragraph.split())
        for claim in re.finditer(
            r'(?:inventory(?:/map)?|inventory and map|map)\s+(?:has|contains?|contain)\s+(\d+)\s+(?:entries|screen records)',
            prose, re.I):
            if int(claim[1]) != len(inventory_screens):
                errors.append('Obsolete registry record count; compare the published JSON baseline.')
        if not published or not re.search(r'S3[789]', prose):
            continue
        obsolete = (
            r'(?:absent|missing|unmapped|not (?:present|listed|published|mapped|included|available)|no current|no (?:JSON|node|registry|map|inventory))[^.;]*?(?:inventory|map|JSON|node|registry)',
            r'(?:inventory|map|JSON|node|registry)[^.;]*?(?:absent|missing)',
            r'(?:mapping/design|registry/design)[^.;]*?(?:update|reconciliation)[^.;]*?(?:before|need|require)',
            r'(?:need|require|resolve)[^.;]*?(?:mapping/design|registry/design)[^.;]*?(?:update|reconciliation)',
            r'proposed only',
            r'S01[-–]S36[^.;]*?plus proposed S37[-–]S39',
        )
        if any(re.search(pattern, prose, re.I) for pattern in obsolete):
            errors.append('Obsolete S37-S39 absence/design blocker; desktop/mobile masters are published.')
    return errors


def check(snapshot=None):
    roadmap = Path(__file__).resolve().parent
    planning = roadmap.parent
    context = planning / 'context'
    requirements_text = (context / 'business/requirements.md').read_text()
    required = set(re.findall(r'^\|\s*((?:B-[CEO]\d{2})|(?:A\d{2}))\s*\|', requirements_text, re.M))
    inventory = json.loads((context / 'design/inventory.json').read_text())
    inventory_ids = {screen['id'] for screen in inventory['screens']}
    figma = json.loads((context / 'design/figma-map.json').read_text())
    handoff = (context / 'design/figma-handoff.md').read_text()
    proposed = set(re.findall(r'^\|\s*(S\d{2})\s*·[^\n]*Proposed', handoff, re.M)) - inventory_ids
    readme = (roadmap / 'README.md').read_text()
    req_rows = re.findall(r'^\|\s*(B-[CEO]\d{2}|A\d{2})\s*\|\s*\[(T\d{3})\]', readme, re.M)
    screen_rows = re.findall(r'^\|\s*(S\d{2}b?)\s+[^|]+\|\s*\[(T\d{3})\]', readme, re.M)
    errors = []
    output = []

    def coverage(label, rows, expected, supplements=()):
        counts = Counter(ident for ident, _ in rows)
        unassigned = expected - counts.keys()
        unknown = counts.keys() - expected - set(supplements)
        duplicates = [ident for ident, count in counts.items() if count != 1]
        output.append(f'{label}: {len(expected)} source IDs; {len(unassigned)} unassigned; '
                      f'{len(unknown)} unknown; {len(duplicates)} duplicate owners.')
        if unassigned or unknown or duplicates:
            errors.append(f'{label}: missing={sorted(unassigned)} unknown={sorted(unknown)} duplicates={duplicates}')

    coverage('Requirements', req_rows, required)
    coverage('Inventory screens', screen_rows, inventory_ids, proposed)
    if set(dict(screen_rows)) != inventory_ids | proposed:
        errors.append('Screen matrix must cover observed inventory plus all proposed handoff screens.')
    output.append('Proposed screens outside inventory/map: ' + (', '.join(sorted(proposed)) or 'none') + '.')
    if inventory_ids != set(figma['screens']):
        errors.append('Observed inventory and Figma map screen IDs differ.')

    def parse_table(text):
        parsed = {}
        for line in text.splitlines():
            if not line.startswith('|') or not re.search(r'`T\d{3}`', line):
                continue
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            tid = re.search(r'T\d{3}', cells[2])[0]
            parsed[tid] = dict(status=cells[0], priority=int(cells[1]), title=cells[2].split(' - ', 1)[1],
                size=cells[3], branch=cells[4].strip('`'), deps=re.findall(r'T\d{3}', cells[5]), context=cells[6])
        return parsed

    table_text = (roadmap / 'tasks.md').read_text()
    table = parse_table(table_text)
    task_ids = {f'T{i:03}' for i in range(16)}
    if set(table) != task_ids:
        errors.append('Task table must contain exactly T000-T015.')
    for ident, tid in req_rows + screen_rows:
        if tid not in table:
            errors.append(f'{ident}: unknown owner {tid}')
    if snapshot:
        baseline_text = Path(snapshot).read_text()
        if parse_table(baseline_text) != table:
            errors.append('v1.0 task rows changed.')
        def scheduler(text):
            return text.split('## Scheduler contract', 1)[1].split('## Task briefs', 1)[0].strip()
        if scheduler(baseline_text) != scheduler(table_text):
            errors.append('v1.0 scheduler contract changed.')
        output.append('v1.0 comparison: task rows and scheduler contract ' + ('FAIL.' if errors else 'unchanged.'))

    files = [roadmap / 'README.md', roadmap / 'tasks.md'] + sorted((roadmap / 'tasks').glob('T*.md'))
    for file in files:
        errors.extend(f'{file.name}: {error}' for error in registry_claim_errors(file.read_text(), inventory, figma))
    if len(files) != 18:
        errors.append('Expected README, index and 16 briefs.')
    path_count = 0
    required_sections = ['Goal', 'Scope (in)', 'Explicit exclusions', 'Requirement IDs', 'Figma targets',
                         'Source references', 'Ownership boundaries', 'Implementation notes',
                         'Acceptance evidence', 'Open approvals/blockers affecting the task', 'Done definition']
    line_counts = []
    for file in files[2:]:
        text = file.read_text()
        tid = file.name[:4]
        row = table[tid]
        line_counts.append(len(text.splitlines()))
        for section in required_sections:
            if f'## {section}\n' not in text:
                errors.append(f'{file.name}: missing section {section}')
        if f'**Task:** {tid} · **PR size:** L · **Branch:** `{row["branch"]}`' not in text:
            errors.append(f'{file.name}: header/branch mismatch')
        if f'**Depends on:** {", ".join(row["deps"]) or "None"} · **Priority:** {row["priority"]}' not in text:
            errors.append(f'{file.name}: dependency/priority mismatch')
        if row['size'] != 'L' or row['status'] != '[ ]':
            errors.append(f'{tid}: size/status must be L/pending')
        used = set(re.findall(r'\b(?:B-[CEO]\d{2}|A\d{2})\b', text))
        if used - required:
            errors.append(f'{file.name}: unknown requirement IDs {sorted(used - required)}')
        declared = text.split('**Owns:** ', 1)[1].split('\n', 1)[0]
        declared_ids = set(re.findall(r'\b(?:B-[CEO]\d{2}|A\d{2})\b', declared))
        if declared_ids != {ident for ident, owner in req_rows if owner == tid}:
            errors.append(f'{file.name}: requirement ownership differs from matrix')
        target_text = text.split('## Figma targets', 1)[1].split('## Source references', 1)[0]
        if re.search(r'\b\d+:\d+\b|node-id=', target_text):
            errors.append(f'{file.name}: hard-coded Figma node ID')
        for phrase in ['Arabic RTL', 'English LTR', 'desktop 1440', 'mobile 390', 'fonts and direction', 'copy-deck.json']:
            if phrase not in text:
                errors.append(f'{file.name}: missing acceptance/copy contract {phrase}')
        ownership = text.split('## Ownership boundaries', 1)[1].split('## Implementation notes', 1)[0]
        for value in re.findall(r'`([^`]+)`', ownership):
            if '/' in value or '.' in value:
                path_count += 1
                if not (planning.parent / value).exists():
                    errors.append(f'{file.name}: nonexistent ownership path {value}')
        if not 80 <= len(text.splitlines()) <= 160:
            errors.append(f'{file.name}: brief is {len(text.splitlines())} lines (expected 80-160)')
        if any('—' in line for line in text.splitlines()[1:]):
            errors.append(f'{file.name}: new em dash outside recovered title')

    expected_edges = {(dep, tid) for tid, row in table.items() for dep in row['deps']}
    graph = (roadmap / 'dependencies.mmd').read_text()
    edges = set(re.findall(r'\b(T\d{3})\s*-->\s*(T\d{3})\b', graph))
    nodes = set(re.findall(r'^\s*(T\d{3})\[', graph, re.M))
    if edges != expected_edges or nodes != task_ids:
        errors.append('Mermaid nodes/edges differ from index.')
    classes = re.findall(r'^\s*class\s+([T\d,]+)\s+(pending|done);', graph, re.M)
    classified = Counter(tid for ids, _ in classes for tid in ids.split(','))
    if set(classified) != task_ids or any(c != 1 for c in classified.values()) or any(c != 'pending' for _, c in classes):
        errors.append('Every pending task must have exactly one pending class.')
    roots = {tid for tid, row in table.items() if not row['deps']}
    visited = set()
    while True:
        eligible = {tid for tid, row in table.items() if set(row['deps']) <= visited}
        if eligible <= visited:
            break
        visited |= eligible
    if roots != {'T000'} or visited != task_ids:
        errors.append('Task graph must be acyclic with T000 as sole root.')
    reaches_final = {'T015'}
    while True:
        previous = set(reaches_final)
        reaches_final |= {dep for dep, target in edges if target in reaches_final}
        if reaches_final == previous:
            break
    if reaches_final != task_ids - {'T014'}:
        errors.append('Every task except independent mobile T014 must feed paid qualification T015.')
    required_dependencies = {
        'T011': {'T007', 'T009'},
        'T012': {'T005', 'T009'},
        'T013': {'T007', 'T009', 'T011', 'T012'},
        'T014': {'T003', 'T009'},
        'T015': {'T008', 'T010', 'T013'},
    }
    for tid, dependencies in required_dependencies.items():
        if tid not in table or set(table[tid]['deps']) != dependencies:
            errors.append(f'{tid}: dependency contract must be {sorted(dependencies)}')
    if table.get('T014', {}).get('branch') != 'feat/t014-mobile-authentication':
        errors.append('T014 mobile branch differs from the approved contract.')
    beta_ancestors = {'T013'}
    while True:
        previous = set(beta_ancestors)
        beta_ancestors |= {dep for dep, target in edges if target in beta_ancestors}
        if beta_ancestors == previous:
            break
    if beta_ancestors & {'T008', 'T010', 'T014'}:
        errors.append('Free beta must not depend on career tools, billing or mobile authentication.')
    for row in table.values():
        for value in re.findall(r'`([^`]+)`', row['context']):
            if not (planning / value).is_file():
                errors.append(f'Index Context path missing: {value}')
    output.append(f'Graph: {len(table)} pending L tasks; {len(edges)} matching edges; acyclic; sole root T000.')
    output.append(f'Brief structure/ownership: {len(files)-2} briefs; {min(line_counts)}-{max(line_counts)} lines; '
                  f'{path_count} existing path references checked.')

    # Definitions occur once in their authoritative register; all prose references resolve.
    all_markdown = sorted(planning.rglob('*.md')) + [planning.parent / 'AGENTS.md']
    decision_text = (context / 'decisions.md').read_text()
    security_text = (context / 'technical/security.md').read_text()
    definitions = {}
    for label, source, pattern, expected in [
        ('business decisions', decision_text, r'^\| (D\d{2}) \|', {f'D{i:02}' for i in range(1, 31)}),
        ('technical decisions', decision_text, r'^\| (T\d{2}) \|', {f'T{i:02}' for i in range(1, 17)}),
        ('requirements', requirements_text, r'^\| (B-[CEO]\d{2}|A\d{2}) \|', required),
        ('OTP controls', security_text, r'^\| (OTP-\d{2}) \|', {f'OTP-{i:02}' for i in range(1, 13)}),
        ('tasks', table_text, r'^\| \[ \]\s*\|[^\n]*?`(T\d{3})` -', task_ids),
    ]:
        found = re.findall(pattern, source, re.M)
        if set(found) != expected or len(found) != len(set(found)):
            errors.append(f'{label}: definitions must be unique and complete')
        definitions[label] = set(found)
    source_definitions = []
    for file in all_markdown:
        source_definitions += re.findall(r'^- \*\*((?:T|B)-S\d{2})\s', file.read_text(), re.M)
    if len(source_definitions) != len(set(source_definitions)):
        errors.append('Source reference definitions must be unique.')
    known = set().union(*definitions.values(), inventory_ids, source_definitions)
    reference_pattern = r'\b(?:(?:T|B)-S\d{2}|D\d{2}|T\d{2,3}|B-[CEO]\d{2}|A\d{2}|OTP-\d{2}|S\d{2}b?)\b'
    for file in all_markdown:
        unknown = set(re.findall(reference_pattern, file.read_text())) - known
        if unknown:
            errors.append(f'{file.name}: unresolved IDs {sorted(unknown)}')
    output.append('IDs: task, requirement, decision and OTP definitions unique; all planning references resolved.')

    link_count = 0
    def anchors(target):
        body = target.read_text()
        body = re.sub(r'^(```|~~~).*?^\1[^\n]*$', '', body, flags=re.M | re.S)
        found = set(re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)', body, re.I))
        counts = Counter()
        for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', body, re.M):
            heading = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', heading)
            heading = re.sub('<[^>]*>', '', heading).lower()
            slug = ''.join(c for c in heading if c in '-_ ' or unicodedata.category(c)[0] in 'LN').replace(' ', '-')
            index = counts[slug]
            counts[slug] += 1
            found.add(slug if not index else f'{slug}-{index}')
        return found

    for file in all_markdown:
        body = re.sub(r'^(```|~~~).*?^\1[^\n]*$', '', file.read_text(), flags=re.M | re.S)
        links = re.findall(r'\]\((<[^>]+>|[^\n)]+)\)', body)
        links += re.findall(r'^\s*\[[^\]]+\]:\s*(\S+)', body, re.M)
        for raw in links:
            destination = raw[1:-1] if raw.startswith('<') else re.split(r'\s+["\']', raw, 1)[0]
            parsed = urlsplit(destination)
            if parsed.scheme or parsed.netloc:
                continue
            link_count += 1
            target = (file.parent / unquote(parsed.path)).resolve() if parsed.path else file.resolve()
            label = file.relative_to(planning.parent)
            if not target.exists():
                errors.append(f'{label}: missing link {destination}')
            elif parsed.fragment and target.suffix == '.md' and unquote(parsed.fragment) not in anchors(target):
                errors.append(f'{label}: missing anchor {destination}')
    output.append(f'Links: {link_count} local targets/anchors checked across Planning/**/*.md and root AGENTS.md.')
    output.append('English copy deck: ' + ('present.' if (context / 'design/copy-deck.json').is_file()
                  else 'parallel source pending; referenced as an integration blocker, not a broken link.'))
    output.append(f'Errors: {len(errors)}.')
    for line in output:
        print(line)
    for error in errors[:10]:
        print('ERROR: ' + error)
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', help='Optional surviving v1.0 index to compare rows and scheduler verbatim.')
    arguments = parser.parse_args()
    sys.exit(check(arguments.snapshot))
