# مراجعة كود resto (منصة ماسا / قهوة كايرو) — 30 أكتوبر 2026

**النطاق:** commit `c9af983`. قريت سطر سطر طبقة السيرفر كلها: الـ server actions، والـ use-cases، والـ repositories، والـ domain services، والـ auth/RBAC، وschema الـ Prisma، والـ offline queue، والـ service worker. ده تقريباً 14 ألف سطر. الـ UI (حوالي 20 ألف سطر TSX) ما قريتهوش كله سطر سطر؛ عديت عليه بـ grep على أنماط بعينها (حسابات الفلوس، والـ guards، والـ intervals، والـ localStorage).

**الفحوصات اللي اشتغلت:**
- `tsc --noEmit`: نضيف ✅
- `eslint`: ‏6 errors و28 warning (أغلبها imports مش مستخدمة، و`any` في `qrcode.d.ts`، و`set-state-in-effect` في `use-pos-offline-sync.ts`)
- `vitest`: ‏141 test نجحوا و93 اتعملهم skip. الـ 24 اللي فشلوا كلهم integration tests محتاجة MySQL، وما كانش فيه DB في بيئة المراجعة. **التستات دي ما اتأكدش منها.**

---

## 🔴 Critical (لازم تتصلح قبل أي production)

### C1. الـ production bundle فيه `.env` بتاع التطوير
`resto-production-v2.zip` جواه `.next/standalone/.env`، وده نفس الـ `.env` اللي على جهازك بالظبط: `NODE_ENV=development` و`JWT_SECRET` قيمة placeholder.
- لو السيرفر ما عملش override لـ env vars، أي حد يعرف/يخمّن الـ secret يقدر يعمل **forge لـ JWT لأي userId** (super admin). ومع `NODE_ENV=development` الكوكي بيتبعت من غير `secure`.
- السبب إن `output: 'standalone'` بينسخ `.env`.
- **الحل:** امسح `.env` من الـ build قبل التغليف، وغيّر الـ JWT_SECRET في أي سيرفر استخدم الحزمة دي.

### C2. تعديل أي صنف بيمسح وصفاته (BOM) وبيكسر الطلبات اللي في السكة
`save-product.use-case.ts:38-43` و`save-modifier-group.use-case.ts:28` فيهم `sizes: { deleteMany: {}, create }`. يعني أي save، حتى لو تصحيح حرف في الاسم، بيمسح كل الـ sizes/modifiers ويعمل غيرهم بـ IDs جديدة.
- `RecipeItem.productSizeId` و`modifierId` معمولين `onDelete: Cascade` ← **وصفات المقاسات والإضافات بتتمسح بصمت**، وخصم المخزون والـ COGS بيقفوا للصنف ده.
- السلات اللي في POS/الـ storefront والـ **offline queue** فيها sizeIds قديمة ← البيع بيرفض بـ "المقاس غير متاح" (وكمان C4).
- **الحل:** upsert بالـ id، ومسح ناعم للي اتشال بس.

### C3. شاشة المطبخ بتقفل الطاولة المفتوحة وبتعلّمها مدفوعة
`bump-kitchen-order.use-case.ts:28-58`: الـ Bump على طلب DINE_IN بيعمله `COMPLETED + paymentStatus: PAID` حتى لو `isTabOpen = true` ولسه ما اتحاسبش.
- التقارير بتحسبه إيراد مدفوع قبل التحصيل.
- `AddItemsToTabUseCase` بيشيك على `isTabOpen` بس، فالدور التاني من الأكل بيتضاف لطلب COMPLETED. والـ KDS بيعرض `status: PREPARING` بس (`get-kitchen-orders.use-case.ts:56`)، يعني **الأصناف الجديدة عمرها ما بتوصل المطبخ**.
- **الحل:** الـ Bump لطلبات التاب يعلّم الأصناف prepared بس، ومن غير ما يغيّر حالة الطلب أو الدفع. والإضافة للتاب ترجّع الطلب لـ PREPARING.

