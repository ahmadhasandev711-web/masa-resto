import { DEMO_BANNER_TEXT } from '../infrastructure/demo/demo-policy';

export function DemoBanner() {
  return (
    <div
      role="status"
      className="shrink-0 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950"
    >
      {DEMO_BANNER_TEXT}
    </div>
  );
}