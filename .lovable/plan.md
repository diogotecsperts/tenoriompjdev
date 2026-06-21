## Goal
Reduce horizontal space of the export steps selector button by removing the "Etapas no export" label, leaving only the icon + step count (e.g., `8/10`) on all screen sizes.

## Change
1. **File:** `src/modules/previdenciario/components/ExportStepsSelector.tsx`
   - Remove the desktop-only `<span>` containing `Etapas no export (`.
   - Change the remaining count display from mobile-only (`sm:hidden`) to always-visible, so the button consistently shows: `<ListFilter icon> 8/10`.

## Out of scope
- No changes to Popover content, logic, persistence, or export behavior.
- No changes to `PrelaudoEditor.tsx` or export functions.