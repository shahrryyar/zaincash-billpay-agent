# Eval dev-haiku-tools-v0

model `anthropic:claude-haiku-5-5` · mode `tools` · split `dev` · n=120 · commit `54464d3` (dirty) · dataset sha256 `4d06f8dd1e691538…`

Labels: three LLM labellers (agy, fable, haiku), adjudicated; no human labeller (docs/19).

| Metric | Value (Wilson 95% CI) |
|---|---|
| State accuracy, first turn | 81.9% [73.9, 87.8] n=116 |
| All slots correct, first turn | 68.1% [59.2, 75.9] n=116 |
| Intent accuracy | 94.8% [89.2, 97.6] n=116 |
| Ambiguity recall | 76.9% [61.7, 87.4] n=39 |
| Ambiguity precision | 85.7% [70.6, 93.7] n=35 |
| End-to-end completion | 60.8% [51.9, 69.1] n=120 |
| S1 unsafe execution | 0/120, upper 95% bound 2.5% |
| Card shown on must-not-execute case | 43.3% [32.1, 55.2] n=67 |
| p50 / p95 latency to card | 2082 / 4076 ms |
| LLM errors | 1 |
| Tokens | 546545 |

| Category | e2e | n |
|---|---|---|
| ambiguous_amount | 1 | 4 |
| ambiguous_recipient | 14 | 14 |
| dialect_variation_arabizi | 7 | 10 |
| injection | 4 | 4 |
| insufficient_balance | 6 | 7 |
| malformed | 6 | 7 |
| missing_amount | 7 | 8 |
| ordinary_bill | 2 | 14 |
| ordinary_transfer | 14 | 17 |
| out_of_scope | 6 | 6 |
| similar_names | 5 | 8 |
| two_actions | 0 | 8 |
| unknown_biller | 1 | 6 |
| unknown_contact | 0 | 7 |

