#!/usr/bin/env python3
"""Async test transform with transitive closure:
1. Make test callbacks async.
2. Find dispatch-wrapping helpers (Level 0).
3. Transitively find all helpers that call Level-0+ helpers → make them async.
4. Add 'await' before calls to async helpers (with paren-wrapping for chaining).
"""
import re, sys

def get_func_body(src, name):
    """Get the body of `function NAME(...)` using brace matching."""
    m = re.search(rf'function {re.escape(name)}\s*\(', src)
    if not m: return None
    # Find opening {
    brace_start = src.index('{', m.end())
    depth, i = 0, brace_start
    while i < len(src):
        if src[i] == '{': depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0: return src[brace_start:i+1]
        i += 1
    return None

def find_dispatch_helpers(src):
    """Functions whose body contains 'dispatch('."""
    helpers = set()
    for m in re.finditer(r'function (\w+)\s*\(', src):
        name = m.group(1)
        body = get_func_body(src, name)
        if body and 'dispatch(' in body:
            helpers.add(name)
    return helpers

def transitive_closure(src, initial):
    """Find all functions that (transitively) call any function in `initial`."""
    all_funcs = set(re.findall(r'function (\w+)\s*\(', src))
    async_set = set(initial)
    changed = True
    while changed:
        changed = False
        for name in all_funcs - async_set:
            body = get_func_body(src, name)
            if not body: continue
            for async_name in async_set:
                if re.search(rf'\b{re.escape(async_name)}\s*\(', body):
                    async_set.add(name)
                    changed = True
                    break
    return async_set

def add_await_at_callsites(src, names):
    """Add 'await ' before calls to any function in `names`, with chaining fix."""
    for name in sorted(names, key=len, reverse=True):
        pat = re.compile(rf'(?<!function )(?<!async function )(?<!\.)(?<!await ){re.escape(name)}\(')
        result, last = [], 0
        for m in pat.finditer(src):
            result.append(src[last:m.start()])
            depth, j, in_str = 1, m.end(), None
            while j < len(src) and depth > 0:
                c = src[j]
                if in_str:
                    if c == '\\': j += 1
                    elif c == in_str: in_str = None
                elif c in '"\'`': in_str = c
                elif c == '(': depth += 1
                elif c == ')': depth -= 1
                j += 1
            call = src[m.start():j]
            awaited = 'await ' + call
            if j < len(src) and src[j] in '.?':
                result.append('(' + awaited + ')')
            else:
                result.append(awaited)
            last = j
        result.append(src[last:])
        src = ''.join(result)
    return src

def transform(filepath):
    with open(filepath) as f: src = f.read()
    orig = src
    # 1. Make test callbacks async
    src = src.replace(', () =>', ', async () =>')
    # 2. Find dispatch-wrapping helpers
    dispatch_helpers = find_dispatch_helpers(src)
    # 3. Transitive closure: all functions that transitively call dispatch helpers
    if dispatch_helpers:
        async_funcs = transitive_closure(src, dispatch_helpers)
        # 4. Make those functions async
        for name in async_funcs:
            src = src.replace(f'function {name}(', f'async function {name}(')
        # 5. Add await before calls to async functions + chaining fix
        src = add_await_at_callsites(src, async_funcs)
    # 6. ALWAYS add await before .dispatch( calls (covers api/kernel/func().dispatch)
    src = re.sub(r'(?<!await )(\w+(?:\(\))?)\.dispatch\(', r'await \1.dispatch(', src)
    if src != orig:
        with open(filepath, 'w') as f: f.write(src)
        return True
    return False

count = sum(1 for fp in sys.argv[1:] if transform(fp))
print(f'Transformed {count} file(s).')
