# -*- coding: utf-8 -*-
import fastapi, re, os

# 从 fastapi 自身取确切类名（避免人工拼写大小写歧义）
name = [n for n in dir(fastapi) if "Route" in n and n.lower().startswith("apiroute")]
name = name[0]
print("correct fastapi name =", repr(name))

files = [
    r"F:\FinOS AI\backend\personal_os\router.py",
    r"F:\FinOS AI\backend\notification\router.py",
]
for p in files:
    if not os.path.exists(p):
        print("MISSING", p); continue
    s = open(p, encoding="utf-8").read()
    s2 = re.sub(r"(?i)APIRouters", name, s)
    if s2 != s:
        open(p, "w", encoding="utf-8").write(s2)
        print("FIXED", p)
    else:
        print("unchanged", p)