### C4. الـ offline-first مش آمن ماليًا
- **قفل الوردية مش بيشيك على الـ queue** (`shift-panel.tsx`)، والكاشير يقدر يقفل وعنده مبيعات offline لسه ما اتزامنتش. بعد كده sync أي بيع فيهم بيفشل للأبد بـ "الوردية مغلقة"، يعني فلوس اتقبضت ومالهاش أي record.
- تغيير سعر أو تعديل صنف (C2) بعد البيع offline ← `assertPayments` بيرفض لأن الإجمالي اختلف، والبيع بيفضل FAILED على طول ومافيش أي مسار reconciliation.
- `use-pos-offline-sync.ts:47` بيعتبر البيع "اتزامن" **ويمسحه من الـ queue** لو رسالة الخطأ فيها كلمة `مكرر`. رسائل validation زي "الإضافات مكررة" و"طريقة الدفع مكررة" فيها الكلمة دي، فـ**البيع بيتمسح بصمت**. والـ code `DUPLICATE_ORDER` السيرفر عمره ما بيرجّعه.
- مافيش guard على تشغيل sync أكتر من مرة في نفس الوقت: الـ `online` event والـ interval اللي كل 45 ثانية والزرار ممكن يشتغلوا مع بعض.
- `getCachedCatalog`/`getCachedActiveShift` عمر ما حد استدعاهم. والـ SW بيكاش `/pos` مرة واحدة بس وقت الـ install، وبعد كده ما بيحدّثش الـ HTML خالص. يعني لو عملت reload وانت offline، يا إما مش هتلاقي POS، يا إما هتلاقي نسخة قديمة بكتالوج وجلسة قديمين. الـ offline مضمون بس لو الصفحة كانت مفتوحة أصلاً. وكمان مافيش offline للطاولات.
- رقم الفاتورة offline `OFFLINE-####` عشوائي ومش هو الرقم اللي هيتسجل، فالإيصال المطبوع مالوش أي ربط بالسيستم. وفي `use-pos-workspace.ts:228` الـ `cashierId: shift?.id` (بيتحط shift id مكان cashier id).

### C5. ثغرات IDOR/branch-scope في عمليات الطاولات
`table.actions.ts`: الـ actions `addItemsToTab` و`transferTable` و`printTableBill` و`splitBillEqual` و`closeTableTab` و`updateTable(Section)` و`deleteTable(Section)` بتشيك على الـ permission بس، **من غير أي تحقق من الفرع**، والـ use-cases كمان ما بتشيكش.
- `closeTableTab`/`openTableTab` بيقبلوا `cashShiftId` عشوائي من غير ما يتأكدوا إنه بتاع نفس الكاشير ونفس فرع الطاولة. والطلب بيتنسب لـ `shift.cashierId` (`close-table-tab.use-case.ts`). يعني كاشير يقدر يقبض على وردية كاشير تاني أو فرع تاني، وده بيبوّظ الـ variance.
- `updateTable` بيسمح بتغيير `status` لـ AVAILABLE من غير ما يمسح `activeOrderId`، فيتفتح تاب جديد والطلب القديم يفضل مفتوح وما يتحاسبش.

---

## 🟠 High

### H1. تسوية الطيار بتدخّل الكاش في وردية غلط وممكن تتكرر
`settle-driver-cash.use-case.ts:63-66` بيختار **أحدث وردية OPEN في الفرع لأي كاشير**، مش وردية الشخص اللي استلم الفلوس. الـ CASH_IN بيروح لدرج كاشير تاني، فيظهر عنده overage وعند المستلم عجز. ولو مافيش وردية مفتوحة، مافيش CASH_IN خالص.
- القراءة حاصلة برّه الـ transaction ومن غير lock، و`updateMany` (السطر 115) ما فيهوش شرط `driverSettlementId: null`. الضغط مرتين = تسويتين وCASH_IN مضاعف.

