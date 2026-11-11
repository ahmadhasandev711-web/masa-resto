'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Archive, Check, ChevronDown, CirclePlus, FolderOpen, Layers3, Pencil, Plus, QrCode, Search, Sparkles, Utensils, X } from 'lucide-react';
import { saveCategoryAction, saveModifierGroupAction, saveProductAction, setBranchAvailabilityAction, setCatalogStatusAction, toggleProductFeaturedAction } from '../../../actions/catalog.actions';
import { CatalogResource } from '../../../../domain/catalog/enums/catalog-resource.enum';
import { ProductImagePicker } from './product-image-picker';
import { MenuQrModal } from './menu-qr-modal';

type Category = { id: string; nameAr: string; nameEn: string; description: string | null; isActive: boolean };
type Size = { id: string; nameAr: string; nameEn: string; price: number };
type Group = { id: string; nameAr: string; nameEn: string; minSelect: number; maxSelect: number; modifiers: { id: string; nameAr: string; nameEn: string; priceDelta: number }[] };
type Product = {
  id: string; categoryId: string; nameAr: string; nameEn: string; description: string | null; imageUrl: string | null; isActive: boolean;
  isFeatured: boolean;
  category: { id: string; nameAr: string }; sizes: Size[];
  modifierGroups: { group: { id: string; nameAr: string } }[];
  branchAvailability: { branchId: string; isAvailable: boolean }[];
};
type Branch = { id: string; code: string; nameAr: string };
type CatalogProps = { categories: Category[]; products: Product[]; modifierGroups: Group[]; branches: Branch[]; currency: string | null };
type Tab = 'products' | 'categories' | 'modifiers';
type DraftSize = { nameAr: string; nameEn: string; price: string };
type DraftModifier = { nameAr: string; nameEn: string; price: string };

const inputClass = 'min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10';
const labelClass = 'block space-y-1.5 text-sm font-medium text-zinc-700';

function money(value: number, currency: string | null) {
  const major = new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
  return currency ? `${major} ${currency}` : major;
}

function toMajor(value: number) { return (value / 100).toFixed(2); }

