# Release validation — 2026-11-25

Completed checks for the updated advertising and offline simulation package:

- Local and Docker production builds passed.
- All three fixed demos and all 12 Apply steps passed the demo test.
- The catalogue test passed for three industries, six brands and 21 PNGs.
- The bundled Python runtime imported Torch, OpenCV and NumPy successfully.
- Screens 9, 10 and Broadcast 7 returned HTTP 200 locally.
- The offline image archive contained all nine required images.
- All 837 ZIP entries passed CRC validation; a SHA-256 sidecar was generated.

These checks do not substitute for an end-to-end new recording run on a fresh
offline destination. The full pipeline requires the documented GPU setup.