### H2. الضريبة بتتحسب قبل الخصم
`order-pricing.service.ts:59-71` و`pos-sale.service.ts:28-30`: ‏`tax = subtotal × rate`، وبعدين الخصم بيتطرح من الإجمالي اللي فيه الضريبة. ده بيطلّع ضريبة أكبر من الصح على الطلبات اللي عليها خصم، ومش متوافق مع منطق ضريبة القيمة المضافة / الفاتورة الإلكترونية في مصر (الخصم بيقلل الوعاء الضريبي).

### H3. أرقام الطلبات: race وfull-table lock
- `order-number.service.ts:13-17`: ‏`SELECT MAX(CAST(...)) ... REGEXP ... FOR UPDATE` بيعمل scan وlock للجدول كله مع كل بيع، فكل البيع بيتعمله serialize، ومع الوقت بيبقى أبطأ. وكمان مع READ COMMITTED والـ PK uuid عشوائي ممكن رقمين يطلعوا نفس الرقم، فيحصل P2002. والـ catch اللي بيرجع `count+1001` بيخبي المشكلة.
- `place-online-order.use-case.ts:305` نفس الفكرة بـ `COUNT(*) LIKE`. والتاريخ بتوقيت السيرفر (UTC غالباً)، فاليوم بيتقلب الساعة 2-3 الفجر بتوقيت القاهرة.
- **الحل:** جدول counter (`UPDATE seq SET v=LAST_INSERT_ID(v+1)`).

### H4. ‏`toActionFailure` بيسرّب رسائل الأخطاء الخام
`action-result.ts:36` بيرجّع `error.message` لأي `Error` للعميل. ده بيشمل رسائل Prisma (أسماء جداول وconstraints وقيم). ونفس الحكاية على الـ actions العامة اللي من غير login.

### H5. ‏Rate limiting بيتكسر حسب الـ config
`client-ip.ts:16`: لو `TRUSTED_PROXY_HOPS=0`، كل العملاء بيبقوا `'unknown'`. يعني 30 محاولة login كل 15 دقيقة **للسيستم كله**، وأي حد يقفل الـ login على الكل (DoS)، ونفس الكلام على الـ checkout والـ tracker. ولو `=1` والسيرفر مكشوف من غير proxy، الـ `X-Forwarded-For` في إيد العميل ويقدر يعدّي الحد. والـ limiter in-memory كمان، فبيتصفّر مع كل restart ومش بيتشارك بين instances.

### H6. ‏Server actions عامة من غير auth
- `matchOrCreateCustomerAction` (`customer.actions.ts:249`) **من غير أي session**: يكشف إذا كان رقم موبايل عميل موجود (بيرجّع customerId)، وكمان بيعدّل اسم العميل وإيميله لو الاسم الجديد "أكمل" (`shouldEnrichName`)، وبيضيف عناوين لأي رقم.
- `createEventBookingAction`: من غير rate limit، و`eventDate` من غير validation، وبيستدعي نفس منطق تعديل بيانات العميل.
- `placeOnlineOrderAction`: الـ DTO (`order.dto.ts`) من غير max للكمية ولا لعدد الأصناف ولا لطول النصوص. كمية 10^9 تعمل overflow في INT وخطأ DB بيتسرب. والـ `branchId` من العميل ما بيتشيكش عليه (ممكن فرع inactive).

### H7. ‏P&L "صافي المبيعات" فيه الضريبة والتوصيل
`prisma-finance.repository.ts:594-612`: ‏`netSales = Σ totalMinor`، ودي فيها VAT ورسوم التوصيل. فالـ Gross margin والـ COGS% غلط. والتجميع اليومي بالـ UTC (`toISOString().slice(0,10)`)، ونفس الحكاية في `get-sales-analytics` (`getHours()` بتوقيت السيرفر). وكل الطلبات والحركات بتتحمّل في الـ memory من غير حد أقصى للمدة.

