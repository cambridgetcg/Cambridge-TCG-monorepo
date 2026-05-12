# Storefront cart contexts — audit

> **Audit date:** 2026-05-09. **Status:** decision recorded; refactor not scheduled.

The storefront has three React contexts that look like carts:

| Context | File | Purpose | Persisted | Drawer |
|---|---|---|---|---|
| `CartContext` | `src/context/CartContext.tsx` | B2C buy cart — items the customer is buying from Cambridge TCG. | localStorage `cambridgetcg_cart` (via `lib/cart.ts`) | yes |
| `SellCartContext` | `src/context/SellCartContext.tsx` | Trade-in cart — cards the customer is *selling* to Cambridge TCG; carries both cash and credit valuations per item. | localStorage (via `lib/tradein/cart.ts`) | yes |
| `CreditSellContext` | `src/context/CreditSellContext.tsx` | Smaller "credit-only" sell cart — used by the bounty sell-back flow where only the credit price applies. | **NOT persisted** (in-memory only) | yes (`isOpen`) |

All three are wrapped at the root layout via `Providers.tsx`, so any client
component can `useCart() / useSellCart() / useCreditSell()`.

## What they share (the duplication)

- The same shape of state: `items`, `totalItems`, `totalCredit`/`totalPrice`, `drawerOpen`/`isOpen`.
- The same shape of operations: `addItem`, `removeItem`, `updateQty`, `clearCart`, `openDrawer`, `closeDrawer`.
- The same `useState` + `useEffect` localStorage hydrate-once / save-on-change pattern (CartContext + SellCartContext only — CreditSellContext doesn't persist).
- Three near-identical 70–90-line files.

## What they don't share (the real divergence)

1. **Item shapes are different and load-bearing**:
   - `CartItem` carries `{ sku, name, price, image_url, quantity, set_code, card_number }`.
   - `SellCartItem` carries the buy-side keys plus `cashPrice` and `creditPrice` (different valuations per row).
   - `CreditSellItem` carries `creditPrice` but not `cashPrice`.

2. **Storage keys + helpers are domain-specific**:
   - `lib/cart.ts` and `lib/tradein/cart.ts` each export their own `loadX` / `saveX` / `addX` / `removeX` / `updateXQty` / `totalsX` functions. The function names are different; the bodies look similar but operate on different item shapes.
   - `CreditSellContext` doesn't import a helper at all — it inlines the logic.

3. **Totals are different**:
   - Buy cart: `totalPrice` (single number).
   - Sell cart: `cashTotal` *and* `creditTotal` (two numbers — buyer chooses payout type at checkout).
   - Credit-only cart: `totalCredit` (single number).

4. **Open-drawer state name divergence**: `CartContext` and `SellCartContext` use `drawerOpen`; `CreditSellContext` uses `isOpen`. Cosmetic but real (consumers couldn't be polymorphic over the three).

## Decision: leave as three contexts, extract a shared persistence hook

The three carts hold genuinely different domains of state. Trying to express them
through one parametric `<CartProvider<TItem>>` would either:

- Force a generic over `TItem` everywhere a consumer mounts the cart (clunky in JSX),
  *or*
- Erase the divergent total-shapes (`{ totalPrice }` vs `{ cashTotal, creditTotal }`)
  behind a permissive `Record<string, number>`, losing the per-context type safety
  that today catches `cart.totalPrice` typos at compile time.

Either tradeoff is worse than today's three-file duplication.

**However**, the *persistence* part — `useState + useEffect(load on mount, save on
change)` — is mechanical and identical in two of the three contexts. Extracting
that one hook saves real code without erasing the per-domain types:

```ts
// proposed: src/lib/storage/use-persisted-state.ts
export function usePersistedState<T>(
  initial: T,
  load: () => T,
  save: (value: T) => void,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setValue(load()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) save(value); }, [value, hydrated]);
  return [value, setValue, hydrated];
}
```

Each context becomes ~5 lines shorter; the divergent surfaces stay typed.
`CreditSellContext` (in-memory only) doesn't need it.

## What's NOT recommended

- **Don't unify the three contexts into one.** The divergence is real (different
  item shapes, different totals, different storage keys). One-context-fits-all
  loses type safety with no commensurate ergonomic gain.
- **Don't pull `lib/cart.ts` and `lib/tradein/cart.ts` into a shared module.** The
  helpers operate on different item shapes; merging them would need a generic
  that complicates every call site.
- **Don't migrate `CreditSellContext` to localStorage** without product justification.
  In-memory was likely deliberate (the bounty sell-back flow is meant to be
  ephemeral within a session — a persisted cart could surprise users returning
  days later).

## Mission gating

If the ergonomic value of `usePersistedState` becomes clear in another context
(e.g. a fourth long-lived client store lands), file it as a new mission then.
Until then, three small files is fine.

— Audited during the storefront UI consolidation, 2026-05-09.
