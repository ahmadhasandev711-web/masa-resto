# خطة إصلاح resto — النسخة المعتمدة للتنفيذ

> **المرجع:** تقرير المراجعة `resto-code-review-2026-10-30.md` (أكواد البنود C/H/M/L هنا هي نفس أكواد التقرير).
> **الأدوار:** Product Manager = صاحب القرار · Senior Reviewer = Claude (يراجع كل مرحلة) · Implementer = Gemini.
> **الهدف التجاري:** نسخة Showcase على دومين عام (Storefront + Booking + POS/KDS/ERP) آمنة ومتماسكة مالياً.

---

## 0) قواعد ملزمة للمنفّذ (اقرأها قبل أي سطر)

1. **مرحلة واحدة في المرة.** ممنوع تبدأ مرحلة قبل ما المرحلة اللي قبلها تتراجع وتتقفل بموافقة صريحة.
2. **Branch + PR لكل مرحلة:** `fix/phase-a-…`. **commit لكل بند** ورسالته تبدأ بكود البند: `fix(C2): upsert product sizes by id`.
3. **ممنوع توسيع النطاق.** أي حاجة مش مكتوبة هنا (refactor، تحسين شكل، إعادة تسمية) → تتكتب في قسم "ملاحظات خارج النطاق" في التقرير ولا تتنفذ.
4. **كل إصلاح لـ bug لازم يكون معاه test** يفشل على الكود القديم وينجح بعد الإصلاح (اكتب التست الأول). البند من غير test = البند مش متسلّم.
5. **تعديل الـ schema = migration فقط** (`prisma migrate dev --name …`). ممنوع `db push` بعد المرحلة A. ممنوع أي migration تمسح بيانات أو أعمدة فيها بيانات.
6. **ممنوع تغيير سلوك مالي غير المطلوب.** أي حساب فلوس (إجمالي/ضريبة/خصم/expected cash) يتغير → لازم test بأرقام صريحة.
7. **ممنوع تلمس:** `GEMINI.md`، ملفات الـ zip، `.env` الحقيقي (تقدر تعدّل `.env.example`).
8. **لو حاجة مش واضحة أو محتاجة قرار منتج → وقّف واسأل.** القرارات المعروفة في القسم 1؛ متخمنش غيرها.
9. **مسار البيع المباشر في POS (`CreatePosOrderUseCase` + `prisma-pos-transaction.ts`) هو المرجع الجيد في المشروع.** لما تصلح مسارات تانية (الطاولات، الإلغاء، التسوية) قلّد نمطه: transaction + `FOR UPDATE` على الصف الأساسي + conditional update + re-check جوه الـ tx.

### صيغة تقرير التسليم في آخر كل مرحلة (إلزامي)
```
## Phase X — Delivery Report
| البند | الحالة | الملفات | الـ Tests | دليل (output) |
|---|---|---|---|---|
| C2 | ✅ | save-product.use-case.ts … | tests/…/catalog-sizes-stable.test.ts | (لصق output) |
- tsc: (output)
- eslint: (عدد errors/warnings)
- vitest: (ملخص — لازم 0 failed)
- Migrations: (أسماءها + هل فيها data backfill)
- ملاحظات خارج النطاق: …
- حاجات ما قدرتش أعملها ولماذا: …
```

---

## 1) قرارات المنتج (PM) — مطلوبة قبل المراحل المشار إليها