### H8. الإلغاء والاسترجاع مش atomic ومش داخل الوردية
`update-order-status.use-case.ts`: الـ update والـ ReturnInvoice وخصم المخزون والـ LTV كلهم statements منفصلة من غير transaction، ومن غير شرط على الحالة الحالية. لو اتنين لغوا في نفس الوقت يطلع return invoice مكرر ويتخصم الـ LTV مرتين.
- المرتجع النقدي مش مربوط بالوردية، فالـ expected cash مش بيتأثر بيه.
- الكاشير عنده `MANAGE_ORDERS` في الـ seed، فيقدر **يلغي بيع POS مدفوع** من غير موافقة مدير.
- الطلب الأونلاين TAKEAWAY CASH بيتعلّم PAID عند COMPLETED (والـ bump كمان)، **ومن غير ما يدخل أي وردية**. ده كاش برّه الرقابة.

### H9. ‏Race في الإضافة للتاب وفي النقل
`add-items-to-tab.use-case.ts`: الإجمالي بيتحسب من قراءة برّه الـ transaction ومن غير lock. ويترين بيضيفوا في نفس الوقت ← الـ total بيتكتب فوق التاني ويطلع أقل من مجموع الأصناف. وكمان مافيش validation لـ min/max الإضافات، ولا لـ `isActive` الإضافة، ولا لتوفر الصنف في الفرع، ولا `deletedAt` (نفس الكلام في `open-table-tab`).
`transfer-table.use-case.ts`: القراءة برّه الـ tx، وطاولة المصدر بتتحرر من غير شرط.

---

## 🟡 Medium

1. **Branch scope = `assignedBranchIds[0]`** في صفحات orders وinvoices وkitchen والـ actions. المستخدم المتعين على أكتر من فرع مش بيشوف غير أول فرع. والأخطر: **لو مالوش فروع فعّالة** (مثلاً فرعه اتقفل) الـ `userBranchId` بيبقى null والـ filter بيبقى `undefined`، **فبيشوف طلبات كل الفروع** (`orders/page.tsx:55`، `invoices/page.tsx:57`، `kitchen/page.tsx:51`).
2. **`MANAGE_BRANCHES` بقت "global scope"** في actions كتير (`canManageAll`)، لكن `BranchContextService` بيدّي الـ global للـ SuperAdmin بس. ده تعارض: صاحب الـ permission يشوف الإجمالي لكل الفروع، لكن يترفض لو طلب فرع معين مش متعين عليه.
3. **Privilege escalation كامنة:** `create/update-staff` بيقبلوا أي `roleId` (ومنهم SUPER_ADMIN)، و`reset-staff-password` بيغيّر باسورد أي حد (ومنهم الـ owner)، و`toggle` بيقفل الـ super admin. دلوقتي `MANAGE_STAFF` مع الـ super admin بس، لكن أول ما تعمل role مخصص الثغرة تتفتح. وتغيير الباسورد كمان مش بيلغي الـ sessions اللي شغالة.
4. **Audit trail مش موجود فعلياً:** أعمدة `createdById/updatedById/deletedById` موجودة لكن عمر ما حد كتب فيها (الـ delete actions ما بتبعتش `deletedById`). ومافيش جدول audit log. ده عكس اللي مكتوب في commit `e0b7806`.
5. **فصل الصلاحيات في الورديات:** `auditShift` يسمح للمعتمد يبقى نفسه الكاشير، ويسمح يعيد اعتماد وردية AUDITED. و`createExpense` بـ `cashShiftId` صريح يقدر يصرف من درج كاشير تاني في نفس الفرع.
6. **ledger مش immutable:** `InventoryMovement` معمول `onDelete: Cascade` على الصنف والفرع، و`ReturnInvoice` معمول Cascade على Order، يعني مسح record واحد بيمسح التاريخ المالي.
7. **حالات من غير enums/constraints في الـ DB:** كل الـ `status` عبارة عن `String`، و`DiningTable.activeOrderId` مش FK، ومافيش unique لـ "وردية مفتوحة واحدة لكل كاشير" (الحماية هي lock على user row بس).
8. **Tracker الطلبات قابل للعدّ:** `WEB-YYYYMMDD-NNN` ورا بعض، والـ tracker بيرجّع اسم ومنطقة مخفيين جزئياً، والأصناف، و**رقم موبايل الطيار كامل**.
9. **POS sale:** `getProducts` (`prisma-pos-transaction.ts:186`) ما بيفلترش `deletedAt`. والـ `setCatalogStatus` يقدر يرجّع صنف ممسوح لـ active. والخصم من غير سقف ولا سبب، لأي حد معاه `APPLY_POS_DISCOUNT`.
10. **COGS** في POS والتاب بيستخدم `defaultCostMinor` وقت البيع. ده WAC global على مستوى الشركة، مش على مستوى الفرع. وعندك تنفيذين منفصلين لخصم المخزون (`prisma-pos-transaction.deductInventoryForSale` و`OrderInventoryDeductionService`) لازم يفضلوا متطابقين بالإيد.
11. **وصفات الإضافات global:** `saveProductRecipes` بيمسح وصفات modifiers مشتركة بين أصناف كتير وبيعيد إنشاءها.
12. **`next.config.ts`:** ‏`images.remotePatterns: hostname '**'` بيخلي الـ image optimizer يعمل fetch لأي host (bandwidth abuse/SSRF ناحية hosts داخلية بـ https). والـ CSP ما فيهاش `script-src`.
13. **`listShifts`/`getShiftDetails`** بيحمّلوا كل طلبات ودفعات 50 وردية. وفيهم طلبات ملغية، فإجمالي المبيعات المعروض أكبر من الحقيقي.
14. **Dispatch** بيتخطى الـ state machine (PENDING على OUT_FOR_DELIVERY على طول). وأرقام `STL-`/`PO-`/`RET-` عشوائية 3-4 أرقام، فاحتمال الـ collision وارد.
15. **التستات متعملها ignore في git** (`.gitignore`: ‏`tests/` و`vitest.config.ts`)، يعني الـ repo/CI مافيهمش تستات خالص. وفيه lockfile لـ npm وكمان لـ pnpm.

