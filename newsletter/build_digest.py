#!/usr/bin/env python3
"""Daily Edition renderer and sender.

THE AGENT DOES NOT WRITE THIS FILE AND MUST NOT EDIT IT.
It reads /tmp/digest_data.json, renders the approved template, and sends.

Usage:  python3 newsletter/build_digest.py                  # build + send
        python3 newsletter/build_digest.py --dry-run        # build only, no send
        python3 newsletter/build_digest.py --alert "reason" # Slack alert only, no email

This repository is PUBLIC, so no credentials live in this file. RESEND_KEY
and SLACK_BOT are read from the environment and supplied by the caller.

Input JSON schema:
{
  "date_str":   "Tuesday, 11 August 2026",
  "short_date": "11 Aug",
  "top_headline": "...",              # <=90 chars, the masthead headline
  "today_line": "...",                # "" to omit the Today card
  "sports":  [[headline, context, url, source, wim], ...],
  "local":   [[headline_es, context_es, url, source, wim], ...],
  "general": [[headline, context, url, source, wim], ...]
}
"""
import html as html_lib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

# Credentials are NEVER stored in this file. This repository is public.
# They are injected as environment variables by the caller:
#   RESEND_KEY=... SLACK_BOT=... python3 newsletter/build_digest.py
RESEND_KEY = os.environ.get('RESEND_KEY', '')
SLACK_BOT = os.environ.get('SLACK_BOT', '')
SLACK_CHANNEL = 'C0B2KM4M7CP'
TO = 'liam@keeps.sport'
FROM = 'Daily Edition <digest@lpcmi.com>'

DATA = '/tmp/digest_data.json'
OUT = '/tmp/digest.html'
RESP = '/tmp/resend_resp.json'

# accent, panel tint, chip fill, deep ink, dark-panel class suffix
BLUE = ('#0284C7', '#EFF8FF', '#DBEAFE', '#075985', 'b')
ORANGE = ('#EA580C', '#FFF7ED', '#FFEDD5', '#9A3412', 'o')
GREEN = ('#059669', '#ECFDF5', '#D1FAE5', '#065F46', 'g')
INK = '#0f172a'


def clean(t):
    return str(t).replace('—', '-').replace('–', '-')


def esc(t):
    return html_lib.escape(clean(t))


def is_article(u):
    if not u:
        return False
    p = urlparse(str(u).strip())
    if p.scheme not in ('http', 'https') or not p.netloc:
        return False
    return len(p.path.strip('/')) >= 3 or bool(p.query)


def card(headline, context, url, source, pal, wim, cta_txt='Read more'):
    accent, tint, chip, deep, dk = pal
    h, c, s, w = esc(headline), esc(context), esc(source), esc(wim)
    src_chip = (f'<span class="dg-chip" style="display:inline-block;padding:4px 12px;border-radius:999px;'
                f'background:#f1f5f9;color:#64748b;font-size:12px;font-weight:600">{s}</span>')
    if is_article(url):
        tail = (f'<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0 0"><tr>'
                f'<td align="left"><a href="{url}" style="display:inline-block;padding:10px 20px;background:{accent};'
                f'color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600">'
                f'{cta_txt}</a></td><td align="right">{src_chip}</td></tr></table>')
    else:
        tail = f'<p style="margin:16px 0 0 0">{src_chip}</p>'
    return (f'<div class="dg-card" style="margin:0 0 18px 0;background:#ffffff;border-radius:14px;'
            f'border-top:4px solid {accent};box-shadow:0 2px 10px rgba(15,23,42,0.07);padding:20px 22px 18px 22px">'
            f'<p class="dg-h" style="margin:0 0 8px 0;font-size:19px;font-weight:700;color:{INK};'
            f'line-height:1.35">{h}</p>'
            f'<p class="dg-b" style="margin:0;font-size:15px;color:#4b5563;line-height:1.6">{c}</p>'
            f'<div class="dg-wim-{dk}" style="margin:16px 0 0 0;padding:13px 16px;border-left:4px solid {accent};'
            f'background:{tint};border-radius:10px">'
            f'<p style="margin:0;font-size:12px;font-weight:800;color:{accent};letter-spacing:0.06em;'
            f'text-transform:uppercase">Why it matters</p>'
            f'<p class="dg-b" style="margin:7px 0 0 0;font-size:15px;color:#374151;line-height:1.6">{w}</p></div>'
            f'{tail}</div>')


