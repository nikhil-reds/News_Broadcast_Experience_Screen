# Advertising screen mapping

Screen 9 selects one of three industries. Screen 10 lists that industry's
two brands. Apply publishes the selection through the shared realtime state.

Screen 11 and broadcast outputs 01 through 07 use Screen11HighlightPlayer
and rotate the selected brand's creatives. Screen 12 selects L-band artwork
and inserts full-programme intervals.

Both players read the shared catalogue and programme bounds. When changing
the catalogue in a running installation, rebuild the app and reload the
realtime gateway so both use the same allowed selection IDs.
