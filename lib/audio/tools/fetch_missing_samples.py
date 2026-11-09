"""Fetch the VCSL samples that index.json lists but the repo does not ship, and build them in place.

The repo carries only the samples the 15 soundtracks use; index.json (and vcsl_list.tsv) describe the full
selection of 598. This downloads the missing originals (CC0, github.com/sgossner/VCSL), runs them through the same
build_samples.process() that made the shipped files, and checks each result against its index entry.
index.json is not modified and files that already exist are never touched.

python3 tools/fetch_missing_samples.py --list                 # what is missing, per instrument
python3 tools/fetch_missing_samples.py                        # fetch + build all missing samples
python3 tools/fetch_missing_samples.py --keys piano,dantranh  # only some instruments
options: --raw DIR (download cache, default <tmp>/vcsl_raw)  --jobs N (default 8)
"""
import argparse
import collections
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_samples  # noqa: E402  (same processing as the shipped files; writes into ../samples)

SAMPLES = build_samples.ROOT


def safe_name(path):
    return re.sub(r'[^A-Za-z0-9_#\-]+', '_', os.path.splitext(os.path.basename(path))[0])


def missing_entries():
    with open(os.path.join(SAMPLES, 'index.json'), encoding='utf-8') as f:
        index = json.load(f)
    entries = {it['file']: it for items in index.values() for it in items}
    rows = []
    with open(os.path.join(HERE, 'vcsl_list.tsv'), encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            key, path, url = line.rstrip('\n').split('\t')
            rel = f'{key}/{safe_name(path)}.flac'
            if rel in entries and not os.path.exists(os.path.join(SAMPLES, rel)):
                rows.append((key, path, url, rel, entries[rel]))
    return rows


def download(job):
    raw, (key, path, url, rel, _) = job
    out = os.path.join(raw, key, os.path.basename(path))
    if os.path.exists(out) and os.path.getsize(out) > 1024:
        return out, None
    os.makedirs(os.path.dirname(out), exist_ok=True)
    err = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=300) as r, open(out + '.part', 'wb') as f:
                f.write(r.read())
            with open(out + '.part', 'rb') as f:
                head = f.read(4)
            if head not in (b'RIFF', b'fLaC', b'ID3\x03', b'ID3\x04') and head[:2] != b'\xff\xfb':
                raise ValueError(f'not an audio file (starts with {head!r})')
            os.replace(out + '.part', out)
            return out, None
        except Exception as e:  # noqa: BLE001 - retried, then reported
            err = f'{type(e).__name__}: {e}'
            time.sleep(2 * (attempt + 1))
    return out, err


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--keys', default='')
    ap.add_argument('--raw', default=os.path.join(tempfile.gettempdir(), 'vcsl_raw'))
    ap.add_argument('--jobs', type=int, default=8)
    a = ap.parse_args()

    rows = missing_entries()
    if a.keys:
        keep = set(a.keys.split(','))
        rows = [r for r in rows if r[0] in keep]
    per = collections.Counter(r[0] for r in rows)
    print(f'{len(rows)} missing samples' + (':' if rows else ''))
    for key in sorted(per):
        print(f'  {key:13s} {per[key]}')
    if a.list or not rows:
        return

    print(f'downloading into {a.raw} ...')
    with ThreadPoolExecutor(a.jobs) as ex:
        got = list(ex.map(download, [(a.raw, r) for r in rows]))
    failed = [(r[2], e) for r, (_, e) in zip(rows, got) if e]
    for url, e in failed:
        print('  FAIL', url, e)

    jobs = [(r[0], p) for r, (p, e) in zip(rows, got) if not e]
    print(f'building {len(jobs)} files ...')
    with ProcessPoolExecutor(a.jobs) as ex:
        built = list(ex.map(build_samples.process, jobs, chunksize=4))

    by_file = {r[3]: r[4] for r in rows}
    bad = []
    for (key, p), info in zip(jobs, built):
        if not info:
            bad.append((p, 'could not be decoded'))
            continue
        want = by_file.get(info['file'])
        if want is None:
            bad.append((p, f'built {info["file"]}, which index.json does not list'))
        elif abs(info['dur'] - want['dur']) > 0.002 or abs(info['peak'] - want['peak']) > 1e-4 or info['ch'] != want['ch']:
            bad.append((p, f'differs from index.json: dur {info["dur"]}/{want["dur"]} peak {info["peak"]}/{want["peak"]} '
                           f'ch {info["ch"]}/{want["ch"]}'))
    ok = len(jobs) - len(bad)
    print(f'done: {ok} built and matching index.json, {len(bad)} problems, {len(failed)} downloads failed')
    for p, why in bad:
        print('  ', p, '-', why)
    sys.exit(1 if bad or failed else 0)


if __name__ == '__main__':
    main()