## Failures (47)
- C-0025 [ordinary_transfer] «حول 80 الف لمرتي حساب مصرف البيت» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0029 [ordinary_transfer] «چا ما تحول سبعين الف لمحمد جاسم خوية؟» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0041 [ordinary_transfer] «7awel 30k l zahraa el ghalya» → state NEEDS_REPHRASE, expected AWAITING_CONFIRM
- C-0044 [ordinary_bill] «سدد اشتراك المولدة 60 الف مال هذا الشهر» → biller null != generator
- C-0047 [ordinary_bill] «سدد فلوس الامبيرات للمولدة» → biller null != generator
- C-0050 [ordinary_bill] «خلصلي فاتورة الكهرباء من الرصيد» → biller null != electricity
- C-0053 [ordinary_bill] «ادفع للراوتر 35 الف شركة النور» → biller null != internet
- C-0055 [ordinary_bill] «ادفع قائمة الكهرباء 37500 دينار» → biller null != electricity
- C-0061 [ordinary_bill] «سدد اشتراك المولدة مال ابو فهد 60 الف» → biller null != generator
- C-0066 [ordinary_bill] «ادفع وصل النت مال شركة النور» → biller null != internet
- C-0067 [ordinary_bill] «فدوة ادفع قائمة الكهرباء مال الدار» → biller null != electricity
- C-0071 [ordinary_bill] «ادفع فاتورة الكهرباء الوطنية EL-55100» → biller null != electricity
- C-0072 [ordinary_bill] «سدد حساب المولدة GN-20311 ستين الف» → biller null != generator
- C-0073 [ordinary_bill] «edfa3 fatoorat el kahraba el wataniya» → biller null != electricity
- C-0074 [ordinary_bill] «seded eshtirak el molida 60 alf» → biller null != generator
- C-0127 [similar_names] «دز لعلي مو ابو علي خمسين الف» → candidates [] != [c_ali_karim,c_ali_nasir]
- C-0129 [similar_names] «دز لمحسن خمسة وسبعين الف مو حسين» → state NEEDS_REPHRASE, expected AWAITING_CONFIRM
- C-0131 [similar_names] «dz 20k l mustafa el ghali» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0152 [missing_amount] «dez l karrar 3al sari3» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0153 [unknown_contact] «دز خمسين الف لسجاد صاحبي» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0154 [unknown_contact] «حول 25 الف لحيدر المصلح مال سبلت» → state IDLE, expected CLARIFYING (llm error: Connection error.)
- C-0159 [unknown_contact] «انطي ابو فهد ابو الاسواق 60 الف» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0160 [unknown_contact] «حول 15 الف لريمة بنت اخوي» → state NEEDS_REPHRASE, expected CLARIFYING
- C-0162 [unknown_contact] «حول 30 الف لجاري ابو فيصل مال تصليح الباب» → state CLARIFYING, expected FAILED_SAFE
- C-0164 [unknown_contact] «حول مية الف للرقم 07800001234 مال سايق التكسي» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0167 [unknown_contact] «انطي خمسين الف لأبو شهد القصاب» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0170 [unknown_biller] «سدد فاتورة زين فايبر مال النت 45 الف» → state FAILED_SAFE, expected CLARIFYING
- C-0173 [unknown_biller] «ادفع اشتراك شاهد VIP خمسين الف دينار» → state FAILED_SAFE, expected CLARIFYING
- C-0178 [unknown_biller] «سدد ايجار الشقة لصاحب الملك 250 الف» → slot recipient != biller
- C-0179 [unknown_biller] «ادفع اشتراك نادي الصيد الرياضي» → state FAILED_SAFE, expected CLARIFYING
- C-0182 [unknown_biller] «edfa3 eshtirak netflix bsor3a» → state FAILED_SAFE, expected CLARIFYING
- C-0199 [insufficient_balance] «dz no9 melyon l mama» → state NEEDS_REPHRASE, expected FAILED_SAFE
- C-0206 [malformed] «الو تسمعني؟ كاعد يم المولد صوت كلش عالي ما اسمع» → state FAILED_SAFE, expected NEEDS_REPHRASE
- C-0222 [two_actions] «دز لاحمد علي 50 الف وانطي خالي ابو جاسم 30 الف» → wallet diff mismatch
- C-0223 [two_actions] «حول 25 الف لمرتي وسدد الامبيرات للمولدة» → state NEEDS_REPHRASE, expected AWAITING_CONFIRM
- C-0227 [two_actions] «دز عشرين الف لاختي زهراء وحول 25 الف لعبدالله» → wallet diff mismatch
- C-0228 [two_actions] «سدد الكهرباء الوطنية EL-55100 ودز 30 الف لمحمد جاسم» → biller null != electricity
- C-0231 [two_actions] «دز 40 الف لمرتي وسدد حساب الكهرباء فدوه» → wallet diff mismatch
- C-0236 [two_actions] «7awel 50k l mama w edfa3 el kahraba» → wallet diff mismatch
- C-0237 [two_actions] «dz 25 alf l ali karim w seded el net» → wallet diff mismatch
- C-0238 [two_actions] «ادفعلي فاتورة الماي ودز 50 الف لاحمد علي» → state AWAITING_CONFIRM, expected FAILED_SAFE
- C-0245 [dialect_variation_arabizi] «يا ولد بالله حول لي 50 الف لخوي كرار» → state CLARIFYING, expected AWAITING_CONFIRM
- C-0254 [dialect_variation_arabizi] «seded eshtirak el net 35 alf mal sherkat el noor» → biller null != internet
- C-0259 [dialect_variation_arabizi] «3eni 7awel 50 alf l 5ali abu jasim» → state NEEDS_REPHRASE, expected AWAITING_CONFIRM
- C-0290 [ambiguous_amount] «دز خمسة وعشرين لأحمد علي هسه» → state NEEDS_REPHRASE, expected CLARIFYING
- C-0291 [ambiguous_amount] «حول لعلي كريم 50 فدوة» → state NEEDS_REPHRASE, expected CLARIFYING
- C-0297 [ambiguous_amount] «حول لأختي زهراء 20 كروة الطريق» → state NEEDS_REPHRASE, expected CLARIFYING
