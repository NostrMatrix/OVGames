# Key Hunt

A web page that, on every cycle, draws a batch of Bitcoin private keys, derives
their addresses and checks the balances. If a funded address is found, the automatic
refresh stops, the page shows an alert and saves the key.

Black/orange/white color palette.

## Starting

Double-click **`start.cmd`** — it starts a local server and opens the
page at <http://localhost:8777/>.

You can also open `index.html` directly, but then the browser may
block the balance requests (`file://` origin). DEMO mode works either way.

## Usage

| Control | Meaning |
| --- | --- |
| **LIVE / DEMO** | LIVE fetches real balances. DEMO makes up balances and does not connect to the network. |
| **Refresh interval** | Seconds between cycles. Default 5. |
| **Keys / cycle** | How many keys are drawn at once. Default 30 (= 60 addresses). |
| **Demo: hit odds** | How often DEMO mode invents a hit. Only visible in DEMO mode. |
| **Hard page reload** | Does a real `location.reload()` between every cycle. Counters and finds are kept. Without this the page updates in place without flickering. |
| **Also stop on a used address** | Also stops if the address has transaction history but a balance of 0. |
| **Beep on hit** | Beeps together with the alert. |

Hits are saved to the browser's `localStorage` and shown in the
**Saved finds** section at the bottom of the page. They persist across page loads but disappear
if you clear your browser data — download an important find as a JSON file to keep it.

Click any address, WIF or private key to copy it to the
clipboard.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Structure and styles |
| `app.js` | Scan cycle, balance lookup, alert, saved finds |
| `btc.js` | Cryptography: SHA-256, RIPEMD-160, secp256k1, Base58Check, Bech32, WIF |
| `test.html` | Test vectors for btc.js — open in a browser, reports OK / FAIL |
| `start.cmd` | Starts the server and opens the page |

There are no external libraries. Keys are computed entirely in the browser; only the finished
addresses are sent over the network.

## How the keys are computed

1. 32 random bytes from `crypto.getRandomValues`, rejected if not
   in the range `[1, n-1]`.
2. Public key `k × G` on the secp256k1 curve (Jacobian coordinates, BigInt),
   in compressed form.
3. `HASH160 = RIPEMD160(SHA256(pubkey))`.
4. Legacy address (P2PKH): Base58Check, version byte `0x00` → `1...`
5. Bech32 address (P2WPKH): BIP173, witness v0 → `bc1q...`
6. WIF: Base58Check, `0x80` + key + `0x01` (compressed).

`test.html` verifies these against known test vectors: the k=1 address, WIF and
the BIP173 bech32 vector, the example key from the Mastering Bitcoin book, the official
RIPEMD-160 vectors, and SHA-256 cross-checked against the browser's WebCrypto. The
*"✓ key derivation verified"* badge in the page header runs the same check
in a reduced form on every load.

## Balance sources

1. **blockchain.info** `/balance` — batched, all addresses of a cycle in a single
   request.
2. **mempool.space** `/api/address/{addr}` — fallback, one request per address.

Both have rate limits. If a lookup fails, the page shows an error message and
doubles the wait time after each failed attempt
(up to 5 min). If you keep getting 429 errors, increase the refresh interval or
reduce the batch size.

## Reality check

The address space is 2¹⁶⁰ ≈ 1.46 × 10⁴⁸ and there are about
5 × 10⁷ funded addresses. The probability of a hit is therefore on the order of **1 : 10⁴⁰ per address**.
At 30 addresses every five seconds, the age of the universe is nowhere near enough — the page
says so itself in the "time to cover the whole space at this
rate" counter.

This is an illustration of the size of the key space, not a working search method. If
a funded address were somehow found, it would belong to someone else, and
moving the funds would be theft.