| # | القرار | الافتراضي المقترح | يلزم قبل |
|---|---|---|---|
| D1 | الأسعار في المنيو **شاملة** الضريبة ولا **غير شاملة**؟ | setting قابل للتغيير، الافتراضي **غير شاملة** | المرحلة C (H2) |
| D2 | فيه **خدمة (service charge)** للصالة؟ | setting: نسبة (افتراضي 0%)، تطبق على DINE_IN فقط | المرحلة C |
| D3 | مين يقدر يلغي بيع POS مدفوع؟ | `VOID_PAID_ORDER` permission جديدة — للمدير فقط، مع سبب إجباري | المرحلة C (H8) |
| D4 | سقف الخصم للكاشير؟ | setting: نسبة قصوى (افتراضي 20%)، فوقها يحتاج permission مدير | المرحلة C |
| D5 | بيع offline اتغير سعره قبل المزامنة؟ | يتسجل بسعر وقت البيع **لو** نسخة الكتالوج كانت سارية وقتها، وإلا يروح review queue للمدير | المرحلة C (C4) |
| D6 | حسابات الديمو العام | حساب لكل دور (مدير/كاشير/مطبخ/محاسب)، ممنوع تعديل الموظفين والإعدادات والفروع ورفع الصور، تصفير كل 6 ساعات | المرحلة D |

> المنفّذ يستخدم الافتراضي المقترح **فقط** لو الـ PM كتب "موافق على الافتراضي".

---

## المرحلة A — الأساس والطوارئ
**الهدف:** نقدر نختبر بجد، ونقفل أخطر 3 ثغرات، ونوقف تلف البيانات.
**البنود:** Test infra · C1 · H4 · H5 · H6 · C2 · C3 · L1

### A0. بنية التستات (أول حاجة)
- شيل `tests/` و`vitest.config.ts` من `.gitignore` وضيفهم للـ repo.
- `docker-compose.test.yml` بـ MySQL 8 + سكربت `npm run test:db` (يعمل migrate + seed على DB اختبار منفصلة `resto_test`).
- حوّل المشروع من `db push` لـ `prisma migrate`: baseline migration من الـ schema الحالي (`prisma migrate diff --from-empty …` + `migrate resolve --applied`). **ممنوع** تعيد إنشاء DB موجودة.
- وحّد على npm: امسح `pnpm-lock.yaml`.
- **Acceptance:** `npm run test:db` يشغّل الـ 258 test وكلهم ينجحوا أو يتعمل skip مبرّر مكتوب. صفر failed.

### A1. C1 — الأسرار والبيئة
- `env.ts`: في `production` ارفض التشغيل لو `JWT_SECRET` < 32 حرف **أو** فيه كلمات (`replace`, `secret`, `super`, `change`, `example`, `password`). **ممنوع أي قيمة default**.
- `scripts/create-update-zip.ps1` (وأي سكربت تغليف): امسح `.next/standalone/.env*` قبل الضغط، وفشّل السكربت لو لقى `.env` جوه الحزمة.
- `README`/`UPGRADE_GUIDE_AR.txt`: سطر صريح إن الـ env يتحط على السيرفر بس.
- **Acceptance:** test لـ `parseEnv` يرفض القيم الضعيفة في production. تشغيل سكربت التغليف يطلع zip مافيهوش `.env`.

### A2. H4 — إخفاء الأخطاء الخام
- `action-result.ts`: `DomainError` و`ZodError` بس رسالتهم توصل للعميل. أي `Error` تاني → رسالة عامة + `code: 'INTERNAL_ERROR'` + `AppLogger.error` (مش `console.error`).
- خلي الـ `P2002` بتاع `posIdempotencyKey`/`onlineIdempotencyKey` يترجم لـ replay (رجّع الإيصال الموجود) مش خطأ.
- **Acceptance:** test: Prisma error → العميل ياخد الرسالة العامة. test: P2002 على idempotency key → نفس الإيصال يرجع.

### A3. H5 — الـ Rate limiting
- `client-ip.ts`: لو `TRUSTED_PROXY_HOPS=0` استخدم عنوان الـ socket الفعلي (من headers الخاصة بالـ server أو `x-real-ip` لو موثوق) — **مش** `'unknown'`. لو مش متاح، اعمل log warning مرة واحدة.
- وثّق في `.env.example`: الإعداد الصحيح لكل سيناريو (Nginx/Cloudflare/مكشوف).
- **Acceptance:** tests لـ `pickClientIp` بالسيناريوهات الثلاثة. عميلين مختلفين ما يشتركوش في نفس الـ bucket.
- *(الـ limiter يفضل in-memory في المرحلة دي — instance واحدة. اكتب TODO للـ Redis.)*