## 🟢 Low / Notes
- `loginAction`: المستخدم من غير فرع بياخد ForbiddenError **بعد** ما الباسورد يتأكد إنه صح، وده بيكشف إن الباسورد صح.
- `modifierGroupSchema` ما بيشيكش إن `minSelect ≤ maxSelect`. و`bookings` من غير branch scope ولا transitions.
- `finance-client.tsx` بيستخدم `parseFloat` ومش بيدعم الأرقام العربي (POS بيدعمها عن طريق `Money.fromDecimal`).
- الـ storefront `force-dynamic` من غير أي cache، فكل زيارة بتعمل query لشجرة المنيو كلها. و`userScalable:false` بيضر الـ accessibility.
- `TableStateMachine` و`SplitBillService.validateCustomSplits` معمولين بس عمر ما حد استخدمهم.
- `prisma.ts` فيه hack لـ invalidation الـ dev client، يتشال.
- `@types/*` وtypescript وprisma وvitest في `dependencies` مش `devDependencies`.

---

## الحاجات الكويسة
- مسار بيع POS المباشر (`CreatePosOrderUseCase`) مكتوب صح: idempotency key مع replay signature، و`FOR UPDATE` على الوردية، والأسعار بتتحسب من جديد على السيرفر، والـ min/max الإضافات متشيك عليها، وMoney VO بالـ minor units وBigInt في النسب.
- الـ session بيتعمله verify من الـ DB في كل request (isActive والصلاحيات live).
- bcrypt 12، وtiming equalizer، وimage signature check في الرفع.
- الـ layering نضيف (domain/application/infrastructure).

## ترتيب الإصلاح المقترح
1. C1 (secret) ← C2 (sizes upsert) ← C3 (bump/tab) ← C5 (scope على الطاولات والوردية).
2. C4: offline (gate قفل الوردية على الـ queue، وsync lock، وتلغي الـ substring matching، وتمسك أسعار البيع offline أو تعمل reconciliation flow).
3. H1 وH8 (كل حاجة فلوس تبقى transaction مع conditional updates)، وH3 (counter table)، وH2 (ترتيب الضريبة)، وH7 (net sales من غير ضريبة، والتوقيت Africa/Cairo).
4. H4 وH5 وH6 (hygiene للأخطاء، وrate limit، وauth على الـ actions العامة).