def section(title, anchor, cards_html, source_names, pal):
    accent, tint, chip, deep, dk = pal
    srcs = ' / '.join(sorted(set(source_names)))
    return (f'<div id="{anchor}" style="margin:0 0 30px 0"><a name="{anchor}"></a>'
            f'<p style="margin:0 0 14px 0"><span class="dg-sec-{dk}" style="display:inline-block;padding:7px 16px;'
            f'border-radius:999px;background:{chip};color:{deep};font-size:12px;font-weight:800;'
            f'letter-spacing:0.10em;text-transform:uppercase">{esc(title)}</span></p>{cards_html}'
            f'<p class="dg-m" style="margin:6px 0 0 0;font-size:11px;color:#94a3b8">Sources: {esc(srcs)}</p></div>')


def jump(label, anchor, count, pal):
    accent = pal[0]
    return (f'<a href="#{anchor}" class="dg-jump" style="display:inline-block;margin:0 6px 6px 0;padding:6px 14px;'
            f'border-radius:999px;border:1px solid {accent};color:{accent};text-decoration:none;font-size:12px;'
            f'font-weight:700">{label} {count}</a>')


def validate(d):
    problems = []
    for key in ('date_str', 'short_date', 'top_headline'):
        if not str(d.get(key, '')).strip():
            problems.append(f'"{key}" is missing or empty in {DATA}')
    if len(str(d.get('top_headline', ''))) > 90:
        problems.append(f'"top_headline" is {len(str(d["top_headline"]))} chars, trim to 90 at a word boundary')
    for name in ('sports', 'local', 'general'):
        for i, row in enumerate(d.get(name, []), 1):
            if len(row) != 5:
                problems.append(f'{name}[{i}] has {len(row)} fields, expected 5 '
                                f'(headline, context, url, source, wim)')
                continue
            head, ctx, url, src, wim = [str(x) for x in row]
            if not ctx.strip():
                problems.append(f'{name}[{i}] "{head[:60]}" has an EMPTY context')
            if not wim.strip():
                problems.append(f'{name}[{i}] "{head[:60]}" has an EMPTY Why it matters')
            if name == 'local':
                if ctx.strip() == head.strip():
                    problems.append(f'local[{i}] "{head[:60]}" context just repeats the headline')
                if not is_article(url):
                    problems.append(f'local[{i}] "{head[:60]}" has no real article link')
                es = head + ' ' + ctx
                if src != 'Valencia Secreta' and len(es) >= 120 and not any(
                        ch in es for ch in 'áéíóúüñÁÉÍÓÚÜÑ¿¡'):
                    problems.append(f'local[{i}] "{head[:60]}" Spanish has no accents at all - rewrite properly')
            if 'r.jina.ai' in url:
                problems.append(f'{name}[{i}] "{head[:60]}" links through the r.jina.ai proxy')
    return problems


