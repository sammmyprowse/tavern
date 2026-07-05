"use client";

// A "Print / Save as PDF" button that fires the browser's native print dialog
// (from which any browser can "Save as PDF"). Hidden in the printed output via
// the `print:hidden` utility on the wrapper. No PDF library needed.
export default function PrintButton() {
  return (
    <div className="print:hidden mb-4 flex justify-end">
      <button
        onClick={() => window.print()}
        className="rounded-md border border-tavern-gold/60 bg-tavern-bg px-4 py-2 font-heading text-xs font-bold tracking-widest text-tavern-gold-light uppercase hover:border-tavern-gold"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