### A4. H6 — الـ actions العامة
- `matchOrCreateCustomerAction`: **امسحه كـ server action** (خليه use-case داخلي بس). تأكد مفيش client بيستدعيه.
- `MatchOrCreateCustomerUseCase` لما يتنادى من مسار عام (online order / booking): **ممنوع يعدّل اسم أو إيميل عميل موجود**. يضيف عنوان جديد بس.
- `placeOnlineOrderSchema`: `quantity` ≤ 50، `items` ≤ 50، أطوال النصوص (name 100، notes 500، address fields 200)، `branchId` لازم يكون فرع active (اتحقق في الـ use-case).
- `createEventBookingAction`: rate limit (5/10 دقايق لكل IP)، `eventDate` تاريخ صالح ومستقبلي (≤ سنة)، `branchId` فرع active.
- **Acceptance:** tests لكل validation. test: طلب أونلاين باسم مختلف لرقم موجود ما يغيرش اسم العميل.

### A5. C2 — ثبات IDs المقاسات والإضافات
- `save-product.use-case.ts` و`save-modifier-group.use-case.ts`: الـ DTO يقبل `id` اختياري لكل size/modifier. الموجود → `update`، الجديد → `create`، اللي اتشال من الفورم → `isActive=false` (**مش delete**).
- عدّل `menu-product-modal.tsx` وواجهة الـ modifier group يبعتوا الـ `id`.
- `modifierGroupSchema`: refine إن `minSelect ≤ maxSelect`.
- **سكربت فحص** `scripts/audit-recipes.ts` (read-only): يطبع الأصناف اللي ليها recipes على مستوى المنتج بس ومفيش recipes لمقاساتها، والأصناف اللي مالهاش recipes خالص. **ميعدّلش حاجة.**
- **Acceptance:** test: تعديل اسم صنف → نفس الـ sizeIds، والـ RecipeItems بتاعة المقاسات موجودة. test: شيل مقاس → يبقى `isActive=false` وطلب قديم عليه لسه سليم.

### A6. C3 — المطبخ والطاولات
- `bump-kitchen-order.use-case.ts`: لو `order.isTabOpen` → علّم الأصناف `isPrepared=true` بس، **من غير** تغيير `status` أو `paymentStatus`. لو مش تاب: الحالي، بس **ممنوع** يعلّم `PAID` (التحصيل مكانه الكاشير/التسوية).
- `get-kitchen-orders.use-case.ts`: اعرض الطلبات اللي `status=PREPARING` **أو** (`isTabOpen=true` وفيها أصناف `isPrepared=false`).
- `add-items-to-tab.use-case.ts`: لو الطلب مش `PREPARING` رجّعه `PREPARING` و`kitchenCompletedAt=null`.
- **Acceptance:** test سيناريو كامل: فتح تاب → bump → إضافة صنف → الصنف يظهر في KDS → تحصيل → `PAID` بس بعد التحصيل.

### A7. L1 — تسريب صحة الباسورد
- `authenticate-staff.use-case.ts`: لو الباسورد صح بس المستخدم مالوش فرع → نفس رسالة الخطأ العامة.

**🛑 بوابة A:** تقرير التسليم → مراجعة Senior → موافقة PM.

---

## المرحلة B — عزل الفروع والصلاحيات
**البنود:** C5 · M1 · M2 · M3 · M5 · bookings scope (L2)

