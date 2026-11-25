# Saved demo validation

The three fixed packages are public/demo/snapshot, public/demo/latest and
public/demo/newest. Their snapshot.json files reference local media.

Run npm run demo:test to check all three packages, the 12 Apply steps,
broadcast publication, session isolation, expiry, restart and late requests.
Run npx tsx script/test-ad-catalog.ts to verify all 21 campaign PNGs,
their alpha channels, six brands and programme bounds.

Saved demo startup normalizes industry and brand selections against the
current catalogue. Composite asset requests resolve to each package's
verified RVM composite, including requests with an older version in the URL.