def render(d):
    sports = [tuple(r) for r in d.get('sports', [])]
    local = [tuple(r) for r in d.get('local', [])]
    general = [tuple(r) for r in d.get('general', [])]
    date_str, short_date = d['date_str'], d['short_date']
    top_headline, today_line = d['top_headline'], d.get('today_line', '')

    all_rows = sports + local + general
    dead = [r[0] for r in all_rows if not is_article(r[2])]
    words = sum(len(re.findall(r"[\w'-]+", f'{r[0]} {r[1]} {r[4]}')) for r in all_rows)
    read_min = max(1, round(words / 220))
    n = len(all_rows)

    sports_html = ''.join(card(h, c, u, s, BLUE, w) for h, c, u, s, w in sports)
    local_html = ''.join(
        card(h, c, u, s, ORANGE, w, 'Read more' if s == 'Valencia Secreta' else 'Leer más')
        for h, c, u, s, w in local)
    general_html = ''.join(card(h, c, u, s, GREEN, w) for h, c, u, s, w in general)
    ss = section('Sports & Industry', 'sports', sports_html, [r[3] for r in sports], BLUE) if sports else ''
    ls = section('Local News - Valencia', 'valencia', local_html, [r[3] for r in local], ORANGE) if local else ''
    gs = section('General & World News', 'world', general_html, [r[3] for r in general], GREEN) if general else ''

    jumps = ''
    if sports:
        jumps += jump('Sports', 'sports', len(sports), BLUE)
    if local:
        jumps += jump('Valencia', 'valencia', len(local), ORANGE)
    if general:
        jumps += jump('World', 'world', len(general), GREEN)
    jumps = f'<p style="margin:0 0 18px 0">{jumps}</p>' if jumps else ''

    rule = ('<table cellpadding="0" cellspacing="0" style="margin:18px 0 0 0"><tr>'
            '<td width="44" height="6" style="background:#0284C7;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>'
            '<td width="8" style="font-size:0;line-height:0">&nbsp;</td>'
            '<td width="26" height="6" style="background:#EA580C;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>'
            '<td width="8" style="font-size:0;line-height:0">&nbsp;</td>'
            '<td width="26" height="6" style="background:#059669;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>'
            '</tr></table>')

    head = (f'<div style="background:{INK};border-radius:18px;padding:24px 28px;margin:0 0 18px 0">'
            f'<p style="margin:0 0 8px 0;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.12em;'
            f'text-transform:uppercase">{esc(date_str)}</p>'
            f'<p style="margin:0;font-size:24px;font-weight:800;color:#f8fafc;line-height:1.25">'
            f'{esc(top_headline)}</p>{rule}</div>')

    meta_pill = ('<span class="dg-chip" style="display:inline-block;padding:4px 12px;border-radius:999px;'
                 f'background:#e2e8f0;color:#475569;font-size:12px;font-weight:700">{n} stories '
                 f'&nbsp;&middot;&nbsp; {read_min} min read</span>')

    lede = (f'<div class="dg-card" style="background:#ffffff;border-radius:14px;padding:18px 22px;margin:0 0 18px 0;'
            f'border-left:5px solid #0284C7;box-shadow:0 2px 10px rgba(15,23,42,0.07)">'
            f'<p class="dg-m" style="margin:0;font-size:15px;color:#64748b;line-height:1.5">Good morning, Liam. '
            f'Here is what moved overnight.</p>'
            f'<p style="margin:10px 0 0 0">{meta_pill}</p></div>')

    tm = (f'<div class="dg-today" style="background:#FFFBEB;border-radius:14px;border-left:5px solid #F59E0B;'
          f'padding:16px 20px;margin:0 0 22px 0"><p style="margin:0"><span class="dg-today-chip" '
          f'style="display:inline-block;padding:4px 12px;border-radius:999px;background:#FDE68A;color:#92400E;'
          f'font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase">Today</span></p>'
          f'<p class="dg-today-b" style="margin:10px 0 0 0;font-size:15px;color:#92400E;line-height:1.55">'
          f'{esc(today_line)}</p></div>') if today_line else ''

    foot_src = ('Newsletters + The Times + Valencia local feeds' if local
                else 'Newsletters + The Times + Valencia local feeds (unavailable today)')
    foot = (f'<div class="dg-card" style="background:#ffffff;border-radius:14px;padding:18px;text-align:center">'
            f'<p class="dg-m" style="margin:0;font-size:11px;color:#94a3b8">Daily Edition &nbsp;|&nbsp; '
            f'{esc(date_str)} &nbsp;|&nbsp; {foot_src}</p>'
            f'<p class="dg-m" style="margin:5px 0 0 0;font-size:11px;color:#cbd5e1">liam@keeps.sport</p></div>')

    dark_css = (
        '@media (prefers-color-scheme: dark){'
        '.dg-page{background:#0b1220 !important;}'
        '.dg-card{background:#162032 !important;box-shadow:0 2px 10px rgba(0,0,0,0.4) !important;}'
        '.dg-h{color:#f1f5f9 !important;}'
        '.dg-b{color:#cbd5e1 !important;}'
        '.dg-m{color:#94a3b8 !important;}'
        '.dg-chip{background:#1e293b !important;color:#cbd5e1 !important;}'
        '.dg-jump{background:#162032 !important;}'
        '.dg-wim-b{background:#0b2436 !important;}'
        '.dg-wim-o{background:#2b1608 !important;}'
        '.dg-wim-g{background:#08281f !important;}'
        '.dg-sec-b{background:#0b3a55 !important;color:#bae6fd !important;}'
        '.dg-sec-o{background:#4a1e08 !important;color:#fed7aa !important;}'
        '.dg-sec-g{background:#04412f !important;color:#a7f3d0 !important;}'
        '.dg-today{background:#2a2008 !important;}'
        '.dg-today-chip{background:#78350f !important;color:#fde68a !important;}'
        '.dg-today-b{color:#fcd34d !important;}'
        '}'
    )

    body = (f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<meta name="color-scheme" content="light dark">'
            f'<meta name="supported-color-schemes" content="light dark">'
            f'<style>:root{{color-scheme:light dark;supported-color-schemes:light dark;}}'
            f'body{{margin:0;padding:0;background:#f1f5f9;'
            f'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}}'
            f'a{{text-decoration:none;}}{dark_css}</style></head>'
            f'<body class="dg-page" style="background:#f1f5f9;'
            f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif">'
            f'<div style="max-width:680px;margin:0 auto;padding:24px 16px">'
            f'{head}{lede}{jumps}{tm}{ss}{ls}{gs}{foot}</div></body></html>')

    subject = f'{short_date} | {clean(top_headline)}'
    counts = (len(sports), len(local), len(general), n, read_min)
    return body, subject, counts, dead


