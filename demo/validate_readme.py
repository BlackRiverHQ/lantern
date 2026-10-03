#!/usr/bin/env python3
"""Validate the README against the repository: anchors, relative links, named paths, test names.

The house rule is that a README which names a file, a module or a test that is not in the repo is a
small lie, in a project whose whole argument is that its claims are checkable. Run this over every
tracked markdown file before committing, not only the README.
"""
import pathlib
import re
import sys

target = sys.argv[1] if len(sys.argv) > 1 else "README.md"
text = pathlib.Path(target).read_text()

slug = lambda h: re.sub(r"[^\w\s-]", "", h.strip().lower()).replace(" ", "-")
anchors = {slug(m.group(2)) for m in re.finditer(r"^(#{1,6})\s+(.*)$", text, re.M)}
toc = re.findall(r"\]\(#([^)]+)\)", text)
rel = {l.split("#")[0] for l in re.findall(r"\]\(([^)]+)\)", text) if not l.startswith(("http", "#"))}

tops = {d for d in ("abi", "broadcast", "convex-host", "demo", "docs", "script", "scripts",
                    "src", "test", "tests", "site", "app", "frontend") if pathlib.Path(d).exists()}
paths = set(re.findall(r"`([A-Za-z0-9_./-]+\.(?:sol|py|js|jsx|ts|tsx|mjs|json|md|toml|yaml|yml|sh|example|mp4|webp|png))`", text))
paths = {p for p in paths if p.split("/")[0] in tops}

suite = "\n".join(
    p.read_text(errors="ignore")
    for p in pathlib.Path(".").rglob("*")
    if p.is_file() and "node_modules" not in p.parts and ".git" not in p.parts
    and (p.match("*.test.*") or p.match("*.spec.*") or str(p).startswith(("tests/", "test/"))))

names = re.findall(r"`(test[A-Za-z0-9_]+)`", text)
if not names:
    names = [c for c in re.findall(r"`([a-z][^`]{25,90})`", text)
             if re.search(r"^(a|an|the|does|refuses|bills|cannot|accepts|gives|counts)", c)]

print("file:   ", target)
print("anchors", [t for t in toc if t not in anchors] or "ok")
print("links  ", [r for r in rel if r and not pathlib.Path(r).exists()] or "ok")
print("paths  ", [p for p in paths if "*" not in p and not pathlib.Path(p).exists()] or "ok")
print("tests  ", [n for n in names if n not in suite] or "ok")
counts = sorted({int(c) for c in re.findall(r"(\d+)\s+(?:tests|passed)", text)})
print("counts ", counts, "<- must match the suite's real total, badge URL included")
print("prose em dashes:", text.count("\u2014"), "in", len(text.splitlines()), "lines")