export function MenuManager({ categories: initialCategories, products: initialProducts, modifierGroups: initialGroups, branches, currency }: CatalogProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [groups, setGroups] = useState(initialGroups);
  const [tab, setTab] = useState<Tab>('products');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Tab | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const visibleProducts = useMemo(() => products.filter((product) =>
    `${product.nameAr} ${product.nameEn} ${product.category.nameAr}`.toLowerCase().includes(query.toLowerCase())
  ), [products, query]);

  const openNew = (type: Tab) => { setEditingId(null); setError(''); setModal(type); };
  const openEdit = (type: Tab, id: string) => { setEditingId(id); setError(''); setModal(type); };
  const close = () => { if (!pending) setModal(null); };

  async function saveCategory(formData: FormData) {
    setPending(true); setError('');
    try {
      const result = await saveCategoryAction({
        ...(editingId ? { id: editingId } : {}),
        nameAr: String(formData.get('nameAr') ?? ''), nameEn: String(formData.get('nameEn') ?? ''),
        description: String(formData.get('description') ?? ''),
      });
      if (!result.success) { setError(result.error); return; }
      window.location.reload();
    } finally { setPending(false); }
  }

  async function saveProduct(formData: FormData) {
    setPending(true); setError('');
    const sizeIds = formData.getAll('sizeId').map(String);
    const sizeNamesAr = formData.getAll('sizeNameAr').map(String);
    const sizeNamesEn = formData.getAll('sizeNameEn').map(String);
    const sizePrices = formData.getAll('sizePrice').map(String);
    try {
      const result = await saveProductAction({
        ...(editingId ? { id: editingId } : {}),
        categoryId: String(formData.get('categoryId') ?? ''), nameAr: String(formData.get('nameAr') ?? ''),
        nameEn: String(formData.get('nameEn') ?? ''), description: String(formData.get('description') ?? ''),
        imageUrl: String(formData.get('imageUrl') ?? ''),
        isFeatured: formData.get('isFeatured') === 'on',
        sizes: sizeNamesAr.map((nameAr, index) => ({
          id: sizeIds[index] && sizeIds[index].trim() !== '' ? sizeIds[index].trim() : undefined,
          nameAr,
          nameEn: sizeNamesEn[index] ?? '',
          price: sizePrices[index] ?? '',
        })),
        modifierGroupIds: formData.getAll('modifierGroupIds').map(String),
      });
      if (!result.success) { setError(result.error); return; }
      window.location.reload();
    } finally { setPending(false); }
  }

  async function toggleFeatured(productId: string) {
    const result = await toggleProductFeaturedAction(productId);
    if (!result.success) { setError(result.error); return; }
    setProducts((current) => current.map((item) => item.id !== productId ? item : { ...item, isFeatured: result.data.isFeatured }));
  }

  async function saveGroup(formData: FormData) {
    setPending(true); setError('');
    const modifierIds = formData.getAll('modifierId').map(String);
    const namesAr = formData.getAll('modifierNameAr').map(String);
    const namesEn = formData.getAll('modifierNameEn').map(String);
    const prices = formData.getAll('modifierPrice').map(String);
    try {
      const result = await saveModifierGroupAction({
        ...(editingId ? { id: editingId } : {}), nameAr: String(formData.get('nameAr') ?? ''),
        nameEn: String(formData.get('nameEn') ?? ''), minSelect: Number(formData.get('minSelect')),
        maxSelect: Number(formData.get('maxSelect')),
        modifiers: namesAr.map((nameAr, index) => ({
          id: modifierIds[index] && modifierIds[index].trim() !== '' ? modifierIds[index].trim() : undefined,
          nameAr,
          nameEn: namesEn[index] ?? '',
          price: prices[index] ?? '',
        })),
      });
      if (!result.success) { setError(result.error); return; }
      window.location.reload();
    } finally { setPending(false); }
  }

  async function setAvailability(product: Product, isAvailable: boolean) {
    if (!branchId) return;
    const result = await setBranchAvailabilityAction({ branchId, productId: product.id, isAvailable });
    if (!result.success) { setError(result.error); return; }
    setProducts((current) => current.map((item) => item.id !== product.id ? item : {
      ...item,
      branchAvailability: [...item.branchAvailability.filter((availability) => availability.branchId !== branchId), { branchId, isAvailable }],
    }));
  }

  async function setActive(resource: CatalogResource, id: string, isActive: boolean) {
    const result = await setCatalogStatusAction({ resource, id, isActive });
    if (!result.success) { setError(result.error); return; }
    if (resource === CatalogResource.CATEGORY) setCategories((items) => items.map((item) => item.id === id ? { ...item, isActive } : item));
    if (resource === CatalogResource.PRODUCT) setProducts((items) => items.map((item) => item.id === id ? { ...item, isActive } : item));
    if (resource === CatalogResource.MODIFIER_GROUP) setGroups((items) => items.map((item) => item.id === id ? { ...item, isActive } : item));
    window.location.reload();
  }

  const tabs: { id: Tab; label: string; icon: typeof Utensils; count: number }[] = [
    { id: 'products', label: 'الأصناف', icon: Utensils, count: products.length },
    { id: 'categories', label: 'التصنيفات', icon: FolderOpen, count: categories.length },
    { id: 'modifiers', label: 'الإضافات', icon: Layers3, count: groups.length },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-20 sm:space-y-7">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold tracking-wide text-zinc-500">الكتالوج المركزي</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">المنيو والأصناف</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">إدارة المنتجات والأسعار والإضافات، ثم ضبط توفر كل صنف حسب الفرع.</p></div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-72">
            <Metric label="صنف" value={products.length} />
            <Metric label="تصنيف" value={categories.length} />
            <Metric label="إضافة" value={groups.reduce((total, group) => total + group.modifiers.length, 0)} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tabs.map(({ id, label, icon: Icon, count }) => <button key={id} onClick={() => setTab(id)} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm font-semibold transition-colors ${tab === id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`}><span className="flex items-center gap-2"><Icon size={17} />{label}</span><span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{count}</span></button>)}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /><input className={`${inputClass} pr-10`} placeholder="ابحث في المنيو" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {tab === 'products' && branches.length > 0 && <label className="relative block w-full sm:w-64"><span className="sr-only">الفرع</span><select className={`${inputClass} appearance-none pl-10`} value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.nameAr}</option>)}</select><ChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /></label>}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button type="button" onClick={() => setIsQrModalOpen(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 transition"><QrCode size={16} /><span>كيو آر المنيو</span></button>
          <button onClick={() => openNew(tab)} className="flex min-h-12 flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"><Plus size={17} />{tab === 'products' ? 'إضافة صنف' : tab === 'categories' ? 'إضافة تصنيف' : 'إنشاء مجموعة إضافات'}</button>
        </div>
      </div>

      {error && !modal && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {tab === 'products' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleProducts.map((product) => {
        const availability = product.branchAvailability.find((item) => item.branchId === branchId)?.isAvailable ?? true;
        return <article key={product.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex gap-3 p-4 sm:p-5">
            <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500">{product.imageUrl ? <Image src={product.imageUrl} alt="" width={56} height={56} unoptimized className="size-14 rounded-xl object-cover" /> : <Utensils size={20} />}</div>
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5 flex-wrap"><p className={`font-semibold ${product.isActive ? 'text-zinc-950' : 'text-zinc-400'}`}>{product.nameAr}</p>{product.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"><Sparkles size={11} className="text-amber-600" />مميز بالسلايدر</span>}</div><p className="mt-0.5 text-xs text-zinc-500">{product.category.nameAr}{!product.isActive && ' · مؤرشف'}</p></div><div className="flex shrink-0 gap-1"><button aria-label={product.isFeatured ? 'إلغاء التمييز في السلايدر' : 'تمييز في السلايدر الرئيسي'} title={product.isFeatured ? 'معروض في السلايدر الرئيسي للموقع' : 'إضافة إلى السلايدر الرئيسي'} onClick={() => toggleFeatured(product.id)} className={`grid size-10 place-items-center rounded-xl border transition-colors ${product.isFeatured ? 'border-amber-400 bg-amber-50 text-amber-600 shadow-sm' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'}`}><Sparkles size={16} /></button><button aria-label={`تعديل ${product.nameAr}`} onClick={() => openEdit('products', product.id)} className="grid size-10 place-items-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"><Pencil size={16} /></button><button aria-label={product.isActive ? 'أرشفة الصنف' : 'إعادة تفعيل الصنف'} onClick={() => setActive(CatalogResource.PRODUCT, product.id, !product.isActive)} className="grid size-10 place-items-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"><Archive size={16} /></button></div></div><p className="mt-3 text-xs leading-5 text-zinc-500">{product.description || 'بدون وصف'}</p></div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-4 py-3 sm:px-5">{product.sizes.map((size) => <span key={size.id} className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-700">{size.nameAr} · {money(size.price, currency)}</span>)}</div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 sm:px-5"><span className="text-xs text-zinc-500">التوفر في {branches.find((branch) => branch.id === branchId)?.nameAr || 'الفرع'}</span><button disabled={!product.isActive || !branchId} onClick={() => setAvailability(product, !availability)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${availability ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{availability ? 'متاح' : 'غير متاح'}</button></div>
        </article>;
      })}{visibleProducts.length === 0 && <EmptyState title="لا توجد أصناف" description="ابدأ بإضافة أول صنف إلى المنيو." />}</div>}

      {tab === 'categories' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.filter((item) => `${item.nameAr} ${item.nameEn}`.toLowerCase().includes(query.toLowerCase())).map((category) => <article key={category.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><FolderOpen size={18} /></span><div className="min-w-0 flex-1"><h2 className={`truncate font-semibold ${category.isActive ? 'text-zinc-900' : 'text-zinc-400'}`}>{category.nameAr}</h2><p className="truncate text-xs text-zinc-500">{category.nameEn}{!category.isActive && ' · مؤرشف'}</p></div><button onClick={() => openEdit('categories', category.id)} aria-label={`تعديل ${category.nameAr}`} className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-600"><Pencil size={16} /></button><button onClick={() => setActive(CatalogResource.CATEGORY, category.id, !category.isActive)} aria-label={category.isActive ? 'أرشفة التصنيف' : 'إعادة تفعيل التصنيف'} className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-600"><Archive size={16} /></button></article>)}{categories.length === 0 && <EmptyState title="ابدأ بالتصنيفات" description="أنشئ تصنيفات مثل الوجبات والمشروبات لتنظيم الأصناف." />}</div>}

      {tab === 'modifiers' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{groups.filter((item) => `${item.nameAr} ${item.nameEn}`.toLowerCase().includes(query.toLowerCase())).map((group) => <article key={group.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-950">{group.nameAr}</h2><p className="mt-1 text-xs text-zinc-500">اختيار {group.minSelect} إلى {group.maxSelect}</p></div><div className="flex gap-1"><button onClick={() => openEdit('modifiers', group.id)} aria-label={`تعديل ${group.nameAr}`} className="grid size-10 place-items-center rounded-xl border border-zinc-200 text-zinc-600"><Pencil size={16} /></button><button onClick={() => setActive(CatalogResource.MODIFIER_GROUP, group.id, false)} aria-label={`أرشفة ${group.nameAr}`} className="grid size-10 place-items-center rounded-xl border border-zinc-200 text-zinc-600"><Archive size={16} /></button></div></div><div className="mt-4 space-y-2">{group.modifiers.map((modifier) => <div key={modifier.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"><span className="text-zinc-700">{modifier.nameAr}</span><span className="text-xs font-medium text-zinc-500">{modifier.priceDelta ? `+ ${money(modifier.priceDelta, currency)}` : 'بدون زيادة'}</span></div>)}</div></article>)}{groups.length === 0 && <EmptyState title="لا توجد إضافات بعد" description="أنشئ مجموعات للإضافات، مثل اختيار الصوص أو حجم المشروب." />}</div>}

      {modal && <EditorModal title={editorTitle(modal, editingId)} onClose={close}>
        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
        {modal === 'categories' && <CategoryEditor key={editingId ?? 'new'} category={categories.find((item) => item.id === editingId)} onSave={saveCategory} pending={pending} />}
        {modal === 'products' && <ProductEditor key={editingId ?? 'new'} product={products.find((item) => item.id === editingId)} categories={categories} groups={groups} onSave={saveProduct} pending={pending} />}
        {modal === 'modifiers' && <GroupEditor key={editingId ?? 'new'} group={groups.find((item) => item.id === editingId)} onSave={saveGroup} pending={pending} />}
      </EditorModal>}

      <MenuQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        restaurantNameAr="ماسا"
        restaurantNameEn="MASA Kitchen"
        branches={branches.map((b) => ({ id: b.id, nameAr: b.nameAr, phone: '01012345678' }))}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-zinc-50 px-3 py-2.5"><p className="text-lg font-bold tabular-nums text-zinc-950">{value}</p><p className="text-[11px] text-zinc-500">{label}</p></div>; }

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 bg-white px-5 py-12 text-center"><Archive className="mx-auto text-zinc-400" size={24} /><h2 className="mt-3 font-semibold text-zinc-800">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div>; }

function EditorModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6"><header className="sticky top-0 z-10 -mx-4 -mt-4 mb-5 flex items-center justify-between border-b border-zinc-100 bg-white px-4 py-4 sm:-mx-6 sm:-mt-6 sm:px-6"><h2 className="text-lg font-bold text-zinc-950">{title}</h2><button onClick={onClose} aria-label="إغلاق" className="grid size-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><X size={18} /></button></header>{children}</section></div>; }

function CategoryEditor({ category, onSave, pending }: { category?: Category; onSave: (data: FormData) => Promise<void>; pending: boolean }) { return <form action={onSave} className="space-y-4"><Field label="الاسم بالعربية" name="nameAr" defaultValue={category?.nameAr} /><Field label="الاسم بالإنجليزية" name="nameEn" defaultValue={category?.nameEn} /><label className={labelClass}>وصف مختصر<textarea name="description" defaultValue={category?.description ?? ''} rows={3} className={`${inputClass} py-3`} /></label><SubmitButton pending={pending} /></form>; }

function ProductEditor({ product, categories, groups, onSave, pending }: { product?: Product; categories: Category[]; groups: Group[]; onSave: (data: FormData) => Promise<void>; pending: boolean }) {
  const defaultSizes = product?.sizes.map((size) => ({ nameAr: size.nameAr, nameEn: size.nameEn, price: toMajor(size.price) })) ?? [{ nameAr: 'عادي', nameEn: 'Regular', price: '' }];
  const [sizes, setSizes] = useState<DraftSize[]>(defaultSizes);
  return <form action={onSave} className="space-y-4">
    <label className={labelClass}>التصنيف<select name="categoryId" defaultValue={product?.categoryId ?? categories[0]?.id ?? ''} required className={inputClass}>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameAr}</option>)}</select></label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="اسم الصنف بالعربية" name="nameAr" defaultValue={product?.nameAr} /><Field label="اسم الصنف بالإنجليزية" name="nameEn" defaultValue={product?.nameEn} /></div>
    <ProductImagePicker initialUrl={product?.imageUrl} name="imageUrl" />
    <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 cursor-pointer">
      <input
        type="checkbox"
        name="isFeatured"
        defaultChecked={product?.isFeatured ?? false}
        className="size-4 accent-amber-600 rounded"
      />
      <div>
        <span className="text-sm font-semibold text-zinc-900 block">عرض في السلايدر الرئيسي للموقع (طبق مميز / عروض)</span>
        <span className="text-xs text-zinc-500 block">سيتم عرض هذا الصنف في السلايدر المتحرك في أعلى الصفحة الرئيسية</span>
      </div>
    </label>
    <label className={labelClass}>الوصف<textarea name="description" defaultValue={product?.description ?? ''} rows={2} className={`${inputClass} py-3`} /></label>
    <div className="space-y-3 rounded-2xl bg-zinc-50 p-3 sm:p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-zinc-800">المقاسات والأسعار</h3><button type="button" onClick={() => setSizes((items) => [...items, { nameAr: '', nameEn: '', price: '' }])} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"><CirclePlus size={15} />إضافة مقاس</button></div>{sizes.map((size, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_1fr_0.8fr_auto] sm:items-end"><Field label="الاسم العربي" name="sizeNameAr" value={size.nameAr} onChange={(value) => changeSize(index, 'nameAr', value, setSizes)} /><Field label="الاسم الإنجليزي" name="sizeNameEn" value={size.nameEn} onChange={(value) => changeSize(index, 'nameEn', value, setSizes)} /><Field label="السعر" name="sizePrice" type="number" inputMode="decimal" min="0" step="0.01" value={size.price} onChange={(value) => changeSize(index, 'price', value, setSizes)} />{sizes.length > 1 && <button type="button" aria-label="حذف المقاس" onClick={() => setSizes((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="grid size-11 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"><X size={16} /></button>}</div>)}</div>
    {groups.length > 0 && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-zinc-800">مجموعات الإضافات</legend>{groups.map((group) => <label key={group.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 px-3"><input type="checkbox" name="modifierGroupIds" value={group.id} defaultChecked={product?.modifierGroups.some((item) => item.group.id === group.id)} className="size-4 accent-zinc-900" /><span className="text-sm text-zinc-700">{group.nameAr}</span></label>)}</fieldset>}
    <SubmitButton pending={pending} />
  </form>;
}