### B1. قاعدة موحّدة للـ scope (M1/M2)
- في `BranchContextService` ضيف:
  - `resolveScope(session) → { allowedBranchIds: string[] | 'ALL' }` — `'ALL'` للـ SuperAdmin **فقط**.
  - `assertOrderInScope(session, orderId)`, `assertTableInScope`, `assertShiftOwnedBy(session, shiftId, branchId)`.
- **قرار ثابت:** `MANAGE_BRANCHES` = إدارة بيانات الفروع، **مش** صلاحية رؤية كل الفروع. شيل كل `canManageAll = … MANAGE_BRANCHES` واستخدم `resolveScope`.
- استبدل كل `assignedBranchIds[0]` و`userBranchId ? … : undefined` في: `orders/page.tsx`, `invoices/page.tsx`, `kitchen/page.tsx`, والـ clients بتوعهم، و`order.actions.ts`, `report.actions.ts`, `finance.actions.ts`, `inventory.actions.ts`. المستخدم متعدد الفروع يختار من فروعه؛ المستخدم بلا فروع → **ممنوع** (redirect/Forbidden) مش "كل الفروع".
- **Acceptance:** test: مستخدم فرعه اتقفل → صفحة الطلبات ما تعرضش أي طلب. test: مستخدم على فرعين يشوف الاتنين ومايشوفش التالت.

### B2. C5 — الطاولات والوردية
- كل actions في `table.actions.ts` تتحقق إن الطاولة/الطلب/القسم في scope المستخدم.
- `open-table-tab` و`close-table-tab`: الوردية لازم `cashierId = session.userId` و`branchId = table.branchId` و`status=OPEN` — جوه الـ transaction مع `FOR UPDATE` على الوردية (زي `lockShift`).
- `updateTable`: **امنع** تغيير `status` من الـ admin لو `activeOrderId` موجود. الحالات تتغير من مسارات التشغيل بس (استخدم `TableStateMachine` الموجود فعلاً).
- **Acceptance:** tests: كاشير فرع A على طاولة فرع B → Forbidden. تحصيل على وردية كاشير تاني → Forbidden. تغيير طاولة مشغولة لـ AVAILABLE → مرفوض.

### B3. M3 — منع تصعيد الصلاحيات
- create/update/reset/toggle staff: لو الهدف أو الـ role الجديد `SUPER_ADMIN` → لازم المنفّذ SuperAdmin.
- ممنوع تعطيل أو تخفيض **آخر** SuperAdmin فعّال.
- المستخدم غير الـ SuperAdmin يعيّن موظفين على فروعه هو بس.
- **إلغاء الجلسات:** أضف `User.sessionVersion Int @default(0)`، يتحط في الـ JWT، ويتشيك في `SessionService.getCurrent`. يزيد عند reset password / تغيير role / تعطيل.
- **Acceptance:** tests لكل قاعدة. test: بعد reset الباسورد التوكن القديم يرجع null.

### B4. M5 — فصل المهام
- `auditShift`: ممنوع `approverId === shift.cashierId`. ممنوع اعتماد وردية `AUDITED` تاني.
- `createExpense` بـ `cashShiftId` صريح: لازم الوردية بتاعة `spentById` أو المنفّذ معاه `MANAGE_FINANCE` ويتسجل `approvedById`.
- **Acceptance:** tests.

### B5. Bookings
- `updateBookingStatusAction`: scope الفرع + state machine (`PENDING→CONFIRMED→COMPLETED`, `PENDING/CONFIRMED→CANCELLED`).

**🛑 بوابة B.**

---

## المرحلة C — النزاهة المالية
> تحتاج قرارات D1–D5 قبل البدء.
**البنود:** H3 · H1 · H8 · H9 · C4 · H2 · H7 · M9(أداء الورديات) · POS deletedAt