def send(body, subject):
    if not RESEND_KEY:
        print('ERROR: RESEND_KEY is not set in the environment. Nothing sent.')
        print('Run as:  RESEND_KEY=... SLACK_BOT=... python3 newsletter/build_digest.py')
        sys.exit(1)
    key = 'lpcmi-daily-digest-' + datetime.now(timezone.utc).strftime('%F-%H')
    payload = json.dumps({'from': FROM, 'to': [TO], 'subject': subject, 'html': body})
    cmd = ['curl', '-s', '-X', 'POST', 'https://api.resend.com/emails',
           '-H', f'Authorization: Bearer {RESEND_KEY}',
           '-H', 'Content-Type: application/json',
           '-H', f'Idempotency-Key: {key}',
           '-d', payload]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout
    with open(RESP, 'w') as f:
        f.write(out)
    return out


def alert(reason):
    if not SLACK_BOT:
        print('ERROR: SLACK_BOT not set, cannot alert. Reason was: ' + reason)
        return
    body = json.dumps({'channel': SLACK_CHANNEL, 'mrkdwn': True,
                       'text': ':rotating_light: *Daily Edition did not send today.* ' + reason})
    subprocess.run(['curl', '-s', '-X', 'POST', 'https://slack.com/api/chat.postMessage',
                    '-H', f'Authorization: Bearer {SLACK_BOT}',
                    '-H', 'Content-Type: application/json; charset=utf-8',
                    '-d', body], capture_output=True, text=True, timeout=60)


def main():
    dry = '--dry-run' in sys.argv
    if '--alert' in sys.argv:
        i = sys.argv.index('--alert')
        reason = sys.argv[i + 1] if len(sys.argv) > i + 1 else 'no reason given'
        alert(reason)
        print('Slack alert sent: ' + reason)
        return
    if not os.path.exists(DATA):
        print(f'ERROR: {DATA} does not exist. Write your story data there first.')
        sys.exit(1)
    try:
        d = json.load(open(DATA, encoding='utf-8'))
    except Exception as e:
        print(f'ERROR: {DATA} is not valid JSON: {e}')
        sys.exit(1)

    problems = validate(d)
    if problems:
        print('BUILD ABORTED - %d problem(s):' % len(problems))
        for p in problems:
            print('  - ' + p)
        print('\nFix %s and run this script again. Nothing has been sent.' % DATA)
        sys.exit(1)

    body, subject, counts, dead = render(d)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(body)
    s, l, g, n, rm = counts
    print(f'Built: {n} stories ({s} sports, {l} local, {g} general), {rm} min read')
    print(f'Subject: {subject}')
    if dead:
        print('NOTE: no usable article link, rendered without a button: ' + '; '.join(x[:50] for x in dead))
    if not d.get('today_line'):
        print('WARNING: today_line empty, Today card omitted.')
    if dry:
        print('DRY RUN - nothing sent. HTML at ' + OUT)
        return

    out = send(body, subject)
    print('Resend response: ' + out[:300])
    if '"id"' in out or 'invalid_idempotent_request' in out:
        print('SENT OK')
    else:
        alert('Resend returned no id: ' + out[:300])
        print('SEND FAILED - Slack alerted')
        sys.exit(1)


if __name__ == '__main__':
    main()