function changeSize(index: number, key: keyof DraftSize, value: string, setter: (update: (items: DraftSize[]) => DraftSize[]) => void) { setter((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)); }

function GroupEditor({ group, onSave, pending }: { group?: Group; onSave: (data: FormData) => Promise<void>; pending: boolean }) {
  const defaultModifiers = group?.modifiers.map((item) => ({ nameAr: item.nameAr, nameEn: item.nameEn, price: toMajor(item.priceDelta) })) ?? [{ nameAr: '', nameEn: '', price: '0' }];
  const [modifiers, setModifiers] = useState<DraftModifier[]>(defaultModifiers);
  return <form action={onSave} className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="اسم المجموعة بالعربية" name="nameAr" defaultValue={group?.nameAr} /><Field label="اسم المجموعة بالإنجليزية" name="nameEn" defaultValue={group?.nameEn} /></div><div className="grid grid-cols-2 gap-3"><Field label="أقل عدد اختيارات" name="minSelect" type="number" min="0" defaultValue={group?.minSelect ?? 0} /><Field label="أقصى عدد اختيارات" name="maxSelect" type="number" min="1" defaultValue={group?.maxSelect ?? 1} /></div><div className="space-y-3 rounded-2xl bg-zinc-50 p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-zinc-800">الخيارات</h3><button type="button" onClick={() => setModifiers((items) => [...items, { nameAr: '', nameEn: '', price: '0' }])} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"><CirclePlus size={15} />إضافة خيار</button></div>{modifiers.map((modifier, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_1fr_0.8fr_auto] sm:items-end"><Field label="اسم الخيار بالعربية" name="modifierNameAr" value={modifier.nameAr} onChange={(value) => setModifiers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, nameAr: value } : item))} /><Field label="بالإنجليزية" name="modifierNameEn" value={modifier.nameEn} onChange={(value) => setModifiers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, nameEn: value } : item))} /><Field label="زيادة السعر" name="modifierPrice" type="number" min="0" step="0.01" value={modifier.price} onChange={(value) => setModifiers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, price: value } : item))} />{modifiers.length > 1 && <button type="button" aria-label="حذف الخيار" onClick={() => setModifiers((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="grid size-11 place-items-center rounded-lg text-zinc-500"><X size={16} /></button>}</div>)}</div><SubmitButton pending={pending} /></form>;
}

function Field({ label, name, defaultValue, value, onChange, type = 'text', required = true, ...props }: { label: string; name: string; defaultValue?: string | number; value?: string; onChange?: (value: string) => void; type?: string; required?: boolean; min?: string | number; max?: string | number; step?: string; inputMode?: 'decimal' | 'numeric' }) { return <label className={labelClass}>{label}<input className={inputClass} name={name} type={type} defaultValue={defaultValue} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} required={required} {...props} /></label>; }

function SubmitButton({ pending }: { pending: boolean }) { return <button disabled={pending} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'جارٍ الحفظ...' : <><Check size={17} />حفظ التغييرات</>}</button>; }

function editorTitle(tab: Tab, id: string | null) { const action = id ? 'تعديل' : 'إضافة'; if (tab === 'products') return `${action} صنف`; if (tab === 'categories') return `${action} تصنيف`; return `${action} مجموعة إضافات`; }