### C1. H3 — أرقام المستندات
- جدول `DocumentSequence { key String @id, value Int }`. الزيادة: `UPDATE … SET value = LAST_INSERT_ID(value + 1) WHERE key = ?` ثم `SELECT LAST_INSERT_ID()` جوه نفس الـ tx.
- مفاتيح: `ORDER` (POS/Dine-in)، `WEB-YYYYMMDD` (يومي بتوقيت **Africa/Cairo**)، `PO`، `STL`، `RET`.
- **Migration backfill:** `ORDER` يبدأ من أكبر رقم رقمي موجود حالياً؛ اليومي من عدد طلبات اليوم.
- امسح الـ fallback في `order-number.service.ts` (اللي بيرجع `count+1001`) — الخطأ يطلع.
- **Acceptance:** test تزامن: 20 طلب متوازي → 20 رقم مختلف متتالي. test: الطلب الساعة 1 الفجر بتوقيت القاهرة ياخد تاريخ نفس اليوم المحلي.

### C2. H1 — تسوية الطيار
- الـ CASH_IN يروح لوردية **المستلم** (`cashierId = session.userId`) المفتوحة في نفس الفرع. لو مالوش وردية مفتوحة → ارفض برسالة واضحة (مش تسوية من غير CASH_IN).
- كل حاجة جوه tx: `FOR UPDATE` على الطيار، اقرا الطلبات جوه الـ tx، `updateMany` بشرط `driverSettlementId: null`، ولو العدد اختلف عن المتوقع → rollback.
- **Acceptance:** test: تسويتين متوازيتين → واحدة تنجح والتانية ترفض، CASH_IN واحد بس. test: الكاش في وردية المستلم.

### C3. H8 — الإلغاء والاسترجاع
- `update-order-status.use-case.ts`: كل الخطوات في tx واحدة + `updateMany where { id, status: currentStatus }` (لو count=0 → "تم تعديل الطلب من مكان آخر").
- إلغاء طلب `PAID` يحتاج `VOID_PAID_ORDER` (D3) + سبب.
- المرتجع النقدي لطلب POS: `CashShiftMovement` نوع جديد `CASH_REFUND` على وردية المنفّذ المفتوحة، ويدخل في حساب expected cash في **الاتنين**: `prisma-pos.repository.closeShift` و`prisma-finance.repository.blindCloseShift`.
- **المخزون:** إلغاء قبل `PREPARING` → مفيش حركة. بعد التحضير → يفضل reclassify كـ WASTE (الحالي). **ممنوع** ترجيع الكمية للمخزن.
- طلبات الأونلاين TAKEAWAY/COD لما تكتمل في الفرع: التحصيل يتسجل `OrderPayment` + `cashShiftId` = وردية الكاشير اللي سلّم (زرار "تحصيل وتسليم" مش تلقائي).
- **دمج حساب expected cash:** دالة واحدة في `CashShiftCalculatorService` يستخدمها المسارين (دلوقتي فيه نسختين).
- **Acceptance:** test: إلغاء متوازي → ReturnInvoice واحدة. test: refund يقلل expected cash. test: كاشير من غير الصلاحية → Forbidden.

### C4. H9 — الطاولات atomic
- `add-items-to-tab`: `FOR UPDATE` على الطلب جوه الـ tx، اقرا الأصناف الحالية جوه الـ tx، احسب الإجمالي، وطبق نفس validations الـ POS (min/max إضافات، `isActive`، توفر الفرع، `deletedAt`). استخدم `PosSaleService.resolveLine` بدل الكود المكرر في `open-table-tab` و`add-items-to-tab`.
- `transfer-table`: lock على الطاولتين بترتيب ثابت (by id) لتجنب deadlock.
- **Acceptance:** test: إضافتين متوازيتين → الإجمالي = مجموع كل الأصناف.

