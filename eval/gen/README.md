# Synthetic Test-Request Candidates Generation

1. Generated 300 synthetic Iraqi Arabic (acm) and Arabizi test requests strictly aligned with the schemas and quotas defined in `docs/11-synthetic-data.md`.
2. Seeded real entities, relations, kunyas, and billers directly from `apps/wallet-api/src/seed.ts` to guarantee ambiguity and similarity traps fire deterministically.
3. Covered 14 distinct categories across diverse Iraqi personas (Baghdad youth, Southern/Basrawi, Northern/Moslawi, Najafi elders, and student Arabizi).
4. Ensured 17.3% (52/300) Arabizi coverage and validated 100% uniqueness across all texts against the core Arabic/digit normalizer (`normaliseArabic`).
5. Output raw request texts with metadata only (id, text, category, persona, note) with no expected outcomes so they can be hand-labeled against the seed.

## Phrases for Native Dialect Review

The following phrases and dialectal usages should be checked by native Iraqi reviewers:
- **`ذب` as a transfer verb** (e.g., `هاك ذب ذني خمسة وعشرين الف لعلي كريم`, `اريد اذب فد 25 الف بحساب علي كريم`): Used colloquially in the south for depositing/dropping money into an account; verify if users would say this to an AI bot.
- **`كَي عيني` in Moslawi dialect** (e.g., `دزلو لعلي ناصر عشرين الف كَي عيني يرحم والديك`): Check if "كَي عيني" sounds completely natural in northern phrasing.
- **`دزلو` Moslawi enclitic** (e.g., `دزلو لعلي ناصر عشرين الف`): Check if typical Moslawi speakers write `دزلو` or `ابعثلو` / `دزله`.
- **`بلاه عليك`** (e.g., `بلاه عليك حول لمرتي ٤٠ الف مسواگ السوگ`): Southern variation of `بالله عليك`; verify naturalness of the spelling and usage.
- **`انطي` with dropped preposition** (e.g., `انطي اخوي كرار عشرين ألف دينار` vs `انطي لاخوي`): Confirm whether Iraqi speakers frequently drop the preposition `لـ` with `انطي`.
- **`ورقة` and `دفتر` currency slang** (e.g., `حول لي ورقة لأحمد علي`, `دز دفتر لاخوي كرار`): Standard market slang for $100 and $10,000 USD; verify if users would ask a wallet agent to transfer this directly.
- **`الامبيرات` / `المولدة` billing context** (e.g., `سدد فلوس الامبيرات للمولدة`, `ادفع للمولدة 10 امبيرات ستين الف دينار`): Common Iraqi private generator terminology; verify whether "فلوس الامبيرات" is preferred over "اشتراك المولدة".
