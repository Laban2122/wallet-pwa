# wApp PWA Development Guide

**For AI Agents & Future Development**

This document describes critical patterns and conventions used in the wApp Progressive Web App codebase.

---

## Unit System

### Internal Representation
**CRITICAL**: All Bitcoin amounts are stored and processed internally as **integers in satoshis**.

- 1 BTC = 100,000,000 satoshis
- Never use floating point for internal storage or calculations
- API responses contain satoshis (integers)
- Database stores satoshis (integers)

### Display Units

The app supports **three display units** for user-facing amounts:

| Unit | Divisor | Decimals | Label | Example |
|------|---------|----------|-------|---------|
| BTC | 100,000,000 | 8 | BTC | 0.00100000 BTC |
| μBTC (micro-bitcoin) | 100 | 2 | μBTC | 100.00 μBTC |
| satoshi | 1 | 0 | sat | 10000 sat |

**Note**: μ is the Greek letter mu (U+03BC), widely recognized.

### Conversion Rules

#### Satoshis → Display
```javascript
// BTC: divide by 1e8, show 8 decimals
sats / 100000000 → "0.00100000 BTC"

// μBTC: divide by 100, show 2 decimals  
sats / 100 → "1000.00 μBTC"

// sat: no conversion, show 0 decimals
sats → "100000 sat"
```

#### Display → Satoshis
```javascript
// BTC: multiply by 1e8, floor result
Math.floor(amount * 100000000)

// μBTC: multiply by 100, floor result
Math.floor(amount * 100)

// sat: already integer, validate only
Math.floor(amount)
```

**Rounding**: Always use `Math.floor()` when converting user input to satoshis. This prevents accidental overspending and eliminates fractional satoshi errors.

### User Settings

- **Default Unit**: μBTC (most practical for everyday amounts)
- **Persistence**: Stored in IndexedDB via `storage.js`
- **Global**: Setting applies to all displays (balance, send amounts, transaction history)

### Code Locations

- **Conversion utilities**: `wallet.js` (satToDisplay, displayToSat, formatAmount)
- **Global state**: `app.js` (currentUnit property)
- **Settings storage**: `storage.js` (saveSettings, getSettings)
- **UI**: Settings modal for user selection

---

## Architecture Patterns

### File Structure

```
static/
├── index.html          - Main dashboard view
├── send.html          - Send transaction page
├── offline.html       - Offline fallback
├── manifest.json      - PWA manifest
├── sw.js             - Service worker (no caching)
├── css/
│   └── main.css      - All styles (mobile-first, dark theme)
├── js/
│   ├── app.js        - UI controller & orchestration
│   ├── wallet.js     - Business logic & state
│   ├── api.js        - HTTP client for backend
│   ├── storage.js    - IndexedDB wrapper
│   └── send.js       - Send page controller
└── AGENTS_PWA_GUIDE.md - This file
```

### JavaScript Layers

**Three-layer architecture** (not purely functional):

1. **API Layer** (`api.js`)
   - HTTP communication with Flask backend
   - JWT token management
   - Returns raw server responses
   - No business logic

2. **Business Logic** (`wallet.js`)
   - Wallet state management (WalletModule class)
   - Balance caching and sync
   - Amount formatting and conversion
   - Called by UI layer for operations

3. **UI Controller** (`app.js`, `send.js`)
   - DOM manipulation
   - View switching
   - User interaction handling
   - Orchestrates wallet.js and api.js
   - No direct API calls (goes through wallet)

### Storage Pattern

**IndexedDB** via `storage.js`:
- Database name: `wapp-db`
- Stores: JWT tokens, wallet data, user settings
- Async methods return Promises
- Methods: `saveTokens()`, `getTokens()`, `saveWalletData()`, `getWalletData()`, `saveSettings()`, `getSettings()`

### Class-Based, Not Functional

The codebase uses **ES6 classes** with instance methods:
- `WalletModule` class in wallet.js
- `WalletApp` class in app.js
- Not purely functional programming style

---

## Critical Constraints

### Backend Modifications
**DO NOT** modify server code (`mobile_server.py`, `wallet_server.py`, `auth.py`, etc.). These are tested and stable. Only edit files in `/static/` folder.

### Integer Safety
- Never store fractional satoshis
- Use `Math.floor()` for all conversions to satoshis
- Validate that internal amounts are integers

### Progressive Web App
- Must work offline (service worker registered)
- Mobile-first responsive design
- Black & white theme (TikTok-inspired)
- Touch-optimized UI

---

## Future Extensions

### Adding New Amount Displays

When adding features that show Bitcoin amounts:

1. **Get amount in satoshis** from API/storage
2. **Convert using utility**: `wallet.formatAmount(sats, app.currentUnit)`
3. **Display with label**: Format includes unit label automatically
4. **Input handling**: Use `wallet.displayToSat(input, app.currentUnit)` for user entry

### Adding New Settings

Pattern for new user preferences:

1. Add to settings object structure in `storage.js`
2. Add UI control in Settings modal (`index.html`)
3. Load setting in `app.init()`
4. Provide getter/setter in `app.js`
5. Apply setting where needed

### Common Pitfalls

❌ **Don't**: `balance / 100000000` scattered throughout code  
✅ **Do**: `wallet.formatAmount(balance, unit)` centralized

❌ **Don't**: Store BTC amounts as floats in variables  
✅ **Do**: Keep satoshis (integers) until display conversion

❌ **Don't**: Assume user unit - it's configurable  
✅ **Do**: Use `app.currentUnit` global setting

---

## Testing Checklist

When modifying amount displays:

- [ ] Balance shows correctly in all 3 units
- [ ] Switching units updates all visible amounts
- [ ] Send form accepts input in current unit
- [ ] Conversion to satoshis uses Math.floor()
- [ ] No fractional satoshi values stored
- [ ] Settings persist across page reloads
- [ ] Default is μBTC for new users

---

Last Updated: 2026-04-02