### C5. C4 — الـ Offline
- **بوابة قفل الوردية:** `shift-panel.tsx` يمنع الإغلاق لو `pendingCount > 0`. **وكمان على السيرفر:** `closeShift` يقبل `clientPendingCount` ويرفض لو > 0 (حماية مزدوجة).
- **Sync mutex:** `useRef` lock + `BroadcastChannel`/`navigator.locks` عشان التابات المتعددة.
- امسح منطق `result.error?.includes('مكرر')`. الـ replay بيرجع `success` أصلاً. أي فشل validation → `FAILED` ويفضل في الـ queue ويظهر للمدير.
- **Catalog version (D5):** `RestaurantSetting.catalogVersion` يزيد مع أي تعديل سعر/صنف، ويتسجل في جدول `CatalogPriceSnapshot` (version, productSizeId/modifierId, price, validFrom, validTo). البيع offline يبعت `catalogVersion` + `soldAt`. السيرفر يسعّر على الـ snapshot الساري وقتها (لو `soldAt` منطقي ≤ 24 ساعة)، وإلا → `OfflineSaleReview` للمدير. **ممنوع قبول السعر من العميل.**
- مبيعات offline على وردية اتقفلت (لو حصلت رغم البوابة) → `OfflineSaleReview` مش رفض صامت.
- `use-pos-workspace.ts:228`: `cashierId` الصح.
- رقم الإيصال offline: `OFF-{branchCode}-{deviceShortId}-{localSeq}` + بعد المزامنة يتخزن الربط بالرقم الحقيقي ويظهر في سجل الفواتير.
- SW: كاش لـ `/pos` بعد الـ login (network-first + update)، واستخدم `getCachedCatalog` لو السيرفر مش متاح عند التحميل. **ممنوع** كاش لأي صفحة admin تانية.
- **Acceptance:** tests للـ queue logic (unit). سيناريو يدوي موثق بـ screenshots: offline → بيع → تعديل سعر من الأدمن → online → البيع يتسجل بسعر وقته.

### C6. H2 — الضريبة والخدمة (بعد D1/D2)
- `RestaurantSetting`: `pricesIncludeTax Boolean`, `serviceChargePercent Decimal(5,2)`.
- الترتيب: `subtotal → − discount → + service (DINE_IN) → tax على (subtotal − discount + service) → + delivery`. لو الأسعار شاملة: الضريبة تُستخرج من السعر (`gross × rate / (100 + rate)`).
- أضف `serviceMinor` على `Order`. الطلبات القديمة ما تتغيرش.
- **مكان واحد للحساب:** `OrderPricingService` — ويستخدمه POS والطاولات والأونلاين والـ offline (client).
- **Acceptance:** جدول tests بأرقام صريحة (على الأقل 8 حالات: شامل/غير شامل × خصم/بدون × خدمة/بدون) + test rounding.

### C7. H7 — التقارير
- `netSales = subtotal − discount` (بدون ضريبة وخدمة وتوصيل). اعرض الضريبة والخدمة والتوصيل كسطور منفصلة.
- كل التجميع اليومي/بالساعة بتوقيت `Africa/Cairo` (استخدم `domain/shared/utils/date-range.ts` الموجود). لو MySQL: `CONVERT_TZ` أو التجميع في الكود بعد التحويل.
- حد أقصى لمدى التقرير 366 يوم + استخدم `groupBy`/aggregate بدل تحميل كل الصفوف.
- `listShifts`/`getShiftDetails`: aggregates بدل تحميل كل الطلبات، واستبعد الطلبات الملغية من إجمالي المبيعات.
- **Acceptance:** test: طلب 01:30 القاهرة يظهر في يومه المحلي. test: netSales لا يشمل الضريبة.

### C8. POS catalog
- `prisma-pos-transaction.getProducts`: `deletedAt: null` للصنف والتصنيف. `setCatalogStatus` يرفض تفعيل عنصر `deletedAt != null`.

**🛑 بوابة C** (أهم بوابة — مراجعة مفصلة للأرقام).

---

