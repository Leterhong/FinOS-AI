# -*- coding: utf-8 -*-
p = r"F:\FinOS AI\src\hooks\use-backend.ts"
s = open(p, encoding="utf-8").read()

# Fix 1: useAvatar 被误插入 'search' -> 'searchavatar'，还原为 'avatar'
assert "searchavatar" in s, "searchavatar not found"
s = s.replace("searchavatar", "avatar")

# Fix 2: useGlobalSearch 缺少 'search' 方法名（用拼接构造，避免歧义）
anchor = "personalOs.<import(\"@/types/personal_os\").GlobalSearchResult>(q)"
repl = "personalOs." + "search" + "<import(\"@/types/personal_os\").GlobalSearchResult>(q)"
assert anchor in s, "global-search anchor not found"
s = s.replace(anchor, repl)

open(p, "w", encoding="utf-8").write(s)
print("OK fixed both")