## المرحلة D — جاهزية الـ Showcase
> تحتاج D6.
- **White-label:** grep على `قهوة كايرو`, `Qahwet`, `qahwet-cairo`, `ماسا`, `MASA` في `src/`, `public/`, `manifest.ts`, `sw.js`, الـ metadata → كلها من `RestaurantSetting` أو env. اسم الكاش في SW يتولد من الإصدار.
- **Seed الديمو:** `prisma/seed-demo.ts` — فرعين، منيو كامل بصور من `public/storefront/images` (موجودة)، 3 أقسام صالة، وصفات BOM لكل صنف، مخزون، موردين، 30 يوم طلبات تاريخية **متسقة** (كل طلب له payments ووردية وحركات مخزون مطابقة) عشان التقارير تبقى منطقية.
- **حسابات الديمو (D6):** role `DEMO_*` لكل دور + middleware/guard: لو `DEMO_MODE=true` امنع actions: staff, settings, branches create/toggle, upload image, delete. اعرض banner "نسخة تجريبية — تتصفر كل 6 ساعات" + بيانات الدخول في صفحة login.
- **التصفير:** `npm run db:demo-reset` (truncate + seed) + توثيق cron على السيرفر. **محمي:** يرفض يشتغل لو `DEMO_MODE !== 'true'`.
- **M12:** `next.config.ts` → `remotePatterns` للدومينات المستخدمة فعلاً بس. CSP: `script-src 'self'` (+ `'unsafe-inline'` لو Next محتاجها مؤقتاً، موثّق).
- **Acceptance:** `db:demo-reset` على DB فاضية ينجح في < 60 ثانية. لا يوجد اسم العميل القديم في الـ build output (`grep -r` على `.next`). محاولة حذف من حساب ديمو → مرفوضة.

**🛑 بوابة D.**

---

## المرحلة E — Audit والمخزون والتنظيف
- **M4 Audit trail:** جدول `AuditLog { id, actorId, action, entity, entityId, before Json?, after Json?, branchId?, createdAt }`. يتكتب في: الإلغاء/الاسترجاع، الخصومات، تعديل الأسعار، تعديل الموظفين والصلاحيات، اعتماد الورديات، تسويات الطيارين، تعديلات المخزون. واملى `createdById/updatedById/deletedById` من الـ session.
- **M6:** `InventoryMovement` و`ReturnInvoice` و`CashShiftMovement` → `onDelete: Restrict`.
- **M7:** الحالات النصية → Prisma enums (migration بتحويل آمن + test إن القيم الحالية كلها valid قبل التحويل).
- **M10:** دالة خصم مخزون واحدة يستخدمها POS والتاب والأونلاين.
- **M11:** قرار تصميم مكتوب لوصفات الإضافات (مشتركة على مستوى الإضافة = الوضع الحالي، بس `saveProductRecipes` ما يمسحش وصفات الإضافات — تتعدل من شاشة الإضافة نفسها).
- **M8:** `trackingToken` (random 16 bytes base64url) على `Order`، لينك التتبع بيه، رقم الطلب يفضل زي ما هو. اخفي رقم الطيار (اعرض رقم الفرع بداله).
- **M14:** الـ dispatch من `READY_FOR_PICKUP` بس.
- **Low:** نقل `@types/*`, `typescript`, `prisma`, `vitest`, `tsx` لـ devDependencies · `finance-client.tsx` يستخدم `Money.fromDecimal` · امسح hack الـ invalidation في `prisma.ts` · صفر eslint errors.
- **CI:** GitHub Actions: tsc + eslint + `test:db` (MySQL service) على كل PR.

**🛑 بوابة E → Release candidate.**

---

## 2) اللي **مش** في الخطة دي (عمداً)
- Multi-tenant حقيقي (أكتر من مطعم على نفس الـ DB) — قرار منتج منفصل بعد الـ Showcase.
- Redis للـ rate limit / تشغيل أكتر من instance.
- ربط الفاتورة الإلكترونية (ETA e-Receipt) — بس C6 بيجهّز الحسابات ليه.
- أي redesign للـ UI.